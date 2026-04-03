const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const smokeDataDir = path.join(os.tmpdir(), `benjoji-smoke-${Date.now()}`);
fs.rmSync(smokeDataDir, { recursive: true, force: true });
fs.mkdirSync(smokeDataDir, { recursive: true });
process.env.BENJOJI_DATA_DIR = smokeDataDir;

const { createUser, getUserCount } = require("../lib/auth");
const {
  addOrStockInProduct,
  buildAccountingSummary,
  buildReport,
  createDebtPayment,
  createSale,
  listCredits,
  listProducts,
  listSales,
} = require("../lib/business");
const {
  configureInitialWorkspace,
  createBackupSnapshot,
  getOwnerControlCenter,
  restoreBackupSnapshot,
} = require("../lib/control");
const { db, setSetting } = require("../lib/db");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function resetSmokeDatabase() {
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    [
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
    ].forEach((tableName) => {
      try {
        db.prepare(`DELETE FROM ${tableName}`).run();
      } catch {
        // Ignore tables that are not present in the current schema snapshot.
      }
    });
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }

  setSetting("business_name", "Smoke Test Retail");
}

function main() {
  resetSmokeDatabase();

  createUser({
    fullName: "Smoke Test Owner",
    username: "owner",
    email: "owner@example.com",
    password: "SecurePass123!",
    pin: "123456",
    role: "OWNER",
  });

  configureInitialWorkspace({
    businessName: "Smoke Test Retail",
    legalName: "Smoke Test Retail Limited",
    branchName: "CBD Branch",
    enabledMethods: ["Cash", "M-Pesa", "Card", "Bank Transfer"],
    routes: {
      Cash: { label: "Main Counter" },
      "M-Pesa": { label: "Till Number", targetNumber: "123456" },
      Card: { label: "POS Terminal", accountName: "Desk POS" },
      "Bank Transfer": { label: "Business Account", targetNumber: "0011223344" },
    },
    secondFactorMode: "OWNER_ONLY",
    accepted: true,
  }, "Smoke Test Owner");

  addOrStockInProduct({
    name: "Sugar 2kg",
    productCode: "8901234567807",
    unitPrice: 350,
    quantity: 20,
    authorizedBy: "Smoke Test Owner",
  });
  addOrStockInProduct({
    name: "Bread Large",
    productCode: "4006381333931",
    unitPrice: 90,
    quantity: 15,
    authorizedBy: "Smoke Test Owner",
  });

  const [bread, sugar] = listProducts().sort((left, right) => left.name.localeCompare(right.name));
  assert(getUserCount() === 1, "Expected one owner account after initial setup.");
  assert(listProducts().length === 2, "Expected two stocked products.");

  const paidSale = createSale({
    customerName: "",
    phoneNumber: "",
    processedBy: "Cashier Grace",
    items: [
      { productId: sugar.id, quantity: 2 },
      { productId: bread.id, quantity: 1 },
    ],
    payments: [
      { paymentMethod: "M-Pesa", amount: 500, approvalMode: "STK Push", customerPhone: "254712345678" },
      { paymentMethod: "Cash", amount: 290, approvalMode: "Cash Desk" },
    ],
  });
  assert(paidSale.status === "PAID", "Expected the first sale to be fully paid.");

  const creditSale = createSale({
    customerName: "John Kamau",
    phoneNumber: "254700000000",
    processedBy: "Cashier Grace",
    items: [
      { productId: sugar.id, quantity: 1 },
    ],
    payments: [
      { paymentMethod: "Cash", amount: 100, approvalMode: "Cash Desk" },
    ],
  });
  assert(creditSale.status === "PARTIAL", "Expected the second sale to create a partial credit.");

  const debtPayment = createDebtPayment({
    customerName: "John Kamau",
    payments: [
      { paymentMethod: "Bank Transfer", amount: 250, approvalMode: "Bank App", accountReference: "RF-1002" },
    ],
  });
  assert(debtPayment.status === "DEBT CLEARED", "Expected debt payment to clear the outstanding balance.");

  const dailyReport = buildReport("daily");
  const weeklyReport = buildReport("weekly");
  const monthlyReport = buildReport("monthly");
  const annualReport = buildReport("annual");
  const accounting = buildAccountingSummary();
  const baselineBackup = createBackupSnapshot("smoke-baseline", "Smoke Test");

  assert(dailyReport.sales.length === 2, "Expected daily report to include both smoke-test sales.");
  assert(weeklyReport.sales.length === 2, "Expected weekly report to include both smoke-test sales.");
  assert(monthlyReport.sales.length === 2, "Expected monthly report to include both smoke-test sales.");
  assert(annualReport.sales.length === 2, "Expected annual report to include both smoke-test sales.");
  assert(accounting.salesCount === 2, "Expected accounting summary to record two sales.");
  assert(listCredits().every((credit) => credit.amountOwed <= 0.0001), "Expected all smoke-test debt to be cleared.");

  addOrStockInProduct({
    name: "Milk 500ml",
    productCode: "7622210123456",
    unitPrice: 80,
    quantity: 8,
    authorizedBy: "Smoke Test Owner",
  });
  assert(listProducts().length === 3, "Expected a temporary third product before restore.");

  const restored = restoreBackupSnapshot(baselineBackup.fileName, "Smoke Test");
  assert(listProducts().length === 2, "Expected restore to roll back to the backed-up product count.");
  assert(listSales().length === 2, "Expected restore to keep the backed-up sales history.");
  assert(Boolean(restored.emergencyBackup?.fileName), "Expected restore to create an emergency pre-restore snapshot.");

  const ownerControl = getOwnerControlCenter();
  assert(ownerControl.backups.length >= 2, "Expected backup list to include the baseline and emergency snapshots.");

  console.log("Smoke test passed.");
  console.log(`Data dir: ${smokeDataDir}`);
  console.log(`Products: ${listProducts().length}`);
  console.log(`Sales: ${listSales().length}`);
  console.log(`Backups: ${ownerControl.backups.length}`);
}

try {
  main();
} finally {
  try {
    db.close();
  } catch {
    // Ignore close errors in the smoke environment.
  }
}
