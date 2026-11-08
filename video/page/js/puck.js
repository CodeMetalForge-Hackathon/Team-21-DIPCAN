// Granule puck from primitives. 1 unit = 1 cm. Diameter 3.2 cm, height 1.0 cm (bottle cap scale).
const T = THREE;
const L = (c) => new T.Color(c).convertSRGBToLinear();
const M = (c, metal, rough, x) => new T.MeshStandardMaterial(Object.assign({ color: L(c), metalness: metal, roughness: rough }, x || {}));
const E = (c, i) => new T.MeshStandardMaterial({ color: 0x000000, emissive: L(c), emissiveIntensity: i || 2.4, toneMapped: false });
// speckle maps for potted epoxy
const noiseTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); const im = g.createImageData(512, 512); for (let i = 0; i < im.data.length; i += 4) { const v = 150 + Math.random() * 70; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 3); return t; })();
export const mats = {
  resin: new T.MeshPhysicalMaterial({ color: L(0x3a2a1e), roughness: 0.5, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.3, envMapIntensity: 0.9, roughnessMap: noiseTex, bumpMap: noiseTex, bumpScale: 0.012 }), resinDark: M(0x1c1610, 0.05, 0.7, { envMapIntensity: 0.3 }), pcb: M(0x0f3b2b, 0.0, 0.78, { envMapIntensity: 0.4 }), chip: M(0x15171c, 0.6, 0.35),
  alu: M(0xc3cad6, 1, 0.3), gold: M(0xd2a646, 1, 0.3), copper: M(0xb86a3c, 1, 0.42), cell: M(0xb9bec8, 0.9, 0.35, { envMapIntensity: 0.6 }), black: M(0x0a0b0e, 0.4, 0.5),
  ledOff: M(0x1a1c22, 0.2, 0.6), ledOn: E(0x4d8dff, 3), ledAmber: E(0xffb44a, 3), ledGreen: E(0x39ff8a, 3), ledRed: E(0xff5a4a, 3),
};
function B(p, w, h, d, m, x, y, z) { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = o.receiveShadow = true; p.add(o); return o; }
function C(p, r, len, m, x, y, z, seg) { const o = new T.Mesh(new T.CylinderGeometry(r, r, len, seg || 48), m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = o.receiveShadow = true; p.add(o); return o; }
function helix(p, r, turns, len, tube, m, x, y, z) {
  const pts = []; const n = 24 * turns; for (let i = 0; i <= n; i++) { const a = (i / n) * turns * Math.PI * 2; pts.push(new T.Vector3(Math.cos(a) * r, (i / n) * len, Math.sin(a) * r)); }
  const o = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), n * 2, tube, 8, false), m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o;
}
// Returns { g, parts, state:{k}, apply(), led(name) }. Explode: each part moves from home to out as k goes 0..1.
export function makePuck(opts = {}) {
  const g = new T.Group(); const parts = {}; const R = 1.6, H = 1.0;
  const shell = new T.Group(); g.add(shell); parts.shell = shell;
  // potted body: lathe profile with 0.08 cm fillets at both rims
  const f = 0.08, prof = []; for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; prof.push(new T.Vector2(R - f + Math.sin(a) * f, -H / 2 + f - Math.cos(a) * f)); } for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; prof.push(new T.Vector2(R - f + Math.cos(a) * f, H / 2 - f + Math.sin(a) * f)); } prof.push(new T.Vector2(0, H / 2)); prof.unshift(new T.Vector2(0, -H / 2));
  const body = new T.Mesh(new T.LatheGeometry(prof, 72), mats.resin); body.castShadow = body.receiveShadow = true; shell.add(body);
  parts.led = C(shell, 0.14, 0.05, mats.ledOff, 0.9, H / 2 + 0.06, 0.6, 24);
  const inner = new T.Group(); g.add(inner); parts.inner = inner;
  parts.pcb = C(inner, R * 0.84, 0.08, mats.pcb, 0, 0.02, 0);
  parts.radio = B(inner, 1.1, 0.22, 0.75, mats.chip, -0.25, 0.17, 0.1); B(parts.radio, 1.0, 0.03, 0.65, mats.alu, 0, 0.13, 0);
  parts.baro = B(inner, 0.3, 0.14, 0.3, mats.chip, 0.75, 0.13, -0.45); B(parts.baro, 0.08, 0.02, 0.08, mats.black, 0, 0.08, 0);
  parts.accel = B(inner, 0.3, 0.12, 0.3, mats.chip, 0.8, 0.12, 0.35);
  parts.hall = B(inner, 0.16, 0.1, 0.3, mats.black, -0.95, 0.11, -0.6);
  parts.mcu = B(inner, 0.6, 0.12, 0.6, mats.chip, 0.15, 0.12, -0.55);
  parts.cell = C(inner, 1.0, 0.32, mats.cell, 0, -0.22, 0, 48); C(parts.cell, 0.75, 0.02, mats.alu, 0, 0.17, 0);
  parts.ant = B(inner, 0.7, 0.1, 0.2, mats.chip, -0.2, 0.11, -1.1); B(parts.ant, 0.6, 0.02, 0.12, mats.alu, 0, 0.06, 0);
  const coil = new T.Mesh(new T.TorusGeometry(R * 0.78, 0.015, 8, 72), mats.copper); coil.rotation.x = Math.PI / 2; coil.position.y = 0.065; inner.add(coil); parts.coil = coil;
  // pads on pcb
  for (let i = 0; i < 6; i++) B(inner, 0.06, 0.02, 0.06, mats.gold, -0.55 + i * 0.22, 0.065, 0.7);
  const home = {}; for (const k in parts) home[k] = parts[k].position.clone();
  const out = { shell: [0, 2.3, 0], led: [0.9, 2.9, 0.6], pcb: [0, 0, 0], radio: [-0.25, 1.1, 0.1], baro: [0.75, 1.05, -0.45], accel: [0.8, 0.95, 0.35], hall: [-1.5, 1.45, -0.7], mcu: [0.15, 1.5, -0.55], cell: [0, -1.1, 0], ant: [-0.2, 1.3, -1.1], coil: [0, 0.6, 0], inner: [0, 0, 0] };
  const state = { k: 0, shellOpacity: 1 };
  shell.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; } });
  function apply() {
    const k = state.k, e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    for (const n in parts) { if (!out[n] || n === 'inner') continue; const o = parts[n]; const h = home[n], t = out[n]; o.position.set(h.x + (t[0] - h.x) * e, h.y + (t[1] - h.y) * e, h.z + (t[2] - h.z) * e); }
    shell.traverse(o => { if (o.isMesh && o !== parts.led) o.material.opacity = state.shellOpacity; });
  }
  function led(name) { parts.led.material = name ? mats['led' + name[0].toUpperCase() + name.slice(1)] : mats.ledOff; }
  apply();
  return { g, parts, state, apply, led };
}
// Tiny puck for the terrain: a flat disc with an LED dot. 1 unit = 1 km there, so it is scaled way up for visibility.
export function marker(color) {
  const g = new T.Group();
  const d = new T.Mesh(new T.CylinderGeometry(0.11, 0.13, 0.05, 32), mats.resin); d.castShadow = true; g.add(d);
  const l = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.02, 16), color ? mats['led' + color] : mats.ledOff); l.position.y = 0.035; g.add(l);
  const halo = new T.Mesh(new T.RingGeometry(0.16, 0.185, 48), new T.MeshBasicMaterial({ color: 0x4d8dff, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, depthTest: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.04; halo.renderOrder = 10; g.add(halo);
  return { g, led: l, halo, setLED(c) { l.material = c ? mats['led' + c] : mats.ledOff; }, setHalo(c, o) { halo.material.color.set(c); halo.material.opacity = o; } };
}
