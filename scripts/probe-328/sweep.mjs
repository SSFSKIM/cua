// #328's gate (a): the still click and drag sweep on the engine's real answers (ruling b1921fc3: a coordinate outside
// the screenshot is refused for every pointer action, `pointOutsideScreenshot`). One app behind the frontmost cover, one
// engine binary per run (the A/B runs it once per head); every cell a fresh connection and observation, then one click
// or drag at points placed in that screenshot: up to 8 inside (element centres), each edge's middle 0, 1 and 2 px inside,
// the corners 0 and 2 px inside, and 6 past the edges (1 and 20 px). Drags go from the window's centre to each edge,
// corner and outside point, and from each edge point to the centre. The answer, its meta and (browsers) the page's own
// pointer events are kept; the reader compares the heads cell by cell (offline/sweep.mjs).
//   node scripts/probe-328/sweep.mjs --app safari|chrome|firefox|textedit|finder|probe --engine <bin> --head <label>
//     --t328 <bin> --cover <Cover328 bin> --probe-app <Probe328 bin> --out <dir>
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('sweep.mjs: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = arg('app'), ENGINE = arg('engine'), HEAD = arg('head', 'a'), T328 = arg('t328'), COVER = arg('cover'), PROBE = arg('probe-app'), OUT = arg('out');
const BROWSERS = ['safari', 'chrome', 'firefox'];
process.env.P287_BROWSER = BROWSERS.includes(APP) ? APP : 'safari';
if (APP === 'firefox') process.env.P287_FIREFOX_A11Y = 'force';
const {launchOther, placePid} = await import('../probe-287/browser.mjs');
mkdirSync(OUT, {recursive: true});
const T = process.env.RUNNER_TEMP || OUT;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('sweep-328:', ...a);
const sh = (cmd, args, timeout = 30_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim()}; };
const osa = s => sh('osascript', ['-e', s]);
const pidOf = name => Number(sh('pgrep', ['-x', name]).out.split('\n')[0]) || null;

// ---- an inert page whose pointer events are beaconed --------------------------------------------------------------------
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>probe328 sweep</title><style>body{font:15px sans-serif;margin:12px}p{margin:8px 0}</style></head><body>
<p><button type="button">First</button> <button type="button">Second</button></p>${Array.from({length: 40}, (_, i) => `<p>still line ${i} with some words</p>`).join('')}
<script>for(const k of ['pointerdown','mousedown','mouseup','click'])document.addEventListener(k,e=>navigator.sendBeacon('/e',JSON.stringify({k,t:Date.now(),x:e.clientX,y:e.clientY})),true);
addEventListener('load',()=>navigator.sendBeacon('/ready'));</script></body></html>`;
let events = [], ready = false;
const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') { res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(PAGE); return; }
  let b = ''; req.on('data', d => { b += d; }); req.on('end', () => { if (req.url === '/ready') ready = true; if (req.url === '/e') { try { events.push(JSON.parse(b)); } catch {} } res.writeHead(204); res.end(); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const LOCAL = `http://127.0.0.1:${server.address().port}/`;

// ---- the cover and the app -----------------------------------------------------------------------------------------------
const coverCmd = join(OUT, 'cover.cmd'); writeFileSync(coverCmd, '');
const cover = spawn(COVER, [join(OUT, 'cover.json'), coverCmd, 'cover'], {stdio: 'ignore'});
let cn = 0;
const refront = async () => { cn += 1; writeFileSync(coverCmd, `${cn} front\n`); await sleep(250); osa(`tell application "System Events"\nset frontmost of (first process whose unix id is ${cover.pid}) to true\nend tell`); await sleep(300); };
await sleep(1500);
const FRAME = {x: 420, y: 40, w: 580, h: 640};
let pid, stop, place;
if (BROWSERS.includes(APP)) {
  let child;
  if (APP === 'chrome') child = spawn('/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', [`--user-data-dir=${join(T, `cft328s${HEAD}`)}`, '--no-first-run',
    '--no-default-browser-check', '--disable-search-engine-choice-screen', '--lang=en-US', '--disable-features=Translate', `--window-position=${FRAME.x},${FRAME.y}`, `--window-size=${FRAME.w},${FRAME.h}`, LOCAL], {stdio: 'ignore'});
  else child = await launchOther(LOCAL, join(T, `prof328s-${APP}-${HEAD}`), FRAME);
  for (let i = 0; i < 120 && !ready; i++) await sleep(250);
  await sleep(APP === 'chrome' ? 20_000 : 2500);
  pid = child.pid;
  place = () => placePid(pid, FRAME);
  stop = async () => { if (APP === 'safari') sh('pkill', ['-x', 'Safari']); else if (child.exitCode === null) child.kill('SIGTERM'); await sleep(1500); };
} else if (APP === 'textedit') {
  sh('pkill', ['-x', 'TextEdit']); await sleep(1000);
  const doc = join(T, `sweep328-${HEAD}.txt`);
  writeFileSync(doc, Array.from({length: 80}, (_, i) => `still line ${i} with some words to click`).join('\n'));
  sh('open', ['-a', 'TextEdit', doc]); await sleep(3000);
  pid = pidOf('TextEdit');
  place = () => osa(`tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {${FRAME.x}, ${FRAME.y}}\nset size of window 1 to {${FRAME.w}, ${FRAME.h}}\nend tell\nend tell`);
  stop = async () => { sh('pkill', ['-x', 'TextEdit']); await sleep(1000); };
} else if (APP === 'finder') {
  const dir = join(T, `sweep328files-${HEAD}`); mkdirSync(dir, {recursive: true});
  for (let i = 0; i < 60; i++) writeFileSync(join(dir, `file ${String(i).padStart(2, '0')}.txt`), 'x');
  sh('open', [dir]); await sleep(3000);
  pid = pidOf('Finder');
  place = () => osa(`tell application "System Events"\ntell process "Finder"\nset position of window 1 to {${FRAME.x}, ${FRAME.y}}\nset size of window 1 to {${FRAME.w}, ${FRAME.h}}\nend tell\nend tell`);
  stop = async () => { osa('tell application "System Events" to tell process "Finder" to click button 1 of window 1'); await sleep(800); };
} else {
  const p = spawn(PROBE, [join(OUT, 'probe.json'), join(OUT, 'probe.cmd')], {stdio: 'ignore'});
  writeFileSync(join(OUT, 'probe.cmd'), '');
  await sleep(2500);
  pid = p.pid;
  place = () => {};  // its windows place themselves; a drag that moves one is put back by a relaunch-free re-place below
  stop = async () => { p.kill('SIGTERM'); await sleep(800); };
}
place(); await sleep(500); await refront();

// ---- the engine ------------------------------------------------------------------------------------------------------------
class Wire {
  static connect(p) { return new Promise((res, rej) => { const s = createConnection(p); s.once('connect', () => { s.off('error', rej); res(new Wire(s)); }); s.once('error', rej); }); }
  constructor(s) { this.s = s; this.buf = Buffer.alloc(0); this.pending = new Map(); this.id = 1;
    s.on('data', d => { this.buf = Buffer.concat([this.buf, d]); while (this.buf.length >= 4) { const n = this.buf.readUInt32LE(0); if (this.buf.length < 4 + n) break;
      const m = JSON.parse(this.buf.subarray(4, 4 + n).toString('utf8')); this.buf = this.buf.subarray(4 + n); this.pending.get(m.id)?.(m); this.pending.delete(m.id); } }); s.on('error', () => {}); }
  call(method, params = {}) { const id = this.id++; const b = Buffer.from(JSON.stringify({jsonrpc: '2.0', id, method, params})); const h = Buffer.alloc(4); h.writeUInt32LE(b.length, 0);
    return new Promise((res, rej) => { const t = setTimeout(() => { this.pending.delete(id); rej(new Error(`${method}: no answer`)); }, 60_000); this.pending.set(id, m => { clearTimeout(t); res(m); }); this.s.write(Buffer.concat([h, b])); }); }
  execute(method, args, lineage) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 45_000, ...(lineage ? {lineage} : {})}); }
  close() { this.s.destroy(); }
}
const sockDir = join(T, `s328${HEAD}${Date.now() % 10000}`); mkdirSync(sockDir, {recursive: true, mode: 0o700});
const socket = join(sockDir, 'e.sock');
const engine = spawn(ENGINE, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'ignore', 'ignore']});
const connect = async () => { const w = await Wire.connect(socket); const p = await w.call('ping', {clientApiVersion: 'cua-engine-1', desktop: 'shared'}); if (p.error) throw new Error(JSON.stringify(p.error)); return w; };
for (let i = 0; i < 300; i++) { try { (await connect()).close(); break; } catch { await sleep(50); } }
const observe = async w => {
  const shots = join(T, `shots328s${HEAD}`); mkdirSync(shots, {recursive: true});
  try { const o = await w.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots}); return o.error ? null : o.result; } finally { rmSync(shots, {recursive: true, force: true}); }
};

// ---- the points ------------------------------------------------------------------------------------------------------------
function points(sky) {
  const W = sky.screenshot.width, H = sky.screenshot.height, wf = sky.window.frame, s = W / wf.width;
  const out = [];
  const inside = (sky.nodes ?? []).filter(n => n.frame && n.frame.width > 4 && n.frame.height > 4).map(n => ({x: Math.round((n.frame.x + n.frame.width / 2 - wf.x) * s), y: Math.round((n.frame.y + n.frame.height / 2 - wf.y) * s), role: n.role}))
    .filter(p => p.x > 2 && p.y > 2 && p.x < W - 3 && p.y < H - 3);
  const step = Math.max(1, Math.floor(inside.length / 8));
  inside.filter((_, i) => i % step === 0).slice(0, 8).forEach((p, i) => out.push({kind: 'inside', name: `inside${i}:${p.role}`, x: p.x, y: p.y}));
  for (const d of [0, 1, 2]) {
    out.push({kind: 'edge', name: `left+${d}`, x: d, y: Math.round(H / 2)}, {kind: 'edge', name: `right-${d}`, x: W - 1 - d, y: Math.round(H / 2)},
      {kind: 'edge', name: `top+${d}`, x: Math.round(W / 2), y: d}, {kind: 'edge', name: `bottom-${d}`, x: Math.round(W / 2), y: H - 1 - d});
  }
  for (const d of [0, 2]) out.push({kind: 'corner', name: `tl+${d}`, x: d, y: d}, {kind: 'corner', name: `tr+${d}`, x: W - 1 - d, y: d}, {kind: 'corner', name: `bl+${d}`, x: d, y: H - 1 - d}, {kind: 'corner', name: `br+${d}`, x: W - 1 - d, y: H - 1 - d});
  for (const d of [1, 20]) out.push({kind: 'outside', name: `left-out${d}`, x: -d, y: Math.round(H / 2)}, {kind: 'outside', name: `right-out${d}`, x: W - 1 + d, y: Math.round(H / 2)},
    {kind: 'outside', name: `top-out${d}`, x: Math.round(W / 2), y: -d});
  out.push({kind: 'outside', name: 'bottom-out1', x: Math.round(W / 2), y: H}, {kind: 'outside', name: 'bottom-out20', x: Math.round(W / 2), y: H + 19});
  return {W, H, list: out, centre: {x: Math.round(W / 2), y: Math.round(H / 2)}};
}

// ---- the cells -------------------------------------------------------------------------------------------------------------
const results = [];
const config = {app: APP, head: HEAD, engine: ENGINE, probeCommit: process.env.GITHUB_SHA ?? null};
const save = () => writeFileSync(join(OUT, `sweep-${APP}-${HEAD}.json`), JSON.stringify({config, results}, null, 1));
const w0 = await connect();
const sky0 = await observe(w0); w0.close();
if (!sky0?.screenshot) { results.push({problem: 'no first observation'}); save(); process.exit(0); }
const plan = points(sky0);
config.screenshot = {width: plan.W, height: plan.H};
const cells = [...plan.list.map(p => ({action: 'click', p})), ...plan.list.filter(p => p.kind !== 'inside').map(p => ({action: 'dragTo', p})),
  ...plan.list.filter(p => p.kind === 'edge').map(p => ({action: 'dragFrom', p}))];
for (const c of cells) {
  const row = {app: APP, head: HEAD, action: c.action, kind: c.p.kind, name: c.p.name, x: c.p.x, y: c.p.y};
  const w = await connect();
  try {
    if (front() !== 'com.ssfskim.cover328') await refront();
    const sky = await observe(w);
    if (!sky?.screenshot) throw new Error('no observation');
    row.screenshot = [sky.screenshot.width, sky.screenshot.height];
    const pl = points(sky);
    const p = pl.list.find(q => q.name === c.p.name) ?? pl.list.find(q => q.name.split(':')[0] === c.p.name.split(':')[0]);
    if (!p) throw new Error(`no point ${c.p.name} in this screenshot`);
    row.x = p.x; row.y = p.y;
    const mark = events.length;
    const t0 = Date.now();
    const args = c.action === 'click' ? {x: p.x, y: p.y}
      : c.action === 'dragTo' ? {from_x: pl.centre.x, from_y: pl.centre.y, to_x: p.x, to_y: p.y}
      : {from_x: p.x, from_y: p.y, to_x: pl.centre.x, to_y: pl.centre.y};
    const a = await w.execute(c.action === 'click' ? 'click' : 'drag', {pid, ...args}, sky.lineage);
    row.ms = Date.now() - t0;
    row.answer = a.error ? (a.error.errorName ?? a.error.code) : 'success';
    row.message = a.error ? String(a.error.message ?? '').slice(0, 200) : undefined;
    const meta = a.error ? a.error.meta : a.result?.meta;
    row.posted = meta ? {route: meta.inputRoute ?? null, interval: meta.actionInterval ?? null, delivery: meta.delivery ? true : false} : null;
    await sleep(700);
    if (BROWSERS.includes(APP)) row.page = events.slice(mark).filter(e => e.t >= t0 - 5).map(e => e.k);
  } catch (e) { row.exception = String(e?.stack || e).slice(0, 400); } finally { w.close(); }
  place(); await sleep(300);
  results.push(row); save();
  log(`${APP} ${HEAD} ${c.action} ${c.p.name} (${c.p.x},${c.p.y}): ${row.answer ?? row.problem ?? row.exception} page=${JSON.stringify(row.page ?? null)}`);
}
function front() { return (sh('lsappinfo', ['info', '-only', 'bundleid', sh('lsappinfo', ['front']).out]).out.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] || null; }
save();
engine.kill('SIGTERM'); await sleep(400);
await stop();
cover.kill('SIGTERM'); server.close();
process.exit(0);
