const http = require("node:http");
const { URL } = require("node:url");
const { getBusinessName, setSetting } = require("./lib/db");
const {
  beginLogin,
  completeSecondFactorLogin,
  createUser,
  destroySession,
  getCurrentUser,
  getUserCount,
  loginUser,
  verifyUserAccess,
} = require("./lib/auth");
const {
  addOrStockInProduct,
  adjustProductStock,
  buildAccountingSummary,
  buildReport,
  createDebtPayment,
  createSale,
  getDashboardSummary,
  listCredits,
  listOpenCredits,
  listPaymentLedger,
  listProducts,
  listSales,
  listStockRecords,
  listUsers,
  updateProductDetails,
} = require("./lib/business");
const {
  configureInitialWorkspace,
  createBackupSnapshot,
  getBackupSnapshot,
  getOwnerControlCenter,
  getPublicWorkspaceConfig,
  requiresSecondFactorForRole,
  restoreBackupSnapshot,
  updateBusinessProfile,
  updateComplianceProfile,
  updatePaymentProfile,
  updateReceiptProfile,
  updateSecurityPolicy,
} = require("./lib/control");
const { readJson, sendError, sendJson, serveStatic } = require("./lib/http");
const { normalizeRole, optionalText, requireText } = require("./lib/utils");

const HOST = "127.0.0.1";
const PORT = 3000;

function requireOwner(user, message = "Only the owner can perform this action.") {
  if (!user || user.role !== "OWNER") {
    const error = new Error(message);
    error.statusCode = 403;
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const routeKey = `${req.method} ${url.pathname}`;

    if (routeKey === "GET /api/bootstrap") {
      return sendJson(res, 200, {
        hasUsers: getUserCount() > 0,
        businessName: getBusinessName(),
        workspaceConfig: getPublicWorkspaceConfig(),
        user: getCurrentUser(req),
      });
    }

    if (routeKey === "GET /api/health") {
      return sendJson(res, 200, {
        status: "ok",
        product: "Benjoji Business Suite",
        time: new Date().toISOString(),
      });
    }

    if (routeKey === "POST /api/auth/register") {
      const body = await readJson(req);
      const hasUsers = getUserCount() > 0;
      const currentUser = getCurrentUser(req);
      let ownerAuthorization = null;

      if (hasUsers && !currentUser && body.ownerUsername) {
        try {
          ownerAuthorization = verifyUserAccess({
            username: body.ownerUsername,
            authMode: body.ownerAuthMode,
            password: body.ownerPassword,
            pin: body.ownerPin,
            requiredRole: "OWNER",
          });
        } catch (error) {
          return sendError(res, 403, error.message || "Owner authorization failed.");
        }
      }

      if (hasUsers && !((currentUser && currentUser.role === "OWNER") || ownerAuthorization)) {
        return sendError(res, 403, "Only the owner can create additional accounts.");
      }
      if (body.password !== body.confirmPassword) {
        return sendError(res, 400, "Passwords do not match.");
      }
      if ((body.pin || body.confirmPin) && body.pin !== body.confirmPin) {
        return sendError(res, 400, "PIN entries do not match.");
      }

      const role = hasUsers ? normalizeRole(body.role) : "OWNER";
      const requiresPin =
        (!hasUsers && ["OWNER_ONLY", "ALL_USERS"].includes(String(body.secondFactorMode || "").toUpperCase()))
        || requiresSecondFactorForRole(role);
      if (requiresPin && !body.pin) {
        return sendError(res, 400, "This security policy requires a 6-digit PIN for the selected account.");
      }
      const createdUser = createUser({
        fullName: body.fullName,
        username: body.username,
        email: body.email,
        password: body.password,
        pin: body.pin,
        role,
      });

      if (!hasUsers) {
        setSetting("business_name", requireText(body.businessName, "Business name"));
        configureInitialWorkspace(body, body.fullName || body.username || "Owner");
        loginUser(res, { username: body.username, password: body.password, authMode: "password" });
      }

      return sendJson(res, 201, {
        message: hasUsers ? "Account created successfully." : "Owner account created successfully.",
        user: createdUser,
      });
    }

    if (routeKey === "POST /api/auth/login") {
      const body = await readJson(req);
      const result = beginLogin(res, body);
      return sendJson(res, 200, {
        message: result.requiresSecondFactor ? "Second authentication step required." : "Login successful.",
        ...result,
        businessName: getBusinessName(),
      });
    }

    if (routeKey === "POST /api/auth/login/verify-second-factor") {
      const body = await readJson(req);
      const user = completeSecondFactorLogin(res, body);
      return sendJson(res, 200, { message: "Login successful.", user, businessName: getBusinessName() });
    }

    if (routeKey === "POST /api/auth/verify") {
      const currentUser = getCurrentUser(req);
      if (!currentUser) {
        return sendError(res, 401, "Please log in to continue.");
      }
      const body = await readJson(req);
      try {
        verifyUserAccess({
          username: currentUser.username,
          authMode: body.authMode,
          password: body.password,
          pin: body.pin,
        });
      } catch (error) {
        return sendError(res, 403, error.message || "Verification failed.");
      }
      return sendJson(res, 200, { message: "Verification successful." });
    }

    if (routeKey === "POST /api/auth/logout") {
      destroySession(req, res);
      return sendJson(res, 200, { message: "Logged out." });
    }

    const user = getCurrentUser(req);
    if (url.pathname.startsWith("/api/") && !user) {
      return sendError(res, 401, "Please log in to continue.");
    }

    if (routeKey === "GET /api/dashboard") {
      return sendJson(res, 200, getDashboardSummary());
    }
    if (routeKey === "GET /api/products") {
      return sendJson(res, 200, { products: listProducts() });
    }
    if (routeKey === "GET /api/stock") {
      return sendJson(res, 200, { stockRecords: listStockRecords() });
    }
    if (routeKey === "GET /api/sales") {
      return sendJson(res, 200, { sales: listSales() });
    }
    if (routeKey === "GET /api/credits") {
      return sendJson(res, 200, { credits: listCredits(), openCredits: listOpenCredits() });
    }
    if (routeKey === "GET /api/accounting") {
      return sendJson(res, 200, buildAccountingSummary());
    }
    if (routeKey === "GET /api/payments") {
      return sendJson(res, 200, { paymentLedger: listPaymentLedger() });
    }
    if (routeKey === "GET /api/users") {
      if (user.role !== "OWNER") {
        return sendError(res, 403, "Only the owner can access this area.");
      }
      return sendJson(res, 200, { users: listUsers() });
    }
    if (routeKey === "GET /api/admin/control-center") {
      requireOwner(user, "Only the owner can access the control center.");
      return sendJson(res, 200, getOwnerControlCenter());
    }
    if (routeKey === "PUT /api/admin/business-profile") {
      requireOwner(user, "Only the owner can update business profile settings.");
      const body = await readJson(req);
      return sendJson(res, 200, {
        message: "Business profile updated successfully.",
        businessProfile: updateBusinessProfile(body, user.fullName),
        workspaceConfig: getPublicWorkspaceConfig(),
      });
    }
    if (routeKey === "PUT /api/admin/receipt-profile") {
      requireOwner(user, "Only the owner can update receipt settings.");
      const body = await readJson(req);
      return sendJson(res, 200, {
        message: "Receipt profile updated successfully.",
        receiptProfile: updateReceiptProfile(body, user.fullName),
        workspaceConfig: getPublicWorkspaceConfig(),
      });
    }
    if (routeKey === "PUT /api/admin/payment-profile") {
      requireOwner(user, "Only the owner can update payment routing.");
      const body = await readJson(req);
      return sendJson(res, 200, {
        message: "Payment routing updated successfully.",
        paymentProfile: updatePaymentProfile(body, user.fullName),
        workspaceConfig: getPublicWorkspaceConfig(),
      });
    }
    if (routeKey === "PUT /api/admin/security-policy") {
      requireOwner(user, "Only the owner can update security settings.");
      const body = await readJson(req);
      return sendJson(res, 200, {
        message: "Security policy updated successfully.",
        securityPolicy: updateSecurityPolicy(body, user.fullName),
        workspaceConfig: getPublicWorkspaceConfig(),
      });
    }
    if (routeKey === "PUT /api/admin/compliance-profile") {
      requireOwner(user, "Only the owner can update compliance settings.");
      const body = await readJson(req);
      return sendJson(res, 200, {
        message: "Compliance profile updated successfully.",
        complianceProfile: updateComplianceProfile(body, user.fullName),
        workspaceConfig: getPublicWorkspaceConfig(),
      });
    }
    if (routeKey === "POST /api/admin/backups") {
      requireOwner(user, "Only the owner can create backup snapshots.");
      const body = await readJson(req);
      return sendJson(res, 201, {
        message: "Backup snapshot created successfully.",
        backup: createBackupSnapshot(optionalText(body.reason) || "manual-backup", user.fullName),
        backups: getOwnerControlCenter().backups,
      });
    }
    if (routeKey === "POST /api/admin/backups/restore") {
      requireOwner(user, "Only the owner can restore backup snapshots.");
      const body = await readJson(req);
      const restore = restoreBackupSnapshot(body.fileName, user.fullName);
      destroySession(req, res);
      return sendJson(res, 200, {
        message: "Backup restored successfully. Please sign in again to continue.",
        restore,
        requiresRelogin: true,
      });
    }
    if (routeKey === "GET /api/admin/backups/download") {
      requireOwner(user, "Only the owner can download backup snapshots.");
      const backup = getBackupSnapshot(url.searchParams.get("fileName"));
      const body = JSON.stringify(backup.snapshot, null, 2);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Content-Disposition": `attachment; filename="${backup.fileName}"`,
      });
      return res.end(body);
    }
    if (routeKey === "POST /api/products") {
      requireOwner(user, "Only the owner can create products.");
      const body = await readJson(req);
      addOrStockInProduct({
        name: body.name,
        productCode: body.productCode,
        unitPrice: body.unitPrice,
        quantity: body.quantity,
        authorizedBy: optionalText(body.authorizedBy) || user.fullName,
      });
      return sendJson(res, 201, { message: "Inventory updated successfully." });
    }
    if (req.method === "PUT" && /^\/api\/products\/[^/]+$/.test(url.pathname)) {
      requireOwner(user, "Only the owner can edit product details.");
      const productId = decodeURIComponent(url.pathname.split("/").pop());
      const body = await readJson(req);
      updateProductDetails({
        productId,
        name: body.name,
        productCode: body.productCode,
        unitPrice: body.unitPrice,
      });
      return sendJson(res, 200, { message: "Product updated successfully." });
    }
    if (req.method === "POST" && /^\/api\/products\/[^/]+\/stock$/.test(url.pathname)) {
      requireOwner(user, "Only the owner can adjust stock records.");
      const parts = url.pathname.split("/");
      const productId = decodeURIComponent(parts[3]);
      const body = await readJson(req);
      adjustProductStock({
        productId,
        quantity: body.quantity,
        actionType: body.actionType,
        authorizedBy: optionalText(body.authorizedBy) || user.fullName,
      });
      return sendJson(res, 200, { message: "Stock updated successfully." });
    }
    if (routeKey === "POST /api/sales") {
      const body = await readJson(req);
      return sendJson(res, 201, {
        message: "Sale completed successfully.",
        sale: createSale({
          customerName: body.customerName,
          phoneNumber: body.phoneNumber,
          processedBy: optionalText(body.processedBy) || user.fullName,
          items: body.items,
          payments: body.payments,
        }),
      });
    }
    if (routeKey === "POST /api/credits/pay") {
      const body = await readJson(req);
      return sendJson(res, 200, {
        message: "Debt payment processed successfully.",
        debtPayment: createDebtPayment({
          customerName: body.customerName,
          payments: body.payments,
        }),
      });
    }
    if (routeKey === "GET /api/reports/daily") {
      return sendJson(res, 200, buildReport("daily", url.searchParams.get("date")));
    }
    if (routeKey === "GET /api/reports/weekly") {
      return sendJson(res, 200, buildReport("weekly", url.searchParams.get("date")));
    }
    if (routeKey === "GET /api/reports/monthly") {
      return sendJson(res, 200, buildReport("monthly", url.searchParams.get("date")));
    }
    if (routeKey === "GET /api/reports/annual") {
      return sendJson(res, 200, buildReport("annual", url.searchParams.get("date")));
    }

    if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
      return serveStatic(url.pathname, res);
    }

    return sendError(res, 404, "Not found.");
  } catch (error) {
    if (error && typeof error.statusCode === "number") {
      return sendError(res, error.statusCode, error.message || "Request denied.");
    }
    const message = error instanceof Error ? error.message : "Something went wrong on the server.";
    console.error(error);
    return sendError(res, 500, message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`BENJOJI app running on http://${HOST}:${PORT}`);
});
