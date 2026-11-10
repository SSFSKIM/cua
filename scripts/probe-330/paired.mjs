// GitHub-hosted macOS ONLY. Standalone #330/#298 paired walk-cost group, no typing/input cells or patched engine.
// node scripts/probe-330/paired.mjs --control <bin> --branch <bin> --candidate <bin> --out <fresh-dir>
//   --candidate-ref <exact-head-or-local-git-ref> [--control-ref <ref>] [--branch-ref <ref>]
// Ref env alternatives: P330_CONTROL_REF, P330_BRANCH_REF, P330_CANDIDATE_REF. Full SHA + binary SHA256 are saved.
// Every scene is opened/placed ONCE. 20 rounds rotate control/branch/candidate; one fresh engine per visit.
// Two warm requests (1.2s after EACH) then one measured request on that connection. No retry/replacement or exclusions.
// All 900 slots exist before setup, including failures/not-run. Warm/measured raw replies have separate JSONL files.
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createConnection} from 'node:net';
import {accessSync, constants, mkdirSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync, renameSync, rmSync, realpathSync, existsSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {launch, placePid, version, FIREFOX} from '../probe-316/browser.mjs';
import {childRunning, stopOwnedChild} from './browser-lifecycle.mjs';
import {relabelledPage} from './relabelled.mjs';
import {FrameDecoder, encodeFrame} from '../../src/services/engine/protocol.mjs';
import {summarizePaired} from './offline/paired-report.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const HEADS = ['control', 'branch', 'candidate'];
const DEFAULTS = {control: '3c669314e0a5f35aedf20f9b792604fc09628c45', branch: '562274758e30c6d7ce6b3511a785c1a2d44db9b0'};
const WIN = {x: 100, y: 40, w: 900, h: 720};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash = data => createHash('sha256').update(data).digest('hex');
const errorText = e => String(e?.stack ?? e);
const SCENES = [
  {id: 'firefox-body', app: 'firefox', marker: 'Paired long text'},
  {id: 'firefox-compose', app: 'firefox', marker: 'Old draft sentence goes here.'},
  {id: 'firefox-hn', app: 'firefox', marker: 'Hacker News'},
  {id: 'finder-files', app: 'finder', marker: 'probe330-001'},
  {id: 'textedit-text', app: 'textedit', marker: 'Paired walk-cost probe'},
];

export function parseOptions(argv, env = process.env) {
  const values = {};
  const allowed = new Set(['control', 'branch', 'candidate', 'out', ...HEADS.map(h => `${h}-ref`)]);
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]?.replace(/^--/, '');
    if (!argv[i]?.startsWith('--') || !allowed.has(name)) throw new Error(`unknown argument ${argv[i]}`);
    if (!argv[i + 1] || argv[i + 1].startsWith('--') || Object.hasOwn(values, name)) throw new Error(`missing or repeated --${name}`);
    values[name] = argv[i + 1];
  }
  for (const name of [...HEADS, 'out']) if (!values[name]) throw new Error(`required --${name}`);
  const engines = HEADS.map(head => ({head, binary: resolve(values[head]),
    requestedRef: values[`${head}-ref`] ?? env[`P330_${head.toUpperCase()}_REF`] ?? DEFAULTS[head]}));
  if (!engines[2].requestedRef) throw new Error('required --candidate-ref or P330_CANDIDATE_REF (never inferred from kit HEAD)');
  return {out: resolve(values.out), engines};
}

export function requireHosted(env = process.env, platform = process.platform) {
  if (env.RUNNER_ENVIRONMENT !== 'github-hosted' || env.GITHUB_ACTIONS !== 'true') throw new Error('paired probe runs only on a GitHub-hosted runner');
  if (platform !== 'darwin') throw new Error('paired probe requires macOS');
}

export function createDataset(engines) {
  const results = [], warmups = [];
  for (const scene of SCENES) for (let round = 1; round <= 20; round++) for (let order = 0; order < 3; order++) {
    const engine = engines[(round - 1 + order) % 3];
    const slot = {scene: scene.id, app: scene.app, head: engine.head, ref: engine.ref, round, order: order + 1, status: 'not-run', requestSent: false};
    const label = `${scene.id}-r${String(round).padStart(2, '0')}-${engine.head}`;
    results.push({...slot, label, phase: 'measured'});
    for (let warm = 1; warm <= 2; warm++) warmups.push({...slot, label: `${label}-warm${warm}`, phase: 'warm', warm});
  }
  return {config: {group: 'paired', schema: 1, engines, scenes: SCENES.map(s => ({...s})), rounds: 20,
    observationsPerEngineScene: 20, warmupsPerVisit: 2, warmupWaitMs: 1200, includeScreenshot: true, desktop: 'shared',
    processStrategy: 'fresh engine each scene/round/head visit; two warm requests then one measured on the same connection; no retries',
    orderStrategy: 'round 1 control/branch/candidate; round 2 branch/candidate/control; round 3 candidate/control/branch; repeat',
    failures: '20 planned measured slots per engine/scene; failures, invalid, pending, and not-run stay in the denominator; no replacement',
    warmupStrategy: 'Two requests per fresh engine, with 1200ms after each; includes Firefox accessibility enablement/geometry warm-up. All raw warm requests retained separately.',
    completed: false}, results, warmups};
}

const windowKey = w => JSON.stringify([w?.pid, w?.title, ...['x', 'y', 'width', 'height'].map(k => w?.frame?.[k])]);
export function observation(reply, scene, expectedWindow) {
  if (reply.error) return {status: 'failed', error: reply.error};
  const s = reply.result ?? {}, nodes = s.nodes;
  const problems = [];
  if (!Number.isFinite(s.timings?.walkMs) || s.timings.walkMs < 0) problems.push('missing/invalid walkMs');
  if (!Array.isArray(nodes) || !nodes.length) problems.push('missing/empty nodes');
  if (!s.window?.frame || !(s.window.frame.width > 0 && s.window.frame.height > 0)) problems.push('missing window');
  if (expectedWindow && windowKey(s.window) !== windowKey(expectedWindow)) problems.push('window changed');
  if (scene.app === 'firefox' && !nodes?.some(n => n.role === 'AXWebArea' && n.frame?.width > 0 && n.frame?.height > 0)) problems.push('no placed web area');
  if (!nodes?.some(n => ['title', 'description', 'value'].some(k => typeof n[k] === 'string' && n[k].includes(scene.marker)))) problems.push(`missing scene marker: ${scene.marker}`);
  return {status: problems.length ? 'invalid' : 'ok', ...(problems.length ? {problem: problems.join('; ')} : {}),
    observedApp: s.app ?? null, window: s.window ?? null, timings: s.timings ?? null,
    nodeCount: Array.isArray(nodes) ? nodes.length : null, menuBarCount: s.menuBar?.length ?? null,
    truncated: s.truncated ?? null, screenshot: s.screenshot ?? null};
}

// Small direct engine wire, sharing production framing but not its app-launch/approval layers.
export class Wire {
  static connect(path) {
    return new Promise((resolve, reject) => {
      const socket = createConnection(path), timeout = setTimeout(() => {socket.destroy(); reject(new Error('connect timeout'));}, 1000);
      socket.once('error', e => {clearTimeout(timeout); reject(e);});
      socket.once('connect', () => {clearTimeout(timeout); resolve(new Wire(socket));});
    });
  }
  constructor(socket) {
    this.socket = socket; this.id = 0; this.pending = new Map(); this.decoder = new FrameDecoder();
    socket.on('data', chunk => {
      try {
        for (const reply of this.decoder.push(chunk)) {
          const p = this.pending.get(reply.id);
          if (p) {this.pending.delete(reply.id); clearTimeout(p.timeout); p.resolve(reply);}
        }
      } catch (e) {this.fail(e); socket.destroy();}
    });
    socket.on('error', e => this.fail(e));
    socket.on('close', () => this.fail(new Error('engine connection closed')));
  }
  fail(error) {for (const p of this.pending.values()) {clearTimeout(p.timeout); p.reject(error);} this.pending.clear();}
  call(method, params = {}, timeoutMs = 90_000) {
    if (this.socket.destroyed) return Promise.reject(new Error('engine connection closed'));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {this.pending.delete(id); reject(new Error(`${method}: no answer`)); this.close();}, timeoutMs);
      this.pending.set(id, {resolve, reject, timeout});
      this.socket.write(encodeFrame({jsonrpc: '2.0', id, method, params}));
    });
  }
  close() {this.fail(new Error('engine connection closed')); this.socket.destroy();}
}

function sh(cmd, args, timeout = 20_000) {
  const r = spawnSync(cmd, args, {encoding: 'utf8', timeout});
  if (r.error || r.status !== 0) throw new Error(`${cmd}: ${r.error?.message ?? r.stderr?.trim() ?? r.status}`);
  return r.stdout.trim();
}
const osa = script => sh('/usr/bin/osascript', ['-e', script]);
const asString = value => JSON.stringify(value); // JSON quoting also quotes the path/title strings used by AppleScript.
function pids(name) {
  const r = spawnSync('/usr/bin/pgrep', ['-x', name], {encoding: 'utf8', timeout: 5000});
  return (r.stdout ?? '').trim().split('\n').filter(Boolean).map(Number);
}
async function until(read, description, ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {const value = read(); if (value) return value; await sleep(200);}
  throw new Error(`timeout waiting for ${description}`);
}
function engineIdentity(engine) {
  const binary = realpathSync(engine.binary); accessSync(binary, constants.X_OK);
  let ref, resolvedBy;
  try {ref = sh('git', ['-C', ROOT, 'rev-parse', '--verify', `${engine.requestedRef}^{commit}`]); resolvedBy = 'kit git';}
  catch (e) {
    if (!/^[0-9a-f]{40}$/i.test(engine.requestedRef)) throw e;
    ref = engine.requestedRef; resolvedBy = 'caller supplied full SHA (not present in kit git)';
  }
  return {...engine, binary, ref: ref.toLowerCase(), resolvedBy, sha256: hash(readFileSync(binary))};
}

async function pageFixtures(out) {
  const long = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Paired long text</title><style>body{font:16px/1.5 serif;margin:24px;max-width:800px}</style></head><body><h1>Paired long text</h1>' +
    Array.from({length: 240}, (_, i) => `<p>Paragraph ${i + 1}. ${'Amber birch cedar dune ember fjord grove heron iris jade kelp lotus maple nectar opal pine quartz reed sage thyme. '.repeat(4)}</p>`).join('') + '</body></html>';
  const response = await fetch('https://news.ycombinator.com/', {signal: AbortSignal.timeout(30_000)});
  if (!response.ok) throw new Error(`Hacker News HTTP ${response.status}`);
  const hn = await response.text();
  if (!hn.includes('Hacker News')) throw new Error('Hacker News snapshot has no expected title');
  const href = hn.match(/href=["'](news\.css[^"']*)["']/i)?.[1];
  if (!href) throw new Error('Hacker News snapshot has no news.css');
  const cssResponse = await fetch(new URL(href, response.url), {signal: AbortSignal.timeout(30_000)});
  if (!cssResponse.ok) throw new Error(`Hacker News CSS HTTP ${cssResponse.status}`);
  const css = await cssResponse.text();
  const pages = {'firefox-body': long, 'firefox-compose': relabelledPage('typed-gmail', ''), 'firefox-hn': hn};
  const meta = {hn: {url: response.url, fetchedAt: new Date().toISOString(), cssURL: cssResponse.url}, pages: {}};
  for (const [id, html] of Object.entries(pages)) {
    // All fixture scripts (including relabelledPage's mutation hooks) are inert under the server CSP.
    writeFileSync(join(out, 'fixtures', `${id}.html`), html);
    meta.pages[id] = {file: `fixtures/${id}.html`, sha256: hash(html), bytes: Buffer.byteLength(html)};
  }
  writeFileSync(join(out, 'fixtures', 'news.css'), css);
  meta.hn.cssSha256 = hash(css);
  return {pages, css, meta};
}

async function prepareScene(scene, state, {out, url, ready}) {
  if (scene.app === 'firefox') {
    state.child = await launch('firefox', `${url}/${scene.id}`, join(out, 'profiles', scene.id), WIN);
    state.pid = state.child.pid;
    state.close = () => stopOwnedChild(state.child);
    state.fixture = await until(() => ready.get(scene.id), `${scene.id} page load`);
    if (!childRunning(state.child)) throw new Error('Firefox exited');
  } else if (scene.app === 'finder') {
    const folder = join(out, 'fixtures', 'finder-files'); mkdirSync(folder);
    for (let i = 1; i <= 200; i++) writeFileSync(join(folder, `probe330-${String(i).padStart(3, '0')}.txt`), `Paired file ${i}\n`);
    const id = Number(osa(`tell application "Finder"\nset w to make new Finder window to (POSIX file ${asString(folder)} as alias)\nreturn id of w\nend tell`));
    if (!Number.isInteger(id) || id <= 0) throw new Error('Finder did not return a window id');
    state.close = async () => osa(`tell application "Finder" to close (first Finder window whose id is ${id})`);
    state.pid = pids('Finder')[0]; state.finderWindowId = id;
    osa(`tell application "Finder"\nset w to first Finder window whose id is ${id}\nset current view of w to list view\nset bounds of w to {${WIN.x}, ${WIN.y}, ${WIN.x + WIN.w}, ${WIN.y + WIN.h}}\nactivate\nend tell`);
    state.fixture = {folder, files: 200, windowId: id};
  } else {
    // Refuse pre-existing TextEdit processes rather than guessing which process/window belongs to this scene.
    if (pids('TextEdit').length) throw new Error('TextEdit already running before paired fixture; left untouched');
    const file = join(out, 'fixtures', 'paired-text.txt');
    const text = Array.from({length: 80}, (_, i) => `Paired walk-cost probe line ${i + 1}: amber birch cedar dune ember fjord grove heron.`).join('\n') + '\n';
    writeFileSync(file, text); sh('/usr/bin/open', ['-n', '-a', 'TextEdit', file]);
    state.pid = await until(() => {const ps = pids('TextEdit'); if (ps.length > 1) throw new Error('ambiguous TextEdit launch'); return ps[0];}, 'owned TextEdit process');
    const pid = state.pid;
    const child = {pid, kill: signal => {try {process.kill(pid, signal);} catch (e) {if (e.code !== 'ESRCH') throw e;}},
      get exitCode() {try {process.kill(pid, 0); return null;} catch {return 0;}}};
    state.close = () => stopOwnedChild(child);
    await until(() => {try {return placePid(pid, WIN) === 0;} catch {return false;}}, 'TextEdit window');
    state.fixture = {file, sha256: hash(text), lines: 80};
  }
  if (!Number.isInteger(state.pid) || state.pid <= 0) throw new Error('scene has no process');
  if (scene.app === 'firefox' && placePid(state.pid, WIN) !== 0) throw new Error('could not place Firefox window');
  osa(`tell application "System Events" to set frontmost of (first process whose unix id is ${state.pid}) to true`);
  // One fixed scene-level layout wait, before any engine starts; NEVER reload/reposition between heads or rounds.
  await sleep(1500);
}

export async function run(options) {
  requireHosted();
  const out = options.out;
  if (existsSync(join(out, 'results.json'))) throw new Error('output already has results.json; use a fresh --out directory');
  mkdirSync(out, {recursive: true}); mkdirSync(join(out, 'fixtures')); mkdirSync(join(out, 'engine-logs'));
  const engines = options.engines.map(engineIdentity), data = createDataset(engines), config = data.config;
  Object.assign(config, {startedAt: new Date().toISOString(), commit: sh('git', ['-C', ROOT, 'rev-parse', 'HEAD']),
    macOS: sh('/usr/bin/sw_vers', []), arch: process.arch, node: process.version, image: process.env.ImageVersion ?? null,
    github: {runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT, sha: process.env.GITHUB_SHA, job: process.env.GITHUB_JOB},
    binaryIdentity: 'ref is caller build attribution, resolved to full SHA; sha256 identifies supplied executable bytes; runner does not attest build provenance',
    rawFiles: {warm: 'observations-warm.jsonl', measured: 'observations-measured.jsonl'}, visits: []});
  const save = () => {const tmp = join(out, 'results.json.tmp'); writeFileSync(tmp, JSON.stringify(data, null, 1)); renameSync(tmp, join(out, 'results.json'));};
  save();
  // /tmp is deliberately used for these disposable sockets ONLY; even long artifact directories cannot exceed sun_path.
  const socketDir = mkdtempSync('/tmp/p330-'), socket = join(socketDir, 'e');
  let engine = null, wire = null, stop = false, server;
  const signal = name => {config.signal = name; stop = true; wire?.close(); save();};
  const onTerm = () => signal('SIGTERM'), onInt = () => signal('SIGINT');
  process.on('SIGTERM', onTerm); process.on('SIGINT', onInt);
  async function request(row, scene, state) {
    row.status = 'pending'; row.startedAt = new Date().toISOString(); row.pid = state.pid; save();
    const start = performance.now(); let reply;
    try {
      const shots = join(out, 'shots', row.phase, row.label); mkdirSync(shots, {recursive: true});
      row.requestSent = true;
      reply = await wire.call('execute', {method: 'get_app_state', args: {pid: state.pid, includeScreenshot: true, outputDirectory: shots}, deadlineUnixMilliseconds: Date.now() + 60_000});
      Object.assign(row, observation(reply, scene, state.expectedWindow));
      if (row.phase === 'measured' && row.status === 'ok' && !state.expectedWindow) state.expectedWindow = row.window;
    } catch (e) {row.status = 'failed'; row.exception = errorText(e);}
    finally {
      row.requestMs = performance.now() - start; row.finishedAt = new Date().toISOString();
      appendFileSync(join(out, config.rawFiles[row.phase]), JSON.stringify({label: row.label, scene: row.scene, app: row.app, head: row.head, ref: row.ref,
        round: row.round, phase: row.phase, warm: row.warm, requestMs: row.requestMs, reply: reply ?? null, exception: row.exception ?? null}) + '\n');
      save();
    }
  }
  try {
    accessSync(FIREFOX, constants.X_OK); config.firefoxVersion = version('firefox');
    const fixtures = await pageFixtures(out); config.fixtures = fixtures.meta; save();
    const ready = new Map();
    server = createServer((req, res) => {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'POST' && path === '/ready') {
        let body = ''; req.on('data', d => {body += d; if (body.length > 4096) req.destroy();});
        req.on('end', () => {try {const event = JSON.parse(body); ready.set(event.scene, {...event, at: new Date().toISOString()});} catch {} res.writeHead(204); res.end();}); return;
      }
      if (path === '/news.css') {res.writeHead(200, {'content-type': 'text/css'}); res.end(fixtures.css); return;}
      const id = path.slice(1), html = fixtures.pages[id];
      if (!html) {res.writeHead(404); res.end(); return;}
      // Only this load beacon runs. In-page scripts/timers, remote resources, forms and base URL rewrites are blocked.
      const beacon = `<script nonce="p330">addEventListener('load',()=>navigator.sendBeacon('/ready',JSON.stringify({scene:${JSON.stringify(id)},title:document.title,bodyLength:document.body.textContent.length})))</script>`;
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
        'content-security-policy': "default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'nonce-p330'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'"});
      res.end(html.replace(/<\/body>/i, beacon + '</body>'));
    });
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    config.origin = `http://127.0.0.1:${server.address().port}`;
    for (const scene of config.scenes) {
      if (stop) break;
      const state = {}; scene.startedAt = new Date().toISOString(); save();
      try {
        await prepareScene(scene, state, {out, url: config.origin, ready});
        Object.assign(scene, {pid: state.pid, fixture: state.fixture}); save();
        for (const row of data.results.filter(r => r.scene === scene.id)) {
          if (stop) break;
          const ownWarm = data.warmups.filter(w => w.scene === row.scene && w.round === row.round && w.head === row.head);
          const identity = engines.find(e => e.head === row.head);
          const visit = {label: row.label, scene: row.scene, round: row.round, head: row.head, ref: identity.ref, startedAt: new Date().toISOString()};
          config.visits.push(visit); save();
          try {
            if (childRunning(engine)) throw new Error('previous engine still alive');
            rmSync(socket, {force: true});
            let spawnError, tail = '';
            engine = spawn(identity.binary, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'ignore', 'pipe']});
            engine.on('error', e => {spawnError = e;}); visit.pid = engine.pid;
            engine.stderr.on('data', bytes => {tail = (tail + bytes).slice(-20000); appendFileSync(join(out, 'engine-logs', `${row.label}.stderr.txt`), bytes);});
            const end = Date.now() + 15000;
            while (!wire && Date.now() < end) {
              if (stop) throw new Error('interrupted');
              if (spawnError || !childRunning(engine)) throw spawnError ?? new Error(`engine exited before connection: ${tail}`);
              try {wire = await Wire.connect(socket);} catch {await sleep(50);}
            }
            if (!wire) throw new Error('engine did not listen within 15 seconds');
            const ping = await wire.call('ping', {clientApiVersion: 'cua-engine-1', desktop: 'shared'}, 10000);
            visit.ping = ping; if (ping.error) throw new Error(`ping: ${JSON.stringify(ping.error)}`);
            for (const warm of ownWarm) {if (stop) break; await request(warm, scene, state); await sleep(config.warmupWaitMs);}
            if (!stop) await request(row, scene, state);
          } catch (e) {
            visit.exception = errorText(e);
            for (const pending of [...ownWarm, row]) if (pending.status === 'not-run') Object.assign(pending, {status: 'failed', exception: visit.exception, requestSent: false});
          } finally {
            wire?.close(); wire = null;
            // Do not advance to any next head if owned-child termination fails.
            await stopOwnedChild(engine); visit.exitCode = engine?.exitCode; visit.signalCode = engine?.signalCode;
            engine = null; visit.finishedAt = new Date().toISOString(); save();
          }
          console.log(`paired: ${row.label} ${row.status} walkMs=${row.timings?.walkMs ?? '-'} nodes=${row.nodeCount ?? '-'} ${row.problem ?? row.exception?.split('\n')[0] ?? ''}`);
        }
        scene.referenceWindow = state.expectedWindow ?? null;
      } catch (e) {scene.exception = errorText(e);}
      finally {
        try {await state.close?.();} catch (e) {scene.cleanupException = errorText(e); throw e;}
        scene.finishedAt = new Date().toISOString(); save();
      }
      if (childRunning(engine)) throw new Error('engine survived its visit; refusing next scene');
    }
  } catch (e) {config.exception = errorText(e);}
  finally {
    wire?.close();
    try {await stopOwnedChild(engine);} catch (e) {config.cleanupException = errorText(e);}
    if (server) {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
    rmSync(socketDir, {force: true, recursive: true});
    config.finishedAt = new Date().toISOString();
    config.completed = !stop && !config.exception && !config.cleanupException && config.scenes.every(s => !s.exception && !s.cleanupException) && data.results.every(r => r.status !== 'not-run' && r.status !== 'pending');
    save(); process.off('SIGTERM', onTerm); process.off('SIGINT', onInt);
  }
  const summary = summarizePaired(data); writeFileSync(join(out, 'paired-summary.json'), JSON.stringify(summary, null, 2));
  // Collection success is separate from the performance gate. A slow engine must not prevent artifact upload/reading.
  return {data, summary, collected: config.completed && data.results.every(r => r.status === 'ok')};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.includes('--help')) console.log('Hosted macOS only: paired.mjs --control <bin> --branch <bin> --candidate <bin> --out <fresh-dir> --candidate-ref <ref> [--control-ref <ref>] [--branch-ref <ref>]\nRef env: P330_CONTROL_REF / P330_BRANCH_REF / P330_CANDIDATE_REF. Fixed 20 measured + 40 warm requests per engine/scene.');
  else try {requireHosted(); const outcome = await run(parseOptions(process.argv.slice(2))); if (!outcome.collected) process.exitCode = 1;}
  catch (e) {console.error(errorText(e)); process.exitCode = 2;}
}
