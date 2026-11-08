// Render one 1920x1080 frame per step from the offline teardown page with one headless Chrome over CDP.
// Usage: bun teardown/render-steps.ts [port]   (server must already be up: bun tools/serve.ts <port>)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const port = process.argv[2] ?? "8745"; const outDir = "teardown/frames"; mkdirSync(outDir, { recursive: true });
const dbg = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${dbg}`, "--window-size=1920,1080", "--hide-scrollbars", "--force-device-scale-factor=1", "--enable-unsafe-swiftshader", `--user-data-dir=/tmp/granule-td-${dbg}`, "about:blank"], { stdio: "ignore" });
const kill = () => { try { chrome.kill("SIGKILL"); } catch {} }; process.on("exit", kill); process.on("SIGINT", () => { kill(); process.exit(1); });
let wsUrl = ""; for (let i = 0; i < 50 && !wsUrl; i++) { await Bun.sleep(200); try { const r = await fetch(`http://127.0.0.1:${dbg}/json`); wsUrl = (await r.json()).find((t: any) => t.type === "page")?.webSocketDebuggerUrl ?? ""; } catch {} }
if (!wsUrl) { kill(); throw new Error("no page target"); }
const ws = new WebSocket(wsUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map<number, (v: any) => void>();
ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); } };
const cdp = (method: string, params: any = {}) => new Promise<any>((res, rej) => { const i = ++id; pending.set(i, (m) => m.error ? rej(new Error(method + ": " + JSON.stringify(m.error))) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await cdp("Page.enable"); await cdp("Runtime.enable");
await cdp("Page.navigate", { url: `http://localhost:${port}/teardown/index-offline.html` });
for (let i = 0; i < 200; i++) { const r = await cdp("Runtime.evaluate", { expression: "window.__granuleReady === true", returnByValue: true }); if (r.result.value) break; await Bun.sleep(100); if (i === 199) { kill(); throw new Error("page never ready"); } }
await Bun.sleep(800);
const fonts = await cdp("Runtime.evaluate", { expression: "JSON.stringify([...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+' '+f.weight))", returnByValue: true }); console.log("fonts loaded:", fonts.result.value);
for (let s = 0; s < 8; s++) {
  await cdp("Runtime.evaluate", { expression: `window.__step(${s})`, awaitPromise: true, returnByValue: true });
  await Bun.sleep(120);
  const shot = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${outDir}/step${s + 1}.png`, Buffer.from(shot.data, "base64")); console.log(`step${s + 1}.png`);
}
kill(); console.log("done");
