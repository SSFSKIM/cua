// #305's hosted A/B of the recorded-hit fix (ruling 45f5e5be) against main, on a GitHub-hosted macOS runner. Both engines
// are built with scripts/probe-299/instrument.py (the observation also returns the stale-point guard's record) and each
// scene is clicked on each engine in turn (the order alternating by repetition). Three parts:
//   spots    #305's still-page spots: points #301's emulation reads as refusals (scripts/probe-299/classify.mjs
//            `pointVerdicts`) and controls, each clicked after a re-set and a fresh observation with nothing changed
//   sweep    still-page sweep (ruling 1300755e, cb9be468): about 20 ordinary controls per app, chosen from the observed tree
//            by role (fields, toggles, rows, buttons, menus, links; navigation last), each clicked at its centre and at a
//            point 2 pt inside one edge (rotating), each click after a re-set and a fresh observation
//   popover  the stated limit: a recorded popover over a recorded button, hidden after the observation (opacity, opacity
//            with pointer-events none, visibility), clicked at the popover's button; which element the page saw
// #296's stale suite runs beside this as scripts/probe-296/ab.mjs (the workflow's s296-* groups). No secrets, no login.
//   node scripts/probe-305/ab.mjs --group <chrome|safari|finder|textedit> --main <bin> --branch <bin> --tool <bin> --out <dir>
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {gzipSync} from 'node:zlib';
import {pointVerdicts} from '../probe-299/classify.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-305 ab: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), TOOL = arg('tool'), GROUP = arg('group');
const BINS = {main: arg('main'), branch: arg('branch')};
const PARTS = (arg('parts') ?? 'spots,sweep,popover').split(',');
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-305 ab:', ...a);
const WIN = {x: 0, y: 40, w: 1024, h: 728};
const GH = ['https://', 'git', 'hub.com'].join('');
const KEPT = new Set(['sameElement', 'hitAboveNode', 'nonInteractiveHit']);
const REP = Number(process.env.P305_REP ?? 1);
const ORDER = REP % 2 ? ['main', 'branch'] : ['branch', 'main'];

// ---- the local pages: a plain page, and the popover page with click beacons --------------------------------------
const PLAIN = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe305 page</title><style>body{font:16px sans-serif;margin:40px}</style></head>
<body><h1>probe305 page</h1><p>${Array.from({length: 6}, (_, i) => `<button onclick="return false">Inert ${i + 1}</button>`).join(' ')}</p>${Array.from({length: 30}, (_, i) => `<p>Plain paragraph ${i + 1}, text with nothing to click in it at all.</p>`).join('')}</body></html>`;
const POPOVER = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe305 popover</title>
<style>body{font:16px sans-serif;margin:40px}#under{position:absolute;left:120px;top:220px;width:200px;height:48px;font-size:16px}
#pop{position:absolute;left:100px;top:200px;width:240px;height:88px;background:#ffd;border:1px solid #886;display:flex;align-items:center;justify-content:center}
#popbtn{width:200px;height:48px;font-size:16px}</style></head>
<body><h1>probe305 popover</h1><button id="under">Under button</button><div id="pop" role="dialog" aria-label="Popover"><button id="popbtn">Popover button</button></div>
<script>document.addEventListener('click', e => { const t = e.target.closest('[id]'); navigator.sendBeacon('/b', JSON.stringify({id: t ? t.id : null, t: Date.now()})); }, true);</script></body></html>`;
let beacons = [];
const server = createServer((req, res) => {
  if (req.method === 'POST') { let b = ''; req.on('data', d => { b += d; }); req.on('end', () => { try { beacons.push(JSON.parse(b)); } catch {} res.writeHead(204); res.end(); }); return; }
  res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); res.end(req.url.startsWith('/popover') ? POPOVER : PLAIN);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const LOCAL = `http://127.0.0.1:${server.address().port}/`;

// ---- engines, tool, shell ----------------------------------------------------------------------------------------
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
const engines = {};
for (const name of ['main', 'branch']) {
  const dir = join(OUT, `sock-${name}`); mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, 'engine.sock');
  const child = spawn(BINS[name], [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'ignore', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr = (stderr + d).slice(-20_000); });
  engines[name] = {name, child, stderr: () => stderr, connect: async () => {
    for (let i = 0; i < 300; i++) {
      try {
        const w = await Wire.connect(socket);
        const ping = await w.call('ping', {clientApiVersion: 'cua-engine-1', desktop: 'dedicated'});
        if (ping.error) throw new Error(JSON.stringify(ping.error));
        return w;
      } catch { await sleep(50); }
    }
    throw new Error(`engine ${name} did not listen`);
  }};
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
/// A key the probe posts counts as the user's for the engine (Intervention.swift): Escape, then out of its 5 s debounce.
const escape = async () => { osa('tell application "System Events" to key code 53'); await sleep(300); osa('tell application "System Events" to key code 53'); await sleep(5600); };

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

// ---- results -----------------------------------------------------------------------------------------------------
const results = [];
const config = {group: GROUP, parts: PARTS, macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), chrome: sh(CFT, ['--version']).out,
  safari: sh('defaults', ['read', '/Applications/Safari.app/Contents/Info', 'CFBundleShortVersionString']).out,
  mainCommit: process.env.P305_MAIN_COMMIT ?? null, branchCommit: process.env.P305_BRANCH_COMMIT ?? null, probeCommit: process.env.GITHUB_SHA ?? null, rep: REP, order: ORDER};
const save = () => writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));
const fileName = s => s.replace(/[^a-z0-9-]+/gi, '_');
async function observe(w, pid, label) {
  const shots = join(OUT, 'shots', fileName(label)); mkdirSync(shots, {recursive: true});
  const r = await w.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots});
  if (r.error) throw new Error(`get_app_state: ${JSON.stringify(r.error).slice(0, 400)}`);
  return r.result;
}
/// One real click at a global point on the engine's last observation (`sky`), with its answer and, at a refusal, the
/// mechanism (the recorded node the emulation chose at the point, found live by role and frame).
async function click(w, pid, sky, point) {
  const f = sky.window.frame, scale = sky.screenshot.width / f.width;
  const px = {x: Math.round((point.x - f.x) * scale), y: Math.round((point.y - f.y) * scale)};
  const posted = {x: f.x + px.x / scale, y: f.y + px.y / scale};
  const ch = (await ask({op: 'chains', pid, points: [[posted.x, posted.y]]})).points?.[0] ?? {};
  const emu = pointVerdicts(sky.probeRecord ?? [], [{x: posted.x, y: posted.y, chain: ch.chain}])[0];
  const r = await w.execute('click', {pid, x: px.x, y: px.y});
  const name = r.error ? (r.error.data?.name ?? r.error.data?.errorName ?? r.error.name ?? findKey(r.error, 'errorName')) : null;
  const out = {px, posted, emulated: {v: emu.v, node: emu.node, hit: emu.hit}, stalePoint: findKey(r.error ?? r.result, 'stalePoint') ?? null,
    result: r.error ? {error: name, message: String(r.error.message ?? '').slice(0, 300)} : {ok: true}};
  out.refused = r.error ? /screenChangedSinceScreenshot/.test(`${name} ${r.error.message}`) : false;
  // The hit's own entries in the record (by role and a frame within 1 pt): whether the screenshot showed it whole, or
  // clipped (its shown part), and whether the posted point lies in that shown part widened by 2 pt (#305's rule 2).
  const h = ch.chain?.[0];
  if (h) out.hitRecord = (sky.probeRecord ?? []).filter(([role, , , fr]) => role === h[0] && fr && Math.abs(fr.x - h[1]) <= 1 && Math.abs(fr.y - h[2]) <= 1 && Math.abs(fr.width - h[3]) <= 1 && Math.abs(fr.height - h[4]) <= 1)
    .slice(0, 3).map(([role, depth, complete, frame, shown]) => ({role, depth, frame, shown,
      clipped: !shown || Math.abs(shown.x - frame.x) > 0.5 || Math.abs(shown.y - frame.y) > 0.5 || Math.abs(shown.width - frame.width) > 0.5 || Math.abs(shown.height - frame.height) > 0.5,
      pointInShown: Boolean(shown && posted.x >= shown.x - 2 && posted.x <= shown.x + shown.width + 2 && posted.y >= shown.y - 2 && posted.y <= shown.y + shown.height + 2)}));
  if (out.refused && emu.node) {
    const n = emu.node.frame;
    out.mech = await ask({op: 'mech', pid, window: [f.x, f.y, f.width, f.height], x: posted.x, y: posted.y, role: emu.node.role, frame: [n.x, n.y, n.w, n.h]}, 60_000);
  }
  return out;
}
const brief = c => `${c.refused ? 'REFUSED' : c.result?.ok ? 'kept' : `error ${c.result?.error}`} ${c.stalePoint ? `${c.stalePoint.verdict}/${c.stalePoint.reason} rec=${c.stalePoint.recordedRole} hit=${c.stalePoint.hitRole}` : 'no stalePoint'}`;

// ---- part 1: #305's spots ----------------------------------------------------------------------------------------
const hitKey = p => p.hit ? `${p.hit.role}|${Math.round(p.hit.frame.x)},${Math.round(p.hit.frame.y)},${Math.round(p.hit.frame.w)},${Math.round(p.hit.frame.h)}` : 'none';
function pick(points, max, perClass, priority = () => 0) {
  const classes = new Map();
  for (const p of points) { const k = hitKey(p); if (!classes.has(k)) classes.set(k, []); classes.get(k).push(p); }
  const ordered = [...classes.entries()].sort((a, b) => priority(a[1][0]) - priority(b[1][0]) || b[1].length - a[1].length);
  const out = [];
  for (let round = 0; round < perClass && out.length < max; round++) for (const [, ps] of ordered) {
    if (out.length >= max) break;
    const i = Math.floor((round + 0.5) * ps.length / perClass);
    if (ps[i] && !out.includes(ps[i])) out.push(ps[i]);
  }
  return out;
}
async function spot(s) {
  for (const eng of ORDER) {
    const row = {part: 'spots', spot: s.name, engine: eng, clicks: []};
    results.push(row);
    let w;
    try {
      await s.reset();
      w = await engines[eng].connect();
      const sky = await observe(w, s.pid(), `${s.name}-${eng}-pick`);
      const wf = sky.window.frame;
      const gridFile = join(OUT, `grid-${fileName(s.name)}-${eng}.json`);
      await ask({op: 'grid', pid: s.pid(), window: [wf.x, wf.y, wf.width, wf.height], step: 20, out: gridFile}, 300_000);
      const grid = JSON.parse(readFileSync(gridFile, 'utf8')).points;
      writeFileSync(`${gridFile}.gz`, gzipSync(readFileSync(gridFile))); spawnSync('rm', [gridFile]);
      const verdicts = pointVerdicts(sky.probeRecord, grid);
      const inRegion = verdicts.filter(p => p.clickable && s.region(p, wf));
      row.emulated = Object.fromEntries([...new Set(inRegion.map(p => p.v))].map(v => [v, inRegion.filter(p => p.v === v).length]));
      const flagged = pick(inRegion.filter(p => p.v === 'interactiveHit'), 6, s.perClass ?? 2, s.priority);
      const controls = pick(verdicts.filter(p => p.clickable && KEPT.has(p.v) && (s.controlRegion ?? s.region)(p, wf)), 3, 1);
      for (const [kind, p] of [...flagged.map(p => ['flagged', p]), ...controls.map(p => ['control', p])]) {
        const c = {kind, grid: {x: p.x, y: p.y, v: p.v}};
        row.clicks.push(c);
        try {
          await s.reset();
          const fresh = await observe(w, s.pid(), `${s.name}-${eng}-${row.clicks.length}`);
          Object.assign(c, await click(w, s.pid(), fresh, {x: p.x, y: p.y}));
          await sleep(1500);
          c.effect = await s.effect();
          if (s.after) await s.after(c);
        } catch (e) { c.exception = String(e?.stack || e).slice(0, 1500); }
        log(`  spots ${s.name} ${eng} ${kind} (${Math.round(p.x)},${Math.round(p.y)}) emulated=${c.emulated?.v} -> ${brief(c)} effect=${JSON.stringify(c.effect)}`);
        save();
      }
    } catch (e) { row.exception = String(e?.stack || e).slice(0, 2000); log(`spots ${s.name} ${eng}: EXCEPTION ${row.exception.split('\n')[0]}`); }
    finally { w?.close(); save(); }
  }
}

// ---- part 2: the still-page sweep --------------------------------------------------------------------------------
const BUCKETS = [
  ['field', ['AXTextField', 'AXSearchField', 'AXComboBox', 'AXTextArea'], 3],
  ['toggle', ['AXCheckBox', 'AXRadioButton', 'AXTab', 'AXSwitch'], 3],
  ['row', ['AXRow', 'AXCell', 'AXOutlineRow'], 4],
  ['button', ['AXButton', 'AXDisclosureTriangle', 'AXIncrementor', 'AXSegmentedControl'], 5],
  ['menu', ['AXPopUpButton', 'AXMenuButton'], 2],
  ['link', ['AXLink'], 5],
];
// Controls that would end the scene or leave the machine (closing, quitting, signing in, sharing, installing).
const SKIP = /close|minimi|zoom|full ?screen|quit|delete|trash|sign|log ?(in|out)|account|download|print|install|extension|profile|donat|buy|subscribe|share|eject|new (tab|window)|private|airdrop|translat/i;
const SKIP_SUBROLES = new Set(['AXCloseButton', 'AXMinimizeButton', 'AXZoomButton', 'AXFullScreenButton']);
const label = n => `${n.title ?? ''} ${n.description ?? ''} ${n.help ?? ''} ${n.identifier ?? ''}`;
function sweepPicks(sky) {
  const wf = sky.window.frame;
  const shown = new Map();
  for (const [role, , , frame, sh] of sky.probeRecord ?? []) if (frame && sh) shown.set(`${role}|${Math.round(frame.x)}|${Math.round(frame.y)}|${Math.round(frame.width)}|${Math.round(frame.height)}`, sh);
  const visible = n => {
    if (!n.frame) return null;
    const s = shown.get(`${n.role}|${Math.round(n.frame.x)}|${Math.round(n.frame.y)}|${Math.round(n.frame.width)}|${Math.round(n.frame.height)}`);
    if (!s || s.width < 10 || s.height < 10) return null;
    if (s.y < wf.y || s.y + s.height > wf.y + wf.height || s.x < wf.x || s.x + s.width > wf.x + wf.width) return null;
    return s;
  };
  const out = [];
  for (const [bucket, roles, quota] of BUCKETS) {
    const cands = sky.nodes.filter(n => roles.includes(n.role) && n.flags?.enabled !== false && !SKIP.test(label(n)) && !SKIP_SUBROLES.has(n.subrole) && visible(n))
      .map(n => ({bucket, role: n.role, subrole: n.subrole, title: n.title, description: n.description, frame: n.frame, shown: visible(n)}))
      .sort((a, b) => a.shown.y - b.shown.y || a.shown.x - b.shown.x);
    for (let i = 0; i < Math.min(quota, cands.length); i++) out.push(cands[Math.floor((i + 0.5) * cands.length / Math.min(quota, cands.length))]);
  }
  return out.slice(0, 20);
}
/// The control again in a fresh observation: by role and label and a frame within 4 pt, else by role and frame within 2 pt.
function refind(sky, p) {
  const near = (a, b, t) => a && b && Math.abs(a.x - b.x) <= t && Math.abs(a.y - b.y) <= t && Math.abs(a.width - b.width) <= t && Math.abs(a.height - b.height) <= t;
  const dist = n => Math.abs(n.frame.x - p.frame.x) + Math.abs(n.frame.y - p.frame.y);
  const nearest = ns => ns.filter(n => n.frame).sort((a, b) => dist(a) - dist(b))[0];
  // A page that shifted a little between re-sets (a banner, a list re-opened) still gives a still page at the click,
  // which follows its own observation: the same role and label at the nearest frame, else the same role within 40 pt.
  return sky.nodes.find(n => n.role === p.role && (n.title ?? null) === (p.title ?? null) && (n.description ?? null) === (p.description ?? null) && near(n.frame, p.frame, 4))
    ?? sky.nodes.find(n => n.role === p.role && near(n.frame, p.frame, 2))
    ?? ((p.title || p.description) ? nearest(sky.nodes.filter(n => n.role === p.role && (n.title ?? null) === (p.title ?? null) && (n.description ?? null) === (p.description ?? null))) : null)
    ?? nearest(sky.nodes.filter(n => n.role === p.role && n.frame && dist(n) <= 40));
}
function shownOf(sky, n) {
  for (const [role, , , frame, sh] of sky.probeRecord ?? []) if (role === n.role && frame && sh && Math.abs(frame.x - n.frame.x) < 0.5 && Math.abs(frame.y - n.frame.y) < 0.5 && Math.abs(frame.width - n.frame.width) < 0.5 && Math.abs(frame.height - n.frame.height) < 0.5) return sh;
  return null;
}
const EDGES = ['top', 'right', 'bottom', 'left'];
const edgePoint = (s, edge) => edge === 'top' ? {x: s.x + s.width / 2, y: s.y + 2} : edge === 'bottom' ? {x: s.x + s.width / 2, y: s.y + s.height - 2}
  : edge === 'left' ? {x: s.x + 2, y: s.y + s.height / 2} : {x: s.x + s.width - 2, y: s.y + s.height / 2};
async function sweep(s) {
  for (const eng of ORDER) {
    const row = {part: 'sweep', spot: s.name, engine: eng, clicks: []};
    results.push(row);
    let w;
    try {
      await s.reset();
      w = await engines[eng].connect();
      const sky = await observe(w, s.pid(), `${s.name}-${eng}-pick`);
      const picks = sweepPicks(sky);
      row.picked = picks.map(p => `${p.bucket}:${p.role}:${(p.title ?? p.description ?? '').slice(0, 24)}`);
      let k = 0;
      for (const p of picks) {
        const edge = EDGES[k++ % 4];
        for (const where of ['centre', edge]) {
          const c = {bucket: p.bucket, role: p.role, title: (p.title ?? p.description ?? '').slice(0, 40), where: where === 'centre' ? 'centre' : 'edge', edge: where === 'centre' ? null : edge};
          row.clicks.push(c);
          try {
            await s.reset(c);
            const fresh = await observe(w, s.pid(), `${s.name}-${eng}-${row.clicks.length}`);
            const n = refind(fresh, p);
            const sh = n && shownOf(fresh, n);
            if (!sh) { c.skipped = n ? 'not shown' : 'not found'; continue; }
            const point = where === 'centre' ? {x: sh.x + sh.width / 2, y: sh.y + sh.height / 2} : edgePoint(sh, edge);
            Object.assign(c, await click(w, s.pid(), fresh, point));
            await sleep(1200);
            c.effect = await s.effect();
            s.dirty = ['field', 'menu'].includes(p.bucket) || s.alwaysDirty;
          } catch (e) { c.exception = String(e?.stack || e).slice(0, 1500); }
          log(`  sweep ${s.name} ${eng} ${c.bucket}:${c.role} "${c.title}" ${c.where}${c.edge ? `(${c.edge})` : ''} -> ${c.skipped ?? brief(c)} effect=${JSON.stringify(c.effect)}`);
          save();
        }
      }
    } catch (e) { row.exception = String(e?.stack || e).slice(0, 2000); log(`sweep ${s.name} ${eng}: EXCEPTION ${row.exception.split('\n')[0]}`); }
    finally { w?.close(); save(); }
  }
}

// ---- part 3: the hidden popover (Chrome) -------------------------------------------------------------------------
async function popover(cdp, pid, goto) {
  const VARIANTS = {opacity: "pop.style.opacity='0'", 'opacity+pointer-events': "pop.style.opacity='0'; pop.style.pointerEvents='none'", visibility: "pop.style.visibility='hidden'"};
  for (const eng of ORDER) for (const [variant, hide] of Object.entries(VARIANTS)) {
    const row = {part: 'popover', spot: `popover/${variant}`, engine: eng, clicks: []};
    results.push(row);
    let w;
    try {
      await goto(`${LOCAL}popover`, true);
      w = await engines[eng].connect();
      const sky = await observe(w, pid, `popover-${variant}-${eng}`);
      const pb = sky.nodes.find(n => n.role === 'AXButton' && /Popover button/.test(label(n)));
      const ub = sky.nodes.find(n => n.role === 'AXButton' && /Under button/.test(label(n)));
      row.recorded = {popoverButton: Boolean(pb?.frame), underButton: Boolean(ub?.frame), underShown: ub ? Boolean(shownOf(sky, ub)) : false};
      if (!pb?.frame) throw new Error('the popover button is not in the observation');
      await cdp.eval(`(() => { const pop = document.getElementById('pop'); ${hide}; })()`);
      await sleep(600);
      const before = beacons.length;
      const c = {variant};
      row.clicks.push(c);
      Object.assign(c, await click(w, pid, sky, {x: pb.frame.x + pb.frame.width / 2, y: pb.frame.y + pb.frame.height / 2}));
      await sleep(1200);
      c.landedOn = beacons.slice(before).map(b => b.id);
      log(`  popover ${variant} ${eng}: recorded=${JSON.stringify(row.recorded)} -> ${brief(c)} landed=${JSON.stringify(c.landedOn)}`);
    } catch (e) { row.exception = String(e?.stack || e).slice(0, 1500); log(`popover ${variant} ${eng}: EXCEPTION ${row.exception.split('\n')[0]}`); }
    finally { w?.close(); save(); }
  }
}

// ---- the apps ----------------------------------------------------------------------------------------------------
async function runChrome() {
  const child = spawn(CFT, [`--user-data-dir=${join(OUT, 'chrome-profile')}`, '--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen',
    '--lang=en-US', '--disable-features=Translate', '--remote-debugging-pipe', `--window-position=${WIN.x},${WIN.y}`, `--window-size=${WIN.w},${WIN.h}`, 'about:blank'],
    {stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe']});
  const launchedAt = Date.now();
  const cdp = new Cdp(child.stdio[3], child.stdio[4]);
  for (let i = 0; i < 60 && !(await cdp.pages().catch(() => [])).length; i++) await sleep(500);
  await cdp.attach((await cdp.pages())[0].targetId);
  const pid = () => child.pid;
  let dirty = false;
  // One tab and one window, on `url` at the top: any other page target a click opened is closed first.
  const goto = async (url, reload = false) => {
    if (dirty) { await escape(); dirty = false; }
    for (const t of await cdp.pages()) if (t.targetId !== cdp.target) await cdp.send('Target.closeTarget', {targetId: t.targetId}, null).catch(() => {});
    await cdp.send('Target.activateTarget', {targetId: cdp.target}, null).catch(() => {});
    const href = await cdp.eval('location.href').catch(() => null);
    if (href !== url || reload) {
      await cdp.send('Page.navigate', {url});
      for (let i = 0; i < 90; i++) { await sleep(500); if ((await cdp.eval('document.readyState').catch(() => null)) === 'complete') break; }
      await sleep(3500);
    }
    await cdp.eval('window.scrollTo(0, 0)').catch(() => {});
    const left = launchedAt + 25_000 - Date.now(); if (left > 0) await sleep(left);  // past Chrome for Testing's toolbar re-layout
    await sleep(700);
  };
  const effect = async () => ({url: (await cdp.eval('location.href').catch(() => null))?.slice(0, 90), tabs: (await cdp.pages().catch(() => [])).length});
  const WEB_TOP = 174;
  const wiki = 'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population';
  const blob = `${GH}/torvalds/linux/blob/master/kernel/sched/core.c`;
  if (PARTS.includes('spots')) {
    await spot({name: 'chrome-wiki-links', pid, effect, reset: () => goto(wiki), region: p => p.y > WEB_TOP});
    await spot({name: 'chrome-github-code', pid, effect, reset: () => goto(blob), region: p => p.y > WEB_TOP, priority: p => p.hit?.role === 'AXTextArea' ? 0 : 1});
  }
  if (PARTS.includes('sweep')) {
    const mark = s => async () => { await goto(s.url); };
    for (const [name, url] of [['sweep-chrome-github', `${GH}/torvalds/linux`], ['sweep-chrome-wikipedia', 'https://en.wikipedia.org/wiki/Hacker_News']]) {
      const s = {name, url, pid, effect};
      s.reset = async () => { if (s.dirty) { dirty = true; s.dirty = false; } await goto(url); };
      await sweep(s);
    }
  }
  if (PARTS.includes('popover')) await popover(cdp, child.pid, goto);
  child.kill('SIGTERM'); await sleep(2000);
}
async function runSafari() {
  let page = LOCAL;
  const open = async () => { osa('tell application "Safari" to quit'); await sleep(2000); sh('open', ['-a', 'Safari', page]); await sleep(page === LOCAL ? 7000 : 14000); place('Safari'); await sleep(2000); };
  const pid = () => pidOf('Safari');
  // Safari's own AppleScript answers nothing on the runner (run 42269993080): the window's title, through System Events,
  // says whether a click navigated or opened something; a re-set re-opens only then.
  const title = () => osa('tell application "System Events" to get name of window 1 of process "Safari"').out;
  const state = () => ({title: title(), windows: osa('tell application "System Events" to count windows of process "Safari"').out});
  let expected = null;
  const reopen = async () => { await open(); expected = state(); };
  const reset = async function () {
    if (this?.dirty) { await escape(); this.dirty = false; }
    const st = state();
    if (!expected || st.title !== expected.title || st.windows !== expected.windows) await reopen(); else { place('Safari'); await sleep(800); }
  };
  const effect = async () => state();
  if (PARTS.includes('spots')) {
    page = LOCAL; await reopen();
    const s = {name: 'safari-toolbar', pid, effect, region: (p, wf) => p.y < wf.y + 56, controlRegion: () => true, priority: p => p.hit?.role === 'AXTextField' ? 0 : 1, perClass: 3,
      after: async c => { if (c.result?.ok) s.dirty = true; }};
    s.reset = reset.bind(s);
    await spot(s);
  }
  if (PARTS.includes('sweep')) {
    page = 'https://en.wikipedia.org/wiki/Hacker_News'; await reopen();
    const s = {name: 'sweep-safari', pid, effect, alwaysDirty: true};
    s.reset = reset.bind(s);
    await sweep(s);
  }
  osa('tell application "Safari" to quit');
}
async function runFinder() {
  const folder = '/System/Library/PrivateFrameworks';
  const pid = () => pidOf('Finder');
  const reset = async function () {
    if (this?.dirty) { await escape(); this.dirty = false; }
    const names = osa('tell application "Finder" to get name of every Finder window').out;
    if (names !== 'PrivateFrameworks') {
      osa('tell application "Finder" to close every Finder window'); await sleep(800);
      sh('open', [folder]); await sleep(3000); osa('tell application "Finder" to set current view of front Finder window to list view'); await sleep(1500);
    }
    osa('tell application "Finder" to set collapsed of front Finder window to false');
    // The sweep's view toggles (icon, column, gallery) change the view: list view again before every click.
    osa('tell application "Finder" to set current view of front Finder window to list view');
    place('Finder'); await sleep(1200);
  };
  const effect = async () => ({windows: osa('tell application "Finder" to get name of every Finder window').out, bounds: osa('tell application "Finder" to get bounds of front Finder window').out});
  if (PARTS.includes('spots')) {
    // A click on a name selects it; a second one starts a rename: each click is followed by Escape and the debounce.
    const s = {name: 'finder-list-names', pid, effect, region: (p, wf) => p.y > wf.y + 80, perClass: 2, after: async () => { s.dirty = true; }};
    s.reset = reset.bind(s);
    await spot(s);
  }
  if (PARTS.includes('sweep')) {
    const s = {name: 'sweep-finder', pid, effect, alwaysDirty: true};
    s.reset = reset.bind(s);
    await sweep(s);
  }
}
async function runTextEdit() {
  const file = join(OUT, 'probe305.rtf');
  const body = Array.from({length: 40}, (_, i) => `Line ${i + 1} of a rich text document with words in it.\\par`).join('\n');
  writeFileSync(file, `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs28\n${body}\n}`);
  const pid = () => pidOf('TextEdit');
  const reset = async function () {
    if (this?.dirty) { await escape(); this.dirty = false; }
    const docs = osa('tell application "TextEdit" to get name of every document').out;
    if (!docs.includes('probe305')) { osa('tell application "TextEdit" to close every document saving no'); sh('open', ['-a', 'TextEdit', file]); await sleep(3500); }
    place('TextEdit'); await sleep(1000);
  };
  const effect = async () => ({docs: osa('tell application "TextEdit" to get name of every document').out});
  if (PARTS.includes('sweep')) {
    const s = {name: 'sweep-textedit', pid, effect, alwaysDirty: true};
    s.reset = reset.bind(s);
    await sweep(s);
  }
  osa('tell application "TextEdit" to quit saving no');
}

log('config', JSON.stringify(config));
try {
  if (GROUP === 'chrome') await runChrome();
  else if (GROUP === 'safari') await runSafari();
  else if (GROUP === 'finder') await runFinder();
  else await runTextEdit();
} catch (e) { config.exception = String(e?.stack || e).slice(0, 2000); log('EXCEPTION', config.exception); }
for (const e of Object.values(engines)) { config[`${e.name}Stderr`] = e.stderr().slice(-3000); e.child.kill('SIGKILL'); }
save();
toolChild.stdin.end(); server.close();
process.exit(0);
