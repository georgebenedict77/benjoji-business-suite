const crypto = require("node:crypto");
const { getWorkspaceDb, normalizeWorkspaceKey, workspaceExists } = require("./workspace-db");
const { optionalText, requirePassword, requirePin, requireText, requireUsername, normalizeRole, timestampNow } = require("./utils");
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

function publicUser(user, workspaceKey) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    fullName: user.full_name,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status || "ACTIVE",
    hasPin: Boolean(user.pin_hash && user.pin_salt),
    createdAt: user.created_at,
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

function getWorkspaceDbOrThrow(workspaceKey) {
  const safeKey = resolveWorkspaceKey(workspaceKey);
  if (!workspaceExists(safeKey)) {
    throw new Error("That workspace does not exist yet.");
  }
  return {
    workspaceKey: safeKey,
    db: getWorkspaceDb(safeKey),
  };
}

function getUserCount(workspaceKey) {
  const { db } = getWorkspaceDbOrThrow(workspaceKey);
  return Number(db.prepare("SELECT COUNT(*) AS value FROM users").get().value || 0);
}

function getUserByUsername(workspaceKey, username) {
  const { db } = getWorkspaceDbOrThrow(workspaceKey);
  return db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)").get(username);
}

function getUserById(workspaceKey, id) {
  const { db } = getWorkspaceDbOrThrow(workspaceKey);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function verifyUserAccess(options) {
  const workspaceKey = resolveWorkspaceKey(options.workspaceKey);
  const user = getUserByUsername(workspaceKey, requireText(options.username, "Username"));
  const authMode = optionalText(options.authMode || "password").toLowerCase() === "pin" ? "pin" : "password";

  if (!user) {
    throw new Error(authMode === "pin" ? "Invalid workspace, username, or PIN." : "Invalid workspace, username, or password.");
  }

  ensureUserCanAuthenticate(workspaceKey, user);

  if (authMode === "pin") {
    if (!user.pin_hash || !user.pin_salt) {
      throw new Error("This account does not have a PIN yet. Use password verification.");
    }
    if (!verifySecret(requirePin(options.pin), user.pin_hash, user.pin_salt)) {
      throw new Error("Invalid workspace, username, or PIN.");
    }
  } else if (!verifySecret(requireText(options.password, "Password"), user.password_hash, user.password_salt)) {
    throw new Error("Invalid workspace, username, or password.");
  }

  if (options.requiredRole && user.role !== options.requiredRole) {
    throw new Error(`This action requires ${options.requiredRole.toLowerCase()} access.`);
  }

  return { workspaceKey, user };
}

function createUser(workspaceKey, { fullName, username, email, password, pin, role }) {
  const safeWorkspaceKey = resolveWorkspaceKey(workspaceKey);
  const db = getWorkspaceDb(safeWorkspaceKey);
  const safeFullName = requireText(fullName, "Full name");
  const safeUsername = requireUsername(username);
  const safeEmail = optionalText(email);
  const safePassword = requirePassword(password);
  const safePin = optionalText(pin) ? requirePin(pin) : "";
  const safeRole = normalizeRole(role);

  const existing = db.prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?)").get(safeUsername);
  if (existing) {
    throw new Error("That username is already in use in this workspace.");
  }

  const { hash, salt } = hashSecret(safePassword);
  const pinSecret = safePin ? hashSecret(safePin) : { hash: null, salt: null };
  db.prepare(`
    INSERT INTO users (full_name, username, email, password_hash, password_salt, pin_hash, pin_salt, role, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
  `).run(safeFullName, safeUsername, safeEmail, hash, salt, pinSecret.hash, pinSecret.salt, safeRole, timestampNow().iso);

  recordAutomaticBackup(safeWorkspaceKey, "user-created", safeFullName);
  return publicUser(getUserByUsername(safeWorkspaceKey, safeUsername), safeWorkspaceKey);
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

function setWorkspaceCookie(res, workspaceKey, expiresAt) {
  const cookie = `${WORKSPACE_COOKIE}=${encodeURIComponent(workspaceKey)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
  appendCookie(res, cookie);
}

function clearWorkspaceCookie(res) {
  appendCookie(res, `${WORKSPACE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

function setSessionCookie(res, sessionId, expiresAt) {
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
  appendCookie(res, cookie);
}

function clearSessionCookie(res) {
  appendCookie(res, `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

function createSession(res, workspaceKey, userId) {
  const db = getWorkspaceDb(workspaceKey);
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  db.prepare(`
    INSERT INTO sessions (id, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, userId, now.toISOString(), expiresAt.toISOString());
  db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?").run(now.toISOString(), userId);

  setWorkspaceCookie(res, workspaceKey, expiresAt);
  setSessionCookie(res, sessionId, expiresAt);
}

function destroySession(req, res) {
  const workspaceKey = getWorkspaceKey(req);
  const sessionId = getSessionId(req);
  if (workspaceKey && sessionId && workspaceExists(workspaceKey)) {
    const db = getWorkspaceDb(workspaceKey);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }
  clearSessionCookie(res);
  clearWorkspaceCookie(res);
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

  return publicUser(row, workspaceKey);
}

function loginUser(res, options) {
  const { workspaceKey, user } = verifyUserAccess(options);
  createSession(res, workspaceKey, user.id);
  return publicUser(user, workspaceKey);
}

function beginLogin(res, options) {
  const workspaceKey = resolveWorkspaceKey(options.workspaceKey);
  const db = getWorkspaceDbOrThrow(workspaceKey).db;
  const username = requireText(options.username, "Username");
  const user = db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)").get(username);
  if (!user) {
    throw new Error("Invalid workspace, username, or password.");
  }

  try {
    ensureUserCanAuthenticate(workspaceKey, user);
    if (!verifySecret(requireText(options.password, "Password"), user.password_hash, user.password_salt)) {
      handleFailedAuthentication(workspaceKey, user);
      throw new Error("Invalid workspace, username, or password.");
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
      throw new Error("This account requires a security PIN before two-step sign-in can be completed. Ask the owner to update the account security settings.");
    }
    const challengeId = createLoginChallenge(workspaceKey, user.id);
    const expiresAt = new Date(Date.now() + LOGIN_CHALLENGE_TTL_MS);
    setWorkspaceCookie(res, workspaceKey, expiresAt);
    return {
      requiresSecondFactor: true,
      challengeId,
      user: publicUser(user, workspaceKey),
      workspaceKey,
    };
  }

  createSession(res, workspaceKey, user.id);
  return {
    requiresSecondFactor: false,
    user: publicUser(user, workspaceKey),
    workspaceKey,
  };
}

function completeSecondFactorLogin(res, { challengeId, pin, workspaceKey }) {
  const safeWorkspaceKey = resolveWorkspaceKey(workspaceKey);
  const challenge = consumeLoginChallenge(safeWorkspaceKey, requireText(challengeId, "Login challenge"));
  const user = getUserById(safeWorkspaceKey, challenge.user_id);
  if (!user) {
    throw new Error("This sign-in request is no longer available. Start again.");
  }
  ensureUserCanAuthenticate(safeWorkspaceKey, user);

  if (!verifySecret(requirePin(pin), user.pin_hash, user.pin_salt)) {
    handleFailedAuthentication(safeWorkspaceKey, user);
    throw new Error("Invalid security PIN.");
  }

  resetFailedAuthentication(safeWorkspaceKey, user.id);
  createSession(res, safeWorkspaceKey, user.id);
  return publicUser(user, safeWorkspaceKey);
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
    throw new Error("This sign-in stage has expired. Start again.");
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
    throw new Error("This account is currently inactive. Contact the business owner.");
  }
  if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
    const until = new Date(user.locked_until).toLocaleString("en-KE");
    throw new Error(`This account is temporarily locked. Try again after ${until}.`);
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
  publicUser,
  resolveWorkspaceKey,
  verifyUserAccess,
};
