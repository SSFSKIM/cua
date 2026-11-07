// #287's recon on a GitHub-hosted macOS runner: what each config's accessibility gives main's engine before any kit
// cell runs. Per target (Chrome for Testing, stable Chrome, Safari, Firefox as installed, Firefox with
// accessibility.force_disabled -1, VS Code), a fresh launch behind a frontmost TextEdit:
//   pre      axrecon state twice, 2 s apart, before anything else touched the app (does a plain AX read expose the page?)
//   obs1     main's engine, a fresh connection: get_app_state with a screenshot (timings: enablement, web area, nodes)
//   samples  axrecon state every 500 ms for 4 s after obs1 (the checkbox's AXPress: complete mode's arrival)
//   obs2     get_app_state again 4 s after obs1
//   end      endTask, then axrecon state 300 ms and 2 s after (the engine's release)
// The page is #282's counters page shape: a checkbox, a button, a textarea. Nothing is clicked.
//   node scripts/probe-287/recon.mjs --engine <cua-engine> --ax <axrecon> --out <dir> [--targets a,b]
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') { console.error('probe-287 recon: runs only on a GitHub-hosted runner'); process.exit(2); }
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const OUT = arg('out'), ENGINE = arg('engine'), AX = arg('ax');
const ONLY = arg('targets') ? arg('targets').split(',').filter(Boolean) : null;
const TIMELINE = process.argv.includes('--timeline');
mkdirSync(OUT, {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('probe-287 recon:', ...a);
const sh = (cmd, args, timeout = 20_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
const osa = script => sh('osascript', ['-e', script]);
const json = r => { try { return JSON.parse(r.out); } catch { return {status: r.status, out: r.out.slice(0, 500), err: r.err.slice(0, 500)}; } };
const ax = (...a) => json(sh(AX, a.map(String), 30_000));
const frontmost = () => {
  const asn = sh('lsappinfo', ['front']).out;
  return (sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] || null;
};
const placePid = (pid, x, y, w, h) => osa(`tell application "System Events"\ntell (first process whose unix id is ${pid})\nset position of window 1 to {${x}, ${y}}\nset size of window 1 to {${w}, ${h}}\nend tell\nend tell`).status;

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe287 page</title></head>
<body><p><b>probe287 page</b></p><p><label><input id="option" type="checkbox"> Probe option</label> <button id="apply" type="button">Apply</button></p>
<p><textarea id="notes" aria-label="Probe notes" rows="6" cols="50"></textarea></p><p>Ready</p>
<script>addEventListener('load', () => navigator.sendBeacon('/ready'));</script></body></html>`;
// A big page (#304's /fixedtail shape: 2,500 paragraphs, each with a link): run 42382030666's Firefox observations of it
// had an AXWebArea with no children at all.
const BIG = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>probe287 big</title></head><body><p><label><input id="option" type="checkbox"> Probe option</label></p>${Array.from({length: 2500}, (_, i) => `<p>Paragraph ${i + 1} with <a href="#p${i + 1}">link ${i + 1}</a> in it.</p>`).join('')}<script>addEventListener('load', () => navigator.sendBeacon('/ready'));</script></body></html>`;
let ready = false;
const server = createServer((req, res) => {
  if (req.method === 'POST') { if (req.url === '/ready') ready = true; req.resume(); res.writeHead(204); res.end(); return; }
  res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}); res.end(req.url.startsWith('/big') ? BIG : PAGE);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = `http://127.0.0.1:${server.address().port}/`;

class Wire {
  static connect(path) {
    return new Promise((resolve, reject) => { const s = createConnection(path); s.once('connect', () => { s.off('error', reject); resolve(new Wire(s)); }); s.once('error', reject); });
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
  execute(method, args) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 80_000}); }
  close() { this.s.destroy(); }
}
async function startEngine(label) {
  const dir = join(OUT, 'sock'); mkdirSync(dir, {recursive: true, mode: 0o700});
  const socket = join(dir, `${label}.sock`);
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

const CFT = '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FIREFOX = '/Applications/Firefox.app/Contents/MacOS/firefox';
const CODE_APP = '/Applications/Visual Studio Code.app';
const plist = (app, key) => sh('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, `${app}/Contents/Info.plist`]).out;
const chromeArgs = (dir, url) => [`--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen',
  '--window-position=400,30', '--window-size=620,720', url];
import {firefoxProfile as profileOf} from './browser.mjs';
function firefoxProfile(dir, force) { process.env.P287_FIREFOX_A11Y = force ? 'force' : ''; return profileOf(dir); }
const kill = async child => { if (child && child.exitCode === null) { child.kill('SIGTERM'); await sleep(2500); if (child.exitCode === null) child.kill('SIGKILL'); } };
const TARGETS = {
  cft: {app: '/Applications/Google Chrome for Testing.app', launch: async () => spawn(CFT, chromeArgs(join(OUT, 'p-cft'), URL_), {stdio: 'ignore'})},
  chrome: {app: '/Applications/Google Chrome.app', launch: async () => spawn(CHROME, chromeArgs(join(OUT, 'p-chrome'), URL_), {stdio: 'ignore'})},
  safari: {app: '/Applications/Safari.app', launch: async () => {
    sh('pkill', ['-x', 'Safari']); await sleep(1500); sh('open', ['-a', 'Safari', URL_]);
    let pid = null; for (let i = 0; i < 80 && !pid; i++) { await sleep(250); pid = Number(sh('pgrep', ['-x', 'Safari']).out.split('\n')[0]) || null; }
    const o = {pid, kill: () => sh('pkill', ['-x', 'Safari'])}; Object.defineProperty(o, 'exitCode', {get: () => (sh('kill', ['-0', String(pid)]).status === 0 ? null : 0)}); return o;
  }},
  firefox: {app: '/Applications/Firefox.app', launch: async () => spawn(FIREFOX, ['-profile', firefoxProfile(join(OUT, 'p-ff'), false), '-no-remote', '-new-instance', URL_], {stdio: 'ignore'})},
  'firefox-force': {app: '/Applications/Firefox.app', launch: async () => spawn(FIREFOX, ['-profile', firefoxProfile(join(OUT, 'p-ff-force'), true), '-no-remote', '-new-instance', URL_], {stdio: 'ignore'})},
  'firefox-big': {app: '/Applications/Firefox.app', launch: async () => spawn(FIREFOX, ['-profile', firefoxProfile(join(OUT, 'p-ff-big'), false), '-no-remote', '-new-instance', `${URL_}big`], {stdio: 'ignore'})},
  'chrome-big': {app: '/Applications/Google Chrome.app', launch: async () => spawn(CHROME, chromeArgs(join(OUT, 'p-chrome-big'), `${URL_}big`), {stdio: 'ignore'})},
  vscode: {app: CODE_APP, noPage: true, launch: async () => {
    const dir = join(OUT, 'vscode-work'); mkdirSync(dir, {recursive: true}); writeFileSync(join(dir, 'notes.md'), '# probe287\n\nA file for the recon.\n');
    const bin = `${CODE_APP}/Contents/MacOS/${plist(CODE_APP, 'CFBundleExecutable')}`;
    return spawn(bin, [`--user-data-dir=${join(OUT, 'vscode-user')}`, `--extensions-dir=${join(OUT, 'vscode-ext')}`, '--disable-extensions', '--skip-welcome',
      '--skip-release-notes', '--disable-workspace-trust', '--new-window', dir, join(dir, 'notes.md')], {stdio: 'ignore', env: {...process.env, VSCODE_CLI: undefined}});
  }},
};

const summary = s => s && !s.error ? {windowTitle: s.windowTitle, eui: s.eui, manual: s.manual, listsEUI: s.listsEUI, listsManual: s.listsManual, windows: s.windows, walked: s.walked,
  webAreaDepth: s.webAreaDepth, webAreaElements: s.webAreaElements ?? null, checkboxActions: s.checkboxActions, ms: s.ms, roles: s.roles} : s;
const results = [];
const config = {imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '),
  apps: Object.fromEntries(Object.entries(TARGETS).map(([k, t]) => [k, existsSync(t.app) ? {version: plist(t.app, 'CFBundleShortVersionString'), principal: plist(t.app, 'NSPrincipalClass'),
    bundle: plist(t.app, 'CFBundleIdentifier'), urlTypes: plist(t.app, 'CFBundleURLTypes').replace(/\s+/g, ' ').slice(0, 300)} : null])),
  firefoxVersion: existsSync(FIREFOX) ? sh(FIREFOX, ['--version']).out : null, engine: ENGINE, probeCommit: process.env.GITHUB_SHA ?? null};
log('config', JSON.stringify(config));
for (const [name, t] of Object.entries(TARGETS)) {
  if (ONLY && !ONLY.includes(name)) continue;
  if (!existsSync(t.app)) { results.push({name, skipped: 'not installed'}); continue; }
  const row = {name};
  results.push(row);
  let child, engine;
  try {
    ready = false;
    const launchedAt = Date.now();
    child = await t.launch();
    row.pid = child.pid;
    if (t.noPage) await sleep(10_000); else { for (let i = 0; i < 160 && !ready; i++) await sleep(250); row.loaded = ready; row.loadMs = Date.now() - launchedAt; await sleep(1500); }
    row.place = placePid(child.pid, 400, 30, 620, 720);
    row.front = await frontTextEdit();
    row.pre = [summary(ax('state', child.pid))];
    await sleep(2000);
    row.pre.push(summary(ax('state', child.pid)));
    engine = await startEngine(name);
    const w = engine.wire;
    row.ping = (await w.call('ping', {clientApiVersion: 'cua-engine-1'})).result ?? null;
    const shots = join(OUT, `shots-${name}`); mkdirSync(shots, {recursive: true});
    const from = Date.now();
    const o1 = await w.execute('get_app_state', {pid: child.pid, includeScreenshot: true, outputDirectory: shots});
    const at = Date.now();
    const obs = (o, ms) => o.error ? {error: o.error} : {ms, nodes: o.result.nodes.length, roles: Object.fromEntries([...new Set(o.result.nodes.map(n => n.role))].map(r => [r, o.result.nodes.filter(n => n.role === r).length])),
      checkbox: o.result.nodes.find(n => n.role === 'AXCheckBox')?.actions ?? null, webAreas: o.result.nodes.filter(n => n.role === 'AXWebArea').length, timings: o.result.timings, truncated: o.result.truncated ?? null};
    row.obs1 = obs(o1, at - from);
    if (!o1.error) row.obs1WebAreaFrame = o1.result.nodes.find(n => n.role === 'AXWebArea')?.frame ?? null;
    if (!o1.error) row.obs1Nodes = o1.result.nodes.slice(0, 80).map(n => `${'  '.repeat(Math.min(n.depth ?? 0, 12))}${n.role}${n.subrole ? '/' + n.subrole : ''} ${JSON.stringify((n.title ?? n.description ?? n.value ?? '').toString().slice(0, 50))}`);
    row.samples = [];
    // #287 wave 3 (--timeline): the web area's own frame every 500 ms for 30 s after the first observation (Firefox's
    // AXWebArea answered a zero frame in run 42376953140's fresh-launch cells), and a re-observation's record then.
    if (TIMELINE) {
      row.frames = [];
      for (let k = 1; k <= 60; k++) { const due = at + k * 500 - Date.now(); if (due > 0) await sleep(due); const s = ax('state', child.pid); row.frames.push([Date.now() - at, s.webAreaFrame ?? null, s.webAreaElements ?? null, s.webAreaChildren ?? null, s.webAreaVisibleChildren ?? null, s.webAreaListsVisibleChildren ?? null]); }
    }
    for (let k = 1; k <= 8; k++) { const due = at + k * 500 - Date.now(); if (due > 0) await sleep(due); const s = ax('state', child.pid); row.samples.push({t: Date.now() - at, eui: s.eui, manual: s.manual, checkbox: s.checkboxActions, webAreaElements: s.webAreaElements ?? null, walked: s.walked}); }
    const from2 = Date.now();
    const o2 = await w.execute('get_app_state', {pid: child.pid});
    row.obs2 = obs(o2, Date.now() - from2);
    if (!o2.error) row.obs2WebAreaFrame = o2.result.nodes.find(n => n.role === 'AXWebArea')?.frame ?? null;
    const endAt = Date.now();
    row.endTask = await w.call('endTask', {}, 5000).catch(e => ({exception: String(e)}));
    await sleep(300);
    row.after = [summary(ax('state', child.pid))];
    await sleep(1700);
    row.after.push(summary(ax('state', child.pid)));
    row.afterMs = Date.now() - endAt;
    try { await w.call('shutdown', {}, 5000); } catch {}
    w.close();
  } catch (e) {
    row.exception = String(e?.stack || e).slice(0, 2000);
  } finally {
    if (engine) { row.engineStderr = engine.stderr().slice(-1500); if (engine.child.exitCode === null) engine.child.kill('SIGKILL'); }
    await kill(child);
    await sleep(1000);
  }
  writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));
  const o = row.obs1;
  log(`${name}: pre ${JSON.stringify(row.pre?.map(p => [p?.eui, p?.manual, p?.walked, p?.webAreaElements ?? null, p?.checkboxActions]))} ` +
    `obs1 ${o ? JSON.stringify({ms: o.ms, nodes: o.nodes, webAreas: o.webAreas, checkbox: o.checkbox, t: o.timings && {enabled: o.timings.enabled, prior: o.timings.enablementPrior, write: o.timings.enablementWrite, err: o.timings.enablementWriteError, chromium: o.timings.chromium, webShaped: o.timings.webShaped, webAreaFound: o.timings.webAreaFound}, error: o.error}) : '-'} ` +
    `samples ${JSON.stringify(row.samples?.map(s => [s.t, s.eui, s.manual, Array.isArray(s.checkbox) && s.checkbox.includes('AXPress'), s.webAreaElements]))} ` +
    `obs2 ${JSON.stringify(row.obs2 && {nodes: row.obs2.nodes, checkbox: row.obs2.checkbox, write: row.obs2.timings?.enablementWrite})} endTask ${JSON.stringify(row.endTask?.result ?? row.endTask?.error ?? row.endTask)} ` +
    `title ${JSON.stringify(row.pre?.[1]?.windowTitle)} webArea obs1 ${JSON.stringify(row.obs1WebAreaFrame)} obs2 ${JSON.stringify(row.obs2WebAreaFrame)} frames ${JSON.stringify((row.frames ?? []).filter((f, i, a) => i === 0 || JSON.stringify(f[1]) !== JSON.stringify(a[i - 1][1])))} ` +
    `after ${JSON.stringify(row.after?.map(p => [p?.eui, p?.manual, p?.webAreaElements ?? null, p?.checkboxActions]))} ${row.exception ? 'EXCEPTION ' + row.exception : ''}`);
}
writeFileSync(join(OUT, 'results.json'), JSON.stringify({config, results}, null, 1));
server.close();
process.exit(0);
