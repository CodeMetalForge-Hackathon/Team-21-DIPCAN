// Granule film: one GSAP timeline over five Three.js sets, driven by a time scalar. ?render=1 exposes __seek(t).
import { loadAll, toPx } from './data.js';
import { heightMesh, borderLines, studio } from './terrain.js';
import { makePuck, marker, mats } from './puck.js';
import * as FX from './fx.js';
import { makeKit } from './kit.js';
import { atakPanel, bostonPanel } from './panels.js';
const T = THREE, $ = id => document.getElementById(id), PI = Math.PI;
const q = new URLSearchParams(location.search), RENDER = q.has('render');
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const D = await loadAll();
const TM = D.timing, LN = n => TM.lines.find(l => l.n === n), at = (n, o = 0) => LN(n).start + o, end = (n, o = 0) => LN(n).end + o;

/* ---------- renderer ---------- */
const renderer = new T.WebGLRenderer({ canvas: $('gl'), antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(2); renderer.setSize(1920, 1080, false); renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
const envTex = (() => { const env = new T.Scene(); const panel = (c, w, h, x, y, z) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: c, side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
  env.background = new T.Color(0x04060a); panel(0xb7bfcc, 12, 6, 0, 12, 4); panel(0x8a93a6, 5, 16, -14, 2, -4); panel(0x3a4a6a, 4, 18, 14, 3, -8); panel(0xffd9a8, 8, 3, 8, 4, 12); panel(0x0c1322, 40, 40, 0, -10, 0);
  const pm = new T.PMREMGenerator(renderer); const t = pm.fromScene(env, .04).texture; pm.dispose(); return t; })();
function mkSet(fogNear, fogFar, lightOpts) {
  const scene = new T.Scene(); scene.background = new T.Color(0x05070c); scene.environment = envTex; if (fogNear) scene.fog = new T.Fog(0x05070c, fogNear, fogFar);
  const cam = new T.PerspectiveCamera(32, 16 / 9, 0.05, 20000); const c = { tx: 0, ty: 0, tz: 0, az: 0.6, el: 0.5, dist: 10, fov: 32 };
  const lights = studio(scene, lightOpts); return { scene, cam, c, lights, dark: { v: 0 } };
}
function placeCam(S) { const { cam, c } = S; cam.fov = c.fov; cam.updateProjectionMatrix();
  cam.position.set(c.tx + c.dist * Math.sin(c.az) * Math.cos(c.el), c.ty + c.dist * Math.sin(c.el), c.tz + c.dist * Math.cos(c.az) * Math.cos(c.el)); cam.lookAt(c.tx, c.ty, c.tz); cam.updateMatrixWorld(); }
const ground = (scene, size, shadow = .8) => { const g = new T.Mesh(new T.PlaneGeometry(size, size), new T.ShadowMaterial({ opacity: shadow })); g.rotation.x = -PI / 2; g.receiveShadow = true; scene.add(g); return g; };

/* ---------- set 0: OPEN (1 unit = 1 cm) ---------- */
const OPEN = mkSet(0, 0, { keyPos: [-14, 9, 7], keyInt: 1.7, hemi: 0.07, shadowSize: 40 }); ground(OPEN.scene, 200);
const openPucks = []; for (let i = 0; i < 4; i++) { const p = makePuck(); p.g.rotation.x = PI; p.g.position.set(i * 6.5, 0.55, 0); p.g.visible = i === 0; OPEN.scene.add(p.g); const a = FX.ao(4.4, 0.7); a.position.x = i * 6.5; p.g.userData.ao = a; OPEN.scene.add(a); openPucks.push(p); }
const openSt = { n: 1 }; Object.assign(OPEN.c, { tx: 0, ty: 0.3, tz: 0, az: 0.9, el: 0.3, dist: 8, fov: 28 });

/* ---------- set 1: IRAN (km) ---------- */
const IRAN = mkSet(1400, 4200, { keyPos: [-1800, 700, 600], keyInt: 1.5, hemi: .12, shadowSize: 1800, shadowMap: 4096 }); IRAN.lights.key.shadow.camera.far = 6000;
const iranTerr = heightMesh(D.iran, 0, 0, 1280, 1024, 2, 5, 3400); IRAN.scene.add(iranTerr.mesh);
IRAN.scene.add(borderLines(iranTerr, D.borders, null, 0x2a3a5e, 0.5, 0.7)); IRAN.scene.add(borderLines(iranTerr, D.borders, ['Iran'], 0x7fa0e0, 0.9, 0.6)); IRAN.scene.add(borderLines(iranTerr, D.borders, ['Iran'], 0x9fb8e8, 1.6, 1));
const DEH = [50.5629, 30.7924], WALK = [50.883, 30.513], IRANC = iranTerr.lonLatToWorld(52.0, 30.8); Object.assign(IRAN.c, { tx: IRANC.x, ty: 0, tz: IRANC.z, az: -0.3, el: 0.8, dist: 1500, fov: 30 });
const dehW = iranTerr.lonLatToWorld(WALK[0], WALK[1], 0); const dehTown = iranTerr.lonLatToWorld(DEH[0], DEH[1], 0);
const mkCone = (col) => { const g = new T.Group(); const d = new T.Mesh(new T.CylinderGeometry(6, 6, 1.5, 32), new T.MeshStandardMaterial({ color: 0, emissive: new T.Color(col).convertSRGBToLinear(), emissiveIntensity: 1.6, toneMapped: false })); g.add(d); const l = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(0, 0, 0), new T.Vector3(0, 30, 0)]), new T.LineBasicMaterial({ color: col, transparent: true, opacity: 0.6 })); g.add(l); g.material = d.material; return g; };
const wsoCone = mkCone(0x4d8dff), pilotCone = mkCone(0x4d8dff); IRAN.scene.add(wsoCone, pilotCone); const pilotW = iranTerr.lonLatToWorld(DEH[0] - 0.12, DEH[1] + 0.02, 0);
const iranSt = { drop: 0, pilot: 0 }; wsoCone.visible = pilotCone.visible = false;
const fanFrom = []; for (let i = 0; i < 12; i++) { const a = -2.6 + i * 0.19; fanFrom.push(iranTerr.lonLatToWorld(WALK[0] + 3.5 * Math.sin(a) - 1.0, WALK[1] + 2.5 * Math.cos(a) - 2.0, 40)); }
const fan = FX.dfLines(fanFrom, dehW.clone().add(new T.Vector3(0, 30, 0)), 0x39ff8a); IRAN.scene.add(fan.g);

/* ---------- set 2: ZAGROS (km) ---------- */
const ZAG = mkSet(16, 48, { keyPos: [-30, 11, 14], keyInt: 1.6, hemi: .1, shadowSize: 30, shadowMap: 4096 });
const rp = D.route.pucks, rcx = rp.reduce((s, p) => s + p.px, 0) / 4, rcy = rp.reduce((s, p) => s + p.py, 0) / 4, WIN = 800;
const zx0 = Math.round(clamp(rcx - WIN / 2, 0, D.zagros.w - WIN)), zy0 = Math.round(clamp(rcy - WIN / 2, 0, D.zagros.h - WIN));
const zag = heightMesh(D.zagros, zx0, zy0, WIN, WIN, 1, 1.4, 3250); ZAG.scene.add(zag.mesh);
const PW = rp.map(p => zag.toWorld(p.px, p.py, 0)); const RC = PW[1].clone().add(PW[2]).multiplyScalar(0.5);
Object.assign(ZAG.c, { tx: RC.x, ty: RC.y, tz: RC.z, az: -2.3, el: 0.55, dist: 22, fov: 32 }); ZAG.lights.key.target.position.copy(RC); ZAG.lights.key.position.copy(RC).add(new T.Vector3(-30, 11, 14));
const pm = rp.map((p, i) => { const m = marker(null); m.g.position.copy(PW[i]); m.g.scale.setScalar(0.35); m.g.visible = false; m.g.add(FX.ao(0.45, 0.6)); ZAG.scene.add(m.g); return m; });
const HIDE = PW[2]; const hideGlow = FX.glow(0x4d8dff, 0.5); hideGlow.position.copy(HIDE).add(new T.Vector3(0, 0.15, 0)); hideGlow.visible = false; ZAG.scene.add(hideGlow);
const pulses = [0, 1, 2].map(() => { const r = FX.ring(0x4d8dff, 10); r.m.position.copy(HIDE).add(new T.Vector3(0, 0.03, 0)); ZAG.scene.add(r.m); return r; });
const beam = new T.Line(new T.BufferGeometry().setFromPoints([HIDE.clone().add(new T.Vector3(0, 0.05, 0)), HIDE.clone().add(new T.Vector3(0.4, 6, -0.3))]), new T.LineDashedMaterial({ color: 0x4d8dff, dashSize: 0.15, gapSize: 0.1, transparent: true, opacity: 0 })); beam.computeLineDistances(); ZAG.scene.add(beam);
const valley = [[-4.5, 3.0], [-5.5, 0.5], [-3.0, 4.5]].map(([dx, dz]) => zag.toWorld(rp[2].px + dx / zag.mpp, rp[2].py + dz / zag.mpp, 0.05));
const df = FX.dfLines(valley, HIDE.clone().add(new T.Vector3(0, 0.1, 0)), 0xff5a4a); ZAG.scene.add(df.g);
const glows = PW.map(p => { const g = FX.glow(0x4d8dff, 0.3); g.position.copy(p).add(new T.Vector3(0, 0.12, 0)); g.visible = false; ZAG.scene.add(g); return g; });
const legs = [0, 1, 2].map(i => { const L = FX.path(zag, [[rp[i].px, rp[i].py], [rp[i + 1].px, rp[i + 1].py]], 0xffd84a, 0.05, 60); ZAG.scene.add(L.line); return L; });
const party = [0, 1, 2].map(i => { const f = FX.figure(); f.scale.setScalar(0.6); f.visible = false; ZAG.scene.add(f); return f; }); const partySt = { k: 0 };
const heliG = FX.heli(); heliG.scale.setScalar(1.3); heliG.visible = false; ZAG.scene.add(heliG); ZAG.scene.add(heliG.userData.tether, heliG.userData.groundRing); const heliSt = { k: 0, orbit: 0, bank: 0 };
const heliFrom = RC.clone().add(new T.Vector3(-9, 1.0, 12)), heliTo = RC.clone().add(new T.Vector3(2.2, 0.55, -2.2));
const heliPath = new T.QuadraticBezierCurve3(heliFrom, RC.clone().add(new T.Vector3(-2.5, 0.9, 3.0)), heliTo);
const worldToPx = (v) => [v.x / zag.mpp + zx0 + WIN / 2, v.z / zag.mpp + zy0 + WIN / 2];
const bigPulse = [0, 1].map(() => { const r = FX.ring(0x39ff8a, 20); ZAG.scene.add(r.m); return r; });
const challenge = FX.dfLines([new T.Vector3()], PW[0].clone().add(new T.Vector3(0, 0.1, 0)), 0x39ff8a); ZAG.scene.add(challenge.g);
const footFinder = FX.figure(); footFinder.children[0].material.color.set(0x39ff8a); footFinder.children[1].material.color.set(0x39ff8a); footFinder.position.copy(PW[0]); footFinder.scale.setScalar(0.5); footFinder.visible = false; ZAG.scene.add(footFinder);
const rangeRings = []; const errBig = FX.ring(0xffb44a, 3), errSmall = FX.ring(0x4d8dff, 3); [errBig, errSmall].forEach(r => { r.m.position.copy(PW[3]).add(new T.Vector3(0, 0.04, 0)); ZAG.scene.add(r.m); });
const reportRings = [1, 2, 3, 0, 1, 2].map(i => { const r = FX.ring(0x4d8dff, 3); r.m.position.copy(PW[i]).add(new T.Vector3(0, 0.03, 0)); ZAG.scene.add(r.m); return r; });
const answers = [0, 2, 3].map(i => { const r = FX.ring(0x39ff8a, 3); r.m.position.copy(PW[i]).add(new T.Vector3(0, 0.03, 0)); ZAG.scene.add(r.m); return r; });

/* ---------- set 3: PUCK (cm) ---------- */
const PK = mkSet(0, 0, { keyPos: [-12, 8, 9], keyInt: 1.8, hemi: 0.07, shadowSize: 40 }); ground(PK.scene, 200, 0.8);
const pk = makePuck(); pk.g.position.y = 0.55; PK.scene.add(pk.g); const pkAo = FX.ao(4.4, 0.7); PK.scene.add(pkAo);
for (const n of ['radio', 'baro', 'accel', 'hall', 'cell']) { const o = pk.parts[n]; o.material = o.material.clone(); o.material.emissive = new T.Color(0x4d8dff); o.material.emissiveIntensity = 0; }
const hl = { radio: 0, baro: 0, accel: 0, hall: 0, cell: 0 };
const quarter = new T.Mesh(new T.CylinderGeometry(1.215, 1.215, 0.175, 64), mats.cell); quarter.position.set(3.3, 0.09, 1.0); quarter.castShadow = true; quarter.visible = false; PK.scene.add(quarter);
const pk1 = makePuck(); pk1.g.position.set(-6, 0.55, 0); pk1.g.visible = false; PK.scene.add(pk1.g); const pk1Ao = FX.ao(4.4, 0.7); pk1Ao.position.x = -6; PK.scene.add(pk1Ao);
const magnet = new T.Mesh(new T.BoxGeometry(1.6, 0.03, 0.6), new T.MeshStandardMaterial({ color: new T.Color(0xe8e3d6).convertSRGBToLinear(), metalness: 0, roughness: 0.7 })); magnet.castShadow = true; magnet.visible = false; PK.scene.add(magnet); const magSt = { k: 0 };
const pkPos = { x: 0, z: 0, y: 0.55, bounce: 0 }; const pk1Pos = { x: -6, z: 0, bounce: 0 }; const pairRing = FX.ring(0x4d8dff, 6, true); PK.scene.add(pairRing.m); const armRing = FX.ring(0x4d8dff, 3, true); PK.scene.add(armRing.m);
const cnt = { steps: 0, hdg: 45, alt: 2480 }; const pkLed = { i: 0 };
const reportRing = FX.ring(0x4d8dff, 6, true), ackRing = FX.ring(0x4d8dff, 6, true); PK.scene.add(reportRing.m, ackRing.m); ackRing.m.position.set(-6, 0.03, 0);
const trail = (() => { const pts = []; for (let i = 0; i <= 40; i++) pts.push(new T.Vector3(-6 + i / 40 * 12, 0.02, -i / 40 * 7)); const g = new T.BufferGeometry().setFromPoints(pts); const l = new T.Line(g, new T.LineDashedMaterial({ color: 0x4d8dff, dashSize: .4, gapSize: .3, transparent: true, opacity: .6 })); l.computeLineDistances(); l.visible = false; PK.scene.add(l); return l; })();
Object.assign(PK.c, { tx: 0, ty: 0.4, tz: 0, az: 0.75, el: 0.45, dist: 11, fov: 30 });

/* ---------- set 4: KIT (cm) ---------- */
const KT = mkSet(0, 0, { keyPos: [-26, 18, 16], keyInt: 1.6, hemi: 0.08, shadowSize: 60 }); const kit = makeKit(); KT.scene.add(kit.g);
Object.assign(KT.c, { tx: 3, ty: 1.5, tz: 0, az: 0.55, el: 0.55, dist: 40, fov: 30 });

const SETS = [OPEN, IRAN, ZAG, PK, KT]; const cutSt = { i: 0 }, fadeSt = { a: 0 };

/* ---------- DOM state ---------- */
const intro = { k: 0 }; const ui = { hud: 0, chip: 0, chipKind: 0, h1: 0, state: 0, stateVis: 0, scale: 0, atak: 0, boston: 0, card1: 0, card2: 0, card2Kind: 0, card3: 0 };
const H1 = ['', 'Iran, <b>April 2026</b>', 'The <b>Zagros</b>', 'The <b>dipcan</b>', 'The <b>walk</b>', 'The <b>finder</b>', 'What the chain <b>gave the team</b>'];
const CHIP = ['Modeled route', 'Production size'];
const STATE = ['Dormant', 'Activating', 'Paired', 'Carried', 'Placed', 'Armed', 'Listening', 'Bricked'];
const CARD2 = [['Live test, <b>Boston</b>', 'Activation on the bench.'], ['Live test, <b>Boston</b>', 'The walk from 60 State Street.'], ['Live test, <b>Boston</b>', 'The sweep.']];
document.querySelectorAll('.card').forEach(c => c.style.zIndex = 6); $('fade').style.zIndex = 5; $('cap').style.zIndex = 7;

/* ---------- ATAK + Boston panels ---------- */
const [ax0, ay0, aw, ah] = [1059, 1361, 160, 150];
const atakNodes = rp.map((p, i) => ({ id: p.id, x: (p.px - ax0) / aw * 760, y: (p.py - ay0) / ah * 716, label: [`${p.coaElevM.toLocaleString()} m · anchor`, `${rp[1].coaElevM.toLocaleString()} m`, `${rp[2].coaElevM.toLocaleString()} m · 6 h`, `${rp[3].coaElevM.toLocaleString()} m · 4 h`][i] }));
atakNodes[2].dy = 0; atakNodes[3].dy = -78; atakNodes[1].dy = 0;
const atak = atakPanel($('atakSvg'), '../data/atak-bg.png', atakNodes); Object.assign(atak.st, { zoom: 2.2, cx: 376, cy: 372, selfX: 236, selfY: 512 }); atak.apply();
const atakClock = { i: 0 }; const CLOCK = ['02:40', '02:45', '03:30'];
const START = [-71.056579, 42.359678];
const walk = [START, [-71.0548, 42.3597], [-71.0535, 42.3604], [-71.0522, 42.3612], [-71.0509, 42.3618]];
const boston = bostonPanel($('bostonSvg'), D.boston, walk, START);

/* ---------- callouts ---------- */
const CO = [];
function co(t, s, side, set, anchor, t0, t1, cls = '') { const d = document.createElement('div'); d.className = 'co ' + (side === 'r' ? 'r' : 'l'); d.innerHTML = `<div class="t">${t}</div><div class="s ${cls}">${s}</div>`; $('labels').appendChild(d);
  const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'), ci = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); ci.setAttribute('r', 4); $('lines').append(pl, ci);
  const o = { t, s, side, set, anchor, t0, t1, d, pl, ci, sub: d.querySelector('.s') }; CO.push(o); return o; }
const V = (x, y, z) => new T.Vector3(x, y, z);
// S2
co('Dehdasht', 'Kohgiluyeh and Boyer-Ahmad', 'l', IRAN, () => dehTown.clone().add(V(0, 12, 0)), at(4), end(9));
co('Persian Gulf', '', 'l', IRAN, () => iranTerr.lonLatToWorld(50.6, 28.6, 10), at(4), end(7));
co('Tehran', '', 'r', IRAN, () => iranTerr.lonLatToWorld(51.39, 35.69, 10), at(4), end(4));
co('Zagros Mountains', 'Limestone ridges, 2,000 to 4,400 m', 'r', IRAN, () => iranTerr.lonLatToWorld(50.0, 33.2, 40), at(4), end(4));
co('Pilot', 'Recovered within hours', 'r', IRAN, () => pilotW.clone().add(V(0, 60, 0)), at(6), end(6, 1.5), 'green');
co('Dude 44 Bravo', 'Alone about 48 hours', 'l', IRAN, () => dehW.clone().add(V(0, 60, 0)), at(7), end(9));
co('155 aircraft', 'April 5, 2026', 'r', IRAN, () => fanFrom[6].clone(), at(8, 1.2), end(9));
// S3
co('Dehdasht', '45 km northwest', 'l', ZAG, () => zag.toWorld(zx0 + 20, zy0 + 40, 0.8), at(10), end(11));
co('Hide site', 'South face, 2,890 m', 'r', ZAG, () => HIDE.clone().add(V(0, 0.5, 0)), at(12), end(13));
co('Survival radio burst', 'Encrypted, up to a satellite', 'l', ZAG, () => HIDE.clone().add(V(0.2, 2.6, -0.15)), at(12), end(12, 0.6));
co('Direction-found', 'From the valley floor', 'l', ZAG, () => valley[1].clone().add(V(0, 0.3, 0)), at(13, 0.8), end(13), 'red');
co('Quiet', 'No beacon, no broadcast', 'r', ZAG, () => PW[1].clone().add(V(0, 0.8, 0)), at(15, 0.6), end(15));
// S4
co('32 mm · ~15 g · ~$15', '', 'r', PK, () => V(0, 1.6, 0), at(16), end(16), 'tbd');
co('US quarter', '24 mm, for scale', 'l', PK, () => V(3.3, 0.3, 1.0), at(16), end(16));
co('Long-range radio', 'Listens for the team. Answers once, when asked', 'l', PK, () => pk.parts.radio.getWorldPosition(new T.Vector3()), at(18), end(18));
co('Barometer', 'Measures altitude to about a meter', 'r', PK, () => pk.parts.baro.getWorldPosition(new T.Vector3()), at(19), end(19));
co('Motion sensor', 'Counts steps while carried. Feels a pickup after the drop', 'r', PK, () => pk.parts.accel.getWorldPosition(new T.Vector3()), at(20), end(20));
co('Pull tab', 'Pulling it connects the battery. Nothing else can start it', 'l', PK, () => pk.parts.hall.getWorldPosition(new T.Vector3()), at(17, 0.8), end(17, 1.6));
co('Battery', 'A coin cell. Months asleep, days of listening', 'l', PK, () => pk.parts.cell.getWorldPosition(new T.Vector3()), at(17, 1.2), end(17, 1.6), 'tbd');
co('Pull tab', 'Only he can start it', 'l', PK, () => pk.g.position.clone().add(V(-1.3, 0.55, 0.5)), at(21, 1.6), end(21, 0.8));
co('The team\'s key', 'Signs every question it will answer', 'r', PK, () => pk.g.position.clone().add(V(1.3, 0.55, 0.5)), at(21, 2.0), end(21, 0.8));
// S5
co('Paired', 'It buzzes once. Sixty seconds to set it down', 'r', PK, () => V(pkPos.x, 2.2, pkPos.z), at(23, 0.8), end(23));
co('The next one', 'He will carry it', 'l', PK, () => V(pk1Pos.x, 2.2, pk1Pos.z), at(23), end(23));
const cntCo = co('Carried', '', 'r', PK, () => V(pk1Pos.x, 2.0, pk1Pos.z), at(24), end(59));
co('Pull tab', 'Connects the battery. In the demo build, a wire he cuts', 'l', PK, () => V(pkPos.x - 1.9, 0.6, pkPos.z + 0.9), at(22, 0.3), end(22));
co('Sixty seconds', 'Then tamper protection is live', 'r', PK, () => V(pkPos.x, 2.0, pkPos.z), at(25, 0.4), end(25));
co('The whisper', 'Its leg, sent back to the dipcan before it', 'r', PK, () => V(pk1Pos.x, 2.0, pk1Pos.z), at(26, 1.2), end(26));
co('Acknowledged', 'Both now hold the leg', 'l', PK, () => V(pkPos.x, 1.6, pkPos.z), at(26, 3.0), end(26));
co('Listening', 'Answers only a question signed with the team\'s key', 'r', PK, () => V(pkPos.x, 2.0, pkPos.z), at(27), end(27));
// S6
co('Dipcan 1 · 2,480 m', 'The first one, under a rock', 'l', ZAG, () => PW[0].clone().add(V(0, 0.45, 0)), at(29), at(32));
const legCo = co('Walking', '', 'r', ZAG, () => legs[0].at(legs[0].st.k).clone().add(V(0, 0.5, 0)), at(31), end(31));
co('Dipcan 2 · 2,610 m', '740 steps northeast, 130 m up', 'r', ZAG, () => PW[1].clone().add(V(0, 0.45, 0)), at(32), end(33));
co('Leg reported', 'Dipcan 1 now knows where dipcan 2 is', 'l', ZAG, () => PW[0].clone().add(V(0, 0.45, 0)), at(33, 1.2), end(33));
co('Adversary search party', '15:10', 'l', ZAG, () => party[1].position.clone().add(V(0, 0.5, 0)), at(34), end(34), 'red');
co('Dipcan 2 bricked', 'Picked up at 15:10. Keys erased', 'r', ZAG, () => PW[1].clone().add(V(0, 0.45, 0)), at(35), end(35), 'red');
co('Dipcan 3 · 2,890 m', '1,100 steps north-northeast, 280 m up', 'r', ZAG, () => PW[2].clone().add(V(0, 0.45, 0)), at(36, 1.5), end(37));
co('Dipcan 4 · 2,940 m', 'A crevice just over the crest', 'r', ZAG, () => PW[3].clone().add(V(0, 0.45, 0)), at(37, 1.2), end(37));
co('Red mark', 'The last one in his vest. The trail ends here', 'r', ZAG, () => PW[3].clone().add(V(0, 0.45, 0)), at(65, 0.6), end(65), 'red');
co('600 m', 'Leg 1', 'r', ZAG, () => legs[0].at(0.5).clone().add(V(0, 0.08, 0)), at(38), end(39));
co('900 m', 'Leg 2', 'r', ZAG, () => legs[1].at(0.5).clone().add(V(0, 0.08, 0)), at(38, 0.3), end(39));
co('200 m', 'Leg 3', 'r', ZAG, () => legs[2].at(0.5).clone().add(V(0, 0.08, 0)), at(38, 0.6), end(39));
co('1.7 km · +460 m', 'Four dipcans, one night', 'r', ZAG, () => PW[3].clone().add(V(0, 0.9, 0)), at(38, 0.9), end(39));
// S7
co('Small computer', 'Holds the team\'s key and builds the chain. A Raspberry Pi 5', 'l', KT, () => kit.parts.pi.getWorldPosition(new T.Vector3()).add(V(0, 1.5, 0)), at(40, 0.3), end(41));
co('Long-range radio', 'Sends the question, hears the answers', 'l', KT, () => kit.parts.bridge.getWorldPosition(new T.Vector3()).add(V(0, 1, 0)), at(40, 0.7), end(41));
co('Phone running ATAK', 'Shows the chain on the map the team already uses', 'r', KT, () => kit.parts.phone.getWorldPosition(new T.Vector3()).add(V(0, 1, 0)), at(40, 1.1), end(41));
co('VTOL drone, 15 km out', 'A small Group 2 drone carries the interrogator, 300 m above the ridge', 'l', ZAG, () => heliG.position.clone().add(V(0, 0.12, 0)), at(42, 0.4), end(42));
co('Loitering, 3 km out', '', 'l', ZAG, () => heliG.position.clone().add(V(0, 0.25, 0)), at(60), end(60));
co('One question, answers in turn', 'Each dipcan replies in the time slot its number gives it', 'l', ZAG, () => heliG.position.clone().add(V(0, 0.6, 0)), at(43), end(43));
co('Dipcan 2 silent', 'Picked up at 15:10', 'r', ZAG, () => PW[1].clone().add(V(0, 0.45, 0)), at(43, 1.2), end(43), 'red');
co('Dipcan 4 answers', 'Number 4. 2,940 m. Dropped 4 hours ago. 200 steps north-northeast, 50 m up. Last in the chain', 'r', ZAG, () => PW[3].clone().add(V(0, 0.5, 0)), at(44), end(44));
co('A recorded question gets nothing', 'Each one is numbered and never repeats', 'l', ZAG, () => heliG.position.clone().add(V(0, 0.6, 0)), at(45, 1.0), end(45), 'tbd');
co('Points at the next', 'Both ends of every leg know it', 'r', ZAG, () => PW[2].clone().add(V(0, 0.7, 0)), at(60, 0.4), end(60));
co('Range', 'A few km, line of sight', 'l', ZAG, () => PW[0].clone().add(V(0, 0.7, 0)), at(61, 1.2), end(61));
co('2 km circle', 'If the walk were one 20 km leg', 'r', ZAG, () => PW[3].clone().add(V(2.0, 0.3, 0)), at(62, 1.4), end(62), 'tbd');
co('600 m circle', 'Three legs, reset at each dipcan', 'r', ZAG, () => PW[3].clone().add(V(0.6, 0.3, 0.6)), at(62, 3.2), end(62));
co('A cone along his track', 'Where he was, when, and which way', 'l', ZAG, () => PW[3].clone().add(V(0, 0.9, 0)), at(63, 1.0), end(63));
co('No pointer to a next', 'He is still carrying one. He is close', 'l', ZAG, () => PW[3].clone().add(V(0, 0.9, 0)), at(64, 0.4), end(64));
co('Where to look', 'One north face', 'l', ZAG, () => PW[3].clone().add(V(0, 0.9, 0)), at(50, 1.2), end(50));
// S8
co('North side of the ridge', '', 'r', ZAG, () => PW[3].clone().add(V(0, 0.5, 0)), at(52), end(52));
co('2,940 m, just over the crest', '', 'l', ZAG, () => PW[3].clone().add(V(0, 1.3, 0)), at(52, 0.4), end(52));
co('Moving at 22:15', '', 'r', ZAG, () => PW[2].clone().add(V(0, 0.5, 0)), at(52, 0.8), end(52));
co('Enemy at 15:10, no higher', '', 'l', ZAG, () => PW[1].clone().add(V(0, 0.5, 0)), at(52, 1.2), end(52), 'red');
co('No GPS · no sky · about 15 dollars', 'Dropped and forgotten', 'l', ZAG, () => PW[0].clone().add(V(0, 0.5, 0)), at(57), end(57));
co('Last point he was free', 'The chain keeps answering', 'r', ZAG, () => PW[3].clone().add(V(0, 0.6, 0)), at(58), end(58));

/* ---------- timeline ---------- */
const tl = gsap.timeline({ paused: true });
const cut = (i, t, f = 0.5) => { tl.to(fadeSt, { a: 1, duration: f * 0.5, ease: 'none' }, t - f * 0.5); tl.set(cutSt, { i }, t); tl.to(fadeSt, { a: 0, duration: f * 0.6, ease: 'none' }, t); };
const camTo = (S, props, t, d, ease = 'power2.inOut') => tl.to(S.c, { ...props, duration: d, ease }, t);
const pulse = (r, t, rMax, d, a = 0.9) => { tl.set(r.st, { r: 0.05, a }, t); tl.to(r.st, { r: rMax, duration: d, ease: 'power1.out' }, t); tl.to(r.st, { a: 0, duration: d, ease: 'power1.in' }, t); };
// S1
tl.set(cutSt, { i: 0 }, 0); tl.set(fadeSt, { a: 1 }, 0); tl.to(fadeSt, { a: 0, duration: 1.2 }, 0.2);
for (let i = 1; i < 4; i++) tl.set(openSt, { n: i + 1 }, at(2, 0.25 * i)); camTo(OPEN, { tx: 9.5, az: 1.1, dist: 24, el: 0.3 }, at(2), 3.2);
tl.to(fadeSt, { a: 1, duration: 1.0, ease: 'power1.inOut' }, at(3) - 1.1); tl.to(ui, { card1: 1, duration: 0.8 }, at(3) - 0.4); tl.set(intro, { k: 0 }, at(3) - 0.4); tl.to(intro, { k: 1, duration: 3.2, ease: 'none' }, at(3, 0.3));
// S2
cut(1, at(4)); tl.set(ui, { card1: 0 }, at(4)); tl.set(ui, { hud: 1, h1: 1 }, at(4));
camTo(IRAN, { dist: 1100, el: 0.7, az: -0.4 }, at(4), end(9) - at(4), 'power1.inOut');
tl.set(wsoCone, { visible: true }, at(5)); tl.set(pilotCone, { visible: true }, at(5)); tl.to(iranSt, { drop: 1, duration: 1.3, ease: 'power2.in' }, at(5));
tl.to(iranSt, { pilot: 1, duration: 1.6, ease: 'power2.inOut' }, at(6, 0.3));
tl.to(fan.st, { k: 1, duration: 2.6, ease: 'power1.out' }, at(8, 0.2));
// S3
cut(2, at(10)); tl.set(ui, { h1: 2, hud: 1 }, at(10)); tl.set(ui, { scale: 1 }, at(11)); tl.set(ui, { scale: 0 }, end(11, 0.5));
camTo(ZAG, { az: -1.55, el: 0.5, dist: 18 }, at(10), end(11) - at(10), 'none');
tl.set(pm[2].g, { visible: true }, at(12)); tl.set(pm[2].g, { visible: false }, at(16)); tl.to(beam.material, { opacity: 0.8, duration: 0.4 }, at(12, 0.6)); tl.to(beam.material, { opacity: 0, duration: 1.0 }, at(13, 1.5));
pulse(pulses[0], at(12, 0.6), 3.5, 2.6, 0.45); pulse(pulses[1], at(13, 0.8), 3.5, 2.6, 0.45);
tl.to(df.st, { k: 1, duration: 2.0, ease: 'power2.out' }, at(13, 0.4));
tl.to(df.st, { k: 0, duration: 1.2 }, at(14, 0.3)); tl.to(ZAG.dark, { v: 1, duration: 2.5 }, at(14, 0.5));
pm.forEach((m, i) => { tl.set(m.g, { visible: true }, at(15, 0.4 + i * 0.35)); tl.set(m.g, { visible: false }, at(16)); });
// S4
cut(3, at(16)); tl.set(ui, { h1: 3, chipKind: 1, chip: 1 }, at(16)); tl.set(ui, { chip: 0 }, end(16, 0.5)); tl.set(quarter, { visible: true }, at(16)); tl.set(quarter, { visible: false }, at(17));
camTo(PK, { az: 1.05, el: 0.42, dist: 12.5 }, at(16), 3);
tl.to(pk.state, { k: 1, duration: 2.2, ease: 'power2.inOut' }, at(17)); tl.to(pk.state, { shellOpacity: 0.3, duration: 1.2 }, at(17, 0.8)); camTo(PK, { az: 0.95, el: 0.62, dist: 12.5, ty: 1.0 }, at(17), 2.2);
for (const [n, l] of [['radio', 18], ['baro', 19], ['accel', 20]]) { tl.to(hl, { [n]: 1, duration: 0.5 }, at(l)); tl.to(hl, { [n]: 0, duration: 0.6 }, end(l) - 0.3); }
tl.to(pk.state, { k: 0, duration: 1.6, ease: 'power2.inOut' }, at(21)); tl.to(pk.state, { shellOpacity: 1, duration: 0.8 }, at(21, 0.6)); camTo(PK, { az: 0.75, el: 0.45, dist: 11, ty: 0.4 }, at(21), 1.6);
tl.to(fadeSt, { a: 1, duration: 0.5 }, end(21, 0.5)); tl.set(ui, { card2Kind: 0 }, end(21)); tl.to(ui, { card2: 1, duration: 0.4 }, end(21, 0.8)); tl.to(ui, { card2: 0, duration: 0.4 }, end(21, 3.1));
// S5
cut(3, at(22), 0.6); tl.set(ui, { h1: 3, stateVis: 1, state: 0 }, at(22)); tl.set(pk1.g, { visible: true }, at(22)); tl.set(magnet, { visible: true }, at(22));
camTo(PK, { tx: -2.5, az: 0.9, el: 0.5, dist: 16 }, at(22), 1.2);
tl.set(magSt, { k: 0 }, at(22)); tl.to(magSt, { k: 1, duration: 1.0, ease: 'power2.in' }, at(22, 0.3)); tl.set(pkLed, { i: 1 }, at(22, 1.3)); tl.set(pkLed, { i: 0 }, at(22, 1.9)); tl.set(ui, { state: 1 }, at(22, 1.3)); tl.set(magnet, { visible: false }, at(22, 2.9));
tl.set(ui, { state: 2 }, at(23, 0.8)); camTo(PK, { tx: -2.5, az: 0.9, el: 0.5, dist: 16 }, at(23), 1.0);
pulse(pairRing, at(23, 0.3), 2.2, 0.9, 0.7); tl.set(pkLed, { i: 1 }, at(23, 0.9)); tl.set(pkLed, { i: 0 }, at(23, 1.3));
tl.set(armRing.st, { a: 0.8, r: 0.05 }, at(23, 1.6)); tl.to(armRing.st, { r: 2.6, duration: end(25) - at(23, 1.6) - 0.6, ease: 'none' }, at(23, 1.6));
tl.set(ui, { state: 4 }, at(25)); tl.to(pkPos, { bounce: 1, duration: 0.35, ease: 'power2.out' }, at(25)); tl.to(pkPos, { bounce: 0, duration: 0.35, ease: 'bounce.out' }, at(25, 0.35));
tl.set(ui, { state: 5 }, end(25) - 0.5); tl.to(armRing.st, { a: 0, duration: 0.6 }, end(25) - 0.5);
tl.set(ui, { state: 3 }, at(24)); tl.set(trail, { visible: true }, at(24)); tl.to(pk1Pos, { x: 6, z: -7, duration: end(59) - at(24) - 0.3, ease: 'power1.inOut' }, at(24)); tl.to(cnt, { steps: 312, alt: 2531, duration: end(59) - at(24) - 0.3, ease: 'none' }, at(24));
camTo(PK, { tx: 1, tz: -3.5, az: 0.9, el: 0.5, dist: 22 }, at(24), end(59) - at(24) - 0.3, 'power1.inOut');
tl.to(pk1Pos, { bounce: 1, duration: 0.3, ease: 'power2.out' }, at(26)); tl.to(pk1Pos, { bounce: 0, duration: 0.35, ease: 'bounce.out' }, at(26, 0.3)); tl.set(ui, { state: 5 }, at(26));
pulse(reportRing, at(26, 1.4), 7, 1.6, 0.7); pulse(ackRing, at(26, 3.0), 2.5, 1.0, 0.7);
tl.set(ui, { state: 6 }, at(27)); tl.set(ui, { stateVis: 0 }, end(27, 0.4));
// S6
cut(2, at(28)); tl.set(ui, { h1: 4, chipKind: 0, chip: 1 }, at(28)); tl.to(ZAG.dark, { v: 0, duration: 1.5 }, at(28)); pm.forEach(m => tl.set(m.g, { visible: false }, at(28)));
camTo(ZAG, { tx: PW[0].x, ty: PW[0].y, tz: PW[0].z, az: -2.0, el: 0.6, dist: 7, fov: 32 }, at(28), LN(28).dur, 'power1.inOut');
tl.set(pm[0].g, { visible: true }, at(29, 0.8)); tl.set(pm[0].led, { visible: true }, at(29));
tl.to(ZAG.dark, { v: 0.6, duration: 1.0 }, at(31)); tl.to(ZAG.dark, { v: 0, duration: 1.5 }, at(32)); tl.to(ZAG.dark, { v: 0.6, duration: 1.5 }, at(36)); tl.to(legs[0].st, { k: 1, duration: LN(31).dur, ease: 'none' }, at(31)); camTo(ZAG, { tx: PW[1].x, ty: PW[1].y, tz: PW[1].z, dist: 8 }, at(31), LN(31).dur, 'none');
tl.set(pm[1].g, { visible: true }, at(32, 0.6)); pulse(reportRings[0], at(33, 0.4), 0.9, 1.2, 0.7); pulse(reportRings[3], at(33, 1.3), 0.45, 0.9, 0.7);
tl.set(partySt, { k: 0 }, at(34)); party.forEach(f => tl.set(f, { visible: true }, at(34))); tl.to(partySt, { k: 1, duration: LN(34).dur, ease: 'none' }, at(34));
tl.set(pm[1].led, { visible: true }, at(35)); party.forEach(f => tl.set(f, { visible: false }, at(35, 1.2)));
tl.to(legs[1].st, { k: 1, duration: LN(36).dur * 0.8, ease: 'none' }, at(36)); camTo(ZAG, { tx: PW[2].x, ty: PW[2].y, tz: PW[2].z, dist: 9, az: -2.2 }, at(36), LN(36).dur, 'none'); tl.set(pm[2].g, { visible: true }, at(36, LN(36).dur * 0.8)); pulse(reportRings[1], at(36, LN(36).dur * 0.85), 0.9, 1.2, 0.6); pulse(reportRings[4], at(36, LN(36).dur * 0.85 + 0.8), 0.45, 0.9, 0.6);
tl.to(legs[2].st, { k: 1, duration: LN(37).dur * 0.5, ease: 'none' }, at(37)); camTo(ZAG, { tx: PW[3].x, ty: PW[3].y, tz: PW[3].z, dist: 7, az: -2.4, el: 0.5 }, at(37), LN(37).dur, 'none'); tl.set(pm[3].g, { visible: true }, at(37, LN(37).dur * 0.5)); pulse(reportRings[2], at(37, LN(37).dur * 0.55), 0.9, 1.2, 0.6); pulse(reportRings[5], at(37, LN(37).dur * 0.55 + 0.8), 0.45, 0.9, 0.6);
camTo(ZAG, { tx: RC.x, ty: RC.y, tz: RC.z, dist: 9, el: 0.7, az: -2.1 }, at(38), LN(38).dur, 'power1.inOut');
tl.set(ui, { chip: 0 }, end(39));
tl.to(fadeSt, { a: 1, duration: 0.5 }, end(39, 0.5)); tl.set(ui, { card2Kind: 1 }, end(39)); tl.to(ui, { card2: 1, duration: 0.4 }, end(39, 0.8)); tl.to(ui, { card2: 0, duration: 0.4 }, end(39, 3.1));
// S7
cut(4, at(40), 0.6); tl.set(ui, { h1: 5 }, at(40)); camTo(KT, { az: 0.3, dist: 36 }, at(40), LN(40).dur + LN(41).dur, 'none');
cut(2, at(42)); tl.set(ZAG.dark, { v: 0.6 }, at(42)); tl.set(heliG, { visible: true }, at(42)); tl.set(heliSt, { k: 0, orbit: 0, bank: 0 }, at(42));
camTo(ZAG, { tx: heliFrom.x, ty: heliFrom.y, tz: heliFrom.z, az: -1.2, el: 0.12, dist: 1.6, fov: 30 }, at(42), 0.01); camTo(ZAG, { az: -0.9, el: 0.18 }, at(42), LN(42).dur, 'none');
camTo(ZAG, { tx: RC.x - 3, ty: RC.y + 0.4, tz: RC.z + 3, az: -2.5, el: 0.5, dist: 32, fov: 36 }, at(43), 0.01);
tl.to(heliSt, { k: 1, duration: at(61) - at(44), ease: 'power1.inOut' }, at(44)); tl.to(heliSt, { bank: 0.2, duration: 1 }, at(44)); tl.to(heliSt, { bank: 0, duration: 1 }, at(61) - 1);
tl.set(heliSt, { orbit: 0.001 }, at(61)); tl.to(heliSt, { orbit: 0.001 + Math.PI * 2 * ((TM.total - at(61)) / 40), duration: TM.total - at(61), ease: 'none' }, at(61));
tl.set(heliG, { visible: false }, at(61)); tl.set(heliG, { visible: true }, at(62)); tl.set(footFinder, { visible: true }, at(61)); tl.set(footFinder, { visible: false }, at(62));
camTo(ZAG, { tx: RC.x, ty: RC.y + 0.5, tz: RC.z, az: -2.5, el: 0.55, dist: 26, fov: 34 }, at(44), 2);
tl.to(challenge.st, { k: 1, duration: 2.8, ease: 'power2.out' }, at(42, 2.4)); tl.to(challenge.st, { k: 0, duration: 0.01 }, at(43, 0.2)); answers.forEach((r, i) => pulse(r, at(43, 0.4 + i * 0.45), 1.0, 1.4, 0.6));
if (!LN(45).cut) { tl.to(challenge.st, { k: 1, duration: 1.6, ease: 'power2.out' }, at(45, 0.6)); tl.to(challenge.st, { k: 0, duration: 0.01 }, end(45)); }
[0, 1, 2, 3].forEach(i => { const r = FX.ring(0x39ff8a, 6); r.m.position.copy(PW[i]).add(new T.Vector3(0, 0.03, 0)); ZAG.scene.add(r.m); rangeRings.push(r); pulse(r, at(61, 1.6 + i * 0.7), 3.0, 2.4, 0.4); });
camTo(ZAG, { dist: 34, el: 0.7 }, at(62), 1.5); camTo(ZAG, { dist: 26, el: 0.55 }, at(63), 1.5); tl.set(errBig.st, { r: 0.05, a: 0.5 }, at(62, 1.2)); tl.to(errBig.st, { r: 2.0, duration: 1.4, ease: 'power2.out' }, at(62, 1.2));
tl.set(errSmall.st, { r: 0.05, a: 0.6 }, at(62, 3.0)); tl.to(errSmall.st, { r: 0.6, duration: 1.0, ease: 'power2.out' }, at(62, 3.0));
tl.to(errBig.st, { a: 0, duration: 0.8 }, at(63)); tl.to(errSmall.st, { a: 0, duration: 0.8 }, at(63));
camTo(ZAG, { tx: RC.x - 4, az: -2.3, dist: 20 }, at(46), 2);
tl.to(ui, { atak: 1, duration: 0.6 }, at(46)); [[1, 0.6], [3, 1.3], [4, 2.0]].forEach(([id, o]) => { tl.set(atak.st.status, { [id]: 'answered' }, at(46, o)); tl.to(atak.st.vis, { [id]: 1, duration: 0.4 }, at(46, o)); });
tl.set(atak.st.status, { 2: 'tampered' }, at(47, 0.2)); tl.to(atak.st.vis, { 2: 1, duration: 0.4 }, at(47, 0.2)); tl.to(atak.st, { routeK: 1, duration: 1.4, ease: 'none' }, at(47, 0.6)); 
tl.to(atak.st, { arcA: 1, duration: 0.6 }, at(64, 1.0)); tl.set(atak.st, { nearLabel: 1 }, at(64, 0.4));
tl.to(atak.st, { zoom: 3.4, cx: atakNodes[3].x, cy: atakNodes[3].y + 40, duration: LN(48).dur, ease: 'power2.inOut' }, at(48)); tl.set(atakClock, { i: 1 }, at(47)); tl.set(atakClock, { i: 2 }, at(51)); tl.to(atak.st, { selfA: 1, duration: 0.5 }, at(46)); tl.set(atak.st, { selfX: 90, selfY: 640 }, at(46));
tl.set(atak.st, { box: [0, 0, 760, 716], boxA: 1 }, at(50, 0.4)); tl.to(atak.st.box, { 0: atakNodes[3].x - 120, 1: atakNodes[3].y - 90, 2: 220, 3: 170, duration: 2.2, ease: 'power2.inOut' }, at(50, 0.4));
[1, 2, 3, 4].forEach(id => tl.set(atak.st.status, { [id]: 'killed' }, at(51, 1.6))); tl.to(atak.st, { boxA: 0, duration: 0.5 }, at(51)); tl.set(atak.st, { stale: 1 }, at(51, 2.0));
tl.to(ui, { atak: 0, duration: 0.5 }, end(51, 0.5)); tl.to(fadeSt, { a: 1, duration: 0.5 }, end(51, 0.5)); tl.set(ui, { card2Kind: 2 }, end(51)); tl.to(ui, { card2: 1, duration: 0.4 }, end(51, 0.8)); tl.to(ui, { card2: 0, duration: 0.4 }, end(51, 3.1));
// S8
cut(2, at(52), 0.6); tl.set(ui, { h1: 6 }, at(52)); tl.set(ZAG.dark, { v: 0 }, at(52)); tl.set(heliG, { visible: false }, at(52)); camTo(ZAG, { tx: RC.x, ty: RC.y, tz: RC.z, az: -1.9, el: 0.7, dist: 14, fov: 32 }, at(52), 0.01); camTo(ZAG, { az: -2.3, dist: 19 }, at(52), at(53) - at(52), 'none');
cut(0, at(53)); tl.set(ui, { hud: 0 }, at(53)); tl.set(openSt, { n: 1 }, at(53)); camTo(OPEN, { tx: 0, az: 0.9, el: 0.42, dist: 13 }, at(53), 0.01);
tl.to(fadeSt, { a: 1, duration: 0.6 }, at(54)); tl.to(ui, { card3: 1, duration: 0.6 }, at(54)); tl.to(ui, { card3: 0, duration: 0.5 }, at(55) - 0.5);
tl.set(intro, { k: 1 }, at(55) - 0.1); tl.to(ui, { card1: 1, duration: 0.5 }, at(55)); tl.to(fadeSt, { a: 1, duration: 1.0 }, end(55, 0.6)); tl.to(ui, { card1: 0, duration: 0.8 }, end(55, 0.8));
tl.set(ui, { hud: 0 }, TM.total);

/* ---------- apply + render ---------- */
const pulseApply = () => { pairRing.apply(); reportRing.apply(); ackRing.apply(); reportRings.forEach(r => r.apply()); pulses.forEach(r => r.apply()); bigPulse.forEach(r => r.apply()); answers.forEach(r => r.apply()); armRing.apply(); errBig.apply(); errSmall.apply(); rangeRings.forEach(r => r.apply()); };
function applyAll(t) {
  openPucks.forEach((p, i) => { p.g.visible = i < openSt.n; p.g.userData.ao.visible = p.g.visible; });
  wsoCone.position.copy(dehW).add(V(0, 1 + 500 * (1 - iranSt.drop), 0)); pilotCone.position.copy(pilotW).add(V(0, 1 + 500 * (1 - iranSt.drop) + 300 * iranSt.pilot, 0)); pilotCone.material.emissive.set(iranSt.pilot > 0.5 ? 0x39ff8a : 0x4d8dff); fan.apply();
  const dv = ZAG.dark.v; ZAG.lights.key.intensity = 1.6 * (1 - 0.75 * dv); ZAG.lights.key.color.setHex(dv > 0.5 ? 0xc9d6ff : 0xfff2e0); ZAG.lights.rim.intensity = 0.2 + 0.6 * dv; ZAG.scene.children.forEach(o => { if (o.isHemisphereLight) o.intensity = 0.1 + 0.06 * dv; });
  df.apply(); legs.forEach(l => l.apply()); pulseApply();
  party.forEach((f, i) => { const a = legs[0].at(clamp(0.3 + partySt.k * 0.7 - i * 0.08, 0, 1)); f.position.set(a.x + (i - 1) * 0.12, a.y, a.z + (i - 1) * 0.1); });
  { const pos = heliSt.orbit > 0 ? heliTo.clone().add(new T.Vector3(Math.cos(heliSt.orbit) * 0.75, 0, Math.sin(heliSt.orbit) * 0.75)) : heliPath.getPoint(heliSt.k); heliG.position.copy(pos);
    const ahead = heliSt.orbit > 0 ? heliTo.clone().add(new T.Vector3(Math.cos(heliSt.orbit + 0.1) * 0.75, 0, Math.sin(heliSt.orbit + 0.1) * 0.75)) : heliPath.getPoint(Math.min(1, heliSt.k + 0.02)).add(new T.Vector3(0, 0, 0)); if (ahead.distanceToSquared(pos) > 1e-6) heliG.lookAt(ahead.x, pos.y, ahead.z);
    heliG.userData.inner.rotation.z = heliSt.bank; heliG.userData.strobe.visible = (t % 1.2) < 0.08;
    const [gpx, gpy] = worldToPx(pos); const gp = zag.toWorld(gpx, gpy, 0.02); const tp = heliG.userData.tether.geometry.attributes.position; tp.setXYZ(0, pos.x, pos.y, pos.z); tp.setXYZ(1, gp.x, gp.y, gp.z); tp.needsUpdate = true; heliG.userData.tether.computeLineDistances(); heliG.userData.tether.visible = heliG.visible; heliG.userData.groundRing.position.copy(gp); heliG.userData.groundRing.visible = heliG.visible;
    challenge.g.userData.from = pos; challenge.apply(); } bigPulse.forEach(r => { r.m.position.copy(heliG.userData.groundRing.position); });
  pm[1].setLED(t >= at(35) && t < at(35, 0.7) ? 'Amber' : null); pm[1].setHalo(t >= at(35, 0.7) ? 0xff5a4a : 0x4d8dff, t >= at(35, 0.7) ? 0.9 : 0); pm[0].setLED(null); pm[2].setLED(null); pm[3].setLED(null); pm[3].setHalo(0xff5a4a, t >= at(65, 0.3) ? 0.9 : 0); pm[0].setHalo(0x4d8dff, 0); pm[2].setHalo(0x4d8dff, 0);
  pk.apply(); for (const n of ["radio","baro","accel","hall","cell"]) pk.parts[n].material.emissiveIntensity = hl[n] * 1.6;
  pk.g.position.set(pkPos.x, pkPos.y + pkPos.bounce * 0.9, pkPos.z); pkAo.position.set(pkPos.x, 0.006, pkPos.z); pkAo.material.opacity = 0.7 * (1 - pkPos.bounce); pk1.g.position.set(pk1Pos.x, 0.55 + pk1Pos.bounce * 0.9, pk1Pos.z); pk1Ao.position.set(pk1Pos.x, 0.006, pk1Pos.z); pk1Ao.material.opacity = 0.7 * (1 - pk1Pos.bounce); pk1Ao.visible = pk1.g.visible; pairRing.m.position.set(pkPos.x, 0.03, pkPos.z); reportRing.m.position.set(pk1Pos.x, 0.03, pk1Pos.z); ackRing.m.position.set(pkPos.x, 0.03, pkPos.z); pk.led(pkLed.i ? 'On' : null); armRing.m.position.set(pkPos.x, 0.03, pkPos.z);
  magnet.position.set(pkPos.x - 1.2 - 2.4 * magSt.k, 0.55, pkPos.z + 0.9);
  cntCo.sub.textContent = `${Math.round(cnt.steps)} steps · heading ${String(Math.round(cnt.hdg)).padStart(3, '0')} · ${Math.round(cnt.alt).toLocaleString()} m`;
  legCo.sub.textContent = `${Math.round(legs[0].st.k * 740)} steps · heading 045 · +${Math.round(legs[0].st.k * 130)} m`;
  $('atakClock').textContent = CLOCK[atakClock.i]; atak.apply(); boston.apply();
  // DOM
  $('fade').style.opacity = fadeSt.a; $('hud').style.opacity = ui.hud; $('h1').innerHTML = H1[ui.h1]; $('eyebrow').style.opacity = ui.h1 === 3 ? 0 : 1; $('chip').style.opacity = ui.chip; $('chip').textContent = CHIP[ui.chipKind];
  $('state').style.opacity = ui.stateVis; $('state').querySelector('span').textContent = STATE[ui.state]; $('scale').style.opacity = ui.scale; $('atak').style.opacity = ui.atak; $('cap').style.bottom = ui.atak > 0.01 ? '40px' : '84px'; $('boston').style.opacity = ui.boston;
  $('card1').style.opacity = ui.card1; applyIntro(); $('card2').style.opacity = ui.card2; $('card2h').innerHTML = CARD2[ui.card2Kind][0]; $('card2s').textContent = CARD2[ui.card2Kind][1]; $('card3').style.opacity = ui.card3;
  const S = SETS[cutSt.i]; placeCam(S); renderer.toneMappingExposure = S === ZAG ? 0.8 : 0.9;
  $('compass').style.opacity = S === ZAG && ui.hud ? 1 : 0; $('compassN').setAttribute('transform', `rotate(${(-S.c.az * 180 / PI)} 22 22)`);
  if (S === ZAG) { const vis = 2 * S.c.dist * Math.tan(S.c.fov * PI / 360) * 16 / 9; const pxKm = 1920 / vis; const L = [1, 2, 5, 10, 20].find(l => l * pxKm > 160) || 20; $('scaleTxt').textContent = `${L} km`; $('scaleBar').style.width = `${L * pxKm}px`; }
  // caption
  const cardUp = ui.card1 > 0.5 || ui.card2 > 0.5 || ui.card3 > 0.5; const line = cardUp ? null : TM.lines.find(l => !l.cut && t >= l.start - 0.12 && t <= l.end + 0.45); $('capTxt').textContent = line ? line.text.replace(/\[\^\d+\]/g, '') : ''; $('capTxt').style.fontSize = line && line.text.length > 140 ? '31px' : line && line.text.length > 115 ? '34px' : ''; $('capTxt').style.opacity = line ? 1 : 0; $('capShade').style.opacity = line ? 1 : 0;
  // callouts
  const sides = { l: [], r: [] }; const top = 150, bot = 1080 - 230;
  for (const c of CO) { const w = c.set !== S ? 0 : clamp(Math.min((t - c.t0) / 0.4, (c.t1 - t) / 0.4), 0, 1); if (w <= 0) { c.d.style.display = c.pl.style.display = c.ci.style.display = 'none'; continue; }
    const p = c.anchor().project(S.cam); c.ax = (p.x + 1) / 2 * 1920; c.ay = (1 - p.y) / 2 * 1080; if (p.z > 1 || c.ay < top - 60 || c.ay > bot + 60) { c.d.style.display = c.pl.style.display = c.ci.style.display = 'none'; continue; }
    c.d.style.display = c.pl.style.display = c.ci.style.display = ''; c.d.style.opacity = c.pl.style.opacity = c.ci.style.opacity = w; c.h = c.d.offsetHeight; c.bw = c.d.offsetWidth; c.y = c.ay - 14; sides[c.side].push(c); }
  for (const sd of ['l', 'r']) { const a = sides[sd].sort((x, y) => x.y - y.y); let prev = top; a.forEach(c => { c.y = Math.max(c.y, prev); prev = c.y + c.h + 14; });
    let over = prev - 14 - bot; if (over > 0) for (let k = a.length - 1; k >= 0; k--) { a[k].y -= over; if (k > 0) { over = a[k - 1].y + a[k - 1].h + 14 - a[k].y; if (over <= 0) break; } }
    for (const c of a) { const pad = 56, bx = sd === 'l' ? pad : 1920 - pad - c.bw; c.d.style.left = bx + 'px'; c.d.style.top = c.y + 'px'; const ex = sd === 'l' ? bx + c.bw + 10 : bx - 10, ey = c.y + 14, kx = sd === 'l' ? Math.min(ex + 28, c.ax) : Math.max(ex - 28, c.ax);
      c.pl.setAttribute('points', `${ex},${ey} ${kx},${ey} ${c.ax},${c.ay}`); c.ci.setAttribute('cx', c.ax); c.ci.setAttribute('cy', c.ay); } }
  renderer.render(S.scene, S.cam);
}
// Intro: the initials leave their words and fly into the title. Positions measured once from the laid-out card.
let introGeo = null;
function measureIntro() {
  const card = $('card1'); const prev = card.style.opacity; card.style.opacity = 1;
  const src = [...document.querySelectorAll('#expRow .i')].map(e => e.getBoundingClientRect());
  const dst = [...document.querySelectorAll('#nameRow .L')].map(e => e.getBoundingClientRect());
  card.style.opacity = prev;
  const fly = $('introFly'); fly.innerHTML = ''; const spans = 'DIPCAN'.split('').map(ch => { const sp = document.createElement('span'); sp.textContent = ch; fly.appendChild(sp); return sp; });
  introGeo = { src, dst, spans, scale: src[0].height / dst[0].height };
}
function applyIntro() {
  if (!introGeo) measureIntro();
  const ease = (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  const k = intro.k, vis = ui.card1 > 0.01;
  const titleLetters = document.querySelectorAll('#nameRow .L'), initials = document.querySelectorAll('#expRow .i');
  for (let i = 0; i < 6; i++) {
    const ki = clamp((k - 0.12 - i * 0.07) / 0.5, 0, 1), e = ease(ki);
    const s0 = introGeo.src[i], d0 = introGeo.dst[i]; const sp = introGeo.spans[i];
    const flying = vis && ki > 0 && ki < 1;
    sp.style.display = flying ? '' : 'none';
    if (flying) { const x = lerp(s0.left + s0.width / 2, d0.left + d0.width / 2, e), y = lerp(s0.top + s0.height / 2, d0.top + d0.height / 2, e), sc = lerp(introGeo.scale, 1, e); sp.style.left = x + 'px'; sp.style.top = y + 'px'; sp.style.transform = `translate(-50%,-50%) scale(${sc})`; }
    titleLetters[i].style.opacity = ki >= 1 ? 1 : 0; initials[i].style.opacity = ki > 0 ? 0.28 : 1;
  }
  $('teamRow').style.opacity = clamp((k - 0.78) / 0.2, 0, 1); $('expRow').style.opacity = 1;
}
let cur = 0;
window.__seek = (t) => { cur = clamp(t, 0, TM.total); tl.seek(cur, false); applyAll(cur); applyAll(cur); return true; };
window.__dbg = { zag, iranTerr, ZAG, renderer, T }; try { await document.fonts.ready; await Promise.all(['500 36px Inter', '600 148px Saira', '300 44px Saira', '500 15px "IBM Plex Mono"'].map(f => document.fonts.load(f))); } catch (e) { console.warn('fonts', e); } window.__seek(Number(q.get("t") || 0)); window.__dipcanReady = true;
if (!RENDER) {
  const audio = new Audio('../out/narration.wav'); audio.preload = 'auto'; let playing = false; let audioReady = false; audio.addEventListener('loadedmetadata', () => { audioReady = true; });
  const sc = $('scrub'), bar = $('sBar'), tTxt = $('sTime'), lTxt = $('sLine'), pBtn = $('sPlay'); sc.classList.remove('hide');
  const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
  bar.max = TM.total; $('sTotal').textContent = fmt(TM.total);
  const show = (t) => { bar.value = t; tTxt.textContent = fmt(t); const l = TM.lines.find(x => !x.cut && t >= x.start - 0.1 && t <= x.end + 0.4); lTxt.textContent = l ? `${l.n}  ${l.text.replace(/\[\^\d+\]/g, '')}` : ''; };
  const seekTo = (t, moveAudio = true) => { window.__seek(t); show(cur); if (moveAudio && audioReady) { try { audio.currentTime = cur; } catch {} } history.replaceState(null, '', `?t=${cur.toFixed(2)}`); };
  const setPlaying = (p) => { playing = p; pBtn.textContent = p ? 'PAUSE' : 'PLAY'; if (p) { const go = () => { audio.currentTime = cur; audio.play(); }; if (audioReady) go(); else audio.addEventListener('loadedmetadata', go, { once: true }); } else audio.pause(); };
  bar.addEventListener('input', () => { if (playing) setPlaying(false); seekTo(Number(bar.value)); });
  pBtn.addEventListener('click', () => setPlaying(!playing));
  audio.addEventListener('ended', () => setPlaying(false));
  const loop = () => { if (playing && !audio.paused && audio.currentTime > 0.05) { window.__seek(audio.currentTime); show(cur); } requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
    else if (e.key === 'ArrowRight') { setPlaying(false); seekTo(cur + (e.shiftKey ? 1 : 5)); } else if (e.key === 'ArrowLeft') { setPlaying(false); seekTo(cur - (e.shiftKey ? 1 : 5)); }
    else if (e.key === '.') { setPlaying(false); seekTo(cur + 1 / 30); } else if (e.key === ',') { setPlaying(false); seekTo(cur - 1 / 30); }
    else if (e.key === 'Home') { setPlaying(false); seekTo(0); } else if (e.key === 'End') { setPlaying(false); seekTo(TM.total - 0.1); }
  });
  show(cur); history.replaceState(null, '', `?t=${cur.toFixed(2)}`);
}
