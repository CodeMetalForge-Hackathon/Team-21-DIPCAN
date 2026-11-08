// Evaluate a JS expression in the rendered page (debugging). Usage: bun tools/eval.ts "<expr>" [t]
import { spawn } from "node:child_process";
const expr = process.argv[2] ?? "1", t = Number(process.argv[3] ?? 0), shot = process.argv[4];
const port = 9833 + Math.floor(Math.random() * 100);
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${port}`, "--window-size=1920,1080", `--user-data-dir=/tmp/granule-eval-${port}`, "about:blank"], { stdio: "ignore" });
const kill = () => { try { chrome.kill("SIGKILL"); } catch {} }; process.on("exit", kill);
let wsUrl = ""; for (let i = 0; i < 50 && !wsUrl; i++) { await Bun.sleep(200); try { const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); wsUrl = tabs.find((x: any) => x.type === "page")?.webSocketDebuggerUrl ?? ""; } catch {} }
const ws = new WebSocket(wsUrl); await new Promise(r => ws.onopen = r); let id = 0; const pending = new Map<number, (v: any) => void>();
ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); } else if (m.method === "Runtime.exceptionThrown") console.error("PAGE ERROR:", m.params.exceptionDetails.exception?.description); };
const cdp = (method: string, params: any = {}) => new Promise<any>((res) => { const i = ++id; pending.set(i, (m) => res(m.result ?? m.error)); ws.send(JSON.stringify({ id: i, method, params })); });
await cdp("Runtime.enable"); await cdp("Page.enable"); await cdp("Page.navigate", { url: `http://localhost:8731/page/index.html?render=1&t=${t}` });
for (let i = 0; i < 300; i++) { const r = await cdp("Runtime.evaluate", { expression: "window.__dipcanReady === true", returnByValue: true }); if (r.result?.value) break; await Bun.sleep(100); }
const r = await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); console.log(JSON.stringify(r.result?.value ?? r, null, 1)); if (shot) { await cdp("Runtime.evaluate", { expression: `window.__seek(${t})`, returnByValue: true }); const sc = await cdp("Page.captureScreenshot", { format: "png" }); await Bun.write(shot, Buffer.from(sc.data, "base64")); console.log("shot", shot); } kill();
