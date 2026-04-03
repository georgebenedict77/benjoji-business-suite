const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const APP_DIR_NAME = "BENJOJI Payment Handling";
const DB_FILE_NAME = "benjoji.sqlite";
const LEGACY_DB_PATH_NAME = DB_FILE_NAME;
const ROOT_DATA_DIR = resolveDataDirRoot();
const WORKSPACES_DIR = path.join(ROOT_DATA_DIR, "workspaces");
const WORKSPACE_META_FILE = "workspace.json";
const dbCache = new Map();

fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
migrateLegacyDatabaseIfNeeded();

function resolveDataDirRoot() {
  const explicitDir = process.env.BENJOJI_DATA_DIR ? path.resolve(process.env.BENJOJI_DATA_DIR) : null;
  if (explicitDir) {
    ensureWritableDir(explicitDir);
    return explicitDir;
  }

  const persistentCandidates = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, APP_DIR_NAME) : null,
    process.env.APPDATA ? path.join(process.env.APPDATA, APP_DIR_NAME) : null,
    path.resolve(__dirname, "..", "data"),
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
    // Ignore probe cleanup failures caused by sync tools.
  }
}

function workspaceDirectory(workspaceKey) {
  const safeKey = normalizeWorkspaceKey(workspaceKey);
  return path.join(WORKSPACES_DIR, safeKey);
}

function workspaceDbPath(workspaceKey) {
  return path.join(workspaceDirectory(workspaceKey), DB_FILE_NAME);
}

function workspaceBackupDir(workspaceKey) {
  const backupDir = path.join(workspaceDirectory(workspaceKey), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

function getWorkspaceBackupDir(workspaceKey) {
  return workspaceBackupDir(workspaceKey);
}

function workspaceMetaPath(workspaceKey) {
  return path.join(workspaceDirectory(workspaceKey), WORKSPACE_META_FILE);
}

function normalizeWorkspaceKey(value, fallback = "workspace") {
  const raw = (value || "").toString().trim().toLowerCase();
  const normalized = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return normalized || fallback;
}

function uniqueWorkspaceKey(preferredKey, businessName = "business-workspace") {
  const baseKey = normalizeWorkspaceKey(preferredKey || businessName, "workspace");
  let nextKey = baseKey;
  let counter = 2;
  while (workspaceExists(nextKey)) {
    nextKey = `${baseKey}-${counter}`;
    counter += 1;
  }
  return nextKey;
}

function workspaceExists(workspaceKey) {
  return fs.existsSync(workspaceMetaPath(workspaceKey)) || fs.existsSync(workspaceDbPath(workspaceKey));
}

function createWorkspace({ businessName, workspaceKey }) {
  const resolvedKey = uniqueWorkspaceKey(workspaceKey, businessName);
  const directory = workspaceDirectory(resolvedKey);
  fs.mkdirSync(directory, { recursive: true });
  writeWorkspaceMeta(resolvedKey, {
    workspaceKey: resolvedKey,
    businessName: (businessName || "Business Workspace").toString().trim() || "Business Workspace",
    createdAt: new Date().toISOString(),
  });
  getWorkspaceDb(resolvedKey);
  return getWorkspaceSummary(resolvedKey);
}

function readWorkspaceMeta(workspaceKey) {
  const metaFile = workspaceMetaPath(workspaceKey);
  if (!fs.existsSync(metaFile)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(metaFile, "utf8"));
  } catch {
    return null;
  }
}

function writeWorkspaceMeta(workspaceKey, payload) {
  fs.mkdirSync(workspaceDirectory(workspaceKey), { recursive: true });
  const current = readWorkspaceMeta(workspaceKey) || {};
  const next = {
    ...current,
    ...payload,
    workspaceKey: normalizeWorkspaceKey(payload.workspaceKey || workspaceKey),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(workspaceMetaPath(workspaceKey), JSON.stringify(next, null, 2));
  return next;
}

function listWorkspaceSummaries() {
  if (!fs.existsSync(WORKSPACES_DIR)) {
    return [];
  }

  return fs.readdirSync(WORKSPACES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => getWorkspaceSummary(entry.name))
    .filter(Boolean)
    .sort((left, right) => left.businessName.localeCompare(right.businessName));
}

function getWorkspaceSummary(workspaceKey) {
  const safeKey = normalizeWorkspaceKey(workspaceKey);
  const meta = readWorkspaceMeta(safeKey) || { workspaceKey: safeKey, businessName: "Business Workspace" };
  const dbPath = workspaceDbPath(safeKey);
  const hasDatabase = fs.existsSync(dbPath);
  let businessName = meta.businessName || "Business Workspace";
  let branchName = "Main Branch";
  let userCount = 0;

  if (hasDatabase) {
    try {
      const db = getWorkspaceDb(safeKey);
      businessName = getSetting(safeKey, "business_name") || businessName;
      const businessProfile = getJsonSetting(safeKey, "business_profile", {});
      branchName = businessProfile.branchName || "Main Branch";
      userCount = scalarValue(db, "SELECT COUNT(*) AS value FROM users");
    } catch {
      // Ignore unreadable workspace state in the public summary.
    }
  }

  return {
    workspaceKey: safeKey,
    businessName,
    branchName,
    createdAt: meta.createdAt || "",
    updatedAt: meta.updatedAt || "",
    hasUsers: userCount > 0,
  };
}

function getWorkspaceDb(workspaceKey) {
  const safeKey = normalizeWorkspaceKey(workspaceKey);
  if (dbCache.has(safeKey)) {
    return dbCache.get(safeKey);
  }

  const dbPath = workspaceDbPath(safeKey);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  initializeWorkspaceDb(db);
  dbCache.set(safeKey, db);

  const summary = getWorkspaceSummary(safeKey);
  if (!summary.createdAt) {
    writeWorkspaceMeta(safeKey, {
      workspaceKey: safeKey,
      businessName: getSetting(safeKey, "business_name") || summary.businessName || "Business Workspace",
      createdAt: new Date().toISOString(),
    });
  }
  return db;
}

function initializeWorkspaceDb(db) {
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
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS login_challenges (
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

  ensureColumn(db, "payments", "meta_json", "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, "products", "product_code", "TEXT");
  ensureColumn(db, "users", "pin_hash", "TEXT");
  ensureColumn(db, "users", "pin_salt", "TEXT");
  ensureColumn(db, "users", "status", "TEXT NOT NULL DEFAULT 'ACTIVE'");
  ensureColumn(db, "users", "failed_attempts", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "users", "locked_until", "TEXT");
  ensureColumn(db, "users", "last_login_at", "TEXT");
  ensureColumn(db, "sales", "tax_amount", "REAL NOT NULL DEFAULT 0");
  ensureWorkspaceDefaults(db);
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
  if (!columns.includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function ensureWorkspaceDefaults(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'business_name'").get();
  if (!row?.value) {
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('business_name', 'Business Workspace')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run();
  }
}

function getSetting(workspaceKey, key) {
  const db = getWorkspaceDb(workspaceKey);
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : null;
}

function getJsonSetting(workspaceKey, key, fallbackValue) {
  const raw = getSetting(workspaceKey, key);
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

function setSetting(workspaceKey, key, value) {
  const db = getWorkspaceDb(workspaceKey);
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);

  if (key === "business_name") {
    writeWorkspaceMeta(workspaceKey, { businessName: value });
  }
}

function setJsonSetting(workspaceKey, key, value) {
  setSetting(workspaceKey, key, JSON.stringify(value));
}

function getBusinessName(workspaceKey) {
  return getSetting(workspaceKey, "business_name") || getWorkspaceSummary(workspaceKey)?.businessName || "Business Workspace";
}

function scalarValue(db, query, ...params) {
  const row = db.prepare(query).get(...params);
  return Number(row?.value || 0);
}

function migrateLegacyDatabaseIfNeeded() {
  const legacyDbPath = path.join(ROOT_DATA_DIR, LEGACY_DB_PATH_NAME);
  const hasWorkspaceDirs = fs.existsSync(WORKSPACES_DIR)
    && fs.readdirSync(WORKSPACES_DIR, { withFileTypes: true }).some((entry) => entry.isDirectory());

  if (hasWorkspaceDirs || !isUsableDatabase(legacyDbPath)) {
    return;
  }

  const legacyDb = new DatabaseSync(legacyDbPath);
  let businessName = "Primary Workspace";
  try {
    const row = legacyDb.prepare("SELECT value FROM settings WHERE key = 'business_name'").get();
    businessName = row?.value || businessName;
  } catch {
    // Keep fallback business name during migration.
  } finally {
    legacyDb.close();
  }

  const migratedKey = uniqueWorkspaceKey(businessName, businessName);
  const migratedDbPath = workspaceDbPath(migratedKey);
  fs.mkdirSync(path.dirname(migratedDbPath), { recursive: true });
  fs.copyFileSync(legacyDbPath, migratedDbPath);
  writeWorkspaceMeta(migratedKey, {
    workspaceKey: migratedKey,
    businessName,
    createdAt: new Date().toISOString(),
    migratedFromLegacy: true,
  });
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

module.exports = {
  DB_FILE_NAME,
  ROOT_DATA_DIR,
  WORKSPACES_DIR,
  createWorkspace,
  getBusinessName,
  getJsonSetting,
  getSetting,
  getWorkspaceBackupDir,
  getWorkspaceDb,
  getWorkspaceSummary,
  listWorkspaceSummaries,
  normalizeWorkspaceKey,
  scalarValue,
  setJsonSetting,
  setSetting,
  workspaceExists,
  workspaceDbPath,
  workspaceDirectory,
  writeWorkspaceMeta,
};
