// The interrogator kit: Raspberry Pi 5 in a case, Feather LoRa bridge with antenna, a phone running ATAK. 1 unit = 1 cm.
import { mats } from './puck.js';
const T = THREE;
const M = (c, metal, rough, x) => new T.MeshStandardMaterial(Object.assign({ color: new T.Color(c).convertSRGBToLinear(), metalness: metal, roughness: rough }, x || {}));
function B(p, w, h, d, m, x, y, z) { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = o.receiveShadow = true; p.add(o); return o; }
function screenTex() {
  const c = document.createElement('canvas'); c.width = 360; c.height = 780; const g = c.getContext('2d');
  g.fillStyle = '#0b1220'; g.fillRect(0, 0, 360, 780); g.strokeStyle = '#1b2a44'; g.lineWidth = 1; for (let i = 0; i < 20; i++) { g.beginPath(); g.moveTo(0, i * 40); g.lineTo(360, i * 40); g.stroke(); g.beginPath(); g.moveTo(i * 40, 0); g.lineTo(i * 40, 780); g.stroke(); }
  g.fillStyle = '#121a2b'; g.fillRect(0, 0, 360, 60); g.fillStyle = '#eef3fb'; g.font = '600 22px Arial'; g.fillText('ATAK', 16, 38);
  const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
}
export function makeKit() {
  const g = new T.Group(); const parts = {};
  const table = new T.Mesh(new T.PlaneGeometry(80, 50), new T.ShadowMaterial({ opacity: 0.5 })); table.rotation.x = -Math.PI / 2; table.receiveShadow = true; g.add(table);
  // Pi 5 in a black case
  const pi = new T.Group(); pi.position.set(-9, 1.0, 0); g.add(pi); parts.pi = pi;
  B(pi, 9.4, 0.5, 6.6, M(0x16181c, 0.2, 0.7), 0, -1.0, 0); B(pi, 9.4, 1.8, 6.6, M(0x8d939c, 0.9, 0.45), 0, 0.15, 0); B(pi, 9.4, 0.5, 6.6, M(0x16181c, 0.2, 0.7), 0, 1.3, 0); for (let i = 0; i < 5; i++) B(pi, 8.0, 0.08, 0.25, M(0x6f757e, 0.9, 0.5), 0, 1.58, -2.0 + i * 1.0);
  for (let i = 0; i < 2; i++) B(pi, 1.5, 1.3, 1.6, mats.alu, 4.6, 0.1, -2.1 + i * 1.9); B(pi, 1.6, 1.35, 1.6, M(0x3a3f47, 0.6, 0.5), 4.6, 0.1, 1.9); B(pi, 1.2, 0.5, 0.9, mats.alu, -4.8, 0.1, 1.8);
  const piLed = B(pi, 0.3, 0.1, 0.3, mats.ledGreen, 3.5, 1.05, 2.6); parts.piLed = piLed;
  // Feather bridge on a short USB lead
  const br = new T.Group(); br.position.set(3.5, 0.35, 3.5); g.add(br); parts.bridge = br;
  B(br, 5.1, 0.16, 2.3, M(0x101216, 0.1, 0.55), 0, 0, 0); B(br, 1.6, 0.3, 1.6, mats.alu, 1.75, 0.23, 0); B(br, 0.8, 0.4, 0.6, mats.alu, -2.3, 0.3, 0.6); B(br, 0.6, 0.35, 0.5, M(0xc9a66b, 0.1, 0.6), -2.3, 0.28, -0.3);
  for (let i = 0; i < 16; i++) { B(br, 0.06, 0.06, 0.06, mats.gold, -2.2 + i * 0.29, 0.1, 1.0); B(br, 0.06, 0.06, 0.06, mats.gold, -2.2 + i * 0.29, 0.1, -1.0); }
  const antPts = [new T.Vector3(0, -0.45, 0), new T.Vector3(0, 0, 0)]; for (let i = 0; i <= 90; i++) { const a = i / 90 * 9 * Math.PI * 2; antPts.push(new T.Vector3(Math.cos(a) * 0.275, i / 90 * 1.25, Math.sin(a) * 0.275)); }
  const ant = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(antPts), 200, 0.04, 8, false), mats.copper); ant.position.set(2.45, 0.5, -1.0); ant.castShadow = true; br.add(ant); parts.ant = ant;
  const lead = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(-4.3, 0.9, 1.8), new T.Vector3(-1.5, 1.4, 3.2), new T.Vector3(0.5, 0.8, 3.9)]), 24, 0.14, 8, false), mats.black); g.add(lead);
  // Phone
  const ph = new T.Group(); ph.position.set(14, 0.4, -1); ph.rotation.y = -0.25; g.add(ph); parts.phone = ph;
  B(ph, 7.8, 0.75, 16.4, M(0x14161c, 0.7, 0.4), 0, 0, 0); const cam = new T.Mesh(new T.CircleGeometry(0.25, 24), M(0x05060a, 0.2, 0.5)); cam.rotation.x = -Math.PI / 2; cam.position.set(0, 0.42, -7.2); ph.add(cam);
  const scr = new T.Mesh(new T.PlaneGeometry(7.3, 15.6), new T.MeshStandardMaterial({ map: screenTex(), emissive: 0xffffff, emissiveMap: screenTex(), emissiveIntensity: 0.9, roughness: 0.3 })); scr.rotation.x = -Math.PI / 2; scr.position.y = 0.385; ph.add(scr); parts.screen = scr; cam.position.y = 0.39;
  return { g, parts };
}
