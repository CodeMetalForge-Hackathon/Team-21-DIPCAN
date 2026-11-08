// Split one continuous narration take into audio/human/<n>.wav by matching what was said to script.md.
// Usage: bun tools/split-take.ts <take.(aifc|m4a|wav|mp3)> [--gap 0.9] [--db -35] [--min 0.55]
// Segments are cut at silences of --gap seconds, transcribed with whisper-cli, and assigned to the script line they
// match best. Lines read more than once keep the take that covers the line best (later take wins a tie). Adjacent
// segments that match the same line are joined when the join scores higher. Lines never read are listed at the end.
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { $ } from "bun";
const argv = process.argv.slice(2); const take = argv.find(a => !a.startsWith("--")); if (!take) throw new Error("take file required");
const opt = (k: string, d: string) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const gap = Number(opt("--gap", "0.9")), db = Number(opt("--db", "-35")), MIN = Number(opt("--min", "0.55"));
const model = opt("--model", process.env.WHISPER_MODEL ?? "ggml-small.en.bin");
const md = readFileSync("script.md", "utf8").split("\n"); const lines: { n: number; text: string }[] = [];
for (const l of md) { const r = l.match(/^\| (\d+) \| (.+?) \| /); if (!r) continue; const t = r[2].trim().replace(/\[\^\d+\]/g, "").replace(/^\[pause [\d.]+\]\s*/i, ""); if (!/^\[cut\]/i.test(t)) lines.push({ n: Number(r[1]), text: t }); }
const NUM: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", fifteen: "15", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60" };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).map(w => NUM[w] ?? w);
const stem = (w: string) => w.length > 4 ? w.slice(0, 4) : w;
const score = (script: string[], heard: string[]) => { const h = new Set(heard.map(stem)); const s = new Set(script.map(stem)); const rec = script.filter(w => h.has(stem(w))).length / Math.max(1, script.length); const pre = heard.filter(w => s.has(stem(w))).length / Math.max(1, heard.length); return rec * Math.min(1, pre + 0.15); };
mkdirSync("out/take", { recursive: true }); mkdirSync("audio/human", { recursive: true });
const wav = "out/take/take16.wav"; await $`ffmpeg -v error -y -i ${take} -ac 1 -ar 16000 ${wav}`;
const total = Number((await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${wav}`.text()).trim());
const log = (await $`ffmpeg -hide_banner -i ${wav} -af silencedetect=n=${db}dB:d=${gap} -f null -`.quiet().nothrow()).stderr.toString();
const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map(m => Number(m[1])), ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map(m => Number(m[1]));
let segs: { a: number; b: number; text?: string }[] = []; let cur = 0;
for (let i = 0; i < starts.length; i++) { if (starts[i] - cur > 0.35) segs.push({ a: cur, b: starts[i] }); cur = ends[i] ?? total; }
if (total - cur > 0.35) segs.push({ a: cur, b: total });
console.log(`${segs.length} segments in ${total.toFixed(0)} s; transcribing`);
const transcribe = async (a: number, b: number) => { const f = "out/take/seg.wav"; await $`ffmpeg -v error -y -ss ${Math.max(0, a - 0.1)} -to ${Math.min(total, b + 0.15)} -i ${wav} ${f}`; return (await $`whisper-cli -m ${model} -f ${f} -nt -np 2>/dev/null`.text()).trim().replace(/\s+/g, " "); };
const cachePath = "out/take/segments.json"; const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : null;
const cached = cache && cache.take === take && cache.segs.length === segs.length ? cache.segs : null;
for (const [i, s] of segs.entries()) s.text = cached ? cached[i].text : await transcribe(s.a, s.b);
writeFileSync("out/take/segments.json", JSON.stringify({ take, segs, pick: {} }, null, 1));
// join adjacent segments when the pair reads as one line better than either half
const best = (t: string) => { let bi = -1, bs = 0; const h = norm(t); lines.forEach((L, i) => { const sc = score(norm(L.text), h); if (sc > bs) { bs = sc; bi = i; } }); return { i: bi, s: bs }; };
for (let k = 0; k < segs.length - 1; k++) { const x = best(segs[k].text!), y = best(segs[k + 1].text!); if (x.i >= 0 && x.i === y.i) { const joined = segs[k].text + " " + segs[k + 1].text; const j = best(joined); if (j.i === x.i && j.s > Math.max(x.s, y.s)) { segs[k] = { a: segs[k].a, b: segs[k + 1].b, text: joined }; segs.splice(k + 1, 1); k--; } } }
const pick: Record<number, { a: number; b: number; s: number; text: string; idx: number }> = {};
segs.forEach((s, idx) => { const b = best(s.text!); if (b.i < 0 || b.s < MIN) { console.log(`  skip ${s.a.toFixed(1)}s "${s.text!.slice(0, 70)}" (best ${b.s.toFixed(2)})`); return; } const n = lines[b.i].n; const p = pick[n]; if (!p || b.s >= p.s - 0.02) pick[n] = { a: s.a, b: s.b, s: b.s, text: s.text!, idx }; });
// out/take/overrides.json: { "<take basename>": { "<line>": [startSec, endSec] } } wins over the automatic pick (joins, retakes, lines the matcher missed)
const ovPath = "out/take/overrides.json"; const ovAll = existsSync(ovPath) ? JSON.parse(readFileSync(ovPath, "utf8")) : {}; const ov: Record<string, [number, number]> = ovAll[take.split("/").pop()!] ?? {};
for (const [n, [a, b]] of Object.entries(ov)) pick[Number(n)] = { a, b, s: 1, text: "(override " + a + "s.." + b + "s)", idx: -1 };
const rows: string[] = []; const missing: number[] = [];
for (const L of lines) { const p = pick[L.n]; if (!p) { missing.push(L.n); continue; } await $`ffmpeg -v error -y -ss ${Math.max(0, p.a - 0.12)} -to ${Math.min(total, p.b + 0.25)} -i ${take} -ac 1 -ar 44100 audio/human/${L.n}.wav`; rows.push(`${String(L.n).padStart(2)}  ${p.s.toFixed(2)}  ${p.a.toFixed(1)}s..${p.b.toFixed(1)}s  ${p.text.slice(0, 90)}`); }
console.log(rows.join("\n"));
console.log(`wrote ${rows.length} of ${lines.length} lines to audio/human/`); if (missing.length) console.log(`not found in the take: ${missing.join(", ")}`);
