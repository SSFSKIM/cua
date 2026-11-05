// #282's hosted probe: on a GitHub-hosted macOS runner, cua's own engine run directly as a child of the job's shell (which
// holds the runner image's Accessibility, PostEvent and Screen Recording grants), route-3 pointer actions into a
// background Chrome for Testing page behind a frontmost TextEdit, on origin/main's engine and this branch's.
//
// Cells (CELLS below), each on a fresh Chrome (its own user-data directory), a fresh engine process and connection:
//   a-main/textarea          origin/main's engine, a coordinate click on the textarea
//   b-shared/checkbox        the branch, shared mode, a coordinate click on the checkbox (AXPress-capable)
//   b-shared/button          the branch, shared mode, the Apply button (AXPress-capable)
//   b-shared/textarea        the branch, shared mode, the textarea
//   c-dedicated/textarea     the branch, `ping {desktop: "dedicated"}`, the textarea
//   b-shared/toolbar-reload  the branch, shared mode, Chrome's own Reload button, after the observation saw the page
//   b-shared/cmdL+checkbox   the branch, shared mode, press_key cmd+l, then the checkbox click inside that hold
//   b-shared/cmdL+textarea   the same, then the textarea
//   geometry                 the window's frame and AXActivationPoint before and after one fresh activation (hit geom)
// Every click cell: get_app_state with a screenshot, the target's centre from its node's frame in screenshot pixels, the
// AX hit there (hit.swift), the page's counters and the server's load count before and 2.5 s after the click, the
// frontmost app before and after, an observation after (its focused element). Only node builtins.
//
//   node scripts/probe-282/probe.mjs --main <cua-engine> --branch <cua-engine> --hit <hit> --out <dir>
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
if (!OUT || !MAIN || !BRANCH || !HIT) { console.error('usage: probe.mjs --main <bin> --branch <bin> --hit <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-282:', ...a);

// --- the page: pointerdown, mousedown, mouseup and click on the document (capture phase), the textarea's focus, the
// checkbox's change, the window's focus and blur; each beaconed with the page's load id, the checkbox's state, the last
// click's isTrusted and detail, the document's hasFocus() and the active element.
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe282 page</title></head>
<body><p><b>probe282 page</b></p><p><label><input id="option" type="checkbox"> Probe option</label> <button id="apply" type="button">Apply</button></p>
<p><textarea id="notes" aria-label="Probe notes" rows="10" cols="60"></textarea></p><p id="status">Ready</p>
<script>(() => { const c = {pointerdown: 0, mousedown: 0, mouseup: 0, click: 0, textFocus: 0, optionChange: 0, applyClick: 0, windowFocus: 0, windowBlur: 0};
let seq = 0, lastClick = null; const load = Math.random().toString(36).slice(2, 10);
const notes = document.getElementById('notes'), option = document.getElementById('option'), apply = document.getElementById('apply');
const send = () => { seq += 1; navigator.sendBeacon('/counters', JSON.stringify({load, seq, counts: c, checked: option.checked, lastClick, focused: document.hasFocus(), active: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null})); };
for (const k of ['pointerdown', 'mousedown', 'mouseup', 'click']) document.addEventListener(k, e => { c[k] += 1; if (k === 'click') lastClick = {trusted: e.isTrusted, detail: e.detail, target: e.target.id || e.target.tagName}; send(); }, true);
notes.addEventListener('focus', () => { c.textFocus += 1; send(); });
option.addEventListener('change', () => { c.optionChange += 1; send(); });
apply.addEventListener('click', () => { c.applyClick += 1; send(); });
window.addEventListener('focus', e => { if (e.target === window) { c.windowFocus += 1; send(); } });
window.addEventListener('blur', e => { if (e.target === window) { c.windowBlur += 1; send(); } });
addEventListener('load', () => { navigator.sendBeacon('/ready'); send(); }); })();</script></body></html>`;

let latest = null, ready = false, loads = 0;
const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') { loads += 1; res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(PAGE); return; }
  let body = '';
  req.on('data', d => { body += d; if (body.length > 4096) req.destroy(); });
  req.on('end', () => {
    if (req.url === '/ready') ready = true;
    if (req.url === '/counters') { try { const r = JSON.parse(body); if (!latest || r.load !== latest.load || r.seq >= latest.seq) latest = r; } catch {} }
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
const json = r => { try { return JSON.parse(r.out); } catch { return r; } };
const frontmost = () => {
  const asn = sh('lsappinfo', ['front']).out;
  const info = sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out;
  return (info.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] || info || null;
};
const osa = script => sh('osascript', ['-e', script]);
const COUNTS = ['pointerdown', 'mousedown', 'mouseup', 'click', 'textFocus', 'optionChange', 'applyClick', 'windowFocus', 'windowBlur'];
const counters = () => (latest ? {load: latest.load, ...latest.counts, checked: latest.checked, lastClick: latest.lastClick, focused: latest.focused, active: latest.active, loads} : {loads});
// The change over the click; a reload (a new load id) counts from zero.
const delta = (before, after) => Object.fromEntries([...COUNTS.map(k => [k, (after[k] ?? 0) - (after.load === before.load ? before[k] ?? 0 : 0)]), ['loads', after.loads - before.loads]]);
const lean = response => JSON.parse(JSON.stringify(response, (k, v) => (k === 'nodes' || k === 'menuBar' ? `[${Array.isArray(v) ? v.length : '?'} omitted]` : v)));

const TEXT_DOC = join(OUT, 'front.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window during each click.\n');
const fileName = label => label.replace(/[^a-z0-9-]+/gi, '_');

async function launchChrome(label) {
  ready = false; latest = null;
  const child = spawn(CFT, [`--user-data-dir=${join(OUT, `chrome-${fileName(label)}`)}`, '--no-first-run', '--no-default-browser-check',
    '--disable-search-engine-choice-screen', '--window-position=400,30', '--window-size=620,720', URL_], {stdio: 'ignore'});
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
  // The hosted display is 1024 x 768. Chrome sits at x 400 to 1020; TextEdit's window goes to its left, in front without
  // covering the page.
  const place = osa('tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {0, 40}\nset size of window 1 to {380, 300}\nend tell\nend tell');
  const bounds = osa('tell application "System Events" to tell process "TextEdit" to get {position, size} of window 1');
  await sleep(500);
  return {front: frontmost(), placeStatus: place.status, bounds: bounds.out};
}

async function startEngine(bin, label) {
  // The engine refuses a socket directory another user owns (/tmp's is root's): one of the run's own, 0700.
  const dir = join(OUT, 'sock');
  mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, `${fileName(label)}.sock`);
  const child = spawn(bin, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  child.stdout.on('data', () => {});
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) throw new Error(`engine exited ${child.exitCode}: ${stderr.slice(0, 2000)}`);
    try { return {child, wire: await Wire.connect(socket), stderr: () => stderr}; } catch { await sleep(50); }
  }
  throw new Error(`engine did not listen: ${stderr.slice(0, 2000)}`);
}

const TARGETS = {
  textarea: n => n.role === 'AXTextArea',
  checkbox: n => n.role === 'AXCheckBox',
  button: n => n.role === 'AXButton' && n.title === 'Apply',
  reload: n => n.role === 'AXButton' && /reload/i.test(`${n.title ?? ''} ${n.description ?? ''} ${n.help ?? ''}`),
};

const CELLS = [
  {label: 'a-main/textarea', engine: 'main', target: 'textarea'},
  {label: 'b-shared/checkbox', engine: 'branch', target: 'checkbox'},
  {label: 'b-shared/button', engine: 'branch', target: 'button'},
  {label: 'b-shared/textarea', engine: 'branch', target: 'textarea'},
  {label: 'c-dedicated/textarea', engine: 'branch', desktop: 'dedicated', target: 'textarea'},
  {label: 'b-shared/toolbar-reload', engine: 'branch', target: 'reload'},
  {label: 'b-shared/cmdL+checkbox', engine: 'branch', keysFirst: 'cmd+l', target: 'checkbox'},
  {label: 'b-shared/cmdL+button', engine: 'branch', keysFirst: 'cmd+l', target: 'button'},
  {label: 'b-shared/cmdL+textarea', engine: 'branch', keysFirst: 'cmd+l', target: 'textarea'},
  {label: 'geometry', engine: 'branch', geometry: true},
];

async function cell(spec) {
  const {label} = spec;
  const row = {label, engine: spec.engine, desktop: spec.desktop ?? 'shared (ping names none)', target: spec.target ?? null, keysFirst: spec.keysFirst ?? null};
  let chrome, engine;
  try {
    chrome = await launchChrome(label);
    row.chromePid = chrome.pid;
    row.textEdit = await frontTextEdit();
    engine = await startEngine(spec.engine === 'main' ? MAIN : BRANCH, label);
    row.ancestry = sh('ps', ['-o', 'pid=,ppid=,comm=', '-p', String(engine.child.pid), '-p', String(process.pid), '-p', String(process.ppid)]).out;
    const w = engine.wire;
    row.status = (await w.call('status')).result;
    row.ping = await w.call('ping', spec.desktop ? {clientApiVersion: 'cua-engine-1', desktop: spec.desktop} : {clientApiVersion: 'cua-engine-1'});
    const shots = join(OUT, `shots-${fileName(label)}`);
    mkdirSync(shots, {recursive: true});
    const state = await w.execute('get_app_state', {pid: chrome.pid, includeScreenshot: true, outputDirectory: shots});
    if (state.error) { row.problem = {getAppState: state.error}; return row; }
    const sky = state.result;
    writeFileSync(join(OUT, `skyshot-${fileName(label)}.json`), JSON.stringify(sky, null, 1));
    row.window = sky.window; row.screenshot = sky.screenshot;
    row.observation = {chromium: sky.timings?.chromium, webAreaFound: sky.timings?.webAreaFound, webShaped: sky.timings?.webShaped};
    if (spec.geometry) {
      // Beside the geometry: the page controls' action names (what webAreaPress reads) before this activation, right
      // after it, and 2 s later, to see whether Chrome advertises AXPress only once its window has been activated.
      const centre = n => [String(n.frame.x + n.frame.width / 2), String(n.frame.y + n.frame.height / 2)];
      const controls = ['checkbox', 'button', 'textarea'].map(t => [t, sky.nodes.find(TARGETS[t])]).filter(([, n]) => n?.frame);
      const actionsNow = () => Object.fromEntries(controls.map(([t, n]) => [t, json(sh(HIT, [String(chrome.pid), ...centre(n)])).appActions ?? null]));
      row.actions = {beforeActivation: actionsNow()};
      row.frontBefore = frontmost();
      row.geometry = json(sh(HIT, ['geom', String(chrome.pid)]));
      row.actions.afterActivation = actionsNow();
      await sleep(2000);
      row.actions.afterActivation2s = actionsNow();
      const g = row.geometry;
      row.geometry.frameEqual = JSON.stringify(g.before?.frame) === JSON.stringify(g.afterActivation?.frame);
      row.geometry.activationPointEqual = JSON.stringify(g.before?.activationPoint) === JSON.stringify(g.afterActivation?.activationPoint);
      row.frontAfter = frontmost();
      return row;
    }
    const node = sky.nodes.find(TARGETS[spec.target]);
    if (!node?.frame) {
      row.problem = `no ${spec.target} node with a frame`;
      row.buttons = sky.nodes.filter(n => n.role === 'AXButton').map(n => ({title: n.title, description: n.description, help: n.help, frame: n.frame}));
      return row;
    }
    const wf = sky.window.frame, nf = node.frame;
    const scale = sky.screenshot.width / wf.width;
    const x = Math.round((nf.x + nf.width / 2 - wf.x) * scale), y = Math.round((nf.y + nf.height / 2 - wf.y) * scale);
    row.targetNode = {role: node.role, title: node.title, description: node.description, actions: node.actions, frame: nf};
    row.point = {screenshotPixel: {x, y}, scale, screen: {x: wf.x + x / scale, y: wf.y + y / scale}};
    row.hit = json(sh(HIT, [String(chrome.pid), String(row.point.screen.x), String(row.point.screen.y)]));
    row.frontBefore = frontmost();
    await sleep(800);
    row.before = counters();
    if (spec.keysFirst) row.keys = lean(await w.execute('press_key', {pid: chrome.pid, key: spec.keysFirst}));
    const started = Date.now();
    row.click = lean(await w.execute('click', {pid: chrome.pid, x, y}));
    row.clickMs = Date.now() - started;
    row.hitAfter = json(sh(HIT, [String(chrome.pid), String(row.point.screen.x), String(row.point.screen.y)]));
    await sleep(2500);
    row.after = counters();
    row.delta = delta(row.before, row.after);
    row.frontAfter = frontmost();
    sh('screencapture', ['-x', join(OUT, `screen-${fileName(label)}.png`)]);
    const later = await w.execute('get_app_state', {pid: chrome.pid});
    // The observation's `focused` is a node's token.
    const f = later.result?.nodes?.find(n => n.token === later.result.focused);
    row.focusedAfter = f ? {role: f.role, title: f.title, description: f.description} : (later.error ?? later.result?.focused ?? null);
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

// The one-line reading of a cell's click: the answer's error name or route and element-click reason.
function verdict(row) {
  if (row.geometry) return `frameEqual=${row.geometry.frameEqual} activationPointEqual=${row.geometry.activationPointEqual}`;
  const c = row.click;
  if (!c) return `no click (${JSON.stringify(row.problem ?? row.exception ?? '').slice(0, 300)})`;
  const meta = c.error ? c.error.meta : c.result?.meta;
  const answer = c.error ? `error ${c.error.errorName ?? c.error.code}` : 'success';
  return `${answer} route=${meta?.inputRoute} elementClick=${JSON.stringify(meta?.elementClick ?? null)} activationClickKind=${JSON.stringify(meta?.activationClickKind ?? null)}`;
}

const config = {
  imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, runnerName: process.env.RUNNER_NAME ?? null,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), chrome: sh(CFT, ['--version']).out,
  display: osa('tell application "Finder" to get bounds of window of desktop').out,
  principalClass: sh('/usr/libexec/PlistBuddy', ['-c', 'Print :NSPrincipalClass', CFT.replace(/MacOS\/.*$/, 'Info.plist')]).out,
  mainEngine: MAIN, branchEngine: BRANCH, mainCommit: process.env.P282_MAIN_COMMIT ?? null, branchCommit: process.env.GITHUB_SHA ?? null,
  rep: process.env.P282_REP ?? null,
};
log('config', JSON.stringify(config));
const rows = [];
for (const spec of CELLS) {
  const row = await cell(spec);
  rows.push(row);
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, cells: rows}, null, 1));
  const s = row.status ?? {};
  log(`${row.label}: grants ax=${s.accessibility} postHid=${s.canPostHid} screen=${s.screenRecording} inputMon=${s.inputMonitoring}; front ${row.frontBefore} -> ${row.frontAfter}`);
  log(`${row.label}: ${verdict(row)}`);
  if (row.keys) log(`${row.label}: keys ${row.keys.error ? 'error ' + (row.keys.error.errorName ?? row.keys.error.code) : 'success route=' + row.keys.result?.meta?.inputRoute}`);
  if (row.delta) log(`${row.label}: delta ${JSON.stringify(row.delta)} checked=${row.after?.checked} lastClick=${JSON.stringify(row.after?.lastClick)} active=${row.after?.active} focusedAfter=${JSON.stringify(row.focusedAfter)}`);
  if (row.hit) log(`${row.label}: hit before ${JSON.stringify(row.hit.appChain?.slice(0, 3))} actions ${JSON.stringify(row.hit.appActions)}; after actions ${JSON.stringify(row.hitAfter?.appActions)}`);
  if (row.geometry) log(`${row.label}: geometry ${JSON.stringify(row.geometry)}`);
  if (row.actions) log(`${row.label}: actions ${JSON.stringify(row.actions)}`);
  if (row.exception || row.problem) log(`${row.label}: PROBLEM ${JSON.stringify(row.problem ?? '')} ${row.exception ?? ''} ${row.buttons ? JSON.stringify(row.buttons) : ''}`);
}
server.close();
process.exit(0);
