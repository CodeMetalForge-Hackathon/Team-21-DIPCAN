// Effects: expanding pulse rings, progressive path lines, direction-finding lines, a helicopter and figures.
const T = THREE;
export function ring(color, maxR, depthTest = false) {
  const m = new T.Mesh(new T.RingGeometry(0.982, 1.0, 128), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, depthTest }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 10; const st = { r: 0.01, a: 0 };
  return { m, st, apply() { m.scale.setScalar(Math.max(0.01, st.r)); m.material.opacity = st.a; m.visible = st.a > 0.001; } };
}
// Path over terrain: samples between waypoints following the surface. draw by k in 0..1.
export function path(terr, pxPts, color, lift = 0.04, perLeg = 48, width = 2) {
  const pts = [];
  for (let i = 0; i < pxPts.length - 1; i++) { const [ax, ay] = pxPts[i], [bx, by] = pxPts[i + 1]; for (let j = 0; j <= perLeg; j++) { const u = j / perLeg; pts.push(terr.toWorld(ax + (bx - ax) * u, ay + (by - ay) * u, lift)); } }
  const geo = new T.BufferGeometry().setFromPoints(pts); const line = new T.Line(geo, new T.LineBasicMaterial({ color, transparent: true, opacity: 0.95, linewidth: width }));
  const st = { k: 0 }; geo.setDrawRange(0, 0);
  return { line, st, pts, apply() { geo.setDrawRange(0, Math.floor(st.k * pts.length)); line.visible = st.k > 0; }, at(k) { return pts[Math.min(pts.length - 1, Math.floor(k * (pts.length - 1)))]; } };
}
export function dfLines(fromPts, to, color) {
  const g = new T.Group(); const st = { k: 0 }; const items = [];
  for (const f of fromPts) { const m = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 1, 8), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })); g.add(m);
    const r = new T.Mesh(new T.RingGeometry(0.1, 0.13, 32), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false, depthTest: false })); r.rotation.x = -Math.PI / 2; r.position.copy(f); r.renderOrder = 10; g.add(r); items.push({ m, f }); }
  const up = new T.Vector3(0, 1, 0);
  return { g, st, apply() { if (g.userData.from && items.length === 1) { items[0].f.copy(g.userData.from); g.children[1].position.copy(g.userData.from); g.children[1].visible = false; } for (const { m, f } of items) { const end = to.clone().sub(f).multiplyScalar((items.length === 1 ? 1.0 : 1.35) * st.k).add(f); const d = end.clone().sub(f); const len = d.length(); m.visible = len > 0.01; if (!m.visible) continue; m.position.copy(f).add(d.clone().multiplyScalar(0.5)); m.scale.set(1, len, 1); m.quaternion.setFromUnitVectors(up, d.normalize()); } g.visible = st.k > 0.001; } };
}
// Group 2 VTOL fixed-wing drone (Vector-class), an icon at 0.32 km span on the terrain set. Nose along +z.
export function heli() {
  const g = new T.Group(); const inner = new T.Group(); g.add(inner); g.userData.inner = inner;
  const L = (c) => new T.Color(c).convertSRGBToLinear();
  const skin = new T.MeshStandardMaterial({ color: L(0x161c26), metalness: 0.25, roughness: 0.6 });
  const edge = new T.LineBasicMaterial({ color: 0xc9d6ee, transparent: true, opacity: 1 });
  const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0, mat = skin, edges = true) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; inner.add(m); if (edges) { const e = new T.LineSegments(new T.EdgesGeometry(geo, 20), edge); e.position.copy(m.position); e.rotation.copy(m.rotation); inner.add(e); } return m; };
  add(new T.CylinderGeometry(0.016, 0.012, 0.17, 12), 0, 0, 0.02, Math.PI / 2, 0, 0);
  add(new T.SphereGeometry(0.014, 12, 10), 0, 0, 0.11, 0, 0, 0, new T.MeshStandardMaterial({ color: L(0x0a0d12), metalness: 0.6, roughness: 0.3 }), false);
  add(new T.BoxGeometry(0.16, 0.005, 0.048), -0.08, 0.012, 0.01, 0, 0, 0.035); add(new T.BoxGeometry(0.16, 0.005, 0.048), 0.08, 0.012, 0.01, 0, 0, -0.035);
  for (const sx of [-1, 1]) { add(new T.CylinderGeometry(0.004, 0.004, 0.17, 8), sx * 0.085, -0.004, -0.02, Math.PI / 2, 0, 0, skin, false);
    for (const z of [0.065, -0.105]) { const disc = new T.Mesh(new T.CylinderGeometry(0.038, 0.038, 0.0015, 32), new T.MeshBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.18, depthWrite: false })); disc.position.set(sx * 0.085, 0.004, z); inner.add(disc);
      const rim = new T.Mesh(new T.RingGeometry(0.034, 0.038, 32), new T.MeshBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false })); rim.rotation.x = -Math.PI / 2; rim.position.set(sx * 0.085, 0.005, z); inner.add(rim);
      add(new T.BoxGeometry(0.072, 0.0012, 0.006), sx * 0.085, 0.006, z, 0, 0, 0, skin, false); add(new T.BoxGeometry(0.006, 0.0012, 0.072), sx * 0.085, 0.006, z, 0, 0, 0, skin, false); } }
  const pusher = new T.Mesh(new T.CylinderGeometry(0.028, 0.028, 0.0015, 24), new T.MeshBasicMaterial({ color: 0x9fb4d8, transparent: true, opacity: 0.25, depthWrite: false })); pusher.rotation.x = Math.PI / 2; pusher.position.set(0, 0, -0.075); inner.add(pusher);
  add(new T.BoxGeometry(0.004, 0.05, 0.03), -0.03, 0.024, -0.09, 0, 0, 0.6); add(new T.BoxGeometry(0.004, 0.05, 0.03), 0.03, 0.024, -0.09, 0, 0, -0.6);
  const light = (c, x, y, z, r) => { const m = new T.Mesh(new T.SphereGeometry(r, 8, 8), new T.MeshStandardMaterial({ color: 0, emissive: L(c), emissiveIntensity: 2, toneMapped: false })); m.position.set(x, y, z); inner.add(m); return m; };
  light(0xff4040, -0.16, 0.012, 0.01, 0.006); light(0x40ff80, 0.16, 0.012, 0.01, 0.006); g.userData.strobe = light(0xffffff, 0, 0.03, -0.09, 0.005);
  // tether to the ground point and a ground ring
  const tg = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]); const tether = new T.Line(tg, new T.LineDashedMaterial({ color: 0x39ff8a, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.6 })); g.userData.tether = tether;
  const gr = new T.Mesh(new T.RingGeometry(0.1, 0.12, 32), new T.MeshBasicMaterial({ color: 0x39ff8a, transparent: true, opacity: 0.5, side: T.DoubleSide, depthWrite: false, depthTest: false })); gr.rotation.x = -Math.PI / 2; gr.renderOrder = 10; g.userData.groundRing = gr;
  return g;
}
export function figure() {
  const g = new T.Group();
  const d = new T.Mesh(new T.CircleGeometry(0.06, 24), new T.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false })); d.rotation.x = -Math.PI / 2; d.position.y = 0.03; d.renderOrder = 11; g.add(d);
  const ring = new T.Mesh(new T.RingGeometry(0.12, 0.135, 32), new T.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.5, side: T.DoubleSide, depthWrite: false, depthTest: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.renderOrder = 11; g.add(ring);
  return g;
}
export function glow(color, size) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), color, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); sp.scale.set(size, size, 1); return sp;
}
// Contact shadow: a soft black disc under an object, normal blending.
export function ao(size, opacity = 0.7) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const m = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, opacity, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.006; return m;
}
export function textPlane(txt, w, h, font, fg = '#eef3fb', bg = 'rgba(0,0,0,0)') {
  const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * h / w); const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, c.width / 2, c.height / 2);
  const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })); return m;
}
