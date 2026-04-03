const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const APP_DIR_NAME = "BENJOJI Payment Handling";
const DB_FILE_NAME = "benjoji.sqlite";
const PROJECT_DATA_DIR = path.resolve(__dirname, "..", "data");

const DATA_DIR = resolveDataDir();
const DB_PATH = path.join(DATA_DIR, DB_FILE_NAME);
const BACKUP_DIR = path.join(DATA_DIR, "backups");

ensurePrimaryDatabase(DB_PATH);
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = DELETE;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  pin_hash TEXT,
  pin_salt TEXT,
  role TEXT NOT NULL CHECK(role IN ('OWNER','STAFF')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  product_code TEXT,
  unit_price REAL NOT NULL,
  stock_quantity INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_records (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  product_name TEXT NOT NULL,
  quantity_changed INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  authorized_by TEXT NOT NULL,
  reference_transaction_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL,
  receipt_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone_number TEXT,
  total_amount REAL NOT NULL,
  tax_amount REAL NOT NULL DEFAULT 0,
  total_paid REAL NOT NULL,
  balance REAL NOT NULL,
  change_returned REAL NOT NULL,
  status TEXT NOT NULL,
  payment_summary TEXT NOT NULL,
  processed_by TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS credits (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  phone_number TEXT,
  transaction_id TEXT NOT NULL,
  amount_owed REAL NOT NULL,
  original_amount REAL NOT NULL,
  status TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS debt_payments (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  total_paid REAL NOT NULL,
  applied_amount REAL NOT NULL,
  remaining_debt REAL NOT NULL,
  change_returned REAL NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  sale_id TEXT,
  debt_payment_id TEXT,
  source_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  amount REAL NOT NULL,
  confirmation_status TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  date TEXT NOT NULL,
  time TEXT NOT NULL
);
`);

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
  if (!columns.includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

ensureColumn("payments", "meta_json", "TEXT NOT NULL DEFAULT '{}'");
ensureColumn("products", "product_code", "TEXT");
ensureColumn("users", "pin_hash", "TEXT");
ensureColumn("users", "pin_salt", "TEXT");
ensureColumn("sales", "tax_amount", "REAL NOT NULL DEFAULT 0");

function resolveDataDir() {
  const explicitDir = process.env.BENJOJI_DATA_DIR ? path.resolve(process.env.BENJOJI_DATA_DIR) : null;
  if (explicitDir) {
    ensureWritableDir(explicitDir);
    return explicitDir;
  }

  const persistentCandidates = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, APP_DIR_NAME) : null,
    process.env.APPDATA ? path.join(process.env.APPDATA, APP_DIR_NAME) : null,
    PROJECT_DATA_DIR,
  ].filter(Boolean);

  for (const candidate of persistentCandidates) {
    if (isWritableDir(candidate)) {
      return candidate;
    }
  }

  if (process.env.BENJOJI_ALLOW_TEMP_DB === "true") {
    const tempCandidate = path.join(os.tmpdir(), APP_DIR_NAME);
    ensureWritableDir(tempCandidate);
    return tempCandidate;
  }

  throw new Error("Unable to find a writable persistent directory for the local BENJOJI database.");
}

function isWritableDir(candidate) {
  try {
    ensureWritableDir(candidate);
    return true;
  } catch {
    return false;
  }
}

function ensureWritableDir(candidate) {
  fs.mkdirSync(candidate, { recursive: true });
  const probe = path.join(candidate, ".write-test");
  fs.writeFileSync(probe, "ok");
  try {
    fs.unlinkSync(probe);
  } catch {
    // External sync tools can briefly hold probe files.
  }
}

function ensurePrimaryDatabase(primaryDbPath) {
  if (isUsableDatabase(primaryDbPath)) {
    return;
  }

  const primaryDir = path.dirname(primaryDbPath);
  fs.mkdirSync(primaryDir, { recursive: true });

  const legacyDbPath = findLegacyDatabase(primaryDbPath);
  if (!legacyDbPath) {
    archiveInvalidDatabase(primaryDbPath);
    return;
  }

  archiveInvalidDatabase(primaryDbPath);
  fs.copyFileSync(legacyDbPath, primaryDbPath);
}

function findLegacyDatabase(primaryDbPath) {
  const legacyCandidates = [
    PROJECT_DATA_DIR ? path.join(PROJECT_DATA_DIR, DB_FILE_NAME) : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, APP_DIR_NAME, DB_FILE_NAME) : null,
    process.env.APPDATA ? path.join(process.env.APPDATA, APP_DIR_NAME, DB_FILE_NAME) : null,
    path.join(os.tmpdir(), APP_DIR_NAME, DB_FILE_NAME),
  ].filter(Boolean);

  const normalizedPrimary = path.resolve(primaryDbPath);

  for (const candidate of legacyCandidates) {
    if (path.resolve(candidate) === normalizedPrimary) {
      continue;
    }
    if (isUsableDatabase(candidate)) {
      return candidate;
    }
  }

  return null;
}

function archiveInvalidDatabase(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return;
  }

  try {
    const stats = fs.statSync(dbPath);
    if (!stats.size) {
      fs.rmSync(dbPath, { force: true });
      return;
    }

    const archivePath = `${dbPath}.invalid-${Date.now()}.bak`;
    fs.renameSync(dbPath, archivePath);
  } catch {
    try {
      fs.rmSync(dbPath, { force: true });
    } catch {
      // Leave the original file in place if cleanup is blocked.
    }
  }
}

function isUsableDatabase(dbPath) {
  if (!fs.existsSync(dbPath)) {
    return false;
  }

  try {
    const stats = fs.statSync(dbPath);
    if (!stats.size) {
      return false;
    }

    const probe = new DatabaseSync(dbPath);
    const tableNames = probe.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
    `).all().map((row) => row.name);
    probe.close();

    return ["settings", "users", "products", "sales"].every((name) => tableNames.includes(name));
  } catch {
    return false;
  }
}

function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

function getJsonSetting(key, fallbackValue) {
  const raw = getSetting(key);
  if (!raw) {
    return fallbackValue;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function setJsonSetting(key, value) {
  setSetting(key, JSON.stringify(value));
}

function scalar(query, ...params) {
  const row = db.prepare(query).get(...params);
  return Number(row?.value || 0);
}

function getBusinessName() {
  return getSetting("business_name") || "BENJOJI Business";
}

function ensureDefaults() {
  if (!getSetting("business_name")) {
    setSetting("business_name", "BENJOJI Business");
  }
}

ensureDefaults();

module.exports = {
  BACKUP_DIR,
  DATA_DIR,
  DB_PATH,
  db,
  getBusinessName,
  getJsonSetting,
  getSetting,
  scalar,
  setJsonSetting,
  setSetting,
};
