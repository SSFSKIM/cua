// #305's live check on a GitHub-hosted runner: does #296's stale-point guard refuse ordinary coordinate clicks on still
// pages? origin/main's engine (c4057c3a; built with scripts/probe-299/instrument.py, which only adds the guard's record to
// the observation, so points can be picked) observes each spot with a screenshot; scripts/probe-299/classify.mjs
// `pointVerdicts` reads the guard's reason at a 20 pt grid over that record (#301's emulation); up to 6 points it reads as
// `interactiveHit` (a refusal) and 3 it reads as kept are clicked for real, each after the scene is re-set and observed
// again with nothing changed, the point's emulated reason re-read on that observation. Each click's `stalePoint` meta is
// kept; at a refusal (and at the first two emulated refusals that pass) scripts/probe-299/tool.swift's `mech` says why the
// live hit's AXParent chain does or does not reach the recorded node.
//   node scripts/probe-305/live.mjs --group <chrome|safari|finder> --engine <bin> --tool <bin> --out <dir>
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {gzipSync} from 'node:zlib';
import {pointVerdicts} from '../probe-299/classify.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-305: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), ENGINE = arg('engine'), TOOL = arg('tool'), GROUP = arg('group');
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-305:', ...a);
const WIN = {x: 0, y: 40, w: 1024, h: 728};
const GH = ['https://', 'git', 'hub.com'].join('');
const KEPT = new Set(['sameElement', 'hitAboveNode', 'nonInteractiveHit']);

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe305 page</title><style>body{font:16px sans-serif;margin:40px}</style></head>
<body><h1>probe305 page</h1><p>${Array.from({length: 6}, (_, i) => `<button onclick="return false">Inert ${i + 1}</button>`).join(' ')}</p>${Array.from({length: 30}, (_, i) => `<p>Plain paragraph ${i + 1}, text with nothing to click in it at all.</p>`).join('')}</body></html>`;
const server = createServer((req, res) => { res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(PAGE); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const LOCAL = `http://127.0.0.1:${server.address().port}/`;

// ---- the engine, the tool, the shell ------------------------------------------------------------------------------
class Wire {
  static connect(path) { return new Promise((resolve, reject) => { const s = createConnection(path); s.once('connect', () => { s.off('error', reject); resolve(new Wire(s)); }); s.once('error', reject); }); }
  constructor(s) {
    this.s = s; this.chunks = []; this.len = 0; this.pending = new Map(); this.id = 1;
    s.on('data', d => {
      this.chunks.push(d); this.len += d.length;
      for (;;) {
        if (this.len < 4) return;
        if (this.chunks[0].length < 4) this.chunks = [Buffer.concat(this.chunks)];
        const n = this.chunks[0].readUInt32LE(0);
        if (this.len < 4 + n) return;
        let buf = this.chunks.length === 1 ? this.chunks[0] : Buffer.concat(this.chunks);
        const msg = JSON.parse(buf.subarray(4, 4 + n).toString('utf8'));
        buf = buf.subarray(4 + n); this.chunks = buf.length ? [buf] : []; this.len = buf.length;
        this.pending.get(msg.id)?.(msg); this.pending.delete(msg.id);
      }
    });
    s.on('error', () => {});
  }
  call(method, params = {}, timeout = 120_000) {
    const id = this.id++;
    const bytes = Buffer.from(JSON.stringify({jsonrpc: '2.0', id, method, params}), 'utf8');
    const head = Buffer.alloc(4); head.writeUInt32LE(bytes.length, 0);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: no answer`)); }, timeout);
      this.pending.set(id, m => { clearTimeout(t); resolve(m); });
      this.s.write(Buffer.concat([head, bytes]));
    });
  }
  execute(method, args) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 60_000}); }
  close() { this.s.destroy(); }
}
const sockDir = join(OUT, 'sock'); mkdirSync(sockDir, {recursive: true, mode: 0o700});
const SOCKET = join(sockDir, 'engine.sock');
const engine = spawn(ENGINE, [], {env: {...process.env, CUA_ENGINE_SOCKET: SOCKET}, stdio: ['ignore', 'ignore', 'pipe']});
let engineStderr = '';
engine.stderr.on('data', d => { engineStderr = (engineStderr + d).slice(-20_000); });
async function connect() {
  for (let i = 0; i < 300; i++) {
    try {
      const w = await Wire.connect(SOCKET);
      const ping = await w.call('ping', {clientApiVersion: 'cua-engine-1', desktop: 'dedicated'});
      if (ping.error) throw new Error(JSON.stringify(ping.error));
      return w;
    } catch { await sleep(50); }
  }
  throw new Error('engine did not listen');
}
const toolChild = spawn(TOOL, [], {stdio: ['pipe', 'pipe', 'inherit']});
const waiting = [];
createInterface({input: toolChild.stdout}).on('line', l => { try { waiting.shift()?.(JSON.parse(l)); } catch { waiting.shift()?.({error: 'bad answer'}); } });
const ask = (o, timeout = 120_000) => new Promise(resolve => { const t = setTimeout(() => resolve({error: 'tool timeout'}), timeout); waiting.push(v => { clearTimeout(t); resolve(v); }); toolChild.stdin.write(JSON.stringify(o) + '\n'); });
const sh = (cmd, args, timeout = 20_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const pidOf = name => Number(sh('pgrep', ['-x', name]).out.split('\n')[0]) || null;
const place = proc => osa(`tell application "System Events"\ntell process "${proc}"\nset position of window 1 to {${WIN.x}, ${WIN.y}}\nset size of window 1 to {${WIN.w}, ${WIN.h}}\nend tell\nend tell`);
const findKey = (o, k) => { if (!o || typeof o !== 'object') return undefined; if (k in o) return o[k]; for (const v of Object.values(o)) { const f = findKey(v, k); if (f !== undefined) return f; } return undefined; };

// ---- Chrome over --remote-debugging-pipe -------------------------------------------------------------------------
class Cdp {
  constructor(input, output) {
    this.input = input; this.id = 1; this.pending = new Map(); this.buf = '';
    output.on('data', d => {
      this.buf += d.toString('utf8');
      let k;
      while ((k = this.buf.indexOf('\0')) >= 0) { const m = JSON.parse(this.buf.slice(0, k)); this.buf = this.buf.slice(k + 1); if (m.id) { this.pending.get(m.id)?.(m); this.pending.delete(m.id); } }
    });
  }
  send(method, params = {}, session = this.session) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timeout`)); }, 30_000);
      this.pending.set(id, m => { clearTimeout(t); resolve(m); });
      this.input.write(JSON.stringify(session ? {id, method, params, sessionId: session} : {id, method, params}) + '\0');
    });
  }
  async pages() { return ((await this.send('Target.getTargets', {}, null)).result?.targetInfos ?? []).filter(t => t.type === 'page'); }
  async attach(targetId) { this.target = targetId; this.session = (await this.send('Target.attachToTarget', {targetId, flatten: true}, null)).result.sessionId; await this.send('Page.enable'); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true}); return r.result?.result?.value; }
}

// ---- one spot ----------------------------------------------------------------------------------------------------
const results = [];
const config = {group: GROUP, macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), chrome: sh(CFT, ['--version']).out,
  safari: sh('defaults', ['read', '/Applications/Safari.app/Contents/Info', 'CFBundleShortVersionString']).out,
  engineCommit: process.env.P305_ENGINE_COMMIT ?? null, probeCommit: process.env.GITHUB_SHA ?? null, rep: process.env.P305_REP ?? null};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));
const fileName = s => s.replace(/[^a-z0-9-]+/gi, '_');
const hitKey = p => p.hit ? `${p.hit.role}|${Math.round(p.hit.frame.x)},${Math.round(p.hit.frame.y)},${Math.round(p.hit.frame.w)},${Math.round(p.hit.frame.h)}` : 'none';

async function observe(w, pid, label) {
  const shots = join(OUT, 'shots', fileName(label)); mkdirSync(shots, {recursive: true});
  const r = await w.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots});
  if (r.error) throw new Error(`get_app_state: ${JSON.stringify(r.error).slice(0, 400)}`);
  return r.result;
}
/// Spread picks: classes (by the hit element) in `priority` order, up to `perClass` points from each, `max` in all.
function pick(points, max, perClass, priority = () => 0) {
  const classes = new Map();
  for (const p of points) { const k = hitKey(p); if (!classes.has(k)) classes.set(k, []); classes.get(k).push(p); }
  const ordered = [...classes.entries()].sort((a, b) => priority(a[1][0]) - priority(b[1][0]) || b[1].length - a[1].length);
  const out = [];
  for (let round = 0; round < perClass && out.length < max; round++) {
    for (const [, ps] of ordered) {
      if (out.length >= max) break;
      const i = Math.floor((round + 0.5) * ps.length / perClass);
      if (ps[i] && !out.includes(ps[i])) out.push(ps[i]);
    }
  }
  return out;
}

async function spot(s) {
  const row = {spot: s.name, clicks: []};
  results.push(row);
  let w;
  try {
    await s.reset();
    w = await connect();
    const sky = await observe(w, s.pid(), `${s.name}-pick`);
    const wf = sky.window.frame;
    const window = [wf.x, wf.y, wf.width, wf.height];
    const gridFile = join(OUT, `grid-${fileName(s.name)}.json`);
    await ask({op: 'grid', pid: s.pid(), window, step: 20, out: gridFile}, 300_000);
    const grid = JSON.parse(readFileSync(gridFile, 'utf8')).points;
    writeFileSync(`${gridFile}.gz`, gzipSync(readFileSync(gridFile))); spawnSync('rm', [gridFile]);
    writeFileSync(join(OUT, `record-${fileName(s.name)}.json.gz`), gzipSync(JSON.stringify({window: sky.window, probeRecord: sky.probeRecord})));
    const verdicts = pointVerdicts(sky.probeRecord, grid);
    const inRegion = verdicts.filter(p => p.clickable && s.region(p, wf));
    row.emulated = Object.fromEntries([...new Set(inRegion.map(p => p.v))].map(v => [v, inRegion.filter(p => p.v === v).length]));
    const flagged = pick(inRegion.filter(p => p.v === 'interactiveHit'), s.maxFlagged ?? 6, s.perClass ?? 2, s.priority);
    const controls = pick(verdicts.filter(p => p.clickable && KEPT.has(p.v) && (s.controlRegion ?? s.region)(p, wf)), 3, 1);
    log(`${s.name}: emulated in region ${JSON.stringify(row.emulated)}; clicking ${flagged.length} flagged, ${controls.length} controls`);
    let mechKept = 0;
    for (const [kind, p] of [...flagged.map(p => ['flagged', p]), ...controls.map(p => ['control', p])]) {
      const c = {kind, grid: {x: p.x, y: p.y, v: p.v, node: p.node, hit: p.hit}};
      row.clicks.push(c);
      try {
        await s.reset();
        const fresh = await observe(w, s.pid(), `${s.name}-${row.clicks.length}`);
        const f = fresh.window.frame, scale = fresh.screenshot.width / f.width;
        const px = {x: Math.round((p.x - f.x) * scale), y: Math.round((p.y - f.y) * scale)};
        const posted = {x: f.x + px.x / scale, y: f.y + px.y / scale};
        const ch = (await ask({op: 'chains', pid: s.pid(), points: [[posted.x, posted.y]]})).points?.[0] ?? {};
        const now = pointVerdicts(fresh.probeRecord, [{x: posted.x, y: posted.y, chain: ch.chain}])[0];
        Object.assign(c, {px, posted, expected: {v: now.v, node: now.node, hit: now.hit}});
        const r = await w.execute('click', {pid: s.pid(), x: px.x, y: px.y});
        const name = r.error ? (r.error.data?.name ?? r.error.data?.errorName ?? r.error.name ?? findKey(r.error, 'errorName')) : null;
        c.result = r.error ? {error: name, message: String(r.error.message ?? '').slice(0, 400)} : {ok: true};
        c.stalePoint = findKey(r.error ?? r.result, 'stalePoint') ?? null;
        c.refused = r.error ? /screenChangedSinceScreenshot/.test(`${name} ${r.error.message}`) : false;
        await sleep(1500);
        c.effect = await s.effect();
        if ((c.refused || (kind === 'flagged' && mechKept++ < 2)) && now.node) {
          const n = now.node.frame;
          c.mech = await ask({op: 'mech', pid: s.pid(), window: [f.x, f.y, f.width, f.height], x: posted.x, y: posted.y, role: now.node.role, frame: [n.x, n.y, n.w, n.h]}, 60_000);
        }
      } catch (e) { c.exception = String(e?.stack || e).slice(0, 1500); }
      const sp = c.stalePoint;
      log(`  ${s.name} ${kind} (${Math.round(p.x)},${Math.round(p.y)}) expected=${c.expected?.v} node=${c.expected?.node?.role} hit=${c.expected?.hit?.role} -> ${c.refused ? 'REFUSED' : c.result?.ok ? 'kept' : `error ${c.result?.error}`} stalePoint=${JSON.stringify(sp)} effect=${JSON.stringify(c.effect)}${c.mech ? ` mech=${JSON.stringify((c.mech.candidates ?? []).map(m => ({inside: m.hitInsideByAXParent, above: m.candidateInsideHitByAXParent, children: m.hitAmongDescendantsByAXChildren, meet: m.meet && [m.meet.hitLevel, m.meet.candidateLevel, m.meet.at?.role]})))}` : ''}${c.exception ? ` EXC ${c.exception.split('\n')[0]}` : ''}`);
      save();
    }
  } catch (e) { row.exception = String(e?.stack || e).slice(0, 2000); log(`${s.name}: EXCEPTION ${row.exception.split('\n')[0]}`); }
  finally { w?.close(); save(); }
}

// ---- the spots ---------------------------------------------------------------------------------------------------
const below = (wf, top) => p => p.y > top;
async function runChrome() {
  const child = spawn(CFT, [`--user-data-dir=${join(OUT, 'chrome-profile')}`, '--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen',
    '--lang=en-US', '--disable-features=Translate', '--remote-debugging-pipe', `--window-position=${WIN.x},${WIN.y}`, `--window-size=${WIN.w},${WIN.h}`, 'about:blank'],
    {stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe']});
  const launchedAt = Date.now();
  const cdp = new Cdp(child.stdio[3], child.stdio[4]);
  for (let i = 0; i < 60 && !(await cdp.pages().catch(() => [])).length; i++) await sleep(500);
  const first = (await cdp.pages())[0];
  await cdp.attach(first.targetId);
  const pid = () => child.pid;
  const goto = async url => {
    const href = await cdp.eval('location.href').catch(() => null);
    if (href !== url) {
      await cdp.send('Page.navigate', {url});
      for (let i = 0; i < 90; i++) { await sleep(500); if ((await cdp.eval('document.readyState').catch(() => null)) === 'complete') break; }
      await sleep(4000);
    }
    await cdp.eval('window.scrollTo(0, 0)').catch(() => {});
    const left = launchedAt + 25_000 - Date.now(); if (left > 0) await sleep(left);  // past Chrome for Testing's toolbar re-layout
    await sleep(800);
  };
  const effect = async () => ({url: (await cdp.eval('location.href').catch(() => null))?.slice(0, 90), tabs: (await cdp.pages().catch(() => [])).length});
  const WEB_TOP = 174;  // Chrome for Testing's web area top on this runner (#299)
  const wiki = 'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population';
  await spot({name: 'chrome-wiki-links', pid, effect, reset: () => goto(wiki), region: p => p.y > WEB_TOP});
  await spot({name: 'chrome-github-code', pid, effect, reset: () => goto(`${GH}/torvalds/linux/blob/master/kernel/sched/core.c`), region: p => p.y > WEB_TOP,
    priority: p => p.hit?.role === 'AXTextArea' ? 0 : 1});
  // The tab strip: two tabs; a kept close re-opens the second and re-activates the first.
  const second = async () => {
    const pages = await cdp.pages();
    if (pages.length < 2) { await cdp.send('Target.createTarget', {url: LOCAL}, null); await sleep(2500); }
    await cdp.send('Target.activateTarget', {targetId: cdp.target}, null).catch(() => {});
    await sleep(1500);
  };
  await spot({name: 'chrome-tab-strip', pid, effect, reset: async () => { await goto(LOCAL); await second(); }, region: p => p.y < WEB_TOP - 60,
    controlRegion: p => p.y < WEB_TOP - 60, priority: p => p.hit?.role === 'AXButton' ? 0 : 1});
  child.kill('SIGTERM'); await sleep(2000);
}
async function runSafari() {
  const open = async () => { osa('tell application "Safari" to quit'); await sleep(2000); sh('open', ['-a', 'Safari', LOCAL]); await sleep(7000); place('Safari'); await sleep(2000); };
  await open();
  const pid = () => pidOf('Safari');
  const reset = async () => {
    osa('tell application "System Events" to key code 53'); await sleep(300); osa('tell application "System Events" to key code 53'); await sleep(6000);  // past the engine's 5 s intervention debounce
    const tabs = Number(osa('tell application "Safari" to count tabs of window 1').out);
    const name = osa('tell application "Safari" to get name of current tab of window 1').out;
    if (tabs !== 1 || name !== 'probe305 page') await open(); else { place('Safari'); await sleep(800); }
  };
  const effect = async () => ({title: osa('tell application "Safari" to get name of current tab of window 1').out, tabs: osa('tell application "Safari" to count tabs of window 1').out});
  await spot({name: 'safari-toolbar', pid, effect, reset, region: (p, wf) => p.y < wf.y + 56, controlRegion: () => true,
    priority: p => p.hit?.role === 'AXTextField' ? 0 : 1, perClass: 3});
  osa('tell application "Safari" to quit');
}
async function runFinder() {
  const folder = '/System/Library/PrivateFrameworks';
  const pid = () => pidOf('Finder');
  const reset = async () => {
    // A second click on a selected name starts a rename: Escape ends it.
    if (sh('lsappinfo', ['info', '-only', 'bundleid', sh('lsappinfo', ['front']).out]).out.includes('com.apple.finder')) { osa('tell application "System Events" to key code 53'); await sleep(6000); }  // past the engine's 5 s intervention debounce
    const names = osa('tell application "Finder" to get name of every Finder window').out;
    if (!names.includes('PrivateFrameworks')) { sh('open', [folder]); await sleep(3000); osa('tell application "Finder" to set current view of front Finder window to list view'); await sleep(1500); }
    osa('tell application "Finder" to set collapsed of front Finder window to false');
    place('Finder'); await sleep(1200);
  };
  const effect = async () => ({windows: osa('tell application "Finder" to get name of every Finder window').out, bounds: osa('tell application "Finder" to get bounds of front Finder window').out});
  // The title bar's buttons: zoom first (cheap to undo), the close and minimize last; then the list's name fields.
  const button = (p, wf) => p.hit?.role === 'AXButton' && p.y < wf.y + 30;
  const order = (p, wf = {x: 0}) => { const x = p.hit ? p.hit.frame.x - wf.x : 0; return x > 55 && x < 80 ? 0 : x < 30 ? 2 : 1; };
  await spot({name: 'finder-titlebar', pid, effect, reset, region: (p, wf) => button(p, wf), controlRegion: (p, wf) => p.y < wf.y + 60, priority: p => order(p), perClass: 2, maxFlagged: 6});
  await spot({name: 'finder-list-names', pid, effect, reset, region: (p, wf) => p.y > wf.y + 80, perClass: 2});
}

log('config', JSON.stringify(config));
try {
  if (GROUP === 'chrome') await runChrome(); else if (GROUP === 'safari') await runSafari(); else await runFinder();
} catch (e) { config.exception = String(e?.stack || e).slice(0, 2000); log('EXCEPTION', config.exception); }
config.engineStderr = engineStderr.slice(-3000);
save();
engine.kill('SIGKILL'); toolChild.stdin.end(); server.close();
process.exit(0);
