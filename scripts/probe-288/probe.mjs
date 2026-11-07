// #288's hosted probe: how soon a background Chrome for Testing reaches Chromium's complete accessibility mode (a page
// checkbox advertising AXPress; a text field's AXBoundsForRange boxes non-empty), by trigger, behind a frontmost TextEdit,
// with no activation, no raise and nothing posted. scripts/probe-288/ax.swift does the AX side as a child of the job
// shell, which holds the runner image's Accessibility grant.
//
// Cells (CELLS below), each on a fresh Chrome (its own user-data directory) that nothing has touched through AX before:
//   t/<trigger>        `ax trigger`: the trigger's steps at t0 (and later where named), then the sampler for up to 6 s
//   g/<trigger>        `ax geom`: the window's scripted AX move and resize before and after the trigger (side effects)
//   tb/locate          the Reload button's and the checkbox's frames (fixed by the window's position: reused below)
//   tb/fresh-<n>       `ax toolbar` on a process nothing has observed: what a click-time step establishes, and how fast
//   scope/two          two Chromes: the trigger on one, the sampler on the other (is the mode per process?)
//   e/<pre>+obs+click  main's engine, shared mode: the trigger at first contact (none: no contact before), a wait, then
//                      get_app_state and at once a coordinate click on the checkbox; the click's duration and its effect
// The page beacons its pointer, mouse, key and click counts, so a cell shows that nothing was posted.
//
//   node scripts/probe-288/probe.mjs --engine <cua-engine> --ax <ax> --out <dir> [--cells <prefix,…>]
//
// Runs only on a GitHub-hosted runner: it launches and kills its own Chrome and TextEdit and moves TextEdit's window.
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-288: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), ENGINE = arg('engine'), AX = arg('ax');
const ONLY = arg('cells') ? arg('cells').split(',').filter(Boolean) : null;
if (!OUT || !ENGINE || !AX) { console.error('usage: probe.mjs --engine <bin> --ax <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
import {CHROME, BROWSER, launchOther, browserVersion, placePid} from '../probe-287/browser.mjs';
const CFT = CHROME;  // #287: P287_CHROME names the Chrome under test (Chrome for Testing by default)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-288:', ...a);

const TEXT = 'alpha bravo charlie delta';
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe288 page</title>
<style>body{margin:8px;font:14px sans-serif}#option{width:24px;height:24px;margin:0 6px 0 0;vertical-align:middle}#field{font:16px/20px Menlo,monospace;padding:4px 6px;border:1px solid #888;width:460px;height:20px;display:block;margin:12px 0}</style></head>
<body><p><b>probe288 page</b></p><p><label><input id="option" type="checkbox">Probe option</label> <button id="apply" type="button">Apply</button></p>
<input id="field" type="text" aria-label="Probe input" spellcheck="false" autocomplete="off" value="${TEXT}"><p id="status">Ready</p>
<script>(() => { const who = new URLSearchParams(location.search).get('who') || 'a';
const c = {pointerdown: 0, pointerup: 0, mousedown: 0, mouseup: 0, click: 0, pointermove: 0, mousemove: 0, keydown: 0, optionChange: 0, applyClick: 0, fieldFocus: 0};
const option = document.getElementById('option'), field = document.getElementById('field');
for (const k of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'pointermove', 'mousemove', 'keydown']) document.addEventListener(k, () => { c[k] += 1; }, true);
option.addEventListener('change', () => { c.optionChange += 1; send('change'); });
document.getElementById('apply').addEventListener('click', () => { c.applyClick += 1; });
field.addEventListener('focus', () => { c.fieldFocus += 1; });
const rect = el => { const r = el.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; };
const layout = () => { const ctx = document.createElement('canvas').getContext('2d'); ctx.font = '16px Menlo, monospace';
  const cw = ctx.measureText('MMMMMMMMMM').width / 10, f = rect(field), cs = getComputedStyle(field);
  const l = f.x + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
  return {screenX, screenY, outerW: outerWidth, outerH: outerHeight, innerW: innerWidth, innerH: innerHeight, dpr: devicePixelRatio,
    option: rect(option), field: f, k: 7, kPoint: {x: l + 7.5 * cw, y: f.y + f.h / 2}}; };
const send = ev => navigator.sendBeacon('/b', JSON.stringify({who, ev, t: Date.now(), counts: {...c}, checked: option.checked, hasFocus: document.hasFocus(), layout: layout()}));
addEventListener('load', () => { document.fonts.ready.then(() => send('load')); setInterval(() => send('tick'), 250); }); })();</script></body></html>`;

const beacons = {a: [], b: []};
let loads = 0;
const server = createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) { loads += 1; res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(PAGE); return; }
  let body = '';
  req.on('data', d => { body += d; if (body.length > 65536) req.destroy(); });
  req.on('end', () => {
    try { const b = JSON.parse(body); (beacons[b.who] ??= []).push({arrive: Date.now(), ...b}); } catch {}
    res.writeHead(204); res.end();
  });
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
  execute(method, args) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 80_000}); }
  close() { this.s.destroy(); }
}

const sh = (cmd, args) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout: 20_000}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const ax = (args, timeout = 60_000) => new Promise(resolve => {
  const child = spawn(AX, args, {stdio: ['ignore', 'pipe', 'pipe']});
  let out = '', err = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
  const t = setTimeout(() => child.kill('SIGKILL'), timeout);
  child.on('close', code => { clearTimeout(t); try { resolve(JSON.parse(out)); } catch { resolve({status: code, out: out.slice(0, 2000), err: err.slice(0, 2000)}); } });
});
const frontmost = () => {
  const asn = sh('lsappinfo', ['front']).out;
  const info = sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out;
  return (info.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] || info || null;
};
const osa = script => sh('osascript', ['-e', script]);
const lean = response => JSON.parse(JSON.stringify(response, (k, v) => (k === 'nodes' || k === 'menuBar' ? `[${Array.isArray(v) ? v.length : '?'} omitted]` : v)));
const latest = who => beacons[who][beacons[who].length - 1] ?? null;
const COUNT_KEYS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'pointermove', 'mousemove', 'keydown', 'optionChange', 'applyClick', 'fieldFocus'];
const delta = (a, b) => Object.fromEntries(COUNT_KEYS.map(k => [k, (b?.counts?.[k] ?? 0) - (a?.counts?.[k] ?? 0)]).filter(([, v]) => v));
const fileName = label => label.replace(/[^a-z0-9-]+/gi, '_');
const TEXT_DOC = join(OUT, 'front.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window.\n');

async function launchChrome(label, who = 'a', pos = '400,30', winSize = '620,720') {
  beacons[who] = [];
  const child = spawn(CFT, [`--user-data-dir=${join(OUT, `chrome-${fileName(label)}-${who}`)}`, '--no-first-run', '--no-default-browser-check',
    '--disable-search-engine-choice-screen', `--window-position=${pos}`, `--window-size=${winSize}`, `${URL_}?who=${who}`], {stdio: 'ignore'});
  for (let i = 0; i < 120 && !beacons[who].some(b => b.ev === 'load'); i++) await sleep(250);
  if (!beacons[who].some(b => b.ev === 'load')) throw new Error('Chrome did not load the page in 30 s');
  await sleep(1500);
  return child;
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
// The page's screen points from its own layout (macOS windows have no side frame: the content's origin is the window's
// left edge, and its top is the window's bottom less the content's height).
function points(who) {
  const L = latest(who).layout;
  const ox = L.screenX, oy = L.screenY + L.outerH - L.innerH;
  return {origin: {x: ox, y: oy}, cb: {x: ox + L.option.x + L.option.w / 2, y: oy + L.option.y + L.option.h / 2},
          tf: {x: ox + L.kPoint.x, y: oy + L.kPoint.y, k: L.k}, layout: L};
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
async function stop(chrome) {
  if (chrome && chrome.exitCode === null) { chrome.kill('SIGTERM'); await sleep(2000); if (chrome.exitCode === null) chrome.kill('SIGKILL'); }
}

const step = (d, at = 0) => ({do: d, at});
const TRIGGERS = {
  none: [],
  role: [step('role')],
  manual: [step('role'), step('manual')],
  'manual-twice': [step('role'), step('manual'), step('manual', 1000)],
  'manual-norole': [step('manual')],
  eui: [step('role'), step('eui')],
  'eui-norole': [step('eui')],
  'eui-twice': [step('role'), step('eui'), step('eui', 1000)],
  'eui-then-false': [step('role'), step('eui'), step('eui-false', 4000)],
  'manual+eui': [step('role'), step('manual'), step('eui')],
  observer: [step('role'), step('observer')],
  sr: [step('role'), step('sr', 300), step('sr', 1000), step('sr', 2000)],
  deep: [step('role'), step('deep', 300)],
  'deep-repeat': [step('role')],
  'all-but-eui': [step('role'), step('manual'), step('observer'), step('sr', 300), step('deep', 600)],
};
const CELLS = [
  {label: 'tb/locate', kind: 'locate'},
  {label: 'tb/fresh-1', kind: 'toolbar'},
  {label: 'tb/fresh-2', kind: 'toolbar'},
  ...Object.keys(TRIGGERS).map(t => ({label: `t/${t}`, kind: 'trigger', trigger: t})),
  {label: 'g/eui', kind: 'geom', phases: [{label: 'baseline', before: [], waitMs: 0}, {label: 'role', before: ['role'], waitMs: 1500},
    {label: 'eui-on', before: ['eui'], waitMs: 3000}, {label: 'eui-on-again', before: [], waitMs: 500}, {label: 'eui-off', before: ['eui-false'], waitMs: 1000}]},
  {label: 'g/manual', kind: 'geom', phases: [{label: 'baseline', before: [], waitMs: 0}, {label: 'role+manual', before: ['role', 'manual'], waitMs: 3000},
    {label: 'again', before: [], waitMs: 500}]},
  {label: 'scope/two', kind: 'scope'},
  {label: 'e/none+obs+click', kind: 'engine', pre: null, waitMs: 0},
  {label: 'e/manual+1500+obs+click', kind: 'engine', pre: 'manual', waitMs: 1500},
  {label: 'e/manual+3000+obs+click', kind: 'engine', pre: 'manual', waitMs: 3000},
  {label: 'e/eui+3000+obs+click', kind: 'engine', pre: 'eui', waitMs: 3000},
  // Round 2: the page and toolbar hits every 5 ms after the role read in a process nothing observed; the engine's own
  // enablement state left after its connection ends; the first click after AXEnhancedUserInterface at contact, by wait.
  {label: 'tb/timeline-1', kind: 'tbtimeline'},
  {label: 'tb/timeline-2', kind: 'tbtimeline'},
  {label: 'r2/lasting', kind: 'lasting'},
  {label: 'r2/e/none+obs+click', kind: 'engine', pre: null, waitMs: 0},
  {label: 'r2/e/eui+0+obs+click', kind: 'engine', pre: 'eui', waitMs: 0},
  {label: 'r2/e/eui+1000+obs+click', kind: 'engine', pre: 'eui', waitMs: 1000},
  {label: 'r2/e/eui+2000+obs+click', kind: 'engine', pre: 'eui', waitMs: 2000},
].filter(c => !ONLY || ONLY.some(p => c.label.startsWith(p)));

let toolbarPoint = null;
async function cell(spec) {
  const row = {label: spec.label};
  let chrome, chromeB, engine;
  try {
    chrome = await launchChrome(spec.label);
    row.chromePid = chrome.pid;
    if (spec.kind === 'scope') chromeB = await launchChrome(spec.label, 'b', '0,350', '620,400');
    row.textEdit = await frontTextEdit();
    const P = points('a');
    row.points = {origin: P.origin, cb: P.cb, tf: P.tf};
    const before = latest('a');
    row.frontBefore = frontmost();
    if (spec.kind === 'locate') {
      row.locate = await ax(['locate', String(chrome.pid)]);
      const r = row.locate.reload;
      if (r) toolbarPoint = {x: r.x + r.w / 2, y: r.y + r.h / 2};
      row.toolbarPoint = toolbarPoint;
    } else if (spec.kind === 'toolbar') {
      if (!toolbarPoint) { row.problem = 'no toolbar point (tb/locate did not find Reload)'; return row; }
      row.toolbar = await ax(['toolbar', String(chrome.pid), JSON.stringify({reload: toolbarPoint, page: P.cb})]);
    } else if (spec.kind === 'tbtimeline') {
      if (!toolbarPoint) { row.problem = 'no toolbar point (tb/locate did not find Reload)'; return row; }
      row.timeline = await ax(['tbtimeline', String(chrome.pid), JSON.stringify({reload: toolbarPoint, page: P.cb})]);
    } else if (spec.kind === 'lasting') {
      // The engine's first observation of a fresh Chrome, then its connection closed and the engine shut down (its
      // releases run): the attribute's value and complete mode after each.
      engine = await startEngine(spec.label);
      const w = engine.wire;
      await w.call('ping', {clientApiVersion: 'cua-engine-1'});
      const state = await w.execute('get_app_state', {pid: chrome.pid});
      const sky = state.result ?? {};
      row.observation = {enablementPrior: sky.timings?.enablementPrior ?? null, enablementWrite: sky.timings?.enablementWrite ?? null,
        enablementWriteError: sky.timings?.enablementWriteError ?? null, enabled: sky.timings?.enabled ?? null, error: state.error ?? null};
      row.timingKeys = Object.keys(sky.timings ?? {});
      row.afterObservation = await ax(['trigger', String(chrome.pid), JSON.stringify({steps: [], pollMs: 3000, sampleMs: 20, cb: P.cb, tf: P.tf})]);
      w.close();
      await sleep(500);
      row.afterClose = await ax(['trigger', String(chrome.pid), JSON.stringify({steps: [], pollMs: 300, sampleMs: 20, cb: P.cb, tf: P.tf})]);
      engine.child.kill('SIGTERM');
      await sleep(1500);
      row.engineExit = engine.child.exitCode ?? engine.child.signalCode;
      row.afterEngineExit = await ax(['trigger', String(chrome.pid), JSON.stringify({steps: [], pollMs: 300, sampleMs: 20, cb: P.cb, tf: P.tf})]);
      await sleep(3000);
      row.later = await ax(['trigger', String(chrome.pid), JSON.stringify({steps: [], pollMs: 300, sampleMs: 20, cb: P.cb, tf: P.tf})]);
    } else if (spec.kind === 'trigger') {
      const t = spec.trigger;
      row.trigger = t;
      row.result = await ax(['trigger', String(chrome.pid), JSON.stringify({steps: TRIGGERS[t], pollMs: 6000, sampleMs: 20, cb: P.cb, tf: P.tf,
        ...(t === 'deep-repeat' ? {deepEveryMs: 150} : {}), ...(t === 'eui-then-false' ? {minPollMs: 6000} : {})})]);
    } else if (spec.kind === 'geom') {
      row.geom = await ax(['geom', String(chrome.pid), JSON.stringify({phases: spec.phases})]);
      // Whether complete mode holds at the end (eui-off: does it go away?).
      row.after = await ax(['trigger', String(chrome.pid), JSON.stringify({steps: [], pollMs: 300, sampleMs: 20, cb: points('a').cb, tf: points('a').tf})]);
    } else if (spec.kind === 'scope') {
      const PB = points('b');
      row.pointsB = {cb: PB.cb, tf: PB.tf};
      row.chromeBPid = chromeB.pid;
      row.a = await ax(['trigger', String(chrome.pid), JSON.stringify({steps: TRIGGERS.manual, pollMs: 4500, sampleMs: 20, cb: P.cb, tf: P.tf})]);
      row.aEui = await ax(['trigger', String(chrome.pid), JSON.stringify({steps: [step('eui')], pollMs: 3500, sampleMs: 20, cb: P.cb, tf: P.tf, minPollMs: 3500})]);
      // B: the same role read only (its tree exposed), then the sampler: complete mode in A must not show in B.
      row.b = await ax(['trigger', String(chromeB.pid), JSON.stringify({steps: [step('role')], pollMs: 3000, sampleMs: 20, cb: PB.cb, tf: PB.tf, minPollMs: 3000})]);
    } else if (spec.kind === 'engine') {
      if (spec.pre) row.pre = await ax(['trigger', String(chrome.pid), JSON.stringify({steps: TRIGGERS[spec.pre], pollMs: 0, sampleMs: 20, cb: P.cb, tf: P.tf})]);
      const contact = row.pre?.t0 ?? null;
      engine = await startEngine(spec.label);
      const w = engine.wire;
      row.ping = (await w.call('ping', {clientApiVersion: 'cua-engine-1'})).result ?? null;
      if (contact) { const wait = contact + spec.waitMs - Date.now(); if (wait > 0) await sleep(wait); }
      const shots = join(OUT, `shots-${fileName(spec.label)}`);
      mkdirSync(shots, {recursive: true});
      const obsFrom = Date.now();
      const state = await w.execute('get_app_state', {pid: chrome.pid, includeScreenshot: true, outputDirectory: shots});
      const obsAt = Date.now();
      row.observationMs = obsAt - obsFrom;
      if (state.error) { row.problem = {getAppState: state.error}; return row; }
      const sky = state.result;
      row.observation = {enablementPrior: sky.timings?.enablementPrior ?? null, enablementWrite: sky.timings?.enablementWrite ?? null,
        enablementWriteError: sky.timings?.enablementWriteError ?? null, webAreaFound: sky.timings?.webAreaFound ?? null};
      const node = sky.nodes.find(n => n.role === 'AXCheckBox');
      if (!node?.frame) { row.problem = 'no checkbox node'; return row; }
      row.checkboxActionsAtObservation = node.actions;
      const wf = sky.window.frame, nf = node.frame, scale = sky.screenshot.width / wf.width;
      const x = Math.round((nf.x + nf.width / 2 - wf.x) * scale), y = Math.round((nf.y + nf.height / 2 - wf.y) * scale);
      const beforeClick = latest('a');
      const started = Date.now();
      row.click = lean(await w.execute('click', {pid: chrome.pid, x, y}));
      row.clickMs = Date.now() - started;
      row.clickAfterContactMs = contact ? started - contact : null;
      row.clickAfterObservationMs = started - obsAt;
      await sleep(1500);
      row.clickDelta = delta(beforeClick, latest('a'));
      row.checked = latest('a')?.checked;
      try { await w.call('shutdown', {}, 5000); } catch {}
      w.close();
    }
    await sleep(300);
    row.frontAfter = frontmost();
    row.pageDelta = delta(before, latest('a'));
    row.reloads = loads;
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 3000);
  } finally {
    if (engine) { row.engineStderr = engine.stderr().slice(-2000); if (engine.child.exitCode === null) engine.child.kill('SIGKILL'); }
    await stop(chrome); await stop(chromeB);
    await sleep(1000);
  }
  return row;
}

const firsts = r => r ? `basic@${r.firstCheckboxHit} press@${r.firstPress} boxes@${r.firstBoxes} steps=${JSON.stringify((r.steps ?? []).map(s => [s.do, s.at, s.durMs, typeof s.result === 'object' ? '…' : s.result]))} eui ${JSON.stringify(r.before?.eui)}->${JSON.stringify(r.after?.eui)} manual ${JSON.stringify(r.before?.manual)}->${JSON.stringify(r.after?.manual)} listsManual=${r.before?.listsManual} n=${r.samples} cost=${JSON.stringify(r.sampleCostMs)}` : 'none';
function summary(row) {
  if (row.exception || row.problem) return `PROBLEM ${JSON.stringify(row.problem ?? '')} ${row.exception ?? ''}`;
  const tail = `front ${row.frontBefore}->${row.frontAfter} page ${JSON.stringify(row.pageDelta)}`;
  if (row.locate) return `${JSON.stringify(row.locate)} ${tail}`;
  if (row.toolbar) return `${JSON.stringify(row.toolbar)} ${tail}`;
  if (row.timeline) return `${JSON.stringify(row.timeline)} ${tail}`;
  if (row.afterObservation) return `obs ${JSON.stringify(row.observation)} keys ${JSON.stringify(row.timingKeys)} | afterObs eui ${JSON.stringify(row.afterObservation.before?.eui)} press@${row.afterObservation.firstPress} | afterClose eui ${JSON.stringify(row.afterClose?.before?.eui)} press@${row.afterClose?.firstPress} | afterExit(${row.engineExit}) eui ${JSON.stringify(row.afterEngineExit?.before?.eui)} press@${row.afterEngineExit?.firstPress} | later eui ${JSON.stringify(row.later?.before?.eui)} press@${row.later?.firstPress} ${tail}`;
  if (row.result) return `${firsts(row.result)} changes=${JSON.stringify(row.result.changes?.slice(0, 8))} ${tail}`;
  if (row.geom) return `${JSON.stringify(row.geom.phases.map(p => ({label: p.label, app: p.app && {eui: p.app.eui, manual: p.app.manual}, ...Object.fromEntries(['move', 'resize', 'moveBack', 'resizeBack'].map(k => [k, p[k] && [p[k].error, p[k].writeMs, p[k].settledMs, p[k].distinctFrames]]))})))} after: ${firsts(row.after)} ${tail}`;
  if (row.a) return `A ${firsts(row.a)} | A+eui ${firsts(row.aEui)} | B ${firsts(row.b)} ${tail}`;
  return `pre ${firsts(row.pre)} obs ${row.observationMs}ms ${JSON.stringify(row.observation)} cbActions=${JSON.stringify(row.checkboxActionsAtObservation)} click ${row.clickMs}ms (after contact ${row.clickAfterContactMs}, after obs ${row.clickAfterObservationMs}) ${row.click?.error ? 'error ' + JSON.stringify(row.click.error).slice(0, 300) : 'ok ' + JSON.stringify(row.click?.result?.meta ?? {}).slice(0, 600)} delta ${JSON.stringify(row.clickDelta)} checked=${row.checked} ${tail}`;
}

const config = {
  imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, runnerName: process.env.RUNNER_NAME ?? null,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), chrome: sh(CFT, ['--version']).out, browser: BROWSER, browserVersion: browserVersion(), firefoxA11y: process.env.P287_FIREFOX_A11Y ?? null, heads: process.env.P287_HEADS ?? null,
  engineCommit: process.env.P288_ENGINE_COMMIT ?? null, probeCommit: process.env.GITHUB_SHA ?? null, rep: process.env.P288_REP ?? null,
  voiceOver: sh('defaults', ['read', 'com.apple.universalaccess', 'voiceOverOnOffKey']).out,
};
log('config', JSON.stringify(config));
const rows = [];
for (const spec of CELLS) {
  const row = await cell(spec);
  rows.push(row);
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, cells: rows}, null, 1));
  log(`${row.label}: textEdit=${row.textEdit?.front}\n    ${summary(row)}`);
}
server.close();
process.exit(0);
