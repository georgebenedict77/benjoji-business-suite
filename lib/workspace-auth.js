const crypto = require("node:crypto");
const { getWorkspaceDb, normalizeWorkspaceKey, workspaceExists } = require("./workspace-db");
const { createHttpError, optionalText, requirePassword, requirePin, requireText, requireUsername, normalizeRole, timestampNow } = require("./utils");
const { getSecurityPolicy, requiresSecondFactorForRole, recordAutomaticBackup } = require("./workspace-control");

const SESSION_COOKIE = "benjoji_session";
const WORKSPACE_COOKIE = "benjoji_workspace";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const LOGIN_CHALLENGE_TTL_MS = 1000 * 60 * 10;

function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(secret, salt, 64).toString("hex");
  return { hash, salt };
}

function verifySecret(secret, storedHash, storedSalt) {
  const hash = crypto.scryptSync(secret, storedSalt, 64);
  return crypto.timingSafeEqual(hash, Buffer.from(storedHash, "hex"));
}

function toPublicUser(row, workspaceKey) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    email: row.email,
    role: row.role,
    status: row.status || "ACTIVE",
    hasPin: Boolean(row.pin_hash && row.pin_salt),
    createdAt: row.created_at,
    workspaceKey,
  };
}

function resolveWorkspaceKey(value) {
  return normalizeWorkspaceKey(requireText(value, "Workspace ID"), "workspace");
}

function getWorkspaceKey(req) {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${WORKSPACE_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(WORKSPACE_COOKIE.length + 1)) : "";
}

function openWorkspace(workspaceKey) {
  const wsKey = resolveWorkspaceKey(workspaceKey);
  if (!workspaceExists(wsKey)) {
    throw createHttpError("That workspace does not exist yet.", 404);
  }
  return {
    workspaceKey: wsKey,
    db: getWorkspaceDb(wsKey),
  };
}

function getUserCount(workspaceKey) {
  const { db } = openWorkspace(workspaceKey);
  return Number(db.prepare("SELECT COUNT(*) AS value FROM users").get().value || 0);
}

function getUserByUsername(workspaceKey, username) {
  const { db } = openWorkspace(workspaceKey);
  return db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)").get(username);
}

function getUserById(workspaceKey, id) {
  const { db } = openWorkspace(workspaceKey);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function verifyUserAccess(options) {
  const workspaceKey = resolveWorkspaceKey(options.workspaceKey);
  const loginMode = optionalText(options.authMode || "password").toLowerCase() === "pin" ? "pin" : "password";
  const user = getUserByUsername(workspaceKey, requireText(options.username, "Username"));

  if (!user) {
    throw createHttpError(loginMode === "pin" ? "Invalid workspace, username, or PIN." : "Invalid workspace, username, or password.", 401);
  }

  ensureUserCanAuthenticate(workspaceKey, user);

  if (loginMode === "pin") {
    if (!user.pin_hash || !user.pin_salt) {
      throw createHttpError("This account does not have a PIN yet. Use password verification.", 400);
    }
    if (!verifySecret(requirePin(options.pin), user.pin_hash, user.pin_salt)) {
      throw createHttpError("Invalid workspace, username, or PIN.", 401);
    }
  } else if (!verifySecret(requireText(options.password, "Password"), user.password_hash, user.password_salt)) {
    throw createHttpError("Invalid workspace, username, or password.", 401);
  }

  if (options.requiredRole && user.role !== options.requiredRole) {
    throw createHttpError(`This action requires ${options.requiredRole.toLowerCase()} access.`, 403);
  }

  return { workspaceKey, user };
}

function createUser(workspaceKey, { fullName, username, email, password, pin, role }) {
  const wsKey = resolveWorkspaceKey(workspaceKey);
  const db = getWorkspaceDb(wsKey);
  const fullNameText = requireText(fullName, "Full name");
  const usernameText = requireUsername(username);
  const emailText = optionalText(email);
  const passwordText = requirePassword(password);
  const pinText = optionalText(pin) ? requirePin(pin) : "";
  const roleText = normalizeRole(role);

  const existing = db.prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?)").get(usernameText);
  if (existing) {
    throw createHttpError("That username is already in use in this workspace.", 409);
  }

  const { hash, salt } = hashSecret(passwordText);
  const pinSecret = pinText ? hashSecret(pinText) : { hash: null, salt: null };
  db.prepare(`
    INSERT INTO users (full_name, username, email, password_hash, password_salt, pin_hash, pin_salt, role, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
  `).run(fullNameText, usernameText, emailText, hash, salt, pinSecret.hash, pinSecret.salt, roleText, timestampNow().iso);

  recordAutomaticBackup(wsKey, "user-created", fullNameText);
  return toPublicUser(getUserByUsername(wsKey, usernameText), wsKey);
}

function getSessionId(req) {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : null;
}

function appendCookie(res, cookie) {
  const existing = res.getHeader("Set-Cookie");
  const next = existing ? (Array.isArray(existing) ? [...existing, cookie] : [existing, cookie]) : [cookie];
  res.setHeader("Set-Cookie", next);
}

function shouldUseSecureCookies(req) {
  if (process.env.BENJOJI_SECURE_COOKIES === "true") {
    return true;
  }
  if (process.env.BENJOJI_SECURE_COOKIES === "false") {
    return false;
  }
  if (req.socket?.encrypted) {
    return true;
  }

  // Only trust proxy headers if we turned that on ourselves.
  const trustProxy = process.env.BENJOJI_TRUST_PROXY === "true";
  if (!trustProxy) {
    return false;
  }

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return forwardedProto === "https";
}

function buildCookieAttributes(req, expiresAt) {
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const attributes = [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (shouldUseSecureCookies(req)) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function setWorkspaceCookie(req, res, workspaceKey, expiresAt) {
  const cookie = `${WORKSPACE_COOKIE}=${encodeURIComponent(workspaceKey)}; ${buildCookieAttributes(req, expiresAt)}`;
  appendCookie(res, cookie);
}

function clearWorkspaceCookie(req, res) {
  appendCookie(
    res,
    `${WORKSPACE_COOKIE}=; ${buildCookieAttributes(req, new Date(0))}`,
  );
}

function setSessionCookie(req, res, sessionId, expiresAt) {
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; ${buildCookieAttributes(req, expiresAt)}`;
  appendCookie(res, cookie);
}

function clearSessionCookie(req, res) {
  appendCookie(
    res,
    `${SESSION_COOKIE}=; ${buildCookieAttributes(req, new Date(0))}`,
  );
}

function createSession(req, res, workspaceKey, userId) {
  const db = getWorkspaceDb(workspaceKey);
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  db.prepare(`
    INSERT INTO sessions (id, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, userId, now.toISOString(), expiresAt.toISOString());
  db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?").run(now.toISOString(), userId);

  setWorkspaceCookie(req, res, workspaceKey, expiresAt);
  setSessionCookie(req, res, sessionId, expiresAt);
}

function destroySession(req, res) {
  const workspaceKey = getWorkspaceKey(req);
  const sessionId = getSessionId(req);
  if (workspaceKey && sessionId && workspaceExists(workspaceKey)) {
    const db = getWorkspaceDb(workspaceKey);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }
  clearSessionCookie(req, res);
  clearWorkspaceCookie(req, res);
}

function getCurrentUser(req) {
  const workspaceKey = getWorkspaceKey(req);
  const sessionId = getSessionId(req);
  if (!workspaceKey || !sessionId || !workspaceExists(workspaceKey)) {
    return null;
  }

  const db = getWorkspaceDb(workspaceKey);
  const row = db.prepare(`
    SELECT sessions.expires_at, users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ?
  `).get(sessionId);

  if (!row) {
    return null;
  }

  if (Date.parse(row.expires_at) <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return null;
  }

  return toPublicUser(row, workspaceKey);
}

function loginUser(req, res, options) {
  const { workspaceKey, user } = verifyUserAccess(options);
  createSession(req, res, workspaceKey, user.id);
  return toPublicUser(user, workspaceKey);
}

function beginLogin(req, res, options) {
  const workspaceKey = resolveWorkspaceKey(options.workspaceKey);
  const db = openWorkspace(workspaceKey).db;
  const username = requireText(options.username, "Username");
  const user = db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)").get(username);
  if (!user) {
    throw createHttpError("Invalid workspace, username, or password.", 401);
  }

  try {
    ensureUserCanAuthenticate(workspaceKey, user);
    if (!verifySecret(requireText(options.password, "Password"), user.password_hash, user.password_salt)) {
      handleFailedAuthentication(workspaceKey, user);
      throw createHttpError("Invalid workspace, username, or password.", 401);
    }
  } catch (error) {
    if (error && /locked|disabled|inactive/i.test(error.message || "")) {
      throw error;
    }
    if (!/Invalid workspace, username, or password\./.test(error.message || "")) {
      handleFailedAuthentication(workspaceKey, user);
    }
    throw error;
  }

  resetFailedAuthentication(workspaceKey, user.id);

  if (requiresSecondFactorForRole(workspaceKey, user.role)) {
    if (!user.pin_hash || !user.pin_salt) {
      throw createHttpError("This account requires a security PIN before two-step sign-in can be completed. Ask the owner to update the account security settings.", 400);
    }
    const challengeId = createLoginChallenge(workspaceKey, user.id);
    const expiresAt = new Date(Date.now() + LOGIN_CHALLENGE_TTL_MS);
    setWorkspaceCookie(req, res, workspaceKey, expiresAt);
    return {
      requiresSecondFactor: true,
      challengeId,
      user: toPublicUser(user, workspaceKey),
      workspaceKey,
    };
  }

  createSession(req, res, workspaceKey, user.id);
  return {
    requiresSecondFactor: false,
    user: toPublicUser(user, workspaceKey),
    workspaceKey,
  };
}

function completeSecondFactorLogin(req, res, { challengeId, pin, workspaceKey }) {
  const wsKey = resolveWorkspaceKey(workspaceKey);
  const challenge = consumeLoginChallenge(wsKey, requireText(challengeId, "Login challenge"));
  const user = getUserById(wsKey, challenge.user_id);
  if (!user) {
    throw createHttpError("This sign-in request is no longer available. Start again.", 410);
  }
  ensureUserCanAuthenticate(wsKey, user);

  if (!verifySecret(requirePin(pin), user.pin_hash, user.pin_salt)) {
    handleFailedAuthentication(wsKey, user);
    throw createHttpError("Invalid security PIN.", 401);
  }

  resetFailedAuthentication(wsKey, user.id);
  createSession(req, res, wsKey, user.id);
  return toPublicUser(user, wsKey);
}

function createLoginChallenge(workspaceKey, userId) {
  const db = getWorkspaceDb(workspaceKey);
  clearExpiredLoginChallenges(workspaceKey);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOGIN_CHALLENGE_TTL_MS);
  const challengeId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO login_challenges (id, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(challengeId, userId, now.toISOString(), expiresAt.toISOString());
  return challengeId;
}

function consumeLoginChallenge(workspaceKey, challengeId) {
  const db = getWorkspaceDb(workspaceKey);
  clearExpiredLoginChallenges(workspaceKey);
  const row = db.prepare("SELECT * FROM login_challenges WHERE id = ?").get(challengeId);
  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    db.prepare("DELETE FROM login_challenges WHERE id = ?").run(challengeId);
    throw createHttpError("This sign-in stage has expired. Start again.", 410);
  }
  db.prepare("DELETE FROM login_challenges WHERE id = ?").run(challengeId);
  return row;
}

function clearExpiredLoginChallenges(workspaceKey) {
  const db = getWorkspaceDb(workspaceKey);
  db.prepare("DELETE FROM login_challenges WHERE expires_at <= ?").run(new Date().toISOString());
}

function ensureUserCanAuthenticate(workspaceKey, user) {
  if ((user.status || "ACTIVE") !== "ACTIVE") {
    throw createHttpError("This account is currently inactive. Contact the business owner.", 403);
  }
  if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
    const until = new Date(user.locked_until).toLocaleString("en-KE");
    throw createHttpError(`This account is temporarily locked. Try again after ${until}.`, 423);
  }
}

function handleFailedAuthentication(workspaceKey, user) {
  const policy = getSecurityPolicy(workspaceKey);
  const db = getWorkspaceDb(workspaceKey);
  const failedAttempts = Number(user.failed_attempts || 0) + 1;
  const shouldLock = failedAttempts >= Number(policy.loginAttemptLimit || 5);
  const lockedUntil = shouldLock
    ? new Date(Date.now() + Number(policy.lockMinutes || 15) * 60 * 1000).toISOString()
    : null;
  db.prepare("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?").run(
    failedAttempts,
    lockedUntil,
    user.id,
  );
}

function resetFailedAuthentication(workspaceKey, userId) {
  const db = getWorkspaceDb(workspaceKey);
  db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?").run(userId);
}

module.exports = {
  beginLogin,
  clearSessionCookie,
  completeSecondFactorLogin,
  createSession,
  createUser,
  destroySession,
  getCurrentUser,
  getUserById,
  getUserByUsername,
  getUserCount,
  getWorkspaceKey,
  loginUser,
  publicUser: toPublicUser,
  resolveWorkspaceKey,
  verifyUserAccess,
};
