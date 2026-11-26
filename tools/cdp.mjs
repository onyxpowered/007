// Drive a background Chrome over the DevTools protocol (development only; no window).
//   node tools/cdp.mjs start <url>       launch headless Chrome on a page
//   node tools/cdp.mjs eval <file.js>    run a script in the page (await-able; its value is printed)
//   node tools/cdp.mjs shot <out.png>    screenshot the page
//   node tools/cdp.mjs stop
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import WebSocket from 'ws';

const PORT = 9333, STATE = '/tmp/rl-cdp.json', CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [cmd, arg] = process.argv.slice(2);
const page = async () => (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page').webSocketDebuggerUrl;
const call = async (method, params, timeout = 600e3) => {
  const ws = new WebSocket(await page(), { maxPayload: 1 << 30 });
  await new Promise((r, j) => (ws.on('open', r), ws.on('error', j)));
  const res = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeout);
    ws.on('message', (m) => { const d = JSON.parse(m); if (d.id === 1) (clearTimeout(t), resolve(d)); });
    ws.send(JSON.stringify({ id: 1, method, params }));
  });
  ws.close();
  if (res.error) throw new Error(res.error.message);
  return res.result;
};
if (cmd === 'start') {
  const c = spawn(CHROME, [`--remote-debugging-port=${PORT}`, '--headless=new', '--user-data-dir=/tmp/rl-cdp-profile', '--window-size=1920,1080', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', arg], { detached: true, stdio: 'ignore' });
  c.unref(); writeFileSync(STATE, JSON.stringify({ pid: c.pid }));
  for (let i = 0; i < 60; i++) { try { await page(); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  console.log('started');
} else if (cmd === 'eval') {
  const r = await call('Runtime.evaluate', { expression: `(async () => { ${readFileSync(arg, 'utf8')} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  const v = r.result.value; console.log(typeof v === 'string' ? v : JSON.stringify(v));
} else if (cmd === 'shot') {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(arg, Buffer.from(r.data, 'base64')); console.log('saved', arg);
} else if (cmd === 'stop') {
  if (existsSync(STATE)) { try { process.kill(JSON.parse(readFileSync(STATE)).pid); } catch {} rmSync(STATE); }
  console.log('stopped');
}
if (cmd === 'input') {
  // node tools/cdp.mjs input '[["key","KeyM"],["click",960,500,0],["drag",900,500,1000,450],["click",960,500,2]]'
  const ws = new WebSocket(await page()); await new Promise((r) => ws.on('open', r));
  let id = 0; const send = (method, params) => new Promise((r) => { const i = ++id; ws.on('message', (m) => JSON.parse(m).id === i && r()); ws.send(JSON.stringify({ id: i, method, params })); });
  const B = ['left', 'middle', 'right'], wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const [k, ...a] of JSON.parse(arg)) {
    if (k === 'key') { await send('Input.dispatchKeyEvent', { type: 'keyDown', code: a[0], key: a[0].replace(/^Key/, '').toLowerCase() }); await send('Input.dispatchKeyEvent', { type: 'keyUp', code: a[0], key: a[0].replace(/^Key/, '').toLowerCase() }); }
    if (k === 'click') for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: a[0], y: a[1], button: B[a[2] || 0], buttons: type === 'mousePressed' ? [1, 4, 2][a[2] || 0] : 0, clickCount: 1 });
    if (k === 'drag') { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a[0], y: a[1], button: 'left', buttons: 1, clickCount: 1 }); for (let i = 1; i <= 8; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a[0] + ((a[2] - a[0]) * i) / 8, y: a[1] + ((a[3] - a[1]) * i) / 8, button: 'left', buttons: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: a[2], y: a[3], button: 'left', buttons: 0, clickCount: 1 }); }
    if (k === 'wait') await wait(a[0]);
  }
  ws.close(); console.log('input done');
}
