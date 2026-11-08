// Place the COA's modeled walk on the real heightmap: find a start pixel near the target elevation whose
// legs (bearing, distance, climb) land at pixels matching the COA elevations. Writes data/route.json.
import { PNG } from "pngjs";
import { readFileSync, writeFileSync } from "node:fs";
const meta = JSON.parse(readFileSync("data/zagros.json", "utf8"));
const p = PNG.sync.read(readFileSync("data/zagros.png")); const W = p.width, H = p.height;
const h = (x: number, y: number) => { x = Math.round(Math.max(0, Math.min(W - 1, x))); y = Math.round(Math.max(0, Math.min(H - 1, y))); const i = (y * W + x) * 4; return p.data[i] * 256 + p.data[i + 1] + p.data[i + 2] / 256 - 32768; };
// meters per pixel at this latitude (web mercator)
const latMid = (meta.north + meta.south) / 2;
const mpp = 40075016.686 * Math.cos(latMid * Math.PI / 180) / (256 * 2 ** meta.z);
// COA worked scenario: P1 2480 anchor; P2 +600 m hz @045, 2610; P3 +900 m @020, 2890; P4 +200 m @020, 2940 (crevice past the saddle)
const legs = [{ d: 600, b: 45, z: 2610 }, { d: 900, b: 20, z: 2890 }, { d: 200, b: 20, z: 2940 }];
const Z1 = 2480;
let best: any = null;
for (let y = 40; y < H - 40; y += 2) for (let x = 40; x < W - 40; x += 2) {
  const z0 = h(x, y); if (Math.abs(z0 - Z1) > 25) continue;
  // road within 300 m and ~300 m below: look for a pixel 300 m lower within 400 m
  let road = false; for (let a = 0; a < 360 && !road; a += 30) { const r = 350 / mpp; const zz = h(x + r * Math.sin(a * Math.PI / 180), y - r * Math.cos(a * Math.PI / 180)); if (z0 - zz > 200) road = true; }
  if (!road) continue;
  let cx = x, cy = y, err = 0; const pts = [[x, y, z0]];
  for (const L of legs) { const r = L.d / mpp; cx += r * Math.sin(L.b * Math.PI / 180); cy -= r * Math.cos(L.b * Math.PI / 180); const z = h(cx, cy); err += Math.abs(z - L.z); pts.push([cx, cy, z]); }
  if (!best || err < best.err) best = { err, pts };
}
const lon = (x: number) => meta.west + (x / W) * (meta.east - meta.west);
const lat = (y: number) => { const n0 = Math.log(Math.tan(Math.PI / 4 + meta.north * Math.PI / 360)), n1 = Math.log(Math.tan(Math.PI / 4 + meta.south * Math.PI / 360)); const n = n0 + (y / H) * (n1 - n0); return (2 * Math.atan(Math.exp(n)) - Math.PI / 2) * 180 / Math.PI; };
const out = { mpp: +mpp.toFixed(2), err: +best.err.toFixed(1), pucks: best.pts.map((q: number[], i: number) => ({ id: i + 1, px: +q[0].toFixed(1), py: +q[1].toFixed(1), lat: +lat(q[1]).toFixed(5), lon: +lon(q[0]).toFixed(5), elevM: Math.round(q[2]), coaElevM: [2480, 2610, 2890, 2940][i] })) };
writeFileSync("data/route.json", JSON.stringify(out, null, 1));
console.log(`mpp ${out.mpp}, total elev error ${out.err} m`); for (const q of out.pucks) console.log(` P${q.id} ${q.lat},${q.lon} real ${q.elevM} m (COA ${q.coaElevM})`);
