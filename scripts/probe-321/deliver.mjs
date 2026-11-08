// #321's delivery cells for the candidates: coordinate clicks (route 3's posted click) into a background page or
// TextEdit, behind a frontmost cover app, each watched at 5 ms (win.swift) against the cover's windows.
//   web (P287_BROWSER safari | chrome | firefox): the empty textarea, the filled textarea, the text field, the button
//     and the checkbox, shared and dedicated; --batches batches of --clicks clicks, each batch on a fresh browser and
//     engine process, the page reloaded before each click. Delivered: pointerdown, mousedown, mouseup and click each
//     once, and the control's own change (the checkbox's change, the button's click, the field's focus and the active
//     element).
//   native (--native): TextEdit's text area as the target behind the frontmost Probe313 app (--app); before each click
//     TextEdit's caret is put at 0; delivered: the caret moved off 0 to the click's line.
// Each click also records the full window list before and after, and the judgement of the watch against the hold.
//
//   node scripts/probe-321/deliver.mjs --engine <bin> --win <bin> --out <dir> [--native --app <bin>] [--batch 1 --batches 4 --clicks 5]
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {CHROME, BROWSER, launchOther, browserVersion} from '../probe-287/browser.mjs';
import {sleep, sh, json, osa, fileName, frontmost, lean, centre, startEngine, stopEngine, config, writeResults} from '../probe-313/lib.mjs';
import {watch, dump, judge} from './watch.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-321 deliver: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out'), ENGINE = arg('engine'), WIN = arg('win'), APP = arg('app');
const NATIVE = process.argv.includes('--native');
const BATCHES = Number(arg('batches', 4)), CLICKS = Number(arg('clicks', 5)), FIRST = Number(arg('batch', 1));
const ONLY = arg('cells')?.split(',').filter(Boolean);
if (!OUT || !ENGINE || !WIN || (NATIVE && !APP)) { console.error('usage: deliver.mjs --engine --win --out [--native --app]'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const log = (...a) => console.log('probe-321 deliver:', ...a);
sh('defaults', ['write', 'com.apple.TextEdit', 'ApplePersistenceIgnoreState', '-bool', 'YES']);
sh('defaults', ['write', 'com.apple.TextEdit', 'NSQuitAlwaysKeepsWindows', '-bool', 'NO']);

const LINES = Array.from({length: 4}, (_, i) => `line${i} ` + 'abcdefghijklmnopqrstuvwxyz0123456789'.slice(0, 30));
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe321 deliver</title></head>
<body style="margin:8px"><p><b>probe321 deliver</b></p>
<p><label><input id="option" type="checkbox"> Probe option</label> <button id="apply" type="button">Apply</button></p>
<p><input id="field" type="text" aria-label="Probe field" size="40" value="alpha"></p>
<p><textarea id="empty" aria-label="Probe empty" rows="3" cols="50"></textarea></p>
<p><textarea id="filled" aria-label="Probe filled" rows="4" cols="50" wrap="off">${LINES.join('\n')}</textarea></p>
<script>(() => { const load = Math.random().toString(36).slice(2, 10); let seq = 0;
const c = {pointerdown: 0, mousedown: 0, mouseup: 0, click: 0, optionChange: 0, applyClick: 0, focus_field: 0, focus_empty: 0, focus_filled: 0};
const send = () => { seq += 1; navigator.sendBeacon('/beacon', JSON.stringify({load, seq, counts: c, active: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null})); };
for (const k of ['pointerdown', 'mousedown', 'mouseup', 'click']) document.addEventListener(k, () => { c[k] += 1; send(); }, true);
document.getElementById('option').addEventListener('change', () => { c.optionChange += 1; send(); });
document.getElementById('apply').addEventListener('click', () => { c.applyClick += 1; send(); });
for (const id of ['field', 'empty', 'filled']) document.getElementById(id).addEventListener('focus', () => { c['focus_' + id] += 1; send(); });
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
const NATIVE_DOC = join(OUT, 'target.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window during each click.\n');
writeFileSync(NATIVE_DOC, Array.from({length: 8}, (_, i) => `native line ${i} with some words to click into`).join('\n') + '\n');
async function frontTextEdit() {
  for (let i = 0; i < 4; i++) { sh('open', ['-a', 'TextEdit', TEXT_DOC]); await sleep(1200); if (frontmost() === 'com.apple.TextEdit') break; }
  osa('tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {0, 40}\nset size of window 1 to {380, 300}\nend tell\nend tell');
  await sleep(400);
}
const pidOf = name => Number(sh('pgrep', ['-x', name]).out.split('\n')[0]) || null;

const TARGETS = {
  checkbox: n => n.role === 'AXCheckBox', button: n => n.role === 'AXButton' && n.title === 'Apply',
  field: n => n.role === 'AXTextField' && (/Probe field/.test(`${n.title ?? ''} ${n.description ?? ''}`) || n.value === 'alpha'),
  empty: n => n.role === 'AXTextArea' && /Probe empty/.test(`${n.title ?? ''} ${n.description ?? ''}`),
  filled: n => n.role === 'AXTextArea' && /Probe filled/.test(`${n.title ?? ''} ${n.description ?? ''}`),
};
const delivered = (target, d, active) => {
  const pointer = ['pointerdown', 'mousedown', 'mouseup', 'click'].every(k => d[k] === 1);
  const own = target === 'checkbox' ? d.optionChange === 1 : target === 'button' ? d.applyClick === 1 : d[`focus_${target}`] === 1 && active === target;
  return {pointer, own, ok: pointer && own};
};
const delta = (a, b) => Object.fromEntries(Object.keys(b?.counts ?? {}).map(k => [k, (b.counts[k] ?? 0) - (a && a.load === b.load ? a.counts[k] ?? 0 : 0)]));

const cfg = config({browser: NATIVE ? 'native' : BROWSER, browserVersion: NATIVE ? null : browserVersion(), engine: ENGINE, variant: process.env.P321_VARIANT ?? null});
const rows = [];
const save = () => writeResults(OUT, cfg, rows);
const say = row => log(`${row.label}: ${row.answer?.answer ?? 'no click'} route=${row.answer?.route} kind=${JSON.stringify(row.answer?.activationClickKind ?? null)} delivered=${JSON.stringify(row.delivered ?? null)} judged=${JSON.stringify(row.judged ? {...row.judged, keys: undefined, fronts: undefined} : null)} restores=${row.delivery?.restores} repairedAfterRelease=${row.delivery?.repairedAfterRelease} ms=${row.clickMs} guardMs=${row.delivery?.guardMs} screenHoldMs=${row.delivery?.screenHoldMs} transientRaise=${JSON.stringify(row.delivery?.transientRaise ?? null)}${row.problem || row.exception ? ' PROBLEM ' + JSON.stringify(row.problem ?? row.exception).slice(0, 300) : ''}`);

// One click: the target below the cover, the dumps and the watch around the engine's coordinate click.
async function clickOnce(w, row, pid, cover, coverBundle, coverName, locate, reset) {
  await reset();
  const before = dump(WIN);
  row.before = {frontmost: before.frontmost, windows: before.windows};
  const shots = join(OUT, 'shots');
  mkdirSync(shots, {recursive: true});
  const state = await w.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots});
  if (state.error) { row.problem = {getAppState: state.error}; return; }
  const sky = state.result;
  const p = locate(sky);
  if (!p) { row.problem = 'no target'; return; }
  const wf = sky.window.frame, scale = sky.screenshot.width / wf.width;
  const px = {x: Math.round((p.x - wf.x) * scale), y: Math.round((p.y - wf.y) * scale)};
  const watcher = await watch(WIN, pid, cover, 3000);
  const goAt = watcher.go();
  row.clickSentAt = Date.now();
  const r = await w.execute('click', {pid, ...px});
  row.clickMs = Date.now() - row.clickSentAt;
  const watched = await watcher.done();
  row.click = lean(r);
  const meta = r.error ? r.error.meta : r.result?.meta;
  row.answer = {answer: r.error ? (r.error.errorName ?? r.error.code) : 'success', route: meta?.inputRoute ?? null, elementClick: meta?.elementClick ?? null,
    activationClick: meta?.activationClick ?? null, activationClickKind: meta?.activationClickKind ?? null};
  row.delivery = meta?.delivery ?? null;
  row.watch = {...watched, goAt};
  row.judged = judge(row.watch, row.delivery, coverBundle, coverName);
  row.after = dump(WIN);
}

const WEB = Object.keys(TARGETS).flatMap(t => ['shared', 'dedicated'].map(d => ({cell: `${BROWSER}/${d}/${t}`, desktop: d, target: t})));
const NAT = ['shared', 'dedicated'].map(d => ({cell: `textedit/${d}/text`, desktop: d, target: 'text'}));
const on = c => !ONLY || ONLY.some(p => c.cell.startsWith(p));

for (const spec of (NATIVE ? NAT : WEB).filter(on)) for (let b = FIRST; b < FIRST + BATCHES; b++) {
  let browser, engine, front;
  try {
    sh('pkill', ['-x', 'TextEdit']);
    await sleep(1500);
    let pid, cover, coverBundle, coverName, reset, locate;
    if (NATIVE) {
      // TextEdit's document at the right, the probe app in front at the left.
      sh('open', ['-a', 'TextEdit', NATIVE_DOC]);
      await sleep(2500);
      osa('tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {420, 40}\nset size of window 1 to {560, 400}\nend tell\nend tell');
      pid = pidOf('TextEdit');
      const logPath = join(OUT, `app-${fileName(spec.cell)}-${b}.jsonl`);
      front = spawn(APP, [logPath], {stdio: 'ignore'});
      await sleep(2500);
      const placeFront = () => osa(`tell application "System Events"\ntell (first process whose unix id is ${front.pid})\nset frontmost to true\nset position of window 1 to {-250, 40}\nend tell\nend tell`);
      placeFront();
      await sleep(800);
      [cover, coverBundle, coverName] = ['Probe313', 'com.ssfskim.probe313', 'Probe313'];
      reset = async () => { json(sh(WIN, ['sel0', String(pid)])); await sleep(300); const d = dump(WIN); if (d.frontmost !== coverBundle) { placeFront(); await sleep(600); } };
      locate = sky => { const n = sky.nodes.find(x => x.role === 'AXTextArea'); return n?.frame ? {x: n.frame.x + 120, y: n.frame.y + 50} : null; };
    } else {
      await frontTextEdit();
      latest = null;
      browser = BROWSER !== 'chrome' ? await launchOther(URL_, join(OUT, `profile-${fileName(spec.cell)}-${b}`)) : spawn(CHROME, [`--user-data-dir=${join(OUT, `chrome-${fileName(spec.cell)}-${b}`)}`, '--no-first-run', '--no-default-browser-check',
        '--disable-search-engine-choice-screen', '--window-position=400,30', '--window-size=620,720', URL_], {stdio: 'ignore'});
      for (let i = 0; i < 120 && !latest; i++) await sleep(250);
      await sleep(BROWSER === 'chrome' ? 20000 : 1500);  // Chrome re-lays out its toolbar about 18-20 s after launch
      await frontTextEdit();
      pid = browser.pid;
      [cover, coverBundle, coverName] = ['TextEdit', 'com.apple.TextEdit', 'TextEdit'];
      reset = async () => {
        const prior = latest?.load;
        reloadArmed = true;
        for (let k = 0; k < 60 && latest?.load === prior; k++) await sleep(100);
        await sleep(600);
        const d = dump(WIN);
        const l0 = (d.windows ?? []).filter(x => x.layer === 0), s = l0.findIndex(x => x.pid === pid), t = l0.map((x, i) => (x.owner === 'TextEdit' ? i : -1)).filter(i => i >= 0);
        if (d.frontmost !== coverBundle || (s >= 0 && t.length && s < Math.max(...t))) await frontTextEdit();
      };
      locate = sky => { const n = sky.nodes.find(TARGETS[spec.target]); return n?.frame ? centre(n.frame) : null; };
    }
    engine = await startEngine(ENGINE, join(OUT, 's'), `${spec.desktop}-${spec.target}`);
    const w = engine.wire;
    await w.call('ping', spec.desktop === 'dedicated' ? {clientApiVersion: 'cua-engine-1', desktop: 'dedicated'} : {clientApiVersion: 'cua-engine-1'});
    for (let i = 1; i <= CLICKS; i++) {
      const row = {label: `${spec.cell}/b${b}#${i}`, cell: spec.cell, desktop: spec.desktop, target: spec.target, batch: b, i};
      try {
        const countsBefore = latest;
        await clickOnce(w, row, pid, cover, coverBundle, coverName, locate, reset);
        await sleep(700);
        if (NATIVE) {
          row.selection = json(sh(WIN, ['sel', String(pid)]));
          row.delivered = {ok: (row.selection.loc ?? 0) > 0, loc: row.selection.loc ?? null};
        } else {
          const d = delta(countsBefore && countsBefore.load === latest?.load ? countsBefore : null, latest);
          row.delta = d; row.active = latest?.active ?? null;
          row.delivered = delivered(spec.target, d, row.active);
        }
      } catch (e) { row.exception = String(e?.stack || e).slice(0, 2000); }
      rows.push(row); save(); say(row);
    }
  } catch (e) {
    rows.push({label: `${spec.cell}/b${b}`, cell: spec.cell, exception: String(e?.stack || e).slice(0, 2000)}); save();
  } finally {
    await stopEngine(engine);
    if (browser) { if (BROWSER === 'safari') sh('pkill', ['-x', 'Safari']); else if (browser.exitCode === null) { browser.kill('SIGTERM'); await sleep(1500); if (browser.exitCode === null) browser.kill('SIGKILL'); } }
    if (front && front.exitCode === null) front.kill('SIGTERM');
    await sleep(1500);
  }
}
server.close();
process.exit(0);
