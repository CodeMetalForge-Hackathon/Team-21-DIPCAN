// Transcribe every clip in data/timing.json with whisper-cli and compare it to the line it is supposed to carry.
// Usage: bun tools/check-clips.ts [--model <ggml whisper model, or WHISPER_MODEL>] [--min 0.6]
// Prints one row per line with a word-overlap score; rows under --min are flagged. Works for any provider.
import { readFileSync, mkdirSync } from "node:fs";
import { $ } from "bun";
const argv = process.argv.slice(2); const opt = (k: string, d: string) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const model = opt("--model", process.env.WHISPER_MODEL ?? "ggml-small.en.bin"), min = Number(opt("--min", "0.6"));
const T = JSON.parse(readFileSync("data/timing.json", "utf8"));
const norm = (s: string) => s.toLowerCase().replace(/\[\^\d+\]/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
const NUM: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", fifteen: "15", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60", hundred: "00" };
const score = (a: string[], b: string[]) => { const sb = new Set(b.map(w => NUM[w] ?? w)); const hit = a.filter(w => sb.has(NUM[w] ?? w) || (w.length > 3 && [...sb].some(x => x.startsWith(w.slice(0, 4))))).length; return a.length ? hit / a.length : 1; };
mkdirSync("out/check", { recursive: true });
let bad = 0;
for (const L of T.lines) {
  if (!L.file) continue;
  const wav = `out/check/${L.n}.wav`; await $`ffmpeg -v error -y -i ${L.file} -ac 1 -ar 16000 ${wav}`;
  const txt = (await $`whisper-cli -m ${model} -f ${wav} -nt -np 2>/dev/null`.text()).trim().replace(/\s+/g, " ");
  const s = score(norm(L.text), norm(txt));
  const flag = s < min ? "  <-- MISMATCH" : "";
  if (flag) bad++;
  console.log(`${String(L.n).padStart(2)}  ${s.toFixed(2)}  ${L.dur.toFixed(1)}s  ${txt.slice(0, 110)}${flag}`);
}
console.log(bad ? `${bad} line(s) flagged` : "every clip matches its line");
