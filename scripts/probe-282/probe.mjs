// #282's hosted probe: whether a GitHub-hosted macOS runner gives cua's own engine, run directly as a child of the job's
// shell, the Accessibility and event-posting grants, and what one route-3 coordinate click into a background Chrome for
// Testing page does there on three engines:
//   a-main       origin/main's engine (the behaviour before #282)
//   b-shared     this branch's engine, its connection in shared mode (ping without `desktop`)
//   c-dedicated  this branch's engine, `ping {desktop: "dedicated"}`
// Each variant gets a fresh Chrome (its own user-data directory) on a loopback counters page, TextEdit put in front of
// it (beside it, not over the textarea), a fresh engine process, one get_app_state with a screenshot, one coordinate
// click at the textarea's centre, and the page's counters read before and after. Only node builtins.
//
//   node scripts/probe-282/probe.mjs --main <cua-engine> --branch <cua-engine> --out <dir>
//
// Runs only on a GitHub-hosted runner: it launches and kills its own Chrome and TextEdit and moves TextEdit's window.
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-282: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), MAIN = arg('main'), BRANCH = arg('branch'), HIT = arg('hit');
if (!OUT || !MAIN || !BRANCH) { console.error('usage: probe.mjs --main <bin> --branch <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-282:', ...a);

// --- the page: pointerdown, mousedown, mouseup, click (document, capture phase), the textarea's focus, the window's
// focus and blur, each beaconed with the document's hasFocus() and the active element's id.
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe282 page</title></head>
<body><h1>probe282 page</h1><p><textarea id="notes" aria-label="Probe notes" rows="14" cols="60"></textarea></p><p id="status">Ready</p>
<script>(() => { const c = {pointerdown: 0, mousedown: 0, mouseup: 0, click: 0, textFocus: 0, windowFocus: 0, windowBlur: 0}; let seq = 0;
const notes = document.getElementById('notes');
const send = () => { seq += 1; navigator.sendBeacon('/counters', JSON.stringify({seq, counts: c, focused: document.hasFocus(), active: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null})); };
for (const k of ['pointerdown', 'mousedown', 'mouseup', 'click']) document.addEventListener(k, () => { c[k] += 1; send(); }, true);
notes.addEventListener('focus', () => { c.textFocus += 1; send(); });
window.addEventListener('focus', e => { if (e.target === window) { c.windowFocus += 1; send(); } });
window.addEventListener('blur', e => { if (e.target === window) { c.windowBlur += 1; send(); } });
addEventListener('load', () => { navigator.sendBeacon('/ready'); send(); }); })();</script></body></html>`;

let latest = null, ready = false;
const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') { res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(PAGE); return; }
  let body = '';
  req.on('data', d => { body += d; if (body.length > 4096) req.destroy(); });
  req.on('end', () => {
    if (req.url === '/ready') ready = true;
    if (req.url === '/counters') { try { const r = JSON.parse(body); if (!latest || r.seq >= latest.seq) latest = r; } catch {} }
    res.writeHead(204); res.end();
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;

// --- the engine's wire: a 4-byte little-endian length, then JSON-RPC 2.0.
class Wire {
  static connect(path) {
    return new Promise((resolve, reject) => {
      const s = createConnection(path);
      s.once('connect', () => { s.off('error', reject); resolve(new Wire(s)); });
      s.once('error', reject);
    });
  }
  constructor(s) {
    this.s = s; this.buf = Buffer.alloc(0); this.pending = new Map(); this.id = 1;
    s.on('data', d => {
      this.buf = Buffer.concat([this.buf, d]);
      while (this.buf.length >= 4) {
        const n = this.buf.readUInt32LE(0);
        if (this.buf.length < 4 + n) break;
        const msg = JSON.parse(this.buf.subarray(4, 4 + n).toString('utf8'));
        this.buf = this.buf.subarray(4 + n);
        this.pending.get(msg.id)?.(msg); this.pending.delete(msg.id);
      }
    });
    s.on('error', () => {});
  }
  call(method, params = {}, timeout = 90_000) {
    const id = this.id++;
    const bytes = Buffer.from(JSON.stringify({jsonrpc: '2.0', id, method, params}), 'utf8');
    const head = Buffer.alloc(4); head.writeUInt32LE(bytes.length, 0);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: no answer in ${timeout} ms`)); }, timeout);
      this.pending.set(id, m => { clearTimeout(t); resolve(m); });
      this.s.write(Buffer.concat([head, bytes]));
    });
  }
  execute(method, args) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 80_000}); }
  close() { this.s.destroy(); }
}

const sh = (cmd, args) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout: 20_000}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const frontmost = () => {
  const asn = sh('lsappinfo', ['front']).out;
  const info = sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out;
  return (info.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] || info || null;
};
const osa = script => sh('osascript', ['-e', script]);
const counters = () => (latest ? {...latest.counts, focused: latest.focused, active: latest.active, seq: latest.seq} : null);
const delta = (before, after) => before && after
  ? Object.fromEntries(Object.keys(after.counts ?? after).filter(k => typeof after[k] === 'number' && k !== 'seq').map(k => [k, after[k] - (before[k] ?? 0)]))
  : null;

// A Skyshot's nodes are one flat list in walk order (each node's `children` a count).
const findNode = (nodes, pred) => (nodes ?? []).find(pred) ?? null;
function lean(response) {  // the click's answer without anything bulky
  return JSON.parse(JSON.stringify(response, (k, v) => (k === 'nodes' || k === 'menuBar' ? `[${Array.isArray(v) ? v.length : '?'} omitted]` : v)));
}

const TEXT_DOC = join(OUT, 'front.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window during each click.\n');

async function launchChrome(label) {
  ready = false; latest = null;
  const udd = join(OUT, `chrome-${label}`);
  const child = spawn(CFT, [`--user-data-dir=${udd}`, '--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen',
    '--window-position=400,30', '--window-size=620,720', URL_], {stdio: 'ignore'});
  for (let i = 0; i < 120 && !ready; i++) await sleep(250);
  if (!ready) throw new Error('Chrome did not load the page in 30 s');
  await sleep(1500);
  return child;
}

async function frontTextEdit() {
  for (let i = 0; i < 4; i++) {
    sh('open', ['-a', 'TextEdit', TEXT_DOC]);
    await sleep(1500);
    if (frontmost() === 'com.apple.TextEdit') break;
  }
  // The hosted display is 1024 x 768. Chrome sits at x 400 to 1020; TextEdit's window goes to its left, so it is in front without covering the page.
  const place = osa('tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {0, 40}\nset size of window 1 to {380, 300}\nend tell\nend tell');
  const bounds = osa('tell application "System Events" to tell process "TextEdit" to get {position, size} of window 1');
  await sleep(500);
  return {front: frontmost(), placeStatus: place.status, placeErr: place.err.slice(0, 300), bounds: bounds.out};
}

async function startEngine(bin, label) {
  // The engine refuses a socket directory another user owns (/tmp's is root's): one of the run's own, 0700.
  const dir = join(OUT, 'sock');
  mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, `${label}.sock`);
  const env = {...process.env, CUA_ENGINE_SOCKET: socket};
  const child = spawn(bin, [], {env, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  child.stdout.on('data', () => {});
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) throw new Error(`engine exited ${child.exitCode}: ${stderr.slice(0, 2000)}`);
    try { return {child, wire: await Wire.connect(socket), stderr: () => stderr}; } catch { await sleep(50); }
  }
  throw new Error(`engine did not listen: ${stderr.slice(0, 2000)}`);
}

async function variant(label, bin, desktop) {
  const row = {label, desktop: desktop ?? '(none: shared default)'};
  let chrome, engine;
  try {
    chrome = await launchChrome(label);
    row.chromePid = chrome.pid;
    row.textEdit = await frontTextEdit();
    engine = await startEngine(bin, label);
    row.enginePid = engine.child.pid;
    row.ancestry = sh('ps', ['-o', 'pid=,ppid=,comm=', '-p', String(engine.child.pid), '-p', String(process.pid), '-p', String(process.ppid)]).out;
    const w = engine.wire;
    row.status = (await w.call('status')).result;
    row.ping = await w.call('ping', desktop ? {clientApiVersion: 'cua-engine-1', desktop} : {clientApiVersion: 'cua-engine-1'});
    const shots = join(OUT, `shots-${label}`);
    mkdirSync(shots, {recursive: true});
    const state = await w.execute('get_app_state', {pid: chrome.pid, includeScreenshot: true, outputDirectory: shots});
    if (state.error) { row.getAppStateError = state.error; return row; }
    const sky = state.result;
    writeFileSync(join(OUT, `skyshot-${label}.json`), JSON.stringify(sky, null, 1));
    row.window = sky.window; row.screenshot = sky.screenshot; row.observeTimings = {chromium: sky.timings?.chromium, webAreaFound: sky.timings?.webAreaFound, enabled: sky.timings?.enabled};
    const area = findNode(sky.nodes, n => n.role === 'AXTextArea');
    if (!area?.frame || !sky.window?.frame || !sky.screenshot?.width) { row.problem = 'no textarea frame, window frame or screenshot'; return row; }
    const wf = sky.window.frame, af = area.frame;
    const scale = sky.screenshot.width / wf.width;
    const x = Math.round((af.x + af.width / 2 - wf.x) * scale), y = Math.round((af.y + af.height / 2 - wf.y) * scale);
    row.target = {textareaFrame: af, screenshotPixel: {x, y}, scale};
    // What the engine's pointerView reads before the click (Routes.swift): the AX hit at the posted point now, and the
    // principal class chromiumFamily reads.
    const posted = {x: wf.x + x / scale, y: wf.y + y / scale};
    if (HIT) { const h = sh(HIT, [String(chrome.pid), String(posted.x), String(posted.y)]); try { row.hit = JSON.parse(h.out); } catch { row.hit = h; } }
    row.principalClass = sh('/usr/libexec/PlistBuddy', ['-c', 'Print :NSPrincipalClass', CFT.replace(/MacOS\/.*$/, 'Info.plist')]).out;
    row.frontBefore = frontmost();
    await sleep(800);
    row.before = counters();
    const started = Date.now();
    const click = await w.execute('click', {pid: chrome.pid, x, y});
    row.clickMs = Date.now() - started;
    row.click = lean(click);
    await sleep(2500);
    row.after = counters();
    row.delta = delta(row.before, row.after);
    row.frontAfter = frontmost();
    sh('screencapture', ['-x', join(OUT, `screen-${label}.png`)]);
    try { await w.call('shutdown', {}, 5000); } catch {}
    w.close();
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 3000);
  } finally {
    if (engine) { row.engineStderr = engine.stderr().slice(-3000); if (engine.child.exitCode === null) engine.child.kill('SIGKILL'); }
    if (chrome && chrome.exitCode === null) { chrome.kill('SIGTERM'); await sleep(2000); if (chrome.exitCode === null) chrome.kill('SIGKILL'); }
    await sleep(1000);
  }
  return row;
}

log('sw_vers', sh('sw_vers', []).out.replace(/\s+/g, ' '), '| chrome', sh(CFT, ['--version']).out);
log('desktop bounds', osa('tell application "Finder" to get bounds of window of desktop').out);
const rows = [];
for (const [label, bin, desktop] of [['a-main', MAIN, null], ['b-shared', BRANCH, null], ['c-dedicated', BRANCH, 'dedicated']]) {
  const row = await variant(label, bin, desktop);
  rows.push(row);
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(rows, null, 1));
  const s = row.status ?? {};
  log(`${label}: grants ax=${s.accessibility} postHid=${s.canPostHid} screen=${s.screenRecording} inputMon=${s.inputMonitoring} | engine ${s.engineVersion}`);
  log(`${label}: frontBefore=${row.frontBefore} frontAfter=${row.frontAfter} textEdit=${JSON.stringify(row.textEdit)}`);
  log(`${label}: click ${row.click?.error ? 'ERROR ' + JSON.stringify(row.click.error).slice(0, 600) : 'OK ' + String(JSON.stringify(row.click?.result?.meta ?? row.click?.result)).slice(0, 900)}`);
  log(`${label}: delta ${JSON.stringify(row.delta)} after ${JSON.stringify(row.after)}`);
  log(`${label}: principalClass=${row.principalClass} hit ${JSON.stringify(row.hit)}`);
  if (row.exception || row.problem || row.getAppStateError) log(`${label}: PROBLEM ${row.problem ?? ''} ${JSON.stringify(row.getAppStateError ?? '')} ${row.exception ?? ''}`);
}
server.close();
process.exit(0);
