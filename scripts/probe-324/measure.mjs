// #324's hosted measurement: which shared-mode paths raise the target's window above the person's after the screen
// hold's release, and whether set_value's and select_text's focus can go by a press with its focus read back. One
// engine build (main patched on the runner, scripts/probe-324/patch.py), its mode chosen per process (P324_MODE), one
// process per mode for a survey block, a fresh one per batch for the residue. Every step runs on a fresh connection in
// shared mode behind a frontmost cover app, watched every 5 ms (scripts/probe-321/win.swift), and read against the
// engine's own hold log (stderr `P324` lines: each SLSDisableUpdate and SLSReenableUpdate with its Unix ms), so a raise
// is inside a hold (the display frozen) or after it (visible), whatever action made the hold.
//
// Blocks:
//   safari    Safari's page behind TextEdit: set_value and select_text on an unfocused and a focused text field and
//             textarea, a coordinate click on a button, a coordinate click into the text field then type_text then
//             press_key, a scroll, a drag across plain text, an element click on the button
//   appkit    Probe324.app (scripts/probe-324/app.swift: an NSTextField and an NSTextView) behind TextEdit: the same
//             set_value and select_text cells, coordinate clicks into both then type_text and press_key, a scroll, a
//             drag, an element click on its button
//   textedit  TextEdit's document as the target behind Probe324.app: set_value, select_text, a coordinate click then
//             type_text and press_key, a scroll, a drag
//   residue   #321's residue: Safari page coordinate clicks (button, checkbox, text field, textarea) in batches of
//             --clicks, each batch on a fresh Safari and engine process, the modes alternating by batch
//   node scripts/probe-324/measure.mjs --block <b> --engine <bin> --win <bin> --ax <bin> --app <bin> --modes m1,m2 --reps n --out <dir>
//     [--cells c1,c2] [--press-cells only set_value/select_text cells for mode press] [--batches n --clicks n]
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-324: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
const BLOCK = arg('block'), ENGINE = arg('engine'), WIN = arg('win'), AX = arg('ax'), APP = arg('app'), OUT = arg('out');
const MODES = arg('modes', 'main').split(',');
const REPS = Number(arg('reps', 1)), FIRST_REP = Number(arg('rep', 1));
const ONLY = arg('cells')?.split(',') ?? null;
const BATCHES = Number(arg('batches', 10)), CLICKS = Number(arg('clicks', 5));
if (!BLOCK || !ENGINE || !WIN || !AX || !APP || !OUT) { console.error('usage: measure.mjs --block <b> --engine --win --ax --app --out'); process.exit(2); }
process.env.P287_BROWSER = 'safari';
const {launchOther, browserVersion, placePid} = await import('../probe-287/browser.mjs');
const {watch, dump} = await import('../probe-321/watch.mjs');
mkdirSync(OUT, {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-324:', ...a);
const sh = (cmd, args, timeout = 20_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const json = r => { try { return JSON.parse(r.out); } catch { return {status: r.status, out: r.out.slice(0, 500), err: r.err.slice(0, 500)}; } };
const fileName = s => s.replace(/[^a-z0-9+-]+/gi, '_');
const FRAME = {x: 400, y: 30, w: 620, h: 720};  // the hosted screen is 1024 x 768; the cover sits to the left
const frontmost = () => {
  const asn = sh('lsappinfo', ['front']).out;
  const info = sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out;
  return (info.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] || info || null;
};

// ---- Safari's page --------------------------------------------------------------------------------------------------
const AREA = 'one two three four five';
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe324 page</title>
<style>body{font:15px sans-serif;margin:12px}p{margin:10px 0}#plain{font-size:22px}textarea{width:90%}#tail{height:2400px}</style></head>
<body><p><b>probe324 page</b></p>
<p><button id="apply" type="button">Apply</button> &nbsp; <label><input id="option" type="checkbox"> Probe option</label></p>
<p id="plain">Plain words to read here, nothing to press.</p>
<p><input id="name" type="text" placeholder="Probe name" aria-label="Probe name" size="30"></p>
<p><input id="filled" type="text" aria-label="Probe filled" value="alpha beta gamma" size="30"></p>
<p><textarea id="notes" aria-label="Probe notes" rows="3"></textarea></p>
<p><textarea id="area" aria-label="Probe area" rows="3">${AREA}</textarea></p>
<div id="tail">tail</div>
<script>history.scrollRestoration = 'manual'; (() => { const c = {pointerdown: 0, mousedown: 0, mouseup: 0, click: 0, applyClick: 0, optionChange: 0, input: 0, keydown: 0,
  nameFocus: 0, filledFocus: 0, notesFocus: 0, areaFocus: 0, windowFocus: 0, windowBlur: 0};
let seq = 0; const load = Math.random().toString(36).slice(2, 10);
const $ = id => document.getElementById(id);
const send = () => { seq += 1; navigator.sendBeacon('/counters', JSON.stringify({load, seq, counts: c, checked: $('option').checked,
  name: $('name').value, notes: $('notes').value, filled: $('filled').value, area: $('area').value,
  filledSel: [$('filled').selectionStart, $('filled').selectionEnd], areaSel: [$('area').selectionStart, $('area').selectionEnd],
  selection: String(getSelection()).length, scrollY: Math.round(scrollY), focused: document.hasFocus(),
  active: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null})); };
for (const k of ['pointerdown', 'mousedown', 'mouseup', 'click', 'keydown']) document.addEventListener(k, () => { c[k] += 1; send(); }, true);
$('apply').addEventListener('click', () => { c.applyClick += 1; send(); });
$('option').addEventListener('change', () => { c.optionChange += 1; send(); });
for (const id of ['name', 'filled', 'notes', 'area']) { $(id).addEventListener('focus', () => { c[id + 'Focus'] += 1; send(); }); $(id).addEventListener('input', () => { c.input += 1; send(); }); }
document.addEventListener('selectionchange', send);
addEventListener('scroll', send);
window.addEventListener('focus', e => { if (e.target === window) { c.windowFocus += 1; send(); } });
window.addEventListener('blur', e => { if (e.target === window) { c.windowBlur += 1; send(); } });
setInterval(() => fetch('/cmd', {cache: 'no-store'}).then(r => r.text()).then(t => { if (t === 'reload') location.reload(); }).catch(() => {}), 100);
addEventListener('load', () => { scrollTo(0, 0); navigator.sendBeacon('/ready'); send(); setInterval(send, 400); }); })();</script></body></html>`;
let latest = null, ready = false, reloadArmed = false;
const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') { res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(PAGE); return; }
  if (req.url === '/cmd') { res.writeHead(200, {'content-type': 'text/plain', 'cache-control': 'no-store'}); res.end(reloadArmed ? 'reload' : ''); reloadArmed = false; return; }
  let body = '';
  req.on('data', d => { body += d; if (body.length > 16384) req.destroy(); });
  req.on('end', () => {
    if (req.url === '/ready') ready = true;
    if (req.url === '/counters') { try { const r = JSON.parse(body); if (!latest || r.load !== latest.load || r.seq >= latest.seq) latest = r; } catch {} }
    res.writeHead(204); res.end();
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const LOCAL = `http://127.0.0.1:${server.address().port}/`;
const page = () => (latest ? {load: latest.load, ...latest.counts, checked: latest.checked, name: latest.name, notes: latest.notes, filled: latest.filled, area: latest.area,
  filledSel: latest.filledSel, areaSel: latest.areaSel, selection: latest.selection, scrollY: latest.scrollY, focused: latest.focused, active: latest.active} : {});
const pageDelta = (b, a) => {
  const keys = ['pointerdown', 'mousedown', 'mouseup', 'click', 'applyClick', 'optionChange', 'input', 'keydown', 'nameFocus', 'filledFocus', 'notesFocus', 'areaFocus', 'windowFocus', 'windowBlur'];
  return Object.fromEntries(keys.map(k => [k, (a[k] ?? 0) - (a.load === b.load ? b[k] ?? 0 : 0)]).filter(([, v]) => v));
};
async function reloadPage() {
  const prior = latest?.load;
  reloadArmed = true;
  for (let k = 0; k < 60 && latest?.load === prior; k++) await sleep(100);
  await sleep(700);
  return latest?.load !== prior;
}

// ---- the engine: one process per mode, its P324 log kept ------------------------------------------------------------
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
  execute(method, args, lineage) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 60_000, ...(lineage ? {lineage} : {})}); }
  close() { this.s.destroy(); }
}
const lean = r => r.error ? {error: JSON.parse(JSON.stringify(r.error))} : {result: JSON.parse(JSON.stringify(r.result ?? null, (k, v) => (k === 'nodes' || k === 'screenshot' || k === 'menuBar' ? undefined : v)))};
const metaOf = a => (a?.error ? a.error.meta : a?.result?.meta);
const answerOf = a => (a?.error ? (a.error.errorName ?? a.error.code) : 'success');

let engineSeq = 0;
async function startEngine(mode) {
  engineSeq += 1;
  const dir = join(process.env.RUNNER_TEMP || OUT, `s324${engineSeq}`); mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, 'e.sock');
  const child = spawn(ENGINE, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket, P324_MODE: mode}, stdio: ['ignore', 'pipe', 'pipe']});
  const events = [];
  let rest = '', other = '';
  child.stderr.on('data', d => {
    rest += d;
    const lines = rest.split('\n'); rest = lines.pop();
    for (const l of lines) {
      if (l.startsWith('P324 ')) { try { events.push(JSON.parse(l.slice(5))); } catch {} } else other = (other + l + '\n').slice(-20_000);
    }
  });
  child.stdout.on('data', () => {});
  const connect = async () => {
    const wire = await Wire.connect(socket);
    const ping = await wire.call('ping', {clientApiVersion: 'cua-engine-1', desktop: 'shared'});
    if (ping.error) throw new Error(`ping ${mode}: ${JSON.stringify(ping.error).slice(0, 300)}`);
    return wire;
  };
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) throw new Error(`engine ${mode} exited ${child.exitCode}: ${other.slice(0, 2000)}`);
    try { (await connect()).close(); return {mode, child, connect, events, stderr: () => other}; } catch { await sleep(50); }
  }
  throw new Error(`engine ${mode} did not listen: ${other.slice(0, 2000)}`);
}
const stopEngine = async e => { if (e && e.child.exitCode === null) { e.child.kill('SIGTERM'); await sleep(300); if (e.child.exitCode === null) e.child.kill('SIGKILL'); } };

// ---- the reading: a step's watch against the holds the engine logged -------------------------------------------------
/// The display's frozen spans (a hold counted from each SLSDisableUpdate to the SLSReenableUpdate that ends the last one
/// outstanding) from the engine's log between `from` and `to`.
function frozenSpans(events, from, to) {
  const spans = [];
  let depth = 0, start = null;
  for (const e of events.filter(x => x.t >= from && x.t <= to).sort((x, y) => x.t - y.t)) {
    if (e.ev === 'hold') { if (depth === 0) start = e.t; depth += 1; }
    if (e.ev === 'release' && depth > 0) { depth -= 1; if (depth === 0) { spans.push([start, e.t]); start = null; } }
  }
  if (depth > 0) spans.push([start, to]);
  return spans;
}
const overlap = (a, b) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
/// One step read: the target's window above the cover's front window (the watch's `aboveFront`, every 5 ms), each span
/// of it split into what lay inside a frozen span (hidden) and what did not (visible), the first visible moment against
/// the last release before it; the cover's front and key windows held throughout; the holds' total and longest span.
function reading(w, events, from, to, coverBundle, coverName) {
  const changes = w?.changes ?? [];
  const spans = frozenSpans(events, from - 20, to);
  const raises = [];
  for (let i = 0; i < changes.length; i++) {
    if (!changes[i].aboveFront) continue;
    const end = changes[i + 1]?.atMs ?? (w.goAt + w.ms);
    raises.push([changes[i].atMs, end]);
  }
  let insideMs = 0, visibleMs = 0, firstVisible = null;
  for (const r of raises) {
    const hidden = spans.reduce((s, f) => s + overlap(r, f), 0);
    insideMs += hidden; visibleMs += (r[1] - r[0]) - hidden;
    if (firstVisible == null && (r[1] - r[0]) - hidden > 0.5) {
      // The first visible moment: the raise's start, or the end of the span that hid its start.
      const covering = spans.find(f => f[0] <= r[0] && f[1] > r[0]);
      firstVisible = covering ? covering[1] : r[0];
    }
  }
  const releases = spans.map(f => f[1]);
  const lastRelease = firstVisible != null ? Math.max(-Infinity, ...releases.filter(t => t <= firstVisible + 0.5)) : null;
  const frozen = spans.map(f => f[1] - f[0]);
  const round = v => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
  return {raised: raises.length > 0, raisedInside: insideMs > 0.5, raisedAfter: visibleMs > 0.5, insideMs: round(insideMs), visibleMs: round(visibleMs),
    visibleAfterReleaseMs: firstVisible != null && Number.isFinite(lastRelease) ? round(firstVisible - lastRelease) : null,
    visibleNoHold: firstVisible != null && !Number.isFinite(lastRelease),
    raiseAtMs: raises.length ? round(raises[0][0] - from) : null, holds: spans.length, frozenMs: round(frozen.reduce((s, v) => s + v, 0)), longestFreezeMs: round(Math.max(0, ...frozen)),
    holdSpans: spans.map(f => [round(f[0] - from), round(f[1] - from)]),
    frontHeld: changes.every(c => c.frontmost === coverBundle), keyHeld: changes.every(c => (c.key ?? '').startsWith(`${coverName}:`)),
    fronts: [...new Set(changes.map(c => c.frontmost))], keys: [...new Set(changes.map(c => c.key))],
    trace: changes.slice(0, 14).map(c => [round(c.atMs - from), c.aboveFront ? 1 : 0])};
}
/// The engine's log lines of a step, times relative to its request.
const stepEvents = (events, from, to) => events.filter(e => e.t >= from - 20 && e.t <= to).map(e => ({...e, t: Math.round((e.t - from) * 10) / 10}));
/// What the delivery record (the fallback click's too, which the probe build keeps) and the activation say.
function recordOf(meta) {
  const d = meta?.delivery;
  return {route: meta?.inputRoute ?? null, activationClickKind: meta?.activationClickKind?.kind ?? null, activationGuardMs: meta?.activationGuardMs ?? null,
    elementClick: meta?.elementClick ? {plan: meta.elementClick.plan, action: meta.elementClick.action, focus: meta.elementClick.focus, focusStep: meta.elementClick.focusStep} : null,
    delivery: d ? {guardMs: d.guardMs, screenHoldMs: d.screenHoldMs, capped: d.capped, raiseLeft: d.raiseLeft, restores: d.restores, repairedAfterRelease: d.repairedAfterRelease,
      transientRaise: d.transientRaise, postedAfterHoldStartMs: d.postedAt - d.holdStartedAt} : null};
}

// ---- the cover and the targets --------------------------------------------------------------------------------------
const TEXT_DOC = join(process.env.RUNNER_TEMP || OUT, 'front324.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window during each action.\n');
const TARGET_DOC = join(process.env.RUNNER_TEMP || OUT, 'target324.txt');
const TARGET_TEXT = Array.from({length: 60}, (_, i) => `native line ${i} with some words to click into`).join('\n') + '\n';
writeFileSync(TARGET_DOC, TARGET_TEXT);
const pidOf = name => Number(sh('pgrep', ['-x', name]).out.split('\n')[0]) || null;
async function frontTextEdit() {
  for (let i = 0; i < 4; i++) { sh('open', ['-a', 'TextEdit', TEXT_DOC]); await sleep(1200); if (frontmost() === 'com.apple.TextEdit') break; }
  osa('tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {0, 40}\nset size of window 1 to {380, 300}\nend tell\nend tell');
  await sleep(300);
  return frontmost();
}
/// Probe324.app: its state file, its command file (each command numbered).
function probeApp(label) {
  const state = join(OUT, `app-${fileName(label)}.json`), commands = join(OUT, `app-${fileName(label)}.cmd`);
  writeFileSync(commands, '');
  const child = spawn(APP, [state, commands], {stdio: 'ignore'});
  let n = 0;
  return {child, pid: child.pid,
    read: () => { try { return JSON.parse(readFileSync(state, 'utf8')); } catch { return null; } },
    send: async (cmd, wait = 300) => { n += 1; writeFileSync(commands, `${n} ${cmd}\n`); await sleep(wait); }};
}
const order = (pid, coverName) => {
  const d = dump(WIN);
  const l0 = (d.windows ?? []).filter(w => w.layer === 0);
  const mine = l0.map((w, i) => [w, i]).filter(([w]) => w.pid === pid).map(([, i]) => i);
  const cov = l0.map((w, i) => [w, i]).filter(([w]) => w.owner === coverName).map(([, i]) => i);
  return {frontmost: d.frontmost, above: mine.length > 0 && cov.length > 0 && Math.min(...mine) < Math.min(...cov)};
};

const labelOf = n => `${n.title ?? ''} ${n.description ?? ''} ${n.placeholder ?? ''} ${n.help ?? ''} ${n.identifier ?? ''}`;
const FIND = {
  apply: n => n.role === 'AXButton' && /\bApply\b/.test(labelOf(n)),
  checkbox: n => n.role === 'AXCheckBox',
  plain: n => n.role === 'AXStaticText' && /Plain words/.test(`${labelOf(n)} ${n.value ?? ''}`),
  name: n => n.role === 'AXTextField' && /Probe name/.test(labelOf(n)),
  filled: n => n.role === 'AXTextField' && /Probe filled/.test(labelOf(n)),
  notes: n => n.role === 'AXTextArea' && /Probe notes/.test(labelOf(n)),
  area: n => n.role === 'AXTextArea' && /Probe area/.test(labelOf(n)),
  webArea: n => n.role === 'AXWebArea',
  // Probe324.app
  start: n => n.role === 'AXButton' && /Start/.test(labelOf(n)),
  field: n => n.role === 'AXTextField',
  appNotes: n => n.role === 'AXTextArea',
  // TextEdit
  text: n => n.role === 'AXTextArea',
};
const pixelOf = (sky, sx, sy) => { const wf = sky.window.frame, s = sky.screenshot.width / wf.width; return {x: Math.round((sx - wf.x) * s), y: Math.round((sy - wf.y) * s)}; };
const centreOf = f => ({x: f.x + f.width / 2, y: f.y + f.height / 2});

async function observe(w, pid, label) {
  const shots = join(OUT, 'shots', fileName(label)); mkdirSync(shots, {recursive: true});
  try {
    const r = await w.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots});
    return r.error ? {error: lean(r).error} : {sky: r.result};
  } finally { rmSync(shots, {recursive: true, force: true}); }
}

// ---- the cells -------------------------------------------------------------------------------------------------------
// A step: `act(sky, find)` answers [method, args]; `effect(before, after)` answers {seen, ...}.
const notesLine = k => TARGET_TEXT.indexOf(`native line ${k} `);
const APP_FIELD = 'alpha bravo charlie';
const APP_NOTES = Array.from({length: 60}, (_, i) => `notes line ${i} delta echo foxtrot`).join('\n');
const posted = (b, a) => { const d = pageDelta(b, a); return (d.pointerdown ?? 0) + (d.mousedown ?? 0); };
const S = {
  sv: (target, value, read) => ({kind: 'set_value', act: (sky, f) => ['set_value', {element: f(target).token, value}], effect: (b, a) => ({seen: read(a) === value, value: read(a)})}),
  st: (target, text, read, range) => ({kind: 'select_text', act: (sky, f) => ['select_text', {element: f(target).token, text}], effect: (b, a) => ({seen: JSON.stringify(read(a)) === JSON.stringify(range), sel: read(a)})}),
  coord: (target, effect, at) => ({kind: 'click', act: (sky, f) => { const n = f(target); const p = at ? at(n.frame) : centreOf(n.frame); return ['click', pixelOf(sky, p.x, p.y)]; }, effect}),
  token: (target, effect) => ({kind: 'click/element', act: (sky, f) => ['click', {element: f(target).token}], effect}),
  type: (text, read) => ({kind: 'type_text', act: () => ['type_text', {text}], effect: (b, a) => ({seen: String(read(a) ?? '').includes(text)})}),
  key: (key, read) => ({kind: 'press_key', act: () => ['press_key', {key}], effect: (b, a) => ({seen: String(read(a) ?? '').length === String(read(b) ?? '').length - 1, before: String(read(b) ?? '').length, after: String(read(a) ?? '').length})}),
  scroll: (target, read) => ({kind: 'scroll', act: (sky, f) => { const p = centreOf(f(target).frame); return ['scroll', {direction: 'down', pages: 1, ...pixelOf(sky, p.x, p.y)}]; }, effect: (b, a) => ({seen: (read(a) ?? 0) > (read(b) ?? 0), before: read(b), after: read(a)})}),
  drag: (target, read) => ({kind: 'drag', act: (sky, f) => {
    const fr = f(target).frame, y = fr.y + Math.min(fr.height / 2, 10);
    const a = pixelOf(sky, fr.x + 4, y), b = pixelOf(sky, fr.x + Math.min(fr.width - 6, 260), y);
    return ['drag', {from_x: a.x, from_y: a.y, to_x: b.x, to_y: b.y}];
  }, effect: (b, a) => ({seen: (read(a) ?? 0) > 0, selected: read(a)})}),
};
const SAFARI = [
  {name: 'sv/name', steps: [S.sv('name', 'sv324name', a => a.name)]},
  {name: 'sv/notes', steps: [S.sv('notes', 'sv324notes', a => a.notes)]},
  {name: 'sv/name-focused', prep: 'name', steps: [S.sv('name', 'sv324focused', a => a.name)]},
  {name: 'sv/notes-focused', prep: 'notes', steps: [S.sv('notes', 'sv324nfocused', a => a.notes)]},
  {name: 'st/filled', steps: [S.st('filled', 'beta', a => a.filledSel, [6, 10])]},
  {name: 'st/area', steps: [S.st('area', 'three', a => a.areaSel, [8, 13])]},
  {name: 'st/filled-focused', prep: 'filled', steps: [S.st('filled', 'gamma', a => a.filledSel, [11, 16])]},
  {name: 'st/area-focused', prep: 'area', steps: [S.st('area', 'four', a => a.areaSel, [14, 18])]},
  {name: 'coord/button', steps: [S.coord('apply', (b, a) => ({seen: (pageDelta(b, a).applyClick ?? 0) > 0}))]},
  {name: 'coord/name+type+key', steps: [S.coord('name', (b, a) => ({seen: a.active === 'name', active: a.active})), S.type('q324', a => a.name), S.key('BackSpace', a => a.name)]},
  {name: 'scroll/page', steps: [S.scroll('plain', a => a.scrollY)]},
  {name: 'drag/plain', steps: [S.drag('plain', a => a.selection)]},
  {name: 'token/button', steps: [S.token('apply', (b, a) => ({seen: (pageDelta(b, a).applyClick ?? 0) > 0}))]},
];
const APPKIT = [
  {name: 'sv/field', steps: [S.sv('field', 'sv324field', a => a.field)]},
  {name: 'sv/notes', steps: [S.sv('appNotes', 'sv324notes', a => a.notes)]},
  {name: 'sv/field-focused', prep: 'field', steps: [S.sv('field', 'sv324ffocused', a => a.field)]},
  {name: 'sv/notes-focused', prep: 'notes', steps: [S.sv('appNotes', 'sv324nfocused', a => a.notes)]},
  {name: 'st/field', steps: [S.st('field', 'bravo', a => a.fieldSel, [6, 5])]},
  {name: 'st/notes', steps: [S.st('appNotes', 'notes line 2', a => a.notesSel, [APP_NOTES.indexOf('notes line 2'), 12])]},
  {name: 'st/field-focused', prep: 'field', steps: [S.st('field', 'charlie', a => a.fieldSel, [12, 7])]},
  {name: 'st/notes-focused', prep: 'notes', steps: [S.st('appNotes', 'notes line 3', a => a.notesSel, [APP_NOTES.indexOf('notes line 3'), 12])]},
  {name: 'coord/notes+type+key', steps: [S.coord('appNotes', (b, a) => ({seen: a.responder === 'notes', responder: a.responder}), f => ({x: f.x + 80, y: f.y + 30})),
    S.type('q324', a => a.notes), S.key('BackSpace', a => a.notes)]},
  {name: 'coord/field+type', steps: [S.coord('field', (b, a) => ({seen: a.responder === 'field', responder: a.responder})), S.type('q324', a => a.field)]},
  {name: 'scroll/notes', steps: [S.scroll('appNotes', a => a.scrollY)]},
  {name: 'drag/notes', steps: [S.drag('appNotes', a => a.notesSel?.[1])]},
  {name: 'token/start', steps: [S.token('start', (b, a) => ({seen: (a.clicks ?? 0) > (b.clicks ?? 0)}))]},
];
const TEXTEDIT = [
  {name: 'sv/text', steps: [S.sv('text', 'sv324text', a => a.value)]},
  {name: 'st/text', steps: [S.st('text', 'native line 3 ', a => a.sel, [notesLine(3), 'native line 3 '.length])]},
  {name: 'coord/text+type+key', steps: [S.coord('text', (b, a) => ({seen: (a.sel?.[0] ?? 0) > 0, sel: a.sel}), f => ({x: f.x + 120, y: f.y + 50})),
    S.type('q324', a => a.around), {...S.key('BackSpace', a => a.value), effect: (b, a) => ({seen: a.length === b.length - 1, before: b.length, after: a.length})}]},
  {name: 'scroll/text', steps: [S.scroll('text', a => a.scroll)]},
  {name: 'drag/text', steps: [S.drag('text', a => a.sel?.[1])]},
];
const FOCUS_CELLS = c => c.name.startsWith('sv/') || c.name.startsWith('st/');

// ---- one cell -------------------------------------------------------------------------------------------------------
async function runCell(ctx, cell) {
  const {engine, mode, rep, target} = ctx;
  const label = `${BLOCK}/${mode}/r${rep}/${cell.name}`;
  const row = {label, block: BLOCK, mode, rep, cell: cell.name, steps: []};
  const w = await engine.connect();
  try {
    await target.reset();
    if (cell.prep) row.prep = await target.prep(w, cell.prep, label);
    await target.refront();
    const o = await observe(w, target.pid, label);
    if (o.error) { row.problem = {getAppState: o.error}; return row; }
    const sky = o.sky;
    const find = key => { const n = sky.nodes.find(FIND[key]); if (!n?.frame) throw new Error(`no ${key} node with a frame (roles ${[...new Set(sky.nodes.map(x => x.role))].join(',')})`); return n; };
    for (const step of cell.steps) {
      const s = {kind: step.kind};
      const [method, args] = step.act(sky, find);
      s.method = method; s.args = {...args, value: undefined};
      const ord = order(target.pid, target.coverName);
      if (ord.frontmost !== target.coverBundle || ord.above) { s.refronted = true; await target.refront(); }
      await sleep(400);
      const before = target.state();
      const watcher = await watch(WIN, target.pid, target.coverName, 3000);
      watcher.go();
      const from = Date.now();
      const answer = lean(await w.execute(method, {pid: target.pid, ...args}, sky.lineage));
      const to = Date.now();
      s.ms = to - from;
      await sleep(1600);
      const wt = await watcher.done();
      const after = target.state();
      const meta = metaOf(answer);
      s.answer = answerOf(answer);
      if (answer.error) s.message = String(answer.error.message ?? '').slice(0, 300);
      s.record = recordOf(meta);
      s.events = stepEvents(engine.events, from, to + 1600);
      s.read = reading(wt, engine.events, from, to + 1600, target.coverBundle, target.coverName);
      s.watchOk = Array.isArray(wt?.changes);
      s.effect = step.effect(before, after);
      if (target.posted) s.posted = target.posted(before, after);
      s.keyed = target.keyed?.(before, after);
      row.steps.push(s);
    }
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 1500);
  } finally { w.close(); }
  return row;
}
const say = row => {
  if (row.problem || row.exception) return log(`${row.label}: PROBLEM ${JSON.stringify(row.problem ?? row.exception).slice(0, 500)}`);
  for (const s of row.steps) {
    const ev = s.events.filter(e => /^(act|dlv\.post|dlv\.end|ff|ff\.focusWrite|ff\.click|pf)$/.test(e.ev)).map(e => `${e.ev}@${e.t}${e.kind ? ':' + e.kind : ''}${e.untilOrder != null ? ' until=' + e.untilOrder : ''}${e.took != null ? ' took=' + e.took : ''}${e.steps ? ' ' + e.steps : ''}`).join(' | ');
    log(`${row.label} ${s.kind}: ${s.answer} ${s.ms}ms effect=${JSON.stringify(s.effect)} posted=${s.posted ?? '-'} raised=${s.read.raised} inside=${s.read.insideMs} visible=${s.read.visibleMs} afterRelease=${s.read.visibleAfterReleaseMs} holds=${JSON.stringify(s.read.holdSpans)} front=${s.read.frontHeld} key=${s.read.keyHeld} kind=${s.record.activationClickKind} dlv=${JSON.stringify(s.record.delivery)} :: ${ev}${s.message ? ' msg=' + s.message : ''}`);
  }
};

// ---- the targets ------------------------------------------------------------------------------------------------------
async function safariTarget(label) {
  ready = false; latest = null;
  await frontTextEdit();
  const child = await launchOther(LOCAL, join(OUT, 'profiles', fileName(label)), FRAME);
  for (let i = 0; i < 120 && !ready; i++) await sleep(250);
  await sleep(2000);
  placePid(child.pid, FRAME);
  await frontTextEdit();
  const t = {pid: child.pid, child, coverName: 'TextEdit', coverBundle: 'com.apple.TextEdit', state: () => page(), posted,
    reset: async () => { await reloadPage(); },
    prep: async (w, key, l) => {
      // The field focused first by an element click on it (#313's press, or the caret step on a textarea), its own observation.
      const o = await observe(w, child.pid, `${l}-prep`);
      const n = o.sky?.nodes.find(FIND[key]);
      const r = n ? lean(await w.execute('click', {pid: child.pid, element: n.token}, o.sky.lineage)) : {problem: o.error ?? 'no target'};
      await sleep(900);
      return {answer: r.problem ?? answerOf(r), active: page().active};
    },
    refront: async () => { const o = order(child.pid, 'TextEdit'); if (o.frontmost !== 'com.apple.TextEdit' || o.above) await frontTextEdit(); },
    stop: async () => { sh('pkill', ['-x', 'Safari']); await sleep(1500); }};
  return t;
}
async function appkitTarget(label) {
  await frontTextEdit();
  const a = probeApp(label);
  await sleep(2500);
  await frontTextEdit();
  const keyed = (b, x) => ({becameKey: (x?.transitions ?? []).some(tr => tr.key && tr.t > (b?.t ?? 0)), activeSeen: (x?.transitions ?? []).some(tr => tr.active && tr.t > (b?.t ?? 0)), mouseDowns: (x?.mouseDowns ?? 0) - (b?.mouseDowns ?? 0)});
  return {pid: a.pid, child: a.child, coverName: 'TextEdit', coverBundle: 'com.apple.TextEdit', state: a.read, keyed,
    posted: (b, x) => (x?.mouseDowns ?? 0) - (b?.mouseDowns ?? 0),
    reset: async () => { await a.send('reset', 400); },
    prep: async (w, key) => { await a.send(`focus ${key}`, 400); return {responder: a.read()?.responder}; },
    refront: async () => { const o = order(a.pid, 'TextEdit'); if (o.frontmost !== 'com.apple.TextEdit' || o.above) await frontTextEdit(); },
    stop: async () => { a.child.kill('SIGTERM'); await sleep(1000); }};
}
async function texteditTarget(label) {
  sh('pkill', ['-x', 'TextEdit']);
  await sleep(1500);
  sh('open', ['-a', 'TextEdit', TARGET_DOC]);
  await sleep(2500);
  osa('tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {420, 40}\nset size of window 1 to {560, 400}\nend tell\nend tell');
  const pid = pidOf('TextEdit');
  const a = probeApp(`${label}-cover`);
  await sleep(2500);
  const placeFront = async () => {
    await a.send('front', 300);
    osa(`tell application "System Events"\ntell (first process whose unix id is ${a.child.pid})\nset frontmost to true\nset position of window 1 to {-250, 40}\nend tell\nend tell`);
    await sleep(600);
  };
  await placeFront();
  const state = () => json(sh(AX, ['state', String(pid)]));
  return {pid, child: a.child, coverName: 'Probe324', coverBundle: 'com.ssfskim.probe324', state,
    reset: async () => { json(sh(AX, ['reset', String(pid), TARGET_TEXT])); await sleep(400); },
    refront: async () => { const o = order(pid, 'Probe324'); if (o.frontmost !== 'com.ssfskim.probe324' || o.above) await placeFront(); },
    stop: async () => { a.child.kill('SIGTERM'); sh('pkill', ['-x', 'TextEdit']); await sleep(1500); }};
}

// ---- the run ----------------------------------------------------------------------------------------------------------
const config = {block: BLOCK, modes: MODES, reps: REPS, imageVersion: process.env.ImageVersion ?? null, macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '),
  safari: browserVersion(), mainCommit: process.env.P324_MAIN_COMMIT ?? null, probeCommit: process.env.GITHUB_SHA ?? null};
const results = [];
const save = () => writeFileSync(join(OUT, `results-${BLOCK}.json`), JSON.stringify({config, results}, null, 1));
log('config', JSON.stringify(config));
save();

if (BLOCK === 'residue') {
  // #321's residue: page coordinate clicks, each batch on a fresh Safari and engine, the modes alternating by batch.
  const TARGETS = ['apply', 'checkbox', 'name', 'area'];
  for (let b = 1; b <= BATCHES; b++) {
    const modes = b % 2 ? MODES : [...MODES].reverse();
    for (const mode of modes) {
      const tgt = TARGETS[(b - 1) % TARGETS.length];
      let engine, target;
      try {
        target = await safariTarget(`residue-${mode}-b${b}`);
        engine = await startEngine(mode);
        for (let i = 1; i <= CLICKS; i++) {
          const cell = {name: `coord/${tgt}#${i}`, steps: [S.coord(tgt, (bf, a) => {
            const d = pageDelta(bf, a);
            const pointer = ['pointerdown', 'mousedown', 'mouseup'].every(k => d[k] === 1) && (d.click ?? 0) >= 1;
            const own = tgt === 'apply' ? d.applyClick === 1 : tgt === 'checkbox' ? d.optionChange === 1 : d[`${tgt}Focus`] === 1 && a.active === tgt;
            return {seen: pointer && own, pointer, own};
          })]};
          const row = await runCell({engine, mode, rep: b, target}, cell);
          row.batch = b; row.click = i; row.firstOfEngine = i === 1;
          results.push(row); save(); say(row);
        }
      } catch (e) {
        results.push({label: `residue/${mode}/b${b}`, mode, batch: b, exception: String(e?.stack || e).slice(0, 1500)}); save();
        log(`residue/${mode}/b${b}: EXCEPTION ${String(e?.stack || e).slice(0, 500)}`);
      } finally {
        if (engine) { config[`stderr-${mode}-b${b}`] = engine.stderr().slice(-1500); await stopEngine(engine); }
        if (target) await target.stop();
      }
    }
  }
} else {
  const cells = {safari: SAFARI, appkit: APPKIT, textedit: TEXTEDIT}[BLOCK].filter(c => !ONLY || ONLY.includes(c.name));
  // One engine process alive at a time (the smoke run 42467362773: with three processes of the one build alive, every
  // capture but the first process's timed out), a fresh one per repetition and mode.
  {
    for (let rep = FIRST_REP; rep < FIRST_REP + REPS; rep++) {
      const modes = rep % 2 ? MODES : [...MODES].reverse();
      for (const mode of modes) {
        const label = `${BLOCK}-${mode}-r${rep}`;
        log(`== ${new Date().toISOString().slice(11, 19)} ${label}`);
        let target, engine;
        try {
          engine = await startEngine(mode);
          target = await (BLOCK === 'safari' ? safariTarget : BLOCK === 'appkit' ? appkitTarget : texteditTarget)(label);
          // An untimed observation first (the tree built), then the cells.
          const warm = await engine.connect();
          await observe(warm, target.pid, `${label}-warm`); warm.close();
          for (const cell of cells.filter(c => mode !== 'press' || FOCUS_CELLS(c))) {
            const row = await runCell({engine, mode, rep, target}, cell);
            results.push(row); save(); say(row);
          }
        } catch (e) {
          results.push({label, mode, rep, exception: String(e?.stack || e).slice(0, 1500)}); save();
          log(`${label}: EXCEPTION ${String(e?.stack || e).slice(0, 500)}`);
        } finally {
          if (engine) { config[`stderr-${mode}-r${rep}`] = engine.stderr().slice(-1500); await stopEngine(engine); }
          if (target) await target.stop();
        }
      }
    }
  }
}
save();
server.close();
process.exit(0);
