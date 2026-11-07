// #296's hosted A/B of the built stale-point guard (fix/296-stale-point) against main, on a GitHub-hosted macOS runner.
// Both engines run as children of the job shell (its Accessibility, PostEvent and Screen Recording grants); each cell
// gets a fresh engine and connection: observe with a screenshot, change the page (or not), click (or drag) at the
// observation's point of the target, and read the engine's answer (its `stalePoint` meta, the error
// `screenChangedSinceScreenshot`) beside the click's real effect (the page's click and pointerdown beacons, the native
// app's log, Reload's GET). TextEdit stays frontmost unless a cell brings the target forward.
//   --group chrome   the toolbar's Reload before and after its re-layout (a fresh Chrome per cell, shared and dedicated);
//                    the pages in dedicated mode; the shared-mode page cells (#282's route: skipped) with the target in
//                    the background and frontmost; a drag start at a stale and at a still point
//   --group safari   the pages in Safari, shared mode
//   --group native   scripts/probe-296/app.swift's window, shared and dedicated mode
//   --group rerun    the guard on #282's element-routed path (ruling ca82a6f4): shared-mode page cells with Chrome in
//                    the background, a change during the route's re-read on a fresh Chrome, and regression cells
//   --group final    the rerun group, the re-read-window swap at 0.3, 0.6 and 1 s, #294's case in dedicated mode, and a
//                    removed target under another window (no hit); safari-final and native-final: regression sets
//   node scripts/probe-296/ab.mjs --group <g> --branch <cua-engine> --main <cua-engine> --app <Probe296 binary> --out <dir> [--cells <prefix,…>]
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-296 ab: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), APP = arg('app'), GROUP = arg('group');
const ENGINES = {branch: arg('branch'), main: arg('main')};
const ONLY = arg('cells') ? arg('cells').split(',').filter(Boolean) : null;
if (!OUT || !ENGINES.branch || !ENGINES.main || !GROUP) { console.error('usage: ab.mjs --group <g> --branch <bin> --main <bin> --app <bin> --out <dir>'); process.exit(2); }
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-296 ab:', ...a);

// ---- the pages -------------------------------------------------------------------------------------------------
const BODY = {
  toolbar: `<p><b>probe296 toolbar</b></p><p>Plain status text here</p>`,
  static: `<p><button id="static" class="p296-static">Static</button></p>`,
  pulse: `<p style="margin:40px"><button id="pulse" class="p296-pulse">Pulse</button></p>`,
  counter: `<p><span id="counter" class="g"></span> <button id="nextto" class="p296-nextto">Next to</button></p>`,
  label: `<p><button id="label" class="p296-label g">Elapsed 0.0 s</button></p>`,
  feed: `<div id="feedbox" class="p296-feedbox" role="group" aria-label="Feed box"></div>`,
  scroll: `<div id="scrollbox" class="p296-scrollbox" role="group" aria-label="Scroll box"></div>`,
  recreate: `<p id="wrap"></p>`,
  swap: `<p><button id="save" class="p296-save fixed">Save</button></p>`,
  swaprole: `<p><button id="keep" class="p296-keep fixed">Keep</button></p>`,
  like: `<p><button id="like" class="p296-like fixed">Like (12)</button></p>`,
  relabel: `<p><button id="relabel" class="p296-relabel fixed">Save</button></p>`,
  link: `<p><a id="lnk" class="p296-lnk" href="#">Read the full article</a></p>`,
  vanish: `<p><button id="vanish" class="p296-vanish fixed">Archive</button></p>`,
};
const page = c => `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe296 ${c}</title>
<style>body{margin:8px;font:14px sans-serif}button{font:14px sans-serif;padding:6px 12px}.g{font-family:Georgia,serif}
.fixed{width:120px;height:32px;padding:0}a.fixed{display:inline-block;line-height:32px;text-align:center;border:1px solid #888;color:#000;text-decoration:none}
@keyframes pulse{0%{transform:scale(.9)}50%{transform:scale(1.1)}100%{transform:scale(.9)}}#pulse{animation:pulse 1s infinite}
#feedbox{height:330px;width:300px;overflow:hidden;border:1px solid #888}#scrollbox{height:240px;width:300px;overflow:auto;border:1px solid #888}
.item,.row{display:block;width:270px;height:28px;margin:2px;padding:0}</style></head>
<body><p><b>probe296 ${c}</b></p>${BODY[c]}
<script>(() => {
const P = new URLSearchParams(location.search), CASE = P.get('case'), K = P.get('k');
const send = (ev, extra) => navigator.sendBeacon('/b', JSON.stringify({ev, k: K, case: CASE, t: Date.now(), ...extra}));
for (const kind of ['click', 'pointerdown']) document.addEventListener(kind, e => { const t = e.target.closest('[id]'); send(kind, {id: t ? t.id : null, text: t ? t.textContent.trim().slice(0, 40) : null, gen: t && t.dataset.gen, sx: e.screenX, sy: e.screenY, trusted: e.isTrusted}); if (kind === 'click') e.preventDefault(); }, true);
const $ = id => document.getElementById(id);
const mk = (tag, id, text, cls) => { const e = document.createElement(tag); e.id = id; e.textContent = text; e.className = cls; return e; };
if (CASE === 'counter') setInterval(() => { $('counter').textContent = (performance.now() / 1000).toFixed(1); }, 100);
if (CASE === 'label') setInterval(() => { $('label').textContent = 'Elapsed ' + (performance.now() / 1000).toFixed(1) + ' s'; }, 100);
if (CASE === 'recreate') { let gen = 0; const make = () => { const b = mk('button', 'again', 'Again', 'p296-again'); b.dataset.gen = ++gen; $('wrap').replaceChildren(b); }; make(); setInterval(make, 500); }
if (CASE === 'feed') { let n = 0; const add = () => { n += 1; $('feedbox').prepend(mk('button', 'item-' + n, 'Item ' + n, 'item p296-item p296-item-' + n)); return n; };
  for (let i = 0; i < 10; i++) add(); setInterval(() => send('prepend', {n: add()}), 2000); }
if (CASE === 'scroll') { for (let i = 1; i <= 40; i++) $('scrollbox').append(mk('button', 'row-' + i, 'Row ' + i, 'row p296-row p296-row-' + i)); $('scrollbox').scrollTop = 300; }
const run = c => {
  if (c.op === 'nav') location.href = '/?case=' + c.case + '&k=' + c.k;
  else if (c.op === 'scroll') { $('scrollbox').scrollTop += c.by; send('changed', {top: $('scrollbox').scrollTop}); }
  else if (c.op === 'swap') { $('save').replaceWith(mk('button', 'delete', 'Delete', 'p296-delete fixed')); send('changed'); }
  else if (c.op === 'swaprole') { const a = mk('a', 'remove', 'Remove', 'p296-remove fixed'); a.href = '#'; $('keep').replaceWith(a); send('changed'); }
  else if (c.op === 'like') { const b = mk('button', 'like', 'Like (13)', 'p296-like fixed'); b.dataset.gen = 1; $('like').replaceWith(b); send('changed'); }
  else if (c.op === 'relabel') { $('relabel').textContent = 'Delete'; send('changed'); }
  else if (c.op === 'vanish') { $('vanish').remove(); send('changed'); }
};
setInterval(async () => { try { const r = await fetch('/cmd'); for (const c of await r.json()) run(c); } catch {} }, 100);
addEventListener('load', () => send('load')); })();</script></body></html>`;

let beacons = [], loads = 0, commands = [];
const server = createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    loads += 1;
    const c = new URL(req.url, 'http://x').searchParams.get('case') ?? 'toolbar';
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(page(BODY[c] ? c : 'toolbar')); return;
  }
  if (req.method === 'GET' && req.url === '/cmd') { const out = commands; commands = []; res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'}); res.end(JSON.stringify(out)); return; }
  if (req.method === 'GET') { res.writeHead(404); res.end(); return; }
  let body = '';
  req.on('data', d => { body += d; if (body.length > 65536) req.destroy(); });
  req.on('end', () => { try { beacons.push({arrive: Date.now(), ...JSON.parse(body)}); } catch {} res.writeHead(204); res.end(); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;

// ---- the engine's wire and the shell ------------------------------------------------------------------------------
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
  execute(method, args, extra = {}) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 80_000, ...extra}); }
  close() { this.s.destroy(); }
}
const sh = (cmd, args) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout: 20_000}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const fileName = label => label.replace(/[^a-z0-9-]+/gi, '_');
const frontmost = () => {
  const asn = sh('lsappinfo', ['front']).out;
  const info = sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out;
  return (info.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] || info || null;
};
const pidOf = name => Number(sh('pgrep', ['-x', name]).out.split('\n')[0]) || null;
const lean = response => JSON.parse(JSON.stringify(response, (k, v) => (k === 'nodes' || k === 'menuBar' ? `[${Array.isArray(v) ? v.length : '?'} omitted]` : v)));
// The first value under `key` anywhere in `o`.
function find(o, key, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 8) return undefined;
  if (key in o) return o[key];
  for (const v of Object.values(o)) { const f = find(v, key, depth + 1); if (f !== undefined) return f; }
  return undefined;
}

const TEXT_DOC = join(OUT, 'front.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window.\n');
async function frontTextEdit() {
  for (let i = 0; i < 4; i++) {
    if (frontmost() === 'com.apple.TextEdit') break;
    sh('open', ['-a', 'TextEdit', TEXT_DOC]);
    await sleep(1500);
  }
  osa('tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {0, 40}\nset size of window 1 to {380, 300}\nend tell\nend tell');
  return frontmost();
}
async function frontTarget(pid) {
  osa(`tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`);
  await sleep(1000);
  return frontmost();
}
async function startEngine(which, label) {
  const dir = join(OUT, 'sock');
  mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, `${fileName(label).slice(-60)}.sock`);
  const child = spawn(ENGINES[which], [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  child.stdout.on('data', () => {});
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) throw new Error(`engine exited ${child.exitCode}: ${stderr.slice(0, 2000)}`);
    try { return {child, wire: await Wire.connect(socket), stderr: () => stderr}; } catch { await sleep(50); }
  }
  throw new Error(`engine did not listen: ${stderr.slice(0, 2000)}`);
}
async function observe(w, pid, label) {
  const shots = join(OUT, `shots-${fileName(label)}`); mkdirSync(shots, {recursive: true});
  const from = Date.now();
  const state = await w.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots});
  const at = Date.now();
  if (state.error) throw new Error(`get_app_state: ${JSON.stringify(state.error).slice(0, 500)}`);
  return {sky: state.result, at, ms: at - from};
}

// ---- the targets ---------------------------------------------------------------------------------------------------
const centre = f => ({x: f.x + f.width / 2, y: f.y + f.height / 2});
const hasClass = (n, c) => Array.isArray(n.domClassList) && n.domClassList.includes(c);
const findReload = sky => sky.nodes.find(n => n.role === 'AXButton' && /reload/i.test(`${n.title ?? ''} ${n.description ?? ''} ${n.help ?? ''}`));
function findTarget(sky, spec) {
  const nodes = sky.nodes;
  if (spec.kind === 'toolbar') return findReload(sky);
  if (spec.kind === 'native') return nodes.find(n => n.identifier === spec.id && n.role === 'AXButton');
  if (spec.case === 'feed') {
    const box = nodes.find(n => hasClass(n, 'p296-feedbox'));
    const items = nodes.filter(n => hasClass(n, 'p296-item') && n.frame && box?.frame && n.frame.y >= box.frame.y - 1).sort((a, b) => a.frame.y - b.frame.y);
    return items[2];
  }
  if (spec.case === 'scroll') {
    const box = nodes.find(n => hasClass(n, 'p296-scrollbox'));
    if (!box?.frame) return null;
    const mid = box.frame.y + box.frame.height / 2;
    const rows = nodes.filter(n => hasClass(n, 'p296-row') && n.frame && n.frame.y >= box.frame.y && n.frame.y + n.frame.height <= box.frame.y + box.frame.height);
    return rows.sort((a, b) => Math.abs(centre(a.frame).y - mid) - Math.abs(centre(b.frame).y - mid))[0];
  }
  return nodes.find(n => hasClass(n, `p296-${spec.id}`));
}
const targetId = (n, spec) => spec.kind === 'native' ? n.identifier : spec.kind === 'toolbar' ? 'reload'
  : (n.domClassList ?? []).find(c => /^p296-(item|row)-\d+$/.test(c))?.replace(/^p296-/, '') ?? spec.id;
const holds = (f, p) => f && f.width > 0 && f.height > 0 && p.x >= f.x && p.x <= f.x + f.width && p.y >= f.y && p.y <= f.y + f.height;
function deepest(sky, p) {
  let best = null;
  for (const n of sky.nodes) if (holds(n.frame, p) && (!best || n.depth >= best.depth)) best = n;
  return best && {role: best.role, title: best.title, depth: best.depth, frame: best.frame};
}

// ---- the cells -----------------------------------------------------------------------------------------------------
// expect: what the branch should answer; ab: the cell runs on main too.
const W = (c, extra) => ({kind: 'web', case: c, ...extra});
const PAGE_KEPT = [W('label', {id: 'label'}), W('counter', {id: 'nextto'}), W('recreate', {id: 'again', anyGen: true}), W('pulse', {id: 'pulse'}), W('scroll', {name: 'scroll-still'})];
const PAGE_TP = [W('feed', {expect: 'refused/frameMoved'}), W('scroll', {name: 'scroll-moved', mid: {op: 'scroll', by: 90}, expect: 'refused/frameMoved'}),
  W('swap', {id: 'save', mid: {op: 'swap'}, expect: 'refused/nodeGone'}), W('swaprole', {id: 'keep', mid: {op: 'swaprole'}, expect: 'refused'})];
const PAGE_LIMITS = [W('like', {id: 'like', mid: {op: 'like'}, expect: 'refused/nodeGone', limit: 'i'}), W('relabel', {id: 'relabel', mid: {op: 'relabel'}, expect: 'kept', limit: 'ii'})];
const CELLS = [];
// #305's A/B: every cell runs on both heads (the fix and main), whatever its ab flag.
const add = (label, spec, ab) => { for (const engine of ['branch', 'main']) CELLS.push({...spec, label: `${label}/${engine}`, engine}); };
const name = s => s.name ?? s.case;
if (GROUP === 'chrome') {
  for (const mode of ['shared', 'dedicated']) {
    add(`chrome/${mode}/toolbar-reload/1s`, {kind: 'toolbar', app: 'chrome', mode, delay: 1, expect: 'kept'}, true);
    add(`chrome/${mode}/toolbar-reload/launch+24s`, {kind: 'toolbar', app: 'chrome', mode, clickAtLaunchMs: 24_000, expect: 'refused/frameMoved'}, true);
  }
  for (const s of PAGE_KEPT) for (const d of [1, 20]) add(`chrome/dedicated/${name(s)}/${d}s`, {...s, app: 'chrome', mode: 'dedicated', delay: d, expect: 'kept'}, false);
  add('chrome/dedicated/static/1s', {...W('static', {id: 'static'}), app: 'chrome', mode: 'dedicated', delay: 1, expect: 'kept/nonInteractiveHit'}, false);
  add('chrome/dedicated/link/1s', {...W('link', {id: 'lnk'}), app: 'chrome', mode: 'dedicated', delay: 1, expect: 'kept'}, false);
  for (const s of [...PAGE_TP, ...PAGE_LIMITS]) add(`chrome/dedicated/${name(s)}/5s`, {...s, app: 'chrome', mode: 'dedicated', delay: 5}, true);
  add('chrome/dedicated/drag-feed/5s', {...W('feed'), app: 'chrome', mode: 'dedicated', delay: 5, drag: true, expect: 'refused/frameMoved'}, true);
  add('chrome/dedicated/drag-static/5s', {...W('static', {id: 'static'}), app: 'chrome', mode: 'dedicated', delay: 5, drag: true, expect: 'kept'}, true);
  for (const s of [PAGE_TP[0], PAGE_TP[3]]) add(`chrome/shared-back/${name(s)}/5s`, {...s, app: 'chrome', mode: 'shared', delay: 5, expect: 'skipped'}, true);
  for (const s of [PAGE_TP[0], PAGE_TP[3]]) add(`chrome/shared-front/${name(s)}/5s`, {...s, app: 'chrome', mode: 'shared', delay: 5, front: true, expect: 'refused'}, true);
}
// The re-run against the ruling ca82a6f4 (the guard on #282's element-routed path too: before the route, and again just
// before the press after its re-read wait; the pressed element the recorded node or its allowlisted ancestor). Shared
// mode, Chrome in the background, then regression cells from the first A/B.
if (GROUP === 'rerun' || GROUP === 'final') {
  add('chrome/shared-back/feed/5s', {...PAGE_TP[0], app: 'chrome', mode: 'shared', delay: 5, expect: 'refused/frameMoved'}, true);
  add('chrome/shared-back/swaprole/5s', {...PAGE_TP[3], app: 'chrome', mode: 'shared', delay: 5, expect: 'refused'}, true);
  add('chrome/shared-back/swap/5s', {...PAGE_TP[2], app: 'chrome', mode: 'shared', delay: 5, expect: 'refused/nodeGone'}, true);
  add('chrome/shared-back/static/5s', {...W('static', {id: 'static'}), app: 'chrome', mode: 'shared', delay: 5, expect: 'kept'}, true);
  // A fresh Chrome: the first observation's enablement makes its accessibility fresh, so a press 0.1 s later may wait
  // in #282's re-read (up to 2–3 s) for the control's action; the page swaps the target 1 s into the click.
  add('chrome/shared-reread/swap/0.1s', {...W('swap', {id: 'save'}), app: 'chrome', mode: 'shared', delay: 0.1, freshChrome: true,
    midAfterClick: {ms: 1000, cmd: {op: 'swap'}}, expect: 'refused'}, true);
  add('chrome/shared-reread/static/0.1s', {...W('static', {id: 'static'}), app: 'chrome', mode: 'shared', delay: 0.1, freshChrome: true, expect: 'kept'}, true);
  add('chrome/shared/toolbar-reload/1s', {kind: 'toolbar', app: 'chrome', mode: 'shared', delay: 1, expect: 'kept'}, true);
  add('chrome/shared/toolbar-reload/launch+24s', {kind: 'toolbar', app: 'chrome', mode: 'shared', clickAtLaunchMs: 24_000, expect: 'refused/frameMoved'}, true);
  add('chrome/dedicated/recreate/1s', {...PAGE_KEPT[2], app: 'chrome', mode: 'dedicated', delay: 1, expect: 'kept'}, false);
  // The last run's one wrong refusal (a rebuild between its two elements, the hit empty): three more per runner.
  for (const n of [1, 2, 3]) add(`chrome/dedicated/recreate/20s#${n}`, {...PAGE_KEPT[2], app: 'chrome', mode: 'dedicated', delay: 20, expect: 'kept'}, false);
  add('chrome/dedicated/swap/5s', {...PAGE_TP[2], app: 'chrome', mode: 'dedicated', delay: 5}, true);
  add('chrome/dedicated/relabel/5s', {...PAGE_LIMITS[1], app: 'chrome', mode: 'dedicated', delay: 5}, true);
}
// The final A/B (2fdb9c98): the re-read-window swap at 0.3, 0.6 and 1 s into the click, three per runner each, branch
// only (how often a swap Chrome's tree has caught up with is refused at the final check, and how often a late one slips
// past on the old handle); #294's case in dedicated mode; a removed target whose point TextEdit then covers, so the hit
// is none (the sentence's no-hit wording); and the regression sets of Safari and the native window in their own groups.
if (GROUP === 'final') {
  for (const ms of [300, 600, 1000]) for (const n of [1, 2, 3])
    add(`chrome/shared-reread/swap-at-${ms}ms/0.1s#${n}`, {...W('swap', {id: 'save'}), app: 'chrome', mode: 'shared', delay: 0.1, freshChrome: true,
      midAfterClick: {ms, cmd: {op: 'swap'}}, expect: 'refused'}, false);
  add('chrome/dedicated/toolbar-reload/launch+24s', {kind: 'toolbar', app: 'chrome', mode: 'dedicated', clickAtLaunchMs: 24_000, expect: 'refused/frameMoved'}, true);
  add('chrome/dedicated/vanish-covered/5s', {...W('vanish', {id: 'vanish', mid: {op: 'vanish', cover: true}}), app: 'chrome', mode: 'dedicated', delay: 5, expect: 'refused/nodeGone'}, true);
}
// #304's final A/B: the re-read-window swap of the final group (a fresh Chrome, shared mode, the target swapped 1 s into
// the click) eight times per runner, the heads' order alternating, to tell a timing-dependent reason from a head's.
if (GROUP === 'swap-repeat') for (let n = 1; n <= 8; n++) for (const engine of n % 2 ? ['branch', 'main'] : ['main', 'branch']) {
  CELLS.push({...W('swap', {id: 'save'}), app: 'chrome', mode: 'shared', delay: 0.1, freshChrome: true, midAfterClick: {ms: 1000, cmd: {op: 'swap'}},
    expect: 'refused', label: `chrome/shared-reread/swap/0.1s#${n}/${engine}`, engine});
}
if (GROUP === 'safari-final') {
  add('safari/shared/feed/5s', {...PAGE_TP[0], app: 'safari', mode: 'shared', delay: 5, expect: 'refused/frameMoved'}, true);
  add('safari/shared/swap/5s', {...PAGE_TP[2], app: 'safari', mode: 'shared', delay: 5, expect: 'refused/nodeGone'}, true);
  add('safari/shared/label/20s', {...PAGE_KEPT[0], app: 'safari', mode: 'shared', delay: 20, expect: 'kept'}, false);
}
if (GROUP === 'native-final') for (const mode of ['shared', 'dedicated']) {
  for (const [id, op, expect] of [['save', 'swap', 'refused/nodeGone'], ['move', 'move', 'refused/frameMoved'], ['like', 'like', 'refused/nodeGone']])
    add(`native/${mode}/${id}/5s`, {kind: 'native', app: 'native', mode, id, delay: 5, mid: {op}, expect, limit: id === 'like' ? 'i' : undefined}, true);
  add(`native/${mode}/vanish-covered/5s`, {kind: 'native', app: 'native', mode, id: 'vanish', delay: 5, mid: {op: 'vanish', cover: true}, expect: 'refused/nodeGone'}, true);
}
if (GROUP === 'safari') {
  for (const s of PAGE_KEPT) for (const d of [1, 20]) add(`safari/shared/${name(s)}/${d}s`, {...s, app: 'safari', mode: 'shared', delay: d, expect: 'kept'}, false);
  add('safari/shared/link/1s', {...W('link', {id: 'lnk'}), app: 'safari', mode: 'shared', delay: 1, expect: 'kept'}, false);
  for (const s of [...PAGE_TP, ...PAGE_LIMITS]) add(`safari/shared/${name(s)}/5s`, {...s, app: 'safari', mode: 'shared', delay: 5}, true);
}
if (GROUP === 'native') for (const mode of ['shared', 'dedicated']) {
  for (const id of ['label', 'nextto', 'again']) for (const d of [1, 20]) add(`native/${mode}/${id}/${d}s`, {kind: 'native', app: 'native', mode, id, delay: d, expect: 'kept'}, false);
  for (const [id, op, expect] of [['save', 'swap', 'refused/nodeGone'], ['keep', 'swaprole', 'refused'], ['move', 'move', 'refused/frameMoved'], ['like', 'like', 'refused/nodeGone'], ['relabel', 'relabel', 'kept']])
    add(`native/${mode}/${id}/5s`, {kind: 'native', app: 'native', mode, id, delay: 5, mid: {op}, expect, limit: id === 'like' ? 'i' : id === 'relabel' ? 'ii' : undefined}, true);
}
// Cells that launch their own Chrome (the toolbar's, a fresh one) run before the group's shared app is launched.
const RUN = CELLS.filter(c => !ONLY || ONLY.some(p => c.label.startsWith(p))).sort((a, b) => Number(!(a.kind === 'toolbar' || a.freshChrome)) - Number(!(b.kind === 'toolbar' || b.freshChrome)));

// ---- the apps ------------------------------------------------------------------------------------------------------
let navK = 0;
async function nav(c) {
  const k = `k${++navK}`;
  commands.push({op: 'nav', case: c, k});
  for (let i = 0; i < 60; i++) { if (beacons.some(b => b.ev === 'load' && b.k === k)) break; await sleep(200); }
  if (!beacons.some(b => b.ev === 'load' && b.k === k)) throw new Error(`nav to ${c}: no load in 12 s`);
  await sleep(1500);
  return k;
}
async function waitLoad(ms = 40_000) {
  for (let i = 0; i < ms / 250 && !beacons.some(b => b.ev === 'load'); i++) await sleep(250);
  if (!beacons.some(b => b.ev === 'load')) throw new Error('the page did not load');
}
async function launchChrome(label, c) {
  beacons = [];
  const child = spawn(CFT, [`--user-data-dir=${join(OUT, `chrome-${fileName(label)}`)}`, '--no-first-run', '--no-default-browser-check',
    '--disable-search-engine-choice-screen', '--window-position=400,30', '--window-size=620,720', `${URL_}?case=${c}&k=k0`], {stdio: 'ignore'});
  const launchedAt = Date.now();
  await waitLoad();
  return {pid: child.pid, launchedAt, stop: async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await sleep(2000); if (child.exitCode === null) child.kill('SIGKILL'); } }};
}
async function launchSafari() {
  beacons = [];
  osa('tell application "Safari" to quit');
  await sleep(1500);
  sh('open', ['-a', 'Safari', `${URL_}?case=static&k=k0`]);
  await waitLoad();
  const pid = pidOf('Safari');
  osa('tell application "System Events"\ntell process "Safari"\nset position of window 1 to {400, 30}\nset size of window 1 to {620, 720}\nend tell\nend tell');
  await sleep(800);
  return {pid, launchedAt: Date.now(), stop: async () => { osa('tell application "Safari" to quit'); await sleep(1500); }};
}
const CMD = join(OUT, 'native-cmd.txt'), NLOG = join(OUT, 'native-log.jsonl');
let nativeNonce = 0;
const nativeCmd = op => writeFileSync(CMD, `n${++nativeNonce} ${op}\n`);
const nativeLog = () => existsSync(NLOG) ? readFileSync(NLOG, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
async function launchNative() {
  writeFileSync(CMD, '');
  const child = spawn(APP, [CMD, NLOG], {stdio: 'ignore'});
  for (let i = 0; i < 80 && !nativeLog().some(e => e.ev === 'ready'); i++) await sleep(250);
  await sleep(1000);
  return {pid: child.pid, launchedAt: Date.now(), stop: async () => { child.kill('SIGTERM'); await sleep(500); }};
}

// ---- one cell ------------------------------------------------------------------------------------------------------
async function cell(spec, shared) {
  const row = {label: spec.label, spec};
  let engine, fresh;
  try {
    let target = shared;
    if (spec.kind === 'toolbar' || spec.freshChrome) { fresh = await launchChrome(spec.label, spec.kind === 'toolbar' ? 'toolbar' : spec.case); target = fresh; await sleep(1500); }
    row.pid = target.pid;
    if (spec.kind === 'web' && !spec.freshChrome) row.navK = await nav(spec.case);
    row.front = spec.front ? await frontTarget(target.pid) : await frontTextEdit();
    if (spec.kind === 'native') { nativeCmd('reset'); await sleep(400); }
    engine = await startEngine(spec.engine, spec.label);
    const w = engine.wire;
    row.ping = (await w.call('ping', {clientApiVersion: 'cua-engine-1', desktop: spec.mode})).result ?? null;
    let o, node;
    for (let attempt = 0; attempt < 3; attempt++) {
      o = await observe(w, target.pid, `${spec.label}-${attempt}`);
      node = findTarget(o.sky, spec);
      if (node?.frame) break;
      await sleep(1000);
    }
    row.observation = {ms: o.ms, sinceLaunchMs: o.at - target.launchedAt, nodes: o.sky.nodes.length, stalePointRecord: find(o.sky, 'stalePointRecordMs') ?? null, timings: find(o.sky, 'timings') ?? null};
    if (!node?.frame) { row.problem = 'no target node'; row.roles = [...new Set(o.sky.nodes.map(n => n.role))].slice(0, 40); return row; }
    row.target = {role: node.role, title: node.title, frame: node.frame};
    row.intended = targetId(node, spec);
    const wf = o.sky.window.frame, scale = o.sky.screenshot.width / wf.width;
    const c = centre(node.frame);
    const px = {x: Math.round((c.x - wf.x) * scale), y: Math.round((c.y - wf.y) * scale)};
    row.px = px;
    row.point = {x: wf.x + px.x / scale, y: wf.y + px.y / scale};
    row.recorded = deepest(o.sky, row.point);
    const before = beacons.length;
    if (spec.mid) {
      const at = o.at + Math.max(300, spec.delay * 500) - Date.now(); if (at > 0) await sleep(at);
      if (spec.kind === 'native') nativeCmd(spec.mid.op); else commands.push(spec.mid);
      // Another app's window over the point once the target is gone: the hit there is none (Decision Log, limit iii).
      if (spec.mid.cover) { await sleep(300); row.cover = osa(`tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {${Math.round(row.point.x - 150)}, ${Math.round(row.point.y - 100)}}\nset size of window 1 to {300, 200}\nend tell\nend tell`).status; }
      row.midAtMs = Date.now() - o.at;
    }
    const clickAt = spec.clickAtLaunchMs ? target.launchedAt + spec.clickAtLaunchMs : o.at + spec.delay * 1000;
    const wait = clickAt - Date.now(); if (wait > 0) await sleep(wait);
    const loadsBefore = loads, logBefore = nativeLog().length, started = Date.now();
    row.clickAfterObservationMs = started - o.at;
    row.clickSinceLaunchMs = started - target.launchedAt;
    // A change while the click runs (the element route's re-read window on a fresh Chrome).
    if (spec.midAfterClick) setTimeout(() => { commands.push(spec.midAfterClick.cmd); row.midAfterClickAtMs = Date.now() - started; }, spec.midAfterClick.ms);
    const r = lean(spec.drag
      ? await w.execute('drag', {pid: target.pid, from_x: px.x, from_y: px.y, to_x: px.x + Math.round(100 * scale), to_y: px.y})
      : await w.execute('click', {pid: target.pid, x: px.x, y: px.y}));
    row.response = r.error ? {error: r.error} : {result: r.result};
    row.stalePoint = find(r, 'stalePoint') ?? null;
    row.errorName = r.error ? (find(r.error, 'errorName') ?? r.error.name ?? null) : null;
    row.errorMessage = r.error ? String(find(r.error, 'message') ?? '').slice(0, 400) : null;
    row.startedAt = find(r, 'startedAt') ?? null;
    row.endedAt = find(r, 'endedAt') ?? null;
    row.route = find(r, 'inputRoute') ?? null;
    row.elementClick = find(r, 'elementClick') ?? null;
    row.clickMs = Date.now() - started;
    await sleep(spec.kind === 'toolbar' ? 3000 : 1500);
    if (spec.kind === 'toolbar') row.effect = {loadsDelta: loads - loadsBefore, hit: loads - loadsBefore > 0 ? ['reload'] : []};
    else if (spec.kind === 'native') { const ev = nativeLog().slice(logBefore).filter(e => e.ev === 'click'); row.effect = {events: ev, hit: ev.map(e => e.id), text: ev.map(e => e.title)}; }
    else {
      const ev = beacons.slice(before).filter(b => (b.ev === 'click' || b.ev === 'pointerdown') && b.t >= started - 50);
      const clicks = ev.filter(b => b.ev === (spec.drag ? 'pointerdown' : 'click'));
      row.effect = {events: ev.map(b => ({ev: b.ev, id: b.id, text: b.text, gen: b.gen, sx: b.sx, sy: b.sy, dt: b.t - started})), hit: clicks.map(b => b.id).filter(Boolean), text: clicks.map(b => b.text)};
    }
    row.pageEvents = beacons.slice(before).filter(b => ['prepend', 'changed'].includes(b.ev) && b.t >= o.at - 50 && b.t <= started).map(b => ({ev: b.ev, dt: b.t - o.at}));
    // When the page made a change sent during the click (midAfterClick), from the click's start.
    if (spec.midAfterClick) row.changedAfterClickMs = beacons.slice(before).filter(b => b.ev === 'changed' && b.t >= started).map(b => b.t - started);
    try { await w.call('shutdown', {}, 5000); } catch {}
    w.close();
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 3000);
  } finally {
    if (engine) { row.engineStderr = engine.stderr().slice(-1500); if (engine.child.exitCode === null) engine.child.kill('SIGKILL'); }
    if (fresh) await fresh.stop();
    await sleep(500);
  }
  return row;
}

function summary(r) {
  if (r.exception || r.problem) return `PROBLEM ${JSON.stringify(r.problem ?? '')} ${r.exception ?? ''}`;
  const sp = r.stalePoint;
  return `${sp ? `${sp.verdict}/${sp.reason} id=${sp.identity} rec=${sp.recordedRole} hit=${sp.hitRole} ${sp.ms}ms` : 'no stalePoint'} ` +
    `${r.errorName ? `ERROR ${r.errorName} started=${r.startedAt} ` : ''}route=${r.route} el=${JSON.stringify(r.elementClick?.reason ?? r.elementClick?.route ?? null)} intended=${r.intended} effect=${JSON.stringify(r.effect?.hit)} ${JSON.stringify(r.effect?.text ?? '')} ` +
    `expect=${r.spec.expect ?? '-'} record=${JSON.stringify(r.observation?.stalePointRecord)} click@${r.clickAfterObservationMs}ms(launch+${r.clickSinceLaunchMs}) page=${JSON.stringify(r.pageEvents)} msg=${JSON.stringify((r.errorMessage ?? '').slice(0, 200))}`;
}

const config = {
  group: GROUP, imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, runnerName: process.env.RUNNER_NAME ?? null,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), chrome: sh(CFT, ['--version']).out,
  branchCommit: process.env.P296_BRANCH_COMMIT ?? null, mainCommit: process.env.P296_MAIN_COMMIT ?? null, probeCommit: process.env.GITHUB_SHA ?? null, rep: process.env.P296_REP ?? null,
};
log('config', JSON.stringify(config));
const rows = [];
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, cells: rows}, null, 1));
let shared = null;
for (const spec of RUN) {
  if (spec.kind !== 'toolbar' && !spec.freshChrome && !shared) {
    shared = spec.app === 'chrome' ? await launchChrome('pages', 'static') : spec.app === 'safari' ? await launchSafari() : await launchNative();
    log(`${spec.app} launched pid ${shared.pid}`);
    if (spec.app === 'chrome') { const left = shared.launchedAt + 25_000 - Date.now(); if (left > 0) await sleep(left); }  // past the toolbar's re-layout
  }
  const row = await cell(spec, shared);
  rows.push(row);
  save();
  log(`${row.label}: front=${row.front}\n    ${summary(row)}`);
}
if (shared) await shared.stop();
server.close();
process.exit(0);
