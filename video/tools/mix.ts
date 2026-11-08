// Lay the narration clips onto one WAV at their timing.json starts. Usage: bun tools/mix.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const T = JSON.parse(readFileSync("data/timing.json", "utf8")); const SR = 44100;
const total = Math.ceil((T.total + 0.5) * SR); const mix = new Float32Array(total);
for (const L of T.lines) {
  if (!L.file) continue;
  const pcm = Bun.spawnSync(["ffmpeg", "-v", "error", "-i", L.file, "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"]).stdout;
  const s = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4); const off = Math.round(L.start * SR);
  for (let i = 0; i < s.length && off + i < total; i++) mix[off + i] += s[i];
}
let peak = 0; for (const v of mix) peak = Math.max(peak, Math.abs(v)); const g = peak > 0 ? 0.89 / peak : 1;
const buf = Buffer.alloc(44 + total * 2); buf.write("RIFF", 0); buf.writeUInt32LE(36 + total * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(total * 2, 40);
for (let i = 0; i < total; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mix[i] * g * 32767))), 44 + i * 2);
mkdirSync("out", { recursive: true }); writeFileSync("out/narration.wav", buf); console.log(`out/narration.wav ${(total / SR).toFixed(1)} s, ${T.lines.length} clips, peak gain ${g.toFixed(2)}`);
