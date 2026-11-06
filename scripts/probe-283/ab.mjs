// #283's live A/B on a GitHub-hosted macOS runner: cua's own engine, origin/main's against fix/283-web-text-focus's,
// a shared-mode coordinate click (`click {pid, x, y}` in screenshot pixels, as probe-282's) into a background Chrome for
// Testing page's text fields behind a frontmost TextEdit, then type_text of a marker.
//
// The page: an <input>, a <textarea>, a one-node contenteditable (ce), round 2's multi-node contenteditable (mce: plain
// text, a <b>, a <br>, a <span>) and a password <input>. Its beacons carry pointer, mouse, key and input counts, each
// field's selection (input, textarea and password: selectionStart/End; ce and mce: the Selection as an offset in the
// region's own space, a <br> one character, and for mce its text node and offset), the active element, and the values,
// except the password's, of which only its length is ever sent.
//
// Cells, each on a fresh Chrome, engine and connection: main and the branch, each clicking about 0.1 s after the first
// observation (fresh: boxes empty) and 3 s after it, on input, textarea, ce, mce at t1 (2nd text node) and t2 (3rd,
// after the <br>), the password field, and an input whose selection the page set on load (prior); and the branch alone,
// 3 s after, on a point past a textarea line's end and on a point in the input's left padding.
//
//   node scripts/probe-283/ab.mjs --main <cua-engine> --branch <cua-engine> --ax <ax> --out <dir> [--cells <prefix,…>]
//
// Runs only on a GitHub-hosted runner: it launches and kills its own Chrome and TextEdit and moves TextEdit's window.
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-283 ab: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), MAIN = arg('main'), BRANCH = arg('branch'), AX = arg('ax');
const ONLY = arg('cells') ? arg('cells').split(',') : null;
if (!OUT || !MAIN || !BRANCH || !AX) { console.error('usage: ab.mjs --main <bin> --branch <bin> --ax <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-283 ab:', ...a);
const MARK = 'QZ';

const INPUT = 'alpha bravo charlie delta echo foxtrot';
const LINES = ['first line of the notes', 'second line holds more words', 'third line sits below', 'fourth and final line'];
const CE = 'golf hotel india juliet kilo lima mike';
const MCE_HTML = 'alpha bravo <b>charlie delta</b><br>echo foxtrot <span>golf hotel</span> india';
const PW = 'pwdummy1';  // a dummy; the page sends only its length
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe283 ab page</title>
<style>body{margin:8px;font:14px sans-serif}.f{font:16px/20px Menlo,monospace;padding:4px 6px;border:1px solid #888;margin:6px 0;display:block;letter-spacing:0;width:460px}
#field-input,#field-pw{height:20px}#field-textarea{height:80px;resize:none;overflow:hidden;white-space:pre}#field-ce{height:20px;white-space:pre;outline:none}#field-mce{outline:none;white-space:normal}</style></head>
<body><p><b>probe283 ab page</b></p>
<input id="field-input" class="f" type="text" aria-label="Probe input" spellcheck="false" autocomplete="off" value="${INPUT}">
<textarea id="field-textarea" class="f" aria-label="Probe notes" spellcheck="false" wrap="off" rows="4">${LINES.join('\n')}</textarea>
<div id="field-ce" class="f" contenteditable="true" aria-label="Probe editor" spellcheck="false">${CE}</div>
<div id="field-mce" class="f" contenteditable="true" aria-label="Probe multi editor" spellcheck="false">${MCE_HTML}</div>
<input id="field-pw" class="f" type="password" aria-label="Probe password" autocomplete="off" value="${PW}">
<script>(() => {
const prior = new URLSearchParams(location.search).get('prior');
const load = Math.random().toString(36).slice(2, 10);
const I = document.getElementById('field-input'), T = document.getElementById('field-textarea'), C = document.getElementById('field-ce'),
  M = document.getElementById('field-mce'), W = document.getElementById('field-pw');
const c = {pointerdown: 0, pointerup: 0, mousedown: 0, mouseup: 0, click: 0, pointermove: 0, mousemove: 0, keydown: 0, input: 0, selectionchange: 0};
let seq = 0;
const texts = el => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const a = []; while (w.nextNode()) a.push(w.currentNode); return a; };
// An offset in a region's own space as Chromium's AXValue spells it: its text, one character for each <br>.
const flat = (el, node, off) => { const r = document.createRange(); r.setStart(el, 0); r.setEnd(node, off); const f = r.cloneContents(); return f.textContent.length + f.querySelectorAll('br').length; };
const where = (el, node, off) => { if (!node || !(node === el || el.contains(node))) return null; const idx = texts(el).indexOf(node); return {idx, off, node: idx < 0 ? node.nodeName : undefined, flat: flat(el, node, off)}; };
const markIn = el => { const t = texts(el); for (let i = 0; i < t.length; i++) { const j = t[i].data.indexOf('QZ'); if (j >= 0) return {idx: i, off: j, flat: flat(el, t[i], j)}; } return null; };
const state = (ev, extra) => { const s = getSelection(); return {load, seq: ++seq, t: Date.now(), ev, ...extra, counts: {...c},
  active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null, hasFocus: document.hasFocus(),
  sel: {input: [I.selectionStart, I.selectionEnd], textarea: [T.selectionStart, T.selectionEnd], pw: [W.selectionStart, W.selectionEnd],
    ce: {anchor: where(C, s.anchorNode, s.anchorOffset), focus: where(C, s.focusNode, s.focusOffset)},
    mce: {anchor: where(M, s.anchorNode, s.anchorOffset), focus: where(M, s.focusNode, s.focusOffset)}},
  values: {input: I.value, textarea: T.value, ce: C.textContent, mce: texts(M).map(x => x.data)}, pwLength: W.value.length,
  mark: {input: I.value.indexOf('QZ'), textarea: T.value.indexOf('QZ'), ce: markIn(C), mce: markIn(M)}}; };
const send = (ev, extra) => navigator.sendBeacon('/b', JSON.stringify(state(ev, extra)));
for (const k of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'pointermove', 'mousemove', 'keydown', 'input'])
  document.addEventListener(k, e => { c[k] += 1; if (!k.endsWith('move')) send(k, {trusted: e.isTrusted, target: e.target.id || e.target.tagName}); }, true);
document.addEventListener('selectionchange', () => { c.selectionchange += 1; send('selectionchange'); }, true);
const lines = T.value.split('\\n');
const taOffset = (line, col) => lines.slice(0, line).reduce((a, l) => a + l.length + 1, 0) + col;
const layout = () => {
  const ctx = document.createElement('canvas').getContext('2d'); ctx.font = '16px Menlo, monospace';
  const cw = ctx.measureText('MMMMMMMMMM').width / 10;
  const box = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return {r, l: r.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft), t: r.top + parseFloat(s.borderTopWidth) + parseFloat(s.paddingTop), lh: parseFloat(s.lineHeight), bl: r.left + parseFloat(s.borderLeftWidth), pl: parseFloat(s.paddingLeft)}; };
  const pt = (node, k) => { const r = document.createRange(); r.setStart(node, k); r.setEnd(node, k + 1); const b = r.getBoundingClientRect(); return {x: b.left + 0.3 * b.width, y: b.top + b.height / 2}; };
  const bi = box(I), bt = box(T), bw = box(W), mt = texts(M);
  return {cw, targets: {
    input: {field: 'input', p: {x: bi.l + 14.3 * cw, y: bi.r.top + bi.r.height / 2}, expect: 14, length: I.value.length},
    textarea: {field: 'textarea', p: {x: bt.l + 14.3 * cw, y: bt.t + 1.5 * bt.lh}, expect: taOffset(1, 14), length: T.value.length},
    ce: {field: 'ce', p: pt(C.firstChild, 19), expect: 19, length: C.textContent.length},
    'mce-t1': {field: 'mce', p: pt(mt[1], 3), expect: flat(M, mt[1], 3), node: {idx: 1, off: 3}},
    'mce-t2': {field: 'mce', p: pt(mt[2], 7), expect: flat(M, mt[2], 7), node: {idx: 2, off: 7}},
    pw: {field: 'pw', p: {x: bw.l + 3.3 * cw, y: bw.r.top + bw.r.height / 2}, expect: null, secure: true},
    prior: {field: 'input', p: {x: bi.l + 14.3 * cw, y: bi.r.top + bi.r.height / 2}, expect: 14, prior: 6},
    // Past line 1's end (its 28 characters), in the textarea: the end of that line, before its break.
    'past-end': {field: 'textarea', p: {x: bt.l + 40.3 * cw, y: bt.t + 1.5 * bt.lh}, expect: taOffset(1, lines[1].length)},
    // In the input's left padding, left of its first character: in no box, past no line end.
    padding: {field: 'input', p: {x: bi.bl + 0.4 * bi.pl, y: bi.r.top + bi.r.height / 2}, expect: null, notPlaced: 'pointOutsideText'}}};
};
addEventListener('load', () => {
  if (prior === 'input') I.setSelectionRange(6, 6);
  document.fonts.ready.then(() => { navigator.sendBeacon('/layout', JSON.stringify(layout())); send('load', {prior}); });
  setInterval(() => send('tick'), 250);
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
const ax = args => new Promise(resolve => {
  const child = spawn(AX, args, {stdio: ['ignore', 'pipe', 'pipe']});
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.on('close', code => { try { resolve(JSON.parse(out)); } catch { resolve({status: code, out: out.slice(0, 500)}); } });
});
const frontmost = () => {
  const asn = sh('lsappinfo', ['front']).out;
  const info = sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out;
  return (info.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] || info || null;
};
const osa = script => sh('osascript', ['-e', script]);
const lean = response => JSON.parse(JSON.stringify(response, (k, v) => (k === 'nodes' || k === 'menuBar' ? `[${Array.isArray(v) ? v.length : '?'} omitted]` : v)));
const latest = () => beacons[beacons.length - 1] ?? null;
const COUNT_KEYS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'pointermove', 'mousemove', 'keydown', 'input'];
const delta = (a, b) => Object.fromEntries(COUNT_KEYS.map(k => [k, (b?.counts?.[k] ?? 0) - (a?.counts?.[k] ?? 0)]));
const pointerTotal = d => ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'pointermove', 'mousemove'].reduce((s, k) => s + (d[k] ?? 0), 0);
// A field's caret as the page has it: a collapsed offset in the field's own space, or the range.
const caretOf = (b, field) => {
  const s = b?.sel?.[field];
  if (!s) return null;
  if (Array.isArray(s)) return {start: s[0], end: s[1]};
  return {start: s.anchor?.flat ?? null, end: s.focus?.flat ?? null, node: s.anchor ? {idx: s.anchor.idx, off: s.anchor.off} : null};
};

const TEXT_DOC = join(OUT, 'front.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window during each click.\n');
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
  const place = osa('tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {0, 40}\nset size of window 1 to {380, 300}\nend tell\nend tell');
  await sleep(500);
  return {front: frontmost(), placeStatus: place.status};
}
async function startEngine(bin, label) {
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

const TARGETS = ['input', 'textarea', 'ce', 'mce-t1', 'mce-t2', 'pw', 'prior'];
const CELLS = [];
for (const engine of ['main', 'branch']) for (const timing of ['fresh', 'late']) for (const target of TARGETS)
  CELLS.push({label: `${engine}/${timing}/${target}`, engine, timing, target});
for (const target of ['past-end', 'padding']) CELLS.push({label: `branch/late/${target}`, engine: 'branch', timing: 'late', target});
const RUN = CELLS.filter(c => !ONLY || ONLY.some(p => c.label.startsWith(p)));

async function cell(spec) {
  const row = {label: spec.label, engine: spec.engine, timing: spec.timing, target: spec.target};
  let chrome, engine;
  try {
    chrome = await launchChrome(spec.label, spec.target === 'prior' ? '?prior=input' : '');
    row.chromePid = chrome.pid;
    const t = layoutData.targets[spec.target];
    row.expected = {field: t.field, offset: t.expect, node: t.node ?? null, prior: t.prior ?? null, secure: !!t.secure, notPlaced: t.notPlaced ?? null};
    const load = beacons.find(b => b.ev === 'load');
    row.loadCaret = caretOf(load, t.field);
    row.textEdit = await frontTextEdit();
    engine = await startEngine(spec.engine === 'main' ? MAIN : BRANCH, spec.label);
    const w = engine.wire;
    row.status = (await w.call('status')).result;
    row.ping = (await w.call('ping', {clientApiVersion: 'cua-engine-1'})).result ?? null;
    const shots = join(OUT, `shots-${fileName(spec.label)}`);
    mkdirSync(shots, {recursive: true});
    const observedFrom = Date.now();
    const state = await w.execute('get_app_state', {pid: chrome.pid, includeScreenshot: true, outputDirectory: shots});
    const observedAt = Date.now();
    row.observationMs = observedAt - observedFrom;
    if (state.error) { row.problem = {getAppState: state.error}; return row; }
    const sky = state.result;
    row.observation = {enablementPrior: sky.timings?.enablementPrior ?? null, enablementWrite: sky.timings?.enablementWrite ?? null};
    const webArea = sky.nodes.find(n => n.role === 'AXWebArea' && /probe283/.test(`${n.title ?? ''} ${n.description ?? ''}`)) ?? sky.nodes.find(n => n.role === 'AXWebArea');
    if (!webArea?.frame) { row.problem = 'no AXWebArea node with a frame'; return row; }
    const wf = sky.window.frame, scale = sky.screenshot.width / wf.width;
    const screen = {x: webArea.frame.x + t.p.x, y: webArea.frame.y + t.p.y};
    const x = Math.round((screen.x - wf.x) * scale), y = Math.round((screen.y - wf.y) * scale);
    row.point = {screen, screenshotPixel: {x, y}, scale, window: wf, webArea: webArea.frame, clickScreen: {x: wf.x + x / scale, y: wf.y + y / scale}};
    const wait = observedAt + (spec.timing === 'fresh' ? 100 : 3000) - Date.now();
    if (wait > 0) await sleep(wait);
    row.orderBefore = await ax(['order', String(chrome.pid)]);
    row.frontBefore = frontmost();
    const before = latest();
    row.before = {active: before?.active, caret: caretOf(before, t.field)};
    const clickAt = Date.now();
    row.clickAfterObservationMs = clickAt - observedAt;
    row.click = lean(await w.execute('click', {pid: chrome.pid, x, y}));
    row.clickMs = Date.now() - clickAt;
    await sleep(800);
    row.frontAfterClick = frontmost();
    row.orderAfterClick = await ax(['order', String(chrome.pid)]);
    const afterClick = latest();
    const activeEv = beacons.find(b => b.ev === 'active' && b.t >= clickAt - 5);
    row.afterClick = {active: afterClick?.active, caret: caretOf(afterClick, t.field), focusAfterClickMs: activeEv ? activeEv.t - clickAt : null,
      focusTo: activeEv?.to ?? null, pointer: delta(before, afterClick)};
    const typeAt = Date.now();
    row.type = lean(await w.execute('type_text', {pid: chrome.pid, text: MARK}));
    row.typeMs = Date.now() - typeAt;
    await sleep(1500);
    const afterType = latest();
    row.frontAfterType = frontmost();
    row.afterType = {active: afterType?.active, caret: caretOf(afterType, t.field), pointer: delta(afterClick, afterType),
      mark: t.field === 'pw' ? null : afterType?.mark?.[t.field] ?? null,
      pwLengthBefore: before?.pwLength ?? null, pwLengthAfter: afterType?.pwLength ?? null,
      value: t.field === 'pw' ? '[password: length only]' : afterType?.values?.[t.field] ?? null,
      otherFieldsChanged: ['input', 'textarea', 'ce', 'mce'].filter(k => k !== t.field && JSON.stringify(afterType?.values?.[k]) !== JSON.stringify(load?.values?.[k])).concat(
        t.field !== 'pw' && afterType?.pwLength !== load?.pwLength ? ['pw'] : [])};
    row.pointerTotal = pointerTotal(delta(before, afterType));
    row.events = beacons.filter(b => b.ev !== 'tick' && b.t >= clickAt - 5).map(b => ({dt: b.t - clickAt, ev: b.ev, to: b.to, trusted: b.trusted, target: b.target}));
    row.verdict = verdict(row);
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

// The engine's answer against the page: what it claimed, what the page shows, and whether they agree.
function verdict(row) {
  const c = row.click, meta = c?.error ? c.error.meta : c?.result?.meta, ec = meta?.elementClick ?? null, e = row.expected;
  const answer = c?.error ? `error ${c.error.errorName ?? c.error.code}` : 'success';
  const caret = row.afterClick?.caret, focused = row.afterClick?.active === `field-${e.field}`;
  const placedClaim = ec?.reason === 'focusField' && ec?.caret === 'placed';
  const atExpected = e.offset != null && caret?.start === e.offset && caret?.end === e.offset;
  const typedAt = e.field === 'pw' ? (row.afterType?.pwLengthAfter - row.afterType?.pwLengthBefore === MARK.length ? 'pw+2' : 'pw unchanged')
    : (typeof row.afterType?.mark === 'number' ? row.afterType.mark : row.afterType?.mark?.flat ?? null);
  const problems = [];
  if (answer === 'success' && !focused) problems.push('success but the field is not focused');
  if (placedClaim && !atExpected) problems.push(`claims placed, page caret ${JSON.stringify(caret)} vs expected ${e.offset}`);
  if (answer === 'success' && ec?.reason === 'focusedNotPlaced' && atExpected && e.offset != null) problems.push('says not placed, yet the caret is at the point');
  if (row.pointerTotal) problems.push(`pointer/mouse events ${row.pointerTotal}`);
  if (row.frontAfterClick !== 'com.apple.TextEdit' || row.frontAfterType !== 'com.apple.TextEdit') problems.push('TextEdit not frontmost');
  if (answer !== 'success' && row.afterClick?.active?.startsWith('field-')) problems.push('an error, yet a field took focus');
  return {answer, reason: ec?.reason ?? null, caretClaim: ec?.caret ?? null, walk: ec?.walk ?? null, walkStopped: ec?.walkStopped ?? null,
    note: c?.result?.note ?? null, focused, pageCaret: caret, atExpected, typedAt, problems};
}

const config = {
  imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, runnerName: process.env.RUNNER_NAME ?? null,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), chrome: sh(CFT, ['--version']).out,
  mainEngine: MAIN, branchEngine: BRANCH, mainCommit: process.env.P283_MAIN_COMMIT ?? null, branchCommit: process.env.P283_BRANCH_COMMIT ?? null,
  probeCommit: process.env.GITHUB_SHA ?? null, rep: process.env.P283_REP ?? null,
};
log('config', JSON.stringify(config));
const rows = [];
for (const spec of RUN) {
  const row = await cell(spec);
  rows.push(row);
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, cells: rows}, null, 1));
  if (row.exception || row.problem) { log(`${row.label}: PROBLEM ${JSON.stringify(row.problem ?? '')} ${row.exception ?? ''}`); continue; }
  const v = row.verdict;
  log(`${row.label}: +${row.clickAfterObservationMs}ms ${v.answer} ${row.clickMs}ms reason=${v.reason} caret=${v.caretClaim} walk=${JSON.stringify(v.walk)} stopped=${v.walkStopped} | page active=${row.afterClick.active} caret=${JSON.stringify(v.pageCaret)} expected=${row.expected.offset} typed=${v.typedAt} pointer=${row.pointerTotal} front=${row.frontAfterClick}/${row.frontAfterType} order=${row.orderBefore?.pidIndex}${row.orderAfterClick?.pidIndex} ${v.problems.length ? 'PROBLEMS ' + JSON.stringify(v.problems) : 'ok'}`);
}
server.close();
process.exit(0);
