#!/usr/bin/env node
// Acceptance 13's driver (#171 M6b, T6; the M6b pre-flight §5.2), M6a's acceptance 12 driver with its cells replaced:
// inside the environment linux-runtime-env.sh makes (a private Xvfb with Openbox, a private session bus, accessibility
// on, the run's own homes, the sandbox scoped), it runs the cells of ./linux-runtime-cells.mjs over these homes and
// judges each by its own criterion:
//   E  an empty home (the wrapper's CUA_HOME): E0 this cua's install under the fetch log and the trace; E1 the item 1
//      smoke (./linux-native.mjs --selection default) and the item 6 witness (./linux-text.mjs), each plain and traced;
//      E2 the browser-only session (./linux-browser-only.mjs) plain and traced, and the profile map's loader; E3 the
//      vendor's engine selected by the variable, by engine.json and by both, and an override naming cua's engine 0.4.4,
//      each open and each doctor run traced, a browser-only session with the variable, `cua install` under it, and a
//      session once it is unset;
//   U  an upgraded home (<run>/upgraded/cua) installed by the cua before M6b (--older, a checkout of it) under the same
//      fetch log, whose log is the control (it must hold the vendor's deb): U0 the item 1 smoke, traced, and the vendor
//      selection, before any install; U1 doctor plain and traced; U2 `cua install` with a directory and a file of the
//      run's added to runtimes/, under the fetch log and the trace; U3 doctor, E1 and E2 plain, and the install again;
//      U4 and U5 new homes holding a copy of the release, its record with one digit of its hash changed, or with none.
// Around every fixture a 50 ms watch of its process tree (./linux-runtime-watch.mjs) says which engine answered. Every
// traced run is under strace --seccomp-bpf (./linux-trace.mjs TRACE_ARGS) and keeps, beside its counts, its
// process-path witness: each program its execs ran, by path, with a count. Before any cell doctor's four environment
// rows must pass, and after E0 sandbox.launcher must pass, or no session cell starts there. Measured, not judged: E0's
// time and bytes fetched beside the older cua's install, doctor's time in U1 beside E0's, and the time from `cua serve`'s
// start to a first cell's answer, --samples in E against as many under the older cua in U.
//
//   node scripts/accept/linux-runtime.mjs --out <dir> --older <checkout> [--phases E,U] [--leg <label>] [--samples <n>]
//     writes <dir>/runtime.json (labels, outcomes, counts and scratch paths: the artifact) and exits 0 only when every
//     cell run passed. Every raw stream (each fixture's own report, doctor's and the installs' output, the strace files,
//     the fetch logs) stays in <dir>/../scratch. It refuses to start with CUA_SHIM_SANDBOX set, with no DISPLAY, or on
//     display :0.
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmodSync, closeSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {readPointer} from '../../src/runtime/layout.mjs';
import {linuxEnginePath, loadEnginePin} from '../../src/runtime/linux-engine.mjs';
import {linuxRelease, loadLinuxRuntime, resolveRuntime} from '../../src/runtime/manifest.mjs';
import {loadModuleLock, loadModuleProvenance, moduleHost, pinnedClosure} from '../../src/runtime/module-tree.mjs';
import {loadNodePins, managedNode, selectNodePin} from '../../src/runtime/managed-node.mjs';
import {helperFor, loadHelperPin} from '../../src/sandbox/linux.mjs';
import {MIN_ENGINE_VERSION} from '../../src/services/engine/linux/client.mjs';
import {loadClassicLevel} from '../../src/profiles/directory-map.mjs';
import {APPROVED_OLDER, CELLS, ENGINE_HINT_LITERAL, OUTDATED_ENGINE, VENDOR_RELEASES, boundaryProblems, controlProblems, doctorRefusalProblems, doctorRowsProblems, emptyHomeProblems,
  execRoleProblems, fetchLogProblems, fixtureProblems, inheritedOverrides, installProblems, noFetchProblems, notNamedProblems, olderProblems, outdatedOverrideMessage,
  parsePhases, refusedAsProblems, reinstallProblems, retiredInstallProblems, retiredLineProblems, retiredMessage, retiredSentence, runVerdict, runtimesCallProblems,
  snapshotProblems, staticEngineProblems, toolProblems, traceProblems, treeSnapshot, vendorReleaseFor, witnessOf, initializeAnswered} from './linux-runtime-cells.mjs';
import {cuaEngineProblems, noEngineProblems, ownNodeProblems, startWatch} from './linux-runtime-watch.mjs';
import {environmentVerdict} from './linux-runtime-pilot.mjs';
import {summarizeTraceFile, TRACE_ARGS} from './linux-trace.mjs';
import {FETCH_LOG, readFetchLog} from './fetch-log.mjs';
import {readDoctor} from './linux-selection.mjs';
import {baselineOf, cellJson, useCell} from './linux-browser-only.mjs';
import {openSession, resultText} from './mcp-session.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(REPO, 'bin', 'cua.mjs');
const PRELOAD = join(REPO, 'scripts', 'accept', 'fetch-log.mjs');
const FIXTURES = {
  smoke: [join(REPO, 'scripts', 'accept', 'linux-native.mjs'), '--selection', 'default'],
  witness: [join(REPO, 'scripts', 'accept', 'linux-text.mjs')],
  browser: [join(REPO, 'scripts', 'accept', 'linux-browser-only.mjs')],
};
// The identity each fixture's report must carry (linux-runtime-cells.mjs FIXTURE_STEPS).
const FIXTURE_ID = {smoke: 'linux-native', witness: 'linux-text', browser: 'linux-browser-only'};
const MINUTES = {plain: 12, traced: 25};
// The two entries U2 adds to runtimes/, which nothing may name.
const ADDED = {dir: 'm6b-t6-added-dir', file: 'm6b-t6-added-file'};
// Doctor's sandbox.userns probe as it executes (src/runtime/linux-desktop.mjs bwrapUserns): the one bubblewrap a doctor
// run may start.
const USERNS_PROBE = Object.freeze({role: 'bwrap', argvTail: ['--ro-bind', '/', '/', 'true']});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const readText = file => { try { return readFileSync(file, 'utf8'); } catch { return null; } };
const real = path => { try { return realpathSync(path); } catch { return path; } };
const gitHead = dir => spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).stdout?.trim() || null;
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const lstatKind = path => { try { const s = lstatSync(path); return s.isSymbolicLink() ? 'link' : s.isDirectory() ? 'directory' : s.isFile() ? 'file' : 'other'; } catch (error) { return error.code ?? 'unreadable'; } };

// ---- the profile map's loader (outside any session): `node linux-runtime.mjs --loader <home>` ------------------------

async function loader(home) {
  const runtime = resolveRuntime({home});
  const resolved = createRequire(join(runtime.paths.moduleDir, 'x.js')).resolve('classic-level');
  const ClassicLevel = loadClassicLevel(runtime.paths.moduleDir);
  const dir = mkdtempSync(join(tmpdir(), 'cua-m6b-loader-'));
  try {
    const db = new ClassicLevel(join(dir, 'store'), {keyEncoding: 'utf8', valueEncoding: 'utf8'});
    await db.open();
    await db.put('extensionInstanceId', JSON.stringify('m6b-loader'));
    const value = await db.get('extensionInstanceId');
    await db.close();
    const natives = readFileSync('/proc/self/maps', 'utf8').split('\n').map(l => l.trim().split(/\s+/).slice(5).join(' ')).filter(p => /classic-level.*\.node$/.test(p));
    process.stdout.write(`${JSON.stringify({root: runtime.root, resolved, readBack: value === JSON.stringify('m6b-loader'), natives: [...new Set(natives)]})}\n`);
  } finally { rmSync(dir, {recursive: true, force: true}); }
}

// ---- the vendor tree, by lstat and by the driver's own count ---------------------------------------------------------

/**
 * Whether `home` holds the vendor release `release` as an install placed it, read by lstat alone and following no link:
 * runtimes/ and runtimes/<release> real directories, its install.json a regular file, its cua_node/ a directory ->
 * {resolves, why}, `why` the first thing that is not so.
 */
export function recordedTree(home, release) {
  const root = join(home, 'runtimes', release ?? '');
  for (const [path, want] of [[join(home, 'runtimes'), 'directory'], [root, 'directory'], [join(root, 'install.json'), 'file'], [join(root, 'cua_node'), 'directory']]) {
    const found = lstatKind(path);
    if (!release || found !== want) return {resolves: false, why: release ? `${path} is ${found}, not a ${want}` : 'no vendor release named'};
  }
  return {resolves: true, why: null};
}

/**
 * The tree's size by the pre-flight's §3.2 method, counted by `find` and not by cua's code: regular files and links by
 * their own size, a file of several links once by device and inode. Null when find fails.
 */
export function findBytes(dir) {
  const run = spawnSync('find', [dir, '(', '-type', 'f', '-o', '-type', 'l', ')', '-printf', '%D:%i %s\n'], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (run.status !== 0) return null;
  const seen = new Map();
  for (const line of run.stdout.split('\n')) { const [inode, size] = line.split(' '); if (inode) seen.set(inode, Number(size)); }
  return [...seen.values()].reduce((n, size) => n + size, 0);
}

// The managed parts of a home whose snapshots say an install changed nothing (U2, U3): each by treeSnapshot. A part
// that cannot be read makes no snapshot at all (null), which never compares equal (fix wave 1).
const PART_DIRS = ['modules', 'sandbox', 'node', 'engine', 'current.json'];
export function partsSnapshot(home) {
  const entries = [];
  for (const part of PART_DIRS) {
    const snapshot = treeSnapshot(join(home, part));
    if (!snapshot) return null;
    entries.push(...snapshot.entries.map(e => ({...e, path: `${part}/${e.path}`})));
  }
  return {entries};
}

/**
 * Whether the driver may write and remove `<home>/.config/cua/engine.json` (E3): only in a user `home` (its real path)
 * inside the run directory `runDir` (its real path), which linux-runtime-env.sh made fresh, and only when no engine.json
 * is there yet. Anywhere else the file is someone else's, and the driver never touches it (fix wave 1, Critical).
 */
export function settingsHomeProblems({home, runDir, settingsExists}) {
  if (!home) return ['HOME is unset: E3 writes engine.json only in the run\'s own user home'];
  if (!home.startsWith(`${runDir}/`)) return [`HOME ${home} is not inside the run ${runDir}: E3 writes engine.json only in the run's own user home`];
  return settingsExists ? [`${join(home, '.config', 'cua', 'engine.json')} exists: the run's user home holds no engine.json until E3 writes one`] : [];
}

// ---- what this checkout pins, for E0's fetch log ---------------------------------------------------------------------

// The arch's pinned assets as the install fetches them: the module tree's tarballs (its canonical registry URLs), the
// helper, Node and the engine, each with its pinned length where it has one.
function pinnedAssets(arch) {
  const host = {...moduleHost(), arch};
  const tarballs = pinnedClosure(loadModuleLock(), loadModuleProvenance(), host).map(p => ({url: p.resolved, length: p.length}));
  const helper = loadHelperPin().assets[`linux-${arch}`];
  const node = selectNodePin(loadNodePins(), {platform: 'linux', arch});
  const engine = loadEnginePin().assets[arch];
  return [...tarballs, {url: helper.url, length: helper.length}, {url: node.archive.url, length: node.archive.length}, {url: engine.url}];
}

// The older checkout's own pin of the vendor's deb for `release` (its runtime/releases/<release>.json, the file its
// install reads), as plain JSON: the control's URL and length. Null when it has none.
function olderDeb(older, release) {
  const pin = readJson(join(older, 'runtime', 'releases', `${release}.json`));
  return pin?.archive?.url ? {url: pin.archive.url, length: pin.archive.length} : null;
}

// ---- the run ---------------------------------------------------------------------------------------------------------

function createRun({out, scratch}) {
  let n = 0;
  const label = name => `${String(++n).padStart(2, '0')}-${name}`;

  /**
   * `command args` with its output to two files in scratch, each line's arrival time kept: {label, code, signal, seconds,
   * out, err, lines}. With `traced` it runs under strace (TRACE_ARGS), its summary read as `summary` (the homes `homes`
   * counted, `helper` the pinned helper); with `logged` it runs Node with the fetch log's preload, the log read as `log`.
   */
  async function exec(name, command, args, {env, minutes = 20, traced = false, logged = false, helper = null, homes = []}) {
    const id = label(name);
    const files = {out: join(scratch, `${id}.out`), err: join(scratch, `${id}.err`), trace: join(scratch, `${id}.strace`), log: join(scratch, `${id}.fetch.jsonl`)};
    let [cmd, argv, childEnv] = [command, args, env];
    if (logged) {
      argv = ['--import', PRELOAD, ...argv];
      childEnv = {...env, [FETCH_LOG]: files.log};
    }
    if (traced) [cmd, argv] = ['strace', [...TRACE_ARGS, '-o', files.trace, '--', cmd, ...argv]];
    const started = Date.now();
    const lines = [];
    const result = await new Promise(done => {
      const child = spawn(cmd, argv, {cwd: REPO, env: childEnv, stdio: ['ignore', 'pipe', 'pipe']});
      const sinks = {out: openSync(files.out, 'w'), err: openSync(files.err, 'w')};
      for (const stream of ['out', 'err']) {
        const source = stream === 'out' ? child.stdout : child.stderr;
        source.on('data', chunk => writeFileSync(sinks[stream], chunk));
        createInterface({input: source}).on('line', text => lines.push({stream, ms: Date.now() - started, text}));
      }
      const timer = setTimeout(() => child.kill('SIGTERM'), minutes * 60_000);
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        closeSync(sinks.out); closeSync(sinks.err);
        done({label: id, code, signal, seconds: Math.round((Date.now() - started) / 100) / 10, out: files.out, err: files.err, lines});
      });
    });
    if (logged) Object.assign(result, {logFile: files.log, log: readFetchLog(files.log)});
    if (traced) Object.assign(result, {traceFile: files.trace, summary: existsSync(files.trace) ? await summarizeTraceFile(files.trace, {helper, home: homes, cwd: REPO}) : null});
    return result;
  }

  /** `cua <args>` of `cli` (this checkout's unless given), Node first: exec's options. */
  const cua = (name, args, options) => exec(name, process.execPath, [options.cli ?? CLI, ...args], options);

  /**
   * A fixture (FIXTURES' `kind`), plain or traced, with the process watch over its tree: {label, exit, signal, seconds,
   * report, watch, out, trace?: {file, summary}}. `watchPaths(report)` names the paths whose opening the trace is read for.
   */
  async function fixture(kind, {env, traced = false, helper, homes, watchPaths, extra = []}) {
    const id = label(`${kind}${traced ? '-traced' : ''}`);
    const files = {out: join(scratch, `${id}.out`), err: join(scratch, `${id}.err`), trace: join(scratch, `${id}.strace`)};
    const [script, ...args] = [...FIXTURES[kind], ...extra];
    const [command, argv] = traced ? ['strace', [...TRACE_ARGS, '-o', files.trace, '--', process.execPath, script, ...args]] : [process.execPath, [script, ...args]];
    const started = Date.now();
    const sinks = {out: openSync(files.out, 'w'), err: openSync(files.err, 'w')};
    const child = spawn(command, argv, {cwd: REPO, env, stdio: ['ignore', sinks.out, sinks.err]});
    const watching = startWatch(child.pid);
    const timer = setTimeout(() => child.kill('SIGTERM'), (traced ? MINUTES.traced : MINUTES.plain) * 60_000);
    const {code, signal} = await new Promise(done => child.once('exit', (c, s) => done({code: c, signal: s})));
    clearTimeout(timer);
    const watch = watching.stop();
    closeSync(sinks.out); closeSync(sinks.err);
    const report = readJson(files.out);
    const result = {label: id, kind, exit: code, signal, seconds: Math.round((Date.now() - started) / 100) / 10, report, watch, out: files.out};
    if (traced) {
      const watched = watchPaths?.(report) ?? null;
      result.trace = {file: files.trace, summary: existsSync(files.trace) ? await summarizeTraceFile(files.trace, {helper, home: homes, cwd: REPO, ...(watched ? {watch: watched} : {})}) : null};
    }
    return result;
  }

  /**
   * An open of a computer session at this cua that is expected to be refused, its serve traced so that what it executed
   * rests on exec evidence: {exit, signal, replied, spontaneous, drained, stderr, trace, err}. `replied` is any answer to
   * initialize, an error included; `spontaneous` that serve exited on its own within 60 s, before the driver ended it.
   */
  async function attemptOpen(name, {env, helper, homes}) {
    const id = label(name);
    const traceFile = join(scratch, `${id}.strace`);
    const session = openSession({command: 'strace', args: [...TRACE_ARGS, '-o', traceFile, '--', process.execPath, CLI, 'serve'], env, clientName: 'cua-m6b-refusal'});
    session.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'cua-m6b-refusal', version: '0'}}, 60_000);
    const spontaneous = await Promise.race([session.exited.then(() => true), sleep(60_000).then(() => false)]);
    const exited = await session.terminate();
    const drained = await session.drainStreams({budgetMs: 5000});
    // Whether initialize was answered is read from the whole transcript once stdout has drained, so a reply buffered at
    // the exit is still a reply (M6a fix wave 2, #3).
    const replied = initializeAnswered(session.transcript);
    writeFileSync(join(scratch, `${id}.err`), session.stderr);
    const trace = existsSync(traceFile) ? await summarizeTraceFile(traceFile, {helper, home: homes, cwd: REPO}) : null;
    return {label: id, exit: exited.code, signal: exited.signal, replied, spontaneous, drained, stderr: session.stderr, trace, err: join(scratch, `${id}.err`), traceFile};
  }

  /** The time from `cua serve`'s start (`cli`) to a first cell's answer, `n` times. -> ms per sample, or the failure. */
  async function firstAnswers(cli, {env, n}) {
    const samples = [];
    for (let i = 0; i < n; i++) {
      const started = process.hrtime.bigint();
      const session = openSession({args: [cli, 'serve'], env, clientName: 'cua-m6b-measure'});
      try {
        await session.initialize();
        const answer = await session.js('nodeRepl.write("m6b")', 60_000);
        if (answer.timedOut || answer.result?.isError) return {samples, failed: `sample ${i + 1}: the cell did not answer`};
        samples.push(Number(process.hrtime.bigint() - started) / 1e6);
      } catch (error) { return {samples, failed: `sample ${i + 1}: ${error.message}`}; } finally { await session.terminate(); }
    }
    return {samples: samples.map(ms => Math.round(ms)), median: Math.round(median(samples)), min: Math.round(Math.min(...samples)), max: Math.round(Math.max(...samples))};
  }
  /**
   * The six imports by name, and the native uses, in a browser-only session of `cli`'s serve (useCell): its `use`, taken
   * only from a successful reply whose base is `expectedBase` and whose outcomes are well formed (baselineOf).
   */
  async function imports(cli, {env, expectedBase}) {
    const session = openSession({args: [cli, 'serve'], env: {...env, CUA_SHIM_SURFACES: 'browser'}, clientName: 'cua-m6b-imports'});
    try {
      await session.initialize();
      const used = await session.js(useCell(), 180_000);
      const use = cellJson(resultText(used), 'use');
      const baseline = baselineOf({isError: used.result?.isError === true || !!used.error, timedOut: !!used.timedOut, use}, {expectedBase});
      return baseline.failed ? baseline : {...baseline, used: use.used, via: use.via, natives: use.natives?.length ?? null};
    } catch (error) { return {failed: error.message}; } finally { await session.terminate(); }
  }
  return {exec, cua, fixture, attemptOpen, firstAnswers, imports, out, scratch};
}

// ---- the artifact's projections --------------------------------------------------------------------------------------

// A trace's summary as the artifact carries it: its counts, the calls under runtimes/ by kind, and the process-path
// witness (each program its execs ran, by path, with a count) for T8's audit; never its lines.
const projectTrace = (file, s) => s && ({file, processes: s.processes, serve: s.serve, whole: s.whole, runtimes: s.runtimes, programs: s.programs,
  files: Object.entries((s.files ?? []).reduce((by, f) => ({...by, [f.kind]: (by[f.kind] ?? 0) + 1}), {})).map(([kind, count]) => ({kind, count})),
  launched: s.launched?.map(l => `${l.kind} ${l.program}`) ?? null});
// A fixture run as the artifact carries it: its label, outcome, timing, each step's name and status, and its raw report's
// scratch path; the watch's counts; a trace's summary.
const projectRun = run => run && ({label: run.label, exit: run.exit, signal: run.signal, seconds: run.seconds, fixture: run.report?.fixture ?? null, status: run.report?.status ?? null,
  steps: (run.report?.steps ?? []).map(s => ({name: s.name, status: s.status})), report: run.out,
  ...(run.report?.imports?.comparison ? {imports: {comparison: run.report.imports.comparison}} : {}),
  ...(run.kind === 'browser' && run.report?.moduleRoot ? {witness: witnessOf(run.report, {root: real(run.report.moduleRoot),
    kernels: (run.trace?.summary?.kernels ?? []).filter(k => k.underServe && k.underHelper)})} : {}),
  // Each cua-engine the sampler saw, with its start time, and whether it was skipped as vanished between two reads.
  watch: run.watch && {samples: run.watch.samples, maxSkyLinux: run.watch.maxSkyLinux, engines: run.watch.engines.length, skyLinux: run.watch.skyLinux.length, replHost: run.watch.replHost.map(p => p.role),
    engineProcesses: run.watch.engineProcesses ?? []},
  ...(run.trace ? {trace: {...projectTrace(run.trace.file, run.trace.summary), workers: run.trace.summary?.workers ?? null, helpers: run.trace.summary?.helpers ?? null,
    kernels: run.trace.summary?.kernels?.map(k => ({...k, opened: k.opened?.length})) ?? null}} : {})});
// A command's run (exec's result) as the artifact carries it.
const projectExec = run => run && ({label: run.label, exit: run.code, signal: run.signal, seconds: run.seconds, out: run.out, err: run.err,
  ...(run.logFile ? {fetchLog: {file: run.logFile, asked: run.log?.length ?? null, bytes: run.log?.reduce((n, e) => n + (e.bytes ?? 0), 0) ?? null,
    fetches: run.log?.map(({url, answered, status, bytes, complete, error}) => ({url, answered, status, bytes, complete, ...(error ? {error} : {})})) ?? null}} : {}),
  ...(run.traceFile ? {trace: projectTrace(run.traceFile, run.summary)} : {})});
// A refused open as the artifact carries it.
const projectAttempt = (what, a) => ({what, label: a.label, exit: a.exit, signal: a.signal, replied: a.replied, spontaneous: a.spontaneous, drained: a.drained, err: a.err, trace: projectTrace(a.traceFile, a.trace)});
const fetchedBytes = log => log?.reduce((n, e) => n + (e.bytes ?? 0), 0) ?? null;

async function main() {
  const option = name => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
  if (process.argv.includes('--loader')) return loader(option('--loader'));
  const out = option('--out');
  if (!out) throw new Error('usage: linux-runtime.mjs --out <dir> --older <checkout> [--phases E,U] [--leg <label>] [--samples <n>]');
  const phases = parsePhases(option('--phases'));
  const older = option('--older') ? resolve(option('--older')) : null;
  const sampleCount = Number(option('--samples') ?? 20);
  if (!older) throw new Error('--older <checkout of the cua before M6b> is needed: its install makes the upgraded home and is the fetch log\'s control, and its by-name imports are the browser-only runs\' baseline');
  mkdirSync(out, {recursive: true});
  const runDir = dirname(resolve(out));
  const scratch = join(runDir, 'scratch');
  mkdirSync(scratch, {recursive: true});
  const r = createRun({out, scratch});
  const arch = process.arch;
  // The Linux runtime this arch's install derives, named on any host: a host that is not Linux stops at the preconditions.
  const release = linuxRelease(loadLinuxRuntime({host: {platform: 'linux', arch}}), arch);
  // This checkout's install command as every refusal names it: its own bin/cua.mjs by absolute path.
  const installer = `node ${CLI} install`;
  const pin = loadEnginePin();
  // The vendor release this arch's install placed before M6b, by its name (retired-tree.mjs's constants): no pin and no
  // provenance record is read for it.
  const vendorName = vendorReleaseFor(arch);
  const releases = Object.values(VENDOR_RELEASES);
  // engine.json of the run's user home, which E3 writes and removes once the preconditions verified the home is the
  // run's own (settingsHomeProblems); until then, and in any other home, it is never touched.
  const settingsPath = join(process.env.HOME ?? '', '.config', 'cua', 'engine.json');
  let settingsOwned = false;
  const writeSettings = engine => {
    if (!settingsOwned) throw new Error(`${settingsPath} is not the run's own: it is never written`);
    mkdirSync(dirname(settingsPath), {recursive: true});
    writeFileSync(settingsPath, `${JSON.stringify({engine})}\n`);
  };
  const clearSettings = () => { if (settingsOwned) rmSync(settingsPath, {force: true}); };
  const report = {driver: 'm6b-acceptance-13', leg: option('--leg') ?? null, arch, node: process.version, head: gitHead(REPO), release, installer, vendorRelease: vendorName,
    older: {path: older, commit: gitHead(older)}, phases, out: resolve(out), scratch, startedAt: new Date().toISOString(), cells: [], measured: {}};
  const say = line => process.stderr.write(`linux-runtime: ${line}\n`);

  // A cell's record, its checks appended as they are judged.
  const cellOf = id => { const cell = {...CELLS.find(c => c.cell === id), checks: [], runs: []}; report.cells.push(cell); say(`${id}: ${cell.step}`); return cell; };
  const check = (cell, name, problems, detail) => { cell.checks.push({name, pass: problems.length === 0, problems, ...(detail ? {detail} : {})}); say(`${cell.cell} ${problems.length ? 'FAIL' : 'PASS'} ${name}${problems.length ? `: ${problems.join('; ')}` : ''}`); return problems.length === 0; };
  const finish = cell => { cell.verdict = {pass: cell.checks.length > 0 && cell.checks.every(c => c.pass), problems: cell.checks.flatMap(c => c.problems.map(p => `${c.name}: ${p}`))}; };
  const notRun = (id, why) => { const cell = cellOf(id); cell.checks.push({name: 'not run', pass: false, problems: [why]}); finish(cell); };

  const homeFacts = home => {
    const node = managedNode(home).path ?? null;
    return {engine: real(linuxEnginePath(home)), helper: real(helperFor({home, arch}).path), homes: [...new Set([home, real(home)])], node: node && real(node), nodes: node ? [...new Set([node, real(node)])] : []};
  };
  // Every session run: the REPL host on the home's managed Node at every sample (M6a fix wave 1, #8).
  const ownNode = (cell, what, run, facts) => check(cell, `${what}: the worker and the kernel ran on the home's managed Node at every sample`,
    facts.node ? ownNodeProblems(run.watch, {node: facts.node}) : ['the home has no managed Node']);
  async function computerRuns(cell, {env, home, kinds = ['smoke', 'witness'], modes = [false]}) {
    const facts = homeFacts(home);
    for (const kind of kinds) {
      for (const mode of modes) {
        const run = await r.fixture(kind, {env, traced: mode, helper: facts.helper, homes: facts.homes});
        cell.runs.push(projectRun(run));
        const what = `${kind === 'smoke' ? 'the item 1 smoke' : 'the item 6 witness'}${mode ? ' traced' : ''}`;
        check(cell, `${what}: every step passes`, fixtureProblems(run, {fixture: FIXTURE_ID[kind]}));
        check(cell, `${what}: no sky_linux at any sample, the engine child the home's cua-engine`, cuaEngineProblems(run.watch, {engine: facts.engine}));
        ownNode(cell, what, run, facts);
        if (mode) check(cell, `${what}: the trace is whole, holds the kernel and the worker on the managed Node, and the serve's tree named nothing under runtimes/`,
          run.trace.summary ? traceProblems(run.trace.summary, {node: facts.nodes}) : ['strace wrote no trace']);
      }
    }
  }
  // The paths a browser-only run's trace must show opened: the six selected entries, and playwright's entry and
  // playwright-core's as require loaded them (ruling 1162).
  const openedPaths = rep => {
    const files = rep?.imports?.loaded?.playwright?.files;
    const core = Array.isArray(files) ? files.find(f => typeof f === 'string' && /\/node_modules\/playwright-core\/index\.js$/.test(f)) : null;
    return [...Object.values(rep?.imports?.selected ?? {}), rep?.imports?.loaded?.playwright?.entry, core].filter(p => typeof p === 'string');
  };
  const selectedPaths = rep => { const s = openedPaths(rep); return [...new Set([...s, ...s.map(real)])]; };
  let baselineFile = null;
  async function browserRuns(cell, {env, home, traced, label = 'the browser-only session'}) {
    const facts = homeFacts(home);
    for (const mode of traced ? [false, true] : [false]) {
      const run = await r.fixture('browser', {env, traced: mode, helper: facts.helper, homes: facts.homes, watchPaths: selectedPaths, extra: ['--baseline', baselineFile]});
      cell.runs.push(projectRun(run));
      const what = `${label}${mode ? ' traced' : ''}`;
      check(cell, `${what}: every step passes (the six entries selected from the module tree, the imports as ruled, its natives mapped, confined)`, fixtureProblems(run, {fixture: FIXTURE_ID.browser}),
        {imports: run.report?.imports?.comparison ?? null});
      check(cell, `${what}: no engine process at any sample`, noEngineProblems(run.watch));
      ownNode(cell, what, run, facts);
      if (env.CUA_NATIVE_ENGINE !== undefined) check(cell, `${what}: it ran with CUA_NATIVE_ENGINE=${env.CUA_NATIVE_ENGINE}`, run.report?.engineSetting === env.CUA_NATIVE_ENGINE ? [] : [`its report says ${run.report?.engineSetting ?? 'none'}`]);
      if (mode) {
        const opened = [...new Set(openedPaths(run.report).map(real))];
        check(cell, `${what}: the trace is whole, and one kernel of the serve's, on the managed Node, opened each selected entry and playwright's loaded ones after its exec; nothing under runtimes/`,
          !run.trace.summary ? ['strace wrote no trace'] : opened.length !== 8 ? [`the fixture reported ${opened.length} entries to open, not 6 selected and playwright's 2 loaded`] : traceProblems(run.trace.summary, {opened, node: facts.nodes}));
      }
    }
  }
  async function loaderRun(cell, {env, home}) {
    const run = await r.exec('loader', process.execPath, [fileURLToPath(import.meta.url), '--loader', home], {env, minutes: 3});
    const result = readJson(run.out);
    const root = resolveRuntime({home}).root;
    const problems = run.code !== 0 ? [`the loader exited ${run.code}`] : [];
    if (!result?.readBack) problems.push('the store did not read back the key it wrote');
    if (!result?.resolved?.startsWith(`${root}/`)) problems.push(`classic-level resolved to ${result?.resolved ?? 'nothing'}, not under the module tree ${root}`);
    if (!result?.natives?.length || !result.natives.every(p => p.startsWith(`${real(root)}/`))) problems.push(`classic-level's addon mapped from ${JSON.stringify(result?.natives ?? null)}, not the module tree`);
    check(cell, 'the profile map\'s loader opens a store with the module tree\'s classic-level, writes a key and reads it back', problems, {report: run.out});
  }
  // The vendor tree at a cell's boundary, read rather than taken from the cell's label (M6a fix wave 1, #5), by lstat.
  const boundary = (cell, home, expected, when) => {
    const {resolves, why} = recordedTree(home, vendorName);
    return check(cell, `the vendor tree is ${expected} at the cell's ${when}`, boundaryProblems({expected, exists: existsSync(join(home, 'runtimes')), resolves, why}));
  };
  // A doctor run of this cua, its report and how long it took.
  const doctorRun = (name, env) => r.cua(name, ['doctor', '--json'], {env, minutes: 5}).then(run => ({...run, report: readJson(run.out)}));
  const tracedDoctor = (name, env, facts) => r.cua(name, ['doctor', '--json'], {env, minutes: 10, traced: true, helper: facts.helper, homes: facts.homes}).then(run => ({...run, report: readJson(run.out)}));

  // The vendor selection's refusal, under one source (E3, U0): the open and doctor, each traced. `allowed` is the
  // override's version probe, the one exec of an engine either may make.
  async function refusedRow(cell, {what, env, home, expected, allowed = []}) {
    const facts = homeFacts(home);
    const open = await r.attemptOpen(`open-${what}`, {env, helper: facts.helper, homes: facts.homes});
    cell.runs.push(projectAttempt(`open under ${what}`, open));
    check(cell, `under ${what}, the open is refused ${expected.code} with the literal sentence and the hint`, refusedAsProblems(open, expected));
    check(cell, `under ${what}, the open executed ${allowed.length ? 'nothing of an engine, a worker, a helper or a host but the override\'s --version, once' : 'nothing of an engine, a worker, a helper or a host'}; nothing under runtimes/`,
      [...execRoleProblems(open.trace, {helper: facts.helper, command: 'serve', allowed}), ...(open.trace?.runtimes?.calls ? [`${open.trace.runtimes.calls} calls named a path under runtimes/`] : [])]);
    const doctor = await tracedDoctor(`doctor-${what}`, env, facts);
    cell.runs.push({what: `doctor under ${what}`, ...projectExec(doctor)});
    check(cell, `under ${what}, doctor's engine and repl.host rows fail with the sentence and the hint`, doctorRefusalProblems(doctor.report, expected));
    // Doctor's sandbox.userns probe runs bubblewrap on `true`, exactly so, once; no engine, helper, worker or host is
    // started, and no other bubblewrap.
    check(cell, `under ${what}, doctor executed ${allowed.length ? 'no engine, helper, worker or host but the override\'s --version, once' : 'no engine, helper, worker or host'}`,
      execRoleProblems(doctor.summary, {helper: facts.helper, command: 'doctor', allowed: [...allowed, USERNS_PROBE]}));
  }

  try {
    const display = process.env.DISPLAY ?? '';
    report.preconditions = {display, sandbox: process.env.CUA_SHIM_SANDBOX ?? '(unset: scoped)', engine: process.env.CUA_NATIVE_ENGINE ?? null};
    const problems = [];
    if (process.platform !== 'linux') problems.push(`this is ${process.platform}, not Linux`);
    if (!vendorName) problems.push(`no vendor release was ever placed for ${arch}`);
    const inherited = inheritedOverrides(process.env).filter(name => name !== 'CUA_SHIM_SANDBOX' && name !== 'CUA_NATIVE_ENGINE');
    if (inherited.length) problems.push(`runtime overrides are inherited (${inherited.join(', ')}): a counted run sets none`);
    if (process.env.CUA_SHIM_SANDBOX !== undefined) problems.push('CUA_SHIM_SANDBOX is set: these runs are scoped');
    if (!/^:\d+/.test(display) || /^:0(\.\d+)?$/.test(display)) problems.push(`the display ${JSON.stringify(display)} is not a private one`);
    if (process.env.CUA_NATIVE_ENGINE !== undefined) problems.push('CUA_NATIVE_ENGINE is set: the cells set it where they need it');
    if (process.env[FETCH_LOG] !== undefined) problems.push(`${FETCH_LOG} is set: the driver sets it for the installs it logs`);
    if (!process.env.CUA_HOME) problems.push('CUA_HOME is unset: the empty home is the one linux-runtime-env.sh makes');
    problems.push(...settingsHomeProblems({home: process.env.HOME && real(process.env.HOME), runDir: real(runDir), settingsExists: existsSync(settingsPath)}));
    for (const tool of ['strace', 'find', 'file']) if (spawnSync(tool, ['--version'], {encoding: 'utf8'}).error) problems.push(`${tool} is not installed`);
    const olderClean = spawnSync('git', ['-C', older, 'status', '--porcelain'], {encoding: 'utf8'});
    report.older.clean = olderClean.status === 0 && olderClean.stdout.trim() === '';
    if (report.older.commit !== APPROVED_OLDER) problems.push(`the older checkout is at ${report.older.commit ?? 'an unread commit'}, not the approved ${APPROVED_OLDER}`);
    if (!report.older.clean) problems.push(`the older checkout ${older} has local changes`);
    report.preconditions.problems = problems;
    if (problems.length) throw new Error(`preconditions: ${problems.join('; ')}`);
    settingsOwned = true;
    const environment = environmentVerdict(readDoctor({cli: CLI, env: process.env}).report);
    report.environment = environment;
    if (!environment.pass) throw new Error(`doctor's environment rows: ${environment.problems.join('; ')}`);

    // The upgraded home, installed by the cua before M6b under the fetch log, before anything else: its log is the
    // control, the U cells run over it, and a browser-only session of that cua there gives the by-name imports every
    // browser-only run is compared with.
    const uHome = join(runDir, 'upgraded', 'cua');
    if (existsSync(uHome)) throw new Error(`${uHome} already exists: the upgraded home must be fresh`);
    mkdirSync(dirname(uHome), {recursive: true});
    const uEnv = {...process.env, CUA_HOME: uHome};
    const olderCli = join(older, 'bin', 'cua.mjs');
    const setup = await r.cua('older-install', ['install'], {cli: olderCli, env: uEnv, minutes: 40, logged: true});
    const deb = olderDeb(older, vendorName);
    const control = controlProblems(setup.log, {deb});
    const olderDoctor = await r.cua('older-doctor', ['doctor', '--json'], {cli: olderCli, env: uEnv, minutes: 5});
    const vendorRow = readJson(olderDoctor.out)?.checks?.find(c => c.name === 'runtime.vendor') ?? null;
    // The tree's path as install and doctor name it: under the home's real path.
    const tree = join(real(uHome), 'runtimes', vendorName);
    const setupProblems = olderProblems({commit: report.older.commit, clean: report.older.clean, exit: setup.code, pointer: readPointer(uHome), release, vendorRelease: vendorName,
      recorded: recordedTree(uHome, vendorName).resolves, vendorRow});
    report.upgradedHome = {home: uHome, install: projectExec(setup), deb, control, vendorRow: vendorRow && {status: vendorRow.status, detail: vendorRow.detail}, problems: setupProblems};
    report.measured.olderInstall = {seconds: setup.seconds, bytesFetched: fetchedBytes(setup.log)};
    say(`the upgraded home: ${setupProblems.length ? `FAIL ${setupProblems.join('; ')}` : 'PASS'}; the control: ${control.length ? `FAIL ${control.join('; ')}` : 'PASS'}`);
    const olderBase = setup.code === 0 && existsSync(join(uHome, 'modules')) ? real(resolveRuntime({home: uHome}).root) : null;
    report.measured.importsOlder = olderBase ? await r.imports(olderCli, {env: uEnv, expectedBase: olderBase}) : {failed: `the older cua's install exited ${setup.code}, or placed no module tree`};
    baselineFile = join(scratch, 'imports-older.json');
    writeFileSync(baselineFile, `${JSON.stringify(report.measured.importsOlder.failed ? null : {base: report.measured.importsOlder.base, imported: report.measured.importsOlder.imported})}\n`);

    // E0's doctor, the reference for every later doctor's rows.
    let referenceDoctor = null;
    if (phases.includes('E')) {
      const home = process.env.CUA_HOME;
      const env = {...process.env};
      const facts0 = {helper: null, homes: [...new Set([home, real(home)])]};
      // E0
      let cell = cellOf('E0');
      const install = await r.cua('install', ['install'], {env, minutes: 25, logged: true, traced: true, helper: facts0.helper, homes: facts0.homes});
      cell.runs.push({what: 'cua install, logged and traced', ...projectExec(install)});
      const doctor = await doctorRun('doctor-E0', env);
      referenceDoctor = doctor.report;
      cell.runs.push({what: 'cua doctor --json', ...projectExec(doctor)});
      check(cell, 'cua install exits 0, the pointer is the derived name; doctor is ok, the runtime\'s rows pass, none of the vendor rows, the engine row the pin behind service cua',
        installProblems({exit: install.code, pointer: readPointer(home), release, doctor: doctor.report, pin, arch}),
        {rows: Object.fromEntries((doctor.report?.checks ?? []).map(c => [c.name, c.status]))});
      check(cell, 'the URLs the fetch log shows asked for are exactly this arch\'s pinned assets, each answered whole, none OpenAI\'s; the older cua\'s log, the control, holds the deb',
        [...fetchLogProblems(install.log, {expected: pinnedAssets(arch)}), ...control.map(p => `the control: ${p}`)]);
      check(cell, 'no ar and no xz was executed or looked up, by the install\'s whole trace', toolProblems(install.summary));
      check(cell, 'the home has no runtimes/, no line names a vendor release, doctor\'s retired is empty with no runtime.retired row',
        emptyHomeProblems({runtimes: lstatKind(join(home, 'runtimes')), out: [readText(install.out), readText(install.err)].every(t => t !== null) ? `${readText(install.out)}\n${readText(install.err)}` : null, doctor: doctor.report}));
      const file = spawnSync('file', ['-bL', linuxEnginePath(home)], {encoding: 'utf8'});
      check(cell, 'file -bL exits 0 and its linkage field says the engine is statically linked (item 9)', staticEngineProblems(file.error ? null : file), {file: file.stdout?.trim() ?? null});
      report.measured.E0 = {installSeconds: install.seconds, bytesFetched: fetchedBytes(install.log), urls: install.log?.length ?? null, doctorSeconds: doctor.seconds};
      const launcher = doctor.report?.checks?.find(c => c.name === 'sandbox.launcher')?.status === 'pass';
      finish(cell);
      if (!launcher) for (const id of ['E1', 'E2', 'E3']) notRun(id, 'sandbox.launcher does not pass in the empty home after E0');
      else {
        cell = cellOf('E1');
        boundary(cell, home, 'absent', 'start');
        await computerRuns(cell, {env, home, modes: [false, true]});
        boundary(cell, home, 'absent', 'end');
        finish(cell);

        cell = cellOf('E2');
        boundary(cell, home, 'absent', 'start');
        await browserRuns(cell, {env, home, traced: true});
        report.measured.importsHere = await r.imports(CLI, {env, expectedBase: real(resolveRuntime({home}).root)});
        await loaderRun(cell, {env, home});
        boundary(cell, home, 'absent', 'end');
        finish(cell);

        cell = cellOf('E3');
        try {
          // The override: cua's engine 0.4.4, fetched by the driver and checked against its published hash.
          const outdatedDir = join(runDir, 'outdated');
          mkdirSync(outdatedDir, {recursive: true});
          const outdated = join(outdatedDir, 'cua-engine');
          const asset = OUTDATED_ENGINE.assets[arch];
          let outdatedProblems = [];
          try {
            const response = await fetch(asset.url);
            const bytes = Buffer.from(await response.arrayBuffer());
            const sha256 = createHash('sha256').update(bytes).digest('hex');
            if (!response.ok || sha256 !== asset.sha256) outdatedProblems = [`${asset.url} answered ${response.status} with SHA-256 ${sha256}, not ${asset.sha256}`];
            else { writeFileSync(outdated, bytes); chmodSync(outdated, 0o755); }
          } catch (error) { outdatedProblems = [`${asset.url} could not be fetched: ${error.message}`]; }
          check(cell, `the override is cua's engine ${OUTDATED_ENGINE.version} as ${OUTDATED_ENGINE.release} published it`, outdatedProblems);
          const outdatedReal = real(outdated);
          const message = sources => retiredMessage({sources, settings: settingsPath, installer});
          const rows = [
            {what: 'CUA_NATIVE_ENGINE=vendor', env: {CUA_NATIVE_ENGINE: 'vendor'}, file: false, expected: {code: 'engine_retired', message: message(['variable']), hint: ENGINE_HINT_LITERAL}},
            {what: '"engine": "vendor" in engine.json', env: {}, file: true, expected: {code: 'engine_retired', message: message(['file']), hint: ENGINE_HINT_LITERAL}},
            {what: 'both', env: {CUA_NATIVE_ENGINE: 'vendor'}, file: true, expected: {code: 'engine_retired', message: message(['variable', 'file']), hint: ENGINE_HINT_LITERAL}},
            ...(outdatedProblems.length ? [] : [{what: `CUA_LINUX_ENGINE_BIN naming ${OUTDATED_ENGINE.version}`, env: {CUA_LINUX_ENGINE_BIN: outdated}, file: false,
              expected: {code: 'engine_outdated', message: outdatedOverrideMessage({path: outdated, version: OUTDATED_ENGINE.version, minimum: MIN_ENGINE_VERSION, installer}), hint: ENGINE_HINT_LITERAL},
              allowed: [{program: outdatedReal, argv: [outdatedReal, '--version']}]}]),
          ];
          for (const row of rows) {
            clearSettings();
            if (row.file) writeSettings('vendor');
            await refusedRow(cell, {what: row.what, env: {...env, ...row.env}, home, expected: row.expected, allowed: row.allowed});
          }
          clearSettings();
          await browserRuns(cell, {env: {...env, CUA_NATIVE_ENGINE: 'vendor'}, home, traced: false, label: 'the browser-only session with CUA_NATIVE_ENGINE=vendor'});
          const installed = await r.cua('install-vendor', ['install', '--json'], {env: {...env, CUA_NATIVE_ENGINE: 'vendor'}, minutes: 10});
          cell.runs.push({what: 'cua install --json under CUA_NATIVE_ENGINE=vendor', ...projectExec(installed)});
          check(cell, 'cua install under the variable exits nonzero with §2.2\'s sentence, no hint, every part placed',
            retiredInstallProblems({exit: installed.code, report: readJson(installed.out)}, {message: retiredMessage({sources: ['variable'], settings: settingsPath, installer, after: 'install'}), release}));
          await computerRuns(cell, {env, home, kinds: ['smoke']});
        } finally { clearSettings(); }
        finish(cell);
        if (sampleCount > 0) report.measured.firstAnswerHere = await r.firstAnswers(CLI, {env, n: sampleCount});
      }
    }

    if (phases.includes('U')) {
      const home = uHome;
      const env = uEnv;
      if (setupProblems.length) {
        for (const id of ['U0', 'U1', 'U2', 'U3', 'U4', 'U5']) notRun(id, `the upgraded home's setup: ${setupProblems.join('; ')}`);
      } else {
        const facts = homeFacts(home);
        // The tree as the driver reads it: its record (the driver's own read) and its size by find.
        const record = readJson(join(tree, 'install.json'));
        const expectedTree = {release: vendorName, path: tree, bytes: findBytes(tree), installedAt: record?.installedAt ?? null, source: record?.source ?? null};
        report.upgradedHome.tree = expectedTree;
        const runtimesDir = join(home, 'runtimes');
        const variable = {code: 'engine_retired', message: retiredMessage({sources: ['variable'], settings: settingsPath, installer}), hint: ENGINE_HINT_LITERAL};

        let cell = cellOf('U0');
        boundary(cell, home, 'present', 'start');
        const before0 = treeSnapshot(runtimesDir);
        await computerRuns(cell, {env, home, kinds: ['smoke'], modes: [true]});
        check(cell, 'the tree is whole after the default session: runtimes/ as before', snapshotProblems(before0, treeSnapshot(runtimesDir)));
        await refusedRow(cell, {what: 'CUA_NATIVE_ENGINE=vendor, its tree there', env: {...env, CUA_NATIVE_ENGINE: 'vendor'}, home, expected: variable});
        check(cell, 'runtimes/ as before after the refusals', snapshotProblems(before0, treeSnapshot(runtimesDir)));
        boundary(cell, home, 'present', 'end');
        finish(cell);

        cell = cellOf('U1');
        const doctor1 = await doctorRun('doctor-U1', env);
        cell.runs.push({what: 'cua doctor --json', ...projectExec(doctor1)});
        check(cell, 'doctor exits 0 with E0\'s rows and runtime.retired, a skip carrying the sentence, its retired the release with the driver\'s count and the record\'s date',
          [...(doctor1.code === 0 ? [] : [`doctor exited ${doctor1.code}`]), ...doctorRowsProblems(doctor1.report, {retired: expectedTree, reference: referenceDoctor})]);
        const traced1 = await tracedDoctor('doctor-U1-traced', env, facts);
        cell.runs.push({what: 'cua doctor --json, traced', ...projectExec(traced1)});
        check(cell, 'traced, doctor exits 0 with the same rows', [...(traced1.code === 0 ? [] : [`doctor exited ${traced1.code}`]), ...doctorRowsProblems(traced1.report, {retired: expectedTree, reference: referenceDoctor})]);
        check(cell, 'under runtimes/ the trace shows lstat, directory reads and one open of install.json, inside the two release names; nothing executed or written there',
          runtimesCallProblems(traced1.summary, {home: facts.homes, releases, command: 'doctor'}));
        report.measured.U1 = {doctorSeconds: doctor1.seconds, E0DoctorSeconds: report.measured.E0?.doctorSeconds ?? null};
        finish(cell);
        if (sampleCount > 0) report.measured.firstAnswerOlder = await r.firstAnswers(olderCli, {env, n: sampleCount});

        cell = cellOf('U2');
        mkdirSync(join(runtimesDir, ADDED.dir));
        writeFileSync(join(runtimesDir, ADDED.dir, 'note'), 'added by the acceptance driver\n');
        writeFileSync(join(runtimesDir, ADDED.file), 'added by the acceptance driver\n');
        const before2 = treeSnapshot(runtimesDir);
        const parts2 = partsSnapshot(home);
        // Both of install's modes from the same state: the plain run (its line), then `--json` (its exact fields), each
        // judged against the snapshots taken before either, so the second starts where the first did (fix wave 1).
        const install2 = await r.cua('install-U2', ['install'], {env, minutes: 15, logged: true, traced: true, helper: facts.helper, homes: facts.homes});
        cell.runs.push({what: 'cua install, logged and traced', ...projectExec(install2)});
        check(cell, 'cua install exits 0', install2.code === 0 ? [] : [`it exited ${install2.code ?? install2.signal}`]);
        check(cell, 'its line is §3.3\'s sentence, once, with U1\'s bytes; the two added entries are named nowhere',
          retiredLineProblems({out: readText(install2.out), err: readText(install2.err)}, {sentence: retiredSentence(expectedTree), unnamed: [ADDED.dir, ADDED.file]}));
        check(cell, 'nothing under runtimes/ changed: the listing, every file\'s hash and every mtime as before', snapshotProblems(before2, treeSnapshot(runtimesDir)));
        check(cell, 'the trace shows no unlink, rename, write or exec under runtimes/: lstat, directory reads and one open of install.json',
          runtimesCallProblems(install2.summary, {home: facts.homes, releases, command: 'install'}));
        check(cell, 'nothing was fetched, and every part is as it was on disk', [...noFetchProblems(install2.log), ...snapshotProblems(parts2, partsSnapshot(home)).map(p => `a part: ${p}`)]);
        const json2 = await r.cua('install-U2-json', ['install', '--json'], {env, minutes: 15, logged: true});
        cell.runs.push({what: 'cua install --json from the same state, logged', ...projectExec(json2)});
        check(cell, 'from the same state, --json: every part changed: false, retired the one release with U1\'s exact bytes, nothing fetched',
          [...reinstallProblems({exit: json2.code, report: readJson(json2.out)}, {retired: [expectedTree]}), ...noFetchProblems(json2.log)]);
        check(cell, 'and on disk after it: runtimes/ and every part as before U2', [...snapshotProblems(before2, treeSnapshot(runtimesDir)), ...snapshotProblems(parts2, partsSnapshot(home)).map(p => `a part: ${p}`)]);
        finish(cell);

        cell = cellOf('U3');
        const doctor3 = await doctorRun('doctor-U3', env);
        cell.runs.push({what: 'cua doctor --json', ...projectExec(doctor3)});
        check(cell, 'doctor as U1\'s', [...(doctor3.code === 0 ? [] : [`doctor exited ${doctor3.code}`]), ...doctorRowsProblems(doctor3.report, {retired: expectedTree, reference: referenceDoctor})]);
        await computerRuns(cell, {env, home});
        await browserRuns(cell, {env, home, traced: false});
        await loaderRun(cell, {env, home});
        const before3 = treeSnapshot(runtimesDir);
        const parts3 = partsSnapshot(home);
        const install3 = await r.cua('install-U3', ['install', '--json'], {env, minutes: 15, logged: true});
        cell.runs.push({what: 'cua install --json again, logged', ...projectExec(install3)});
        check(cell, 'the second install reports the same and changes nothing: every part changed: false, retired the one release with U1\'s bytes, nothing fetched',
          [...reinstallProblems({exit: install3.code, report: readJson(install3.out)}, {retired: [expectedTree]}), ...noFetchProblems(install3.log)]);
        check(cell, 'and on disk: runtimes/ and every part as before the second install', [...snapshotProblems(before3, treeSnapshot(runtimesDir)), ...snapshotProblems(parts3, partsSnapshot(home)).map(p => `a part: ${p}`)]);
        boundary(cell, home, 'present', 'end');
        finish(cell);

        // U4 and U5: a new home holding a copy of the release, its record changed or gone; neither install nor doctor
        // names it.
        for (const [id, alter] of [['U4', copy => {
          const file = join(copy, 'install.json');
          const text = readFileSync(file, 'utf8');
          const hash = /"sha256":\s*"([0-9a-f])/.exec(text);
          if (!hash) throw new Error(`${file} names no sha256`);
          writeFileSync(file, text.replace(`"sha256": "${hash[1]}`, `"sha256": "${hash[1] === '0' ? '1' : '0'}`).replace(`"sha256":"${hash[1]}`, `"sha256":"${hash[1] === '0' ? '1' : '0'}`));
        }], ['U5', copy => rmSync(join(copy, 'install.json'))]]) {
          cell = cellOf(id);
          const copyHome = join(runDir, 'copies', id, 'cua');
          const copy = join(copyHome, 'runtimes', vendorName);
          mkdirSync(dirname(copy), {recursive: true});
          cpSync(tree, copy, {recursive: true, preserveTimestamps: true, verbatimSymlinks: true});
          alter(copy);
          const recordKind = lstatKind(join(copy, 'install.json'));
          check(cell, id === 'U4' ? 'the copy\'s record differs from the original\'s by one hex digit of its hash' : 'the copy has no install.json',
            id === 'U4' ? (readText(join(copy, 'install.json')) !== readText(join(tree, 'install.json')) ? [] : ['the record is unchanged']) : (recordKind === 'ENOENT' ? [] : [`install.json is a ${recordKind}`]));
          const before = treeSnapshot(join(copyHome, 'runtimes'));
          const copyEnv = {...process.env, CUA_HOME: copyHome};
          const installed = await r.cua(`install-${id}`, ['install', '--json'], {env: copyEnv, minutes: 25});
          const doctor = await doctorRun(`doctor-${id}`, copyEnv);
          cell.runs.push({what: 'cua install --json', ...projectExec(installed)}, {what: 'cua doctor --json', ...projectExec(doctor)});
          const textOf = run => { const [out, err] = [readText(run.out), readText(run.err)]; return out === null || err === null ? null : `${out}\n${err}`; };
          check(cell, 'neither names it: both exit 0, install\'s retired empty, doctor with no runtime.retired row and retired empty, and neither output naming the release or the copy',
            notNamedProblems({install: {exit: installed.code, report: readJson(installed.out), text: textOf(installed)}, doctor: {exit: doctor.code, report: doctor.report, text: textOf(doctor)}},
              {names: [...new Set([vendorName, copy, real(copy)])]}));
          check(cell, 'the copy\'s listing and every file\'s hash as before', snapshotProblems(before, treeSnapshot(join(copyHome, 'runtimes'))));
          finish(cell);
        }
      }
    }
  } catch (error) {
    report.error = error.message;
    say(`stopped: ${error.message}`);
  } finally {
    clearSettings();
    report.finishedAt = new Date().toISOString();
    report.verdict = runVerdict({phases, cells: report.cells, error: report.error});
    writeFileSync(join(out, 'runtime.json'), `${JSON.stringify(report, null, 1)}\n`);
    for (const c of report.cells) say(`${c.cell} ${c.verdict?.pass ? 'PASS' : 'FAIL'}${c.verdict?.pass ? '' : `: ${c.verdict?.problems.join('; ')}`}`);
    say(`verdict: ${report.verdict.pass ? 'PASS' : 'FAIL'}${report.verdict.pass && !report.verdict.acceptance ? ' (a partial run: not acceptance 13)' : ''}`);
    // 0 only for acceptance 13 whole; a partial run that passed exits 3, so it is never read as acceptance.
    process.exitCode = report.verdict.acceptance ? 0 : report.verdict.pass ? 3 : 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`linux-runtime: ${error.stack ?? error}\n`); process.exitCode = 2; });
}
