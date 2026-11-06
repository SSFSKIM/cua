// #292/#288's live check on a GitHub-hosted macOS runner: fix/288-fresh-chrome's engine against origin/main's
// (d2568c76), each a child of the job shell (Accessibility, PostEvent and Screen Recording grants), on a fresh Chrome
// for Testing behind a frontmost TextEdit. scripts/probe-288/ax.swift samples from outside: `watch` (the application's
// AXEnhancedUserInterface, the checkbox's AXPress, the field's character box) and `geom` (a scripted AX move and resize
// of Chrome's window, its CG frames counted).
//   c1/<engine>/end_task          observe, 2.6 s, then the client's end_task path (endTask written, then the close);
//                                 1.5 s of samples; the window's move and resize, before the observation and after
//   c2/<engine>/grace             observe, the connection kept open and idle, samples for 34 s
//   c2/branch/grace-reobs         the same with a re-observation at 20 s, samples for 56 s
//   c3/<engine>/sigterm           observe, 2.6 s, the engine's SIGTERM, 1.5 s of samples
//   c4/<engine>/after-grace-click observe (screenshot), 33 s idle, a coordinate click on the checkbox, no re-observation
//   c5/<engine>/first-<checkbox|textarea>   observe (screenshot), at once a coordinate click
//   c6/<engine>/noobs-reload      no observation on the connection: a coordinate click at Reload's point
//   c6/<engine>/released-<reload|text>      observe (screenshot), 33 s idle (the branch's grace clears the page tree's
//                                 seen state), a coordinate click on Reload, or on the page's plain text
//
//   node scripts/probe-288/live.mjs --main <cua-engine> --branch <cua-engine> --ax <ax> --out <dir> [--cells <prefix,…>]
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-288 live: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), ENGINES = {main: arg('main'), branch: arg('branch')}, AX = arg('ax');
const ONLY = arg('cells') ? arg('cells').split(',').filter(Boolean) : null;
if (!OUT || !ENGINES.main || !ENGINES.branch || !AX) { console.error('usage: live.mjs --main <bin> --branch <bin> --ax <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-288 live:', ...a);

const TEXT = 'alpha bravo charlie delta';
const NOTES = 'first line of the notes\nsecond line holds more';
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe288 live page</title>
<style>body{margin:8px;font:14px sans-serif}#option{width:24px;height:24px;margin:0 6px 0 0;vertical-align:middle}.f{font:16px/20px Menlo,monospace;padding:4px 6px;border:1px solid #888;width:460px;display:block;margin:12px 0}#field{height:20px}#notes{height:44px;resize:none;white-space:pre;overflow:hidden}#status{font-size:20px}</style></head>
<body><p><b>probe288 live page</b></p><p><label><input id="option" type="checkbox">Probe option</label> <button id="apply" type="button">Apply</button></p>
<input id="field" class="f" type="text" aria-label="Probe input" spellcheck="false" autocomplete="off" value="${TEXT}">
<textarea id="notes" class="f" aria-label="Probe notes" spellcheck="false" wrap="off">${NOTES}</textarea><p id="status">Plain status text here</p>
<script>(() => {
const c = {pointerdown: 0, pointerup: 0, mousedown: 0, mouseup: 0, click: 0, pointermove: 0, mousemove: 0, keydown: 0, optionChange: 0, applyClick: 0, fieldFocus: 0, notesFocus: 0};
const option = document.getElementById('option'), field = document.getElementById('field'), notes = document.getElementById('notes');
for (const k of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'pointermove', 'mousemove', 'keydown']) document.addEventListener(k, e => { c[k] += 1; if (!k.endsWith('move')) send(k, {trusted: e.isTrusted, target: e.target.id || e.target.tagName}); }, true);
option.addEventListener('change', () => { c.optionChange += 1; send('change'); });
document.getElementById('apply').addEventListener('click', () => { c.applyClick += 1; });
field.addEventListener('focus', () => { c.fieldFocus += 1; });
notes.addEventListener('focus', () => { c.notesFocus += 1; });
const rect = el => { const r = el.getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; };
const layout = () => { const ctx = document.createElement('canvas').getContext('2d'); ctx.font = '16px Menlo, monospace';
  const cw = ctx.measureText('MMMMMMMMMM').width / 10, f = rect(field), n = rect(notes), cs = getComputedStyle(field);
  const pad = parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
  return {screenX, screenY, outerW: outerWidth, outerH: outerHeight, innerW: innerWidth, innerH: innerHeight,
    option: rect(option), field: f, k: 7, kPoint: {x: f.x + pad + 7.5 * cw, y: f.y + f.h / 2}, notes: n,
    notesK: 30, notesPoint: {x: n.x + pad + 6.3 * cw, y: n.y + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop) + 1.5 * 20}, status: rect(document.getElementById('status'))}; };
let seq = 0;
const send = (ev, extra) => navigator.sendBeacon('/b', JSON.stringify({ev, seq: ++seq, t: Date.now(), ...extra, counts: {...c}, checked: option.checked, hasFocus: document.hasFocus(),
  active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null, notesSel: [notes.selectionStart, notes.selectionEnd], layout: layout()}));
addEventListener('load', () => { document.fonts.ready.then(() => send('load')); setInterval(() => send('tick'), 250); }); })();</script></body></html>`;

let beacons = [], loads = 0;
const server = createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) { loads += 1; res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(PAGE); return; }
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
  frame(method, params) {
    const id = this.id++;
    const bytes = Buffer.from(JSON.stringify({jsonrpc: '2.0', id, method, params}), 'utf8');
    const head = Buffer.alloc(4); head.writeUInt32LE(bytes.length, 0);
    return {id, data: Buffer.concat([head, bytes])};
  }
  call(method, params = {}, timeout = 90_000) {
    const {id, data} = this.frame(method, params);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: no answer in ${timeout} ms`)); }, timeout);
      this.pending.set(id, m => { clearTimeout(t); resolve(m); });
      this.s.write(data);
    });
  }
  // The client's end_task (client.mjs `release`, 63926945): endTask, its answer waited for up to 1 s, then the close.
  async endTaskThenClose() {
    const started = Date.now();
    let answer;
    try { answer = await this.call('endTask', {}, 1000); } catch (e) { answer = {wait: String(e.message ?? e)}; }
    this.s.end();
    return {answer, ms: Date.now() - started};
  }
  execute(method, args) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 80_000}); }
  close() { this.s.destroy(); }
}

const sh = (cmd, args) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout: 20_000}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const ax = (args, timeout = 90_000) => new Promise(resolve => {
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
const latest = () => beacons[beacons.length - 1] ?? null;
const COUNT_KEYS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'pointermove', 'mousemove', 'keydown', 'optionChange', 'applyClick', 'fieldFocus', 'notesFocus'];
const delta = (a, b) => Object.fromEntries(COUNT_KEYS.map(k => [k, (b?.counts?.[k] ?? 0) - (a?.counts?.[k] ?? 0)]).filter(([, v]) => v));
const fileName = label => label.replace(/[^a-z0-9-]+/gi, '_');
const TEXT_DOC = join(OUT, 'front.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window.\n');

async function launchChrome(label) {
  beacons = [];
  const child = spawn(CFT, [`--user-data-dir=${join(OUT, `chrome-${fileName(label)}`)}`, '--no-first-run', '--no-default-browser-check',
    '--disable-search-engine-choice-screen', '--window-position=400,30', '--window-size=620,720', URL_], {stdio: 'ignore'});
  for (let i = 0; i < 120 && !beacons.some(b => b.ev === 'load'); i++) await sleep(250);
  if (!beacons.some(b => b.ev === 'load')) throw new Error('Chrome did not load the page in 30 s');
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
function points() {
  const L = latest().layout, ox = L.screenX, oy = L.screenY + L.outerH - L.innerH;
  return {cb: {x: ox + L.option.x + L.option.w / 2, y: oy + L.option.y + L.option.h / 2}, tf: {x: ox + L.kPoint.x, y: oy + L.kPoint.y, k: L.k},
          notes: {x: ox + L.notesPoint.x, y: oy + L.notesPoint.y, k: L.notesK}, status: {x: ox + L.status.x + 40, y: oy + L.status.y + L.status.h / 2}};
}
async function startEngine(which, label) {
  const dir = join(OUT, 'sock');
  mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, `${fileName(label)}.sock`);
  const child = spawn(ENGINES[which], [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'pipe', 'pipe']});
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
const watch = (pid, P, pollMs, sampleMs = 20) => ax(['watch', String(pid), JSON.stringify({pollMs, sampleMs, cb: P.cb, tf: P.tf})], pollMs + 30_000);
const geom = (pid, label) => ax(['geom', String(pid), JSON.stringify({phases: [{label, before: [], waitMs: 0}]})]);
const geomLine = g => { const p = g?.phases?.[0]; return p ? ['move', 'resize', 'moveBack', 'resizeBack'].map(k => p[k] ? `${p[k].distinctFrames}f/${p[k].settledMs}ms` : '-').join(' ') : String(JSON.stringify(g) ?? '-').slice(0, 200); };
// When a watch's samples first showed a state, relative to `from` (epoch ms).
const firstAt = (w, pred, from) => { const c = w?.changes?.find(pred); return c && w.t0 ? Math.round(w.t0 + c.t - from) : null; };

async function observe(w, pid, label, screenshot) {
  const args = {pid};
  if (screenshot) { const shots = join(OUT, `shots-${fileName(label)}`); mkdirSync(shots, {recursive: true}); Object.assign(args, {includeScreenshot: true, outputDirectory: shots}); }
  const from = Date.now();
  const state = await w.execute('get_app_state', args);
  const at = Date.now();
  if (state.error) throw new Error(`get_app_state: ${JSON.stringify(state.error).slice(0, 500)}`);
  const sky = state.result;
  return {sky, at, ms: at - from, timings: {enablementPrior: sky.timings?.enablementPrior ?? null, enablementWrite: sky.timings?.enablementWrite ?? null,
    enablementWriteError: sky.timings?.enablementWriteError ?? null, enabled: sky.timings?.enabled ?? null, webAreaFound: sky.timings?.webAreaFound ?? null}};
}
const pixel = (sky, p) => { const wf = sky.window.frame, s = sky.screenshot.width / wf.width; return {x: Math.round((p.x - wf.x) * s), y: Math.round((p.y - wf.y) * s), scale: s}; };
const centre = n => ({x: n.frame.x + n.frame.width / 2, y: n.frame.y + n.frame.height / 2});
async function clickAt(w, pid, px, row, settleMs = 1500) {
  const before = latest(), loadsBefore = loads;
  const started = Date.now();
  const r = lean(await w.execute('click', {pid, x: px.x, y: px.y}));
  row.clickMs = Date.now() - started;
  row.clickStartedAt = started;
  row.click = r.error ? {error: r.error} : {meta: r.result?.meta ?? r.result};
  await sleep(settleMs);
  const after = latest();
  row.clickDelta = delta(before, after);
  row.loadsDelta = loads - loadsBefore;
  row.afterClick = {checked: after?.checked, active: after?.active, notesSel: after?.notesSel, hasFocus: after?.hasFocus};
  row.pointerEvents = beacons.filter(b => b.t >= started - 5 && ['pointerdown', 'mousedown', 'mouseup', 'click'].includes(b.ev)).map(b => ({ev: b.ev, dt: b.t - started, trusted: b.trusted, target: b.target}));
}

const CELLS = [];
// Diagnostics for Reload not reloading after 33 s idle (run 42167787338, both engines): Reload 1 s after the
// observation, as #282's run (which reloaded once); and after 33 s idle with no sampler running.
for (const e of ['branch', 'main']) CELLS.push({label: `d/${e}/reload-1s`, e, kind: 'first', target: 'reload', waitMs: 1000});
for (const e of ['branch', 'main']) CELLS.push({label: `d/${e}/reload-33s-nowatch`, e, kind: 'afterGrace', target: 'reload', noWatch: true});
// Round 2 of the diagnostics (run 42169259575: reloaded at 1 s, not at 33 s, on both engines): the threshold on main,
// and at 33 s a second click 1 s after the first.
for (const s of [5, 10, 20]) CELLS.push({label: `d2/main/reload-${s}s`, e: 'main', kind: 'first', target: 'reload', waitMs: s * 1000});
for (const e of ['branch', 'main']) CELLS.push({label: `d2/${e}/reload-33s-twice`, e, kind: 'first', target: 'reload', waitMs: 33_000, twice: true});
for (const e of ['branch', 'main']) CELLS.push({label: `c1/${e}/end_task`, e, kind: 'endTask'});
for (const e of ['branch', 'main']) CELLS.push({label: `c2/${e}/grace`, e, kind: 'grace'});
CELLS.push({label: 'c2/branch/grace-reobs', e: 'branch', kind: 'grace', reobs: true});
for (const e of ['branch', 'main']) CELLS.push({label: `c3/${e}/sigterm`, e, kind: 'sigterm'});
for (const e of ['branch', 'main']) CELLS.push({label: `c4/${e}/after-grace-click`, e, kind: 'afterGrace', target: 'checkbox'});
for (const e of ['branch', 'main']) for (const t of ['checkbox', 'textarea']) CELLS.push({label: `c5/${e}/first-${t}`, e, kind: 'first', target: t});
for (const e of ['branch', 'main']) CELLS.push({label: `c6/${e}/noobs-reload`, e, kind: 'noobs'});
for (const e of ['branch', 'main']) for (const t of ['reload', 'text']) CELLS.push({label: `c6/${e}/released-${t}`, e, kind: 'afterGrace', target: t});
const RUN = CELLS.filter(c => !ONLY || ONLY.some(p => c.label.startsWith(p)));

const findNode = (sky, target) => {
  if (target === 'checkbox') return sky.nodes.find(n => n.role === 'AXCheckBox');
  if (target === 'textarea') return sky.nodes.find(n => n.role === 'AXTextArea');
  if (target === 'reload') return sky.nodes.find(n => n.role === 'AXButton' && /reload/i.test(`${n.title ?? ''} ${n.description ?? ''} ${n.help ?? ''}`));
  return null;
};

async function cell(spec) {
  const row = {label: spec.label, engine: spec.e};
  let chrome, engine;
  try {
    chrome = await launchChrome(spec.label);
    const pid = chrome.pid;
    row.chromePid = pid;
    row.textEdit = await frontTextEdit();
    const P = points();
    row.points = P;
    const start = latest();
    row.frontBefore = frontmost();
    if (spec.kind === 'endTask') row.geomBefore = await geom(pid, 'beforeObservation');
    engine = await startEngine(spec.e, spec.label);
    const w = engine.wire;
    row.ping = (await w.call('ping', {clientApiVersion: 'cua-engine-1'})).result ?? null;
    if (spec.kind === 'noobs') {
      // No observation on this connection: Reload's point in a screenshot of the window at its fixed place (scale 1).
      const reload = {x: 442 + 17, y: 77 + 17};
      await clickAt(w, pid, {x: reload.x - 400, y: reload.y - 31}, row, 2500);
      row.watch = await watch(pid, P, 300);
    } else {
      const shot = ['afterGrace', 'first'].includes(spec.kind);
      const o = await observe(w, pid, spec.label, shot);
      row.observation = {ms: o.ms, ...o.timings};
      if (spec.kind === 'endTask' || spec.kind === 'sigterm') {
        const wait = o.at + 2600 - Date.now(); if (wait > 0) await sleep(wait);
        row.watchBefore = await watch(pid, P, 200);
        const at = Date.now();
        row.endedAt = at;
        // The sampler starts with the end, so the endTask round trip is inside its window.
        const watching = watch(pid, P, 1500);
        if (spec.kind === 'endTask') row.endTask = await w.endTaskThenClose(); else engine.child.kill('SIGTERM');
        row.watchAfter = await watching;
        row.releasedPressLostMs = firstAt(row.watchAfter, c => c.press === false, at);
        row.releasedEuiFalseMs = firstAt(row.watchAfter, c => c.eui === false, at);
        row.boxesLostMs = firstAt(row.watchAfter, c => c.box !== 'box', at);
        row.final = row.watchAfter?.changes?.at(-1) ?? null;
        if (spec.kind === 'endTask') row.geomAfter = await geom(pid, 'afterEnd');
        if (spec.kind === 'sigterm') { await sleep(300); row.engineExit = engine.child.exitCode ?? engine.child.signalCode; }
      } else if (spec.kind === 'grace') {
        const pollMs = spec.reobs ? 56_000 : 34_000;
        const watching = watch(pid, P, pollMs, 100);
        if (spec.reobs) {
          const wait = o.at + 20_000 - Date.now(); if (wait > 0) await sleep(wait);
          const o2 = await observe(w, pid, spec.label, false);
          row.reobservation = {at: o2.at - o.at, ms: o2.ms, ...o2.timings};
          row.reobsAt = o2.at;
        }
        row.watch = await watching;
        row.observedAt = o.at;
        row.pressFirstMs = firstAt(row.watch, c => c.press === true, o.at);
        // The release: the first sample without AXPress after one with it, from the observation's end (and from the
        // re-observation's end).
        const ch = row.watch?.changes ?? [];
        const onIdx = ch.findIndex(c => c.press === true);
        const off = onIdx >= 0 ? ch.slice(onIdx).find(c => c.press === false) : null;
        row.releasedMs = off ? Math.round(row.watch.t0 + off.t - o.at) : null;
        row.releasedAfterReobsMs = off && row.reobsAt ? Math.round(row.watch.t0 + off.t - row.reobsAt) : null;
        row.euiAtRelease = off?.eui ?? null;
        row.final = ch.at(-1) ?? null;
      } else if (spec.kind === 'afterGrace' || spec.kind === 'first') {
        const node = spec.target === 'text' ? null : findNode(o.sky, spec.target);
        let screen;
        if (spec.target === 'text') screen = P.status;
        else if (spec.target === 'textarea') screen = P.notes;
        else if (node?.frame) screen = centre(node);
        if (!screen) { row.problem = `no ${spec.target} node`; return row; }
        row.target = {node: node ? {role: node.role, title: node.title, description: node.description, actions: node.actions} : null, screen};
        const px = pixel(o.sky, screen);
        row.pixel = px;
        if (spec.kind === 'first' && spec.waitMs) { const wait = o.at + spec.waitMs - Date.now(); if (wait > 0) await sleep(wait); }
        if (spec.kind === 'afterGrace' && spec.noWatch) { const wait = o.at + 33_000 - Date.now(); if (wait > 0) await sleep(wait); }
        if (spec.kind === 'afterGrace' && !spec.noWatch) {
          const wait = o.at + 33_000 - Date.now();
          row.watchIdle = await watch(pid, P, Math.max(wait, 0), 250);
          row.releasedMs = firstAt(row.watchIdle, c => c.press === false && (row.watchIdle.changes.indexOf(c) > 0), o.at);
          row.stateBeforeClick = row.watchIdle?.changes?.at(-1) ?? null;
        }
        row.clickAfterObservationMs = Date.now() - o.at;
        await clickAt(w, pid, px, row, spec.target === 'reload' ? 3000 : 1500);
        if (spec.twice) { row.second = {}; await clickAt(w, pid, px, row.second, 3000); }
        row.watchAfterClick = await watch(pid, P, 300);
      }
    }
    if (spec.kind !== 'endTask' && spec.kind !== 'sigterm') { try { await w.call('shutdown', {}, 5000); } catch {} w.close(); }
    await sleep(300);
    row.frontAfter = frontmost();
    row.pageDelta = delta(start, latest());
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 3000);
  } finally {
    if (engine) { row.engineStderr = engine.stderr().slice(-2000); if (engine.child.exitCode === null) engine.child.kill('SIGKILL'); }
    await stop(chrome);
    await sleep(1000);
  }
  return row;
}

const changesLine = w => JSON.stringify((w?.changes ?? []).map(c => [c.t, c.eui, c.press, c.box]));
const clickLine = r => `click ${r.clickMs}ms ${r.click?.error ? 'ERROR ' + JSON.stringify(r.click.error).slice(0, 300) : JSON.stringify({inputRoute: r.click?.meta?.inputRoute, elementClick: r.click?.meta?.elementClick, pointerEstablish: r.click?.meta?.pointerEstablish}).slice(0, 700)} delta ${JSON.stringify(r.clickDelta)} loads+${r.loadsDelta} after ${JSON.stringify(r.afterClick)}`;
function summary(r) {
  if (r.exception || r.problem) return `PROBLEM ${JSON.stringify(r.problem ?? '')} ${r.exception ?? ''}`;
  const tail = `front ${r.frontBefore}->${r.frontAfter}`;
  const obs = r.observation ? `obs ${JSON.stringify(r.observation)}` : '';
  if (r.watchAfter) return `${obs} before ${changesLine(r.watchBefore)} after ${changesLine(r.watchAfter)} pressLost@${r.releasedPressLostMs} euiFalse@${r.releasedEuiFalseMs} exit=${r.engineExit ?? ''} geom before[${geomLine(r.geomBefore)}] after[${geomLine(r.geomAfter)}] ${tail}`;
  if (r.kind === 'grace' || r.observedAt) return `${obs} reobs ${JSON.stringify(r.reobservation ?? null)} press@${r.pressFirstMs} released@${r.releasedMs} (after reobs ${r.releasedAfterReobsMs}) eui@release ${r.euiAtRelease} changes ${changesLine(r.watch)} ${tail}`;
  return `${obs} released@${r.releasedMs ?? '-'} before ${JSON.stringify(r.stateBeforeClick ?? null)} ${clickLine(r)} afterClick ${changesLine(r.watchAfterClick ?? r.watch)} ${tail}`;
}

const config = {
  imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, runnerName: process.env.RUNNER_NAME ?? null,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), chrome: sh(CFT, ['--version']).out,
  mainCommit: process.env.P288_MAIN_COMMIT ?? null, branchCommit: process.env.P288_BRANCH_COMMIT ?? null, probeCommit: process.env.GITHUB_SHA ?? null, rep: process.env.P288_REP ?? null,
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
