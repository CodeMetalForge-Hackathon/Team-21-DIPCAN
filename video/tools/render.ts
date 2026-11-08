// Render frames from the page with one headless Chrome over CDP, then mux with ffmpeg.
// Usage: bun tools/render.ts [--fps 30] [--from 0] [--to <s>] [--url http://localhost:8731/page/index.html] [--out out/frames] [--only t1,t2,...] [--mux]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
const a = process.argv.slice(2); const opt = (k: string, d: string) => a.includes(k) ? a[a.indexOf(k) + 1] : d;
const fps = Number(opt("--fps", "30")), url = opt("--url", "http://localhost:8731/page/index.html"), outDir = opt("--out", "out/frames"), mp4 = opt("--mp4", "out/granule-graphics.mp4");
const timing = existsSync("data/timing.json") ? JSON.parse(readFileSync("data/timing.json", "utf8")) : { total: 10 };
const from = Number(opt("--from", "0")), to = Number(opt("--to", String(timing.total)));
const only = a.includes("--only") ? opt("--only", "").split(",").map(Number) : null;
mkdirSync(outDir, { recursive: true });
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, "--window-size=1920,1080", "--hide-scrollbars", "--force-device-scale-factor=1", "--disable-gpu-vsync", "--enable-unsafe-swiftshader", `--user-data-dir=/tmp/granule-chrome-${port}`, "about:blank"], { stdio: "ignore" });
const kill = () => { try { chrome.kill("SIGKILL"); } catch {} };
process.on("exit", kill); process.on("SIGINT", () => { kill(); process.exit(1); });
let wsUrl = ""; for (let i = 0; i < 50 && !wsUrl; i++) { await Bun.sleep(200); try { const r = await fetch(`http://127.0.0.1:${port}/json`); const tabs = await r.json(); wsUrl = tabs.find((t: any) => t.type === "page")?.webSocketDebuggerUrl ?? ""; } catch {} }
if (!wsUrl) { kill(); throw new Error("Chrome did not expose a page target"); }
const ws = new WebSocket(wsUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map<number, (v: any) => void>();
ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); } else if (m.method === "Runtime.exceptionThrown") console.error("PAGE ERROR:", m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") console.error("PAGE console.error:", m.params.args.map((a: any) => a.value ?? a.description).join(" ")); };
const cdp = (method: string, params: any = {}) => new Promise<any>((res, rej) => { const i = ++id; pending.set(i, (m) => m.error ? rej(new Error(method + ": " + JSON.stringify(m.error))) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await cdp("Page.enable"); await cdp("Runtime.enable");
await cdp("Page.navigate", { url: url + (url.includes("?") ? "&" : "?") + "render=1" });
for (let i = 0; i < 300; i++) { const r = await cdp("Runtime.evaluate", { expression: "window.__dipcanReady === true", returnByValue: true }); if (r.result.value) break; await Bun.sleep(100); if (i === 299) throw new Error("page never set __dipcanReady"); }
const times: number[] = only ?? Array.from({ length: Math.ceil((to - from) * fps) }, (_, i) => from + i / fps);
const t0 = Date.now(); let n = 0;
for (const t of times) {
  const pre = only ? `t${t.toFixed(2).replace(".", "_")}.png` : `${String(Math.round((t - from) * fps)).padStart(5, "0")}.png`;
  if (!only && existsSync(`${outDir}/${pre}`)) { n++; continue; } // resume: skip frames already on disk
  await cdp("Runtime.evaluate", { expression: `window.__seek(${t})`, awaitPromise: true, returnByValue: true });
  const shot = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const name = only ? `t${t.toFixed(2).replace(".", "_")}.png` : `${String(Math.round((t - from) * fps)).padStart(5, "0")}.png`;
  writeFileSync(`${outDir}/${name}`, Buffer.from(shot.data, "base64")); n++;
  if (n % 150 === 0) console.log(`${n}/${times.length} frames, ${((Date.now() - t0) / n).toFixed(0)} ms/frame`);
}
kill(); console.log(`${n} frames -> ${outDir} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (a.includes("--mux")) {
  const frames = readdirSync(outDir).filter(f => /^\d{5}\.png$/.test(f)).length; const expected = times.length;
  if (frames !== expected) { console.error(`frame count ${frames} != ${expected}`); process.exit(2); }
  mkdirSync("out", { recursive: true });
  const audio = existsSync("out/narration.wav") ? ["-i", "out/narration.wav", "-c:a", "aac", "-b:a", "160k", "-shortest"] : [];
  const ff = Bun.spawnSync(["ffmpeg", "-v", "error", "-y", "-framerate", String(fps), "-i", `${outDir}/%05d.png`, ...audio, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", mp4]);
  if (ff.exitCode !== 0) { console.error(ff.stderr.toString()); process.exit(3); }
  console.log(mp4);
}
