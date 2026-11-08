// Static server for the page and data. Usage: bun tools/serve.ts [port]   (default 8731)
import { join, normalize } from "node:path";
const root = normalize(join(import.meta.dir, "..")); const port = Number(process.argv[2] ?? 8731);
Bun.serve({ port, async fetch(req) {
  const path = decodeURIComponent(new URL(req.url).pathname); const file = Bun.file(join(root, path === "/" ? "/page/index.html" : path));
  if (!(await file.exists())) return new Response("not found", { status: 404 });
  const size = file.size, range = req.headers.get("range");
  if (range) { const m = /bytes=(\d*)-(\d*)/.exec(range); const start = m && m[1] ? Number(m[1]) : 0; const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    return new Response(file.slice(start, end + 1), { status: 206, headers: { "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes", "content-length": String(end - start + 1), "content-type": file.type, "cache-control": "no-store" } }); }
  return new Response(file, { headers: { "cache-control": "no-store", "accept-ranges": "bytes" } });
} });
console.log(`serving ${root} on http://localhost:${port}/`);
