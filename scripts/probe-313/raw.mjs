// #313's hosted A/B, the raw AX cells (no engine action): which accessibility write focuses a page's field in a
// background browser behind a frontmost TextEdit, and which of them raises or activates the browser. Each cell, on a
// fresh browser: an observation by --engine for the field's frame, then scripts/probe-283/ax.swift `act` at the field's
// centre with one write (none, focus = AXFocused true, select = AXSelectedTextRange {0, 0}, press = AXPress), its poll
// of the field's AXFocused, the application's focused element and the front window's owner for 1.5 s, the window order
// before and after; the page's focus counters; and the frontmost app. Then a new engine process's type_text of a marker
// (type_text is unchanged by the fix): where it lands, and whether it raises the browser.
//
//   node scripts/probe-313/raw.mjs --engine <cua-engine> --ax283 <p283-ax> --out <dir>
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {CHROME, BROWSER, launchOther, browserVersion} from '../probe-287/browser.mjs';
import {sleep, sh, json, fileName, frontmost, centre, startEngine, stopEngine, frontTextEdit, config, writeResults} from './lib.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-313 raw: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), ENGINE = arg('engine'), AX = arg('ax283');
if (!OUT || !ENGINE || !AX) { console.error('usage: raw.mjs --engine <bin> --ax283 <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const log = (...a) => console.log('probe-313 raw:', ...a);

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe313 raw</title></head>
<body><p><b>probe313 raw</b></p><p><input id="field" type="text" aria-label="Probe field" size="40" value="alpha"></p>
<p><textarea id="notes" aria-label="Probe notes" rows="8" cols="60"></textarea></p>
<script>(() => { const c = {textFocus: 0, fieldFocus: 0, windowFocus: 0, pointerdown: 0}; let seq = 0;
const send = () => { seq += 1; navigator.sendBeacon('/counters', JSON.stringify({seq, counts: c, notes: document.getElementById('notes').value, field: document.getElementById('field').value, active: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null, focused: document.hasFocus()})); };
document.getElementById('notes').addEventListener('focus', () => { c.textFocus += 1; send(); });
document.getElementById('field').addEventListener('focus', () => { c.fieldFocus += 1; send(); });
document.addEventListener('pointerdown', () => { c.pointerdown += 1; send(); }, true);
document.addEventListener('input', () => send(), true);
window.addEventListener('focus', e => { if (e.target === window) { c.windowFocus += 1; send(); } });
addEventListener('load', () => { navigator.sendBeacon('/ready'); send(); }); })();</script></body></html>`;
let latest = null, ready = false;
const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') { res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(PAGE); return; }
  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', () => { if (req.url === '/ready') ready = true; if (req.url === '/counters') { try { const r = JSON.parse(body); if (!latest || r.seq >= latest.seq) latest = r; } catch {} } res.writeHead(204); res.end(); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;
const TEXT_DOC = join(OUT, 'front.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window during each write.\n');

const TARGETS = {textarea: n => n.role === 'AXTextArea', field: n => n.role === 'AXTextField' && (/Probe field/.test(`${n.title ?? ''} ${n.description ?? ''}`) || n.value === 'alpha')};
const CELLS = [];
for (const target of Object.keys(TARGETS)) for (const route of ['none', 'focus', 'select', 'press']) CELLS.push({label: `${target}/${route}`, target, route});

async function cell(spec) {
  const row = {label: spec.label};
  let browser, engine;
  try {
    ready = false; latest = null;
    browser = BROWSER !== 'chrome' ? await launchOther(URL_, join(OUT, `profile-${fileName(spec.label)}`)) : spawn(CHROME, [`--user-data-dir=${join(OUT, `chrome-${fileName(spec.label)}`)}`, '--no-first-run', '--no-default-browser-check',
      '--disable-search-engine-choice-screen', '--window-position=400,30', '--window-size=620,720', URL_], {stdio: 'ignore'});
    for (let i = 0; i < 120 && !ready; i++) await sleep(250);
    if (!ready) throw new Error('the page did not load');
    await sleep(1500);
    row.textEdit = await frontTextEdit(TEXT_DOC);
    engine = await startEngine(ENGINE, join(OUT, 's'), spec.label);
    await engine.wire.call('ping', {clientApiVersion: 'cua-engine-1'});
    const state = await engine.wire.execute('get_app_state', {pid: browser.pid});
    row.engineStderr = await stopEngine(engine); engine = null;
    const node = state.result?.nodes?.find(TARGETS[spec.target]);
    if (!node?.frame) { row.problem = 'no target node'; return row; }
    await sleep(1000);
    const p = centre(node.frame);
    row.frontBefore = frontmost();
    row.before = latest;
    row.act = json(sh(AX, ['act', String(browser.pid), String(p.x), String(p.y), JSON.stringify({route: spec.route, pollMs: 1500})]));
    await sleep(1000);
    row.after = latest;
    row.frontAfter = frontmost();
    engine = await startEngine(ENGINE, join(OUT, 's'), `${spec.label}-t`);
    await engine.wire.call('ping', {clientApiVersion: 'cua-engine-1'});
    const typed = await engine.wire.execute('type_text', {pid: browser.pid, text: 'QZ'});
    row.typed = {answer: typed.error ? (typed.error.errorName ?? typed.error.code) : 'success', route: (typed.error?.meta ?? typed.result?.meta)?.inputRoute ?? null};
    await sleep(1500);
    row.typed.notes = latest?.notes; row.typed.field = latest?.field; row.typed.active = latest?.active; row.typed.frontAfter = frontmost();
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 3000);
  } finally {
    if (engine) row.engineStderr = await stopEngine(engine);
    if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await sleep(2000); if (browser.exitCode === null) browser.kill('SIGKILL'); }
    await sleep(1000);
  }
  return row;
}

const cfg = config({browser: BROWSER, browserVersion: browserVersion()});
const rows = [];
for (const spec of CELLS) {
  const row = await cell(spec);
  rows.push(row);
  writeResults(OUT, cfg, rows);
  const a = row.act ?? {};
  log(`${row.label}: writes=${JSON.stringify(a.writes)} target=${JSON.stringify(a.target)} front ${row.frontBefore} -> ${row.frontAfter} order ${JSON.stringify(a.orderBefore?.frontOwner)} -> ${JSON.stringify(a.orderAfter?.frontOwner)} pidIndex ${a.orderBefore?.pidIndex} -> ${a.orderAfter?.pidIndex}`);
  log(`${row.label}: typed ${JSON.stringify(row.typed)}`);
  log(`${row.label}: poll ${JSON.stringify(a.poll)} page ${JSON.stringify(row.before?.counts)} -> ${JSON.stringify(row.after?.counts)} active=${row.after?.active}`);
  if (row.exception || row.problem) log(`${row.label}: PROBLEM ${JSON.stringify(row.problem ?? '')} ${row.exception ?? ''}`);
}
server.close();
process.exit(0);
