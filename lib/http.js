const fs = require("node:fs");
const path = require("node:path");
const { createHttpError } = require("./utils");

const PUBLIC_DIR = path.join(path.resolve(__dirname, ".."), "public");
const MAX_JSON_BODY_SIZE_BYTES = 60 * 1024 * 1024;

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), usb=()",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}

async function readJson(req) {
  const body = await new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    const contentLength = Number(req.headers["content-length"] || 0);

    if (contentLength > MAX_JSON_BODY_SIZE_BYTES) {
      reject(createHttpError(`Request body too large. Keep uploads below ${Math.floor(MAX_JSON_BODY_SIZE_BYTES / (1024 * 1024))}MB.`, 413));
      return;
    }

    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_JSON_BODY_SIZE_BYTES) {
        reject(createHttpError(`Request body too large. Keep uploads below ${Math.floor(MAX_JSON_BODY_SIZE_BYTES / (1024 * 1024))}MB.`, 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    throw createHttpError("Invalid JSON payload.", 400);
  }
}

function sendJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...securityHeaders(),
    ...headers,
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function serveStatic(requestPath, res) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const resolved = path.join(PUBLIC_DIR, safePath.replace(/^\/+/, ""));
  if (!resolved.startsWith(PUBLIC_DIR)) {
    return sendError(res, 403, "Forbidden.");
  }

  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    return sendError(res, 404, "File not found.");
  }

  const extension = path.extname(resolved).toLowerCase();
  const mimeType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
  }[extension] || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": mimeType,
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    ...securityHeaders(),
  });
  fs.createReadStream(resolved).pipe(res);
}

module.exports = {
  MAX_JSON_BODY_SIZE_BYTES,
  PUBLIC_DIR,
  readJson,
  sendError,
  sendJson,
  serveStatic,
};
