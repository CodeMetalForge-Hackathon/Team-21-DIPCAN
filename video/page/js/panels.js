// DOM panels drawn as SVG: the ATAK-style chain map and the Boston planned walk.
const NS = 'http://www.w3.org/2000/svg';
const el = (n, a = {}, parent) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (parent) parent.appendChild(e); return e; };
const COL = { answered: '#39ff8a', tampered: '#ff5a4a', silent: '#8a98b0', killed: '#8a98b0', pending: '#4d8dff' };

// nodes: [{id, x, y, elevM, age, label}] in svg px. state: { vis:{id:0..1}, status:{id}, routeK, zoom, cx, cy, box }
// ATAK-style panel. Marker affiliation follows what cot.py sends: answered friendly (cyan rectangle),
// tampered hostile (red diamond), silent unknown (yellow), killed neutral (green square). Labels sit under
// the icon with a dark halo and do not scale with the map.
const COLA = { answered: '#80e0ff', tampered: '#ff8080', silent: '#ffff80', killed: '#aaffaa', pending: '#80e0ff' };
export function atakPanel(svg, bg, nodes, mPerPx = 65.6 * 160 / 760) {
  svg.innerHTML = '';
  const W = +svg.getAttribute('width'), H = +svg.getAttribute('height');
  const root = el('g', {}, svg);
  el('image', { href: bg, x: 0, y: 0, width: W, height: H, preserveAspectRatio: 'xMidYMid slice', opacity: 0.8 }, root);
  const box = el('rect', { fill: 'none', stroke: '#ffb44a', 'stroke-width': 2, 'stroke-dasharray': '8 6', opacity: 0 }, root);
  const route = el('g', {}, root);
  const arc = el('path', { fill: 'rgba(77,141,255,.12)', stroke: '#4d8dff', 'stroke-width': 2, 'stroke-dasharray': '6 5', opacity: 0 }, root);
  const marks = {};
  const labels = el('g', {}, svg); // unscaled layer
  for (const n of nodes) {
    const g = el('g', { opacity: 0 }, labels);
    const icon = el('path', { fill: COLA.pending, stroke: '#000', 'stroke-width': 2 }, g);
    const t1 = el('text', { 'text-anchor': 'middle', fill: '#fff', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 18, 'font-weight': 500, 'paint-order': 'stroke', stroke: '#000', 'stroke-width': 4 }, g); t1.textContent = `P${n.id}`;
    const t2 = el('text', { 'text-anchor': 'middle', fill: '#dde3ee', 'font-family': 'Inter, sans-serif', 'font-size': 13, 'paint-order': 'stroke', stroke: '#000', 'stroke-width': 3 }, g); t2.textContent = n.label;
    marks[n.id] = { g, icon, t1, t2 };
  }
  // chrome: compass, scale bar, self marker
  const chrome = el('g', {}, svg);
  el('circle', { cx: 36, cy: 36, r: 20, fill: 'rgba(5,7,12,.6)', stroke: '#8a98b0', 'stroke-width': 1 }, chrome);
  el('path', { d: 'M36 20 L42 36 L36 32 L30 36 Z', fill: '#eef3fb' }, chrome);
  const nt = el('text', { x: 36, y: 50, 'text-anchor': 'middle', fill: '#eef3fb', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 11 }, chrome); nt.textContent = 'N';
  const sbar = el('rect', { x: W - 160, y: H - 30, width: 120, height: 3, fill: '#eef3fb' }, chrome);
  const stxt = el('text', { x: W - 100, y: H - 38, 'text-anchor': 'middle', fill: '#eef3fb', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 12, 'paint-order': 'stroke', stroke: '#000', 'stroke-width': 3 }, chrome);
  const self = el('g', { opacity: 0 }, labels); el('path', { d: 'M0 -12 L8 10 L0 5 L-8 10 Z', fill: '#4dd0ff', stroke: '#000', 'stroke-width': 2 }, self);
  const st = { vis: {}, status: {}, routeK: 0, zoom: 1, cx: W / 2, cy: H / 2, boxA: 0, box: [0, 0, W, H], stale: 0, selfX: 60, selfY: H - 80, selfA: 0, arcA: 0, nearLabel: 0 };
  for (const n of nodes) { st.vis[n.id] = 0; st.status[n.id] = 'pending'; }
  const shape = (s, x, y) => { const r = 11; if (s === 'tampered') return `M${x} ${y - r - 3} L${x + r + 3} ${y} L${x} ${y + r + 3} L${x - r - 3} ${y} Z`; if (s === 'killed') return `M${x - r} ${y - r} h${2 * r} v${2 * r} h${-2 * r} Z`; if (s === 'silent') return `M${x - r} ${y - 7} h${2 * r} v14 h${-2 * r} Z M${x - 7} ${y - r} h14 v${2 * r} h-14 Z`; return `M${x - r - 3} ${y - r + 2} h${2 * r + 6} v${2 * r - 4} h${-2 * r - 6} Z`; };
  const proj = (x, y) => [W / 2 + (x - st.cx) * st.zoom, H / 2 + (y - st.cy) * st.zoom];
  function apply() {
    root.setAttribute('transform', `translate(${W / 2} ${H / 2}) scale(${st.zoom}) translate(${-st.cx} ${-st.cy})`);
    for (const n of nodes) { const m = marks[n.id]; const [x, y] = proj(n.x, n.y); const s = st.status[n.id];
      m.g.setAttribute('opacity', st.vis[n.id] * (st.stale ? 0.45 : 1)); m.icon.setAttribute('d', shape(s, x, y)); m.icon.setAttribute('fill', COLA[s]);
      const dy = n.dy || 0; m.t1.setAttribute('x', x); m.t1.setAttribute('y', y + 32 + dy); m.t2.setAttribute('x', x); m.t2.setAttribute('y', y + 48 + dy);
      m.t2.textContent = s === 'tampered' ? 'tampered 15:10' : s === 'killed' ? 'killed' : s === 'silent' ? 'silent' : (n.id === 4 && st.nearLabel ? 'no next · he is near' : n.label); }
    // search arc around the last dipcan, open on every side but the approach from the one before it
    { const a = nodes[3], b = nodes[2]; if (a && b) { const back = Math.atan2(b.y - a.y, b.x - a.x); const r = 110; const s0 = back + Math.PI / 4, s1 = back - Math.PI / 4 + Math.PI * 2; const x0 = a.x + r * Math.cos(s0), y0 = a.y + r * Math.sin(s0), x1 = a.x + r * Math.cos(s1), y1 = a.y + r * Math.sin(s1); arc.setAttribute('d', `M${a.x} ${a.y} L${x0} ${y0} A${r} ${r} 0 1 1 ${x1} ${y1} Z`); arc.setAttribute('opacity', st.arcA); arc.setAttribute('stroke-width', 2 / st.zoom); } }
    // route through every node in order; a leg touching a tampered node is dashed red
    route.innerHTML = ''; const k = Math.max(0, Math.min(1, st.routeK)); const shown = nodes.filter(n => st.status[n.id] !== 'pending'); const cnt = Math.round(k * shown.length);
    for (let i = 1; i < cnt; i++) { const a = shown[i - 1], b = shown[i]; const bad = st.status[a.id] === 'tampered' || st.status[b.id] === 'tampered';
      el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: bad ? '#ff8080' : '#ffd84a', 'stroke-width': 3 / st.zoom, 'stroke-dasharray': bad ? `${10 / st.zoom} ${8 / st.zoom}` : 'none', opacity: st.stale ? 0.25 : 0.95 }, route); }
    box.setAttribute('x', st.box[0]); box.setAttribute('y', st.box[1]); box.setAttribute('width', st.box[2]); box.setAttribute('height', st.box[3]); box.setAttribute('opacity', st.boxA); box.setAttribute('stroke-width', 2 / st.zoom);
    const km = [0.25, 0.5, 1, 2, 5].find(v => v * 1000 / (mPerPx / st.zoom) >= 90) || 5; const px = km * 1000 / (mPerPx / st.zoom); sbar.setAttribute('width', px); sbar.setAttribute('x', W - 40 - px); stxt.setAttribute('x', W - 40 - px / 2); stxt.textContent = km < 1 ? `${km * 1000} m` : `${km} km`;
    const [sx, sy] = proj(st.selfX, st.selfY); self.setAttribute('transform', `translate(${sx} ${sy}) rotate(35)`); self.setAttribute('opacity', st.selfA);
  }
  apply(); return { st, apply };
}

// boston: {roads:[{n,c,p:[[lon,lat]]}], coast:[[..]], buildings:[[..]]}; walk: [[lon,lat],...]; marks: indexes into walk where pucks drop
export function bostonPanel(svg, boston, walk, start) {
  svg.innerHTML = ''; const W = +svg.getAttribute('width'), H = +svg.getAttribute('height');
  const lons = [], lats = []; for (const r of boston.roads) for (const [lo, la] of r.p) { lons.push(lo); lats.push(la); }
  const w0 = Math.min(...lons), w1 = Math.max(...lons), l0 = Math.min(...lats), l1 = Math.max(...lats);
  const cosL = Math.cos((l0 + l1) / 2 * Math.PI / 180); const sx = W / ((w1 - w0) * cosL), sy = H / (l1 - l0); const s = Math.min(sx, sy) * 0.98;
  const ox = (W - (w1 - w0) * cosL * s) / 2, oy = (H - (l1 - l0) * s) / 2;
  const P = ([lo, la]) => [ox + (lo - w0) * cosL * s, oy + (l1 - la) * s];
  const root = el('g', {}, svg);
  el('rect', { x: 0, y: 0, width: W, height: H, fill: '#0a1020' }, root);
  for (const c of boston.coast) el('polyline', { points: c.map(P).map(p => p.join(',')).join(' '), fill: 'none', stroke: '#1f3a66', 'stroke-width': 2 }, root);
  for (const b of boston.buildings) el('polygon', { points: b.map(P).map(p => p.join(',')).join(' '), fill: '#131c2f', stroke: 'none' }, root);
  const wgt = { primary: 4, secondary: 3, tertiary: 2.4, residential: 1.6, unclassified: 1.6, pedestrian: 1.2, footway: 0.8, service: 0.8, living_street: 1.2 };
  for (const r of boston.roads) el('polyline', { points: r.p.map(P).map(p => p.join(',')).join(' '), fill: 'none', stroke: r.c === 'footway' || r.c === 'service' ? '#1c2740' : '#2a3a5e', 'stroke-width': wgt[r.c] || 1, 'stroke-linecap': 'round' }, root);
  // street names for a few majors
  const named = {}; for (const r of boston.roads) if (r.n && ['primary', 'secondary', 'tertiary'].includes(r.c) && !named[r.n] && r.p.length > 3) { named[r.n] = 1; const m = P(r.p[Math.floor(r.p.length / 2)]); const t = el('text', { x: m[0], y: m[1] - 6, fill: '#55658a', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 13 }, root); t.textContent = r.n; }
  const wp = walk.map(P); const line = el('polyline', { points: '', fill: 'none', stroke: '#ffd84a', 'stroke-width': 4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, root);
  const sp = P(start); el('circle', { cx: sp[0], cy: sp[1], r: 14, fill: '#4d8dff', stroke: '#05070c', 'stroke-width': 3 }, root);
  const st0 = el('text', { x: sp[0] + 20, y: sp[1] + 6, fill: '#eef3fb', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 18, 'font-weight': 500 }, root); st0.textContent = '60 State St · start';
  const drops = walk.map((_, i) => i).filter(i => i > 0).map(i => { const q = wp[i]; const g = el('g', { opacity: 0 }, root); el('circle', { cx: q[0], cy: q[1], r: 10, fill: '#39ff8a', stroke: '#05070c', 'stroke-width': 3 }, g); const t = el('text', { x: q[0] + 16, y: q[1] + 5, fill: '#eef3fb', 'font-family': 'IBM Plex Mono, monospace', 'font-size': 16 }, g); t.textContent = `P${i}`; return g; });
  const st = { k: 0 };
  function apply() { const n = wp.length; const kk = Math.max(0, Math.min(1, st.k)) * (n - 1); const full = Math.floor(kk); const pts = wp.slice(0, full + 1); if (full < n - 1) { const a = wp[full], b = wp[full + 1], u = kk - full; pts.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); } line.setAttribute('points', pts.map(p => p.join(',')).join(' ')); drops.forEach((g, i) => g.setAttribute('opacity', full >= i + 1 ? 1 : 0)); }
  apply(); return { st, apply };
}
