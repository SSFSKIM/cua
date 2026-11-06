// #283's hosted probe: on a GitHub-hosted macOS runner, Accessibility writes (scripts/probe-283/ax.swift, a child of the
// job shell, which holds the image's Accessibility grant) into a background Chrome for Testing page's text fields behind
// a frontmost TextEdit, then a follow-up type_text through cua's own engine (main's, shared mode).
//
// The page holds an <input>, a <textarea> and a contenteditable <div> (kinds input, textarea, ce), each with known text
// in a monospace font, so the page can name the client point of a character offset (k1 in the middle of a word in the
// middle of the text, k2 near the start). Its beacons carry focus and blur counts per field, pointer, mouse, key and
// input counts on the document, and each field's selection (selectionStart/End; for ce the Selection's anchor and focus
// as offsets in the div's text) on every focus, blur, selectionchange and every 250 ms. `?prior=<kind>` makes the page
// set that field's selection on load without focusing it (input 6, textarea line 2 col 6, ce 5).
//
// Every cell is a fresh Chrome (its own user-data directory), a fresh engine and connection: get_app_state (the engine's
// first observation, which starts Chromium's complete accessibility mode about 1.6 s later), then:
//   chain/<kind>                  no write: the hit chain with every attribute, settable and parameterized name, right
//                                 after the observation and again 3 s later
//   <pre|post>/<kind>/<route>@<target>   pre: the write right after the observation; post: 3 s after it. route focus
//                                 (AXFocused true) or press (AXPress); target the hit, or its AXEditableAncestor
//   prior-<pre|post>/<kind>/…     the same on ?prior=<kind>
//   <pre|post>/<kind>/select@editable, …/focus+select@editable   AXSelectedTextRange {k1, 0} alone, or after AXFocused
//   place/<kind>/focus@editable   post focus, then the caret placed in turn: {k1, 0} written straight (known); k2 found by
//                                 scanning the target's AXBoundsForRange for the box holding its point (bounds); k1 the same
//                                 way on the hit (bounds-hit: ce's AXStaticText); AXRangeForPosition at k2's point (range);
//                                 AXTextMarkerForPosition (or AXStartTextMarkerForBounds) at k1's point +
//                                 AXSelectedTextMarkerRange (marker)
// Blink sends no focus event to a field focused while its window is inactive, so the page beacons its active element's
// change (polled every 4 ms) as its focus signal.
// Every write cell then types a marker with type_text (shared mode) and reads where it landed.
//
//   node scripts/probe-283/probe.mjs --engine <cua-engine> --ax <ax> --out <dir> [--cells <prefix,…>]
//
// Runs only on a GitHub-hosted runner: it launches and kills its own Chrome and TextEdit and moves TextEdit's window.
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-283: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), ENGINE = arg('engine'), AX = arg('ax');
const ONLY = arg('cells') ? arg('cells').split(',') : null;
if (!OUT || !ENGINE || !AX) { console.error('usage: probe.mjs --engine <bin> --ax <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-283:', ...a);
const MARK = 'QZ';

// --- the page.
const INPUT = 'alpha bravo charlie delta echo foxtrot';
const LINES = ['first line of the notes', 'second line holds more words', 'third line sits below', 'fourth and final line'];
const CE = 'golf hotel india juliet kilo lima mike';
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe283 page</title>
<style>body{margin:8px;font:14px sans-serif}.f{font:16px/20px Menlo,monospace;padding:4px 6px;border:1px solid #888;margin:8px 0;display:block;letter-spacing:0;width:460px}
#field-input{height:20px}#field-textarea{height:80px;resize:none;overflow:hidden;white-space:pre}#field-ce{height:20px;white-space:pre;outline:none}</style></head>
<body><p><b>probe283 page</b></p>
<input id="field-input" class="f" type="text" aria-label="Probe input" spellcheck="false" autocomplete="off" value="${INPUT}">
<textarea id="field-textarea" class="f" aria-label="Probe notes" spellcheck="false" wrap="off" rows="4">${LINES.join('\n')}</textarea>
<div id="field-ce" class="f" contenteditable="true" aria-label="Probe editor" spellcheck="false">${CE}</div>
<p id="status">Ready</p>
<script>(() => {
const prior = new URLSearchParams(location.search).get('prior');
const load = Math.random().toString(36).slice(2, 10);
const F = {input: document.getElementById('field-input'), textarea: document.getElementById('field-textarea'), ce: document.getElementById('field-ce')};
const c = {pointerdown: 0, pointerup: 0, mousedown: 0, mouseup: 0, click: 0, pointermove: 0, mousemove: 0, keydown: 0, input: 0, selectionchange: 0, windowFocus: 0, windowBlur: 0};
for (const k of Object.keys(F)) { c[k + 'Focus'] = 0; c[k + 'Blur'] = 0; }
let seq = 0;
const ceOffset = (node, off) => { if (!node || !(node === F.ce || F.ce.contains(node))) return null; const r = document.createRange(); r.setStart(F.ce, 0); r.setEnd(node, off); return r.toString().length; };
const sel = () => { const s = getSelection(); return {
  input: [F.input.selectionStart, F.input.selectionEnd, F.input.selectionDirection],
  textarea: [F.textarea.selectionStart, F.textarea.selectionEnd, F.textarea.selectionDirection],
  ce: {anchor: ceOffset(s.anchorNode, s.anchorOffset), focus: ceOffset(s.focusNode, s.focusOffset), rangeCount: s.rangeCount, type: s.type,
       anchorNode: s.anchorNode ? s.anchorNode.nodeName + (s.anchorNode.parentNode && s.anchorNode.parentNode.id ? '<' + s.anchorNode.parentNode.id : '') : null}}; };
const state = (ev, extra) => ({load, seq: ++seq, t: Date.now(), ev, ...extra, counts: {...c}, active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
  hasFocus: document.hasFocus(), visibility: document.visibilityState, sel: sel(), values: {input: F.input.value, textarea: F.textarea.value, ce: F.ce.textContent}});
const send = (ev, extra) => navigator.sendBeacon('/b', JSON.stringify(state(ev, extra)));
for (const k of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'pointermove', 'mousemove', 'keydown', 'input'])
  document.addEventListener(k, e => { c[k] += 1; if (!k.endsWith('move')) send(k, {trusted: e.isTrusted, target: e.target.id || e.target.tagName, key: e.key}); }, true);
document.addEventListener('selectionchange', e => { c.selectionchange += 1; send('selectionchange', {target: e.target && (e.target.id || e.target.nodeName)}); }, true);
for (const [k, el] of Object.entries(F)) {
  el.addEventListener('focus', () => { c[k + 'Focus'] += 1; send('focus:' + k); });
  el.addEventListener('blur', () => { c[k + 'Blur'] += 1; send('blur:' + k); });
}
window.addEventListener('focus', e => { if (e.target === window) { c.windowFocus += 1; send('window:focus'); } });
window.addEventListener('blur', e => { if (e.target === window) { c.windowBlur += 1; send('window:blur'); } });
const lines = F.textarea.value.split('\\n');
const taOffset = (line, col) => lines.slice(0, line).reduce((a, l) => a + l.length + 1, 0) + col;
const layout = () => {
  const ctx = document.createElement('canvas').getContext('2d'); ctx.font = '16px Menlo, monospace';
  const cw = ctx.measureText('MMMMMMMMMM').width / 10;
  const box = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return {rect: {x: r.left, y: r.top, w: r.width, h: r.height}, l: r.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft), t: r.top + parseFloat(s.borderTopWidth) + parseFloat(s.paddingTop), lh: parseFloat(s.lineHeight)}; };
  const I = box(F.input), T = box(F.textarea), C = box(F.ce);
  const inputPt = k => ({x: I.l + (k + 0.3) * cw - F.input.scrollLeft, y: I.rect.y + I.rect.h / 2});
  const taPt = (line, col) => ({x: T.l + (col + 0.3) * cw, y: T.t + (line + 0.5) * T.lh - F.textarea.scrollTop});
  const cePt = k => { const r = document.createRange(); r.setStart(F.ce.firstChild, k); r.setEnd(F.ce.firstChild, k + 1); const b = r.getBoundingClientRect(); return {x: b.left + 0.3 * b.width, y: b.top + b.height / 2, mono: {x: C.l + (k + 0.3) * cw}}; };
  return {cw, dpr: devicePixelRatio, inner: {w: innerWidth, h: innerHeight}, fields: {
    input: {rect: I.rect, length: F.input.value.length, k1: 14, k2: 3, p1: inputPt(14), p2: inputPt(3), prior: 6},
    textarea: {rect: T.rect, length: F.textarea.value.length, k1: taOffset(1, 14), k2: taOffset(3, 5), p1: taPt(1, 14), p2: taPt(3, 5), prior: taOffset(2, 6)},
    ce: {rect: C.rect, length: F.ce.textContent.length, k1: 19, k2: 2, p1: cePt(19), p2: cePt(2), prior: 5}}};
};
addEventListener('load', () => {
  let priorNote = null;
  if (prior === 'input') F.input.setSelectionRange(6, 6);
  if (prior === 'textarea') F.textarea.setSelectionRange(taOffset(2, 6), taOffset(2, 6));
  if (prior === 'ce') { getSelection().collapse(F.ce.firstChild, 5); priorNote = {activeAfterCollapse: document.activeElement && (document.activeElement.id || document.activeElement.tagName)}; if (document.activeElement === F.ce) { F.ce.blur(); priorNote.blurred = true; } }
  document.fonts.ready.then(() => { navigator.sendBeacon('/layout', JSON.stringify(layout())); send('load', {prior, priorNote}); });
  setInterval(() => send('tick'), 250);
  // Blink sends no focus event to a field focused while its window is inactive: the active element's change is the
  // page's own focus signal, read every 4 ms.
  let was = document.activeElement;
  setInterval(() => { if (document.activeElement !== was) { const from = was; was = document.activeElement; send('active', {from: from && (from.id || from.tagName), to: was && (was.id || was.tagName)}); } }, 4);
}); })();</script></body></html>`;

let beacons = [], layoutData = null;
const server = createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) { res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(PAGE); return; }
  let body = '';
  req.on('data', d => { body += d; if (body.length > 65536) req.destroy(); });
  req.on('end', () => {
    const arrive = Date.now();
    try {
      if (req.url === '/layout') layoutData = JSON.parse(body);
      if (req.url === '/b') beacons.push({arrive, ...JSON.parse(body)});
    } catch {}
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
// The AX tool runs asynchronously so the page's beacons are received (and timed) while it runs.
const ax = args => new Promise(resolve => {
  const child = spawn(AX, args, {stdio: ['ignore', 'pipe', 'pipe']});
  let out = '', err = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
  const t = setTimeout(() => child.kill('SIGKILL'), 60_000);
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
const at = t => { let b = null; for (const x of beacons) if (x.t <= t) b = x; return b; };
const caret = (b, kind) => {
  if (!b) return null;
  const s = b.sel?.[kind];
  return kind === 'ce' ? {start: s?.anchor ?? null, end: s?.focus ?? null} : {start: s?.[0] ?? null, end: s?.[1] ?? null};
};
// What a caret is against the offsets that could explain it.
const classify = (cr, f, prior) => {
  if (!cr || cr.start == null) return 'none';
  const tags = [];
  if (cr.start !== cr.end) tags.push(`range ${cr.start}-${cr.end}`);
  const p = cr.end;
  if (p === 0) tags.push('start');
  if (p === f.length) tags.push('end');
  if (prior != null && p === prior) tags.push('prior');
  if (p === f.k1) tags.push('point(k1)');
  if (p === f.k2) tags.push('k2');
  return `${p}${tags.length ? ' ' + tags.join(',') : ''}`;
};
const COUNT_KEYS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'pointermove', 'mousemove', 'keydown', 'input'];
const pointerDelta = (a, b) => Object.fromEntries(COUNT_KEYS.map(k => [k, (b?.counts?.[k] ?? 0) - (a?.counts?.[k] ?? 0)]).filter(([, v]) => v));

const TEXT_DOC = join(OUT, 'front.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window during each write.\n');
const fileName = label => label.replace(/[^a-z0-9-]+/gi, '_');

async function launchChrome(label, query) {
  beacons = []; layoutData = null;
  const child = spawn(CFT, [`--user-data-dir=${join(OUT, `chrome-${fileName(label)}`)}`, '--no-first-run', '--no-default-browser-check',
    '--disable-search-engine-choice-screen', '--window-position=400,30', '--window-size=620,720', URL_ + query], {stdio: 'ignore'});
  for (let i = 0; i < 120 && !(layoutData && beacons.some(b => b.ev === 'load')); i++) await sleep(250);
  if (!layoutData) throw new Error('Chrome did not load the page in 30 s');
  await sleep(1500);
  return child;
}

async function frontTextEdit() {
  for (let i = 0; i < 4; i++) {
    sh('open', ['-a', 'TextEdit', TEXT_DOC]);
    await sleep(1500);
    if (frontmost() === 'com.apple.TextEdit') break;
  }
  // The hosted display is 1024 x 768: Chrome at x 400 to 1020, TextEdit's window to its left, in front without covering it.
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

const KINDS = ['input', 'textarea', 'ce'];
const CELLS = [];
for (const kind of KINDS) CELLS.push({label: `chain/${kind}`, kind, chain: true});
for (const phase of ['pre', 'post']) for (const kind of KINDS) for (const route of ['focus', 'press']) for (const target of ['hit', 'editable'])
  CELLS.push({label: `${phase}/${kind}/${route}@${target}`, kind, phase, route, target});
for (const phase of ['pre', 'post']) for (const kind of KINDS) CELLS.push({label: `prior-${phase}/${kind}/focus@editable`, kind, phase, route: 'focus', target: 'editable', prior: true});
for (const kind of KINDS) CELLS.push({label: `prior-post/${kind}/press@editable`, kind, phase: 'post', route: 'press', target: 'editable', prior: true});
for (const phase of ['pre', 'post']) for (const kind of KINDS) for (const route of ['select', 'focus+select'])
  CELLS.push({label: `${phase}/${kind}/${route}@editable`, kind, phase, route, target: 'editable', select: true});
for (const kind of KINDS) CELLS.push({label: `place/${kind}/focus@editable`, kind, phase: 'post', route: 'focus', target: 'editable', place: true});
const RUN = CELLS.filter(c => !ONLY || ONLY.some(p => c.label.startsWith(p)));

async function cell(spec) {
  const {label, kind} = spec;
  const row = {label, kind, phase: spec.phase ?? null, route: spec.route ?? null, target: spec.target ?? null, prior: !!spec.prior};
  let chrome, engine;
  try {
    chrome = await launchChrome(label, spec.prior ? `?prior=${kind}` : '');
    row.chromePid = chrome.pid;
    row.layout = layoutData;
    const loadBeacon = beacons.find(b => b.ev === 'load');
    row.loadState = {active: loadBeacon.active, priorNote: loadBeacon.priorNote, caret: caret(loadBeacon, kind), sel: loadBeacon.sel};
    row.textEdit = await frontTextEdit();
    engine = await startEngine(label);
    const w = engine.wire;
    row.status = (await w.call('status')).result;
    row.ping = (await w.call('ping', {clientApiVersion: 'cua-engine-1'})).result ?? null;
    const shots = join(OUT, `shots-${fileName(label)}`);
    mkdirSync(shots, {recursive: true});
    const observedFrom = Date.now();
    const state = await w.execute('get_app_state', {pid: chrome.pid, includeScreenshot: true, outputDirectory: shots});
    const observedAt = Date.now();
    row.observationMs = observedAt - observedFrom;
    if (state.error) { row.problem = {getAppState: state.error}; return row; }
    const sky = state.result;
    row.observation = {chromium: sky.timings?.chromium, webAreaFound: sky.timings?.webAreaFound, enabled: sky.timings?.enabled ?? null,
      enablementPrior: sky.timings?.enablementPrior ?? null, enablementWrite: sky.timings?.enablementWrite ?? null};
    const webArea = sky.nodes.find(n => n.role === 'AXWebArea' && /probe283/.test(`${n.title ?? ''} ${n.description ?? ''}`)) ?? sky.nodes.find(n => n.role === 'AXWebArea');
    if (!webArea?.frame) { row.problem = 'no AXWebArea node with a frame'; return row; }
    const o = webArea.frame, f = layoutData.fields[kind];
    const P1 = {x: o.x + f.p1.x, y: o.y + f.p1.y}, P2 = {x: o.x + f.p2.x, y: o.y + f.p2.y};
    row.points = {webArea: o, p1: P1, p2: P2, k1: f.k1, k2: f.k2, length: f.length, prior: spec.prior ? f.prior : null};
    // The field's own node in the observation, to check the client-to-screen mapping.
    const label_ = {input: 'Probe input', textarea: 'Probe notes', ce: 'Probe editor'}[kind];
    const fieldNode = sky.nodes.find(n => [n.title, n.description].includes(label_));
    row.fieldNode = fieldNode ? {role: fieldNode.role, subrole: fieldNode.subrole, actions: fieldNode.actions, frame: fieldNode.frame,
      mappingError: fieldNode.frame ? {dx: fieldNode.frame.x - (o.x + f.rect.x), dy: fieldNode.frame.y - (o.y + f.rect.y)} : null} : null;
    const expect = [{name: 'k1', offset: f.k1, x: P1.x, y: P1.y}, {name: 'k2', offset: f.k2, x: P2.x, y: P2.y}];

    if (spec.chain) {
      row.chainNow = await ax(['act', String(chrome.pid), String(P1.x), String(P1.y), JSON.stringify({route: 'none', dump: 'before', expect})]);
      row.chainNowAfterObservationMs = row.chainNow.hitAtMs - observedAt;
      const wait = observedAt + 3000 - Date.now(); if (wait > 0) await sleep(wait);
      row.chainLater = await ax(['act', String(chrome.pid), String(P1.x), String(P1.y), JSON.stringify({route: 'none', dump: 'before', expect})]);
      row.chainLaterAfterObservationMs = row.chainLater.hitAtMs - observedAt;
      row.pageDelta = pointerDelta(beacons[0], latest());
      row.frontAfter = frontmost();
      return row;
    }

    if (spec.phase === 'post') { const wait = observedAt + 3000 - Date.now(); if (wait > 0) await sleep(wait); }
    row.frontBefore = frontmost();
    const before = latest();
    row.before = {active: before?.active, hasFocus: before?.hasFocus, caret: caret(before, kind)};
    const place = spec.place ? [{kind: 'known', x: P1.x, y: P1.y, expect: f.k1}, {kind: 'bounds', x: P2.x, y: P2.y, expect: f.k2},
      {kind: 'bounds-hit', x: P1.x, y: P1.y, expect: f.k1}, {kind: 'range', x: P2.x, y: P2.y, expect: f.k2},
      {kind: 'marker', x: P1.x, y: P1.y, expect: f.k1}] : [];
    const act = await ax(['act', String(chrome.pid), String(P1.x), String(P1.y),
      JSON.stringify({route: spec.route, target: spec.target, pollMs: spec.phase === 'pre' ? 3500 : 1500, dump: 'after', place, placeDelayMs: 600, expect, selectLoc: f.k1})]);
    row.act = act;
    const writeAt = act.writes?.[0]?.atMs;
    row.writeAfterObservationMs = writeAt ? writeAt - observedAt : null;
    await sleep(700);
    row.frontAfterWrite = frontmost();
    // The page's view: the first focus event on the field after the write, and the field's state after the write's poll
    // (before any placement).
    const focusEv = beacons.find(b => b.ev === `focus:${kind}` && b.t >= (writeAt ?? 0) - 5);
    const activeEv = beacons.find(b => b.ev === 'active' && b.to === `field-${kind}` && b.t >= (writeAt ?? 0) - 5);
    const anyFocus = beacons.filter(b => b.ev?.startsWith('focus:') && b.t >= (writeAt ?? 0) - 5).map(b => ({ev: b.ev, dt: b.t - writeAt}));
    const firstPlace = act.place?.[0]?.writeAtMs;
    const settled = firstPlace ? at(firstPlace - 1) : latest();
    row.focus = {activeChangeMs: activeEv ? activeEv.t - writeAt : null, event: focusEv ? {dtMs: focusEv.t - writeAt, caretAtEvent: caret(focusEv, kind)} : null, anyFocusEvents: anyFocus,
      active: settled?.active, hasFocus: settled?.hasFocus, caret: caret(settled, kind),
      landing: classify(caret(settled, kind), f, spec.prior ? f.prior : null),
      axFocusedFirstMs: act.poll?.find(p => p.focused === true)?.t ?? null, axAppFocusFirstMs: act.poll?.find(p => p.appFocusIsTarget)?.t ?? null,
      axPressFirstMs: act.poll?.find(p => p.press)?.t ?? null};
    row.placeResults = (act.place ?? []).map((s, i) => {
      const b = at(s.endMs);
      return {kind: s.kind, expect: s.expect, wrote: s.writeLoc ?? null, ax: s.scan ?? s.rangeForPosition ?? (s.markerSource ? {source: s.markerSource, tries: s.markerTries, index: s.indexForTextMarker, element: s.markerElement} : null),
        writes: s.writes ?? s.writeError ?? null,
        axSelectedAfter: s.selectedAfter, page: caret(b, kind), pageLanding: classify(caret(b, kind), f, null), bounds: s.bounds ?? null};
    });
    row.orderWrite = {before: act.orderBefore, after: act.orderAfter};
    row.pageDeltaWrite = pointerDelta(before, latest());

    // The follow-up type_text, shared mode.
    const beforeType = latest();
    row.beforeType = {caret: caret(beforeType, kind), active: beforeType?.active, value: beforeType?.values?.[kind]};
    row.type = lean(await w.execute('type_text', {pid: chrome.pid, text: MARK}));
    await sleep(1500);
    const afterType = latest();
    const value = afterType?.values?.[kind] ?? '';
    row.afterType = {value, markAt: value.indexOf(MARK), caret: caret(afterType, kind), active: afterType?.active, hasFocus: afterType?.hasFocus,
      pageDelta: pointerDelta(beforeType, afterType), otherFieldsChanged: KINDS.filter(k => k !== kind && afterType?.values?.[k] !== beacons[0]?.values?.[k])};
    row.frontAfterType = frontmost();
    row.orderAfterType = await ax(['order', String(chrome.pid)]);
    row.pageDeltaAll = pointerDelta(before, afterType);
    row.events = beacons.filter(b => b.ev !== 'tick' && b.t >= (writeAt ?? 0) - 5).map(b => ({dt: b.t - writeAt, ev: b.ev, target: b.target, key: b.key, trusted: b.trusted, to: b.to, active: b.active, caret: caret(b, kind)}));
    try { await w.call('shutdown', {}, 5000); } catch {}
    w.close();
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 3000);
  } finally {
    if (engine) { row.engineStderr = engine.stderr().slice(-2000); if (engine.child.exitCode === null) engine.child.kill('SIGKILL'); }
    if (chrome && chrome.exitCode === null) { chrome.kill('SIGTERM'); await sleep(2000); if (chrome.exitCode === null) chrome.kill('SIGKILL'); }
    await sleep(1000);
  }
  return row;
}

const chainLine = ch => (ch ?? []).map(l => `${l.role}${l.subrole ? '/' + l.subrole : ''}${l.isHitEditableAncestor ? '[E]' : ''}${l.isHitFocusableAncestor ? '[F]' : ''}${l.settableWatched?.AXFocused === true ? '[f]' : ''}`).join(' > ');
function summary(row) {
  if (row.exception || row.problem) return `PROBLEM ${JSON.stringify(row.problem ?? '')} ${row.exception ?? ''}`;
  if (row.chainNow) return `chain now(+${row.chainNowAfterObservationMs}ms) ${chainLine(row.chainNow.chainBefore)} | later(+${row.chainLaterAfterObservationMs}ms) ${chainLine(row.chainLater.chainBefore)} | expect ${JSON.stringify(row.chainLater.expect?.map(e => [e.name, e.containsPoint, e.rangeForPosition]))} mapping ${JSON.stringify(row.fieldNode?.mappingError)}`;
  const a = row.act ?? {};
  const typed = row.type?.error ? `error ${row.type.error.errorName ?? row.type.error.code}` : `ok route=${row.type?.result?.meta?.inputRoute}`;
  return [`write +${row.writeAfterObservationMs}ms hit=${a.hit?.role}#${a.hit?.dom} target=${a.target?.role}#${a.target?.dom} isHit=${a.target?.isHit} hitActions=${JSON.stringify(a.hit?.actions)}`,
    `errors=${JSON.stringify(a.writes?.map(x => x.error))} pageFocus=${row.focus?.event ? row.focus.event.dtMs + 'ms' : 'none'} active@${row.focus?.activeChangeMs} active=${row.focus?.active} landing=${row.focus?.landing} axFocused@${row.focus?.axFocusedFirstMs} appFocus@${row.focus?.axAppFocusFirstMs} press@${row.focus?.axPressFirstMs}`,
    `front ${row.frontBefore} -> ${row.frontAfterWrite} -> ${row.frontAfterType}; order chrome ${a.orderBefore?.pidIndex}->${a.orderAfter?.pidIndex} textEdit ${a.orderBefore?.textEditIndex}->${a.orderAfter?.textEditIndex}; pointer ${JSON.stringify(row.pageDeltaWrite)}`,
    row.placeResults?.length ? `place ${JSON.stringify(row.placeResults.map(p => [p.kind, p.expect, p.wrote, p.ax, p.writes, p.pageLanding, p.bounds?.containsPoint]))}` : null,
    `type ${typed} markAt=${row.afterType?.markAt} value=${JSON.stringify(row.afterType?.value)} delta=${JSON.stringify(row.afterType?.pageDelta)} others=${JSON.stringify(row.afterType?.otherFieldsChanged)}`].filter(Boolean).join('\n    ');
}

const config = {
  imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, runnerName: process.env.RUNNER_NAME ?? null,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), chrome: sh(CFT, ['--version']).out,
  engine: ENGINE, engineCommit: process.env.P283_ENGINE_COMMIT ?? null, probeCommit: process.env.GITHUB_SHA ?? null, rep: process.env.P283_REP ?? null,
  inputSource: sh('defaults', ['read', 'com.apple.HIToolbox', 'AppleSelectedInputSources']).out.replace(/\s+/g, ' ').slice(0, 300),
};
log('config', JSON.stringify(config));
const rows = [];
for (const spec of RUN) {
  const row = await cell(spec);
  rows.push(row);
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, cells: rows}, null, 1));
  log(`${row.label}: textEdit=${row.textEdit?.front} load=${JSON.stringify(row.loadState?.caret)} ${row.loadState?.priorNote ? JSON.stringify(row.loadState.priorNote) : ''}\n    ${summary(row)}`);
}
server.close();
process.exit(0);
