const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const HOST = "127.0.0.1";
const PORT = 3100 + Math.floor(Math.random() * 500);
const BASE_URL = `http://${HOST}:${PORT}`;
const smokeDataDir = path.join(os.tmpdir(), `benjoji-http-smoke-${Date.now()}`);
const SMALL_LOGO_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnXlKsAAAAASUVORK5CYII=";

fs.rmSync(smokeDataDir, { recursive: true, force: true });
fs.mkdirSync(smokeDataDir, { recursive: true });

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createCookieJar() {
  let cookies = [];
  return {
    header() {
      return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    },
    update(response) {
      const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
      for (const cookieLine of setCookie) {
        const [pair] = cookieLine.split(";");
        const [name, value] = pair.split("=");
        if (!name) continue;
        cookies = cookies.filter((cookie) => cookie.name !== name);
        if (value) {
          cookies.push({ name, value });
        }
      }
    },
  };
}

async function api(pathname, options = {}, jar) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const cookieHeader = jar?.header();
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  jar?.update(response);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`${pathname} failed: ${data.error || response.statusText}`);
  }
  return data;
}

async function apiExpectError(pathname, options = {}, jar, expectedStatus, expectedMessageFragment) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const cookieHeader = jar?.header();
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  jar?.update(response);
  const data = await response.json();
  assert(response.status === expectedStatus, `Expected ${pathname} to fail with ${expectedStatus}, received ${response.status}.`);
  if (expectedMessageFragment) {
    assert(String(data.error || "").includes(expectedMessageFragment), `Expected ${pathname} error to include "${expectedMessageFragment}".`);
  }
  return data;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth() {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }
    await wait(250);
  }
  throw new Error("Server did not become healthy in time.");
}

async function main() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      BENJOJI_DATA_DIR: smokeDataDir,
      HOST,
      PORT: String(PORT),
    },
    stdio: "ignore",
  });

  try {
    await waitForHealth();

    const ownerJar = createCookieJar();
    const secondaryJar = createCookieJar();

    const initialBootstrap = await api("/api/bootstrap");
    assert(initialBootstrap.hasWorkspaces === false, "Expected a clean server to start with no workspaces.");

    const firstWorkspace = await api("/api/auth/register", {
      method: "POST",
      body: {
        businessName: "Alpha Retail",
        workspaceKey: "alpha-retail",
        legalName: "Alpha Retail Limited",
        branchName: "CBD",
        fullName: "Alice Owner",
        username: "alice",
        email: "alice@alpha.test",
        password: "SecurePass123!",
        confirmPassword: "SecurePass123!",
        pin: "123456",
        confirmPin: "123456",
        secondFactorMode: "NONE",
        autoBackupEnabled: true,
        enabledMethods: ["Cash", "M-Pesa", "Card"],
        accepted: true,
        acceptedBy: "Alice Owner",
      },
    }, ownerJar);
    assert(firstWorkspace.workspace.workspaceKey === "alpha-retail", "Expected the first workspace key to match the requested value.");

    const ownerBootstrap = await api("/api/bootstrap", {}, ownerJar);
    assert(ownerBootstrap.user?.workspaceKey === "alpha-retail", "Expected the owner session to stay inside the first workspace.");
    assert(ownerBootstrap.activeWorkspace?.businessName === "Alpha Retail", "Expected the active workspace to show the first business name.");

    const updatedBusinessProfile = await api("/api/admin/business-profile", {
      method: "PUT",
      body: {
        businessName: "Alpha Retail Group",
        legalName: "Alpha Retail Group Limited",
        branchName: "Westlands Flagship",
        logoDataUrl: SMALL_LOGO_DATA_URL,
        contactPhone: "0700000000",
        contactEmail: "hello@alpha.test",
        supportName: "Owner Desk",
      },
    }, ownerJar);
    assert(updatedBusinessProfile.businessProfile.logoDataUrl === SMALL_LOGO_DATA_URL, "Expected the business profile update to store the uploaded logo.");
    assert(updatedBusinessProfile.workspaceSummary.logoDataUrl === SMALL_LOGO_DATA_URL, "Expected workspace summary to reflect the uploaded business logo.");

    const brandedBootstrap = await api("/api/bootstrap", {}, ownerJar);
    assert(brandedBootstrap.activeWorkspace?.businessName === "Alpha Retail Group", "Expected bootstrap to reflect the updated business name.");
    assert(brandedBootstrap.activeWorkspace?.branchName === "Westlands Flagship", "Expected bootstrap to reflect the updated branch name.");
    assert(brandedBootstrap.activeWorkspace?.logoDataUrl === SMALL_LOGO_DATA_URL, "Expected bootstrap to reflect the updated workspace logo.");

    const paymentProfileUpdate = await api("/api/admin/payment-profile", {
      method: "PUT",
      body: {
        enabledMethods: ["Cash", "Card"],
        routes: {
          Cash: { label: "Front Register", accountName: "Till 1" },
          Card: { label: "Main POS Terminal", accountName: "Verifone Desk", accountReference: "CARD-1" },
        },
      },
    }, ownerJar);
    assert(paymentProfileUpdate.paymentProfile.enabledMethods.length === 2, "Expected payment routing update to keep only the selected payment methods enabled.");
    assert(paymentProfileUpdate.workspaceConfig.paymentProfile.enabledMethods.includes("Cash"), "Expected cash to remain available after payment routing update.");
    assert(!paymentProfileUpdate.workspaceConfig.paymentProfile.enabledMethods.includes("M-Pesa"), "Expected M-Pesa to be disabled after payment routing update.");
    await apiExpectError("/api/admin/payment-profile", {
      method: "PUT",
      body: {
        enabledMethods: [],
        routes: {},
      },
    }, ownerJar, 400, "Enable at least one payment method");

    await api("/api/admin/security-policy", {
      method: "PUT",
      body: {
        secondFactorMode: "OWNER_ONLY",
        loginAttemptLimit: 4,
        lockMinutes: 5,
        autoBackupEnabled: true,
        backupRetention: 8,
      },
    }, ownerJar);

    await api("/api/admin/compliance-profile", {
      method: "PUT",
      body: {
        accepted: true,
        acceptedBy: "Alice Owner",
        termsVersion: "v2.0",
        privacyVersion: "v2.0",
        backupPolicyVersion: "v2.0",
      },
    }, ownerJar);

    await api("/api/products", {
      method: "POST",
      body: {
        name: "Bread",
        productCode: "1111111111111",
        unitPrice: 75,
        quantity: 10,
      },
    }, ownerJar);

    const firstProducts = await api("/api/products", {}, ownerJar);
    assert(firstProducts.products.length === 1, "Expected the first workspace to contain one product.");
    const [bread] = firstProducts.products;

    await api("/api/auth/register-user", {
      method: "POST",
      body: {
        fullName: "Grace Staff",
        username: "grace",
        email: "grace@alpha.test",
        password: "SecurePass123!",
        confirmPassword: "SecurePass123!",
        pin: "654321",
        confirmPin: "654321",
        role: "STAFF",
      },
    }, ownerJar);

    const workspaceUsers = await api("/api/users", {}, ownerJar);
    assert(workspaceUsers.users.length === 2, "Expected owner-created staff account to stay inside the same workspace.");

    await api("/api/auth/logout", { method: "POST" }, ownerJar);
    await apiExpectError("/api/auth/login", {
      method: "POST",
      body: {
        workspaceKey: "alpha-retail",
        username: "alice",
        password: "WrongPass123!",
      },
    }, ownerJar, 401, "Invalid workspace, username, or password");

    const ownerChallenge = await api("/api/auth/login", {
      method: "POST",
      body: {
        workspaceKey: "alpha-retail",
        username: "alice",
        password: "SecurePass123!",
      },
    }, ownerJar);
    assert(ownerChallenge.requiresSecondFactor === true, "Expected owner login to require the configured second factor.");
    assert(Boolean(ownerChallenge.challengeId), "Expected owner login to return a second-factor challenge.");

    await api("/api/auth/login/verify-second-factor", {
      method: "POST",
      body: {
        workspaceKey: "alpha-retail",
        challengeId: ownerChallenge.challengeId,
        pin: "123456",
      },
    }, ownerJar);

    await apiExpectError("/api/sales", {
      method: "POST",
      body: {
        processedBy: "Alice Owner",
        items: [{ productId: bread.id, quantity: 1 }],
        payments: [{ paymentMethod: "M-Pesa", amount: 75 }],
      },
    }, ownerJar, 400, "is not enabled for this business");

    const secondWorkspace = await api("/api/auth/register", {
      method: "POST",
      body: {
        businessName: "Beta Pharmacy",
        workspaceKey: "beta-pharmacy",
        legalName: "Beta Pharmacy Limited",
        branchName: "Westlands",
        fullName: "Brian Owner",
        username: "brian",
        email: "brian@beta.test",
        password: "SecurePass123!",
        confirmPassword: "SecurePass123!",
        secondFactorMode: "NONE",
        autoBackupEnabled: true,
        enabledMethods: ["Cash", "Card"],
        accepted: true,
        acceptedBy: "Brian Owner",
      },
    }, secondaryJar);
    assert(secondWorkspace.workspace.workspaceKey === "beta-pharmacy", "Expected the second workspace key to match the requested value.");

    const secondProducts = await api("/api/products", {}, secondaryJar);
    assert(secondProducts.products.length === 0, "Expected the second workspace inventory to remain isolated from the first workspace.");

    await api("/api/auth/logout", { method: "POST" }, secondaryJar);

    await api("/api/auth/login", {
      method: "POST",
      body: {
        workspaceKey: "alpha-retail",
        username: "grace",
        password: "SecurePass123!",
      },
    }, ownerJar);

    await apiExpectError("/api/admin/control-center", {}, ownerJar, 403, "Only the owner can access the control center");
    await apiExpectError("/api/products", {
      method: "POST",
      body: {
        name: "Milk",
        productCode: "2222222222222",
        unitPrice: 120,
        quantity: 4,
      },
    }, ownerJar, 403, "Only the owner can create products");

    await api("/api/auth/logout", { method: "POST" }, ownerJar);

    const ownerChallengeAgain = await api("/api/auth/login", {
      method: "POST",
      body: {
        workspaceKey: "alpha-retail",
        username: "alice",
        password: "SecurePass123!",
      },
    }, ownerJar);
    const secondOwnerChallenge = await api("/api/auth/login/verify-second-factor", {
      method: "POST",
      body: {
        workspaceKey: "alpha-retail",
        challengeId: ownerChallengeAgain.challengeId,
        pin: "123456",
      },
    }, ownerJar);
    assert(secondOwnerChallenge.user?.username === "alice", "Expected owner second-factor login to complete successfully.");

    const completedSale = await api("/api/sales", {
      method: "POST",
      body: {
        processedBy: "Alice Owner",
        items: [{ productId: bread.id, quantity: 2 }],
        payments: [
          { paymentMethod: "Card", amount: 100, approvalMode: "POS Terminal", accountReference: "CARD-OK-1" },
          { paymentMethod: "Cash", amount: 50 },
        ],
      },
    }, ownerJar);
    assert(completedSale.sale.status === "PAID", "Expected the approved mixed payment sale to complete successfully.");

    const controlCenter = await api("/api/admin/control-center", {}, ownerJar);
    assert(controlCenter.businessProfile.logoDataUrl === SMALL_LOGO_DATA_URL, "Expected control center to preserve the updated business logo.");
    assert(controlCenter.paymentProfile.enabledMethods.join(",") === "Cash,Card", "Expected control center to preserve the updated payment method selection.");
    assert(controlCenter.securityPolicy.secondFactorMode === "OWNER_ONLY", "Expected control center to preserve the updated security policy.");
    assert(controlCenter.complianceProfile.termsVersion === "v2.0", "Expected control center to preserve the updated compliance profile.");

    const alphaProductsAgain = await api("/api/products", {}, ownerJar);
    assert(alphaProductsAgain.products.length === 1, "Expected the first workspace product list to remain intact after another workspace was created.");

    console.log("HTTP smoke test passed.");
    console.log(`Data dir: ${smokeDataDir}`);
    console.log(`Base URL: ${BASE_URL}`);
  } finally {
    child.kill();
    fs.rmSync(smokeDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
