#!/usr/bin/env node
// #115 M0's experiment A and the app-server replay, on the mini: one cua session through serve-slot.mjs (cua's real
// serve with CODEX_CLI_PATH pointed at the CLI slot), against a scratch CUA_HOME and HOME, with:
//   - the confinement cell (confinementCell below): what a model cell can write, read, link, clone, exec and reach;
//   - with --native (vendor host, computer surface), the #115 spike's six read-only native calls: listApps twice,
//     Finder's getApp and getAXState twice, counts only (no AX text, no app names), Finder's approval accepted for the
//     session only and nothing else's.
//
//   node scripts/sandbox-probe/experiment.mjs --home <CUA_HOME> --user-home <HOME> [--config-home <XDG_CONFIG_HOME>]
//     --scratch <dir> --host vendor|cua --mode scoped|default [--cli <CLI under test>] --app-server forward|replay
//     [--responses <audited.json>] [--native] --label <name> --out <file>
//   node scripts/sandbox-probe/experiment.mjs --env-probe … --host vendor --mode scoped|default|disabled …
//     #115 M2's opening probe: one banner cell, no confinement cell and no native call, and the verdict of
//     launch-env.mjs (`launchEnv`): did each child's `sandbox` call receive TMPDIR and CODEX_HOME exactly as buildLaunch
//     set them (serve-slot.mjs records the launch; cli-slot.mjs the values and node_repl's permissions table). Under
//     disabled it records whether node_repl calls the launcher at all. It refuses to start while any native helper runs
//     and stops (by pid) any this run's slot started, as a native run does.
//   node scripts/sandbox-probe/experiment.mjs --native --watch-session-tmp … --host vendor …
//     #115 M2's helper check (session-tmp.mjs): the native calls plus Finder's getScreenshot (its size only), and after
//     each, what lies under the launch's session temp besides node_repl's script directories and what this run's own
//     helper holds open there (`sessionTmp`, names and paths only).
// Without --cli (#115 M2) there is no slot: the launch keeps the CODEX_CLI_PATH buildLaunch gives it (on the macOS vendor
// host, cua's compat executable), and the result records `launcher`: the launch's CODEX_CLI_PATH, and for each of the
// run's helpers whether its environment's CODEX_CLI_PATH is that same file, the one it runs `app-server` from.
//
// CUA_HOME is a scratch install; nothing of the owner's runtime home is used. For a --native run HOME must be the
// account's own: node_repl finds the helper's native pipe through HOME while the helper, an app-sandboxed process,
// uses its real container (observed: a scratch HOME fails every native call with "native pipe startup failed").
// XDG_CONFIG_HOME stays a scratch directory either way, so cua's own configuration is not the owner's.
// The session's TMPDIR (which the vendor host hands node_repl, and so its script directory) is a fresh directory of
// its own under the account's temporary directory, so no cell ever looks at another session's temp. A native run
// refuses to start while any SkyComputerUseService runs (it would not be this run's), and quits only the helper this
// run started (the release's helper executable with one of this run's session temps as its TMPDIR; helpers.mjs), by pid,
// if it has not quit by itself; a
// helper whose ownership cannot be read fails the run. Cells write only into the run's scratch directory, its session
// temp and its run directory; nothing else is written outside --scratch, the scratch homes and --out.
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {StdioClient, textOf} from '../browser-parity/mcp.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {attestationProblem, ENGINE_META_KEY} from '../probe/lib.mjs';
import {expectedAttestation} from '../probe/pinned-engine.mjs';
import {auditExchange} from './app-server.mjs';
import {createHelperTracker, helperExecutable, helperLauncherIs, helperPids, isAlive, ownedBySessionTmp} from './helpers.mjs';
import {launchEnvVerdict} from './launch-env.mjs';
import {openUnder, sessionTmpEntries, sessionTmpVerdict} from './session-tmp.mjs';

const SERVE = fileURLToPath(new URL('./serve-slot.mjs', import.meta.url));
const SLOT_BODY = fileURLToPath(new URL('./cli-slot.mjs', import.meta.url));
const FINDER = 'com.apple.finder';
const MARK = 'CUA115 ';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// A cell body wrapped so its value (or error) comes back as one marked JSON line.
const cell = body => `{let __r; const __t0 = performance.now();
try { __r = {ok: true, value: (await (async () => {${body}\n})()) ?? null}; }
catch (e) { __r = {ok: false, error: String(e?.message ?? e).slice(0, 400), code: e?.code}; }
__r.ms = Math.round(performance.now() - __t0); nodeRepl.write(${JSON.stringify(MARK)} + JSON.stringify(__r));}`;

// What a cell can do. Every target is the harness's own: the scratch outside directory and its marker file, the
// installed runtime's module tree, the harness's listeners, the session's own script directory under its own TMPDIR.
export const confinementCell = ({outside, marker, moduleDir, cuaHome, tcpPort, unixPath, sessionTmp}) => `
const fs = await import('node:fs'); const path = await import('node:path'); const os = await import('node:os');
const net = await import('node:net'); const cp = await import('node:child_process');
const code = f => { try { f(); return 'ok'; } catch (e) { return e.code ?? String(e.message).slice(0, 80); } };
const write = p => code(() => { fs.writeFileSync(p, 'cua115'); fs.unlinkSync(p); });
const connect = opts => new Promise(resolve => { const s = net.createConnection(opts); const done = v => { s.destroy(); resolve(v); };
  s.once('connect', () => done('ok')); s.once('error', e => done(e.code ?? 'error')); s.setTimeout(1000, () => done('timeout')); });
const cwd = nodeRepl.cwd, tmp = os.tmpdir();
const scriptDirs = tmp === ${JSON.stringify(sessionTmp)} ? fs.readdirSync(tmp).filter(n => n.startsWith('.tmp') && fs.existsSync(path.join(tmp, n, 'kernel.js'))) : null;
const link = path.join(cwd, 'cua115-link'), clone = path.join(cwd, 'cua115-clone');
const r = {
  cwdWrite: write(path.join(cwd, 'cua115-probe')),
  tmpdirIsSession: tmp === ${JSON.stringify(sessionTmp)},
  tmpdirWrite: write(path.join(tmp, 'cua115-probe')),
  outsideWrite: write(${JSON.stringify(join(outside, 'cua115-probe'))}),
  trustedWrite: write(${JSON.stringify(join(moduleDir, 'cua115-probe'))}),
  slashTmpWrite: write('/private/tmp/cua115-probe-' + Math.random().toString(36).slice(2)),
  readHosts: code(() => fs.readFileSync('/etc/hosts')),
  readOutsideMarker: code(() => fs.readFileSync(${JSON.stringify(marker)})),
  listCuaHome: code(() => fs.readdirSync(${JSON.stringify(cuaHome)})),
  hardLink: code(() => { fs.linkSync(${JSON.stringify(marker)}, link); fs.unlinkSync(link); }),
  clone: code(() => { fs.copyFileSync(${JSON.stringify(marker)}, clone, fs.constants.COPYFILE_FICLONE_FORCE); fs.unlinkSync(clone); }),
  exec: code(() => cp.execFileSync('/bin/echo', ['cua115'], {stdio: 'ignore'})),
  tcp: await connect({host: '127.0.0.1', port: ${tcpPort}}),
  unix: await connect({path: ${JSON.stringify(unixPath)}}),
  mDNSResponder: await connect({path: '/private/var/run/mDNSResponder'}),
  scriptDirs: scriptDirs === null ? null : scriptDirs.length,
  scriptDirWrite: scriptDirs?.length ? write(path.join(tmp, scriptDirs[0], 'cua115-probe')) : null,
};
return r;`;

const NATIVE = [
  ['listApps#1', 'const apps = await cua.listApps({emit: false}); return {apps: apps.length, running: apps.filter(a => a.isRunning).length};'],
  ['Finder getApp+getAXState#1', `const app = await cua.getApp(${JSON.stringify(FINDER)}); const ax = await app.getAXState({emit: false, disableDiffing: true}); return {chars: ax?.length ?? null, lines: ax?.split('\\n').length ?? null};`],
  ['listApps#2', 'const apps = await cua.listApps({emit: false}); return {apps: apps.length};'],
  ['Finder getAXState#2', `const app = await cua.getApp(${JSON.stringify(FINDER)}); const ax = await app.getAXState({emit: false, disableDiffing: true}); return {chars: ax?.length ?? null};`],
];

const SCREENSHOT = ['Finder getScreenshot', `const app = await cua.getApp(${JSON.stringify(FINDER)}); const shot = await app.getScreenshot({emit: false}); return {bytes: shot?.length ?? null};`];

// One cell per call: `call(code)` sends it (the js tool's result back), and its result is kept under `results[name]`,
// with `attested`, the engine its result attests (#117), and `wallMs`. With `expected` (the vendor engine's attestation,
// a vendor-host session's), a result that attests another engine or none is kept with `refused` and stops the run at
// once: that call throws, and every later one throws again without sending, so no further cell reaches the engine; the
// caller's teardown and result still follow. A call that failed in transport has no result to attest.
export function cellRunner({call, expected = null, isCancelled = () => false, results, ev = () => {}}) {
  let refusal = null;
  return async (name, body) => {
    if (isCancelled()) throw new Error('cancelled');
    if (refusal) throw refusal;
    const t = Date.now();
    let result, reply = null;
    try {
      reply = await call(cell(body));
      const text = textOf(reply);
      const line = text.split('\n').reverse().find(l => l.startsWith(MARK));
      result = line ? JSON.parse(line.slice(MARK.length)) : {ok: false, noMarker: true, isError: reply?.isError ?? null, text: text.slice(0, 400)};
      result.attested = reply?._meta?.[ENGINE_META_KEY] ?? null;
    } catch (error) { reply = null; result = {ok: false, transport: error.message}; }
    result.wallMs = Date.now() - t;
    const problem = expected && reply ? attestationProblem(reply._meta, expected) : null;
    if (problem) result.refused = problem;
    results[name] = result;
    ev(`cell ${name}`, result);
    if (problem) throw (refusal = new Error(`refused on the attestation: ${problem}; no further cell was sent`));
    return result;
  };
}

// How many processes below `root` are named codex (ps comm, by basename).
export function codexDescendants(root, {ps = () => execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,comm='], {encoding: 'utf8'})} = {}) {
  const rows = ps().trim().split('\n').map(l => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean).map(m => [Number(m[1]), Number(m[2]), m[3]]);
  const below = new Set([root]);
  for (let changed = true; changed;) { changed = false; for (const [pid, ppid] of rows) if (below.has(ppid) && !below.has(pid)) { below.add(pid); changed = true; } }
  return rows.filter(([pid, , comm]) => pid !== root && below.has(pid) && /(^|\/)codex$/.test(comm)).length;
}

const shQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
// The run's CODEX_CLI_PATH: a sh script that runs cli-slot.mjs on this Node with the run's settings.
export function slotScript({node, real, appServer, logDir, responses}) {
  const settings = {CUA_PROBE_REAL_CLI: real, CUA_PROBE_APP_SERVER: appServer, CUA_PROBE_LOG: logDir, ...(responses ? {CUA_PROBE_RESPONSES: responses} : {})};
  return `#!/bin/sh\n# #115 M0 CLI slot (scripts/sandbox-probe/experiment.mjs)\n${Object.entries(settings).map(([k, v]) => `${k}=${shQuote(v)}; export ${k}`).join('\n')}\nexec ${shQuote(node)} ${shQuote(SLOT_BODY)} "$@"\n`;
}

const readJsonl = file => { try { return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)); } catch { return []; } };

async function main() {
  const {values} = parseArgs({options: {home: {type: 'string'}, 'user-home': {type: 'string'}, scratch: {type: 'string'}, host: {type: 'string'},
    mode: {type: 'string'}, cli: {type: 'string'}, 'app-server': {type: 'string', default: 'forward'}, responses: {type: 'string'}, native: {type: 'boolean', default: false},
    label: {type: 'string'}, out: {type: 'string'}, 'config-home': {type: 'string'}, 'env-probe': {type: 'boolean', default: false}, 'watch-session-tmp': {type: 'boolean', default: false}}});
  const {home, scratch, host, mode, cli, label} = values;
  const userHome = values['user-home'];
  const envProbe = values['env-probe'];
  if (!['vendor', 'cua'].includes(host) || !(envProbe ? ['scoped', 'default', 'disabled'] : ['scoped', 'default']).includes(mode)) throw new Error('--host vendor|cua and --mode scoped|default (with --env-probe also disabled)');
  if (values.native && host !== 'vendor') throw new Error('--native runs on the vendor host (macOS computer sessions)');
  if (envProbe && (values.native || host !== 'vendor')) throw new Error('--env-probe runs on the vendor host without --native');
  const watchTmp = values['watch-session-tmp'];
  if (watchTmp && !values.native) throw new Error('--watch-session-tmp watches a --native run');
  const watchHelpers = values.native || envProbe;
  const out = {label, host, mode, cli, appServer: values['app-server'], native: values.native, envProbe, started: new Date().toISOString(), events: []};
  const ev = (what, data = {}) => { out.events.push({at: new Date().toISOString(), what, ...data}); process.stderr.write(`[${label}] ${what} ${JSON.stringify(data).slice(0, 300)}\n`); };

  if (watchHelpers) {
    const running = helperPids();
    if (running.length) {
      out.refused = 'a SkyComputerUseService this run did not start is running';
      writeFileSync(values.out, `${JSON.stringify(out, null, 2)}\n`);
      throw new Error(out.refused);
    }
  }
  const run = mkdtempSync(join(scratch, `${label}-`));
  // The session's TMPDIR: a fresh directory of its own under the account's temporary directory (see the header).
  // The serve's own TMPDIR (since #115 M1 buildLaunch gives each launch its session temp instead, run/<id>/tmp, which
  // the launch log records and the cells are judged against).
  const serveTmp = mkdtempSync(join(tmpdir(), 'cua115-'));
  const logDir = join(run, 'slot'), outside = join(run, 'outside'), launchLog = join(run, 'launches.jsonl');
  for (const dir of [logDir, outside]) mkdirSync(dir, {recursive: true, mode: 0o700});
  const marker = join(outside, 'cua115-marker.txt');
  writeFileSync(marker, 'synthetic marker\n');
  const tcp = createServer(socket => socket.end()), unixPath = join('/private/tmp', `cua115-${process.pid}.sock`), uds = createServer(socket => socket.end());
  await new Promise(resolve => tcp.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => uds.listen(unixPath, resolve));
  const runtime = resolveRuntime({home});
  const slot = cli ? join(run, 'codex') : null;
  if (slot) {
    writeFileSync(slot, slotScript({node: process.execPath, real: cli, appServer: values['app-server'], logDir, responses: values.responses}));
    chmodSync(slot, 0o755);
  }

  // A vendor-host (computer) session is the vendor engine's (#117 M3): pinned, since a --native run's HOME is the
  // account's own, whose ~/.config/cua/engine.json would otherwise choose the engine.
  const env = {HOME: userHome, XDG_CONFIG_HOME: values['config-home'] ?? join(userHome, '.config'), USER: process.env.USER, LOGNAME: process.env.LOGNAME, LANG: 'C.UTF-8',
    PATH: process.env.PATH, TMPDIR: serveTmp, CUA_HOME: home, CUA_REPL_HOST: host, CUA_SHIM_SURFACES: host === 'vendor' ? 'computer' : 'browser',
    ...(host === 'vendor' ? {CUA_NATIVE_ENGINE: 'vendor'} : {}),
    CUA_SHIM_SANDBOX: mode, CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: 'off',
    ...(slot ? {CUA_PROBE_SLOT: slot} : {}), CUA_PROBE_LAUNCH_LOG: launchLog};
  const elicitations = [];
  const client = new StdioClient({command: process.execPath, args: [SERVE], env, cwd: run, timeoutMs: 120_000, clientName: 'cua-115-m0',
    answer: msg => {
      const app = msg.params?._meta?.tool_params?.app ?? msg.params?.meta?.tool_params?.app ?? null;
      return app === FINDER ? {action: 'accept', content: {}} : {action: 'decline'};
    },
    onElicitation: (row, msg) => elicitations.push({...row, app: msg.params?._meta?.tool_params?.app ?? null, persist: msg.params?._meta?.persist ?? null})});
  // Cooperative cancellation (scripts/accept/compat-route.mjs's timeout): SIGTERM fails the pending call and stops the
  // cells; the teardown below still runs (the serve closed, this run's helpers stopped by pid) and the result is written.
  let cancelled = false;
  process.once('SIGTERM', () => { cancelled = true; ev('cancelled (SIGTERM)'); client.failAll(new Error('cancelled')); });
  const results = {};
  // A vendor-host session attests the vendor engine at the runtime release; the first result that does not ends the
  // cells (cellRunner), and scripts/accept/compat-route.mjs judges every cell's attestation again.
  const js = cellRunner({call: code => client.call('js', {code}), expected: host === 'vendor' ? expectedAttestation({engine: 'vendor', runtime}) : null,
    isCancelled: () => cancelled, results, ev});
  // This run's helpers run the release's helper with one of this run's session temps (helpers.mjs); no other is ever
  // signalled.
  const launchedTmps = () => readJsonl(launchLog).map(l => l.sessionTmp);
  const helperLaunchers = new Map();
  const helpers = createHelperTracker({owns: watchHelpers ? ownedBySessionTmp({executable: helperExecutable(runtime.paths.skyServiceApp), sessionTmps: launchedTmps}) : () => false});
  try {
    const init = await client.initialize({elicitation: {form: {}}});
    out.serverInfo = init?.serverInfo ?? null;
    await js('banner', 'return {ready: true};');
    if (envProbe) helpers.observe();
    else await js('confinement', confinementCell({outside, marker, moduleDir: runtime.paths.moduleDir, cuaHome: home, tcpPort: tcp.address().port, unixPath,
      sessionTmp: launchedTmps().at(-1) ?? null}));
    // No Codex CLI under this run (#115 M2): the processes below this one named codex, counted while the session lives.
    out.codexDescendants = codexDescendants(process.pid);
    if (values.native) {
      const tmpSeen = [];
      for (const [name, body] of watchTmp ? [...NATIVE, SCREENSHOT] : NATIVE) {
        await js(name, body);
        helpers.observe();
        if (!slot) for (const pid of helpers.owned()) if (!helperLaunchers.has(pid)) helperLaunchers.set(pid, {launcherIsTheLaunch: helperLauncherIs(pid, readJsonl(launchLog).at(-1)?.CODEX_CLI_PATH)});
        if (watchTmp) {
          const tmp = readJsonl(launchLog).at(-1)?.sessionTmp;
          tmpSeen.push({label: name, sessionTmp: tmp ?? null, entries: tmp ? sessionTmpEntries(tmp) : null,
            helperOpen: tmp ? helpers.owned().flatMap(pid => openUnder(pid, tmp)) : []});
        }
      }
      if (watchTmp) out.sessionTmp = {seen: tmpSeen, verdict: sessionTmpVerdict(tmpSeen.filter(o => o.entries !== null))};
    }
    await client.call('end_task', {}).catch(() => null);
  } catch (error) {
    ev('driver error', {message: error.message});
    out.driverError = error.message;
  } finally {
    out.serveExit = await client.close();
    tcp.close(); uds.close(); rmSync(unixPath, {force: true});
  }
  if (watchHelpers) {
    for (let i = 0; i < 50 && helpers.owned().some(isAlive); i++) await sleep(100);
    out.helpers = {...await helpers.stopLeft(), foreignSeen: helpers.foreignSeen().length};
  }
  out.results = results;
  if (cancelled) out.cancelled = true;
  out.elicitations = elicitations;
  // What the slot saw: the CLI invocations, and per app-server the audited exchange (never the raw lines).
  const invocations = readJsonl(join(logDir, 'invocations.jsonl'));
  out.slot = {invocations: invocations.map(({t, sub, mode: m, cwd, configKeys, script, args, envNames, envValues, permissions, command}) =>
    ({t, sub, mode: m, configKeys, script, args, envNames, ...(envProbe ? {cwd, envValues, permissions, command} : {})}))};
  if (!slot) {
    const launches = readJsonl(launchLog);
    out.launcher = {codexCliPath: launches.at(-1)?.CODEX_CLI_PATH ?? null, helpers: [...helperLaunchers.values()]};
  }
  if (envProbe) {
    out.launches = readJsonl(launchLog);
    out.launchEnv = launchEnvVerdict({launches: out.launches, invocations});
  }
  const codexHome = join(home, 'state', 'codex');
  out.appServers = readdirSync(logDir).filter(f => /^(app-server|replay)-\d+\.jsonl$/.test(f)).sort().map(file => {
    const records = readJsonl(join(logDir, file));
    if (file.startsWith('replay-')) return {file, replay: records.map(({method, id, answered, eof}) => ({method, id, answered, eof}))};
    const exchange = records.filter(r => r.dir);
    return {file, exit: records.find(r => 'exit' in r) ?? null, stdinEof: records.some(r => r.stdinEof),
      audit: auditExchange(exchange, {env: {CODEX_HOME: codexHome, CUA_HOME: home, HOME: userHome}})};
  });
  out.rawLogDir = logDir;
  out.finished = new Date().toISOString();
  writeFileSync(values.out, `${JSON.stringify(out, null, 2)}\n`);
  rmSync(marker, {force: true});
  rmSync(serveTmp, {recursive: true, force: true});
  if (out.driverError) process.exitCode = 1;
  // Under disabled the probe only records whether node_repl calls the launcher; scoped and default must pass.
  if (envProbe && mode !== 'disabled' && !out.launchEnv.ok) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
