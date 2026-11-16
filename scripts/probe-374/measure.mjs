// #374's hosted live check (scripts/probe-374/README.md): one app family per job, its cells asked for their menu by the
// engine's perform_secondary_action "Show Menu", each answer set beside what an independent oracle (oracle.swift: the
// process's menu windows and AXMenu children) and the fixture page (page.mjs: its contextmenu counters and its own
// menus) saw. Disposable experiment kit, never product code; GitHub-hosted macOS runners only.
//   node scripts/probe-374/measure.mjs --family appkit|cft|electron|firefox|safari --engine <cua-engine> --oracle <bin>
//     [--appkit <bin>] --reps <n> --out <dir>
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {appendFileSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {page, TARGETS} from './page.mjs';
import {gate, summarize, table} from './judge.mjs';
import {placeChromeForTesting} from '../native-matrix/fixtures/chrome-for-testing.mjs';

if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted') throw new Error('hosted runners only');
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
const FAMILY = arg('family'), ENGINE = arg('engine'), ORACLE = arg('oracle'), APPKIT = arg('appkit'), OUT = arg('out'), REPS = Number(arg('reps') ?? 10);
if (!['appkit', 'cft', 'electron', 'firefox', 'safari'].includes(FAMILY) || !Number.isInteger(REPS) || REPS < 1) throw new Error('bad --family or --reps');
mkdirSync(OUT, {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, args) => spawnSync(cmd, args, {encoding: 'utf8', timeout: 20_000});
const started = Date.now();
// The measurement stops after 80 minutes and still writes its summary over the rows it has (the job allows 120).
const overBudget = () => Date.now() - started > 80 * 60_000;
const WINDOW = {x: 420, y: 60, w: 620, h: 600};

// The engine over its socket (the 4-byte little-endian length framing the service's client uses).
class Wire {
  static connect(path) { return new Promise((ok, no) => { const s = createConnection(path); s.once('connect', () => ok(new Wire(s))); s.once('error', no); }); }
  constructor(s) {
    this.s = s; this.buf = Buffer.alloc(0); this.pending = new Map(); this.id = 0;
    s.on('data', d => {
      this.buf = Buffer.concat([this.buf, d]);
      while (this.buf.length >= 4) {
        const n = this.buf.readUInt32LE(); if (this.buf.length < 4 + n) break;
        const r = JSON.parse(this.buf.subarray(4, 4 + n)); this.buf = this.buf.subarray(4 + n);
        this.pending.get(r.id)?.(r); this.pending.delete(r.id);
      }
    });
    s.on('error', () => {});
  }
  call(method, params) {
    const id = ++this.id, body = Buffer.from(JSON.stringify({jsonrpc: '2.0', id, method, params})), head = Buffer.alloc(4);
    head.writeUInt32LE(body.length);
    return new Promise((ok, no) => {
      const t = setTimeout(() => { this.pending.delete(id); no(new Error(`RPC timeout ${method}`)); }, 60_000);
      this.pending.set(id, r => { clearTimeout(t); ok(r); });
      this.s.write(Buffer.concat([head, body]));
    });
  }
  execute(method, args, lineage) { return this.call('execute', {method, args, ...(lineage ? {lineage} : {}), deadlineUnixMilliseconds: Date.now() + 55_000}); }
}
const socket = join(process.env.RUNNER_TEMP, 's374.sock');
rmSync(socket, {force: true});
let engineErr = '';
const engine = spawn(ENGINE, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'ignore', 'pipe']});
engine.stderr.on('data', d => { engineErr += d; writeFileSync(join(OUT, 'engine-stderr.txt'), engineErr); });
async function connect() {
  for (let i = 0; i < 200; i++) {
    try { const w = await Wire.connect(socket); const r = await w.call('ping', {clientApiVersion: 'cua-engine-1', desktop: 'shared'}); if (r.error) throw new Error(JSON.stringify(r)); return w; } catch { await sleep(50); }
  }
  throw new Error('engine unavailable');
}

// The side oracle.
const oracle = spawn(ORACLE, [], {stdio: ['pipe', 'pipe', 'inherit']}), waiters = [];
createInterface({input: oracle.stdout}).on('line', l => { let r; try { r = JSON.parse(l); } catch { r = {error: l}; } waiters.shift()?.(r); });
const ask = q => new Promise(ok => { waiters.push(ok); oracle.stdin.write(`${JSON.stringify(q)}\n`); });

// The fixture page: its latest state, and one pending command.
let latest = null, command = null;
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const url = new globalThis.URL(req.url, 'http://fixture');
  if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(page()); return; }
  res.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/state') { let b = ''; for await (const c of req) b += c; try { latest = {...JSON.parse(b), receivedAt: Date.now()}; } catch {} res.end('{}'); return; }
  if (url.pathname === '/cmd') { res.end(JSON.stringify(command ?? {})); command = null; return; }
  res.statusCode = 404; res.end('{}');
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const URL = `http://127.0.0.1:${server.address().port}/`;
async function freshState(after, ms = 2000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (latest && latest.receivedAt > after) return latest; await sleep(20); }
  return latest;
}

// The apps.
const version = path => sh('defaults', ['read', `${path}/Contents/Info`, 'CFBundleShortVersionString']).stdout.trim();
const pgrep = name => Number(sh('pgrep', ['-x', name]).stdout.split('\n')[0]) || null;
let appkitShows = {};
async function launchTarget() {
  if (FAMILY === 'appkit') {
    const child = spawn(APPKIT, [], {stdio: ['ignore', 'pipe', 'inherit']});
    createInterface({input: child.stdout}).on('line', l => {
      try { const e = JSON.parse(l); if (e.event === 'showMenu') appkitShows[e.target] = e.count; appendFileSync(join(OUT, 'appkit-events.jsonl'), `${l}\n`); } catch {}
    });
    return {pid: child.pid, version: 'fixture'};
  }
  if (FAMILY === 'cft') {
    const {appPath, version: v} = await placeChromeForTesting();
    const bin = join(appPath, 'Contents/MacOS/Google Chrome for Testing');
    const child = spawn(bin, [`--user-data-dir=${join(process.env.RUNNER_TEMP, 'cft-374')}`, '--no-first-run', '--no-default-browser-check',
      '--disable-search-engine-choice-screen', '--lang=en-US', '--disable-features=Translate', `--window-position=${WINDOW.x},${WINDOW.y}`,
      `--window-size=${WINDOW.w},${WINDOW.h}`, URL], {stdio: 'ignore'});
    return {pid: child.pid, version: v};
  }
  if (FAMILY === 'electron') {
    const electron = createRequire(import.meta.url)('electron');
    const child = spawn(electron, [fileURLToPath(new globalThis.URL('./electron/', import.meta.url))], {env: {...process.env, PROBE374_URL: URL}, stdio: 'ignore'});
    return {pid: child.pid, version: sh(electron, ['--version']).stdout.trim()};
  }
  if (FAMILY === 'firefox') {
    const profile = join(process.env.RUNNER_TEMP, 'ff-374');
    mkdirSync(profile, {recursive: true});
    const prefs = {'browser.shell.checkDefaultBrowser': false, 'browser.aboutwelcome.enabled': false, 'datareporting.policy.dataSubmissionEnabled': false,
      'app.update.disabledForTesting': true, 'browser.startup.homepage_override.mstone': 'ignore', 'browser.sessionstore.resume_from_crash': false,
      'termsofuse.bypassNotification': true, 'termsofuse.acceptedVersion': 999, 'termsofuse.acceptedDate': String(Date.now()),
      'datareporting.policy.dataSubmissionPolicyBypassNotification': true, 'browser.translations.automaticallyPopup': false, 'browser.preonboarding.enabled': false};
    writeFileSync(join(profile, 'user.js'), Object.entries(prefs).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n') + '\n');
    const child = spawn('/Applications/Firefox.app/Contents/MacOS/firefox', ['-profile', profile, '-no-remote', '-new-instance', URL], {stdio: 'ignore'});
    return {pid: child.pid, version: version('/Applications/Firefox.app')};
  }
  sh('pkill', ['-x', 'Safari']);
  sh('open', ['-a', 'Safari', URL]);
  let pid = null;
  for (let i = 0; i < 80 && !pid; i++) { await sleep(250); pid = pgrep('Safari'); }
  if (!pid) throw new Error('Safari did not start');
  return {pid, version: version('/Applications/Safari.app')};
}
// The cover the background placement brings forward: a TextEdit document.
async function launchCover() {
  const file = join(process.env.RUNNER_TEMP, 'cover-374.txt');
  writeFileSync(file, 'cover\n');
  sh('open', ['-a', 'TextEdit', file]);
  for (let i = 0; i < 80; i++) { await sleep(250); const pid = pgrep('TextEdit'); if (pid) return pid; }
  throw new Error('TextEdit did not start');
}

const CELLS = FAMILY === 'appkit'
  ? [['native', 'Fixture text'], ['popup', 'Fixture popup'], ['ignored', 'Ignored menu'], ['blocking', 'Blocking menu']]
  : Object.entries(TARGETS);
const PLACEMENTS = ['foreground', 'background'];

const w = await connect();
const target = await launchTarget();
const coverPid = await launchCover();
const pid = target.pid;
const meta = {family: FAMILY, reps: REPS, smoke: process.env.SMOKE === 'true', event: process.env.GITHUB_EVENT_NAME, cells: CELLS.map(c => c[0]), placements: PLACEMENTS, kit: process.env.GITHUB_SHA, engine: process.env.ENGINE_REF,
  image: process.env.ImageVersion, os: sh('sw_vers', ['-productVersion']).stdout.trim(), appVersion: target.version, startedAt: started};
writeFileSync(join(OUT, 'config.json'), JSON.stringify(meta, null, 2));

const find = (nodes, label) => nodes.find(n => [n.description, n.title, n.identifier].includes(label));
async function observe(label, tries) {
  for (let i = 0; i < tries; i++) {
    const r = await w.execute('get_app_state', {pid, includeScreenshot: false});
    const node = r.result && find(r.result.nodes ?? [], label);
    if (node) return {node, lineage: r.result.lineage};
    await sleep(500);
  }
  return {node: null, lineage: null};
}
async function reset() {
  const closed = await ask({op: 'close', pid});
  if (FAMILY === 'appkit') return {closed};
  const at = Date.now();
  command = {op: 'reset'};
  let state = await freshState(at);
  for (let i = 0; i < 50 && (state?.ariaOpen || state?.ownOpen); i++) { await sleep(40); state = await freshState(Date.now()); }
  return {closed, state};
}

// The page must be up before the first cell (web families).
if (FAMILY !== 'appkit') { const deadline = Date.now() + 60_000; while (!latest && Date.now() < deadline) await sleep(100); if (!latest) throw new Error('fixture page never reported'); }

const rows = [];
let stopped = false;
measure: for (const placement of PLACEMENTS) {
  for (let rep = 0; rep < REPS; rep++) {
    for (const [cell, label] of CELLS) {
      if (overBudget()) { stopped = true; break measure; }
      const row = {family: FAMILY, cell, placement, rep, label};
      try {
        row.reset = await reset();
        row.front = await ask({op: 'front', pid: placement === 'foreground' ? pid : coverPid});
        await sleep(300);
        // The first look waits up to 30 s for the app and its page to come up; later ones 5 s.
        const {node, lineage} = await observe(label, rows.some(r => r.cell === cell) ? 10 : 60);
        if (!node) { row.offered = null; row.answer = 'targetNotFound'; }
        else {
          row.role = node.role; row.offered = (node.actions ?? []).includes('AXShowMenu');
          if (!row.offered) { row.answer = null; row.actions = node.actions; }
          else {
            row.before = await ask({op: 'menus', pid});
            row.pageBefore = latest;
            const showsBefore = appkitShows[label] ?? 0;
            const t0 = Date.now();
            const r = await w.execute('perform_secondary_action', {pid, element: node.token, action: 'Show Menu'}, lineage);
            row.wallMs = Date.now() - t0;
            row.after = await ask({op: 'menus', pid});
            row.answer = r.error ? r.error.errorName ?? 'error' : 'ok';
            row.message = r.error?.message ?? null;
            const m = r.result?.meta ?? r.error?.meta;
            row.menu = m?.menu ?? null; row.inputRoute = m?.inputRoute ?? null;
            if (FAMILY !== 'appkit') row.page = await freshState(t0 + row.wallMs + 250, 2500);
            else { await sleep(250); row.appkitShows = (appkitShows[label] ?? 0) - showsBefore; }
          }
        }
      } catch (error) { row.answer = 'harnessError'; row.harnessError = String(error); }
      rows.push(row);
      appendFileSync(join(OUT, 'rows.jsonl'), `${JSON.stringify(row)}\n`);
      console.log('374', FAMILY, placement, rep, cell, row.answer, row.menu?.seen ?? '-', row.menu?.ms ?? '-', 'oracle', row.after?.windows ?? '-', row.after?.axMenus ?? '-');
    }
  }
}
await ask({op: 'close', pid});
const summary = summarize(rows);
const verdict = {...gate(summary), stopped};
writeFileSync(join(OUT, 'summary.json'), JSON.stringify({meta, verdict, summary}, null, 2));
writeFileSync(join(OUT, 'summary.md'), `# #374 ${FAMILY} (${meta.appVersion})${meta.smoke ? ', smoke' : ''}\n\n${table(summary)}\n\nfalse ok: ${verdict.falseOk}; open cells: ${verdict.open.join('; ') || 'none'}\n`);
console.log(table(summary));
console.log('gate', JSON.stringify(verdict));
engine.kill(); oracle.kill(); server.close();
process.exit(0);
