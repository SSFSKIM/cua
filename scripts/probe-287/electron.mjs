// #287's Electron cells on a GitHub-hosted macOS runner: VS Code (Electron, principal class AtomApplication, so a
// Chromium-family process to the engine) behind a frontmost TextEdit, a fresh VS Code per cell (its own user-data and
// extensions directories, no extensions, no welcome page, no workspace trust). #288/#292's EUI and AXManualAccessibility
// cells in Electron's form: Electron lists AXManualAccessibility and its getter keeps reading false, so complete mode
// is read as the web content's size (scripts/probe-287/axrecon.swift `state`: the elements under window 1, the first
// AXWebArea's element count), sampled every 250 ms.
//   t/none           no write: the samples alone (a plain AX read's effect)
//   t/manual         AXManualAccessibility true (the vendor's and the engine's write for Electron), then the samples
//   t/eui            AXEnhancedUserInterface true, then the samples
//   e/end_task       main's engine: observe, 3 s of samples, endTask, 3 s of samples (does the engine's release drop it?)
//   e/grace          observe, the connection kept open and idle, samples every 2 s for 36 s (the 30 s grace release)
//   e/sigterm        observe, 3 s, the engine's SIGTERM, 3 s of samples
//   c/<mode>/<target>  observe, then a coordinate click (shared or dedicated mode) on the explorer's other.txt, the
//                    editor's text or the New File button: the answer, its meta (#282/#288's web-area rules in Electron)
//                    and its effect (the window's title, the focused element)
//   node scripts/probe-287/electron.mjs --engine <cua-engine> --ax <axrecon> --out <dir> [--cells <prefix,…>]
import {spawn, spawnSync} from 'node:child_process';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-287 electron: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), ENGINE = arg('engine'), AX = arg('ax');
const ONLY = arg('cells') ? arg('cells').split(',').filter(Boolean) : null;
mkdirSync(OUT, {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-287 electron:', ...a);
const sh = (cmd, args, timeout = 20_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const json = r => { try { return JSON.parse(r.out); } catch { return {status: r.status, out: r.out.slice(0, 300)}; } };
const ax = (...a) => json(sh(AX, a.map(String), 30_000));
const frontmost = () => (sh('lsappinfo', ['info', '-only', 'bundleid', sh('lsappinfo', ['front']).out]).out.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] || null;
const fileName = s => s.replace(/[^a-z0-9-]+/gi, '_');
const APP = '/Applications/Visual Studio Code.app';
const BIN = `${APP}/Contents/MacOS/${sh('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', `${APP}/Contents/Info.plist`]).out}`;

class Wire {
  static connect(path) { return new Promise((resolve, reject) => { const s = createConnection(path); s.once('connect', () => { s.off('error', reject); resolve(new Wire(s)); }); s.once('error', reject); }); }
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
  execute(method, args) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 80_000}); }
  close() { this.s.destroy(); }
}
async function startEngine(label) {
  const dir = join(OUT, 'sock'); mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, `${fileName(label)}.sock`);
  const child = spawn(ENGINE, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr = (stderr + d).slice(-8000); });
  child.stdout.on('data', () => {});
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) throw new Error(`engine exited ${child.exitCode}: ${stderr.slice(0, 2000)}`);
    try { return {child, wire: await Wire.connect(socket), stderr: () => stderr}; } catch { await sleep(50); }
  }
  throw new Error('engine did not listen');
}
const TEXT_DOC = join(OUT, 'front.txt');
writeFileSync(TEXT_DOC, 'TextEdit is frontmost.\n');
async function frontTextEdit() {
  for (let i = 0; i < 4 && frontmost() !== 'com.apple.TextEdit'; i++) { sh('open', ['-a', 'TextEdit', TEXT_DOC]); await sleep(1500); }
  osa('tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {0, 40}\nset size of window 1 to {380, 300}\nend tell\nend tell');
  await sleep(500);
  return frontmost();
}
let launchN = 0;
async function launchCode(label) {
  const n = ++launchN;
  const dir = join(OUT, `work-${n}`); mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, 'notes.md'), '# probe287 notes\n\nThe first line of the editor is the heading above.\nA second paragraph line.\n');
  const child = spawn(BIN, [`--user-data-dir=${join(OUT, `user-${n}`)}`, `--extensions-dir=${join(OUT, `ext-${n}`)}`, '--disable-extensions', '--skip-welcome',
    '--skip-release-notes', '--disable-workspace-trust', '--disable-telemetry', '--new-window', dir, join(dir, 'notes.md')], {stdio: 'ignore'});
  const launchedAt = Date.now();
  for (let i = 0; i < 80; i++) { await sleep(250); if (osa(`tell application "System Events" to count windows of (first process whose unix id is ${child.pid})`).out >= '1') break; }
  await sleep(6000);
  osa(`tell application "System Events"\ntell (first process whose unix id is ${child.pid})\nset position of window 1 to {400, 30}\nset size of window 1 to {620, 720}\nend tell\nend tell`);
  await sleep(1000);
  return {child, pid: child.pid, launchedAt, stop: async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await sleep(2500); if (child.exitCode === null) child.kill('SIGKILL'); } await sleep(500); }};
}
const sampleOnce = (pid, from) => { const s = ax('state', pid); return {t: Date.now() - from, manual: s.manual, eui: s.eui, walked: s.walked, webArea: s.webAreaElements ?? null, ms: s.ms, activationPoint: s.activationPoint ?? null}; };
async function samples(pid, from, ms, every) {
  const out = [];
  for (let k = 0; Date.now() < from + ms; k++) { const due = from + k * every - Date.now(); if (due > 0) await sleep(due); out.push(sampleOnce(pid, from)); }
  return out;
}
const obsSummary = (o, ms) => o.error ? {error: o.error} : {ms, nodes: o.result.nodes.length, webAreas: o.result.nodes.filter(n => n.role === 'AXWebArea').length, truncated: o.result.truncated ?? null,
  timings: Object.fromEntries(['enabled', 'enablementPrior', 'enablementWrite', 'enablementWriteError', 'chromium', 'webShaped', 'webAreaFound', 'webAreaSeen', 'walkMs', 'totalMs', 'nodeCapHit'].map(k => [k, o.result.timings?.[k] ?? null]))};

const CELLS = [
  {label: 't/none', kind: 'trigger', write: null},
  {label: 't/manual', kind: 'trigger', write: 'AXManualAccessibility'},
  {label: 't/eui', kind: 'trigger', write: 'AXEnhancedUserInterface'},
  {label: 'e/end_task', kind: 'end'},
  {label: 'e/grace', kind: 'grace'},
  {label: 'e/sigterm', kind: 'sigterm'},
  // Shared mode (the ping names none) and dedicated, 3 s after the observation (complete mode in place): the explorer's
  // other.txt (its effect: the window's title names it), the editor's text, the explorer's New File button.
  {label: 'c/shared/explorer', kind: 'click', target: 'explorer', waitMs: 3000},
  {label: 'c/shared/editor', kind: 'click', target: 'editor', waitMs: 3000},
  {label: 'c/shared/button', kind: 'click', target: 'button', waitMs: 3000},
  {label: 'c/shared/explorer-fresh', kind: 'click', target: 'explorer'},
  {label: 'c/dedicated/explorer', kind: 'click', target: 'explorer', waitMs: 3000, desktop: 'dedicated'},
  {label: 'c/dedicated/editor', kind: 'click', target: 'editor', waitMs: 3000, desktop: 'dedicated'},
].filter(c => !ONLY || ONLY.some(p => c.label.startsWith(p)));

const rows = [];
const config = {macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '), imageVersion: process.env.ImageVersion ?? null, app: APP, bin: BIN,
  version: sh('defaults', ['read', `${APP}/Contents/Info`, 'CFBundleShortVersionString']).out, principal: sh('/usr/libexec/PlistBuddy', ['-c', 'Print :NSPrincipalClass', `${APP}/Contents/Info.plist`]).out,
  probeCommit: process.env.GITHUB_SHA ?? null, rep: process.env.P287_REP ?? null};
log('config', JSON.stringify(config));
for (const spec of CELLS) {
  const row = {label: spec.label};
  rows.push(row);
  let code, engine;
  try {
    code = await launchCode(spec.label);
    row.pid = code.pid;
    row.front = await frontTextEdit();
    const t0 = Date.now();
    row.pre = sampleOnce(code.pid, t0);
    if (spec.kind === 'trigger') {
      const from = Date.now();
      if (spec.write) row.write = ax('write', code.pid, spec.write, 1);
      row.samples = await samples(code.pid, from, 5000, 250);
    } else {
      engine = await startEngine(spec.label);
      const w = engine.wire;
      row.ping = (await w.call('ping', {clientApiVersion: 'cua-engine-1', ...(spec.desktop ? {desktop: spec.desktop} : {})})).result ?? null;
      const shots = join(OUT, `shots-${fileName(spec.label)}`); mkdirSync(shots, {recursive: true});
      const from = Date.now();
      const o = await w.execute('get_app_state', {pid: code.pid, includeScreenshot: true, outputDirectory: shots});
      const at = Date.now();
      row.obs = obsSummary(o, at - from);
      if (spec.kind === 'end' || spec.kind === 'sigterm') {
        row.before = await samples(code.pid, at, 3000, 250);
        const endAt = Date.now();
        if (spec.kind === 'end') row.endTask = await w.call('endTask', {}, 5000).catch(e => ({exception: String(e)}));
        else engine.child.kill('SIGTERM');
        row.after = await samples(code.pid, endAt, 3000, 250);
      } else if (spec.kind === 'grace') {
        row.idle = await samples(code.pid, at, 36_000, 2000);
      } else if (spec.kind === 'click') {
        const sky = o.result;
        writeFileSync(join(OUT, `nodes-${fileName(spec.label)}.json`), JSON.stringify(sky.nodes.map(n => ({role: n.role, subrole: n.subrole, title: n.title, description: n.description,
          value: typeof n.value === 'string' ? n.value.slice(0, 80) : n.value, depth: n.depth, frame: n.frame, actions: n.actions})), null, 0));
        const text = n => `${n.title ?? ''} ${n.description ?? ''} ${typeof n.value === 'string' ? n.value : ''}`;
        const within = n => n.frame && n.frame.width > 4 && n.frame.height > 4 && n.frame.x >= sky.window.frame.x && n.frame.y >= sky.window.frame.y;
        const deepest = ns => ns.filter(within).sort((a, b) => b.depth - a.depth)[0];
        const node = spec.target === 'explorer' ? deepest(sky.nodes.filter(n => /other\.txt/.test(text(n)) && n.role !== 'AXWindow'))
          : spec.target === 'editor' ? deepest(sky.nodes.filter(n => /first line of the editor/.test(text(n))))
          : spec.target === 'button' ? deepest(sky.nodes.filter(n => n.role === 'AXButton' && /new file/i.test(text(n))))
          : null;
        row.titleBefore = osa(`tell application "System Events" to get name of window 1 of (first process whose unix id is ${code.pid})`).out;
        if (!node?.frame) { row.problem = `no ${spec.target} node`; row.roles = [...new Set(sky.nodes.map(n => n.role))]; }
        else {
          const wf = sky.window.frame, scale = sky.screenshot.width / wf.width;
          const p = {x: node.frame.x + Math.min(30, node.frame.width / 2), y: node.frame.y + node.frame.height / 2};
          const px = {x: Math.round((p.x - wf.x) * scale), y: Math.round((p.y - wf.y) * scale)};
          row.target = {role: node.role, title: node.title, description: node.description, frame: node.frame, px};
          if (spec.waitMs) await sleep(spec.waitMs);
          const started = Date.now();
          const r = await w.execute('click', {pid: code.pid, x: px.x, y: px.y});
          row.clickMs = Date.now() - started;
          row.clickAfterObservationMs = started - at;
          row.click = r.error ? {error: r.error} : {meta: r.result?.meta ?? null, note: r.result?.note ?? null};
          await sleep(1500);
          row.frontAfter = frontmost();
          row.titleAfter = osa(`tell application "System Events" to get name of window 1 of (first process whose unix id is ${code.pid})`).out;
          const later = await w.execute('get_app_state', {pid: code.pid});
          const f = later.result?.nodes?.find(n => n.token === later.result.focused);
          row.focusedAfter = f ? {role: f.role, title: f.title, description: f.description} : null;
        }
      }
      if (spec.kind !== 'sigterm') { try { await w.call('shutdown', {}, 5000); } catch {} w.close(); }
    }
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 2000);
  } finally {
    if (engine) { row.engineStderr = engine.stderr().slice(-1500); if (engine.child.exitCode === null) engine.child.kill('SIGKILL'); }
    if (code) await code.stop();
  }
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, cells: rows}, null, 1));
  const line = s => (s ?? []).map(x => `${x.t}:${x.webArea ?? '-'}/${x.walked ?? '-'}`).join(' ');
  log(`${row.label}: front=${row.front} pre=${JSON.stringify(row.pre)} write=${JSON.stringify(row.write ?? null)} obs=${JSON.stringify(row.obs ?? null)}\n    samples ${line(row.samples)}\n    before ${line(row.before)}\n    end ${JSON.stringify(row.endTask?.result ?? row.endTask?.error ?? null)} after ${line(row.after)}\n    idle ${line(row.idle)}\n    click ${row.clickMs ?? '-'}ms ${JSON.stringify(row.click ?? null).slice(0, 900)} front=${row.frontAfter ?? '-'} title ${JSON.stringify(row.titleBefore ?? null)} -> ${JSON.stringify(row.titleAfter ?? null)} focused=${JSON.stringify(row.focusedAfter ?? null)} target=${JSON.stringify(row.target ?? null)} ${row.problem ?? ''} ${row.exception ?? ''}`);
}
process.exit(0);
