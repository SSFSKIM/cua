// #454's measurement kit: an item of an open pop-up menu (layer 101), taken or not, per menu, route and desktop mode, on
// one engine head built unmodified. Built on #452's qualification kit (scripts/probe-337/qualify.mjs): the same page,
// re-sets, cover and Apple-Events-free TextEdit handling.
//
// Each row: a re-set, one observation, the menu opened kit-side by AXPress on its pop-up button (every route but
// `button`), a re-observation whose screenshot holds it, the menu's facts (its CG window, the observation's nodes in it,
// the item's AX chain and actions), then one route on the same item:
//   coord    the engine's coordinate click on the item, placed in the re-observation's screenshot (today's case)
//   element  the engine's element click on the item's node of the re-observation, when the observation lists it
//   keys     the engine's press_key Down until the item is highlighted, then Return
//   outside  the engine's coordinate click on the observed window outside the menu (a dismiss)
//   button   no menu opened: the engine's coordinate click on the closed pop-up button
//   kit:<s>  the kit's own click posted to the app (tool.swift `post`, not the engine): the engine's events stamped to
//            the observed window (`observed`), to the menu's window (`menu`), to no window (`none`), or a HID click (`hid`);
//            `warp-<s>` with the cursor moved to the point first, `move-<s>` with a mouse-moved before the down,
//            `warpmove-<s>` both
// After it: the pop-up button's value, the page's change beacons, the caret, and whether the menu is still up.
//
// Menus: select (Chrome, a <select>'s native menu), font (TextEdit's format-bar font family pop-up), typeface (TextEdit's
// typeface pop-up), language (Script Editor's document language pop-up).
// Modes: shared-behind (a Finder window frontmost as the cover), shared-front, dedicated-behind; kit routes only in the
// two shared ones (the desktop mode is the engine's, and the kit's post does not go through it).
//
//   node scripts/probe-454/menus.mjs --engine <bin> --tool <bin> --out <dir> [--reps n] [--menus a,b] [--routes a,b]
//        [--modes a,b] [--budget minutes]
// Runs only on a GitHub-hosted runner: it launches, places and closes its own apps.
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {launch, placePid, version} from '../probe-316/browser.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-454: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const list = name => arg(name)?.split(',').map(s => s.trim()).filter(Boolean);
const OUT = arg('out'), TOOL = arg('tool'), ENGINE = arg('engine');
const REPS = Number(arg('reps') ?? 5);
const ONLY_MENUS = list('menus'), ONLY_ROUTES = list('routes'), ONLY_MODES = list('modes');
const BUDGET_MS = Number(arg('budget') ?? 140) * 60_000;
const STARTED = Date.now();
mkdirSync(join(OUT, 'screens'), {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-454:', ...a);
const WIN = {x: 400, y: 30, w: 620, h: 720};
const COVER = {x: 0, y: 40, w: 380, h: 300};
const sh = (cmd, args, timeout = 20_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const pidOf = name => Number(sh('pgrep', ['-x', name]).out.split('\n')[0]) || null;
const fileName = s => s.replace(/[^a-z0-9-]+/gi, '_');
const frontmost = () => {
  const asn = sh('lsappinfo', ['front']).out;
  return (sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] ?? null;
};
const setFront = pid => osa(`tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`).status;

// ---- the page (#452's): a <select>, three buttons low on the page; pointer, focus, input and change events beaconed.
const SCRIPT = `<script>(() => { const load = Math.random().toString(36).slice(2, 10);
const send = (type, extra) => navigator.sendBeacon('/ev', JSON.stringify({load, origin: location.origin, path: location.pathname, type, t: Date.now(), ...extra}));
const idOf = t => { const e = t && t.closest ? t.closest('[id]') : null; return e ? e.id : (t && t.tagName) || null; };
for (const k of ['pointerdown', 'mousedown', 'click', 'focusin', 'submit']) document.addEventListener(k, e => send(k, {id: idOf(e.target), trusted: e.isTrusted}), true);
for (const k of ['input', 'change']) document.addEventListener(k, e => send(k, {id: idOf(e.target), value: e.target.value ?? null}), true);
const run = c => { if (c === 'reload') location.replace('/'); if (c.startsWith('goto:')) location.replace(c.slice(5)); };
(async () => { for (;;) { try { const r = await fetch('/cmd?load=' + load, {cache: 'no-store'}); const j = await r.json(); if (j.cmd) run(j.cmd); } catch (e) { await new Promise(r => setTimeout(r, 500)); } } })();
addEventListener('load', () => send('ready', {}));
})();</script>`;
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe454 page</title>
<style>body{font:15px -apple-system,Helvetica,sans-serif;margin:0} .a{position:absolute;left:16px}</style></head>
<body id="page"><div id="wrap" style="position:relative;height:560px">
<h3 class="a" style="top:2px;margin:0">probe454 page</h3>
<div class="a" style="top:40px"><select id="sel" aria-label="Choice"><option>One</option><option>Two</option><option>Three</option></select> <button id="top" type="button" style="margin-left:120px">Top</button></div>
<div class="a" style="top:440px"><button id="b1" type="button">Alpha</button> <button id="b2" type="button">Beta</button> <button id="b3" type="button">Gamma</button></div>
</div>${SCRIPT}</body></html>`;

const events = [];
let pollers = [], queued = null;
function serve(req, res) {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
    res.end(PAGE);
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/cmd')) {
    if (queued) { res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify({cmd: queued})); queued = null; return; }
    pollers.push(res);
    const t = setTimeout(() => { pollers = pollers.filter(p => p !== res); res.writeHead(200, {'content-type': 'application/json'}); res.end('{}'); }, 15_000);
    res.on('close', () => clearTimeout(t));
    return;
  }
  let body = '';
  req.on('data', d => { body += d; if (body.length > 8192) req.destroy(); });
  req.on('end', () => {
    if (req.url === '/ev') { try { events.push({...JSON.parse(body), at: Date.now()}); } catch {} }
    res.writeHead(204); res.end();
  });
}
const server = createServer(serve);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;
const sendCmd = c => {
  const live = pollers; pollers = [];
  if (!live.length) { queued = c; return; }
  for (const p of live) { try { p.writeHead(200, {'content-type': 'application/json'}); p.end(JSON.stringify({cmd: c})); } catch {} }
};
const lastReady = () => [...events].reverse().find(e => e.type === 'ready') ?? null;
async function newLoad(prev, ms = 9000) {
  for (let i = 0; i < ms / 100; i++) { const l = lastReady(); if (l && l.load !== prev) return l; await sleep(100); }
  return null;
}

// ---- the engine's wire --------------------------------------------------------------------------------------------
class Wire {
  static connect(path) { return new Promise((resolve, reject) => { const s = createConnection(path); s.once('connect', () => { s.off('error', reject); resolve(new Wire(s)); }); s.once('error', reject); }); }
  constructor(s) {
    this.s = s; this.chunks = []; this.len = 0; this.pending = new Map(); this.id = 1; this.lineage = null;
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
  call(method, params = {}, timeout = 90_000) {
    const id = this.id++;
    const bytes = Buffer.from(JSON.stringify({jsonrpc: '2.0', id, method, params}), 'utf8');
    const head = Buffer.alloc(4); head.writeUInt32LE(bytes.length, 0);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: no answer`)); }, timeout);
      this.pending.set(id, m => { clearTimeout(t); resolve(m); });
      this.s.write(Buffer.concat([head, bytes]));
    });
  }
  async execute(method, args) {
    const r = await this.call('execute', {method, args, lineage: this.lineage, deadlineUnixMilliseconds: Date.now() + 60_000});
    if (r.result?.lineage) this.lineage = r.result.lineage;
    return r;
  }
  close() { this.s.destroy(); }
}
const SOCK_DIR = join(process.env.RUNNER_TEMP ?? OUT, 's454'); mkdirSync(SOCK_DIR, {recursive: true, mode: 0o700});
const SOCKET = join(SOCK_DIR, 'e.sock');
let engine = null, engineErr = '';
function startEngine() {
  rmSync(SOCKET, {force: true});
  engine = spawn(ENGINE, [], {env: {...process.env, CUA_ENGINE_SOCKET: SOCKET}, stdio: ['ignore', 'ignore', 'pipe']});
  engine.stderr.on('data', d => { engineErr = (engineErr + d).slice(-20_000); });
}
async function connect(mode) {
  if (!engine || engine.exitCode !== null) { log('engine (re)start'); startEngine(); }
  for (let i = 0; i < 300; i++) {
    try {
      const w = await Wire.connect(SOCKET);
      const ping = await w.call('ping', {clientApiVersion: 'cua-engine-1', desktop: mode});
      if (ping.error) throw new Error(JSON.stringify(ping.error));
      return w;
    } catch { await sleep(50); }
  }
  throw new Error('engine did not listen');
}
const tool = spawn(TOOL, [], {stdio: ['pipe', 'pipe', 'inherit']});
const waiting = [];
createInterface({input: tool.stdout}).on('line', l => { try { waiting.shift()?.(JSON.parse(l)); } catch { waiting.shift()?.({error: 'bad answer'}); } });
const ask = (o, timeout = 30_000) => new Promise(resolve => { const t = setTimeout(() => resolve({error: 'tool timeout'}), timeout); waiting.push(v => { clearTimeout(t); resolve(v); }); tool.stdin.write(JSON.stringify(o) + '\n'); });

// ---- shared steps -------------------------------------------------------------------------------------------------
const errName = r => r?.error ? (r.error.data?.errorName ?? r.error.data?.name ?? r.error.errorName ?? r.error.name ?? r.error.code ?? 'error') : null;
const metaOf = r => r?.error ? (r.error.data?.meta ?? r.error.meta ?? null) : (r?.result?.meta ?? null);
function brief(r) {
  const m = metaOf(r) ?? {};
  return {error: errName(r), message: r?.error ? String(r.error.message ?? '') : null, route: m.inputRoute ?? null,
    stalePoint: m.stalePoint ?? null, posted: m.startedAt != null, note: r?.result?.note ?? null, meta: m};
}
async function observe(w, pid, lab) {
  const shots = join(OUT, 'shots', fileName(lab)); mkdirSync(shots, {recursive: true});
  const r = await w.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots});
  if (r.error) throw new Error(`get_app_state: ${JSON.stringify(r.error).slice(0, 400)}`);
  return r.result;
}
const label = n => [n.title, n.description, n.value, n.placeholder].filter(v => typeof v === 'string' && v).join(' | ');
function findNode(sky, roles, want) {
  return sky.nodes.find(n => roles.includes(n.role) && n.frame && n.frame.width > 2 && n.frame.height > 2 && [n.title, n.description, n.placeholder].some(s => typeof s === 'string' && s.trim() === want));
}
function toPixels(sky, p) {
  const f = sky.window.frame, scale = sky.screenshot.width / f.width;
  const px = {x: Math.round((p.x - f.x) * scale), y: Math.round((p.y - f.y) * scale)};
  return {px, screen: {x: f.x + px.x / scale, y: f.y + px.y / scale}};
}
const centre = f => ({x: f.x + f.width / 2, y: f.y + f.height / 2});
const winArr = f => [f.x, f.y, f.width, f.height];
const rect = a => a && {x: a[0], y: a[1], width: a[2], height: a[3]};
const inside = (p, r) => Boolean(r) && p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
const within = (f, r) => f.x >= r.x - 1 && f.y >= r.y - 1 && f.x + f.width <= r.x + r.width + 1 && f.y + f.height <= r.y + r.height + 1;
const rowLabel = r => [r.title, r.description, r.value].filter(v => typeof v === 'string' && v).join(' | ');

/// The menu's elements a picker chooses from: its AX rows, then the two hit scans' (frames inside the menu's window).
function candidates(pop) {
  const pr = rect(pop.popup.bounds);
  const out = [];
  for (const [by, xs] of [['ax', pop.axRows ?? []], ['scan', pop.scan ?? []], ['systemScan', pop.systemScan ?? []]]) {
    for (const r of xs) { const f = rect(r.frame); if (r.role && f && f.width >= 6 && f.height >= 6 && within(f, pr)) out.push({by, ...r, f}); }
  }
  return out;
}
const pick = (c, extra = {}) => c && {by: c.by, role: c.role, title: c.title ?? null, label: rowLabel(c), frame: c.frame, point: centre(c.f), ...extra};
/// The item titled `want`, else the first enabled item after the checked one (`current`), on screen inside the menu.
function menuPick(pop, current, want) {
  const pr = rect(pop.popup.bounds);
  const items = candidates(pop).filter(c => /AXMenuItem/.test(c.role) && c.title && c.f.y >= 0 && c.f.y + c.f.height <= 880)
    .filter((c, i, a) => a.findIndex(d => d.title === c.title) === i).sort((a, b) => a.f.y - b.f.y);
  if (want) return pick(items.find(c => c.title === want) ?? candidates(pop).find(c => rowLabel(c).split(' | ').includes(want)), {expect: want});
  const at = items.findIndex(r => r.mark || r.title === current);
  const next = items.slice(at + 1).find(r => r.enabled !== false && r.title !== current && within(r.f, pr));
  return next ? pick(next, {expect: next.title}) : null;
}

const MENUS = {
  select: {app: 'chrome', find: {roles: ['AXPopUpButton', 'AXComboBox', 'AXMenuButton'], any: '^Choice'}, current: 'One', want: 'Three',
    node: sky => sky.nodes.find(n => ['AXPopUpButton', 'AXComboBox', 'AXMenuButton'].includes(n.role) && /^Choice/.test(label(n)) && n.frame?.width > 4)},
  font: {app: 'textedit', find: {roles: ['AXPopUpButton'], value: 'Helvetica'}, current: 'Helvetica',
    node: sky => sky.nodes.find(n => n.role === 'AXPopUpButton' && n.value === 'Helvetica')},
  typeface: {app: 'textedit', find: {roles: ['AXPopUpButton'], value: 'Regular'}, current: 'Regular',
    node: sky => sky.nodes.find(n => n.role === 'AXPopUpButton' && n.value === 'Regular')},
  language: {app: 'scripteditor', find: {roles: ['AXPopUpButton'], value: 'AppleScript'}, current: 'AppleScript', want: 'JavaScript',
    node: sky => sky.nodes.find(n => n.role === 'AXPopUpButton' && n.value === 'AppleScript')},
};
// #454's qualification cells: menus opened another way, their item's effect read by `taken` (the engine's own click for
// a context menu; the kit's AX press on a menu-bar item; the kit's HID hover on a submenu's parent).
const WIN_MB = {x: 60, y: 30, w: 620, h: 720};  // under the menu bar's Edit and Format menus, so their items lie in the window
const SENTINEL = 'p454-sentinel';
const engineRightClick = async (c, point) => {
  const {px} = toPixels(c.sky0, point);
  const r = await c.w.execute('click', {pid: c.pid, x: px.x, y: px.y, mouse_button: 'right'});
  c.row.rightClick = brief(r);
  await sleep(900);
  const pop = await ask({op: 'popup', pid: c.pid, window: winArr(c.sky0.window.frame)});
  c.row.openedBy = pop.popup?.layer >= 100 ? 'engine right click' : null;
  return Boolean(c.row.openedBy);
};
Object.assign(MENUS, {
  // TextEdit's context menu on a selected word (the selection written through AX), Copy taken when the pasteboard holds it.
  tectx: {app: 'textedit', want: 'Copy',
    open: async c => {
      sh('bash', ['-c', `printf %s ${SENTINEL} | pbcopy`]);
      c.row.steps.push({step: 'select', answer: await ask({op: 'select', pid: c.pid, phrase: 'eol12', window: winArr(c.sky0.window.frame)})});
      const tp = await ask({op: 'textpoint', pid: c.pid, phrase: 'eol12', after: 2, window: winArr(c.sky0.window.frame)});
      if (tp.error) throw Object.assign(new Error(`textpoint ${tp.error}`), {setup: true});
      if (!(await engineRightClick(c, {x: tp.x, y: tp.y}))) {
        const r = await ask({op: 'open', pid: c.pid, find: {roles: ['AXTextArea']}, action: 'AXShowMenu'}, 15_000);
        c.row.steps.push({step: 'open:AXShowMenu', answer: r});
        c.row.openedBy = 'kit AXShowMenu';
        await sleep(900);
      }
    },
    taken: () => sh('pbpaste', []).out === 'eol12'},
  // Chrome's page context menu (a right click on the page's blank area), Reload taken when the page loads again.
  chromectx: {app: 'chrome', want: 'Reload',
    open: async c => {
      const f = c.sky0.window.frame;
      if (!(await engineRightClick(c, {x: f.x + 300, y: f.y + 250}))) {
        const r = await ask({op: 'open', pid: c.pid, find: {roles: ['AXWebArea']}, action: 'AXShowMenu'}, 15_000);
        c.row.steps.push({step: 'open:AXShowMenu', answer: r});
        c.row.openedBy = 'kit AXShowMenu';
        await sleep(900);
      }
    },
    taken: ctx => ctx.ev.some(e => e.type === 'ready' && e.load !== ctx.row.loadObserved)},
  // TextEdit's Edit menu from the menu bar (the kit's AXPress on the bar item), Select All taken when the selection is all.
  menubar: {app: 'textedit', frame: WIN_MB, want: 'Select All', bar: ['Edit'],
    open: async c => { c.row.steps.push({step: 'menu:Edit', answer: await ask({op: 'menu', pid: c.pid, path: ['Edit']}, 15_000)}); c.row.openedBy = 'kit AXPress on the bar item'; await sleep(900); },
    taken: ctx => Array.isArray(ctx.caretAfter?.range) && ctx.caretAfter.range[0] === 0 && ctx.caretAfter.range[1] === ctx.caretAfter.length && ctx.caretAfter.length > 0},
  // TextEdit's Format > Font submenu (the bar item pressed, then the kit's HID hover on Font; AXPress on Font if no
  // submenu shows), Show Colors taken when a new window of TextEdit (the colour panel) is on screen.
  submenu: {app: 'textedit', frame: WIN_MB, want: 'Show Colors', bar: ['Format', 'Font'],
    open: async c => {
      c.row.steps.push({step: 'menu:Format', answer: await ask({op: 'menu', pid: c.pid, path: ['Format']}, 15_000)});
      await sleep(700);
      const font = await ask({op: 'menuinfo', pid: c.pid, bar: ['Format'], title: 'Font'});
      const f = rect(font.item?.frame);
      if (!f) throw Object.assign(new Error('no Font item'), {setup: true});
      await ask({op: 'hover', x: f.x + f.width / 2, y: f.y + f.height / 2});
      await sleep(900);
      const menus = ((await ask({op: 'popup', pid: c.pid, window: winArr(c.sky0.window.frame)})).appWindows ?? []).filter(x => x.layer >= 100).length;
      c.row.openedBy = menus >= 2 ? 'kit AXPress on the bar item, HID hover on Font' : null;
      if (!c.row.openedBy) {
        c.row.steps.push({step: 'pressitem:Font', answer: await ask({op: 'pressitem', pid: c.pid, bar: ['Format'], title: 'Font'}, 15_000)});
        c.row.openedBy = 'kit AXPress on the bar item, AXPress on Font';
        await sleep(900);
      }
    },
    taken: ctx => (ctx.after.appWindows ?? []).some(x => x.layer < 100 && x.bounds[2] >= 150 && x.bounds[3] >= 150 && !(ctx.before.appWindows ?? []).some(y => y.n === x.n))},
});
const ROUTES = ['coord', 'element', 'keys', 'outside', 'button', 'kit:observed', 'kit:menu', 'kit:none', 'kit:hid',
  'kit:warp-observed', 'kit:warp-menu', 'kit:move-menu', 'kit:warpmove-menu', 'kit:move-hid'];
const MODES = [
  {name: 'shared-behind', desktop: 'shared', front: false},
  {name: 'shared-front', desktop: 'shared', front: true},
  {name: 'dedicated-behind', desktop: 'dedicated', front: false},
];

// ---- the apps -----------------------------------------------------------------------------------------------------
const finderCover = join(process.env.RUNNER_TEMP ?? OUT, 'p454cover');
mkdirSync(finderCover, {recursive: true});
const LINES = Array.from({length: 22}, (_, i) => `Line ${String(i + 1).padStart(2, '0')} words of a plain document ending eol${String(i + 1).padStart(2, '0')}`);
const teFile = join(OUT, 'p454.rtf');
writeFileSync(teFile, `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs28\n${LINES.map(l => `${l}\\par`).join('\n')}\n}`);
const seFile = join(OUT, 'p454.applescript');
writeFileSync(seFile, LINES.map(l => `-- ${l}`).join('\n') + '\nreturn 1\n');
const TEXT_PHRASES = [['eol20', 2], ['eol16', 2], ['eol12', 2], ['Line 20', 1], ['Line 16', 1], ['Line 12', 1], ['eol08', 2], ['eol04', 2], ['Line 08', 1], ['Line 04', 1], ['eol02', 2], ['Line 02', 1]];

async function raiseFinderCover() {
  sh('open', [finderCover]);
  await sleep(700);
  osa(`tell application "Finder" to set bounds of front Finder window to {${COVER.x}, ${COVER.y}, ${COVER.x + COVER.w}, ${COVER.y + COVER.h}}`);
  setFront(pidOf('Finder'));
  await sleep(700);
}
async function escapeTwice(pid) {
  try { const w = await connect('shared'); for (let i = 0; i < 2; i++) { await w.execute('press_key', {pid, key: 'Escape'}); await sleep(250); } w.close(); } catch {}
}

function chromeApp() {
  const profileRoot = join(process.env.RUNNER_TEMP ?? OUT, 'p454c');
  let b = null, launches = 0;
  const relaunch = async () => {
    if (b && b.exitCode === null) { b.kill('SIGTERM'); for (let i = 0; i < 20 && b.exitCode === null; i++) await sleep(250); if (b.exitCode === null) b.kill('SIGKILL'); await sleep(1000); }
    launches++;
    const prev = lastReady()?.load ?? null;
    b = await launch('stable', URL_, join(profileRoot, String(launches)), WIN);
    if (!(await newLoad(prev, 30_000))) throw new Error('Chrome did not load the page');
    const left = b.launchedAt + 22_000 - Date.now(); if (left > 0) await sleep(left);
    placePid(b.pid, WIN);
    await sleep(1500);
    const w = await connect('shared');
    for (let i = 0; i < 2; i++) { await observe(w, b.pid, `warm-${launches}-${i}`).catch(() => {}); await sleep(1200); }
    w.close();
  };
  return {
    pid: () => b.pid,
    reset: async front => {
      const notes = [];
      if (!b || b.exitCode !== null) { await relaunch(); notes.push('launched'); }
      await ask({op: 'hover', x: 200, y: 600});  // the pointer off Chrome (the kit's hid route moves it)
      await escapeTwice(b.pid);
      const prev = lastReady()?.load ?? null;
      sendCmd(`goto:${URL_}`);
      if (!(await newLoad(prev))) { notes.push('no reload: relaunch'); await relaunch(); }
      await ask({op: 'focusweb', pid: b.pid});
      placePid(b.pid, WIN);
      const left = await ask({op: 'popup', pid: b.pid, window: [WIN.x, WIN.y + 1, WIN.w, WIN.h - 42]});
      if (left.popup) notes.push(`overlay left ${JSON.stringify(left.popup.bounds)}`);
      if (front) { setFront(b.pid); await sleep(700); } else await raiseFinderCover();
      return notes;
    },
    close: async () => { if (b && b.exitCode === null) { b.kill('SIGTERM'); await sleep(1500); } },
  };
}
/// A document app ended by signal and reopened on the kit's file: Apple Events to the app raise the runner's Automation
/// prompt (#452's smoke run 44802527126); the persistence defaults (the workflow's) keep a relaunch from restoring anything.
async function quit(name) {
  if (!pidOf(name)) return;
  sh('pkill', ['-x', name]);
  for (let i = 0; i < 40 && pidOf(name); i++) await sleep(100);
  if (pidOf(name)) { sh('pkill', ['-9', '-x', name]); await sleep(500); }
}
function docApp(name, appName, file) {
  const pid = () => pidOf(name);
  return {
    pid,
    reset: async (front, frame = WIN) => {
      await ask({op: 'hover', x: 200, y: 600});
      await quit(name);
      sh('open', ['-a', appName, file]);
      for (let i = 0; i < 40; i++) { await sleep(300); if (Number(osa(`tell application "System Events" to count windows of process "${name}"`).out) >= 1) break; }
      await sleep(500);
      osa(`tell application "System Events" to tell process "${name}" to set position of window 1 to {${frame.x}, ${frame.y}}`);
      osa(`tell application "System Events" to tell process "${name}" to set size of window 1 to {${frame.w}, ${frame.h}}`);
      await sleep(400);
      if (front) { setFront(pid()); await sleep(700); } else await raiseFinderCover();
      return [];
    },
    close: () => quit(name),
  };
}

// ---- one row ------------------------------------------------------------------------------------------------------
const results = [];
const config = {kit: 'probe-454 menus', engineRef: process.env.P454_ENGINE_REF ?? null, reps: REPS,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), commit: process.env.GITHUB_SHA ?? null, image: process.env.ImageVersion ?? null, url: URL_};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));

/// The observation's facts about the open menu: its nodes inside the menu's window, the item's node, and the nodes before
/// it of decreasing depth (its ancestors when the node list is in document order).
function treeFacts(sky, pr, title) {
  const nodes = sky.nodes ?? [];
  const menuNodes = nodes.filter(n => /^AXMenu/.test(n.role));
  const i = nodes.findIndex(n => n.role === 'AXMenuItem' && n.title === title);
  const bar = sky.menuBar ?? [];
  const inBar = bar.find(n => n.role === 'AXMenuItem' && n.title === title);
  const slim = n => n && {token: n.token, role: n.role, subrole: n.subrole, title: n.title ?? null, value: n.value ?? null, depth: n.depth, actions: n.actions, frame: n.frame};
  const above = [];
  if (i >= 0) { let d = nodes[i].depth; for (let k = i - 1; k >= 0 && d > 0; k--) if (nodes[k].depth < d) { above.push(`${nodes[k].role}${nodes[k].subrole ? `/${nodes[k].subrole}` : ''}@${nodes[k].depth}`); d = nodes[k].depth; } }
  return {nodes: nodes.length, inMenuWindow: pr ? nodes.filter(n => n.frame && inside(centre(n.frame), pr)).length : null,
    menuNodes: menuNodes.length, menuItems: menuNodes.filter(n => n.role === 'AXMenuItem').length,
    menus: menuNodes.filter(n => n.role === 'AXMenu').slice(0, 3).map(slim), item: slim(nodes[i]) ?? (inBar ? {...slim(inBar), in: 'menuBar'} : null), itemIndex: i, above,
    menuBar: {nodes: bar.length, roles: [...new Set(bar.map(n => n.role))], items: bar.filter(n => n.role === 'AXMenuItem').length}};
}

async function runRow(app, menuName, mode, route, rep) {
  const mn = MENUS[menuName];
  const lab = `${menuName}-${mode.name}-${route}-${rep}`;
  const row = {label: lab, menu: menuName, app: mn.app, mode: mode.name, desktop: mode.desktop, front: mode.front, route, rep, steps: []};
  results.push(row);
  let w;
  try {
    await ask({op: 'forget'});
    row.reset = await app.reset(mode.front, mn.frame);
    const pid = app.pid();
    row.frontBefore = frontmost();
    w = await connect(mode.desktop);
    const sky0 = await observe(w, pid, `${lab}-obs`);
    row.window0 = sky0.window?.frame;
    const wf0 = sky0.window.frame;
    const mark0 = events.length;
    if (route === 'button') {
      // The closed pop-up button, clicked by the engine at its node's centre in the observation.
      const n = mn.node(sky0);
      if (!n) { row.problem = 'no pop-up button in the observation'; return; }
      const before = await ask({op: 'popup', pid, window: winArr(wf0)});
      row.overlayBefore = before.popup ?? null;
      const {px, screen} = toPixels(sky0, centre(n.frame));
      row.pick = {by: 'node', role: n.role, title: n.title ?? null, value: n.value ?? null, actions: n.actions, frame: n.frame};
      row.point = {px, screen};
      const r = await w.execute('click', {pid, x: px.x, y: px.y});
      row.click = brief(r);
      await sleep(1500);
      const after = await ask({op: 'popup', pid, window: winArr(wf0)});
      const info = await ask({op: 'menuinfo', pid});
      const ev = events.slice(mark0);
      row.after = {overlay: after.popup ? {n: after.popup.n, layer: after.popup.layer, bounds: after.popup.bounds} : null,
        menus: (info.menus ?? []).map(m => ({role: m.role, count: m.count, chain: m.chain})), page: [...new Set(ev.filter(e => ['click', 'mousedown', 'focusin'].includes(e.type)).map(e => `${e.type}:${e.id}`))],
        front: frontmost()};
      row.landing = row.click.error ? `refused:${row.click.error}` : after.popup?.layer === 101 || (info.menus ?? []).length ? 'opened' : row.after.page.length ? `page:${row.after.page.join(',')}` : 'nothing';
      return;
    }
    if (mn.open) await mn.open({row, pid, sky0, w});
    else {
      const open = await ask({op: 'open', pid, find: mn.find, action: 'AXPress'}, 15_000);
      row.steps.push({step: 'open:AXPress', answer: open});
      if (open.error) throw Object.assign(new Error(`opener ${open.error}`), {setup: true});
      row.openerBefore = {value: open.value, actions: open.actions, opener: open.opener};
      row.openedBy = 'kit AXPress on the pop-up button';
      await sleep(900);
    }
    row.frontAtObs = frontmost();
    const sky = await observe(w, pid, `${lab}-reobs`);
    const wf = sky.window.frame;
    row.window = wf;
    row.loadObserved = lastReady()?.load ?? null;
    row.screenshot = sky.screenshot?.url?.replace(/^.*\/shots\//, '') ?? null;
    const pop = await ask({op: 'popup', pid, window: winArr(wf)});
    row.overlayAtObs = {popup: pop.popup ?? null, target: pop.target ?? null, appWindows: pop.appWindows, axPopup: pop.axPopup ?? null,
      axRoots: pop.axRoots, rows: (pop.axRows ?? []).slice(0, 30), scan: pop.scan, systemScan: pop.systemScan};
    const pr = rect(pop.popup?.bounds);
    if (!pop.target) { row.problem = 'the observed window is not on screen'; return; }
    if (!pr) { row.problem = 'no menu at the re-observation'; return; }
    // The new cells pick by the item's own AX frame (menuinfo); the pop-up menus as before.
    const info = await ask({op: 'menuinfo', pid, title: mn.want, bar: mn.bar});
    if (mn.open) {
      const f = rect(info.item?.frame);
      row.pick = f && f.width > 4 ? {by: 'menuinfo', role: 'AXMenuItem', title: mn.want, frame: info.item.frame, point: centre(f), expect: mn.want} : null;
    } else row.pick = menuPick(pop, mn.current, mn.want);
    if (!row.pick) { row.problem = 'no item in the menu'; return; }
    const title = row.pick.expect;
    // Every menu window of the app on screen (a submenu's parent too): an outside point avoids them all.
    const menuRects = (pop.appWindows ?? []).filter(x => x.layer >= 100 && x.n !== pop.target.n).map(x => rect(x.bounds));
    row.menuWindows = (pop.appWindows ?? []).filter(x => x.layer >= 100).map(x => ({n: x.n, layer: x.layer, bounds: x.bounds}));
    row.pickInWindow = inside(row.pick.point, rect(winArr(wf)));
    row.menuAX = {menus: (info.menus ?? []).map(m => ({role: m.role, subrole: m.subrole, frame: m.frame, pid: m.pid, count: m.count, chain: m.chain})),
      item: info.item ?? null, highlighted: info.highlighted ?? null};
    row.tree = treeFacts(sky, pr, title);
    const caretBefore = mn.app !== 'chrome' ? await ask({op: 'caret', pid, window: winArr(wf)}) : null;
    sh('screencapture', ['-x', '-t', 'jpg', join(OUT, 'screens', `${fileName(lab)}.jpg`)]);
    const mark = events.length;
    const t0 = Date.now();
    if (route === 'coord' || route === 'outside' || route.startsWith('kit:')) {
      let point;
      if (route === 'outside') {
        if (mn.app === 'chrome') {
          const n = findNode(sky, ['AXButton'], 'Beta');
          if (!n) { row.problem = 'no outside button'; return; }
          row.outsidePick = {by: 'node', role: n.role, title: 'Beta', frame: n.frame};
          point = centre(n.frame);
        } else {
          for (const [phrase, after] of TEXT_PHRASES) {
            const tp = await ask({op: 'textpoint', pid, phrase, after, window: winArr(wf)});
            if (!tp.error && !menuRects.some(m => inside(tp, m)) && inside(tp, wf)) { row.outsidePick = {by: 'text', phrase, frame: tp.bounds}; point = {x: tp.x, y: tp.y}; break; }
          }
          if (!point) { row.problem = 'no text outside the menu'; return; }
        }
      } else point = row.pick.point;
      const {px, screen} = toPixels(sky, point);
      row.point = {px, screen, inMenu: inside(screen, pr)};
      const sig = await ask({op: 'signals', pid, x: screen.x, y: screen.y, window: winArr(wf)});
      row.atClick = {holdsPoint: (sig.aboveAtPoint ?? []).some(x => x.n === pop.popup?.n), aboveAtPoint: sig.aboveAtPoint, hit: sig.hit?.chain?.slice(0, 8) ?? null,
        systemHit: sig.systemHit?.chain?.slice(0, 8) ?? null, hitPid: sig.hit?.pid ?? null};
      if (route.startsWith('kit:')) {
        const [flag, stamp] = route.slice(4).includes('-') ? route.slice(4).split('-') : [null, route.slice(4)];
        const win = stamp === 'menu' ? [pop.popup.n, ...pop.popup.bounds] : [pop.target.n, ...pop.target.bounds];
        row.kitPost = await ask({op: 'post', pid, x: screen.x, y: screen.y, stamp, win, warp: /warp/.test(flag ?? ''), move: /move/.test(flag ?? '')});
      } else {
        const r = await w.execute('click', {pid, x: px.x, y: px.y});
        row.click = brief(r);
        // Where the engine stamped it: the observed window (ClickTarget.windowID, Input.swift) by the frame its record names.
        const cf = row.click.meta?.coordinateClick?.windowFrame;
        row.stampedTo = !cf ? null : Math.abs(cf.x - pop.target.bounds[0]) <= 2 && Math.abs(cf.y - pop.target.bounds[1]) <= 2 ? `observed:${pop.target.n}` : `other:${JSON.stringify(cf)}`;
      }
    } else if (route === 'element') {
      const node = row.tree.item;
      if (!node) { row.landing = 'notInTree'; return; }
      const r = await w.execute('click', {pid, element: node.token});
      row.click = brief(r);
    } else if (route === 'keys') {
      // Down until the item reads highlighted (AXSelected), at most the item's distance from the checked one plus 3, then Return.
      const titles = (info.menus ?? []).find(m => m.holdsTitle)?.titles ?? [];
      const k = Math.max(1, titles.indexOf(title) - Math.max(0, titles.indexOf(mn.current)));
      row.keys = {k, highlights: [info.highlighted ?? null], answers: []};
      let lit = info.highlighted ?? null;
      for (let i = 0; i < k + 3 && lit !== title; i++) {
        if (lit == null && i >= k) break;
        const r = await w.execute('press_key', {pid, key: 'Down'});
        row.keys.answers.push(brief(r));
        if (r.error) break;
        await sleep(350);
        lit = (await ask({op: 'menuinfo', pid, title, bar: mn.bar})).highlighted ?? null;
        row.keys.highlights.push(lit);
      }
      const r = await w.execute('press_key', {pid, key: 'Return'});
      row.click = brief(r);
      row.keys.litAtReturn = lit;
    }
    row.actMs = Date.now() - t0;
    await sleep(1500);
    const ev = events.slice(mark);
    const after = await ask({op: 'popup', pid, window: winArr(wf)});
    const openerAfter = await ask({op: 'opener'});
    const caretAfter = mn.app !== 'chrome' ? await ask({op: 'caret', pid, phrase: row.outsidePick?.phrase ?? undefined, window: winArr(wf)}) : null;
    const where = e => (e.load === row.loadObserved ? '' : '@other');
    row.after = {page: [...new Set(ev.filter(e => ['click', 'pointerdown', 'mousedown', 'focusin', 'submit'].includes(e.type)).map(e => `${e.type}:${e.id}${where(e)}`))],
      changes: ev.filter(e => ['input', 'change'].includes(e.type)).map(e => `${e.type}:${e.id}=${e.value}`),
      overlay: after.popup ? {n: after.popup.n, layer: after.popup.layer, bounds: after.popup.bounds} : null, opener: openerAfter,
      caretBefore: caretBefore?.range ?? null, caret: caretAfter ? {range: caretAfter.range, line: caretAfter.line, phraseIndex: caretAfter.phraseIndex} : null, front: frontmost()};
    const valueNow = openerAfter?.value ?? null;
    const changedTo = ev.filter(e => e.type === 'change' && e.id === 'sel').map(e => e.value).pop() ?? (row.openerBefore && valueNow !== row.openerBefore.value ? valueNow : null);
    const effect = mn.taken ? mn.taken({row, ev, after, before: pop, caretAfter}) : null;
    row.after.effect = effect;
    const caretAt = () => Boolean(caretAfter?.range && caretAfter.phraseIndex >= 0 && caretAfter.range[0] >= caretAfter.phraseIndex && caretAfter.range[0] <= caretAfter.phraseIndex + 7);
    const caretMoved = caretAfter && JSON.stringify(caretAfter.range) !== JSON.stringify(caretBefore?.range);
    const pageClicks = row.after.page.filter(p => /^(click|mousedown):/.test(p));
    const menuUp = Boolean(after.popup && after.popup.layer === pop.popup.layer);
    row.after.menuUp = menuUp;
    let landing;
    if (row.click?.error) landing = `refused:${row.click.error}`;
    else if (route === 'outside') landing = effect ? `taken:${title}` : (mn.app === 'chrome' ? ev.some(e => e.type === 'click' && e.id === 'b2') : caretAt()) ? 'landed' : changedTo ? `taken:${changedTo}` : menuUp ? 'nothing' : 'dismissed';
    else if (effect || changedTo === title) landing = 'taken';
    else if (changedTo) landing = `taken-other:${changedTo}`;
    else if (pageClicks.length) landing = `beneath:${pageClicks.join(',')}`;
    else if (caretMoved) landing = 'beneath:caret';
    else if (!menuUp) landing = 'dismissed';
    else landing = 'menu-still-up';
    if (route === 'outside') landing += menuUp ? '+menuUp' : '+menuClosed';
    row.landing = landing;
  } catch (e) { if (e.setup) row.problem = e.message; else row.exception = String(e?.stack || e).slice(0, 1500); }
  finally {
    w?.close(); save();
    const sp = row.click?.stalePoint, o = row.overlayAtObs?.popup;
    log(`${lab}: ${row.problem ?? row.exception?.split('\n')[0] ?? `${row.landing} route=${row.click?.route ?? row.kitPost?.stamp ?? '-'} ${sp ? `${sp.verdict}/${sp.reason}` : 'no stalePoint'} posted=${row.click?.posted} menu=${o ? `${o.n}/L${o.layer}/${JSON.stringify(o.bounds)}` : '-'} stamped=${row.stampedTo ?? '-'} tree=${row.tree ? `${row.tree.menuItems}items/item:${row.tree.item ? row.tree.item.actions?.join('+') : 'none'}` : '-'} axItem=${row.menuAX?.item ? row.menuAX.item.chain?.map(c => c[0]).join('<') : '-'} pick=${row.pick?.by}:${row.pick?.expect ?? row.pick?.title ?? ''} front=${row.frontAtObs}->${row.after?.front} msg=${(row.click?.message ?? '').slice(0, 160)}`}`);
  }
}

async function run() {
  config.chrome = version('stable');
  const menus = Object.keys(MENUS).filter(m => !ONLY_MENUS || ONLY_MENUS.includes(m));
  const modes = MODES.filter(m => !ONLY_MODES || ONLY_MODES.includes(m.name));
  const routes = ROUTES.filter(r => !ONLY_ROUTES || ONLY_ROUTES.includes(r) || (r.startsWith('kit:') && ONLY_ROUTES.includes('kit')));
  for (const appName of ['chrome', 'textedit', 'scripteditor']) {
    const mine = menus.filter(m => MENUS[m].app === appName);
    if (!mine.length) continue;
    const app = appName === 'chrome' ? chromeApp() : appName === 'textedit' ? docApp('TextEdit', 'TextEdit', teFile) : docApp('Script Editor', 'Script Editor', seFile);
    for (let rep = 1; rep <= REPS; rep++) for (const m of mine) for (const mode of modes) for (const route of routes) {
      if (route.startsWith('kit:') && mode.desktop !== 'shared') continue;
      if (Date.now() - STARTED > BUDGET_MS) { config.budgetStop = true; save(); return; }
      await runRow(app, m, mode, route, rep);
    }
    await app.close();
  }
}

log('config', JSON.stringify(config));
try { await run(); } catch (e) { config.exception = String(e?.stack || e).slice(0, 2000); log('EXCEPTION', config.exception); }
config.engineStderr = engineErr.slice(-4000);
config.minutes = Math.round((Date.now() - STARTED) / 600) / 100;
save();
engine?.kill('SIGKILL');
tool.stdin.end(); server.close();
process.exit(0);
