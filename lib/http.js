const fs = require("node:fs");
const path = require("node:path");

const PUBLIC_DIR = path.join(path.resolve(__dirname, ".."), "public");

async function readJson(req) {
  const body = await new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });

  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Invalid JSON payload.");
  }
}

function sendJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
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

  res.writeHead(200, { "Content-Type": mimeType });
  fs.createReadStream(resolved).pipe(res);
}

module.exports = {
  PUBLIC_DIR,
  readJson,
  sendError,
  sendJson,
  serveStatic,
};
