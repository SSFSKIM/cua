// #294's measurement spike on a GitHub-hosted macOS runner: origin/main's engine (a child of the job shell, with its
// Accessibility, PostEvent and Screen Recording grants), shared mode unless a cell says otherwise, a fresh Chrome for
// Testing (or Safari) behind a frontmost TextEdit per cell, a click on the toolbar's Reload, reloads counted as GET
// requests at the server. scripts/probe-294/tool.swift taps the target's events (tap), samples its key/main/active
// state through AX (state), reads one attribute (read), and clicks at the HID level (hidclick).
//   t/reload-<s>s          observe (screenshot), then route 3's coordinate click on Reload <s> s after the observation
//   s/pre30-obs-1s         30 s idle behind TextEdit before the observation, then the click 1 s after it
//   s/reobs-24-click-25    observe, re-observe at 24 s (with a screenshot), click at 25 s
//   s/reobs-noshot-24      the same, the re-observation without a screenshot
//   s/read-24-click-25     observe, one cheap AX read at 24 s, click at 25 s
//   s/plain-<s>s           spikeRoute 2' (the events posted to the pid, no fake activation)
//   s/dedicated-<s>s       the connection's ping names desktop dedicated (the inert click goes first)
//   s/element-<s>s         an element click on Reload's token (route 1, AXPress)
//   s/hid-25s              a real HID click at Reload's point (Chrome comes forward; a control for Chrome's own state)
//   x/tap-<s>s             route 3 at <s> s with the pid tap and the AX state sampler running around the click
//   x/hid-tap-25s          the HID click with the pid tap (a real event's fields for comparison)
//   safari/reload-<s>s     Safari's Reload by route 3 (a non-Chromium toolbar)
//
//   node scripts/probe-294/live.mjs --engine <cua-engine> --tool <tool> --out <dir> [--cells <prefix,…>]
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-294 live: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), ENGINE = arg('engine'), TOOL = arg('tool');
const ONLY = arg('cells') ? arg('cells').split(',').filter(Boolean) : null;
if (!OUT || !ENGINE || !TOOL) { console.error('usage: live.mjs --engine <bin> --tool <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-294 live:', ...a);

const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe294 page</title>
<style>body{margin:8px;font:14px sans-serif}#option{width:24px;height:24px}</style></head>
<body><p><b>probe294 page</b></p><p><label><input id="option" type="checkbox">Probe option</label></p><p id="status">Plain status text here</p>
<script>(() => {
const c = {pointerdown: 0, pointerup: 0, mousedown: 0, mouseup: 0, click: 0, winFocus: 0, winBlur: 0, visibility: 0};
for (const k of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) document.addEventListener(k, e => { c[k] += 1; send(k, {target: e.target.id || e.target.tagName}); }, true);
addEventListener('focus', () => { c.winFocus += 1; send('focus'); });
addEventListener('blur', () => { c.winBlur += 1; send('blur'); });
document.addEventListener('visibilitychange', () => { c.visibility += 1; send('visibility'); });
let seq = 0;
const send = (ev, extra) => navigator.sendBeacon('/b', JSON.stringify({ev, seq: ++seq, t: Date.now(), ...extra, counts: {...c}, hasFocus: document.hasFocus(), vis: document.visibilityState}));
addEventListener('load', () => { send('load'); setInterval(() => send('tick'), 250); }); })();</script></body></html>`;

let beacons = [], loads = 0;
const server = createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) { loads += 1; res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(PAGE); return; }
  if (req.method === 'GET') { res.writeHead(404); res.end(); return; }
  let body = '';
  req.on('data', d => { body += d; if (body.length > 65536) req.destroy(); });
  req.on('end', () => { try { beacons.push({arrive: Date.now(), ...JSON.parse(body)}); } catch {} res.writeHead(204); res.end(); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;

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
  execute(method, args, extra = {}) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 80_000, ...extra}); }
  close() { this.s.destroy(); }
}

const sh = (cmd, args) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout: 20_000}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
// The tool as a child; `ready` resolves at its "ready" line on stderr (the tap) or at once for the others.
function tool(args, timeout = 60_000, waitReady = false) {
  const child = spawn(TOOL, args, {stdio: ['ignore', 'pipe', 'pipe']});
  let out = '', err = '', readyResolve;
  const ready = new Promise(r => { readyResolve = r; });
  if (!waitReady) readyResolve();
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { err += d; if (err.includes('ready')) readyResolve(); });
  const t = setTimeout(() => child.kill('SIGKILL'), timeout);
  const done = new Promise(resolve => child.on('close', code => { clearTimeout(t); readyResolve(); try { resolve(JSON.parse(out)); } catch { resolve({status: code, out: out.slice(0, 2000), err: err.slice(0, 2000)}); } }));
  return {ready, done};
}
const frontmost = () => {
  const asn = sh('lsappinfo', ['front']).out;
  const info = sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out;
  return (info.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] || info || null;
};
const pidOf = name => Number(sh('pgrep', ['-x', name]).out.split('\n')[0]) || null;
const osa = script => sh('osascript', ['-e', script]);
const lean = response => JSON.parse(JSON.stringify(response, (k, v) => (k === 'nodes' || k === 'menuBar' ? `[${Array.isArray(v) ? v.length : '?'} omitted]` : v)));
const fileName = label => label.replace(/[^a-z0-9-]+/gi, '_');
const TEXT_DOC = join(OUT, 'front.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window.\n');

async function waitLoad() {
  for (let i = 0; i < 160 && !beacons.some(b => b.ev === 'load'); i++) await sleep(250);
  if (!beacons.some(b => b.ev === 'load')) throw new Error('the page did not load in 40 s');
  await sleep(1500);
}
async function launchChrome(label) {
  beacons = [];
  const child = spawn(CFT, [`--user-data-dir=${join(OUT, `chrome-${fileName(label)}`)}`, '--no-first-run', '--no-default-browser-check',
    '--disable-search-engine-choice-screen', '--window-position=400,30', '--window-size=620,720', URL_], {stdio: 'ignore'});
  await waitLoad();
  return {pid: child.pid, stop: async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await sleep(2000); if (child.exitCode === null) child.kill('SIGKILL'); } }};
}
async function launchSafari() {
  beacons = [];
  osa('tell application "Safari" to quit');
  await sleep(1500);
  sh('open', ['-a', 'Safari', URL_]);
  await waitLoad();
  const pid = pidOf('Safari');
  osa('tell application "System Events"\ntell process "Safari"\nset position of window 1 to {400, 30}\nset size of window 1 to {620, 720}\nend tell\nend tell');
  await sleep(800);
  return {pid, stop: async () => { osa('tell application "Safari" to quit'); await sleep(1500); }};
}
async function frontTextEdit() {
  for (let i = 0; i < 4; i++) {
    sh('open', ['-a', 'TextEdit', TEXT_DOC]);
    await sleep(1500);
    if (frontmost() === 'com.apple.TextEdit') break;
  }
  const place = osa('tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {0, 40}\nset size of window 1 to {380, 300}\nend tell\nend tell');
  await sleep(500);
  return {front: frontmost(), placeStatus: place.status};
}
async function startEngine(label) {
  const dir = join(OUT, 'sock');
  mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, `${fileName(label)}.sock`);
  const child = spawn(ENGINE, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  child.stdout.on('data', () => {});
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) throw new Error(`engine exited ${child.exitCode}: ${stderr.slice(0, 2000)}`);
    try { return {child, wire: await Wire.connect(socket), stderr: () => stderr}; } catch { await sleep(50); }
  }
  throw new Error(`engine did not listen: ${stderr.slice(0, 2000)}`);
}
async function observe(w, pid, label, screenshot) {
  const args = {pid};
  if (screenshot) { const shots = join(OUT, `shots-${fileName(label)}`); mkdirSync(shots, {recursive: true}); Object.assign(args, {includeScreenshot: true, outputDirectory: shots}); }
  const from = Date.now();
  const state = await w.execute('get_app_state', args);
  const at = Date.now();
  if (state.error) throw new Error(`get_app_state: ${JSON.stringify(state.error).slice(0, 500)}`);
  return {sky: state.result, at, ms: at - from};
}
const pixel = (sky, p) => { const wf = sky.window.frame, s = sky.screenshot.width / wf.width; return {x: Math.round((p.x - wf.x) * s), y: Math.round((p.y - wf.y) * s), scale: s}; };
const centre = n => ({x: n.frame.x + n.frame.width / 2, y: n.frame.y + n.frame.height / 2});
const findReload = sky => sky.nodes.find(n => n.role === 'AXButton' && /reload/i.test(`${n.title ?? ''} ${n.description ?? ''} ${n.help ?? ''}`));
const pageEvents = (from, to) => beacons.filter(b => b.t >= from && b.t <= to && b.ev !== 'tick').map(b => ({ev: b.ev, dt: b.t - from, target: b.target, hasFocus: b.hasFocus, vis: b.vis}));
function tickGaps(from, to) {
  const ts = beacons.filter(b => b.ev === 'tick' && b.arrive >= from && b.arrive <= to).map(b => b.t);
  let max = 0;
  for (let i = 1; i < ts.length; i++) max = Math.max(max, ts[i] - ts[i - 1]);
  return {ticks: ts.length, maxGapMs: max};
}
const latestTick = before => [...beacons].reverse().find(b => b.t <= before) ?? null;

const CELLS = [];
for (const s of [1, 10, 12, 15, 17, 20, 25]) CELLS.push({label: `t/reload-${s}s`, waitMs: s * 1000});
CELLS.push({label: 's/pre30-obs-1s', preMs: 30_000, waitMs: 1000});
CELLS.push({label: 's/reobs-24-click-25', between: {at: 24_000, do: 'reobs'}, waitMs: 25_000});
CELLS.push({label: 's/reobs-noshot-24-click-25', between: {at: 24_000, do: 'reobs-noshot'}, waitMs: 25_000});
CELLS.push({label: 's/read-24-click-25', between: {at: 24_000, do: 'read'}, waitMs: 25_000});
for (const s of [1, 25]) CELLS.push({label: `s/plain-${s}s`, route: 'plain', waitMs: s * 1000});
for (const s of [1, 25]) CELLS.push({label: `s/dedicated-${s}s`, desktop: 'dedicated', waitMs: s * 1000});
for (const s of [1, 25]) CELLS.push({label: `s/element-${s}s`, route: 'element', waitMs: s * 1000});
for (const s of [1, 25]) CELLS.push({label: `x/tap-${s}s`, tap: true, state: true, waitMs: s * 1000});
CELLS.push({label: 's/hid-25s', route: 'hid', waitMs: 25_000});
CELLS.push({label: 'x/hid-tap-25s', route: 'hid', tap: true, waitMs: 25_000});
for (const s of [1, 25]) CELLS.push({label: `safari/reload-${s}s`, app: 'safari', waitMs: s * 1000});
const RUN = CELLS.filter(c => !ONLY || ONLY.some(p => c.label.startsWith(p)));

async function cell(spec) {
  const row = {label: spec.label, spec};
  let target, engine;
  try {
    row.cursor = await tool(['cursor']).done;
    target = spec.app === 'safari' ? await launchSafari() : await launchChrome(spec.label);
    const pid = target.pid;
    row.pid = pid;
    row.launchedAt = Date.now();
    row.textEdit = await frontTextEdit();
    row.textEditFrontAt = Date.now();
    const userPid = pidOf('TextEdit');
    if (spec.preMs) await sleep(spec.preMs);
    engine = await startEngine(spec.label);
    const w = engine.wire;
    const ping = {clientApiVersion: 'cua-engine-1'};
    if (spec.desktop) ping.desktop = spec.desktop;
    row.ping = (await w.call('ping', ping)).result ?? null;
    const o = await observe(w, pid, spec.label, true);
    row.observation = {ms: o.ms, sinceTextEditFrontMs: o.at - row.textEditFrontAt, lineage: o.sky.lineage ?? null};
    let sky = o.sky;
    const node = findReload(sky);
    if (!node?.frame) { row.problem = 'no Reload node'; row.roles = [...new Set(sky.nodes.map(n => n.role))].slice(0, 40); return row; }
    row.reload = {role: node.role, description: node.description, title: node.title, frame: node.frame, actions: node.actions, token: node.token};
    const screen = centre(node);
    const px = pixel(sky, screen);
    row.pixel = px;
    if (spec.between) {
      const wait = o.at + spec.between.at - Date.now(); if (wait > 0) await sleep(wait);
      if (spec.between.do === 'read') row.between = await tool(['read', String(pid)]).done;
      else {
        const o2 = await observe(w, pid, `${spec.label}-2`, spec.between.do === 'reobs');
        row.between = {ms: o2.ms, lineage: o2.sky.lineage ?? null};
        sky = o2.sky;
      }
    }
    const wait = o.at + spec.waitMs - Date.now(); if (wait > 0) await sleep(wait);
    const tap = spec.tap ? tool(['tap', String(pid), '4000'], 30_000, true) : null;
    if (tap) await Promise.race([tap.ready, sleep(2000)]);
    row.frontBefore = frontmost();
    const before = latestTick(Date.now());
    row.pageBefore = before ? {hasFocus: before.hasFocus, vis: before.vis, counts: before.counts} : null;
    row.idleTicks = tickGaps(o.at, Date.now());
    const loadsBefore = loads;
    const state = spec.state ? tool(['state', String(pid), String(userPid ?? 0), '2500', '10']) : null;
    const started = Date.now();
    row.clickAfterObservationMs = started - o.at;
    row.clickAfterTextEditFrontMs = started - row.textEditFrontAt;
    if (spec.route === 'hid') {
      row.click = {hid: await tool(['hidclick', String(screen.x), String(screen.y)]).done};
    } else {
      const args = spec.route === 'element' ? {pid, element: (findReload(sky) ?? node).token} : {pid, x: px.x, y: px.y};
      if (spec.route === 'plain') args.spikeRoute = "2'";
      const r = lean(await w.execute('click', args, spec.route === 'element' ? {lineage: sky.lineage} : {}));
      row.click = r.error ? {error: r.error} : {meta: r.result?.meta ?? r.result};
    }
    row.clickMs = Date.now() - started;
    await sleep(3000);
    row.loadsDelta = loads - loadsBefore;
    row.frontAfter = frontmost();
    row.pageEvents = pageEvents(started - 50, Date.now());
    const after = latestTick(Date.now());
    row.pageAfter = after ? {hasFocus: after.hasFocus, vis: after.vis, counts: after.counts, ev: after.ev} : null;
    if (state) row.state = await state.done;
    if (tap) row.tap = await tap.done;
    if (row.tap?.events) {
      // The tap's events from 200 ms before the click call, mouse and AppKit-defined only, for the summary.
      row.tapClickT = started - row.tap.clocks.wall;
    }
    try { await w.call('shutdown', {}, 5000); } catch {}
    w.close();
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 3000);
  } finally {
    if (engine) { row.engineStderr = engine.stderr().slice(-1500); if (engine.child.exitCode === null) engine.child.kill('SIGKILL'); }
    if (target) await target.stop();
    await sleep(1000);
  }
  return row;
}

function tapLine(r) {
  if (!r.tap) return '';
  if (r.tap.error || !r.tap.events) return ` tap ${JSON.stringify(r.tap).slice(0, 300)}`;
  const ev = r.tap.events.filter(e => [1, 2, 13].includes(e.type) || e.disabled)
    .map(e => e.type === 13 ? `ak${e.subtype}@${Math.round(e.t - r.tapClickT)}w${e.windowNumber}` : `${e.type === 1 ? 'down' : e.type === 2 ? 'up' : 'disabled'}@${Math.round(e.t - r.tapClickT)}(${e.x},${e.y})cs${e.f1}w${e.f91}/${e.f92}src${e.f41}`);
  return ` tap[${r.tap.mode}] ${ev.join(' ')}`;
}
function summary(r) {
  if (r.exception || r.problem) return `PROBLEM ${JSON.stringify(r.problem ?? '')} ${r.exception ?? ''}`;
  const m = r.click?.meta ?? r.click?.error?.meta;
  const meta = m ? JSON.stringify({route: m.inputRoute, join: m.activationJoin, kind: m.activationClickKind, ac: m.activationClick, el: m.elementClick?.reason ?? m.elementClick?.route, restores: m.delivery?.restores, capped: m.delivery?.capped}) : '';
  const err = r.click?.error ? `ERROR ${r.click.error.name ?? ''} ${String(r.click.error.message ?? '').slice(0, 120)}` : '';
  const states = r.state?.changes ? ` state ${JSON.stringify(r.state.changes.map(c => [c.t, c.front, c.key, c.main, c.winMain, c.winFocused, c.userFront]))}` : '';
  return `click@${r.clickAfterObservationMs}ms(teFront+${r.clickAfterTextEditFrontMs}) ${r.clickMs}ms ${err}${meta} LOADS+${r.loadsDelta} page ${JSON.stringify(r.pageEvents)} before ${JSON.stringify(r.pageBefore && {hasFocus: r.pageBefore.hasFocus, vis: r.pageBefore.vis})} idle ${JSON.stringify(r.idleTicks)} front ${r.frontBefore}->${r.frontAfter}${states}${tapLine(r)}`;
}

const config = {
  imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, runnerName: process.env.RUNNER_NAME ?? null,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), chrome: sh(CFT, ['--version']).out, uptime: sh('uptime', []).out,
  engineCommit: process.env.P294_ENGINE_COMMIT ?? null, probeCommit: process.env.GITHUB_SHA ?? null, rep: process.env.P294_REP ?? null,
};
log('config', JSON.stringify(config));
const rows = [];
for (const spec of RUN) {
  const row = await cell(spec);
  rows.push(row);
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, cells: rows}, null, 1));
  log(`${row.label}: textEdit=${row.textEdit?.front}\n    ${summary(row)}`);
}
server.close();
process.exit(0);
