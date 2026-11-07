// #321's hosted measurement: how often a click into background Safari moves Safari's window above the frontmost
// TextEdit's, at which step, when, and whether it reverts. Safari's page holds a textarea filled with text (whose centre
// hits its text, so an element click by token takes the synthesized `descendant` path, a posted click) and a plain text
// block. TextEdit lists a single window (its windows are never restored).
//   engine cells (--engine, main's): token-textarea, coord-textarea (a coordinate click at its centre in screenshot
//     pixels), token-block; shared and dedicated; --batches batches of --clicks clicks, each batch on a fresh Safari and
//     engine process, the page reloaded before each click
//   raw cells (raw.swift, no engine action): activate, down, downup, full, ax; --raw-batches batches of --raw-clicks
// Each click: the full window list before and after (win.swift dump), and win.swift watch from just before the click
// for 3 s at 5 ms: every change of the layer-0 order, with whether a Safari window is above TextEdit's front window or
// above any TextEdit window, in Unix ms beside the engine's delivery record.
//
//   node scripts/probe-321/rate.mjs --engine <bin> --win <bin> --raw <bin> --out <dir> [--batches 2 --clicks 5 --raw-batches 2 --raw-clicks 3]
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {createInterface} from 'node:readline';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {launchOther, browserVersion} from '../probe-287/browser.mjs';
import {sleep, sh, json, osa, fileName, frontmost, lean, centre, startEngine, stopEngine, config, writeResults} from '../probe-313/lib.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-321: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out'), ENGINE = arg('engine'), WIN = arg('win'), RAW = arg('raw');
const BATCHES = Number(arg('batches', 2)), CLICKS = Number(arg('clicks', 5)), RAW_BATCHES = Number(arg('raw-batches', 2)), RAW_CLICKS = Number(arg('raw-clicks', 3));
const ONLY = arg('cells')?.split(',').filter(Boolean);
if (!OUT || !ENGINE || !WIN || !RAW || process.env.P287_BROWSER !== 'safari') { console.error('usage: P287_BROWSER=safari rate.mjs --engine --win --raw --out'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const log = (...a) => console.log('probe-321:', ...a);

const LINES = Array.from({length: 8}, (_, i) => `line${i} ` + 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWX'.slice(0, 54));
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe321 page</title></head>
<body><p><b>probe321 page</b></p>
<p><textarea id="notes" aria-label="Probe notes" spellcheck="false" wrap="off" style="font:16px/20px Menlo,monospace;padding:4px;border:1px solid #888;width:480px;height:160px;resize:none;overflow:hidden;white-space:pre">${LINES.join('\n')}</textarea></p>
<div id="block" role="group" aria-label="Probe block" style="font:16px/20px sans-serif;width:480px;padding:8px;border:1px solid #888">A plain block of text that the page holds for a click on a plain element.</div>
<script>(() => { const load = Math.random().toString(36).slice(2, 10); let seq = 0; const c = {pointerdown: 0, click: 0, textFocus: 0, windowFocus: 0};
const send = () => { seq += 1; navigator.sendBeacon('/beacon', JSON.stringify({load, seq, counts: c, active: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null})); };
for (const k of ['pointerdown', 'click']) document.addEventListener(k, () => { c[k] += 1; send(); }, true);
document.getElementById('notes').addEventListener('focus', () => { c.textFocus += 1; send(); });
window.addEventListener('focus', e => { if (e.target === window) { c.windowFocus += 1; send(); } });
setInterval(() => fetch('/cmd', {cache: 'no-store'}).then(r => r.text()).then(t => { if (t === 'reload') location.reload(); }).catch(() => {}), 100);
addEventListener('load', () => send()); })();</script></body></html>`;
let latest = null, reloadArmed = false;
const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') { res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(PAGE); return; }
  if (req.url === '/cmd') { res.writeHead(200, {'content-type': 'text/plain', 'cache-control': 'no-store'}); res.end(reloadArmed ? 'reload' : ''); reloadArmed = false; return; }
  let body = '';
  req.on('data', d => { body += d; });
  req.on('end', () => { if (req.url === '/beacon') { try { const r = JSON.parse(body); if (!latest || r.load !== latest.load || r.seq >= latest.seq) latest = r; } catch {} } res.writeHead(204); res.end(); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;

const TEXT_DOC = join(OUT, 'front.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window during each click.\n');
sh('defaults', ['write', 'com.apple.TextEdit', 'ApplePersistenceIgnoreState', '-bool', 'YES']);
sh('defaults', ['write', 'com.apple.TextEdit', 'NSQuitAlwaysKeepsWindows', '-bool', 'NO']);
const dump = () => json(sh(WIN, ['dump']));
// TextEdit in front with its one window at the screen's left, Safari's below it.
async function frontTextEdit() {
  for (let i = 0; i < 4; i++) { sh('open', ['-a', 'TextEdit', TEXT_DOC]); await sleep(1200); if (frontmost() === 'com.apple.TextEdit') break; }
  osa('tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {0, 40}\nset size of window 1 to {380, 300}\nend tell\nend tell');
  await sleep(400);
}
async function freshTextEdit() {
  sh('pkill', ['-x', 'TextEdit']);
  await sleep(1500);
  await frontTextEdit();
}
async function watch(pid) {
  const child = spawn(WIN, ['watch', String(pid), '4500', '5'], {stdio: ['pipe', 'pipe', 'ignore']});
  child.stdin.on('error', () => {});
  const lines = createInterface({input: child.stdout});
  const queue = [], waiters = [];
  lines.on('line', l => { let v; try { v = JSON.parse(l); } catch { v = {bad: l}; } if (waiters.length) waiters.shift()(v); else queue.push(v); });
  const next = ms => Promise.race([queue.length ? Promise.resolve(queue.shift()) : new Promise(r => waiters.push(r)), sleep(ms).then(() => ({timeout: true}))]);
  const ready = await next(5000);
  return {ready, go: () => { child.stdin.write('go\n'); }, done: () => next(6000).finally(() => child.kill())};
}
const TARGET = {textarea: n => n.role === 'AXTextArea', block: n => /Probe block/.test(`${n.title ?? ''} ${n.description ?? ''}`)};

// One click's frame: reload, put TextEdit back in front of Safari if needed, the dump and the watch around `act`.
async function click(pid, row, act) {
  const prior = latest?.load;
  reloadArmed = true;
  for (let k = 0; k < 60 && latest?.load === prior; k++) await sleep(100);
  row.reloaded = latest?.load !== prior;
  await sleep(600);
  let before = dump();
  const raisedBefore = before.windows && safariAbove(before, pid);
  if (before.frontmost !== 'com.apple.TextEdit' || raisedBefore) { row.reset = {front: before.frontmost, safariAbove: raisedBefore}; await frontTextEdit(); before = dump(); }
  row.before = before;
  row.countsBefore = latest?.counts ?? null;
  const w = await watch(pid);
  row.watchReady = !!w.ready?.ready;
  w.go();
  row.goAt = Date.now();
  await act();
  row.watch = await w.done();
  row.after = dump();
  row.countsAfter = latest?.counts ?? null;
  row.activeAfter = latest?.active ?? null;
  const first = (row.watch.changes ?? []).findIndex(c => c.aboveAny);
  row.moved = first >= 0;
  row.movedAboveFront = (row.watch.changes ?? []).some(c => c.aboveFront);
  row.movedAt = first >= 0 ? row.watch.changes[first].atMs : null;
  row.reverted = first >= 0 ? (row.watch.changes ?? []).slice(first + 1).some(c => !c.aboveAny) : null;
  row.frontChanged = (row.watch.changes ?? []).some(c => c.frontmost !== 'com.apple.TextEdit');
}
function safariAbove(d, pid) {
  const l0 = d.windows.filter(w => w.layer === 0);
  const s = l0.findIndex(w => w.pid === pid), t = l0.map((w, i) => (w.owner === 'TextEdit' ? i : -1)).filter(i => i >= 0);
  return s >= 0 && t.length > 0 && s < Math.max(...t);
}

const cfg = config({browserVersion: browserVersion(), engine: ENGINE, batches: BATCHES, clicks: CLICKS});
const rows = [];
const save = () => writeResults(OUT, cfg, rows);
const say = row => log(`${row.label}: ${row.answer?.answer ?? row.raw?.steps?.map(s => s.step).join('+') ?? 'no action'} ${JSON.stringify(row.answer?.elementClick ?? null)} moved=${row.moved} aboveFront=${row.movedAboveFront} reverted=${row.reverted} frontChanged=${row.frontChanged} textEditWindows=${row.before?.textEditWindows} delivery=${JSON.stringify(row.delivery ?? null)} movedAt-goAt=${row.movedAt ? Math.round(row.movedAt - row.goAt) : '-'}${row.reset ? ' reset=' + JSON.stringify(row.reset) : ''}${row.problem || row.exception ? ' PROBLEM ' + JSON.stringify(row.problem ?? row.exception).slice(0, 300) : ''}`);

const ENGINE_CELLS = [];
for (const desktop of ['shared', 'dedicated']) for (const kind of ['token-textarea', 'coord-textarea', 'token-block']) ENGINE_CELLS.push({cell: `engine/${desktop}/${kind}`, desktop, kind});
// #313's kit's conditions: the click 1 s after its observation (gap), and that on a fresh Safari and engine per click.
ENGINE_CELLS.push({cell: 'engine/shared/token-textarea-gap', desktop: 'shared', kind: 'token-textarea', gapMs: 1000});
ENGINE_CELLS.push({cell: 'engine/shared/fresh-token-textarea-gap', desktop: 'shared', kind: 'token-textarea', gapMs: 1000, batches: 10, clicks: 1});
const RAW_CELLS = ['activate', 'down', 'downup', 'full', 'ax', 'armout', 'arm0', 'twodown', 'armpoint', 'pointonly'].map(step => ({cell: `raw/${step}`, step}));
const on = c => !ONLY || ONLY.some(p => c.cell.startsWith(p));

for (const spec of ENGINE_CELLS.filter(on)) for (let b = 1; b <= (spec.batches ?? BATCHES); b++) {
  let browser, engine;
  try {
    await freshTextEdit();
    latest = null;
    browser = await launchOther(URL_, join(OUT, 'profile'));
    for (let i = 0; i < 120 && !latest; i++) await sleep(250);
    await sleep(1500);
    await frontTextEdit();
    engine = await startEngine(ENGINE, join(OUT, 's'), `${spec.kind}-${spec.desktop}`);
    const w = engine.wire;
    await w.call('ping', spec.desktop === 'dedicated' ? {clientApiVersion: 'cua-engine-1', desktop: 'dedicated'} : {clientApiVersion: 'cua-engine-1'});
    for (let i = 1; i <= (spec.clicks ?? CLICKS); i++) {
      const row = {label: `${spec.cell}/b${b}#${i}`, cell: spec.cell, desktop: spec.desktop, kind: spec.kind, batch: b, i};
      try {
        await click(browser.pid, row, async () => {
          const shots = join(OUT, 'shots');
          mkdirSync(shots, {recursive: true});
          const state = await w.execute('get_app_state', {pid: browser.pid, includeScreenshot: spec.kind === 'coord-textarea', outputDirectory: shots});
          if (state.error) { row.problem = {getAppState: state.error}; return; }
          const sky = state.result;
          const node = sky.nodes.find(TARGET[spec.kind.split('-')[1]]);
          if (!node?.frame) { row.problem = 'no target node'; return; }
          row.targetNode = {role: node.role, actions: node.actions, frame: node.frame};
          let args;
          if (spec.kind === 'coord-textarea') {
            const wf = sky.window.frame, scale = sky.screenshot.width / wf.width, p = centre(node.frame);
            args = {pid: browser.pid, x: Math.round((p.x - wf.x) * scale), y: Math.round((p.y - wf.y) * scale)};
          } else args = {pid: browser.pid, element: node.token};
          if (spec.gapMs) await sleep(spec.gapMs);
          row.clickSentAt = Date.now();
          const r = await w.execute('click', args, {lineage: sky.lineage});
          row.answeredAt = Date.now();
          row.click = lean(r);
          const meta = r.error ? r.error.meta : r.result?.meta;
          row.answer = {answer: r.error ? (r.error.errorName ?? r.error.code) : 'success', route: meta?.inputRoute ?? null, elementClick: meta?.elementClick ?? null};
          row.delivery = meta?.delivery ?? null;
        });
      } catch (e) { row.exception = String(e?.stack || e).slice(0, 2000); }
      rows.push(row); save(); say(row);
    }
  } catch (e) {
    rows.push({label: `${spec.cell}/b${b}`, cell: spec.cell, exception: String(e?.stack || e).slice(0, 2000)}); save();
  } finally {
    await stopEngine(engine);
    sh('pkill', ['-x', 'Safari']);
    await sleep(1500);
  }
}

for (const spec of RAW_CELLS.filter(on)) for (let b = 1; b <= RAW_BATCHES; b++) {
  let browser;
  try {
    await freshTextEdit();
    latest = null;
    browser = await launchOther(URL_, join(OUT, 'profile'));
    for (let i = 0; i < 120 && !latest; i++) await sleep(250);
    await sleep(1500);
    await frontTextEdit();
    for (let i = 1; i <= RAW_CLICKS; i++) {
      const row = {label: `${spec.cell}/b${b}#${i}`, cell: spec.cell, desktop: 'raw', kind: spec.step, batch: b, i};
      try {
        // The textarea's centre from an observation by a short-lived engine process (no action), before the frame.
        const engine = await startEngine(ENGINE, join(OUT, 's'), `raw-${spec.step}`);
        await engine.wire.call('ping', {clientApiVersion: 'cua-engine-1'});
        const state = await engine.wire.execute('get_app_state', {pid: browser.pid});
        await stopEngine(engine);
        const node = state.result?.nodes?.find(TARGET.textarea);
        if (!node?.frame) { row.problem = 'no textarea node'; rows.push(row); save(); say(row); continue; }
        const p = centre(node.frame);
        await click(browser.pid, row, async () => { row.raw = json(sh(RAW, [spec.step, String(browser.pid), String(p.x), String(p.y)])); });
      } catch (e) { row.exception = String(e?.stack || e).slice(0, 2000); }
      rows.push(row); save(); say(row);
    }
  } catch (e) {
    rows.push({label: `${spec.cell}/b${b}`, cell: spec.cell, exception: String(e?.stack || e).slice(0, 2000)}); save();
  } finally {
    sh('pkill', ['-x', 'Safari']);
    await sleep(1500);
  }
}
server.close();
process.exit(0);
