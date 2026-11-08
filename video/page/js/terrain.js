// Heightmap meshes with elevation vertex colors. Units: kilometers. Heights exaggerated by `ex`.
import { toPx, metersPerPx } from './data.js';
const T = THREE;
const col = new T.Color();
// Color by relief within the window (so a 1,500 to 3,000 m range still reads), snow by absolute height.
const SRGB = (hex) => new T.Color(hex).convertSRGBToLinear();
const PAL = { sea: SRGB(0x0d1a30), valley: SRGB(0x33342a), scree: SRGB(0x6b6353), rock: SRGB(0x3f3830), high: SRGB(0x55575a), snow: SRGB(0xb9c0ca) };
const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
// Color by height within the window and by slope; snow only on gentle ground above the snow line; per-vertex noise.
function rampColor(hM, lo, hi, snowM, slopeDeg, gx, gy) {
  if (hM <= 0) return PAL.sea.clone();
  const t = Math.pow(Math.min(1, Math.max(0, (hM - lo) / Math.max(1, hi - lo))), 0.85);
  const c = PAL.valley.clone().lerp(PAL.scree, Math.min(1, t * 1.5));
  if (t > 0.6) c.lerp(PAL.high, (t - 0.6) / 0.4);
  if (slopeDeg > 32) c.lerp(PAL.rock, Math.min(1, (slopeDeg - 32) / 14));
  if (hM > snowM && slopeDeg < 28) c.lerp(PAL.snow, Math.min(1, (hM - snowM) / 120) * (0.7 + 0.3 * hash(gx * 3, gy * 3)));
  const n = 1 + (hash(gx, gy) - 0.5) * 0.12; c.multiplyScalar(n);
  return c;
}
// Build a mesh from a grid window [x0,y0,w,h] (px), sampled every `step` px.
export function heightMesh(grid, x0, y0, w, h, step, ex, snowM) {
  const mpp = metersPerPx(grid) / 1000; const cols = Math.floor(w / step), rows = Math.floor(h / step);
  const geo = new T.PlaneGeometry(cols * step * mpp, rows * step * mpp, cols - 1, rows - 1); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  let lo = Infinity, hi = -Infinity;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const v = grid.data[Math.min(grid.h - 1, y0 + r * step) * grid.w + Math.min(grid.w - 1, x0 + c * step)]; if (v > 0) { if (v < lo) lo = v; if (v > hi) hi = v; } }
  lo = lo + (hi - lo) * 0.05; hi = hi - (hi - lo) * 0.08;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const gx = Math.min(grid.w - 1, x0 + c * step), gy = Math.min(grid.h - 1, y0 + r * step);
    let hM = grid.data[gy * grid.w + gx]; if (hM < 0) hM = 0;
    const i = r * cols + c; pos.setY(i, (hM / 1000) * ex);
    const hx = grid.data[gy * grid.w + Math.min(grid.w - 1, gx + step)] - grid.data[gy * grid.w + Math.max(0, gx - step)], hy = grid.data[Math.min(grid.h - 1, gy + step) * grid.w + gx] - grid.data[Math.max(0, gy - step) * grid.w + gx];
    const slopeDeg = Math.atan(Math.hypot(hx, hy) / (2 * step * mpp * 1000)) * 180 / Math.PI;
    const cc = rampColor(hM, lo, hi, snowM, slopeDeg, gx, gy); colors[i * 3] = cc.r; colors[i * 3 + 1] = cc.g; colors[i * 3 + 2] = cc.b;
  }
  geo.setAttribute('color', new T.BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0, flatShading: false, envMapIntensity: 0.12 });
  const m = new T.Mesh(geo, mat); m.receiveShadow = true; m.castShadow = true;
  // world <-> grid mapping
  const sample = (px, py) => { const x = Math.max(0, Math.min(grid.w - 1.001, px)), y = Math.max(0, Math.min(grid.h - 1.001, py)); const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0; const d = grid.data, w = grid.w; const h00 = d[y0 * w + x0], h10 = d[y0 * w + x0 + 1], h01 = d[(y0 + 1) * w + x0], h11 = d[(y0 + 1) * w + x0 + 1]; return Math.max(0, (h00 * (1 - fx) + h10 * fx) * (1 - fy) + (h01 * (1 - fx) + h11 * fx) * fy); };
  const toWorld = (px, py, lift = 0) => { const hM = sample(px, py);
    return new T.Vector3((px - x0 - (cols * step) / 2) * mpp, (hM / 1000) * ex + lift, (py - y0 - (rows * step) / 2) * mpp); };
  const lonLatToWorld = (lon, lat, lift = 0) => { const [px, py] = toPx(grid, lon, lat); return toWorld(px, py, lift); };
  return { mesh: m, toWorld, lonLatToWorld, mpp, ex, widthKm: cols * step * mpp, heightKm: rows * step * mpp };
}
// Border lines from rings of [lon,lat] onto a terrain.
export function borderLines(terr, borders, names, color, lift = 0.02, opacity = 0.9) {
  const g = new T.Group();
  for (const c of borders) {
    if (names && !names.includes(c.name)) continue;
    for (const ring of c.rings) {
      const pts = []; for (const [lon, lat] of ring) { const v = terr.lonLatToWorld(lon, lat, lift); pts.push(v); }
      if (pts.length < 2) continue;
      const geo = new T.BufferGeometry().setFromPoints(pts);
      g.add(new T.Line(geo, new T.LineBasicMaterial({ color, transparent: true, opacity })));
    }
  }
  return g;
}
export function studio(scene, { keyColor = 0xfff2e0, keyPos = [-30, 40, 20], keyInt = 1.4, rimColor = 0x7a90b8, rimInt = 0.2, hemi = 0.1, shadowSize = 60, shadowMap = 2048, shadowRadius = 1.2, fill = 0.25 } = {}) {
  scene.add(new T.HemisphereLight(0x5a6a88, 0x0a0c12, hemi));
  const fl = new T.DirectionalLight(0xc8b8a0, fill * 0.7); fl.position.set(-keyPos[0] * 0.6, keyPos[1] * 0.5, keyPos[2] * 1.2); scene.add(fl);
  const key = new T.DirectionalLight(keyColor, keyInt); key.position.set(...keyPos); key.castShadow = true;
  key.shadow.mapSize.set(shadowMap, shadowMap); key.shadow.bias = -0.00015; key.shadow.normalBias = 0.02; key.shadow.radius = shadowRadius;
  Object.assign(key.shadow.camera, { left: -shadowSize, right: shadowSize, top: shadowSize, bottom: -shadowSize, near: 1, far: 300 });
  scene.add(key, key.target);
  const rim = new T.DirectionalLight(rimColor, rimInt); rim.position.set(30, 20, -40); scene.add(rim);
  return { key, rim };
}
