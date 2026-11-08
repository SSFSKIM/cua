// #315's hosted A/B: A = main, B = fix/315-gecko-routes (a shared-mode pointer into a background Firefox page follows
// #282's element route, its text fields #313's press with the focus read back, anything else refused with nothing
// posted). Each head its own engine process, started once for the job, the heads' order alternating by repetition.
// Every cell runs behind a frontmost TextEdit, on a fresh connection whose first act is an observation, with the window
// order watched across the action (scripts/probe-321/win.swift): the frontmost app, its key window and whether a
// browser window rose above TextEdit's.
//
// Blocks (each on a fresh browser launch and profile, per head and desktop mode):
//   page        the counters page: by coordinate and by token a button, a checkbox, a radio button and a link; by
//               coordinate plain text, a drag across it and a double click on it; the text field, the textarea and
//               the password field by coordinate and by token, each followed by type_text; set_value on the text
//               field; the toolbar's Reload by coordinate (last, since it reloads)
//   fixedtail   Firefox only: scripts/probe-314's /fixedtail page at the top, 25, 50 and 90 % (the side tool's
//               `scrollto`), two printed rows' links and the fixed bar's button clicked by token
//   chrome      Firefox only, shared: the bookmarks sidebar and docked devtools opened, the window's hit grid (each
//               point's chain: does it answer inside an AXWebArea), and coordinate clicks into each region
//   node scripts/probe-315/ab.mjs --browser <firefox|chrome|safari> --a <bin> --b <bin> --tool <bin> --hit <bin> --win <bin> --out <dir>
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, rmSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {gzipSync} from 'node:zlib';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-315: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), TOOL = arg('tool'), HIT = arg('hit'), WIN_BIN = arg('win'), BROWSER = arg('browser');
const BINS = {a: arg('a'), b: arg('b')};
const BLOCKS = (arg('blocks') ?? (BROWSER === 'firefox' ? 'page,fixedtail,chrome' : 'page')).split(',');
// --modes shared,dedicated (both by default); --cells <name,…>: only these page cells (all by default).
const MODES = (arg('modes') ?? 'shared,dedicated').split(',');
const ONLY_CELLS = arg('cells')?.split(',') ?? null;
if (!OUT || !BINS.a || !BINS.b || !TOOL || !HIT || !WIN_BIN || !BROWSER) { console.error('usage: ab.mjs --browser <b> --a <bin> --b <bin> --tool <bin> --hit <bin> --win <bin> --out <dir>'); process.exit(2); }
const REP = Number(process.env.P315_REP ?? 1);
process.env.P287_BROWSER = BROWSER;
const {launchOther, browserVersion, placePid, firefoxProfile, FIREFOX} = await import('../probe-287/browser.mjs');
const {watch, judge, dump} = await import('../probe-321/watch.mjs');
mkdirSync(OUT, {recursive: true});
const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-315:', ...a);
const FRAME = {x: 400, y: 30, w: 620, h: 720};  // the hosted screen is 1024 x 768; TextEdit sits to the left
const fileName = s => s.replace(/[^a-z0-9+-]+/gi, '_');
const sh = (cmd, args, timeout = 20_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const json = r => { try { return JSON.parse(r.out); } catch { return {status: r.status, out: r.out.slice(0, 500), err: r.err.slice(0, 500)}; } };

// ---- the pages ----------------------------------------------------------------------------------------------------
// The counters page: every pointer event on the document (capture phase), each control's own event, each field's focus
// and value, the selection's length; beaconed with the page's load id. The fields' text is this kit's own marker.
const PAGE = `<!doctype html><html lang="en" translate="no"><head><meta charset="utf-8"><meta name="google" content="notranslate"><title>probe315 page</title>
<style>body{font:15px sans-serif;margin:12px}p{margin:12px 0}#plain{font-size:22px}textarea{width:90%}</style></head>
<body><p><b>probe315 page</b></p>
<p><button id="apply" type="button">Apply</button> &nbsp; <label><input id="option" type="checkbox"> Probe option</label></p>
<p><label><input type="radio" name="pick" id="r1" checked> Radio one</label> <label><input type="radio" name="pick" id="r2"> Radio two</label> <label><input type="radio" name="pick" id="r3"> Radio three</label></p>
<p><a id="lnk" href="#one">Probe link</a> &nbsp; <a id="lnk2" href="#two">Second link</a></p>
<p id="plain">Plain words to read here, nothing to press.</p>
<p><input id="name" type="text" placeholder="Probe name" aria-label="Probe name" size="30"></p>
<p><input id="secret" type="password" placeholder="Probe secret" aria-label="Probe secret" size="30"></p>
<p><textarea id="notes" aria-label="Probe notes" rows="5"></textarea></p>
<p id="status">Ready</p>
<script>(() => { const c = {pointerdown: 0, mousedown: 0, mouseup: 0, click: 0, dblclick: 0, applyClick: 0, optionChange: 0, radioChange: 0,
  linkClick: 0, link2Click: 0, nameFocus: 0, secretFocus: 0, notesFocus: 0, windowFocus: 0, windowBlur: 0, selChange: 0, input: 0};
let seq = 0, lastClick = null; const load = Math.random().toString(36).slice(2, 10);
const $ = id => document.getElementById(id);
const send = () => { seq += 1; const s = $('secret').value; navigator.sendBeacon('/counters', JSON.stringify({load, seq, counts: c, checked: $('option').checked,
  radio: ['r1', 'r2', 'r3'].find(id => $(id).checked) ?? null, name: $('name').value, notes: $('notes').value, secretLen: s.length, secretMarker: /q315/.test(s),
  selection: String(getSelection()).length, lastClick, focused: document.hasFocus(), active: document.activeElement ? document.activeElement.id || document.activeElement.tagName : null})); };
for (const k of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick']) document.addEventListener(k, e => { c[k] += 1; if (k === 'click') lastClick = {trusted: e.isTrusted, detail: e.detail, target: e.target.id || e.target.tagName}; send(); }, true);
$('apply').addEventListener('click', () => { c.applyClick += 1; send(); });
$('option').addEventListener('change', () => { c.optionChange += 1; send(); });
for (const id of ['r1', 'r2', 'r3']) $(id).addEventListener('change', () => { c.radioChange += 1; send(); });
$('lnk').addEventListener('click', e => { e.preventDefault(); c.linkClick += 1; send(); });
$('lnk2').addEventListener('click', e => { e.preventDefault(); c.link2Click += 1; send(); });
for (const id of ['name', 'secret', 'notes']) { $(id).addEventListener('focus', () => { c[id + 'Focus'] += 1; send(); }); $(id).addEventListener('input', () => { c.input += 1; send(); }); }
document.addEventListener('selectionchange', () => { c.selChange += 1; send(); });
window.addEventListener('focus', e => { if (e.target === window) { c.windowFocus += 1; send(); } });
window.addEventListener('blur', e => { if (e.target === window) { c.windowBlur += 1; send(); } });
addEventListener('load', () => { navigator.sendBeacon('/ready'); send(); setInterval(send, 400); }); })();</script></body></html>`;
// scripts/probe-314's /fixedtail: 2,500 paragraphs, each with a link, and a toolbar fixed to the viewport's bottom.
const CLICKS = `<script>document.addEventListener('click', e => { const t = e.target.closest('a,button'); navigator.sendBeacon('/clicked', JSON.stringify({text: t ? t.textContent : e.target.tagName, trusted: e.isTrusted})); e.preventDefault(); }, true);</script>`;
const FIXED_TAIL = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe304 fixed tail</title><style>body{font:14px sans-serif}p{margin:4px 0}
#tail{position:fixed;left:0;right:0;bottom:0;background:#eee;padding:6px;border-top:1px solid #999}#tail button{margin-right:8px}</style></head>
<body>${Array.from({length: 2500}, (_, i) => `<p>Paragraph ${i + 1} with <a href="#p${i + 1}">link ${i + 1}</a> in it.</p>`).join('')}<div id="tail" role="toolbar" aria-label="Tail">${Array.from({length: 8}, (_, i) => `<button>Tail ${i + 1}</button>`).join('')}</div>${CLICKS}<script>addEventListener('load', () => navigator.sendBeacon('/ready'));</script></body></html>`;

let latest = null, ready = false, loads = 0;
const clicks = [];
const server = createServer((req, res) => {
  if (req.method === 'GET') {
    if (req.url === '/') loads += 1;
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'});
    res.end(req.url.startsWith('/fixedtail') ? FIXED_TAIL : PAGE);
    return;
  }
  let body = '';
  req.on('data', d => { body += d; if (body.length > 8192) req.destroy(); });
  req.on('end', () => {
    if (req.url === '/ready') ready = true;
    if (req.url === '/counters') { try { const r = JSON.parse(body); if (!latest || r.load !== latest.load || r.seq >= latest.seq) latest = r; } catch {} }
    if (req.url === '/clicked') { try { clicks.push({at: Date.now(), ...JSON.parse(body)}); } catch {} }
    res.writeHead(204); res.end();
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const LOCAL = `http://127.0.0.1:${server.address().port}`;
const COUNTS = ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'applyClick', 'optionChange', 'radioChange', 'linkClick', 'link2Click',
  'nameFocus', 'secretFocus', 'notesFocus', 'windowFocus', 'windowBlur', 'selChange', 'input'];
const counters = () => (latest ? {load: latest.load, ...latest.counts, checked: latest.checked, radio: latest.radio, name: latest.name, notes: latest.notes,
  secretLen: latest.secretLen, secretMarker: latest.secretMarker, selection: latest.selection, lastClick: latest.lastClick, focused: latest.focused, active: latest.active, loads} : {loads});
// The change over an action; a reload (a new load id) counts from zero. Only the counters that moved.
const delta = (before, after) => Object.fromEntries([...COUNTS.map(k => [k, (after[k] ?? 0) - (after.load === before.load ? before[k] ?? 0 : 0)]), ['loads', after.loads - before.loads]].filter(([, v]) => v));

// ---- the engines' wire --------------------------------------------------------------------------------------------
class Wire {
  static connect(path) {
    return new Promise((resolve, reject) => {
      const s = createConnection(path);
      s.once('connect', () => { s.off('error', reject); resolve(new Wire(s)); });
      s.once('error', reject);
    });
  }
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
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: no answer in ${timeout} ms`)); }, timeout);
      this.pending.set(id, m => { clearTimeout(t); resolve(m); });
      this.s.write(Buffer.concat([head, bytes]));
    });
  }
  execute(method, args, {budgetMs = 60_000, lineage} = {}) {
    return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + budgetMs, ...(lineage ? {lineage} : {})}, budgetMs + 60_000);
  }
  close() { this.s.destroy(); }
}
// An action's answer without the tree: the error whole (errorName, meta), or the result's meta.
const lean = r => r.error ? {error: JSON.parse(JSON.stringify(r.error))} : {result: JSON.parse(JSON.stringify(r.result ?? null, (k, v) => (k === 'nodes' || k === 'screenshot' || k === 'menuBar' ? undefined : v)))};
const metaOf = a => a?.error ? a.error.meta : a?.result?.meta;
const answerOf = a => (a?.error ? (a.error.errorName ?? a.error.code) : 'success');

async function startEngine(bin, name) {
  // Each engine its own process and socket directory; a short path (the socket's limit is 103 bytes).
  const dir = join(process.env.RUNNER_TEMP || OUT, `s315${name}`); mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, 'e.sock');
  const child = spawn(bin, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr = (stderr + d).slice(-20_000); });
  child.stdout.on('data', () => {});
  const connect = async desktop => {
    const wire = await Wire.connect(socket);
    const ping = await wire.call('ping', {clientApiVersion: 'cua-engine-1', desktop});
    if (ping.error) throw new Error(`ping ${name}: ${JSON.stringify(ping.error).slice(0, 300)}`);
    wire.identity = ping.result;
    return wire;
  };
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) throw new Error(`engine ${name} exited ${child.exitCode}: ${stderr.slice(0, 2000)}`);
    try {
      const w = await connect('shared');
      const identity = w.identity, status = (await w.call('status')).result;
      w.close();
      return {name, child, connect, identity, status, stderr: () => stderr};
    } catch { await sleep(50); }
  }
  throw new Error(`engine ${name} did not listen: ${stderr.slice(0, 2000)}`);
}
function startTool() {
  const child = spawn(TOOL, [], {stdio: ['pipe', 'pipe', 'pipe']});
  const lines = createInterface({input: child.stdout});
  const waiting = [];
  lines.on('line', l => { const w = waiting.shift(); if (w) { try { w(JSON.parse(l)); } catch { w({error: `bad answer ${l.slice(0, 200)}`}); } } });
  child.stderr.on('data', d => log('tool stderr', String(d).slice(0, 500)));
  return {
    ask: (o, timeout = 120_000) => new Promise(resolve => {
      const t = setTimeout(() => resolve({error: 'tool timeout'}), timeout);
      waiting.push(v => { clearTimeout(t); resolve(v); });
      child.stdin.write(JSON.stringify(o) + '\n');
    }),
    stop: () => { child.stdin.end(); setTimeout(() => child.kill('SIGKILL'), 1000); },
  };
}

// ---- TextEdit in front, the browser behind ------------------------------------------------------------------------
const frontmost = () => {
  const asn = sh('lsappinfo', ['front']).out;
  const info = sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out;
  return (info.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] || info || null;
};
const TEXT_DOC = join(process.env.RUNNER_TEMP || OUT, 'front315.txt');
writeFileSync(TEXT_DOC, 'TextEdit is the frontmost window during each action.\n');
async function frontTextEdit() {
  for (let i = 0; i < 4; i++) {
    sh('open', ['-a', 'TextEdit', TEXT_DOC]);
    await sleep(1200);
    if (frontmost() === 'com.apple.TextEdit') break;
  }
  osa('tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {0, 40}\nset size of window 1 to {380, 300}\nend tell\nend tell');
  await sleep(300);
  return frontmost();
}
/// The browser's layer-0 windows against TextEdit's, front to back (win.swift dump).
function order(pid) {
  const d = dump(WIN_BIN);
  const layer0 = (d.windows ?? []).filter(w => w.layer === 0);
  const mine = layer0.map((w, i) => [w, i]).filter(([w]) => w.pid === pid).map(([, i]) => i);
  const te = layer0.map((w, i) => [w, i]).filter(([w]) => w.owner === 'TextEdit').map(([, i]) => i);
  return {frontmost: d.frontmost, browserIdx: mine, textEditIdx: te, browserAbove: mine.length > 0 && te.length > 0 && Math.min(...mine) < Math.min(...te),
    owners: layer0.slice(0, 6).map(w => w.owner)};
}

/// The watch, judged (scripts/probe-321/watch.mjs) and with its changes kept: above TextEdit's front window is the raise.
function watched(w, delivery) {
  const j = judge(w, delivery, 'com.apple.TextEdit', 'TextEdit');
  const changes = (w?.changes ?? []).map(c => [Math.round(c.t), c.aboveFront ? 1 : 0, c.aboveAny ? 1 : 0, c.frontmost, c.key]);
  return {...j, aboveFront: changes.some(c => c[1]), changes: changes.length, trace: changes.slice(0, 12), firstOrder: w?.changes?.[0]?.order?.slice(0, 4) ?? null};
}

// ---- the browsers -------------------------------------------------------------------------------------------------
async function waitReady(ms = 30_000) {
  for (let i = 0; i < ms / 250 && !ready; i++) await sleep(250);
  return ready;
}
async function launch(path, label, {devtools = false} = {}) {
  ready = false; latest = null;
  const url = `${LOCAL}${path}`;
  const profile = join(OUT, 'profiles', fileName(label));
  let child;
  if (BROWSER === 'chrome') {
    child = spawn(CFT, [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen',
      '--lang=en-US', '--disable-features=Translate', `--window-position=${FRAME.x},${FRAME.y}`, `--window-size=${FRAME.w},${FRAME.h}`, url], {stdio: 'ignore'});
    child.launchedAt = Date.now();
  } else if (BROWSER === 'firefox' && devtools) {
    firefoxProfile(profile);
    child = spawn(FIREFOX, ['-profile', profile, '-no-remote', '-new-instance', '-devtools', url], {stdio: 'ignore'});
    child.launchedAt = Date.now();
    for (let i = 0; i < 80; i++) { await sleep(250); if (placePid(child.pid, FRAME) === 0) break; }
  } else {
    child = await launchOther(url, profile, FRAME);
  }
  const loaded = await waitReady();
  await sleep(2500);
  placePid(child.pid, FRAME);
  return {child, loaded};
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  for (let i = 0; i < 20 && child.exitCode === null; i++) await sleep(250);
  if (child.exitCode === null) child.kill('SIGKILL');
  await sleep(1500);
}

// ---- an observation, a target, an action --------------------------------------------------------------------------
const labelOf = n => `${n.title ?? ''} ${n.description ?? ''} ${n.placeholder ?? ''} ${n.help ?? ''} ${typeof n.value === 'string' && n.role === 'AXStaticText' ? n.value : ''}`;
const TARGETS = {
  button: n => n.role === 'AXButton' && /\bApply\b/.test(labelOf(n)),
  checkbox: n => n.role === 'AXCheckBox' && /Probe option/.test(labelOf(n)),
  radio2: n => n.role === 'AXRadioButton' && /Radio two/.test(labelOf(n)),
  radio3: n => n.role === 'AXRadioButton' && /Radio three/.test(labelOf(n)),
  link: n => n.role === 'AXLink' && /Probe link/.test(labelOf(n)),
  link2: n => n.role === 'AXLink' && /Second link/.test(labelOf(n)),
  plain: n => n.role === 'AXStaticText' && /Plain words/.test(labelOf(n)),
  name: n => /AXTextField|AXSecureTextField|AXComboBox/.test(n.role) && /Probe name/.test(labelOf(n)),
  secret: n => (n.role === 'AXSecureTextField' || n.subrole === 'AXSecureTextField' || n.role === 'AXTextField') && /Probe secret/.test(labelOf(n)),
  notes: n => n.role === 'AXTextArea' || (n.role === 'AXTextField' && /Probe notes/.test(labelOf(n))),
  reload: n => n.role === 'AXButton' && /reload/i.test(labelOf(n)),
};
// Fallbacks where a role is exposed otherwise: the radio button or checkbox by its label alone.
const looseFind = (nodes, target) => nodes.find(TARGETS[target]) ?? (target.startsWith('radio') || target === 'checkbox'
  ? nodes.find(n => n.frame && /AXRadioButton|AXCheckBox/.test(n.role) && labelOf(n).includes(target === 'checkbox' ? 'Probe option' : target === 'radio2' ? 'Radio two' : 'Radio three'))
  : undefined);
const nodeView = n => n && ({role: n.role, subrole: n.subrole, title: n.title, description: n.description, actions: n.actions, frame: n.frame, token: n.token});
const centreOf = (sky, frame) => {
  const wf = sky.window.frame, scale = sky.screenshot.width / wf.width;
  return {x: Math.round((frame.x + frame.width / 2 - wf.x) * scale), y: Math.round((frame.y + frame.height / 2 - wf.y) * scale), scale,
    screen: {x: frame.x + frame.width / 2, y: frame.y + frame.height / 2}};
};
const pixelOf = (sky, sx, sy) => { const wf = sky.window.frame, scale = sky.screenshot.width / wf.width; return {x: Math.round((sx - wf.x) * scale), y: Math.round((sy - wf.y) * scale)}; };
const hitAt = (pid, sx, sy) => { const h = json(sh(HIT, [String(pid), String(sx), String(sy)])); return {chain: h.appChain, actions: h.appActions, err: h.appHitError}; };

async function observe(w, pid, label) {
  const shots = join(OUT, 'shots', fileName(label)); mkdirSync(shots, {recursive: true});
  try {
    const from = Date.now();
    const r = await w.execute('get_app_state', {pid, includeScreenshot: true, outputDirectory: shots});
    return r.error ? {error: lean(r).error, ms: Date.now() - from} : {sky: r.result, ms: Date.now() - from};
  } finally { rmSync(shots, {recursive: true, force: true}); }
}

/// One cell: a fresh connection in the block's mode, TextEdit in front, an observation, the action watched, the page's
/// counters before and 2.5 s after, the effect read for the cell's kind, then (fields) type_text and its landing.
async function cell(ctx, spec) {
  const {head, mode, pid} = ctx;
  const label = `${BROWSER}/${mode}/${spec.name}/${head}`;
  const row = {label, browser: BROWSER, head, mode, rep: REP, block: ctx.block, cell: spec.name, kind: spec.kind, target: spec.target ?? null};
  const w = await engines[head].connect(mode);
  try {
    if (frontmost() !== 'com.apple.TextEdit' || order(pid).browserAbove) row.refronted = await frontTextEdit();
    const o = await observe(w, pid, label);
    row.observationMs = o.ms;
    if (o.error) { row.problem = {getAppState: o.error}; return row; }
    const sky = o.sky;
    row.window = sky.window?.frame;
    let args, node;
    if (spec.target) {
      node = looseFind(sky.nodes, spec.target);
      if (!node?.frame) { row.problem = `no ${spec.target} node with a frame`; row.roles = [...new Set(sky.nodes.map(n => n.role))]; return row; }
      row.node = nodeView(node);
    }
    const c = node ? centreOf(sky, node.frame) : null;
    if (spec.kind === 'coord') args = {pid, x: c.x, y: c.y};
    else if (spec.kind === 'token') args = {pid, element: node.token};
    else if (spec.kind === 'double') args = {pid, x: c.x, y: c.y, click_count: 2};
    else if (spec.kind === 'drag') {
      const f = node.frame, y = f.y + f.height / 2;
      const from = pixelOf(sky, f.x + 6, y), to = pixelOf(sky, f.x + f.width - 6, y);
      args = {pid, from_x: from.x, from_y: from.y, to_x: to.x, to_y: to.y};
    } else if (spec.kind === 'setValue') args = {pid, element: node.token, value: spec.value};
    if (c) { row.point = {pixel: {x: c.x, y: c.y}, screen: c.screen}; row.hit = hitAt(pid, c.screen.x, c.screen.y); }
    row.orderBefore = order(pid);
    row.frontBefore = row.orderBefore.frontmost;
    await sleep(600);
    row.before = counters();
    const watcher = await watch(WIN_BIN, pid, 'TextEdit', 4000);
    watcher.go();
    const method = spec.kind === 'drag' ? 'drag' : spec.kind === 'setValue' ? 'set_value' : 'click';
    const started = Date.now();
    row.answer = lean(await w.execute(method, args, {lineage: sky.lineage}));
    row.ms = Date.now() - started;
    await sleep(2500);
    row.after = counters();
    row.delta = delta(row.before, row.after);
    row.watch = watched(await watcher.done(), metaOf(row.answer)?.delivery);
    row.orderAfter = order(pid);
    row.frontAfter = row.orderAfter.frontmost;
    if (spec.thenSetValue) {
      // set_value on the field the click just carried, on the same connection and observation.
      const t0 = Date.now();
      row.setValueAnswer = lean(await w.execute('set_value', {pid, element: node.token, value: spec.thenSetValue}, {lineage: sky.lineage}));
      row.setValueMs = Date.now() - t0;
      await sleep(1200);
      const after = counters();
      row.setValueEffect = {seen: after.name === spec.thenSetValue, name: after.name, active: after.active, posted: ((after.pointerdown ?? 0) - (row.after.pointerdown ?? 0)) + ((after.mousedown ?? 0) - (row.after.mousedown ?? 0))};
      row.orderAfterSetValue = order(pid);
    }
    if (spec.type) {
      const marker = `q315${spec.name.replace(/[^a-z]/g, '').slice(0, 6)}${REP}${head}`;
      const t0 = Date.now();
      row.typeAnswer = lean(await w.execute('type_text', {pid, text: marker}));
      row.typeMs = Date.now() - t0;
      await sleep(1200);
      const after = counters();
      const field = spec.target;
      row.typed = {marker, landed: field === 'secret' ? !!after.secretMarker && (after.secretLen ?? 0) - (row.after.secretLen ?? 0) >= marker.length : String(after[field] ?? '').includes(marker),
        active: after.active, input: (after.input ?? 0) - (row.after.input ?? 0), elsewhere: field !== 'name' && String(after.name ?? '').includes(marker) ? 'name' : field !== 'notes' && String(after.notes ?? '').includes(marker) ? 'notes' : null};
      row.orderAfterType = order(pid);
    }
    row.effect = effectOf(spec, row);
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 2000);
  } finally { w.close(); }
  return row;
}
function effectOf(spec, row) {
  const d = row.delta ?? {}, a = row.after ?? {}, b = row.before ?? {};
  const posted = (d.pointerdown ?? 0) + (d.mousedown ?? 0);
  switch (spec.effect) {
    case 'apply': return {seen: (d.applyClick ?? 0) > 0, posted};
    case 'option': return {seen: (d.optionChange ?? 0) > 0 && a.checked !== b.checked, checkedBefore: b.checked, checkedAfter: a.checked, posted};
    case 'radio': return {seen: a.radio === spec.radio, radio: a.radio, posted};
    case 'link': return {seen: (d.linkClick ?? 0) > 0, posted};
    case 'link2': return {seen: (d.link2Click ?? 0) > 0, posted};
    case 'focus': return {seen: a.active === spec.target, active: a.active, focusEvents: d[`${spec.target}Focus`] ?? 0, posted};
    case 'nothing': return {seen: posted === 0 && !(d.click) && !(d.dblclick), posted, clicks: d.click ?? 0, dblclicks: d.dblclick ?? 0, selection: a.selection};
    case 'reload': return {seen: (d.loads ?? 0) > 0, loads: d.loads ?? 0};
    case 'value': return {seen: a.name === spec.value, name: a.name, posted, active: a.active};
    default: return null;
  }
}
const PAGE_CELLS = [
  {name: 'coord/button', kind: 'coord', target: 'button', effect: 'apply'},
  {name: 'coord/checkbox', kind: 'coord', target: 'checkbox', effect: 'option'},
  {name: 'coord/radio', kind: 'coord', target: 'radio2', effect: 'radio', radio: 'r2'},
  {name: 'coord/link', kind: 'coord', target: 'link', effect: 'link'},
  {name: 'coord/plain', kind: 'coord', target: 'plain', effect: 'nothing'},
  {name: 'drag/plain', kind: 'drag', target: 'plain', effect: 'nothing'},
  {name: 'double/plain', kind: 'double', target: 'plain', effect: 'nothing'},
  {name: 'coord/name', kind: 'coord', target: 'name', effect: 'focus', type: true},
  {name: 'coord/notes', kind: 'coord', target: 'notes', effect: 'focus', type: true},
  {name: 'coord/secret', kind: 'coord', target: 'secret', effect: 'focus', type: true},
  {name: 'token/button', kind: 'token', target: 'button', effect: 'apply'},
  {name: 'token/checkbox', kind: 'token', target: 'checkbox', effect: 'option'},
  {name: 'token/radio', kind: 'token', target: 'radio3', effect: 'radio', radio: 'r3'},
  {name: 'token/link', kind: 'token', target: 'link2', effect: 'link2'},
  {name: 'token/name', kind: 'token', target: 'name', effect: 'focus', type: true},
  {name: 'token/notes', kind: 'token', target: 'notes', effect: 'focus', type: true},
  {name: 'token/secret', kind: 'token', target: 'secret', effect: 'focus', type: true},
  {name: 'setValue/name', kind: 'setValue', target: 'name', effect: 'value', value: 'sv315value'},
  {name: 'token/name+setValue', kind: 'token', target: 'name', effect: 'focus', thenSetValue: 'sv315after'},
  {name: 'coord/reload', kind: 'coord', target: 'reload', effect: 'reload'},
].filter(c => !ONLY_CELLS || ONLY_CELLS.includes(c.name));

// ---- /fixedtail: rows below the top by token ----------------------------------------------------------------------
function directChildren(nodes, i) {
  const out = [], d = nodes[i].depth;
  for (let j = i + 1; j < nodes.length && nodes[j].depth > d; j++) if (nodes[j].depth === d + 1) out.push(j);
  return out;
}
function rowLabel(nodes, i) {
  const d = nodes[i].depth;
  for (let j = i; j < nodes.length && (j === i || nodes[j].depth > d); j++) {
    const m = String(nodes[j].title ?? nodes[j].description ?? nodes[j].value ?? '').match(/^(Paragraph \d+)\b/);
    if (m) return m[1];
  }
  return null;
}
async function fixedTailPosition(ctx, at) {
  const {head, mode, pid} = ctx;
  const label = `${BROWSER}/${mode}/fixedtail/${at.name}/${head}`;
  const row = {label, browser: BROWSER, head, mode, rep: REP, block: 'fixedtail', cell: `fixedtail/${at.name}`, pos: at.name, clicks: []};
  row.scroll = await ctx.tool.ask({op: 'scrollto', pid, window: [FRAME.x, FRAME.y, FRAME.w, FRAME.h], frac: at.frac});
  await sleep(2000);
  const w = await engines[head].connect(mode);
  try {
    if (frontmost() !== 'com.apple.TextEdit' || order(pid).browserAbove) row.refronted = await frontTextEdit();
    const o = await observe(w, pid, label);
    if (o.error) { row.problem = {getAppState: o.error}; return row; }
    const sky = o.sky, nodes = sky.nodes;
    const totalOf = n => n.shown?.of ?? n.children;
    const wide = nodes.map((n, i) => [n, i]).filter(([n]) => totalOf(n) > 499).sort((x, y) => totalOf(y[0]) - totalOf(x[0]))[0];
    const targets = [];
    if (wide) {
      const rows = directChildren(nodes, wide[1]).filter(j => nodes[j].role !== 'AXToolbar' && rowLabel(nodes, j));
      row.printedRows = rows.length ? [rowLabel(nodes, rows[0]), rowLabel(nodes, rows[rows.length - 1])] : null;
      for (const k of [Math.floor(rows.length / 2), Math.floor(rows.length * 3 / 4)]) {
        const mid = rows[k];
        if (mid == null) continue;
        const d = nodes[mid].depth;
        for (let j = mid; j < nodes.length && (j === mid || nodes[j].depth > d); j++) if (nodes[j].role === 'AXLink') { targets.push({kind: 'row', j, row: rowLabel(nodes, mid)}); break; }
      }
    }
    const bar = nodes.findIndex(n => n.role === 'AXButton' && /^Tail 3$/.test(String(n.title ?? n.description ?? '')));
    if (bar >= 0) targets.push({kind: 'bar', j: bar, row: 'Tail 3'});
    if (!targets.length) row.none = 'no row or bar printed';
    for (const t of targets) {
      const n = nodes[t.j];
      const before = clicks.length;
      const watcher = await watch(WIN_BIN, pid, 'TextEdit', 3000);
      watcher.go();
      const from = Date.now();
      const answer = lean(await w.execute('click', {pid, element: n.token}, {lineage: sky.lineage}));
      const ms = Date.now() - from;
      for (let k = 0; k < 20 && clicks.length === before; k++) await sleep(100);
      const wj = watched(await watcher.done(), metaOf(answer)?.delivery);
      const page = clicks.slice(before).map(p => p.text?.trim());
      row.clicks.push({kind: t.kind, row: t.row, role: n.role, frame: n.frame, ms, answer, page,
        seen: page.some(p => t.kind === 'bar' ? p === 'Tail 3' : p === `link ${t.row.split(' ')[1]}`), watch: wj});
      await sleep(500);
      if (mode === 'dedicated' && frontmost() !== 'com.apple.TextEdit') await frontTextEdit();
    }
    row.orderAfter = order(pid);
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 2000);
  } finally { w.close(); }
  return row;
}

// ---- Firefox's chrome: the sidebar and devtools -------------------------------------------------------------------
async function openFirefoxPanes(pid) {
  const steps = {};
  steps.front = osa(`tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`).status;
  await sleep(1500);
  steps.frontmost = frontmost();
  steps.sidebar = osa('tell application "System Events" to keystroke "b" using command down').status;
  await sleep(2500);
  return steps;
}
async function chromeBlock(ctx) {
  const {head, pid} = ctx;
  const label = `${BROWSER}/shared/chrome/${head}`;
  const row = {label, browser: BROWSER, head, mode: 'shared', rep: REP, block: 'chrome', cell: 'chrome', clicks: []};
  row.panes = ctx.panes;
  const w = await engines[head].connect('shared');
  try {
    row.refronted = await frontTextEdit();
    const o = await observe(w, pid, label);
    if (o.error) { row.problem = {getAppState: o.error}; return row; }
    const sky = o.sky;
    row.window = sky.window?.frame;
    row.webAreas = sky.nodes.filter(n => n.role === 'AXWebArea').map(n => ({title: n.title, description: n.description, frame: n.frame}));
    const page = sky.nodes.find(n => n.role === 'AXWebArea' && /probe315/.test(`${n.title ?? ''} ${n.description ?? ''}`)) ?? sky.nodes.find(n => n.role === 'AXWebArea');
    row.pageArea = page?.frame ?? null;
    const wf = sky.window.frame;
    const gridOut = join(OUT, `grid-${fileName(label)}.json`);
    row.grid = await ctx.tool.ask({op: 'grid', pid, window: [wf.x, wf.y, wf.width, wf.height], step: 20, out: gridOut});
    let grid = null;
    try { grid = JSON.parse(readFileSync(gridOut, 'utf8')); writeFileSync(`${gridOut}.gz`, gzipSync(JSON.stringify(grid))); rmSync(gridOut); } catch (e) { row.gridError = String(e); }
    // Regions: left of the page's web area (the sidebar), below it (devtools), above it (the toolbar).
    const pa = row.pageArea;
    const regions = pa ? {
      sidebar: {x: wf.x, y: pa.y, width: pa.x - wf.x, height: wf.y + wf.height - pa.y},
      devtools: {x: pa.x, y: pa.y + pa.height, width: wf.x + wf.width - pa.x, height: wf.y + wf.height - (pa.y + pa.height)},
      toolbar: {x: wf.x, y: wf.y, width: wf.width, height: pa.y - wf.y},
      page: pa,
    } : {};
    row.regions = regions;
    const inside = (r, x, y) => r && r.width > 4 && r.height > 4 && x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
    if (grid) {
      row.gridSummary = {};
      for (const [name, r] of Object.entries(regions)) {
        const pts = grid.points.filter(p => inside(r, p.x, p.y));
        const roles = {};
        let web = 0;
        for (const p of pts) {
          const ch = (p.chain ?? []).map(c => c[0]);
          if (ch.includes('AXWebArea')) web += 1;
          const k = ch.slice(0, 3).join('<') || (p.otherWindow ? 'otherWindow' : `err${p.err}`);
          roles[k] = (roles[k] ?? 0) + 1;
        }
        row.gridSummary[name] = {points: pts.length, inWebArea: web, chains: Object.entries(roles).sort((a, b) => b[1] - a[1]).slice(0, 8)};
      }
    }
    sh('screencapture', ['-x', join(OUT, `screen-${fileName(label)}.png`)]);
    // Clicks: per pane, the first control with an action inside it, and the pane's centre.
    const pick = r => sky.nodes.find(n => n.frame && inside(r, n.frame.x + n.frame.width / 2, n.frame.y + n.frame.height / 2) && (n.actions ?? []).some(a => a === 'AXPress' || a === 'AXPick')
      && /AXButton|AXRadioButton|AXTab|AXCheckBox|AXLink|AXMenuButton|AXPopUpButton|AXRow|AXCell|AXStaticText|AXTextField/.test(n.role));
    const plan = [];
    for (const name of ['sidebar', 'devtools']) {
      const r = regions[name];
      if (!r || r.width <= 4 || r.height <= 4) { plan.push({pane: name, none: 'no region'}); continue; }
      const n = pick(r);
      if (n) plan.push({pane: name, what: 'control', node: n, sx: n.frame.x + n.frame.width / 2, sy: n.frame.y + n.frame.height / 2});
      plan.push({pane: name, what: 'centre', sx: r.x + r.width / 2, sy: r.y + r.height / 2});
    }
    for (const p of plan) {
      if (p.none) { row.clicks.push(p); continue; }
      const px = pixelOf(sky, p.sx, p.sy);
      const entry = {pane: p.pane, what: p.what, node: nodeView(p.node), screen: {x: p.sx, y: p.sy}, pixel: px, hit: hitAt(pid, p.sx, p.sy)};
      if (frontmost() !== 'com.apple.TextEdit') entry.refronted = await frontTextEdit();
      // A fresh observation for each click: the earlier click may have moved the pane.
      const o2 = await observe(w, pid, `${label}-${p.pane}-${p.what}`);
      const watcher = await watch(WIN_BIN, pid, 'TextEdit', 3000);
      watcher.go();
      const t0 = Date.now();
      entry.answer = lean(await w.execute('click', {pid, x: px.x, y: px.y}, {lineage: o2.sky?.lineage}));
      entry.ms = Date.now() - t0;
      await sleep(1500);
      entry.watch = watched(await watcher.done(), metaOf(entry.answer)?.delivery);
      entry.frontAfter = frontmost();
      row.clicks.push(entry);
    }
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 2000);
  } finally { w.close(); }
  return row;
}

// ---- the run ------------------------------------------------------------------------------------------------------
const results = [];
const config = {
  browser: BROWSER, blocks: BLOCKS, rep: REP, imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, runnerName: process.env.RUNNER_NAME ?? null,
  macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), browserVersion: browserVersion(),
  aCommit: process.env.P315_A_COMMIT ?? null, bCommit: process.env.P315_B_COMMIT ?? null, probeCommit: process.env.GITHUB_SHA ?? null, frame: FRAME,
};
const save = () => writeFileSync(join(OUT, `results-${BROWSER}.json`), JSON.stringify({config, results}, null, 1));
function verdict(r) {
  if (r.exception || r.problem) return `PROBLEM ${JSON.stringify(r.problem ?? '')} ${r.exception ?? ''}`.slice(0, 600);
  const m = metaOf(r.answer);
  return `${answerOf(r.answer)} ms=${r.ms} route=${m?.inputRoute} ec=${JSON.stringify(m?.elementClick ?? null)} effect=${JSON.stringify(r.effect)} delta=${JSON.stringify(r.delta)}`
    + ` front=${r.frontBefore}->${r.frontAfter} aboveFront=${r.watch?.aboveFront} frontHeld=${r.watch?.frontHeld} keyHeld=${r.watch?.keyHeld} above=${r.orderAfter?.browserAbove}`
    + (r.typed ? ` typed=${answerOf(r.typeAnswer)} landed=${r.typed.landed} active=${r.typed.active}` : '')
    + (r.setValueAnswer ? ` setValue=${answerOf(r.setValueAnswer)} ${JSON.stringify(r.setValueEffect)}` : '')
    + (r.answer?.error ? ` message=${JSON.stringify(r.answer.error.message)}` : '') + (r.refronted ? ` refronted=${r.refronted}` : '');
}
const tool = startTool();
config.screen = await tool.ask({op: 'screen'});
const headOrder = REP % 2 === 1 ? ['a', 'b'] : ['b', 'a'];
const engines = {};
for (const h of headOrder) engines[h] = await startEngine(BINS[h], h);
config.engines = Object.fromEntries(headOrder.map(h => [h, {bin: BINS[h], pid: engines[h].child.pid, identity: engines[h].identity, status: engines[h].status}]));
config.headOrder = headOrder;
log('config', JSON.stringify(config));
save();
await frontTextEdit();
try {
  for (const block of BLOCKS) {
    const modes = block === 'chrome' ? ['shared'] : MODES;
    for (const mode of modes) {
      for (const head of headOrder) {
        const blockLabel = `${block}-${mode}-${head}-r${REP}`;
        log(`== ${new Date().toISOString().slice(11, 19)} ${blockLabel}`);
        const {child, loaded} = await launch(block === 'fixedtail' ? '/fixedtail' : '/', blockLabel, {devtools: block === 'chrome'});
        const ctx = {head, mode, pid: child.pid, block, tool};
        try {
          if (block === 'chrome') ctx.panes = await openFirefoxPanes(child.pid);
          await frontTextEdit();
          // An untimed observation first: Gecko builds its tree at an AX client's first contact.
          const warm = await engines[head].connect(mode);
          const wo = await observe(warm, child.pid, `${blockLabel}-warm`); warm.close();
          const warmRow = {label: `${BROWSER}/${mode}/${block}/warm/${head}`, browser: BROWSER, head, mode, rep: REP, block, cell: 'warm', loaded,
            warm: wo.error ? {error: wo.error} : {nodes: wo.sky.nodes.length, ms: wo.ms, webAreas: wo.sky.nodes.filter(n => n.role === 'AXWebArea').length}, launchedAt: child.launchedAt};
          results.push(warmRow); save();
          log(`${warmRow.label}: loaded=${loaded} ${JSON.stringify(warmRow.warm)}`);
          await sleep(1500);
          if (block === 'page') {
            if (BROWSER === 'chrome') { const left = child.launchedAt + 25_000 - Date.now(); if (left > 0) await sleep(left); }  // past CfT's toolbar re-layout
            for (const spec of PAGE_CELLS) {
              const row = await cell(ctx, spec);
              results.push(row); save();
              log(`${row.label}: ${verdict(row)}`);
              if (mode === 'dedicated') await frontTextEdit();
            }
          } else if (block === 'fixedtail') {
            for (const at of [{name: 'top', frac: 0}, {name: 'f25', frac: 0.25}, {name: 'f50', frac: 0.5}, {name: 'f90', frac: 0.9}]) {
              const row = await fixedTailPosition(ctx, at);
              results.push(row); save();
              log(`${row.label}: scroll=${JSON.stringify(row.scroll)} rows=${JSON.stringify(row.printedRows)} ${row.problem || row.exception ? JSON.stringify(row.problem ?? row.exception).slice(0, 400) : ''}`);
              for (const k of row.clicks) log(`  ${k.kind} ${k.row}: ${answerOf(k.answer)} ec=${JSON.stringify(metaOf(k.answer)?.elementClick ?? null)} seen=${k.seen} page=${JSON.stringify(k.page)} frontHeld=${k.watch.frontHeld} raised=${k.watch.raisedAfterHold}`);
            }
          } else if (block === 'chrome') {
            const row = await chromeBlock(ctx);
            results.push(row); save();
            log(`${row.label}: panes=${JSON.stringify(row.panes)} webAreas=${JSON.stringify(row.webAreas)} page=${JSON.stringify(row.pageArea)} grid=${JSON.stringify(row.gridSummary)} ${row.problem || row.exception ? JSON.stringify(row.problem ?? row.exception).slice(0, 400) : ''}`);
            for (const k of row.clicks) log(`  ${k.pane} ${k.what}: ${k.none ?? `${answerOf(k.answer)} ec=${JSON.stringify(metaOf(k.answer)?.elementClick ?? null)} node=${JSON.stringify(k.node ? [k.node.role, k.node.title, k.node.description] : null)} hit=${JSON.stringify(k.hit?.chain?.slice(0, 6))} front=${k.frontAfter}`}`);
          }
        } catch (e) {
          results.push({label: `${BROWSER}/${mode}/${block}/${head}`, block, head, mode, exception: String(e?.stack || e).slice(0, 2000)}); save();
          log(`${blockLabel}: EXCEPTION ${String(e?.stack || e).slice(0, 600)}`);
        } finally { await stop(child); }
      }
    }
  }
} catch (e) {
  config.exception = String(e?.stack || e).slice(0, 3000);
  log('exception', config.exception);
}
for (const e of Object.values(engines)) { config[`${e.name}Stderr`] = e.stderr().slice(-3000); if (e.child.exitCode === null) e.child.kill('SIGKILL'); }
save();
tool.stop();
server.close();
process.exit(0);
