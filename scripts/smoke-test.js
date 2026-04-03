const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const smokeDataDir = path.join(os.tmpdir(), `benjoji-smoke-${Date.now()}`);
fs.rmSync(smokeDataDir, { recursive: true, force: true });
fs.mkdirSync(smokeDataDir, { recursive: true });
process.env.BENJOJI_DATA_DIR = smokeDataDir;

const { createWorkspace } = require("../lib/workspace-db");
const { createUser, getUserCount } = require("../lib/workspace-auth");
const {
  addOrStockInProduct,
  buildAccountingSummary,
  buildReport,
  createDebtPayment,
  createSale,
  listCredits,
  listProducts,
  listSales,
} = require("../lib/workspace-business");
const {
  configureInitialWorkspace,
  createBackupSnapshot,
  getOwnerControlCenter,
  restoreBackupSnapshot,
} = require("../lib/workspace-control");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const workspace = createWorkspace({
    businessName: "Smoke Test Retail",
    workspaceKey: "smoke-test-retail",
  });
  const wsKey = workspace.workspaceKey;

  createUser(wsKey, {
    fullName: "Smoke Test Owner",
    username: "owner",
    email: "owner@example.com",
    password: "SecurePass123!",
    pin: "123456",
    role: "OWNER",
  });

  configureInitialWorkspace(wsKey, {
    businessName: "Smoke Test Retail",
    legalName: "Smoke Test Retail Limited",
    branchName: "CBD Branch",
    enabledMethods: ["Cash", "M-Pesa", "Card", "Bank Transfer"],
    routes: {
      Cash: { label: "Main Counter", accountName: "Front Desk" },
      "M-Pesa": { label: "Till Number", targetNumber: "123456" },
      Card: { label: "POS Terminal", accountName: "Desk POS" },
      "Bank Transfer": { label: "Business Account", targetNumber: "0011223344" },
    },
    secondFactorMode: "OWNER_ONLY",
    accepted: true,
    acceptedBy: "Smoke Test Owner",
  }, "Smoke Test Owner");

  addOrStockInProduct(wsKey, {
    name: "Sugar 2kg",
    productCode: "8901234567807",
    unitPrice: 350,
    quantity: 20,
    authorizedBy: "Smoke Test Owner",
  });
  addOrStockInProduct(wsKey, {
    name: "Bread Large",
    productCode: "4006381333931",
    unitPrice: 90,
    quantity: 15,
    authorizedBy: "Smoke Test Owner",
  });

  const [bread, sugar] = listProducts(wsKey).sort((left, right) => left.name.localeCompare(right.name));
  assert(getUserCount(wsKey) === 1, "Expected one owner account after workspace setup.");
  assert(listProducts(wsKey).length === 2, "Expected two stocked products.");

  const paidSale = createSale(wsKey, {
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

  const creditSale = createSale(wsKey, {
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

  const debtPayment = createDebtPayment(wsKey, {
    customerName: "John Kamau",
    payments: [
      { paymentMethod: "Bank Transfer", amount: 250, approvalMode: "Bank App", accountReference: "RF-1002" },
    ],
  });
  assert(debtPayment.status === "DEBT CLEARED", "Expected debt payment to clear the outstanding balance.");

  const dailyReport = buildReport(wsKey, "daily");
  const weeklyReport = buildReport(wsKey, "weekly");
  const monthlyReport = buildReport(wsKey, "monthly");
  const annualReport = buildReport(wsKey, "annual");
  const accounting = buildAccountingSummary(wsKey);
  const baselineBackup = createBackupSnapshot(wsKey, "smoke-baseline", "Smoke Test");

  assert(dailyReport.sales.length === 2, "Expected daily report to include both smoke-test sales.");
  assert(weeklyReport.sales.length === 2, "Expected weekly report to include both smoke-test sales.");
  assert(monthlyReport.sales.length === 2, "Expected monthly report to include both smoke-test sales.");
  assert(annualReport.sales.length === 2, "Expected annual report to include both smoke-test sales.");
  assert(accounting.salesCount === 2, "Expected accounting summary to record two sales.");
  assert(listCredits(wsKey).every((credit) => credit.amountOwed <= 0.0001), "Expected all smoke-test debt to be cleared.");

  addOrStockInProduct(wsKey, {
    name: "Milk 500ml",
    productCode: "7622210123456",
    unitPrice: 80,
    quantity: 8,
    authorizedBy: "Smoke Test Owner",
  });
  assert(listProducts(wsKey).length === 3, "Expected a temporary third product before restore.");

  const restored = restoreBackupSnapshot(wsKey, baselineBackup.fileName, "Smoke Test");
  assert(listProducts(wsKey).length === 2, "Expected restore to roll back to the backed-up product count.");
  assert(listSales(wsKey).length === 2, "Expected restore to keep the backed-up sales history.");
  assert(Boolean(restored.emergencyBackup?.fileName), "Expected restore to create an emergency pre-restore snapshot.");

  const ownerControl = getOwnerControlCenter(wsKey);
  assert(ownerControl.backups.length >= 2, "Expected backup list to include the baseline and emergency snapshots.");

  const secondWorkspace = createWorkspace({
    businessName: "Client Workspace",
    workspaceKey: "client-workspace",
  });
  createUser(secondWorkspace.workspaceKey, {
    fullName: "Client Owner",
    username: "clientowner",
    email: "client@example.com",
    password: "SecurePass123!",
    role: "OWNER",
  });
  assert(getUserCount(secondWorkspace.workspaceKey) === 1, "Expected the second workspace to keep its own owner account.");
  assert(listProducts(secondWorkspace.workspaceKey).length === 0, "Expected the second workspace inventory to remain isolated.");

  console.log("Workspace smoke test passed.");
  console.log(`Data dir: ${smokeDataDir}`);
  console.log(`Primary workspace: ${wsKey}`);
  console.log(`Primary sales: ${listSales(wsKey).length}`);
  console.log(`Backups: ${ownerControl.backups.length}`);
  console.log(`Secondary workspace: ${secondWorkspace.workspaceKey}`);
}

main();
