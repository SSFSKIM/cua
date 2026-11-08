// #328's hosted measurement: which scroll reaches a background app's scroll area with no raise and no change of the key
// window. Every trial is t328's (scripts/probe-328/t328.swift): one scroll by a posted event (its tap, the pointer, the
// phase, the units, the window fields) or by an element route (no event), read back by Accessibility every 10 ms, the
// window order and the front app watched every 5 ms, behind a frontmost cover app (Cover328, scripts/probe-328/app.swift).
// The probe apps add ground truth: Probe328's own offsets and the scroll events its dispatch and its scroll views saw,
// SwiftUI328's offsets, a page's scrollY. The engine block asks main's engine to scroll the same targets and reads what
// it answered against what moved.
//   node scripts/probe-328/measure.mjs --block <b> --t328 <bin> --app <Probe328 bin> --cover <Cover328 bin>
//     [--swiftui <bin>] [--engine <bin>] [--sets full,split,routes,active,bottom] [--reps n] [--catalyst <app path>] --out <dir>
// Blocks: probe, textedit, finder, notes, settings, mail, swiftui, catalyst, safari, chrome, firefox, engine.
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-328: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
const BLOCK = arg('block'), T328 = arg('t328'), APP = arg('app'), COVER = arg('cover'), SWIFTUI = arg('swiftui'), ENGINE = arg('engine'), OUT = arg('out');
const SETS = arg('sets', 'full,split,routes').split(',');
const REPS = Number(arg('reps', 1));
const CATALYST = arg('catalyst');
const CATALYST_APP = arg('catalyst-app');
if (!BLOCK || !T328 || !APP || !COVER || !OUT) { console.error('usage: measure.mjs --block <b> --t328 --app --cover --out'); process.exit(2); }
const BROWSER = ['safari', 'chrome', 'firefox'].includes(BLOCK) ? BLOCK : 'safari';
process.env.P287_BROWSER = BROWSER;
// Gecko's tree for an AX client that is not the engine: always on (run 42529832136 read only its window buttons).
if (BROWSER === 'firefox') process.env.P287_FIREFOX_A11Y = 'force';
const {launchOther, browserVersion, placePid} = await import('../probe-287/browser.mjs');
mkdirSync(OUT, {recursive: true});
const T = process.env.RUNNER_TEMP || OUT;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-328:', ...a);
const sh = (cmd, args, timeout = 20_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = (script, timeout = 20_000) => sh('osascript', ['-e', script], timeout);
const json = r => { try { return JSON.parse(r.out.split('\n').pop()); } catch { return {status: r.status, out: r.out.slice(0, 500), err: r.err.slice(0, 500)}; } };
const t328 = (...args) => json(sh(T328, args.map(String), 30_000));
const pidOf = name => Number(sh('pgrep', ['-x', name]).out.split('\n')[0]) || null;
const front = () => { const asn = sh('lsappinfo', ['front']).out; return (sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] || null; };
const place = (proc, n, x, y, w, h) => osa(`tell application "System Events"\ntell ${proc}\nset position of window ${n} to {${x}, ${y}}\n${w ? `set size of window ${n} to {${w}, ${h}}\n` : ''}end tell\nend tell`);
const byPid = pid => `(first process whose unix id is ${pid})`;
const AWAY = [190, 190];  // over the cover's window

// ---- the probe apps' processes: a state file and a numbered command file -----------------------------------------------
function spawnApp(bin, label, extra = [], envNames = null) {
  const state = join(OUT, `state-${label}.json`), cmds = join(OUT, `cmd-${label}.txt`);
  writeFileSync(cmds, '');
  // envNames [stateVar, cmdVar]: the paths by environment, no arguments (a SwiftUI app launched with a path argument
  // opens it as a document and presents no window: smoke run 42523332336).
  const child = envNames ? spawn(bin, extra, {stdio: 'ignore', env: {...process.env, [envNames[0]]: state, [envNames[1]]: cmds}})
    : spawn(bin, [state, cmds, ...extra], {stdio: 'ignore'});
  let n = 0;
  return {child, pid: child.pid, read: () => { try { return JSON.parse(readFileSync(state, 'utf8')); } catch { return null; } },
    send: async (cmd, wait = 250) => { n += 1; writeFileSync(cmds, `${n} ${cmd}\n`); await sleep(wait); },
    stop: async () => { if (child.exitCode === null) child.kill('SIGTERM'); await sleep(500); }};
}
let cover = null;
async function startCover() {
  cover = spawnApp(COVER, 'cover', ['cover']);
  await sleep(2000);
  await refront();
}
async function refront() {
  await cover.send('front', 250);
  osa(`tell application "System Events"\nset frontmost of ${byPid(cover.pid)} to true\nend tell`);
  await sleep(350);
  return front();
}

// ---- the page, for the browsers -------------------------------------------------------------------------------------------
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>probe328 page</title><style>body{font:15px sans-serif;margin:12px}p{margin:6px 0;height:22px}</style></head>
<body>${Array.from({length: 300}, (_, i) => `<p>page row ${i}</p>`).join('')}
<script>history.scrollRestoration='manual';let seq=0;const send=()=>navigator.sendBeacon('/s',JSON.stringify({seq:++seq,y:scrollY,max:document.documentElement.scrollHeight-innerHeight}));
addEventListener('scroll',send);setInterval(send,200);setInterval(()=>fetch('/cmd',{cache:'no-store'}).then(r=>r.text()).then(t=>{if(t==='top')scrollTo(0,0)}).catch(()=>{}),100);
addEventListener('load',()=>{scrollTo(0,0);navigator.sendBeacon('/ready');send()});</script></body></html>`;
let page = null, pageReady = false, pageCmd = '';
const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') { res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(PAGE); return; }
  if (req.url === '/cmd') { res.writeHead(200, {'content-type': 'text/plain', 'cache-control': 'no-store'}); res.end(pageCmd); pageCmd = ''; return; }
  let body = ''; req.on('data', d => { body += d; }); req.on('end', () => { if (req.url === '/ready') pageReady = true; if (req.url === '/s') { try { page = JSON.parse(body); } catch {} } res.writeHead(204); res.end(); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const LOCAL = `http://127.0.0.1:${server.address().port}/`;

// ---- the trial sets ---------------------------------------------------------------------------------------------------------
const post = (o = {}) => ({route: 'post', post: {tap: 'pid', units: 'pixel', phase: 'none', fields: 'vendor', ...o.post}, pointer: o.pointer ?? 'away', name: o.name});
function setOf(name) {
  const out = [];
  if (name === 'full') {
    for (const tap of ['pid', 'session', 'hid']) for (const pointer of ['over', 'away']) for (const phase of ['none', 'gesture'])
      for (const units of ['pixel', 'line']) for (const fields of ['vendor', 'none'])
        out.push(post({pointer, post: {tap, units, phase, fields}, name: `post/${tap}/${pointer}/${phase}/${units}/${fields}`}));
  }
  if (name === 'split') {
    const v = [['f9192', {fields: '9192'}], ['f51', {fields: '51'}], ['floc', {fields: 'loc'}], ['fnoloc', {fields: 'vendor-noloc'}], ['cont0', {continuous: 0}],
      ['line+cont1', {units: 'line', continuous: 1}], ['moved', {pre: 'moved'}], ['srcCombined', {source: 'combined'}], ['srcNil', {source: 'nil'}], ['momentum', {phase: 'momentum'}],
      ['annotated', {tap: 'annotated'}]];
    for (const pointer of ['over', 'away']) for (const [n, p] of v) out.push(post({pointer, post: p, name: `split/${n}/${pointer}`}));
    for (const pointer of ['over', 'away']) out.push({...post({pointer, name: `split/appPid/${pointer}`}), pidFrom: 'app'});
    // To the topmost window under the point, its owner and its number (WindowServer's routing, by pid).
    for (const pointer of ['over', 'away']) out.push({...post({pointer, name: `split/cgWindow/${pointer}`}), pidFrom: 'cg'});
    // To another process's layer-0 window under the point, listed on screen or not (a remote view's service).
    for (const pointer of ['over', 'away']) out.push({...post({pointer, name: `split/remote/${pointer}`}), pidFrom: 'remote'});
  }
  if (name === 'smoke') {
    out.push(post({name: 'post/pid/away/none/pixel/vendor'}), post({pointer: 'over', post: {tap: 'hid'}, name: 'post/hid/over/none/pixel/vendor'}),
      post({pointer: 'over', name: 'post/pid/over/none/pixel/vendor'}), post({post: {phase: 'gesture'}, name: 'post/pid/away/gesture/pixel/vendor'}));
    for (const route of ['barWrite', 'scrollToVisible', 'none']) out.push({route, pointer: 'away', name: `ax/${route}`});
    out.push({...post({name: 'split/cgWindow/away'}), pidFrom: 'cg'}, {...post({post: {fields: 'none'}, name: 'post/pid/away/none/pixel/none'})});
  }
  if (name === 'routes' || name === 'smoke-routes') {
    for (const route of ['barWrite', 'barIncrement', 'pagePress', 'arrowPress', 'scrollByPage', 'scrollToVisible', 'visibleRange', 'makeRectVisible', 'none'])
      out.push({route, pointer: 'away', name: `ax/${route}`});
  }
  if (name === 'web') {
    for (const tap of ['pid', 'hid']) for (const pointer of ['over', 'away']) for (const phase of ['none', 'gesture'])
      out.push(post({pointer, post: {tap, phase}, name: `post/${tap}/${pointer}/${phase}/pixel/vendor`}));
  }
  if (name === 'active') {
    for (const pointer of ['away', 'over']) out.push({...post({pointer, name: `active/post/pid/${pointer}`}), active: true});
  }
  if (name === 'outside') {
    // #324's point: the centre of the content's whole frame, below the window when the text is long.
    for (const pointer of ['away', 'over']) for (const tap of ['pid', 'hid']) out.push({...post({pointer, post: {tap}, name: `outside/${tap}/${pointer}`}), at: 'content'});
  }
  if (name === 'bottom') {
    out.push({...post({name: 'bottom/post/pid/away', post: {}}), bottom: true, direction: 'down'}, {route: 'barWrite', pointer: 'away', name: 'bottom/ax/barWrite', bottom: true, direction: 'down'});
  }
  return out;
}

// ---- one trial ------------------------------------------------------------------------------------------------------------
async function trial(target, spec, rep) {
  const row = {block: BLOCK, target: target.name, rep, name: spec.name};
  try {
    await target.reset();
    if (spec.bottom) await target.bottom?.();
    if (spec.active) { await target.activate(); }
    else {
      const f = front();
      if (f !== 'com.ssfskim.cover328') { row.refronted = f; await refront(); }
    }
    await sleep(250);
    const truthBefore = target.truth?.();
    const s = {pid: target.pid, cover: cover.pid, win: target.win, area: target.area, route: spec.route, post: spec.post, pointer: spec.pointer,
      ...(spec.at ? {at: spec.at} : {}), ...(spec.pidFrom ? {pidFrom: spec.pidFrom} : {}),
      away: AWAY, direction: spec.direction ?? 'auto', delta: 120, watchMs: 1200, settleMs: 900};
    const t0 = Date.now();
    const r = json(sh(T328, ['trial', JSON.stringify(s)], 30_000));
    await sleep(150);
    const truthAfter = target.truth?.();
    Object.assign(row, r, {spec: undefined});
    row.spec = {route: s.route, post: s.post, pointer: s.pointer, at: s.at, pidFrom: s.pidFrom};
    row.truth = target.judge ? target.judge(truthBefore, truthAfter, t0) : null;
    row.frontAfter = front();
    if (spec.active) { await refront(); }
  } catch (e) { row.exception = String(e?.stack || e).slice(0, 800); }
  return row;
}
const say = r => log(`${r.target} r${r.rep} ${r.name}: moved=${r.movedPx ?? '-'}(${r.movedBy ?? '-'}) truth=${JSON.stringify(r.truth ?? null)?.slice(0, 160)} first=${r.firstMoveMs ?? '-'} cost=${r.costMs ?? '-'} raised=${r.raised} front=${JSON.stringify(r.frontOther ?? [])} keys=${JSON.stringify(r.keysAfter ?? {})} ${r.error ?? ''}${r.exception ?? ''} ${JSON.stringify(r.detail ?? {}).slice(0, 160)}`);

// ---- the targets ---------------------------------------------------------------------------------------------------------
const scanOf = pid => t328('scan', pid);
const areaBy = (scan, pred) => {
  for (const w of scan.windows ?? []) for (const a of w.areas ?? []) if (pred(a, w)) return {win: w.index, area: a.index, title: w.title};
  return null;
};
// Scrollable: its content taller than it, an enabled bar, or (no AXScrollArea in the window: Catalyst) a page scroll advertised.
const scrollableAreas = scan => (scan.windows ?? []).flatMap(w => (w.areas ?? []).filter(a => a.scrollable === true || (a.bar && a.bar.enabled !== false)
  || (a.role && a.role !== 'AXScrollArea' && ((a.actions ?? []).includes('AXScrollDownByPage') || a.role === 'AXWebArea'))).map(a => ({win: w.index, area: a.index, title: w.title, id: a.id, role: a.content?.role ?? a.role})));
const barReset = (pid, win, area) => async () => { t328('setbar', pid, win, area, 0); await sleep(150); };

async function probeTargets() {
  const app = spawnApp(APP, 'probe');
  await sleep(2500);
  await refront();
  const scan = scanOf(app.pid);
  writeFileSync(join(OUT, 'scan-probe.json'), JSON.stringify(scan, null, 1));
  const view = id => {
    const at = areaBy(scan, a => a.id === id);
    if (!at) return null;
    return {name: `probe/${id}`, pid: app.pid, win: at.title, area: at.area,
      reset: async () => { await app.send('reset', 200); }, bottom: async () => { await app.send(`bottom ${id}`, 200); },
      activate: async () => { await app.send('front', 400); },
      truth: () => app.read(),
      judge: (b, a, t0) => ({y: [b?.views?.[id]?.y ?? null, a?.views?.[id]?.y ?? null], wheels: (a?.views?.[id]?.wheels ?? 0),
        reached: (a?.wheels ?? []).filter(w => w.t >= t0 - 5).map(w => w.at === 'app' ? `app:${w.window ?? 'nil'}:${w.phase}:${w.active ? 'act' : 'bg'}` : `${w.at}:${w.view}`).slice(0, 8),
        key: a?.key ?? null, main: a?.main ?? null, active: a?.active ?? null})};
  };
  return {targets: ['B.text', 'A.text', 'A.table', 'B.legacy'].map(view).filter(Boolean), stop: () => app.stop(), scan};
}
async function texteditTarget() {
  sh('pkill', ['-x', 'TextEdit']); await sleep(1500);
  const doc = join(T, 'target328.txt');
  writeFileSync(doc, Array.from({length: 200}, (_, i) => `textedit line ${i} with some words to scroll past`).join('\n') + '\n');
  sh('open', ['-a', 'TextEdit', doc]); await sleep(3000);
  place('process "TextEdit"', 1, 420, 40, 560, 420);
  await sleep(500);
  await refront();
  const pid = pidOf('TextEdit');
  const scan = scanOf(pid);
  writeFileSync(join(OUT, 'scan-textedit.json'), JSON.stringify(scan, null, 1));
  const at = areaBy(scan, (a, w) => /target328/.test(w.title ?? '') && a.content?.role === 'AXTextArea') ?? areaBy(scan, a => a.content?.role === 'AXTextArea');
  return {targets: at ? [{name: 'textedit/text', pid, win: at.title, area: at.area, reset: barReset(pid, at.title, at.area),
    bottom: async () => { t328('setbar', pid, at.title, at.area, 1); await sleep(150); }, activate: async () => { osa(`tell application "System Events"\nset frontmost of ${byPid(pid)} to true\nend tell`); await sleep(400); }}] : [],
    stop: async () => { sh('pkill', ['-x', 'TextEdit']); await sleep(1000); }, scan};
}
async function systemAppTargets(name, open, setup, label = BLOCK) {
  if (open) { sh('open', open); await sleep(5000); }
  const pid = pidOf(name);
  if (!pid) return {targets: [], stop: async () => {}, scan: {error: `${name} is not running`}};
  if (setup) await setup(pid);
  await sleep(800);
  await refront();
  const scan = scanOf(pid);
  writeFileSync(join(OUT, `scan-${label}.json`), JSON.stringify(scan, null, 1));
  const areas = scrollableAreas(scan).slice(0, 3);
  return {targets: areas.map(a => ({name: `${label}/${a.id ?? a.role ?? 'area'}#${a.win}.${a.area}`, pid, win: a.win, area: a.area, reset: barReset(pid, a.win, a.area),
    bottom: async () => { t328('setbar', pid, a.win, a.area, 1); await sleep(150); }, activate: async () => { osa(`tell application "System Events"\nset frontmost of ${byPid(pid)} to true\nend tell`); await sleep(400); }})),
    stop: async () => { if (name !== 'Finder') sh('pkill', ['-x', name]); await sleep(1000); }, scan, pid};
}
async function catalystTargets() {
  const state = join(OUT, 'state-catalyst.json'), cmds = join(OUT, 'cmd-catalyst.txt');
  writeFileSync(cmds, '');
  sh('open', ['-n', '-a', CATALYST_APP, '--env', `CATALYST328_STATE=${state}`, '--env', `CATALYST328_CMD=${cmds}`]);
  let pid = null;
  for (let i = 0; i < 40 && !pid; i++) { await sleep(250); pid = pidOf('Catalyst328'); }
  await sleep(3000);
  if (!pid) return {targets: [], stop: async () => {}, scan: {error: 'Catalyst328 did not start'}};
  place(byPid(pid), 1, 420, 40, 560, 420);
  await sleep(600);
  await refront();
  const scan = scanOf(pid);
  writeFileSync(join(OUT, 'scan-catalyst328.json'), JSON.stringify(scan, null, 1));
  let n = 0;
  const read = () => { try { return JSON.parse(readFileSync(state, 'utf8')); } catch { return null; } };
  return {targets: scrollableAreas(scan).slice(0, 2).map(a => ({name: `catalyst328/${a.role ?? 'area'}#${a.win}.${a.area}`, pid, win: a.win, area: a.area,
    reset: async () => { n += 1; writeFileSync(cmds, `${n} reset\n`); await sleep(400); },
    activate: async () => { osa(`tell application "System Events"\nset frontmost of ${byPid(pid)} to true\nend tell`); await sleep(400); },
    truth: read, judge: (b, x) => ({offsets: [b?.offsets ?? null, x?.offsets ?? null], scrolls: (x?.scrolls ?? 0)})})),
    stop: async () => { sh('pkill', ['-x', 'Catalyst328']); await sleep(1000); }, scan};
}
async function swiftuiTargets() {
  const app = spawnApp(SWIFTUI, 'swiftui', [], ['SWIFTUI328_STATE', 'SWIFTUI328_CMD']);
  await sleep(3500);
  place(byPid(app.pid), 1, 420, 40, null, null);
  await sleep(400);
  await refront();
  const scan = scanOf(app.pid);
  writeFileSync(join(OUT, 'scan-swiftui.json'), JSON.stringify(scan, null, 1));
  const areas = scrollableAreas(scan);
  const which = a => (a.id ?? '').includes('list') || a.role === 'AXOutline' || a.role === 'AXTable' || a.role === 'AXList' ? 'list' : 'scroll';
  return {targets: areas.slice(0, 2).map(a => ({name: `swiftui/${which(a)}#${a.win}.${a.area}`, pid: app.pid, win: a.win, area: a.area,
    reset: async () => { await app.send('reset', 400); }, activate: async () => { osa(`tell application "System Events"\nset frontmost of ${byPid(app.pid)} to true\nend tell`); await sleep(400); },
    truth: () => app.read(), judge: (b, x, t0) => ({offsets: [b?.offsets ?? null, x?.offsets ?? null], reached: (x?.wheels ?? []).filter(w => w.t >= t0 - 5).length})})),
    stop: () => app.stop(), scan};
}
async function browserTargets() {
  pageReady = false; page = null;
  let child;
  const frame = {x: 400, y: 30, w: 620, h: 700};
  if (BROWSER === 'chrome') {
    child = spawn('/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', [`--user-data-dir=${join(T, 'cft328')}`, '--no-first-run', '--no-default-browser-check',
      '--disable-search-engine-choice-screen', '--lang=en-US', '--disable-features=Translate', `--window-position=${frame.x},${frame.y}`, `--window-size=${frame.w},${frame.h}`, '--force-renderer-accessibility', LOCAL], {stdio: 'ignore'});
  } else child = await launchOther(LOCAL, join(T, `prof328-${BROWSER}`), frame);
  for (let i = 0; i < 120 && !pageReady; i++) await sleep(250);
  await sleep(BROWSER === 'chrome' ? 20_000 : 2500);
  placePid(child.pid, frame);
  await refront();
  // An observation-like warm-up: Chromium builds its tree for an AX client on first contact.
  scanOf(child.pid); await sleep(2500);
  const scan = scanOf(child.pid);
  writeFileSync(join(OUT, `scan-${BROWSER}.json`), JSON.stringify(scan, null, 1));
  const web = areaBy(scan, a => a.content?.role === 'AXWebArea') ?? scrollableAreas(scan)[0];
  const stop = async () => { if (BROWSER === 'safari') sh('pkill', ['-x', 'Safari']); else if (child.exitCode === null) child.kill('SIGTERM'); await sleep(1500); };
  if (!web) return {targets: [], stop, scan};
  return {targets: [{name: `${BROWSER}/page`, pid: child.pid, win: web.win ?? web.title, area: web.area,
    reset: async () => { pageCmd = 'top'; await sleep(400); }, activate: async () => { osa(`tell application "System Events"\nset frontmost of ${byPid(child.pid)} to true\nend tell`); await sleep(400); },
    truth: () => (page ? {...page} : null), judge: (b, a) => ({y: [b?.y ?? null, a?.y ?? null]})}], stop, scan};
}

// ---- main's engine: what it answers for the same scrolls -------------------------------------------------------------------
class Wire {
  static connect(path) { return new Promise((res, rej) => { const s = createConnection(path); s.once('connect', () => { s.off('error', rej); res(new Wire(s)); }); s.once('error', rej); }); }
  constructor(s) {
    this.s = s; this.buf = Buffer.alloc(0); this.pending = new Map(); this.id = 1;
    s.on('data', d => { this.buf = Buffer.concat([this.buf, d]); while (this.buf.length >= 4) { const n = this.buf.readUInt32LE(0); if (this.buf.length < 4 + n) break;
      const m = JSON.parse(this.buf.subarray(4, 4 + n).toString('utf8')); this.buf = this.buf.subarray(4 + n); this.pending.get(m.id)?.(m); this.pending.delete(m.id); } });
    s.on('error', () => {});
  }
  call(method, params = {}, timeout = 60_000) {
    const id = this.id++; const bytes = Buffer.from(JSON.stringify({jsonrpc: '2.0', id, method, params}), 'utf8'); const head = Buffer.alloc(4); head.writeUInt32LE(bytes.length, 0);
    return new Promise((res, rej) => { const t = setTimeout(() => { this.pending.delete(id); rej(new Error(`${method}: no answer`)); }, timeout); this.pending.set(id, m => { clearTimeout(t); res(m); }); this.s.write(Buffer.concat([head, bytes])); });
  }
  execute(method, args, lineage) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 45_000, ...(lineage ? {lineage} : {})}); }
  close() { this.s.destroy(); }
}
async function withEngine(desktop, fn) {
  const dir = join(T, `e328${Date.now() % 100000}`); mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, 'e.sock');
  const child = spawn(ENGINE, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'ignore', 'pipe']});
  let err = ''; child.stderr.on('data', d => { err = (err + d).slice(-4000); });
  const connect = async () => { const w = await Wire.connect(socket); const p = await w.call('ping', {clientApiVersion: 'cua-engine-1', desktop}); if (p.error) throw new Error(JSON.stringify(p.error)); return w; };
  let ok = false;
  for (let i = 0; i < 300 && !ok; i++) { try { (await connect()).close(); ok = true; } catch { await sleep(50); } }
  try { if (!ok) throw new Error(`engine did not listen: ${err.slice(0, 1000)}`); return await fn(connect); }
  finally { child.kill('SIGTERM'); await sleep(400); if (child.exitCode === null) child.kill('SIGKILL'); await sleep(300); }
}
const lean = r => (r.error ? {error: {name: r.error.errorName ?? r.error.code, message: String(r.error.message ?? '').slice(0, 300), meta: r.error.meta ?? null}} : {result: {meta: r.result?.meta ?? null}});
async function engineCells(connect, target, desktop, reps) {
  const rows = [];
  for (let rep = 1; rep <= reps; rep++) for (const how of ['coordinate', 'element', 'nodeCentre', ...(target.bottom ? ['end'] : [])]) {
    const row = {block: 'engine', desktop, target: target.name, rep, name: `engine/${how}`};
    const w = await connect();
    try {
      await target.reset();
      if (how === 'end') await target.bottom();
      if (front() !== 'com.ssfskim.cover328') await refront();
      const truthBefore = target.truth?.();
      const shots = join(T, 'shots328'); mkdirSync(shots, {recursive: true});
      const o = await w.execute('get_app_state', {pid: target.pid, includeScreenshot: true, outputDirectory: shots});
      rmSync(shots, {recursive: true, force: true});
      if (o.error) { row.problem = lean(o); rows.push(row); continue; }
      const sky = o.result, nodes = sky.nodes ?? [];
      const before = t328('read', target.pid, target.win, target.area).pos;
      const vp = target.viewport;
      const inside = n => n.frame && vp && n.frame.x <= vp[0] + vp[2] / 2 && n.frame.x + n.frame.width >= vp[0] + vp[2] / 2 && n.frame.y <= vp[1] + vp[3] / 2 && n.frame.y + n.frame.height >= vp[1] + vp[3] / 2;
      let args;
      const wf = sky.window?.frame, s = sky.screenshot?.width && wf ? sky.screenshot.width / wf.width : 1;
      row.screenshot = sky.screenshot ? {width: sky.screenshot.width, height: sky.screenshot.height} : null;
      row.windowFrame = wf ?? null;
      if (how === 'coordinate' || how === 'end') {
        if (!wf || !vp) { row.problem = 'no window frame or viewport'; rows.push(row); continue; }
        args = {direction: 'down', x: Math.round((vp[0] + vp[2] / 2 - wf.x) * s), y: Math.round((vp[1] + vp[3] / 2 - wf.y) * s)};
      } else if (how === 'nodeCentre') {
        // #324's kit: the centre of the first text area's frame (its whole content, for a long text), in the screenshot's pixels.
        const n = nodes.find(x => x.role === 'AXTextArea' && x.frame) ?? nodes.find(x => /AXTable|AXOutline|AXList/.test(x.role) && x.frame);
        if (!n || !wf) { row.problem = 'no text area node'; rows.push(row); continue; }
        row.node = {role: n.role, frame: n.frame};
        args = {direction: 'down', x: Math.round((n.frame.x + n.frame.width / 2 - wf.x) * s), y: Math.round((n.frame.y + n.frame.height / 2 - wf.y) * s)};
        row.inScreenshot = row.screenshot ? args.x >= 0 && args.y >= 0 && args.x < row.screenshot.width && args.y < row.screenshot.height : null;
      } else {
        const n = nodes.filter(inside).filter(n => /AXScrollArea|AXTextArea|AXWebArea|AXTable|AXOutline|AXList/.test(n.role)).sort((a, b) => a.frame.width * a.frame.height - b.frame.width * b.frame.height)[0];
        if (!n) { row.problem = `no node at the viewport (${[...new Set(nodes.map(x => x.role))].join(',')})`; rows.push(row); continue; }
        row.node = {role: n.role, frame: n.frame};
        args = {direction: 'down', element: n.token};
      }
      // t328 reads and watches around the engine's scroll as around its own trials.
      const tc = spawn(T328, ['trial', JSON.stringify({pid: target.pid, cover: cover.pid, win: target.win, area: target.area, route: 'external', pointer: 'none', direction: 'down', watchMs: 1200, settleMs: 900})], {stdio: ['pipe', 'pipe', 'ignore']});
      let tout = '';
      tc.stdout.on('data', d => { tout += d; });
      for (let i = 0; i < 100 && !tout.includes('"ready"'); i++) await sleep(50);
      const exited = new Promise(r => tc.on('exit', r));
      tc.stdin.write('go\n');
      const t0 = Date.now();
      const a = lean(await w.execute('scroll', {pid: target.pid, ...args}, sky.lineage));
      row.ms = Date.now() - t0;
      await Promise.race([exited, sleep(15_000)]);
      try { const r = JSON.parse(tout.trim().split('\n').pop()); row.read = {movedPx: r.movedPx, movedBy: r.movedBy, measures: r.measures, barDelta: r.barDelta, firstMoveMs: r.firstMoveMs, raised: r.raised, frontOther: r.frontOther, keysBefore: r.keysBefore, keysAfter: r.keysAfter}; } catch { row.read = {bad: tout.slice(-300)}; }
      const after = t328('read', target.pid, target.win, target.area).pos;
      row.args = {...args, element: args.element ? 'token' : undefined};
      row.answer = a.error ? a.error.name : 'success';
      row.message = a.error?.message;
      row.route = (a.error ? a.error.meta : a.result.meta)?.inputRoute ?? null;
      row.meta = (a.error ? a.error.meta : a.result.meta) ?? null;
      row.before = before; row.after = after;
      row.movedPx = before?.offset != null && after?.offset != null ? Math.round((after.offset - before.offset) * 10) / 10 : null;
      row.trackedPx = before?.trackedY != null && after?.trackedY != null ? before.trackedY - after.trackedY : null;
      row.bar = [before?.bar ?? null, after?.bar ?? null];
      row.truth = target.judge ? target.judge(truthBefore, target.truth?.(), t0) : null;
      row.front = front();
    } catch (e) { row.exception = String(e?.stack || e).slice(0, 800); } finally { w.close(); }
    rows.push(row);
    log(`engine ${desktop} ${row.target} r${rep} ${how}: ${row.answer ?? JSON.stringify(row.problem) ?? row.exception} route=${row.route} read=${JSON.stringify(row.read)?.slice(0, 200)} args=${JSON.stringify(row.args)} shot=${JSON.stringify(row.screenshot)} truth=${JSON.stringify(row.truth)?.slice(0, 120)}`);
  }
  return rows;
}

// ---- the run ---------------------------------------------------------------------------------------------------------------
const config = {block: BLOCK, sets: SETS, reps: REPS, imageVersion: process.env.ImageVersion ?? null, macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '),
  probeCommit: process.env.GITHUB_SHA ?? null, mainCommit: process.env.P328_MAIN_COMMIT ?? null, browser: ['safari', 'chrome', 'firefox'].includes(BLOCK) ? browserVersion() : null,
  screen: sh('system_profiler', ['SPDisplaysDataType'], 30_000).out.match(/Resolution: .*/)?.[0] ?? null};
const results = [];
const save = () => writeFileSync(join(OUT, `results-${BLOCK}.json`), JSON.stringify({config, results}, null, 1));
save();
await startCover();
log('config', JSON.stringify(config), 'cover', cover.pid, 'front', front());

let block;
const viewportOf = (scan, t) => { const w = (scan.windows ?? []).find(x => x.index === t.win || x.title === t.win || (typeof t.win === 'string' && (x.title ?? '').includes(t.win))); return w?.areas?.find(a => a.index === t.area)?.frame ?? null; };
try {
  switch (BLOCK) {
    case 'probe': block = await probeTargets(); break;
    case 'textedit': block = await texteditTarget(); break;
    case 'finder': {
      const dir = join(T, 'probe328files'); mkdirSync(dir, {recursive: true});
      for (let i = 0; i < 160; i++) writeFileSync(join(dir, `file ${String(i).padStart(3, '0')}.txt`), 'x');
      block = await systemAppTargets('Finder', [dir], async () => {
        osa('tell application "Finder" to set current view of front window to list view', 10_000);
        place('process "Finder"', 1, 420, 40, 560, 420);
      });
      break;
    }
    case 'notes':
      block = await systemAppTargets('Notes', ['-a', 'Notes'], async pid => {
        await sleep(2000);
        // Its first-run sheet (What's New, smoke2 run 42525896744) by its Continue button.
        config.notesContinue = t328('press', pid, 'Continue');
        await sleep(1500);
        osa('tell application "System Events" to tell process "Notes" to repeat with b in (buttons of window 1 whose name is in {"Continue", "Get Started", "Not Now", "OK"})\nclick b\nend repeat', 10_000);
        // A new note, its text pasted: an Apple Event to Notes hangs on the runner (smoke run 42523332336).
        spawnSync('pbcopy', {input: Array.from({length: 150}, (_, i) => `notes line ${i} with words`).join('\n')});
        config.notesMake = osa('tell application "System Events"\nset frontmost of process "Notes" to true\ndelay 0.5\nkeystroke "n" using command down\ndelay 1\nkeystroke "v" using command down\ndelay 1\nend tell', 15_000);
        // The paste never reached the body (run 42526444701: a sheet over it, the body one viewport tall): the sheet
        // cancelled, the body's text written by Accessibility.
        config.notesCancel = t328('press', pid, 'Cancel');
        const bodyFile = join(T, 'notes328.txt');
        writeFileSync(bodyFile, Array.from({length: 150}, (_, i) => `notes line ${i} with words`).join('\n'));
        await sleep(800);
        config.notesBody = t328('setvalue', pid, 'Note Body Text View', bodyFile);
        await sleep(1500);
        place('process "Notes"', 1, 420, 40, 600, 440);
      });
      break;
    case 'settings':
      block = await systemAppTargets('System Settings', ['-b', 'com.apple.systempreferences'], async () => { place('process "System Settings"', 1, 400, 40, 620, 420); await sleep(800); });
      break;
    case 'mail':
      block = await systemAppTargets('Mail', ['-a', 'Mail'], async () => { await sleep(3000); place('process "Mail"', 1, 420, 40, null, null); });
      break;
    case 'catalyst': {
      const name = CATALYST ? CATALYST.split('/').pop().replace(/\.app$/, '') : null;
      config.catalyst = name;
      block = name ? await systemAppTargets(name, ['-a', CATALYST], async pid => {
        await sleep(3000);
        config.catalystContinue = t328('press', pid, '*');  // Stocks' first-run privacy sheet: its Continue button has no title
        await sleep(2500);
        place(`process "${name}"`, 1, 420, 40, 600, 440);
      }) : {targets: [], stop: async () => {}, scan: {error: 'no Catalyst app'}};
      break;
    }
    case 'swiftui': block = await swiftuiTargets(); break;
    case 'catalyst328': block = await catalystTargets(); break;
    case 'safari': case 'chrome': case 'firefox': block = await browserTargets(); break;
    case 'engine': break;
    default: throw new Error(`unknown block ${BLOCK}`);
  }
  if (block) {
    config.targets = block.targets.map(t => t.name);
    config.scanSummary = (block.scan.windows ?? []).map(w => ({title: w.title, areas: (w.areas ?? []).map(a => ({i: a.index, id: a.id, role: a.content?.role, scrollable: a.scrollable,
      bar: a.bar ? {settable: a.bar.settable, actions: a.bar.actions, kids: a.bar.children?.map(k => k.subrole)} : null, actions: a.actions, belowFold: a.belowFold?.role ?? null, bfActions: a.belowFold?.actions ?? null}))}));
    log('targets', JSON.stringify(config.targets), 'scan', JSON.stringify(config.scanSummary).slice(0, 2000));
    save();
    for (let rep = 1; rep <= REPS; rep++) for (const t of block.targets) {
      t.viewport = viewportOf(block.scan, t);
      const sets = SETS.flatMap(setOf);
      for (const spec of (rep % 2 ? sets : [...sets].reverse())) { const row = await trial(t, spec, rep); results.push(row); say(row); }
      save();
    }
    await block.stop();
  } else {
    // The engine block: main's engine, shared and dedicated, on the probe app's key window, TextEdit and Safari.
    const run = async (mk, desktop, reps) => {
      const b = await mk();
      for (const t of b.targets) t.viewport = viewportOf(b.scan, t);
      await withEngine(desktop, async connect => { for (const t of b.targets) results.push(...await engineCells(connect, t, desktop, reps)); });
      save();
      await b.stop();
    };
    const keyOnly = mk => async () => { const b = await mk(); b.targets = b.targets.filter(t => /B\.text|B\.legacy|textedit|swiftui|catalyst|finder|settings/.test(t.name)); return b; };
    await run(keyOnly(probeTargets), 'shared', REPS);
    await run(texteditTarget, 'shared', REPS);
    await run(keyOnly(swiftuiTargets), 'shared', REPS);
    if (CATALYST_APP) await run(keyOnly(catalystTargets), 'shared', REPS);
    await run(keyOnly(async () => { const dir = join(T, 'probe328files'); mkdirSync(dir, {recursive: true}); for (let i = 0; i < 160; i++) writeFileSync(join(dir, `file ${String(i).padStart(3, '0')}.txt`), 'x');
      return systemAppTargets('Finder', [dir], async () => { place('process "Finder"', 1, 420, 40, 560, 420); }, 'finder'); }), 'shared', REPS);
    await run(keyOnly(() => systemAppTargets('System Settings', ['-b', 'com.apple.systempreferences'], async () => { place('process "System Settings"', 1, 400, 40, 620, 420); await sleep(800); }, 'settings')), 'shared', REPS);
    await run(keyOnly(probeTargets), 'dedicated', Math.max(1, REPS - 1));
    await run(texteditTarget, 'dedicated', Math.max(1, REPS - 1));
  }
} catch (e) {
  results.push({block: BLOCK, exception: String(e?.stack || e).slice(0, 1500)});
  log('EXCEPTION', String(e?.stack || e).slice(0, 800));
}
save();
await cover.stop();
server.close();
process.exit(0);
