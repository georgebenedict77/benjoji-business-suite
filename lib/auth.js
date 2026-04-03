const crypto = require("node:crypto");
const { db } = require("./db");
const { optionalText, requirePassword, requirePin, requireText, requireUsername, normalizeRole, timestampNow } = require("./utils");
const { getSecurityPolicy, requiresSecondFactorForRole, recordAutomaticBackup } = require("./control");

const SESSION_COOKIE = "benjoji_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const LOGIN_CHALLENGE_TTL_MS = 1000 * 60 * 10;

db.exec(`
CREATE TABLE IF NOT EXISTS login_challenges (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

ensureColumn("users", "status", "TEXT NOT NULL DEFAULT 'ACTIVE'");
ensureColumn("users", "failed_attempts", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "locked_until", "TEXT");
ensureColumn("users", "last_login_at", "TEXT");

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
  if (!columns.includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(secret, salt, 64).toString("hex");
  return { hash, salt };
}

function verifySecret(secret, storedHash, storedSalt) {
  const hash = crypto.scryptSync(secret, storedSalt, 64);
  return crypto.timingSafeEqual(hash, Buffer.from(storedHash, "hex"));
}

function publicUser(user) {
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
  };
}

function getUserCount() {
  return Number(db.prepare("SELECT COUNT(*) AS value FROM users").get().value || 0);
}

function getUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)").get(username);
}

function getUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function resolveAuthMode(value) {
  return optionalText(value || "password").toLowerCase() === "pin" ? "pin" : "password";
}

function verifyUserAccess(options) {
  const authMode = resolveAuthMode(options.authMode);
  const user = getUserByUsername(requireText(options.username, "Username"));
  if (!user) {
    throw new Error(authMode === "pin" ? "Invalid username or PIN." : "Invalid username or password.");
  }
  ensureUserCanAuthenticate(user);

  if (authMode === "pin") {
    if (!user.pin_hash || !user.pin_salt) {
      throw new Error("This account does not have a PIN yet. Use password verification.");
    }
    if (!verifySecret(requirePin(options.pin), user.pin_hash, user.pin_salt)) {
      throw new Error("Invalid username or PIN.");
    }
  } else if (!verifySecret(requireText(options.password, "Password"), user.password_hash, user.password_salt)) {
    throw new Error("Invalid username or password.");
  }

  if (options.requiredRole && user.role !== options.requiredRole) {
    throw new Error(`This action requires ${options.requiredRole.toLowerCase()} access.`);
  }

  return user;
}

function createUser({ fullName, username, email, password, pin, role }) {
  const safeFullName = requireText(fullName, "Full name");
  const safeUsername = requireUsername(username);
  const safeEmail = optionalText(email);
  const safePassword = requirePassword(password);
  const safePin = optionalText(pin) ? requirePin(pin) : "";
  const safeRole = normalizeRole(role);

  if (getUserByUsername(safeUsername)) {
    throw new Error("That username is already in use.");
  }

  const { hash, salt } = hashSecret(safePassword);
  const pinSecret = safePin ? hashSecret(safePin) : { hash: null, salt: null };
  db.prepare(`
    INSERT INTO users (full_name, username, email, password_hash, password_salt, pin_hash, pin_salt, role, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
  `).run(safeFullName, safeUsername, safeEmail, hash, salt, pinSecret.hash, pinSecret.salt, safeRole, timestampNow().iso);

  recordAutomaticBackup("user-created", safeFullName);
  return publicUser(getUserByUsername(safeUsername));
}

function getSessionId(req) {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : null;
}

function setSessionCookie(res, sessionId, expiresAt) {
  const cookie = `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
  res.setHeader("Set-Cookie", cookie);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

function createSession(res, userId) {
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  db.prepare(`
    INSERT INTO sessions (id, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, userId, now.toISOString(), expiresAt.toISOString());
  db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?").run(now.toISOString(), userId);

  setSessionCookie(res, sessionId, expiresAt);
}

function destroySession(req, res) {
  const sessionId = getSessionId(req);
  if (sessionId) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }
  clearSessionCookie(res);
}

function getCurrentUser(req) {
  const sessionId = getSessionId(req);
  if (!sessionId) {
    return null;
  }

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

  return publicUser(row);
}

function loginUser(res, usernameOrOptions, passwordArg, authModeArg = "password") {
  const options = typeof usernameOrOptions === "object" && usernameOrOptions !== null
    ? usernameOrOptions
    : {
        username: usernameOrOptions,
        password: passwordArg,
        authMode: authModeArg,
      };

  const user = verifyUserAccess(options);
  createSession(res, user.id);
  return publicUser(user);
}

function beginLogin(res, options) {
  const username = requireText(options.username, "Username");
  const user = getUserByUsername(username);
  if (!user) {
    throw new Error("Invalid username or password.");
  }

  try {
    ensureUserCanAuthenticate(user);
    if (!verifySecret(requireText(options.password, "Password"), user.password_hash, user.password_salt)) {
      handleFailedAuthentication(user);
      throw new Error("Invalid username or password.");
    }
  } catch (error) {
    if (error && /locked|disabled|inactive/i.test(error.message || "")) {
      throw error;
    }
    if (!/Invalid username or password\./.test(error.message || "")) {
      handleFailedAuthentication(user);
    }
    throw error;
  }

  resetFailedAuthentication(user.id);

  if (requiresSecondFactorForRole(user.role)) {
    if (!user.pin_hash || !user.pin_salt) {
      throw new Error("This account requires a security PIN before two-step sign-in can be completed. Ask the owner to update the account security settings.");
    }
    const challengeId = createLoginChallenge(user.id);
    return {
      requiresSecondFactor: true,
      challengeId,
      user: publicUser(user),
    };
  }

  createSession(res, user.id);
  return {
    requiresSecondFactor: false,
    user: publicUser(user),
  };
}

function completeSecondFactorLogin(res, { challengeId, pin }) {
  const challenge = consumeLoginChallenge(requireText(challengeId, "Login challenge"));
  const user = getUserById(challenge.user_id);
  if (!user) {
    throw new Error("This sign-in request is no longer available. Start again.");
  }
  ensureUserCanAuthenticate(user);

  if (!verifySecret(requirePin(pin), user.pin_hash, user.pin_salt)) {
    handleFailedAuthentication(user);
    throw new Error("Invalid security PIN.");
  }

  resetFailedAuthentication(user.id);
  createSession(res, user.id);
  return publicUser(user);
}

function createLoginChallenge(userId) {
  clearExpiredLoginChallenges();
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO login_challenges (id, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, new Date(now).toISOString(), new Date(now + LOGIN_CHALLENGE_TTL_MS).toISOString());
  return id;
}

function consumeLoginChallenge(challengeId) {
  clearExpiredLoginChallenges();
  const row = db.prepare("SELECT * FROM login_challenges WHERE id = ?").get(challengeId);
  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    db.prepare("DELETE FROM login_challenges WHERE id = ?").run(challengeId);
    throw new Error("This sign-in stage has expired. Start again.");
  }
  db.prepare("DELETE FROM login_challenges WHERE id = ?").run(challengeId);
  return row;
}

function clearExpiredLoginChallenges() {
  db.prepare("DELETE FROM login_challenges WHERE expires_at <= ?").run(new Date().toISOString());
}

function ensureUserCanAuthenticate(user) {
  if ((user.status || "ACTIVE") !== "ACTIVE") {
    throw new Error("This account is currently inactive. Contact the business owner.");
  }
  if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
    const until = new Date(user.locked_until).toLocaleString("en-KE");
    throw new Error(`This account is temporarily locked. Try again after ${until}.`);
  }
}

function handleFailedAuthentication(user) {
  const policy = getSecurityPolicy();
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

function resetFailedAuthentication(userId) {
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
  loginUser,
  publicUser,
  verifyUserAccess,
};
