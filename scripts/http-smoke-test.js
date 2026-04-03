const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const HOST = "127.0.0.1";
const PORT = 3100 + Math.floor(Math.random() * 500);
const BASE_URL = `http://${HOST}:${PORT}`;
const smokeDataDir = path.join(os.tmpdir(), `benjoji-http-smoke-${Date.now()}`);

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

    await api("/api/auth/register-user", {
      method: "POST",
      body: {
        fullName: "Grace Staff",
        username: "grace",
        email: "grace@alpha.test",
        password: "SecurePass123!",
        confirmPassword: "SecurePass123!",
        role: "STAFF",
      },
    }, ownerJar);

    const workspaceUsers = await api("/api/users", {}, ownerJar);
    assert(workspaceUsers.users.length === 2, "Expected owner-created staff account to stay inside the same workspace.");

    await api("/api/auth/logout", { method: "POST" }, ownerJar);

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
        username: "alice",
        password: "SecurePass123!",
      },
    }, ownerJar);

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
