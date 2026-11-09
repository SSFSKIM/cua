// #298's measure-only spike on a GitHub-hosted macOS runner: which attribute of a control relabelled in place (one AX
// element kept, its label changed) separates a change of meaning (Save -> Delete) from a change of content (Like (12) ->
// Like (13), a ticking timer). No engine and no click: scripts/probe-298/tool.swift holds each cell's handle, reads every
// candidate attribute at an "observation", again 1 s later with nothing changed (the drift a ticking label alone makes),
// and at "click time" 5 s after the observation, 3 s after the page (or app) changed every cell at once; each read also
// hit-tests the observed centre. The verdicts are computed afterwards (scripts/probe-298/analyze.mjs).
//   --group chrome   Chrome for Testing, the cells' page (and its window, web area and tab)
//   --group safari   Safari, the same page
//   --group native   scripts/probe-298/app.swift's AppKit window
//   node scripts/probe-298/measure.mjs --groups chrome,safari,native --tool <tool> --app <Probe298 binary> --out <dir> [--reps 3]
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdirSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-298: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), TOOL = arg('tool'), APP = arg('app'), GROUPS = (arg('groups') ?? 'chrome,safari,native').split(','), REPS = Number(arg('reps') ?? 3);
if (!OUT || !TOOL) { console.error('usage: measure.mjs --groups <g,…> --tool <bin> --app <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-298:', ...a);

// ---- the cells -------------------------------------------------------------------------------------------------
// [key, truth, markup (its target carries class t298), the page's change]. truth: content (the click means what it meant),
// flip (the control's own state flipped: the click now does the inverse), meaning (another action), same-meaning (other
// words, one meaning). container: the target is not a control.
const WEB = [
  ['tick', 'content', `<button id="label" class="p296-label g t298">Elapsed 0.0 s</button>`, null],
  ['nextto', 'content', `<span id="counter" class="g"></span> <button class="t298">Next to</button>`, null],
  ['like', 'content', `<button class="t298 fixed">Like (12)</button>`, `e.textContent = 'Like (13)'`],
  ['items', 'content', `<button class="t298 fixed">1 item</button>`, `e.textContent = '2 items'`],
  ['reltime', 'content', `<a href="#" class="t298">1 minute ago</a>`, `e.textContent = '2 minutes ago'`],
  ['inbox', 'content', `<a href="#" class="t298">Inbox</a>`, `e.textContent = 'Inbox (3)'`],
  ['notif', 'content', `<button class="t298 fixed" aria-label="Notifications">*</button>`, `e.setAttribute('aria-label', 'Notifications, 3 new')`],
  ['loc', 'same-meaning', `<button class="t298 fixed">Save</button>`, `e.textContent = 'Guardar'`],
  ['follow', 'flip', `<button class="t298 fixed">Follow</button>`, `e.textContent = 'Following'`],
  ['followp', 'flip', `<button class="t298 fixed" aria-pressed="false">Follow</button>`, `e.setAttribute('aria-pressed', 'true'); e.textContent = 'Following'`],
  ['play', 'flip', `<button class="t298 fixed">Play</button>`, `e.textContent = 'Pause'`],
  ['more', 'flip', `<button class="t298 fixed">Show more</button>`, `e.textContent = 'Show less'`],
  ['saved', 'flip', `<button class="t298 fixed">Save</button>`, `e.textContent = 'Saved'`],
  ['save', 'meaning', `<button class="t298 fixed">Save</button>`, `e.textContent = 'Delete'`],
  ['saveid', 'meaning', `<button id="act-1" class="t298 fixed">Save</button>`, `e.textContent = 'Delete'`],
  ['saveidchg', 'meaning', `<button id="save-2" class="t298 fixed">Save</button>`, `e.id = 'delete-2'; e.textContent = 'Delete'`],
  ['saveclass', 'meaning', `<button class="t298 fixed btn primary">Save</button>`, `e.className = 't298 fixed btn danger'; e.textContent = 'Delete'`],
  ['savearia', 'meaning', `<button class="t298 fixed" aria-label="Save" title="Save">&#x2B07;</button>`, `e.setAttribute('aria-label', 'Delete'); e.title = 'Delete'`],
  ['deleteall', 'meaning', `<button class="t298 fixed">Delete</button>`, `e.textContent = 'Delete all'`],
  ['popup', 'meaning', `<button class="t298 fixed">Save</button>`, `e.setAttribute('aria-haspopup', 'menu'); e.textContent = 'Delete'`],
  ['region', 'container-content', `<section class="t298 box" role="region" aria-label="Inbox"><p>Messages</p></section>`, `e.setAttribute('aria-label', 'Inbox (3)')`],
  ['labelledby', 'container-content', `<div class="t298 box" role="group" aria-labelledby="h-lb"><b id="h-lb">Inbox</b><p>Messages</p></div>`, `document.getElementById('h-lb').textContent = 'Inbox (3)'`],
  ['dialog', 'container-meaning', `<div class="t298 box" role="dialog" aria-label="Save changes?"><p>Body</p></div>`, `e.setAttribute('aria-label', 'Delete file?')`],
];
const WEB_EXTRA = [  // the page's title gains a count: its window, web area and (Chrome's) tab
  {key: 'window', truth: 'container-content', by: 'window'}, {key: 'webarea', truth: 'container-content', by: 'webarea'},
  {key: 'tab', truth: 'content', by: 'tab', prefix: 'probe298'},
];
const NATIVE = [
  ['tick', 'content'], ['like', 'content'], ['items', 'content'], ['follow', 'flip'], ['play', 'flip'], ['more', 'flip'], ['toggle', 'flip'],
  ['relabel', 'meaning'], ['save-2', 'meaning'], ['noid', 'meaning'], ['alabel', 'meaning'], ['deleteall', 'meaning'],
];

const page = () => `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe298 page</title>
<style>body{margin:8px;font:13px sans-serif}button{font:13px sans-serif;padding:4px 8px}.g{font-family:Georgia,serif}
.fixed{width:170px;height:30px;padding:0}.cell{display:inline-block;width:186px;height:44px;vertical-align:top;overflow:hidden}
.box{border:1px solid #888;height:38px;width:178px;overflow:hidden}.box p{margin:0}</style></head>
<body><p><b>probe298</b></p>${WEB.map(([key, , markup]) => `<div class="cell" role="group" id="w-${key}" aria-label="w-${key}">${markup}</div>`).join('')}
<script>(() => {
const K = new URLSearchParams(location.search).get('k');
const send = (ev, extra) => navigator.sendBeacon('/b', JSON.stringify({ev, k: K, t: Date.now(), ...extra}));
const $ = id => document.getElementById(id);
const target = key => $('w-' + key).querySelector('.t298');
setInterval(() => { $('label').textContent = 'Elapsed ' + (performance.now() / 1000).toFixed(1) + ' s'; $('counter').textContent = (performance.now() / 1000).toFixed(1); }, 100);
const MUT = {${WEB.filter(c => c[3]).map(([key, , , m]) => `${JSON.stringify(key)}: e => { ${m}; }`).join(',\n')}};
const run = c => {
  if (c.op === 'nav') location.href = '/?k=' + c.k;
  else if (c.op === 'mutate') { for (const [key, f] of Object.entries(MUT)) f(target(key)); document.title = '(3) probe298 page'; send('mutated'); }
};
setInterval(async () => { try { const r = await fetch('/cmd'); for (const c of await r.json()) run(c); } catch {} }, 100);
addEventListener('load', () => send('load')); })();</script></body></html>`;

let beacons = [], commands = [];
const server = createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) { res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(page()); return; }
  if (req.method === 'GET' && req.url === '/cmd') { const out = commands; commands = []; res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'}); res.end(JSON.stringify(out)); return; }
  if (req.method === 'GET') { res.writeHead(404); res.end(); return; }
  let body = '';
  req.on('data', d => { body += d; if (body.length > 65536) req.destroy(); });
  req.on('end', () => { try { beacons.push({arrive: Date.now(), ...JSON.parse(body)}); } catch {} res.writeHead(204); res.end(); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;

const sh = (cmd, args) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout: 20_000}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const pidOf = name => Number(sh('pgrep', ['-x', name]).out.split('\n')[0]) || null;
function measureTool(pid) {
  const child = spawn(TOOL, ['measure', String(pid)], {stdio: ['pipe', 'pipe', 'pipe']});
  const lines = createInterface({input: child.stdout});
  const waiting = [];
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  lines.on('line', l => { const w = waiting.shift(); if (w) { try { w(JSON.parse(l)); } catch { w({error: `bad answer ${l.slice(0, 200)}`}); } } });
  child.on('close', () => { for (const w of waiting.splice(0)) w({error: `tool exited ${stderr.slice(0, 500)}`}); });
  return {
    ask: (o, timeout = 60_000) => new Promise(resolve => {
      const t = setTimeout(() => resolve({error: 'tool timeout'}), timeout);
      waiting.push(v => { clearTimeout(t); resolve(v); });
      child.stdin.write(JSON.stringify(o) + '\n');
    }),
    stop: () => { child.stdin.end(); setTimeout(() => child.kill('SIGKILL'), 1000); },
  };
}

// ---- the apps ----------------------------------------------------------------------------------------------------
let navK = 0, curK = 'k0';
async function waitBeacon(pred, ms, what) {
  for (let i = 0; i < ms / 200; i++) { if (beacons.some(pred)) return; await sleep(200); }
  throw new Error(`${what}: none in ${ms} ms`);
}
async function nav() {
  const k = `k${++navK}`;
  commands.push({op: 'nav', k});
  curK = k;
  await waitBeacon(b => b.ev === 'load' && b.k === k, 15_000, 'nav load');
  return k;
}
async function launchChrome() {
  beacons = []; curK = 'k0';
  const child = spawn(CFT, [`--user-data-dir=${join(OUT, 'chrome-profile')}`, '--no-first-run', '--no-default-browser-check',
    '--disable-search-engine-choice-screen', '--window-position=400,30', '--window-size=620,720', `${URL_}?k=k0`], {stdio: 'ignore'});
  await waitBeacon(b => b.ev === 'load', 40_000, 'chrome load');
  return {pid: child.pid, stop: async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await sleep(2000); if (child.exitCode === null) child.kill('SIGKILL'); } }};
}
async function launchSafari() {
  beacons = []; curK = 'k0';
  osa('tell application "Safari" to quit');
  await sleep(1500);
  sh('open', ['-a', 'Safari', `${URL_}?k=k0`]);
  await waitBeacon(b => b.ev === 'load', 40_000, 'safari load');
  osa('tell application "System Events"\ntell process "Safari"\nset position of window 1 to {400, 30}\nset size of window 1 to {620, 720}\nend tell\nend tell');
  await sleep(800);
  return {pid: pidOf('Safari'), stop: async () => { osa('tell application "Safari" to quit'); await sleep(1500); }};
}
const CMD = join(OUT, 'native-cmd.txt'), NLOG = join(OUT, 'native-log.jsonl');
let nativeNonce = 0;
const nativeLog = () => existsSync(NLOG) ? readFileSync(NLOG, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
async function launchNative() {
  writeFileSync(CMD, '');
  writeFileSync(NLOG, '');
  const child = spawn(APP, [CMD, NLOG], {stdio: 'ignore'});
  for (let i = 0; i < 80 && !nativeLog().some(e => e.ev === 'ready'); i++) await sleep(250);
  await sleep(1000);
  return {pid: child.pid, stop: async () => { child.kill('SIGTERM'); await sleep(500); }};
}

// ---- one repetition ----------------------------------------------------------------------------------------------
async function rep(group, n, target) {
  const row = {group, rep: n, pid: target.pid};
  const tool = measureTool(target.pid);
  try {
    let cells;
    if (group === 'native') {
      cells = NATIVE.map(([key, truth]) => key === 'noid' ? {key, truth, by: 'title', role: 'AXButton', title: 'Save'} : {key, truth, by: 'axid', id: key});
      cells.push({key: 'window', truth: 'container-content', by: 'window'});
    } else {
      cells = WEB.map(([key, truth]) => ({key, truth, by: 'wrap', id: `w-${key}`, container: truth.startsWith('container')}));
      cells.push(...WEB_EXTRA.filter(c => group === 'chrome' || c.key !== 'tab'));
    }
    row.cells = cells;
    if (group === 'chrome') { row.enable = await tool.ask({op: 'enable'}); await sleep(2500); }
    let obs;
    for (let attempt = 0; attempt < 4; attempt++) {
      obs = await tool.ask({op: 'find', cells});
      const missing = cells.filter(c => !obs.cells?.[c.key]?.found).map(c => c.key);
      row.missing = missing;
      if (missing.length <= (group === 'chrome' ? 0 : 1)) break;
      await sleep(1500);
    }
    const at = Date.now();
    row.observation = obs;
    await sleep(1000);
    row.pre = await tool.ask({op: 'read'});
    const mid = at + 2000 - Date.now(); if (mid > 0) await sleep(mid);
    if (group === 'native') writeFileSync(CMD, `n${++nativeNonce} mutate\n`); else commands.push({op: 'mutate'});
    row.mutateAtMs = Date.now() - at;
    const left = at + 5000 - Date.now(); if (left > 0) await sleep(left);
    row.click = await tool.ask({op: 'read'});
    row.clickAtMs = Date.now() - at;
    row.mutated = group === 'native' ? nativeLog().some(e => e.ev === 'cmd' && e.op === 'mutate') : beacons.some(b => b.ev === 'mutated' && b.k === curK);
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 3000);
  } finally {
    tool.stop();
    await sleep(500);
  }
  return row;
}

const config = {
  imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, runnerName: process.env.RUNNER_NAME ?? null,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), chrome: sh(CFT, ['--version']).out,
  safari: sh('defaults', ['read', '/Applications/Safari.app/Contents/Info', 'CFBundleShortVersionString']).out,
  probeCommit: process.env.GITHUB_SHA ?? null, runner: process.env.P298_REP ?? null,
};
log('config', JSON.stringify(config));
const rows = [];
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, rows}, null, 1));
for (const group of GROUPS) {
  let target = null;
  try {
    for (let n = 1; n <= REPS; n++) {
      if (group === 'native') { target = await launchNative(); }
      else if (!target) { target = group === 'chrome' ? await launchChrome() : await launchSafari(); await sleep(3000); }
      else { await nav(); await sleep(2500); }
      const row = await rep(group, n, target);
      rows.push(row);
      save();
      const changed = Object.entries(row.click?.cells ?? {}).map(([k, v]) => `${k}:${v.node?.AXTitle ?? v.node?.AXDescription ?? ''}`).join(' | ');
      log(`${group} rep ${n}: missing=${JSON.stringify(row.missing)} mutated=${row.mutated} ${row.exception ?? ''}\n    ${changed}`);
      if (group === 'native') { await target.stop(); target = null; }
    }
  } catch (e) {
    rows.push({group, exception: String(e?.stack || e).slice(0, 3000)});
    save();
    log(`${group}: ${e}`);
  } finally {
    if (target) await target.stop();
  }
}
server.close();
process.exit(0);
