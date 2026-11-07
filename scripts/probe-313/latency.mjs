// #313's focus read-back latency in Firefox (ruling c4108490: AXPress, then focus read back): on one engine head
// (--engine; main, whose route for a page's text field outside Chromium is AXPress), --n element clicks by token on the
// textarea and on the text field, in shared and dedicated mode, the browser behind a frontmost TextEdit. One Firefox and
// one engine process per mode and field; before each click the page reloads (focus back on the body), TextEdit is put
// in front again if it lost it, and a new observation gives the field's token. poll.swift reads the field's AXFocused
// every 20 ms from the click's answer until it first reads true, up to 3 s. The frontmost app and the window order are
// recorded before and after each click.
//
//   node scripts/probe-313/latency.mjs --engine <cua-engine> --ax <ax> --poll <poll> --out <dir> [--n 20]
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {createInterface} from 'node:readline';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {BROWSER, launchOther, browserVersion} from '../probe-287/browser.mjs';
import {sleep, fileName, frontmost, lean, centre, startEngine, stopEngine, frontTextEdit, axTool, answer, config, writeResults} from './lib.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-313 latency: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), ENGINE = arg('engine'), AX = arg('ax'), POLL = arg('poll'), N = Number(arg('n') ?? 20);
if (!OUT || !ENGINE || !AX || !POLL || BROWSER !== 'firefox') { console.error('usage: P287_BROWSER=firefox latency.mjs --engine <bin> --ax <bin> --poll <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const ax = axTool(AX);
const log = (...a) => console.log('probe-313 latency:', ...a);

// The page reloads itself when the server says so (polled every 100 ms), so each click starts with the focus on the body.
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe313 latency</title></head>
<body><p><b>probe313 latency</b></p><p><input id="field" type="text" aria-label="Probe field" size="40" value="alpha"></p>
<p><textarea id="notes" aria-label="Probe notes" rows="8" cols="60"></textarea></p>
<script>(() => { const load = Math.random().toString(36).slice(2, 10); let seq = 0;
const send = ev => { seq += 1; navigator.sendBeacon('/beacon', JSON.stringify({load, seq, ev, t: Date.now(), active: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null})); };
for (const id of ['field', 'notes']) document.getElementById(id).addEventListener('focus', () => send('focus:' + id));
setInterval(() => fetch('/cmd', {cache: 'no-store'}).then(r => r.text()).then(t => { if (t === 'reload') location.reload(); }).catch(() => {}), 100);
addEventListener('load', () => send('load')); })();</script></body></html>`;
let beacons = [], reloadArmed = false;
const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') { res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(PAGE); return; }
  if (req.url === '/cmd') { res.writeHead(200, {'content-type': 'text/plain', 'cache-control': 'no-store'}); res.end(reloadArmed ? 'reload' : ''); reloadArmed = false; return; }
  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', () => { if (req.url === '/beacon') { try { beacons.push({...JSON.parse(body), at: Date.now()}); } catch {} } res.writeHead(204); res.end(); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;
const TEXT_DOC = join(OUT, 'front.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window during each click.\n');
const TARGETS = {textarea: n => n.role === 'AXTextArea', field: n => n.role === 'AXTextField' && (/Probe field/.test(`${n.title ?? ''} ${n.description ?? ''}`) || n.value === 'alpha')};
const lastLoad = () => [...beacons].reverse().find(b => b.ev === 'load');

async function pollFocus(pid, p) {
  const child = spawn(POLL, [String(pid), String(p.x), String(p.y), '20', '3000'], {stdio: ['pipe', 'pipe', 'ignore']});
  child.stdin.on('error', () => {});
  const lines = createInterface({input: child.stdout});
  const queue = [], waiters = [];
  lines.on('line', l => { let v; try { v = JSON.parse(l); } catch { v = {bad: l}; } if (waiters.length) waiters.shift()(v); else queue.push(v); });
  const next = () => (queue.length ? Promise.resolve(queue.shift()) : new Promise(r => waiters.push(r)));
  const ready = await Promise.race([next(), sleep(5000).then(() => ({ready: false, timeout: true}))]);
  return {ready, go: () => { child.stdin.write('go\n'); return Promise.race([next(), sleep(6000).then(() => ({timeout: true}))]).finally(() => child.kill()); }};
}

async function batch(desktop, target) {
  const rows = [];
  const label = `${desktop}/${target}`;
  let browser, engine;
  try {
    beacons = [];
    browser = await launchOther(URL_, join(OUT, `profile-${fileName(label)}`));
    for (let i = 0; i < 120 && !lastLoad(); i++) await sleep(250);
    await sleep(1500);
    await frontTextEdit(TEXT_DOC);
    engine = await startEngine(ENGINE, join(OUT, 's'), label);
    const w = engine.wire;
    await w.call('ping', desktop === 'dedicated' ? {clientApiVersion: 'cua-engine-1', desktop: 'dedicated'} : {clientApiVersion: 'cua-engine-1'});
    for (let i = 1; i <= N; i++) {
      const row = {label: `${label}#${i}`, desktop, target, i};
      try {
        // A fresh page: reload, wait for its load beacon.
        const prior = lastLoad()?.load;
        reloadArmed = true;
        for (let k = 0; k < 60 && lastLoad()?.load === prior; k++) await sleep(100);
        row.reloaded = lastLoad()?.load !== prior;
        await sleep(700);
        if (frontmost() !== 'com.apple.TextEdit') { row.refrontedTextEdit = true; await frontTextEdit(TEXT_DOC); }
        const state = await w.execute('get_app_state', {pid: browser.pid});
        if (state.error) { row.problem = {getAppState: state.error}; rows.push(row); continue; }
        const node = state.result.nodes.find(TARGETS[target]);
        if (!node?.frame) { row.problem = 'no target node'; rows.push(row); continue; }
        const p = centre(node.frame);
        const poller = await pollFocus(browser.pid, p);
        row.pollReady = poller.ready;
        row.before = {front: frontmost(), ...ax.focus(browser.pid)};
        row.startActive = [...beacons].reverse().find(b => b.load === lastLoad()?.load)?.active ?? null;
        const sent = Date.now();
        const click = await w.execute('click', {pid: browser.pid, element: node.token}, {lineage: state.result.lineage});
        const answeredAt = Date.now();
        const read = await poller.go();
        row.clickMs = answeredAt - sent;
        row.answer = answer(click);
        row.click = lean(click);
        row.read = read;
        row.after = {front: frontmost(), ...ax.focus(browser.pid)};
        await sleep(300);
        row.pageFocusEvents = beacons.filter(b => b.load === lastLoad()?.load && b.ev.startsWith('focus:')).map(b => ({ev: b.ev, msAfterAnswer: b.t - answeredAt}));
      } catch (e) {
        row.exception = String(e?.stack || e).slice(0, 2000);
      }
      rows.push(row);
      const r = row.read ?? {};
      log(`${row.label}: ${row.answer?.answer ?? 'no click'} ${JSON.stringify(row.answer?.elementClick ?? null)} clickMs=${row.clickMs} firstTrueMs=${r.firstTrueMs} appFocusFirstMs=${r.appFocusFirstMs} reads=${r.reads} start=${row.startActive} front ${row.before?.front} -> ${row.after?.front} pid ${row.before?.order?.pidIndex} -> ${row.after?.order?.pidIndex} page=${JSON.stringify(row.pageFocusEvents)}${row.problem || row.exception ? ' PROBLEM ' + JSON.stringify(row.problem ?? row.exception).slice(0, 300) : ''}`);
    }
  } catch (e) {
    rows.push({label, exception: String(e?.stack || e).slice(0, 2000)});
  } finally {
    await stopEngine(engine);
    if (browser && browser.exitCode === null) { browser.kill('SIGTERM'); await sleep(2000); if (browser.exitCode === null) browser.kill('SIGKILL'); }
    await sleep(1000);
  }
  return rows;
}

const cfg = config({browser: BROWSER, browserVersion: browserVersion(), engine: ENGINE, n: N});
const all = [];
for (const desktop of ['shared', 'dedicated']) for (const target of ['textarea', 'field']) {
  all.push(...await batch(desktop, target));
  writeResults(OUT, cfg, all);
}
server.close();
process.exit(0);
