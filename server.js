const fs = require("node:fs");
const http = require("node:http");
const { URL } = require("node:url");
const { ROOT_DATA_DIR, createWorkspace, getBusinessName, getWorkspaceSummary, listWorkspaceSummaries } = require("./lib/workspace-db");
const {
  beginLogin,
  completeSecondFactorLogin,
  createUser,
  destroySession,
  getCurrentUser,
  getUserCount,
  getWorkspaceKey,
  loginUser,
  resolveWorkspaceKey,
  verifyUserAccess,
} = require("./lib/workspace-auth");
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
} = require("./lib/workspace-business");
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
} = require("./lib/workspace-control");
const { readJson, sendError, sendJson, serveStatic } = require("./lib/http");
const { normalizeRole, optionalText, requireText } = require("./lib/utils");

// Keep localhost for normal laptop use, but open up in production hosting.
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const PORT = Number(process.env.PORT || 3000);

function ownerOnly(user, message = "Only the owner can perform this action.") {
  if (!user || user.role !== "OWNER") {
    const error = new Error(message);
    error.statusCode = 403;
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const route = `${req.method} ${url.pathname}`;
    const isApiCall = url.pathname.startsWith("/api/");

    if (route === "GET /api/bootstrap") {
      const user = getCurrentUser(req);
      const workspaceKey = user?.workspaceKey || getWorkspaceKey(req);
      const workspaces = listWorkspaceSummaries();
      const activeWorkspace = workspaceKey ? getWorkspaceSummary(workspaceKey) : null;
      return sendJson(res, 200, {
        hasUsers: workspaces.some((workspace) => workspace.hasUsers),
        hasWorkspaces: workspaces.length > 0,
        workspaces,
        activeWorkspace,
        businessName: activeWorkspace ? getBusinessName(activeWorkspace.workspaceKey) : "",
        workspaceConfig: activeWorkspace ? getPublicWorkspaceConfig(activeWorkspace.workspaceKey) : null,
        user,
      });
    }

    if (route === "GET /api/health") {
      return sendJson(res, 200, {
        status: "ok",
        product: "Benjoji Business Suite",
        host: HOST,
        port: PORT,
        environment: process.env.NODE_ENV || "development",
        storageReady: fs.existsSync(ROOT_DATA_DIR),
        dataRoot: ROOT_DATA_DIR,
        workspaceCount: listWorkspaceSummaries().length,
        time: new Date().toISOString(),
      });
    }

    if (route === "POST /api/auth/register") {
      const body = await readJson(req);
      if (body.password !== body.confirmPassword) {
        return sendError(res, 400, "Passwords do not match.");
      }
      if ((body.pin || body.confirmPin) && body.pin !== body.confirmPin) {
        return sendError(res, 400, "PIN entries do not match.");
      }

      const role = "OWNER";
      const requiresPin =
        ["OWNER_ONLY", "ALL_USERS"].includes(String(body.secondFactorMode || "").toUpperCase());
      if (requiresPin && !body.pin) {
        return sendError(res, 400, "This security policy requires a 6-digit PIN for the owner account.");
      }

      const workspace = createWorkspace({
        businessName: requireText(body.businessName, "Business name"),
        workspaceKey: optionalText(body.workspaceKey),
      });
      const createdUser = createUser(workspace.workspaceKey, {
        fullName: body.fullName,
        username: body.username,
        email: body.email,
        password: body.password,
        pin: body.pin,
        role,
      });
      configureInitialWorkspace(workspace.workspaceKey, body, body.fullName || body.username || "Owner");
      const loggedInUser = loginUser(req, res, {
        workspaceKey: workspace.workspaceKey,
        username: body.username,
        password: body.password,
        authMode: "password",
      });

      const workspaceSummary = getWorkspaceSummary(workspace.workspaceKey);
      return sendJson(res, 201, {
        message: "Workspace created successfully.",
        workspace: workspaceSummary,
        user: loggedInUser || createdUser,
      });
    }

    if (route === "POST /api/auth/register-user") {
      const currentUser = getCurrentUser(req);
      if (!currentUser) {
        return sendError(res, 401, "Please log in to continue.");
      }
      ownerOnly(currentUser, "Only the owner can create additional accounts.");
      const body = await readJson(req);
      if (body.password !== body.confirmPassword) {
        return sendError(res, 400, "Passwords do not match.");
      }
      if ((body.pin || body.confirmPin) && body.pin !== body.confirmPin) {
        return sendError(res, 400, "PIN entries do not match.");
      }

      const role = normalizeRole(body.role);
      const requiresPin = requiresSecondFactorForRole(currentUser.workspaceKey, role);
      if (requiresPin && !body.pin) {
        return sendError(res, 400, "This security policy requires a 6-digit PIN for the selected account.");
      }

      const createdUser = createUser(currentUser.workspaceKey, {
        fullName: body.fullName,
        username: body.username,
        email: body.email,
        password: body.password,
        pin: body.pin,
        role,
      });
      return sendJson(res, 201, {
        message: "Account created successfully.",
        user: createdUser,
      });
    }

    if (route === "POST /api/auth/login") {
      const body = await readJson(req);
      const result = beginLogin(req, res, body);
      return sendJson(res, 200, {
        message: result.requiresSecondFactor ? "Second authentication step required." : "Login successful.",
        ...result,
        businessName: getBusinessName(result.workspaceKey),
      });
    }

    if (route === "POST /api/auth/login/verify-second-factor") {
      const body = await readJson(req);
      const user = completeSecondFactorLogin(req, res, body);
      return sendJson(res, 200, { message: "Login successful.", user, businessName: getBusinessName(user.workspaceKey) });
    }

    if (route === "POST /api/auth/verify") {
      const currentUser = getCurrentUser(req);
      if (!currentUser) {
        return sendError(res, 401, "Please log in to continue.");
      }
      const body = await readJson(req);
      try {
        verifyUserAccess({
          workspaceKey: currentUser.workspaceKey,
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

    if (route === "POST /api/auth/logout") {
      destroySession(req, res);
      return sendJson(res, 200, { message: "Logged out." });
    }

    const user = getCurrentUser(req);
    if (isApiCall && !user) {
      return sendError(res, 401, "Please log in to continue.");
    }

    const workspaceKey = user?.workspaceKey;

    if (route === "GET /api/dashboard") {
      return sendJson(res, 200, getDashboardSummary(workspaceKey));
    }
    if (route === "GET /api/products") {
      return sendJson(res, 200, { products: listProducts(workspaceKey) });
    }
    if (route === "GET /api/stock") {
      return sendJson(res, 200, { stockRecords: listStockRecords(workspaceKey) });
    }
    if (route === "GET /api/sales") {
      return sendJson(res, 200, { sales: listSales(workspaceKey) });
    }
    if (route === "GET /api/credits") {
      return sendJson(res, 200, { credits: listCredits(workspaceKey), openCredits: listOpenCredits(workspaceKey) });
    }
    if (route === "GET /api/accounting") {
      return sendJson(res, 200, buildAccountingSummary(workspaceKey));
    }
    if (route === "GET /api/payments") {
      return sendJson(res, 200, { paymentLedger: listPaymentLedger(workspaceKey) });
    }
    if (route === "GET /api/users") {
      if (user.role !== "OWNER") {
        return sendError(res, 403, "Only the owner can access this area.");
      }
      return sendJson(res, 200, { users: listUsers(workspaceKey) });
    }
    if (route === "GET /api/admin/control-center") {
      ownerOnly(user, "Only the owner can access the control center.");
      return sendJson(res, 200, getOwnerControlCenter(workspaceKey));
    }
    if (route === "PUT /api/admin/business-profile") {
      ownerOnly(user, "Only the owner can update business profile settings.");
      const body = await readJson(req);
      return sendJson(res, 200, {
        message: "Business profile updated successfully.",
        businessProfile: updateBusinessProfile(workspaceKey, body, user.fullName),
        workspaceSummary: getWorkspaceSummary(workspaceKey),
        workspaceConfig: getPublicWorkspaceConfig(workspaceKey),
      });
    }
    if (route === "PUT /api/admin/receipt-profile") {
      ownerOnly(user, "Only the owner can update receipt settings.");
      const body = await readJson(req);
      return sendJson(res, 200, {
        message: "Receipt profile updated successfully.",
        receiptProfile: updateReceiptProfile(workspaceKey, body, user.fullName),
        workspaceConfig: getPublicWorkspaceConfig(workspaceKey),
      });
    }
    if (route === "PUT /api/admin/payment-profile") {
      ownerOnly(user, "Only the owner can update payment routing.");
      const body = await readJson(req);
      return sendJson(res, 200, {
        message: "Payment routing updated successfully.",
        paymentProfile: updatePaymentProfile(workspaceKey, body, user.fullName),
        workspaceConfig: getPublicWorkspaceConfig(workspaceKey),
      });
    }
    if (route === "PUT /api/admin/security-policy") {
      ownerOnly(user, "Only the owner can update security settings.");
      const body = await readJson(req);
      return sendJson(res, 200, {
        message: "Security policy updated successfully.",
        securityPolicy: updateSecurityPolicy(workspaceKey, body, user.fullName),
        workspaceConfig: getPublicWorkspaceConfig(workspaceKey),
      });
    }
    if (route === "PUT /api/admin/compliance-profile") {
      ownerOnly(user, "Only the owner can update compliance settings.");
      const body = await readJson(req);
      return sendJson(res, 200, {
        message: "Compliance profile updated successfully.",
        complianceProfile: updateComplianceProfile(workspaceKey, body, user.fullName),
        workspaceConfig: getPublicWorkspaceConfig(workspaceKey),
      });
    }
    if (route === "POST /api/admin/backups") {
      ownerOnly(user, "Only the owner can create backup snapshots.");
      const body = await readJson(req);
      return sendJson(res, 201, {
        message: "Backup snapshot created successfully.",
        backup: createBackupSnapshot(workspaceKey, optionalText(body.reason) || "manual-backup", user.fullName),
        backups: getOwnerControlCenter(workspaceKey).backups,
      });
    }
    if (route === "POST /api/admin/backups/restore") {
      ownerOnly(user, "Only the owner can restore backup snapshots.");
      const body = await readJson(req);
      const restore = restoreBackupSnapshot(workspaceKey, body.fileName, user.fullName);
      destroySession(req, res);
      return sendJson(res, 200, {
        message: "Backup restored successfully. Please sign in again to continue.",
        restore,
        requiresRelogin: true,
      });
    }
    if (route === "GET /api/admin/backups/download") {
      ownerOnly(user, "Only the owner can download backup snapshots.");
      const backup = getBackupSnapshot(workspaceKey, url.searchParams.get("fileName"));
      const body = JSON.stringify(backup.snapshot, null, 2);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "Content-Disposition": `attachment; filename="${backup.fileName}"`,
      });
      return res.end(body);
    }
    if (route === "POST /api/products") {
      ownerOnly(user, "Only the owner can create products.");
      const body = await readJson(req);
      addOrStockInProduct(workspaceKey, {
        name: body.name,
        productCode: body.productCode,
        unitPrice: body.unitPrice,
        quantity: body.quantity,
        authorizedBy: optionalText(body.authorizedBy) || user.fullName,
      });
      return sendJson(res, 201, { message: "Inventory updated successfully." });
    }
    if (req.method === "PUT" && /^\/api\/products\/[^/]+$/.test(url.pathname)) {
      ownerOnly(user, "Only the owner can edit product details.");
      const productId = decodeURIComponent(url.pathname.split("/").pop());
      const body = await readJson(req);
      updateProductDetails(workspaceKey, {
        productId,
        name: body.name,
        productCode: body.productCode,
        unitPrice: body.unitPrice,
      });
      return sendJson(res, 200, { message: "Product updated successfully." });
    }
    if (req.method === "POST" && /^\/api\/products\/[^/]+\/stock$/.test(url.pathname)) {
      ownerOnly(user, "Only the owner can adjust stock records.");
      const parts = url.pathname.split("/");
      const productId = decodeURIComponent(parts[3]);
      const body = await readJson(req);
      adjustProductStock(workspaceKey, {
        productId,
        quantity: body.quantity,
        actionType: body.actionType,
        authorizedBy: optionalText(body.authorizedBy) || user.fullName,
      });
      return sendJson(res, 200, { message: "Stock updated successfully." });
    }
    if (route === "POST /api/sales") {
      const body = await readJson(req);
      return sendJson(res, 201, {
        message: "Sale completed successfully.",
        sale: createSale(workspaceKey, {
          customerName: body.customerName,
          phoneNumber: body.phoneNumber,
          processedBy: optionalText(body.processedBy) || user.fullName,
          items: body.items,
          payments: body.payments,
        }),
      });
    }
    if (route === "POST /api/credits/pay") {
      const body = await readJson(req);
      return sendJson(res, 200, {
        message: "Debt payment processed successfully.",
        debtPayment: createDebtPayment(workspaceKey, {
          customerName: body.customerName,
          payments: body.payments,
        }),
      });
    }
    if (route === "GET /api/reports/daily") {
      return sendJson(res, 200, buildReport(workspaceKey, "daily", url.searchParams.get("date")));
    }
    if (route === "GET /api/reports/weekly") {
      return sendJson(res, 200, buildReport(workspaceKey, "weekly", url.searchParams.get("date")));
    }
    if (route === "GET /api/reports/monthly") {
      return sendJson(res, 200, buildReport(workspaceKey, "monthly", url.searchParams.get("date")));
    }
    if (route === "GET /api/reports/annual") {
      return sendJson(res, 200, buildReport(workspaceKey, "annual", url.searchParams.get("date")));
    }

    if (req.method === "GET" && !isApiCall) {
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

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Benjoji Business Suite running on http://${HOST}:${PORT}`);
  });
}

module.exports = server;
