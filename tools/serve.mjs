// Minimal static file server for local dev. Needed (rather than just opening index.html as a
// file:// URL) because ES module imports and top-level `fetch()` of the .wasm binary both require
// http(s), not file://.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT ?? 8080);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    let filePath = path.join(root, decodeURIComponent(url.pathname));
    if (url.pathname === "/") filePath = path.join(root, "index.html");

    // Keep the server confined to the repo root -- no path traversal out of it.
    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const st = await stat(filePath).catch(() => null);
    if (!st) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    if (st.isDirectory()) filePath = path.join(filePath, "index.html");

    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[ext] ?? "application/octet-stream" });
    res.end(body);
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
});

server.listen(port, () => {
  console.log(`PanGloss demo serving at http://localhost:${port}`);
});
