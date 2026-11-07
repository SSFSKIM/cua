// #313's hosted A/B, the web cells: on one engine head (--engine), an element click by token on a page's textarea, text
// field, button and checkbox in a background browser behind a frontmost TextEdit, in shared and dedicated mode; for the
// two text targets a type_text of a marker after it. The browser is P287_BROWSER's (scripts/probe-287/browser.mjs).
//
// Each cell, on a fresh browser, engine process and connection: get_app_state; the AX read at the target's centre
// (ax.swift at: its actions, AXFocused and whether it is settable, AXDOMClassList); 1 s after the observation the click
// by token; the AX read again (the field's AXFocused, the app's focused element, the window order); the page's counters
// 2.5 s after; then type_text and the field's value 1.5 s after; a later observation's focused node.
//
//   node scripts/probe-313/web.mjs --engine <cua-engine> --ax <ax> --out <dir> [--cells <prefix,…>]
//
// Runs only on a GitHub-hosted runner: it launches and kills its own browser and TextEdit and moves TextEdit's window.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {CHROME, BROWSER, launchOther, browserVersion} from '../probe-287/browser.mjs';
import {sleep, sh, fileName, frontmost, lean, centre, startEngine, stopEngine, frontTextEdit, axTool, answer, config, writeResults} from './lib.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-313 web: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), ENGINE = arg('engine'), AX = arg('ax');
const ONLY = arg('cells')?.split(',');
if (!OUT || !ENGINE || !AX) { console.error('usage: web.mjs --engine <bin> --ax <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const ax = axTool(AX);
const log = (...a) => console.log('probe-313 web:', ...a);
const MARK = 'QZ';
// P313_FILLED=1: the textarea holds eight monospace lines, so a caret placed at its centre has a non-zero offset the
// page can predict (expectedOffset: the line and column under the centre, from the font's measured width).
// P313_FILLED=top: two short lines at its top only, so the hit at its centre is the textarea itself, not its text (a
// filled textarea's centre hits its AXStaticText, and the click goes by the synthesized path); the point lies below
// the text (expected.outside).
const FILLED = ['1', 'top'].includes(process.env.P313_FILLED);
const LINES = process.env.P313_FILLED === 'top' ? ['first line', 'second line']
  : Array.from({length: 8}, (_, i) => `line${i} ` + 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWX'.slice(0, 54));
const NOTES = FILLED ? `<textarea id="notes" aria-label="Probe notes" spellcheck="false" wrap="off" style="font:16px/20px Menlo,monospace;padding:4px;border:1px solid #888;width:480px;height:160px;resize:none;overflow:hidden;white-space:pre">${LINES.join('\n')}</textarea>`
  : '<textarea id="notes" aria-label="Probe notes" rows="8" cols="60" spellcheck="false"></textarea>';

// #282's page with a text field beside the textarea; the beacons carry both fields' values.
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe313 page</title></head>
<body><p><b>probe313 page</b></p><p><label><input id="option" type="checkbox"> Probe option</label> <button id="apply" type="button">Apply</button></p>
<p><input id="field" type="text" aria-label="Probe field" size="40" spellcheck="false" autocomplete="off" value="alpha"></p>
<p>${NOTES}</p><p id="status">Ready</p>
<script>(() => { const c = {pointerdown: 0, mousedown: 0, mouseup: 0, click: 0, textFocus: 0, fieldFocus: 0, input: 0, keydown: 0, optionChange: 0, applyClick: 0, windowFocus: 0, windowBlur: 0};
let seq = 0; const load = Math.random().toString(36).slice(2, 10);
const notes = document.getElementById('notes'), field = document.getElementById('field'), option = document.getElementById('option'), apply = document.getElementById('apply');
const expected = () => { const cs = getComputedStyle(notes); const cx = document.createElement('canvas').getContext('2d'); cx.font = cs.font;
  const cw = cx.measureText('abcdefghij').width / 10, lh = parseFloat(cs.lineHeight), pl = parseFloat(cs.paddingLeft) + notes.clientLeft, pt = parseFloat(cs.paddingTop) + notes.clientTop;
  const lines = notes.value.split('\\n'); const raw = Math.floor((notes.offsetHeight / 2 - pt) / lh); if (raw >= lines.length) return {outside: true, line: raw, length: notes.value.length}; const line = raw;
  const col = Math.min(lines[line].length, Math.round((notes.offsetWidth / 2 - pl) / cw)); return {line, col, offset: lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0) + col}; };
const send = () => { seq += 1; navigator.sendBeacon('/counters', JSON.stringify({load, seq, counts: c, checked: option.checked, notes: notes.value, field: field.value, notesSel: [notes.selectionStart, notes.selectionEnd], fieldSel: [field.selectionStart, field.selectionEnd], expected: expected(), focused: document.hasFocus(), active: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null})); };
for (const k of ['pointerdown', 'mousedown', 'mouseup', 'click', 'input', 'keydown']) document.addEventListener(k, () => { c[k] += 1; send(); }, true);
document.addEventListener('selectionchange', () => send());
for (const el of [notes, field]) el.addEventListener('select', () => send());
notes.addEventListener('focus', () => { c.textFocus += 1; send(); });
field.addEventListener('focus', () => { c.fieldFocus += 1; send(); });
option.addEventListener('change', () => { c.optionChange += 1; send(); });
apply.addEventListener('click', () => { c.applyClick += 1; send(); });
window.addEventListener('focus', e => { if (e.target === window) { c.windowFocus += 1; send(); } });
window.addEventListener('blur', e => { if (e.target === window) { c.windowBlur += 1; send(); } });
addEventListener('load', () => { navigator.sendBeacon('/ready'); send(); }); })();</script></body></html>`;

let latest = null, ready = false, loads = 0;
const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') { loads += 1; res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(PAGE); return; }
  let body = '';
  req.on('data', d => { body += d; if (body.length > 8192) req.destroy(); });
  req.on('end', () => {
    if (req.url === '/ready') ready = true;
    if (req.url === '/counters') { try { const r = JSON.parse(body); if (!latest || r.load !== latest.load || r.seq >= latest.seq) latest = r; } catch {} }
    res.writeHead(204); res.end();
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;
const COUNTS = ['pointerdown', 'mousedown', 'mouseup', 'click', 'textFocus', 'fieldFocus', 'input', 'keydown', 'optionChange', 'applyClick', 'windowFocus', 'windowBlur'];
const counters = () => (latest ? {load: latest.load, ...latest.counts, checked: latest.checked, notes: latest.notes, field: latest.field, notesSel: latest.notesSel, fieldSel: latest.fieldSel, expected: latest.expected, focused: latest.focused, active: latest.active, loads} : {loads});
const delta = (before, after) => Object.fromEntries([...COUNTS.map(k => [k, (after[k] ?? 0) - (after.load === before.load ? before[k] ?? 0 : 0)]), ['loads', after.loads - before.loads]]);

const TEXT_DOC = join(OUT, 'front.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window during each click.\n');

async function launchBrowser(label) {
  ready = false; latest = null;
  const child = BROWSER !== 'chrome' ? await launchOther(URL_, join(OUT, `profile-${fileName(label)}`)) : spawn(CHROME, [`--user-data-dir=${join(OUT, `chrome-${fileName(label)}`)}`, '--no-first-run', '--no-default-browser-check',
    '--disable-search-engine-choice-screen', '--window-position=400,30', '--window-size=620,720', URL_], {stdio: 'ignore'});
  for (let i = 0; i < 120 && !ready; i++) await sleep(250);
  if (!ready) throw new Error(`${BROWSER} did not load the page in 30 s`);
  await sleep(1500);
  return child;
}

const TARGETS = {
  textarea: n => n.role === 'AXTextArea',
  // The page's field, not a browser's own address field (an AXTextField too): its label or its value.
  field: n => n.role === 'AXTextField' && (/Probe field/.test(`${n.title ?? ''} ${n.description ?? ''} ${n.help ?? ''}`) || n.value === 'alpha'),
  button: n => n.role === 'AXButton' && n.title === 'Apply',
  checkbox: n => n.role === 'AXCheckBox',
};
const TEXT = {textarea: 'notes', field: 'field'};
const CELLS = [];
for (const desktop of ['shared', 'dedicated']) for (const target of Object.keys(TARGETS)) CELLS.push({label: `${desktop}/${target}`, desktop, target});
const RUN = CELLS.filter(c => !ONLY || ONLY.some(p => c.label.startsWith(p)));

async function cell(spec) {
  const row = {label: spec.label, desktop: spec.desktop, target: spec.target};
  let browser, engine;
  try {
    browser = await launchBrowser(spec.label);
    row.browserPid = browser.pid;
    row.textEdit = await frontTextEdit(TEXT_DOC);
    engine = await startEngine(ENGINE, join(OUT, 's'), spec.label);
    const w = engine.wire;
    row.ping = (await w.call('ping', spec.desktop === 'dedicated' ? {clientApiVersion: 'cua-engine-1', desktop: 'dedicated'} : {clientApiVersion: 'cua-engine-1'})).result ?? null;
    const shots = join(OUT, `shots-${fileName(spec.label)}`);
    mkdirSync(shots, {recursive: true});
    const state = await w.execute('get_app_state', {pid: browser.pid, includeScreenshot: true, outputDirectory: shots});
    const observedAt = Date.now();
    if (state.error) { row.problem = {getAppState: state.error}; return row; }
    const sky = state.result;
    writeFileSync(join(OUT, `skyshot-${fileName(spec.label)}.json`), JSON.stringify(sky, null, 1));
    const node = sky.nodes.find(TARGETS[spec.target]);
    if (!node?.frame) { row.problem = `no ${spec.target} node with a frame`; row.roles = [...new Set(sky.nodes.map(n => n.role))]; return row; }
    const p = centre(node.frame);
    row.targetNode = {role: node.role, title: node.title, actions: node.actions, frame: node.frame};
    row.axBefore = ax.at(browser.pid, p);
    const wait = observedAt + 1000 - Date.now();
    if (wait > 0) await sleep(wait);
    row.frontBefore = frontmost();
    row.before = counters();
    const started = Date.now();
    const click = await w.execute('click', {pid: browser.pid, element: node.token}, {lineage: sky.lineage});
    row.clickMs = Date.now() - started;
    row.click = lean(click);
    row.answer = answer(click);
    row.axAfter = ax.at(browser.pid, p);
    await sleep(2500);
    row.after = counters();
    row.delta = delta(row.before, row.after);
    row.frontAfter = frontmost();
    row.axAfter2500 = ax.focus(browser.pid);
    sh('screencapture', ['-x', join(OUT, `screen-${fileName(spec.label)}.png`)]);
    if (TEXT[spec.target]) {
      const typed = await w.execute('type_text', {pid: browser.pid, text: MARK});
      row.typed = {answer: answer(typed), response: lean(typed)};
      await sleep(1500);
      const now = counters();
      row.typed.notes = now.notes; row.typed.field = now.field; row.typed.active = now.active;
      // Where the marker went against the selection the click left (row.after) and the page's prediction for the point.
      const value = now[TEXT[spec.target]] ?? '', at = value.indexOf(MARK), sel = row.after?.[`${TEXT[spec.target]}Sel`] ?? null;
      row.typed.markAt = at; row.typed.selectionAfterClick = sel; row.typed.expected = spec.target === 'textarea' ? row.after?.expected ?? null : null;
      row.typed.atSelection = sel ? at === sel[0] : null;
      row.typed.landedInTarget = (now[TEXT[spec.target]] ?? '').includes(MARK);
      row.typed.landedElsewhere = Object.entries(TEXT).some(([t, k]) => t !== spec.target && (now[k] ?? '').includes(MARK));
      row.typed.frontAfter = frontmost();
      row.typed.order = ax.focus(browser.pid).order;
    }
    const later = await w.execute('get_app_state', {pid: browser.pid});
    const f = later.result?.nodes?.find(n => n.token === later.result.focused);
    row.focusedAfter = f ? {role: f.role, title: f.title, description: f.description} : (later.error ?? later.result?.focused ?? null);
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 3000);
  } finally {
    row.engineStderr = await stopEngine(engine);
    if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await sleep(2000); if (browser.exitCode === null) browser.kill('SIGKILL'); }
    await sleep(1000);
  }
  return row;
}

const cfg = config({browser: BROWSER, browserVersion: browserVersion(), engine: ENGINE});
log('config', JSON.stringify(cfg));
const rows = [];
for (const spec of RUN) {
  const row = await cell(spec);
  rows.push(row);
  writeResults(OUT, cfg, rows);
  const a = row.answer ?? {};
  log(`${row.label}: ${a.answer ?? 'no click'} route=${a.route} elementClick=${JSON.stringify(a.elementClick)} front ${row.frontBefore} -> ${row.frontAfter}`);
  log(`${row.label}: axBefore actions=${JSON.stringify(row.axBefore?.actions)} focused=${row.axBefore?.focusedValue} settable=${row.axBefore?.focusedSettable} domClassList=${row.axBefore?.listsDomClassList}; axAfter focused=${row.axAfter?.focusedValue} appFocused=${JSON.stringify(row.axAfter?.appFocused)} order=${JSON.stringify(row.axAfter?.order)}`);
  if (row.delta) log(`${row.label}: delta ${JSON.stringify(row.delta)} active=${row.after?.active} focusedAfter=${JSON.stringify(row.focusedAfter)}`);
  if (row.typed) log(`${row.label}: typed ${row.typed.answer?.answer} inTarget=${row.typed.landedInTarget} elsewhere=${row.typed.landedElsewhere} notes=${JSON.stringify(row.typed.notes)} field=${JSON.stringify(row.typed.field)} front=${row.typed.frontAfter}`);
  if (row.exception || row.problem) log(`${row.label}: PROBLEM ${JSON.stringify(row.problem ?? '')} ${row.exception ?? ''}`);
}
server.close();
process.exit(0);
