import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import worker from "./server/index.js";

const port = Number(process.env.PORT || 3000);
const clientRoot = join(import.meta.dirname, "client");
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function assetPath(url) {
  const pathname = decodeURIComponent(new URL(url).pathname);
  const relative = normalize(pathname).replace(/^([/\\])+/, "");
  const filePath = join(clientRoot, relative);
  if (!filePath.startsWith(`${clientRoot}/`) || !existsSync(filePath) || !statSync(filePath).isFile()) return null;
  return filePath;
}

function serveAsset(filePath, outgoing) {
  outgoing.writeHead(200, {
    "content-type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
    "cache-control": filePath.includes("/_next/static/") ? "public, max-age=31536000, immutable" : "public, max-age=3600",
  });
  createReadStream(filePath).pipe(outgoing);
}

const assets = {
  async fetch(input) {
    const url = typeof input === "string" ? input : input.url;
    const filePath = assetPath(url);
    if (!filePath) return new Response("Not found", { status: 404 });
    const body = Readable.toWeb(createReadStream(filePath));
    return new Response(body, {
      headers: {
        "content-type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
        "cache-control": filePath.includes("/_next/static/") ? "public, max-age=31536000, immutable" : "public, max-age=3600",
      },
    });
  },
};

function requestUrl(request) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  const host = String(request.headers["x-forwarded-host"] || request.headers.host || `127.0.0.1:${port}`).split(",")[0].trim();
  return `${forwardedProto}://${host}${request.url || "/"}`;
}

createServer(async (incoming, outgoing) => {
  try {
    if (incoming.url === "/healthz") {
      outgoing.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      outgoing.end('{"ok":true}');
      return;
    }
    const pathname = new URL(requestUrl(incoming)).pathname;
    if (pathname === "/") {
      const staticHome = join(clientRoot, "index.html");
      if (existsSync(staticHome)) {
        serveAsset(staticHome, outgoing);
        return;
      }
    }
    const directAsset = assetPath(requestUrl(incoming));
    if (directAsset) {
      serveAsset(directAsset, outgoing);
      return;
    }

    const method = incoming.method || "GET";
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
      else if (value !== undefined) headers.set(name, value);
    }
    const init = { method, headers };
    if (method !== "GET" && method !== "HEAD") {
      init.body = Readable.toWeb(incoming);
      init.duplex = "half";
    }

    const response = await worker.fetch(new Request(requestUrl(incoming), init), { ASSETS: assets }, {});
    outgoing.statusCode = response.status;
    outgoing.statusMessage = response.statusText;
    response.headers.forEach((value, name) => outgoing.setHeader(name, value));
    if (!response.body) {
      outgoing.end();
      return;
    }
    Readable.fromWeb(response.body).pipe(outgoing);
  } catch (error) {
    console.error("[yida] request failed", error);
    if (!outgoing.headersSent) outgoing.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    outgoing.end(JSON.stringify({ error: "服务暂时不可用" }));
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`[yida] listening on 0.0.0.0:${port}`);
});
