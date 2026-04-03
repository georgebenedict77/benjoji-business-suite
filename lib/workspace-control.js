const fs = require("node:fs");
const path = require("node:path");
const {
  ROOT_DATA_DIR,
  getBusinessName,
  getJsonSetting,
  getWorkspaceBackupDir,
  getWorkspaceDb,
  setJsonSetting,
  setSetting,
  writeWorkspaceMeta,
  workspaceDbPath,
  workspaceDirectory,
} = require("./workspace-db");
const {
  SUPPORTED_PAYMENT_METHODS,
  createHttpError,
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

function defaultBusinessProfile(workspaceKey) {
  const businessName = getBusinessName(workspaceKey);
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

function getBusinessProfile(workspaceKey) {
  return mergeDeep(defaultBusinessProfile(workspaceKey), getJsonSetting(workspaceKey, SETTINGS_KEYS.businessProfile, {}));
}

function getReceiptProfile(workspaceKey) {
  return mergeDeep(defaultReceiptProfile(), getJsonSetting(workspaceKey, SETTINGS_KEYS.receiptProfile, {}));
}

function getPaymentProfile(workspaceKey) {
  const stored = mergeDeep(defaultPaymentProfile(), getJsonSetting(workspaceKey, SETTINGS_KEYS.paymentProfile, {}));
  stored.enabledMethods = normalizeEnabledMethods(stored.enabledMethods);
  stored.routes = mergeDeep(defaultPaymentRoutes(), stored.routes || {});
  for (const method of SUPPORTED_PAYMENT_METHODS) {
    stored.routes[method].enabled = stored.enabledMethods.includes(method);
  }
  return stored;
}

function getSecurityPolicy(workspaceKey) {
  return mergeDeep(defaultSecurityPolicy(), getJsonSetting(workspaceKey, SETTINGS_KEYS.securityPolicy, {}));
}

function getComplianceProfile(workspaceKey) {
  return mergeDeep(defaultComplianceProfile(), getJsonSetting(workspaceKey, SETTINGS_KEYS.complianceProfile, {}));
}

function getPublicWorkspaceConfig(workspaceKey) {
  if (!workspaceKey) {
    return null;
  }

  const businessProfile = getBusinessProfile(workspaceKey);
  const receiptProfile = getReceiptProfile(workspaceKey);
  const paymentProfile = getPaymentProfile(workspaceKey);
  const securityPolicy = getSecurityPolicy(workspaceKey);
  const complianceProfile = getComplianceProfile(workspaceKey);

  const publicRoutes = {};
  for (const method of SUPPORTED_PAYMENT_METHODS) {
    if (!paymentProfile.enabledMethods.includes(method)) {
      continue;
    }
    publicRoutes[method] = {
      label: paymentProfile.routes[method]?.label || "",
      targetNumber: paymentProfile.routes[method]?.targetNumber || "",
      accountName: paymentProfile.routes[method]?.accountName || "",
    };
  }

  return {
    businessProfile,
    receiptProfile,
    paymentProfile: {
      enabledMethods: paymentProfile.enabledMethods,
      routes: publicRoutes,
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

function getOwnerControlCenter(workspaceKey) {
  return {
    businessProfile: getBusinessProfile(workspaceKey),
    receiptProfile: getReceiptProfile(workspaceKey),
    paymentProfile: getPaymentProfile(workspaceKey),
    securityPolicy: getSecurityPolicy(workspaceKey),
    complianceProfile: getComplianceProfile(workspaceKey),
    backups: listBackupSnapshots(workspaceKey),
    dataDirectory: workspaceDirectory(workspaceKey),
    databasePath: workspaceDbPath(workspaceKey),
    rootDataDirectory: ROOT_DATA_DIR,
  };
}

function configureInitialWorkspace(workspaceKey, input, actorName) {
  updateBusinessProfile(workspaceKey, input, actorName, false);
  updateReceiptProfile(workspaceKey, input, actorName, false);
  updatePaymentProfile(workspaceKey, input, actorName, false);
  updateSecurityPolicy(workspaceKey, input, actorName, false);
  updateComplianceProfile(workspaceKey, input, actorName, false);
}

function updateBusinessProfile(workspaceKey, input, actorName = "System", snapshot = true) {
  const current = getBusinessProfile(workspaceKey);
  const businessNameText = readProvidedText(input, "businessName", current.businessName);
  const legalNameText = readProvidedText(input, "legalName", "");
  const businessName = requireText(businessNameText, "Business name");
  const legalName = requireText(legalNameText || businessName || current.legalName, "Legal business name");
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

  setSetting(workspaceKey, "business_name", next.businessName);
  setJsonSetting(workspaceKey, SETTINGS_KEYS.businessProfile, next);
  writeWorkspaceMeta(workspaceKey, {
    businessName: next.businessName,
    logoDataUrl: next.logoDataUrl,
  });
  if (snapshot) {
    recordAutomaticBackup(workspaceKey, "business-profile-update", actorName);
  }
  return next;
}

function updateReceiptProfile(workspaceKey, input, actorName = "System", snapshot = true) {
  const current = getReceiptProfile(workspaceKey);
  const next = {
    headerTitle: optionalText(input.headerTitle) || current.headerTitle,
    footerNote: optionalText(input.footerNote) || current.footerNote,
    returnPolicy: optionalText(input.returnPolicy) || current.returnPolicy,
    showContact: toBoolean(input.showContact, current.showContact),
    showTaxId: toBoolean(input.showTaxId, current.showTaxId),
    printLogoNote: toBoolean(input.printLogoNote, current.printLogoNote),
  };
  setJsonSetting(workspaceKey, SETTINGS_KEYS.receiptProfile, next);
  if (snapshot) {
    recordAutomaticBackup(workspaceKey, "receipt-profile-update", actorName);
  }
  return next;
}

function updatePaymentProfile(workspaceKey, input, actorName = "System", snapshot = true) {
  const current = getPaymentProfile(workspaceKey);
  const enabledMethods = normalizeEnabledMethods(input.enabledMethods || current.enabledMethods);
  if (!enabledMethods.length) {
    throw createHttpError("Enable at least one payment method for this business.", 400);
  }
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
  setJsonSetting(workspaceKey, SETTINGS_KEYS.paymentProfile, next);
  if (snapshot) {
    recordAutomaticBackup(workspaceKey, "payment-profile-update", actorName);
  }
  return next;
}

function updateSecurityPolicy(workspaceKey, input, actorName = "System", snapshot = true) {
  const current = getSecurityPolicy(workspaceKey);
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
  setJsonSetting(workspaceKey, SETTINGS_KEYS.securityPolicy, next);
  pruneBackups(workspaceKey, next.backupRetention);
  if (snapshot) {
    recordAutomaticBackup(workspaceKey, "security-policy-update", actorName);
  }
  return next;
}

function updateComplianceProfile(workspaceKey, input, actorName = "System", snapshot = true) {
  const current = getComplianceProfile(workspaceKey);
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
  setJsonSetting(workspaceKey, SETTINGS_KEYS.complianceProfile, next);
  if (snapshot) {
    recordAutomaticBackup(workspaceKey, "compliance-profile-update", actorName);
  }
  return next;
}

function listBackupSnapshots(workspaceKey) {
  const backupDir = getWorkspaceBackupDir(workspaceKey);
  return fs.readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => {
      const fullPath = path.join(backupDir, entry.name);
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
}

function createBackupSnapshot(workspaceKey, reason = "manual", actor = "System") {
  const backupDir = getWorkspaceBackupDir(workspaceKey);
  const now = timestampNow();
  const fileName = `${now.date}-${now.time.replace(/:/g, "")}-${generateId("BKP")}.json`;
  const filePath = path.join(backupDir, fileName);
  const snapshot = {
    meta: {
      id: generateId("SNAP"),
      workspaceKey,
      reason,
      actor,
      createdAt: now.iso,
      businessName: getBusinessName(workspaceKey),
    },
    config: {
      businessProfile: getBusinessProfile(workspaceKey),
      receiptProfile: getReceiptProfile(workspaceKey),
      paymentProfile: getPaymentProfile(workspaceKey),
      securityPolicy: getSecurityPolicy(workspaceKey),
      complianceProfile: getComplianceProfile(workspaceKey),
    },
    data: exportTables(workspaceKey),
  };

  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
  pruneBackups(workspaceKey, getSecurityPolicy(workspaceKey).backupRetention);
  return {
    fileName,
    path: filePath,
    createdAt: snapshot.meta.createdAt,
    reason,
    actor,
  };
}

function getBackupSnapshot(workspaceKey, fileName) {
  const backupPath = resolveBackupSnapshotPath(workspaceKey, fileName);
  return {
    fileName: path.basename(backupPath),
    path: backupPath,
    snapshot: JSON.parse(fs.readFileSync(backupPath, "utf8")),
  };
}

function restoreBackupSnapshot(workspaceKey, fileName, actor = "System") {
  const { fileName: backupFileName, snapshot } = getBackupSnapshot(workspaceKey, fileName);
  const db = getWorkspaceDb(workspaceKey);

  if (!snapshot || typeof snapshot !== "object" || !snapshot.data || typeof snapshot.data !== "object") {
    throw createHttpError("That backup snapshot is invalid or incomplete.", 400);
  }

  const emergencyBackup = createBackupSnapshot(workspaceKey, `pre-restore:${backupFileName}`, actor);
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
        if (tableExists(db, tableName)) {
          db.prepare(`DELETE FROM ${tableName}`).run();
        }
      });

      tablesToInsert.forEach((tableName) => {
        const rows = Array.isArray(snapshot.data[tableName]) ? snapshot.data[tableName] : [];
        if (!rows.length || !tableExists(db, tableName)) {
          return;
        }

        const availableColumns = getTableColumns(db, tableName);
        for (const row of rows) {
          if (!row || typeof row !== "object" || Array.isArray(row)) {
            continue;
          }
          const columns = Object.keys(row).filter((columnName) => availableColumns.includes(columnName));
          if (!columns.length) {
            continue;
          }
          const placeholders = columns.map(() => "?").join(", ");
          db.prepare(`
            INSERT INTO ${tableName} (${columns.join(", ")})
            VALUES (${placeholders})
          `).run(...columns.map((columnName) => row[columnName]));
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
    restoredFileName: backupFileName,
    restoredAt: timestampNow().iso,
    restoredBy: actor,
    emergencyBackup,
  };
}

function recordAutomaticBackup(workspaceKey, reason, actor = "System") {
  const policy = getSecurityPolicy(workspaceKey);
  if (!policy.autoBackupEnabled) {
    return null;
  }
  return createBackupSnapshot(workspaceKey, reason, actor);
}

function getAllowedPaymentMethods(workspaceKey) {
  return getPaymentProfile(workspaceKey).enabledMethods;
}

function getPaymentRoute(workspaceKey, method) {
  const paymentProfile = getPaymentProfile(workspaceKey);
  return paymentProfile.routes[method] || null;
}

function normalizeEnabledMethods(methods) {
  const incoming = [];
  if (Array.isArray(methods)) {
    for (const item of methods) {
      incoming.push(item);
    }
  } else if (typeof methods === "string") {
    for (const item of methods.split(",")) {
      incoming.push(item);
    }
  }

  const normalized = [];
  const seen = {};

  for (const item of incoming) {
    const text = item.toString().trim().toLowerCase();
    if (!text) {
      continue;
    }

    for (const method of SUPPORTED_PAYMENT_METHODS) {
      if (method.toLowerCase() === text && !seen[method]) {
        seen[method] = true;
        normalized.push(method);
      }
    }
  }
  if (!normalized.length) {
    if (Array.isArray(methods)) {
      return [];
    }
    return [...SUPPORTED_PAYMENT_METHODS];
  }
  return normalized;
}

function normalizeSecondFactorMode(value) {
  const mode = optionalText(value || "NONE").toUpperCase();
  if (!["NONE", "OWNER_ONLY", "ALL_USERS"].includes(mode)) {
    throw createHttpError("Second-factor mode must be NONE, OWNER_ONLY, or ALL_USERS.", 400);
  }
  return mode;
}

function requiresSecondFactorForRole(workspaceKey, role) {
  const mode = getSecurityPolicy(workspaceKey).secondFactorMode;
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
  if (!input) {
    return fallback;
  }
  if (input[key] === undefined) {
    return fallback;
  }
  return optionalText(input[key]);
}

function mergeDeep(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return JSON.parse(JSON.stringify(base));
  }
  const output = JSON.parse(JSON.stringify(base));
  for (const key in patch) {
    const value = patch[key];
    if (value && typeof value === "object" && !Array.isArray(value) && output[key] && typeof output[key] === "object" && !Array.isArray(output[key])) {
      output[key] = mergeDeep(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function exportTables(workspaceKey) {
  const db = getWorkspaceDb(workspaceKey);
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
  const data = {};
  for (const table of tables) {
    data[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  return data;
}

function pruneBackups(workspaceKey, retention) {
  const keep = Math.max(1, Number(retention || 20));
  const backups = listBackupSnapshots(workspaceKey);
  for (let i = keep; i < backups.length; i += 1) {
    const backup = backups[i];
    try {
      fs.unlinkSync(backup.path);
    } catch {
      // Ignore backup cleanup failures.
    }
  }
}

function readBackupMeta(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (parsed && parsed.meta && typeof parsed.meta === "object") {
      return parsed.meta;
    }
    return {};
  } catch {
    return {};
  }
}

function resolveBackupSnapshotPath(workspaceKey, fileName) {
  const backupName = path.basename(requireText(fileName, "Backup file"));
  const backupPath = path.resolve(getWorkspaceBackupDir(workspaceKey), backupName);
  if (!backupPath.startsWith(path.resolve(getWorkspaceBackupDir(workspaceKey)))) {
    throw createHttpError("Invalid backup file requested.", 400);
  }
  if (!backupName.endsWith(".json") || !fs.existsSync(backupPath)) {
    throw createHttpError("Backup snapshot not found.", 404);
  }
  return backupPath;
}

function tableExists(db, tableName) {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName);
  if (!row) {
    return false;
  }
  return Boolean(row.name);
}

function getTableColumns(db, tableName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const columns = [];
  for (const column of rows) {
    columns.push(column.name);
  }
  return columns;
}

module.exports = {
  configureInitialWorkspace,
  createBackupSnapshot,
  getAllowedPaymentMethods,
  getBackupSnapshot,
  getBusinessProfile,
  getComplianceProfile,
  getOwnerControlCenter,
  getPaymentProfile,
  getPaymentRoute,
  getPublicWorkspaceConfig,
  getReceiptProfile,
  getSecurityPolicy,
  listBackupSnapshots,
  recordAutomaticBackup,
  requiresSecondFactorForRole,
  restoreBackupSnapshot,
  updateBusinessProfile,
  updateComplianceProfile,
  updatePaymentProfile,
  updateReceiptProfile,
  updateSecurityPolicy,
};
