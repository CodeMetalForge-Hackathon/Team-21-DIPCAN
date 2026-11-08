// Quick shaded-relief preview of a terrarium PNG, for checking the data by eye.
// Usage: bun tools/hillshade.ts data/zagros.png out/preview-zagros.png [vertical exaggeration]
import { PNG } from "pngjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const [inp, outp, exS] = process.argv.slice(2); const ex = Number(exS ?? 2);
const p = PNG.sync.read(readFileSync(inp)); const W = p.width, H = p.height;
const h = (x: number, y: number) => { x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1, y)); const i = (y * W + x) * 4; return p.data[i] * 256 + p.data[i + 1] + p.data[i + 2] / 256 - 32768; };
let min = Infinity, max = -Infinity; for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) { const v = h(x, y); if (v < min) min = v; if (v > max) max = v; }
const out = new PNG({ width: W, height: H }); const lx = -0.5, ly = -0.6, lz = 0.62;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = (h(x + 1, y) - h(x - 1, y)) * ex, dy = (h(x, y + 1) - h(x, y - 1)) * ex; const nl = Math.hypot(dx, dy, 60);
  const s = Math.max(0, (-dx * lx - dy * ly + 60 * lz) / nl); const t = (h(x, y) - min) / (max - min);
  const i = (y * W + x) * 4; out.data[i] = 20 + 90 * s + 60 * t; out.data[i + 1] = 28 + 100 * s + 40 * t; out.data[i + 2] = 44 + 110 * s + 20 * t; out.data[i + 3] = 255;
}
mkdirSync("out", { recursive: true }); writeFileSync(outp, PNG.sync.write(out)); console.log(outp, `${W}x${H}`, Math.round(min), Math.round(max));
