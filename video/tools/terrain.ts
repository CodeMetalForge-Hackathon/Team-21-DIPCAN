// Fetch Mapzen/AWS terrarium elevation tiles and stitch them into one RGB PNG per region.
// Terrarium encoding: height_m = R*256 + G + B/256 - 32768. The page decodes it with a canvas.
// Usage: bun tools/terrain.ts            (writes data/<name>.png + data/<name>.json for each region)
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";

type Region = { name: string; z: number; x0: number; x1: number; y0: number; y1: number };
// Zagros around Dehdasht (Kohgiluyeh and Boyer-Ahmad) at z11, and Iran at z6.
const REGIONS: Region[] = [
  { name: "zagros", z: 11, x0: 1309, x1: 1314, y0: 836, y1: 841 },
  { name: "iran",   z: 6,  x0: 39,   x1: 43,   y0: 24,  y1: 27 },
];
const T = 256;
const tileLon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const tileLat = (y: number, z: number) => { const n = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

async function fetchTile(z: number, x: number, y: number): Promise<PNG> {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url);
    if (r.ok) return PNG.sync.read(Buffer.from(await r.arrayBuffer()));
    await Bun.sleep(500 * (attempt + 1));
  }
  throw new Error(`tile ${z}/${x}/${y} failed`);
}

mkdirSync("data", { recursive: true });
for (const R of REGIONS) {
  const W = (R.x1 - R.x0 + 1) * T, H = (R.y1 - R.y0 + 1) * T;
  const out = new PNG({ width: W, height: H });
  let min = Infinity, max = -Infinity;
  const jobs: Promise<void>[] = [];
  for (let ty = R.y0; ty <= R.y1; ty++) for (let tx = R.x0; tx <= R.x1; tx++) {
    jobs.push(fetchTile(R.z, tx, ty).then(p => {
      const ox = (tx - R.x0) * T, oy = (ty - R.y0) * T;
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
        const si = (y * T + x) * 4, di = ((oy + y) * W + ox + x) * 4;
        out.data[di] = p.data[si]; out.data[di + 1] = p.data[si + 1]; out.data[di + 2] = p.data[si + 2]; out.data[di + 3] = 255;
        const h = p.data[si] * 256 + p.data[si + 1] + p.data[si + 2] / 256 - 32768;
        if (h < min) min = h; if (h > max) max = h;
      }
    }));
  }
  await Promise.all(jobs);
  writeFileSync(`data/${R.name}.png`, PNG.sync.write(out));
  const meta = { name: R.name, z: R.z, width: W, height: H,
    west: tileLon(R.x0, R.z), east: tileLon(R.x1 + 1, R.z), north: tileLat(R.y0, R.z), south: tileLat(R.y1 + 1, R.z),
    minM: Math.round(min), maxM: Math.round(max), encoding: "terrarium" };
  writeFileSync(`data/${R.name}.json`, JSON.stringify(meta, null, 2));
  console.log(`${R.name}: ${W}x${H} px, lon ${meta.west.toFixed(3)}..${meta.east.toFixed(3)}, lat ${meta.south.toFixed(3)}..${meta.north.toFixed(3)}, ${meta.minM}..${meta.maxM} m`);
}
