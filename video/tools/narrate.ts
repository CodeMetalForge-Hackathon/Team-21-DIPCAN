// Narration from script.md via ElevenLabs, one clip per numbered line, cached by text hash.
// Writes audio/<nn>.mp3 and data/timing.json (line starts/ends from measured durations, scene bounds,
// insert points). Captions keep the written form; a small say-map fixes TTS pronunciation only.
// Usage: bun tools/narrate.ts [--provider eleven|say|human] [--voice <id|mac voice>] [--key-env ELEVENLABS_API_KEY] [--dry]
// `say` is the free local fallback for timing and review; ElevenLabs clips are cached when credits exist.
// `human`: Sean's own recordings, one file per line at audio/human/<n>.(wav|m4a|mp3|aiff); a line with no
// recording falls back to its cached ElevenLabs clip and is listed at the end. Split a single take with tools/split-take.ts.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { $ } from "bun";

const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const provider = argv.includes("--provider") ? argv[argv.indexOf("--provider") + 1] : "eleven";
const voice = argv.includes("--voice") ? argv[argv.indexOf("--voice") + 1] : (provider === "say" ? "Alex" : provider === "human" ? "sean" : "pNInz6obpgDQGcFmaJgB"); // Adam
const ELEVEN_VOICE = "nPczCjzI2devNBz1zQrb"; // Brian: the fallback for lines not yet recorded
const humanFile = (n: number) => ["wav", "m4a", "mp3", "aiff", "aif", "flac"].map(e => `audio/human/${n}.${e}`).find(existsSync);
const missing: number[] = [];
// Warmth for the recorded voice: low shelf and low-mid lift, a gentle cut in the harsh band, light compression, then loudness.
const VOICE_AF = process.env.VOICE_AF ?? "highpass=f=50,lowshelf=f=160:g=4.5,equalizer=f=240:t=q:w=1.0:g=3.5,equalizer=f=900:t=q:w=1.2:g=1,equalizer=f=3200:t=q:w=1.2:g=-4,equalizer=f=5800:t=q:w=1.4:g=-2.5,acompressor=threshold=-22dB:ratio=2.2:attack=8:release=160:makeup=2,loudnorm=I=-18:TP=-1.5:LRA=8";
const envFile = process.env.NARRATE_ENV_FILE ?? "video/.env"; const env = process.env.ELEVENLABS_API_KEY ? `ELEVENLABS_API_KEY=${process.env.ELEVENLABS_API_KEY}` : existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const keyEnv = argv.includes("--key-env") ? argv[argv.indexOf("--key-env") + 1] : "ELEVENLABS_API_KEY";
const key = env.match(new RegExp(`^${keyEnv}=(.+)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!key && !dry && provider === "eleven") throw new Error(`${keyEnv} missing: export it, or put it in ${envFile} (or NARRATE_ENV_FILE)`);

const GAP_LINE = 0.4, GAP_SCENE = 1.0, LEAD = 1.0, GAP_INSERT = 2.6;
const speed = argv.includes("--speed") ? Number(argv[argv.indexOf("--speed") + 1]) : 1.08;
const ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS = "x x twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
const words = (n: number): string => n >= 1000 ? `${words(Math.floor(n / 1000))} thousand${n % 1000 ? " " + words(n % 1000) : ""}`
  : n >= 100 ? `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? " " + words(n % 100) : ""}` : n >= 20 ? `${TENS[Math.floor(n / 10)]}${n % 10 ? "-" + ONES[n % 10] : ""}` : ONES[n];
const SAY: [RegExp, string | ((...a: any[]) => string)][] = [
  [/\. Team 21\./g, '. <break time="1.2s" /> Team 21.'], [/15 grams, about 15 dollars/g, '15 grams, <break time="0.9s" /> about 15 dollars'], [/\bATAK\b/g, "A-tack"], [/\bDIPCAN\b/g, "Dip-can"], [/\b([Dd])ipcan(s?)\b/g, "$1ip-can$2"], [/\bLoRa\b/g, "Lora"], [/\bDehdasht\b/g, "Deh-dasht"],
  [/Kohgiluyeh and Boyer-Ahmad/g, "Koh-gee-loo-yay and Bo-yair Ah-mad"], [/\bF-15E\b/g, "F fifteen E"],
  [/Dude 44 Bravo/g, "Dude four four Bravo"], [/\bZagros\b/g, "Zag-ross"],
  [/\b(\d{1,2}),(\d{3})\b/g, (_m: string, a: string, b: string) => words(Number(a + b))],
  [/\b(\d\d):(\d\d)\b/g, (_m: string, h: string, m: string) => `${h[0] === "0" ? "zero " + h[1] : h} ${m === "00" ? "hundred" : m[0] === "0" ? "zero " + m[1] : m}`],
];
const say = (t: string) => SAY.reduce((s, [re, r]) => s.replace(re, r as any), t.replace(/\[\^\d+\]/g, ""));

type Line = { n: number; text: string; scene: string; insertAfter?: string };
const md = readFileSync("script.md", "utf8").split("\n");
const lines: Line[] = []; let scene = ""; let pendingInsert: string | undefined;
for (const l of md) {
  const h = l.match(/^## (S\d+)\. (.+?) \(/); if (h) { scene = h[1]; continue; }
  const ins = l.match(/^>>> INSERT ([A-Z])/); if (ins && lines.length) { lines[lines.length - 1].insertAfter = ins[1]; continue; }
  const row = l.match(/^\| (\d+) \| (.+?) \| /); if (row) lines.push({ n: Number(row[1]), text: row[2].trim(), scene });
}
mkdirSync("audio", { recursive: true }); mkdirSync("data", { recursive: true });

const out: any[] = []; let t = LEAD; let lastScene = "";
for (const L of lines) {
  const pm = /^\[pause ([\d.]+)\]\s*/i.exec(L.text); if (pm) { t += Number(pm[1]); L.text = L.text.slice(pm[0].length); }
  if (/^\[cut\]/i.test(L.text)) { out.push({ n: L.n, scene: L.scene, text: "", file: null, start: +t.toFixed(3), end: +t.toFixed(3), dur: 0, cut: true, insertAfter: L.insertAfter }); t += L.insertAfter ? GAP_INSERT : 0; lastScene = L.scene; continue; }
  const spoken = say(L.text);
  const rec = provider === "human" ? humanFile(L.n) : undefined;
  if (provider === "human" && !rec) missing.push(L.n);
  const hash = rec ? "h" + createHash("sha1").update(readFileSync(rec)).update(VOICE_AF).digest("hex").slice(0, 9)
    : createHash("sha1").update((provider === "human" ? "eleven" : provider) + "|" + (provider === "human" ? ELEVEN_VOICE : voice) + "|" + (provider !== "say" ? speed : "") + "|" + spoken).digest("hex").slice(0, 10);
  const file = `audio/${String(L.n).padStart(2, "0")}-${hash}.mp3`;
  if (!existsSync(file) && !dry) {
    if (rec) {
      await $`ffmpeg -v error -y -i ${rec} -ac 1 -ar 44100 -af ${VOICE_AF} -b:a 128k ${file}`;
    } else if (provider === "human") {
      throw new Error(`line ${L.n}: no recording at audio/human/${L.n}.wav and no cached ElevenLabs clip (${file}); run the eleven provider once first`);
    } else if (provider === "say") {
      const aiff = file.replace(/\.mp3$/, ".aiff");
      await $`say -v ${voice} -r 165 -o ${aiff} ${spoken}`;
      await $`ffmpeg -v error -y -i ${aiff} -ar 44100 -b:a 128k ${file}`;
      await $`rm -f ${aiff}`;
    } else {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
        method: "POST", headers: { "xi-api-key": key!, "content-type": "application/json" },
        body: JSON.stringify({ text: spoken, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, speed } }),
      });
      if (!r.ok) throw new Error(`TTS ${L.n}: ${r.status} ${await r.text()}`);
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      await Bun.sleep(150);
    }
  }
  let dur = 4.5; let useFile = file;
  if (existsSync(file)) {
    const trimmed = file.replace(/\.mp3$/, ".trim2.mp3");
    if (!existsSync(trimmed)) await $`ffmpeg -v error -y -i ${file} -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-58dB:start_silence=0.15,areverse,apad=pad_dur=0.12" -ar 44100 -b:a 128k ${trimmed}`;
    useFile = trimmed; dur = Number((await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${trimmed}`.text()).trim());
  }
  if (lastScene && L.scene !== lastScene) t += GAP_SCENE - GAP_LINE;
  out.push({ n: L.n, scene: L.scene, text: L.text, file: useFile, start: +t.toFixed(3), end: +(t + dur).toFixed(3), dur: +dur.toFixed(3), insertAfter: L.insertAfter });
  t += dur + GAP_LINE + (L.insertAfter ? GAP_INSERT : 0); lastScene = L.scene;
}
const scenes: Record<string, { start: number; end: number }> = {};
for (const o of out) { scenes[o.scene] ??= { start: o.start, end: o.end }; scenes[o.scene].end = o.end + GAP_LINE; }
const total = +(t + 1.5).toFixed(2);
writeFileSync("data/timing.json", JSON.stringify({ provider, voice, total, scenes, lines: out }, null, 1));
if (missing.length) console.log(`not yet recorded (ElevenLabs fallback used): ${missing.join(", ")}`);
console.log(`${out.length} lines, total ${total}s (${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")})`);
for (const [s, b] of Object.entries(scenes)) console.log(`  ${s} ${b.start.toFixed(1)} .. ${b.end.toFixed(1)}  (${(b.end - b.start).toFixed(1)}s)`);
// the mixed track must always match this timing
await $`bun tools/mix.ts`;
