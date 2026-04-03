const fs = require("node:fs");
const path = require("node:path");
const {
  BACKUP_DIR,
  DATA_DIR,
  DB_PATH,
  db,
  getBusinessName,
  getJsonSetting,
  setJsonSetting,
  setSetting,
} = require("./db");
const {
  SUPPORTED_PAYMENT_METHODS,
  generateId,
  optionalText,
  requirePositiveInteger,
  requireText,
  timestampNow,
} = require("./utils");

const SETTINGS_KEYS = {
  businessProfile: "business_profile",
  receiptProfile: "receipt_profile",
  paymentProfile: "payment_profile",
  securityPolicy: "security_policy",
  complianceProfile: "compliance_profile",
};

function defaultBusinessProfile() {
  const businessName = getBusinessName();
  return {
    businessName,
    legalName: businessName,
    branchName: "Main Branch",
    logoDataUrl: "",
    contactPhone: "",
    contactEmail: "",
    address: "",
    taxId: "",
    supportName: "Operations Desk",
    supportPhone: "",
    supportEmail: "",
  };
}

function defaultReceiptProfile() {
  return {
    headerTitle: "Official Receipt",
    footerNote: "Thank you for choosing us.",
    returnPolicy: "Goods once sold can only be returned according to the business return policy.",
    showContact: true,
    showTaxId: true,
    printLogoNote: true,
  };
}

function defaultPaymentRoutes() {
  return {
    Cash: { enabled: true, label: "Cash Desk", targetNumber: "", accountName: "Main Counter" },
    "M-Pesa": { enabled: true, label: "Business M-Pesa Line", targetNumber: "", accountName: "" },
    "Buy Goods": { enabled: true, label: "Till Number", targetNumber: "", accountName: "" },
    Paybill: { enabled: true, label: "Paybill Number", targetNumber: "", accountName: "" },
    "Airtel Money": { enabled: true, label: "Airtel Money Line", targetNumber: "", accountName: "" },
    Card: { enabled: true, label: "Card Terminal", targetNumber: "", accountName: "POS Terminal" },
    "Gift Card": { enabled: true, label: "Gift Card Desk", targetNumber: "", accountName: "" },
    "Bank Transfer": { enabled: true, label: "Bank Account", targetNumber: "", accountName: "" },
  };
}

function defaultPaymentProfile() {
  return {
    enabledMethods: [...SUPPORTED_PAYMENT_METHODS],
    routes: defaultPaymentRoutes(),
  };
}

function defaultSecurityPolicy() {
  return {
    secondFactorMode: "NONE",
    loginAttemptLimit: 5,
    lockMinutes: 15,
    autoBackupEnabled: true,
    backupRetention: 20,
    requireOwnerApprovalForNewAccounts: true,
    incidentContactName: "System Administrator",
    incidentContactPhone: "",
    incidentContactEmail: "",
  };
}

function defaultComplianceProfile() {
  return {
    termsVersion: "v1.0",
    privacyVersion: "v1.0",
    backupPolicyVersion: "v1.0",
    accepted: false,
    acceptedAt: "",
    acceptedBy: "",
    legalNotice: "This software provides operational controls, but each business should review laws, taxes, privacy requirements, employment obligations, and payment-provider terms with qualified local advisors.",
    privacySummary: "Customer, staff, sales, and payment data should only be collected for legitimate business operations and protected against unauthorized access.",
    incidentResponseSummary: "If a breach or failure occurs, secure the system, assess the impact, restore from backup, and notify affected parties according to applicable law.",
  };
}

function getBusinessProfile() {
  return mergeDeep(defaultBusinessProfile(), getJsonSetting(SETTINGS_KEYS.businessProfile, {}));
}

function getReceiptProfile() {
  return mergeDeep(defaultReceiptProfile(), getJsonSetting(SETTINGS_KEYS.receiptProfile, {}));
}

function getPaymentProfile() {
  const stored = mergeDeep(defaultPaymentProfile(), getJsonSetting(SETTINGS_KEYS.paymentProfile, {}));
  stored.enabledMethods = normalizeEnabledMethods(stored.enabledMethods);
  stored.routes = mergeDeep(defaultPaymentRoutes(), stored.routes || {});
  for (const method of SUPPORTED_PAYMENT_METHODS) {
    stored.routes[method].enabled = stored.enabledMethods.includes(method);
  }
  return stored;
}

function getSecurityPolicy() {
  return mergeDeep(defaultSecurityPolicy(), getJsonSetting(SETTINGS_KEYS.securityPolicy, {}));
}

function getComplianceProfile() {
  return mergeDeep(defaultComplianceProfile(), getJsonSetting(SETTINGS_KEYS.complianceProfile, {}));
}

function getPublicWorkspaceConfig() {
  const businessProfile = getBusinessProfile();
  const receiptProfile = getReceiptProfile();
  const paymentProfile = getPaymentProfile();
  const securityPolicy = getSecurityPolicy();
  const complianceProfile = getComplianceProfile();

  return {
    businessProfile,
    receiptProfile,
    paymentProfile: {
      enabledMethods: paymentProfile.enabledMethods,
      routes: SUPPORTED_PAYMENT_METHODS.reduce((acc, method) => {
        if (paymentProfile.enabledMethods.includes(method)) {
          acc[method] = {
            label: paymentProfile.routes[method]?.label || "",
            targetNumber: paymentProfile.routes[method]?.targetNumber || "",
            accountName: paymentProfile.routes[method]?.accountName || "",
          };
        }
        return acc;
      }, {}),
    },
    securityPolicy: {
      secondFactorMode: securityPolicy.secondFactorMode,
      autoBackupEnabled: Boolean(securityPolicy.autoBackupEnabled),
      loginAttemptLimit: Number(securityPolicy.loginAttemptLimit || 5),
      lockMinutes: Number(securityPolicy.lockMinutes || 15),
    },
    complianceStatus: {
      accepted: Boolean(complianceProfile.accepted),
      acceptedAt: complianceProfile.acceptedAt,
      acceptedBy: complianceProfile.acceptedBy,
      termsVersion: complianceProfile.termsVersion,
      privacyVersion: complianceProfile.privacyVersion,
      backupPolicyVersion: complianceProfile.backupPolicyVersion,
    },
  };
}

function getOwnerControlCenter() {
  return {
    businessProfile: getBusinessProfile(),
    receiptProfile: getReceiptProfile(),
    paymentProfile: getPaymentProfile(),
    securityPolicy: getSecurityPolicy(),
    complianceProfile: getComplianceProfile(),
    backups: listBackupSnapshots(),
    dataDirectory: DATA_DIR,
    databasePath: DB_PATH,
  };
}

function configureInitialWorkspace(input, actorName) {
  updateBusinessProfile(input, actorName, false);
  updateReceiptProfile(input, actorName, false);
  updatePaymentProfile(input, actorName, false);
  updateSecurityPolicy(input, actorName, false);
  updateComplianceProfile(input, actorName, false);
}

function updateBusinessProfile(input, actorName = "System", snapshot = true) {
  const current = getBusinessProfile();
  const businessName = requireText(readProvidedText(input, "businessName", current.businessName), "Business name");
  const legalName = requireText(readProvidedText(input, "legalName", "") || businessName || current.legalName, "Legal business name");
  const next = {
    businessName,
    legalName,
    branchName: readProvidedText(input, "branchName", current.branchName),
    logoDataUrl: readProvidedText(input, "logoDataUrl", current.logoDataUrl),
    contactPhone: readProvidedText(input, "contactPhone", current.contactPhone),
    contactEmail: readProvidedText(input, "contactEmail", current.contactEmail),
    address: readProvidedText(input, "address", current.address),
    taxId: readProvidedText(input, "taxId", current.taxId),
    supportName: readProvidedText(input, "supportName", current.supportName),
    supportPhone: readProvidedText(input, "supportPhone", current.supportPhone),
    supportEmail: readProvidedText(input, "supportEmail", current.supportEmail),
  };

  setSetting("business_name", next.businessName);
  setJsonSetting(SETTINGS_KEYS.businessProfile, next);
  if (snapshot) {
    recordAutomaticBackup("business-profile-update", actorName);
  }
  return next;
}

function updateReceiptProfile(input, actorName = "System", snapshot = true) {
  const current = getReceiptProfile();
  const next = {
    headerTitle: optionalText(input.headerTitle) || current.headerTitle,
    footerNote: optionalText(input.footerNote) || current.footerNote,
    returnPolicy: optionalText(input.returnPolicy) || current.returnPolicy,
    showContact: toBoolean(input.showContact, current.showContact),
    showTaxId: toBoolean(input.showTaxId, current.showTaxId),
    printLogoNote: toBoolean(input.printLogoNote, current.printLogoNote),
  };
  setJsonSetting(SETTINGS_KEYS.receiptProfile, next);
  if (snapshot) {
    recordAutomaticBackup("receipt-profile-update", actorName);
  }
  return next;
}

function updatePaymentProfile(input, actorName = "System", snapshot = true) {
  const current = getPaymentProfile();
  const enabledMethods = normalizeEnabledMethods(input.enabledMethods || current.enabledMethods);
  const routes = mergeDeep(defaultPaymentRoutes(), current.routes || {});

  for (const method of SUPPORTED_PAYMENT_METHODS) {
    const routeInput = input.routes?.[method] || {};
    routes[method] = {
      enabled: enabledMethods.includes(method),
      label: optionalText(routeInput.label) || routes[method].label,
      targetNumber: optionalText(routeInput.targetNumber) || "",
      accountName: optionalText(routeInput.accountName) || "",
    };
  }

  const next = { enabledMethods, routes };
  setJsonSetting(SETTINGS_KEYS.paymentProfile, next);
  if (snapshot) {
    recordAutomaticBackup("payment-profile-update", actorName);
  }
  return next;
}

function updateSecurityPolicy(input, actorName = "System", snapshot = true) {
  const current = getSecurityPolicy();
  const next = {
    secondFactorMode: normalizeSecondFactorMode(input.secondFactorMode || current.secondFactorMode),
    loginAttemptLimit: requirePositiveInteger(input.loginAttemptLimit || current.loginAttemptLimit, "Login attempt limit"),
    lockMinutes: requirePositiveInteger(input.lockMinutes || current.lockMinutes, "Lock duration"),
    autoBackupEnabled: toBoolean(input.autoBackupEnabled, current.autoBackupEnabled),
    backupRetention: requirePositiveInteger(input.backupRetention || current.backupRetention, "Backup retention"),
    requireOwnerApprovalForNewAccounts: toBoolean(
      input.requireOwnerApprovalForNewAccounts,
      current.requireOwnerApprovalForNewAccounts,
    ),
    incidentContactName: optionalText(input.incidentContactName) || current.incidentContactName,
    incidentContactPhone: optionalText(input.incidentContactPhone) || current.incidentContactPhone,
    incidentContactEmail: optionalText(input.incidentContactEmail) || current.incidentContactEmail,
  };
  setJsonSetting(SETTINGS_KEYS.securityPolicy, next);
  pruneBackups(next.backupRetention);
  if (snapshot) {
    recordAutomaticBackup("security-policy-update", actorName);
  }
  return next;
}

function updateComplianceProfile(input, actorName = "System", snapshot = true) {
  const current = getComplianceProfile();
  const now = timestampNow().iso;
  const accepted = toBoolean(input.accepted, current.accepted);
  const next = {
    termsVersion: optionalText(input.termsVersion) || current.termsVersion,
    privacyVersion: optionalText(input.privacyVersion) || current.privacyVersion,
    backupPolicyVersion: optionalText(input.backupPolicyVersion) || current.backupPolicyVersion,
    accepted,
    acceptedAt: accepted ? current.acceptedAt || now : "",
    acceptedBy: accepted ? optionalText(input.acceptedBy) || current.acceptedBy || actorName : "",
    legalNotice: optionalText(input.legalNotice) || current.legalNotice,
    privacySummary: optionalText(input.privacySummary) || current.privacySummary,
    incidentResponseSummary: optionalText(input.incidentResponseSummary) || current.incidentResponseSummary,
  };
  setJsonSetting(SETTINGS_KEYS.complianceProfile, next);
  if (snapshot) {
    recordAutomaticBackup("compliance-profile-update", actorName);
  }
  return next;
}

function listBackupSnapshots() {
  const files = fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => {
      const fullPath = path.join(BACKUP_DIR, entry.name);
      const stats = fs.statSync(fullPath);
      const meta = readBackupMeta(fullPath);
      return {
        fileName: entry.name,
        path: fullPath,
        sizeBytes: stats.size,
        createdAt: stats.birthtime.toISOString(),
        reason: meta.reason || "manual",
        actor: meta.actor || "System",
      };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return files;
}

function createBackupSnapshot(reason = "manual", actor = "System") {
  const now = timestampNow();
  const fileName = `${now.date}-${now.time.replace(/:/g, "")}-${generateId("BKP")}.json`;
  const filePath = path.join(BACKUP_DIR, fileName);
  const snapshot = {
    meta: {
      id: generateId("SNAP"),
      reason,
      actor,
      createdAt: now.iso,
      businessName: getBusinessName(),
    },
    config: {
      businessProfile: getBusinessProfile(),
      receiptProfile: getReceiptProfile(),
      paymentProfile: getPaymentProfile(),
      securityPolicy: getSecurityPolicy(),
      complianceProfile: getComplianceProfile(),
    },
    data: exportTables(),
  };

  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
  pruneBackups(getSecurityPolicy().backupRetention);
  return {
    fileName,
    path: filePath,
    createdAt: snapshot.meta.createdAt,
    reason,
    actor,
  };
}

function getBackupSnapshot(fileName) {
  const backupPath = resolveBackupSnapshotPath(fileName);
  return {
    fileName: path.basename(backupPath),
    path: backupPath,
    snapshot: JSON.parse(fs.readFileSync(backupPath, "utf8")),
  };
}

function restoreBackupSnapshot(fileName, actor = "System") {
  const { fileName: safeFileName, snapshot } = getBackupSnapshot(fileName);

  if (!snapshot || typeof snapshot !== "object" || !snapshot.data || typeof snapshot.data !== "object") {
    throw new Error("That backup snapshot is invalid or incomplete.");
  }

  const emergencyBackup = createBackupSnapshot(`pre-restore:${safeFileName}`, actor);
  const tablesToDelete = [
    "login_challenges",
    "sessions",
    "payments",
    "debt_payments",
    "credits",
    "sale_items",
    "sales",
    "stock_records",
    "products",
    "users",
    "settings",
  ];
  const tablesToInsert = [
    "settings",
    "users",
    "products",
    "stock_records",
    "sales",
    "sale_items",
    "credits",
    "debt_payments",
    "payments",
  ];

  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec("BEGIN");
    try {
      tablesToDelete.forEach((tableName) => {
        if (tableExists(tableName)) {
          db.prepare(`DELETE FROM ${tableName}`).run();
        }
      });

      tablesToInsert.forEach((tableName) => {
        const rows = Array.isArray(snapshot.data[tableName]) ? snapshot.data[tableName] : [];
        if (!rows.length || !tableExists(tableName)) {
          return;
        }

        const availableColumns = getTableColumns(tableName);
        for (const row of rows) {
          if (!row || typeof row !== "object" || Array.isArray(row)) {
            continue;
          }
          const columns = Object.keys(row).filter((columnName) => availableColumns.includes(columnName));
          if (!columns.length) {
            continue;
          }
          const placeholders = columns.map(() => "?").join(", ");
          const insertStatement = db.prepare(`
            INSERT INTO ${tableName} (${columns.join(", ")})
            VALUES (${placeholders})
          `);
          insertStatement.run(...columns.map((columnName) => row[columnName]));
        }
      });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }

  return {
    restoredFileName: safeFileName,
    restoredAt: timestampNow().iso,
    restoredBy: actor,
    emergencyBackup,
  };
}

function recordAutomaticBackup(reason, actor = "System") {
  const policy = getSecurityPolicy();
  if (!policy.autoBackupEnabled) {
    return null;
  }
  return createBackupSnapshot(reason, actor);
}

function getAllowedPaymentMethods() {
  return getPaymentProfile().enabledMethods;
}

function getPaymentRoute(method) {
  const paymentProfile = getPaymentProfile();
  return paymentProfile.routes[method] || null;
}

function normalizeEnabledMethods(methods) {
  const incoming = Array.isArray(methods)
    ? methods
    : typeof methods === "string"
      ? methods.split(",")
      : [];
  const normalized = [...new Set(incoming.map((item) => item.toString().trim()).filter(Boolean))]
    .map((item) => SUPPORTED_PAYMENT_METHODS.find((method) => method.toLowerCase() === item.toLowerCase()))
    .filter(Boolean);
  if (!normalized.length) {
    return [...SUPPORTED_PAYMENT_METHODS];
  }
  return normalized;
}

function normalizeSecondFactorMode(value) {
  const safe = optionalText(value || "NONE").toUpperCase();
  if (!["NONE", "OWNER_ONLY", "ALL_USERS"].includes(safe)) {
    throw new Error("Second-factor mode must be NONE, OWNER_ONLY, or ALL_USERS.");
  }
  return safe;
}

function requiresSecondFactorForRole(role) {
  const mode = getSecurityPolicy().secondFactorMode;
  if (mode === "ALL_USERS") {
    return true;
  }
  if (mode === "OWNER_ONLY" && String(role || "").toUpperCase() === "OWNER") {
    return true;
  }
  return false;
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function readProvidedText(input, key, fallback = "") {
  if (!input || !Object.prototype.hasOwnProperty.call(input, key)) {
    return fallback;
  }
  return optionalText(input[key]);
}

function mergeDeep(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return structuredClone(base);
  }
  const output = structuredClone(base);
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value) && output[key] && typeof output[key] === "object" && !Array.isArray(output[key])) {
      output[key] = mergeDeep(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function exportTables() {
  const tables = [
    "settings",
    "users",
    "products",
    "stock_records",
    "sales",
    "sale_items",
    "credits",
    "debt_payments",
    "payments",
  ];
  return tables.reduce((acc, table) => {
    acc[table] = db.prepare(`SELECT * FROM ${table}`).all();
    return acc;
  }, {});
}

function pruneBackups(retention) {
  const keep = Math.max(1, Number(retention || 20));
  const backups = listBackupSnapshots();
  backups.slice(keep).forEach((backup) => {
    try {
      fs.unlinkSync(backup.path);
    } catch {
      // Ignore backup cleanup failures.
    }
  });
}

function readBackupMeta(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed?.meta && typeof parsed.meta === "object" ? parsed.meta : {};
  } catch {
    return {};
  }
}

function resolveBackupSnapshotPath(fileName) {
  const safeName = path.basename(requireText(fileName, "Backup file"));
  const backupPath = path.resolve(BACKUP_DIR, safeName);
  if (!backupPath.startsWith(path.resolve(BACKUP_DIR))) {
    throw new Error("Invalid backup file requested.");
  }
  if (!safeName.endsWith(".json") || !fs.existsSync(backupPath)) {
    throw new Error("Backup snapshot not found.");
  }
  return backupPath;
}

function tableExists(tableName) {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName);
  return Boolean(row?.name);
}

function getTableColumns(tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
}

module.exports = {
  configureInitialWorkspace,
  createBackupSnapshot,
  getBackupSnapshot,
  getAllowedPaymentMethods,
  getBusinessProfile,
  getOwnerControlCenter,
  getPaymentProfile,
  getPaymentRoute,
  getPublicWorkspaceConfig,
  getReceiptProfile,
  getSecurityPolicy,
  listBackupSnapshots,
  recordAutomaticBackup,
  restoreBackupSnapshot,
  requiresSecondFactorForRole,
  updateBusinessProfile,
  updateComplianceProfile,
  updatePaymentProfile,
  updateReceiptProfile,
  updateSecurityPolicy,
};
