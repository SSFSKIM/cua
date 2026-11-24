#!/usr/bin/env node
// Acceptance 12's driver (#171 M6a, T6; the M6a pre-flight §5.2): inside the environment linux-runtime-env.sh makes (a
// private Xvfb with Openbox, a private session bus, accessibility on, the run's own homes, the sandbox scoped), it runs
// the cells of ./linux-runtime-cells.mjs over two homes and judges each by its own criterion:
//   E  an empty home (the wrapper's CUA_HOME): E0 this cua's install, E1 the item 1 smoke (./linux-native.mjs
//      --selection default) and the item 6 witness (./linux-text.mjs), each plain and under `strace -f`, E2 the
//      browser-only session (./linux-browser-only.mjs) plain and traced and the profile map's loader, E3 both again with
//      runtimes/ moved out;
//   U  an upgraded home (<run>/upgraded/cua) installed by the cua before M6a (--older, a checkout of it): U0 refused at
//      this cua, U1 the older install again, U2 the command U0 printed, U3 and U5 the sessions with runtimes/ removed,
//      and with the pointer set back to the vendor name.
// Since #171 M6b (its T3) acceptance 12's vendor cells are out: E4 and U4 (the vendor selection refused) and E5 (the
// rollback onto the vendor's engine). The vendor's engine is retired on Linux; acceptance 13's E3 judges its refusal (T6).
// The vendor tree at a cell's boundary is read by plain lstat (recordedTree), never through the vendor selection's lookup.
// Around every fixture a 50 ms watch of its process tree (./linux-runtime-watch.mjs) says which engine answered. Before
// any cell doctor's four environment rows must pass, and after each home's install sandbox.launcher must pass, or no
// session cell starts there. The upgraded home is installed first, and a browser-only session of the older cua in it
// gives the by-name import outcomes every browser-only run here is compared with (the coordinator's ruling on F7). Measured, not judged: the module step's time and bytes, the tree's size, and the time from
// `cua serve`'s start to a first cell's answer, --samples in E against as many under the older cua in U.
//
//   node scripts/accept/linux-runtime.mjs --out <dir> --older <checkout> [--phases E,U] [--leg <label>] [--samples <n>]
//     writes <dir>/runtime.json (labels, outcomes, counts and scratch paths: the artifact) and exits 0 only when every
//     cell run passed. Every raw stream (each fixture's own report, doctor's and the installs' output, the strace files)
//     stays in <dir>/../scratch. It refuses to start with CUA_SHIM_SANDBOX set, with no
//     DISPLAY, or on display :0.
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {readPointer, writePointer} from '../../src/runtime/layout.mjs';
import {linuxEnginePath, loadEnginePin} from '../../src/runtime/linux-engine.mjs';
import {linuxRelease, loadLinuxRuntime, loadPins, ownInstaller, resolveRuntime, selectPin} from '../../src/runtime/manifest.mjs';
import {loadModuleProvenance, moduleHost} from '../../src/runtime/module-tree.mjs';
import {loadNodePins, managedNode, selectNodePin} from '../../src/runtime/managed-node.mjs';
import {HELPER_PIN_FILE, helperFor} from '../../src/sandbox/linux.mjs';
import {loadClassicLevel} from '../../src/profiles/directory-map.mjs';
import {APPROVED_OLDER, CELLS, boundaryProblems, engineRowProblems, fixtureProblems, inheritedOverrides, installProblems, launchedProblems, olderProblems, parsePhases, parseRefusal, pinsChanged,
  refusalProblems, reinstallProblems, rowProblems, runVerdict, traceProblems, upgradeProblems, witnessOf, initializeAnswered} from './linux-runtime-cells.mjs';
import {cuaEngineProblems, noEngineProblems, ownNodeProblems, startWatch} from './linux-runtime-watch.mjs';
import {environmentVerdict} from './linux-runtime-pilot.mjs';
import {summarizeTraceFile, TRACE_ARGS} from './linux-trace.mjs';
import {readDoctor} from './linux-selection.mjs';
import {baselineOf, cellJson, useCell} from './linux-browser-only.mjs';
import {openSession, resultText} from './mcp-session.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(REPO, 'bin', 'cua.mjs');
const FIXTURES = {
  smoke: [join(REPO, 'scripts', 'accept', 'linux-native.mjs'), '--selection', 'default'],
  witness: [join(REPO, 'scripts', 'accept', 'linux-text.mjs')],
  browser: [join(REPO, 'scripts', 'accept', 'linux-browser-only.mjs')],
};
// The identity each fixture's report must carry (linux-runtime-cells.mjs FIXTURE_STEPS).
const FIXTURE_ID = {smoke: 'linux-native', witness: 'linux-text', browser: 'linux-browser-only'};
const MINUTES = {plain: 12, traced: 25};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJson = file => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const real = path => { try { return realpathSync(path); } catch { return path; } };
const sha256File = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const fileIdentity = path => { try { const s = statSync(path); return {sha256: sha256File(path), ino: s.ino, mtimeMs: s.mtimeMs}; } catch { return null; } };
const gitHead = dir => spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).stdout?.trim() || null;
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

// ---- the profile map's loader (outside any session): `node linux-runtime.mjs --loader <home>` ------------------------

async function loader(home) {
  const runtime = resolveRuntime({home});
  const resolved = createRequire(join(runtime.paths.moduleDir, 'x.js')).resolve('classic-level');
  const ClassicLevel = loadClassicLevel(runtime.paths.moduleDir);
  const dir = mkdtempSync(join(tmpdir(), 'cua-m6a-loader-'));
  try {
    const db = new ClassicLevel(join(dir, 'store'), {keyEncoding: 'utf8', valueEncoding: 'utf8'});
    await db.open();
    await db.put('extensionInstanceId', JSON.stringify('m6a-loader'));
    const value = await db.get('extensionInstanceId');
    await db.close();
    const natives = readFileSync('/proc/self/maps', 'utf8').split('\n').map(l => l.trim().split(/\s+/).slice(5).join(' ')).filter(p => /classic-level.*\.node$/.test(p));
    process.stdout.write(`${JSON.stringify({root: runtime.root, resolved, readBack: value === JSON.stringify('m6a-loader'), natives: [...new Set(natives)]})}\n`);
  } finally { rmSync(dir, {recursive: true, force: true}); }
}

// ---- the vendor tree, by lstat ---------------------------------------------------------------------------------------

/**
 * Whether `home` holds the vendor release `release` as an install placed it, read by lstat alone and following no link:
 * runtimes/ and runtimes/<release> real directories, its install.json a regular file, its cua_node/ a directory ->
 * {resolves, why}, `why` the first thing that is not so.
 */
export function recordedTree(home, release) {
  const kind = path => { try { const s = lstatSync(path); return s.isSymbolicLink() ? 'link' : s.isDirectory() ? 'directory' : s.isFile() ? 'file' : 'other'; } catch (error) { return error.code ?? 'unreadable'; } };
  const root = join(home, 'runtimes', release ?? '');
  for (const [path, want] of [[join(home, 'runtimes'), 'directory'], [root, 'directory'], [join(root, 'install.json'), 'file'], [join(root, 'cua_node'), 'directory']]) {
    const found = kind(path);
    if (!release || found !== want) return {resolves: false, why: release ? `${path} is ${found}, not a ${want}` : 'no vendor release named'};
  }
  return {resolves: true, why: null};
}

// ---- the run ---------------------------------------------------------------------------------------------------------

function createRun({out, scratch}) {
  let n = 0;
  const label = name => `${String(++n).padStart(2, '0')}-${name}`;

  /** `command args` with its output to two files in scratch, each line's arrival time kept: {code, signal, seconds, out, err, lines}. */
  function exec(name, command, args, {env, minutes = 20}) {
    const id = label(name);
    const files = {out: join(scratch, `${id}.out`), err: join(scratch, `${id}.err`)};
    const started = Date.now();
    const lines = [];
    return new Promise(done => {
      const child = spawn(command, args, {cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe']});
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
        done({code, signal, seconds: Math.round((Date.now() - started) / 100) / 10, ...files, lines});
      });
    });
  }

  /**
   * A fixture (FIXTURES' `kind`), plain or under `strace -f`, with the process watch over its tree: {label, exit,
   * signal, seconds, report, watch, out, trace?: {file, summary}}. `watchPaths(report)` names the paths whose opening
   * the trace is read for.
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
      const watch = watchPaths?.(report) ?? null;
      result.trace = {file: files.trace, summary: existsSync(files.trace) ? await summarizeTraceFile(files.trace, {helper, home: homes, cwd: REPO, ...(watch ? {watch} : {})}) : null};
    }
    return result;
  }

  /**
   * An open of a computer session at this cua that is expected to be refused, its serve under `strace -f` so that
   * "nothing launched" rests on exec evidence (fix wave 1, #7): {exit, signal, replied, spontaneous, drained, stderr,
   * trace, err}. `replied` is any answer to initialize, an error included; `spontaneous` that serve exited on its own
   * within 60 s, before the driver ended it.
   */
  async function attemptOpen(name, {env, helper, homes}) {
    const id = label(name);
    const traceFile = join(scratch, `${id}.strace`);
    const session = openSession({command: 'strace', args: [...TRACE_ARGS, '-o', traceFile, '--', process.execPath, CLI, 'serve'], env, clientName: 'cua-m6a-refusal'});
    session.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'cua-m6a-refusal', version: '0'}}, 60_000);
    const spontaneous = await Promise.race([session.exited.then(() => true), sleep(60_000).then(() => false)]);
    const exited = await session.terminate();
    const drained = await session.drainStreams({budgetMs: 5000});
    // Whether initialize was answered is read from the whole transcript once stdout has drained, so a reply buffered at
    // the exit is still a reply (fix wave 2, #3).
    const replied = initializeAnswered(session.transcript);
    writeFileSync(join(scratch, `${id}.err`), session.stderr);
    const trace = existsSync(traceFile) ? await summarizeTraceFile(traceFile, {helper, home: homes, cwd: REPO}) : null;
    return {exit: exited.code, signal: exited.signal, replied, spontaneous, drained, stderr: session.stderr, trace, err: join(scratch, `${id}.err`), traceFile};
  }

  /** The time from `cua serve`'s start (`cli`) to a first cell's answer, `n` times. -> ms per sample, or the failure. */
  async function firstAnswers(cli, {env, n}) {
    const samples = [];
    for (let i = 0; i < n; i++) {
      const started = process.hrtime.bigint();
      const session = openSession({args: [cli, 'serve'], env, clientName: 'cua-m6a-measure'});
      try {
        await session.initialize();
        const answer = await session.js('nodeRepl.write("m6a")', 60_000);
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
    const session = openSession({args: [cli, 'serve'], env: {...env, CUA_SHIM_SURFACES: 'browser'}, clientName: 'cua-m6a-imports'});
    try {
      await session.initialize();
      const used = await session.js(useCell(), 180_000);
      const use = cellJson(resultText(used), 'use');
      const baseline = baselineOf({isError: used.result?.isError === true || !!used.error, timedOut: !!used.timedOut, use}, {expectedBase});
      return baseline.failed ? baseline : {...baseline, used: use.used, via: use.via, natives: use.natives?.length ?? null};
    } catch (error) { return {failed: error.message}; } finally { await session.terminate(); }
  }
  return {exec, fixture, attemptOpen, firstAnswers, imports, out, scratch};
}

// A fixture run as the artifact carries it: its label, outcome, timing, each step's name and status, and its raw report's
// scratch path; the watch's counts; a trace's summary without paths beyond the scratch file.
const projectRun = run => run && ({label: run.label, exit: run.exit, signal: run.signal, seconds: run.seconds, fixture: run.report?.fixture ?? null, status: run.report?.status ?? null,
  steps: (run.report?.steps ?? []).map(s => ({name: s.name, status: s.status})), report: run.out,
  ...(run.report?.imports?.comparison ? {imports: {comparison: run.report.imports.comparison}} : {}),
  ...(run.kind === 'browser' && run.report?.moduleRoot ? {witness: witnessOf(run.report, {root: real(run.report.moduleRoot),
    kernels: (run.trace?.summary?.kernels ?? []).filter(k => k.underServe && k.underHelper)})} : {}),
  // Each cua-engine the sampler saw, with its start time, and whether it was skipped as vanished between two reads.
  watch: run.watch && {samples: run.watch.samples, maxSkyLinux: run.watch.maxSkyLinux, engines: run.watch.engines.length, skyLinux: run.watch.skyLinux.length, replHost: run.watch.replHost.map(p => p.role),
    engineProcesses: run.watch.engineProcesses ?? []},
  ...(run.trace ? {trace: {file: run.trace.file, processes: run.trace.summary?.processes ?? null, serve: run.trace.summary?.serve ?? null, workers: run.trace.summary?.workers ?? null,
    helpers: run.trace.summary?.helpers ?? null, kernels: run.trace.summary?.kernels?.map(k => ({...k, opened: k.opened?.length})) ?? null, runtimes: run.trace.summary?.runtimes ?? null,
    launched: run.trace.summary?.launched?.map(l => l.kind) ?? null}} : {})});

async function main() {
  const option = name => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
  if (process.argv.includes('--loader')) return loader(option('--loader'));
  const out = option('--out');
  if (!out) throw new Error('usage: linux-runtime.mjs --out <dir> --older <checkout> [--phases E,U] [--leg <label>] [--samples <n>]');
  const phases = parsePhases(option('--phases'));
  const older = option('--older') ? resolve(option('--older')) : null;
  const sampleCount = Number(option('--samples') ?? 20);
  if (!older) throw new Error('--older <checkout of the cua before M6a> is needed: it installs the upgraded home, and its by-name imports are the browser-only runs\' baseline');
  mkdirSync(out, {recursive: true});
  const runDir = dirname(resolve(out));
  const scratch = join(runDir, 'scratch');
  mkdirSync(scratch, {recursive: true});
  const r = createRun({out, scratch});
  const arch = process.arch;
  const record = loadLinuxRuntime();
  const release = linuxRelease(record, arch);
  const installer = ownInstaller().command;
  const pin = loadEnginePin();
  // The vendor release this arch's install placed before M6b, by its pin's name: the tree the boundaries look for.
  const vendorName = selectPin(loadPins(), {platform: 'linux', arch}).release;
  const report = {driver: 'm6a-acceptance-12', leg: option('--leg') ?? null, arch, node: process.version, head: gitHead(REPO), release, installer,
    older: older && {path: older, commit: gitHead(older)}, phases, out: resolve(out), scratch, startedAt: new Date().toISOString(), cells: [], measured: {}};
  const say = line => process.stderr.write(`linux-runtime: ${line}\n`);

  // A cell's record, its checks appended as they are judged.
  const cellOf = id => { const cell = {...CELLS.find(c => c.cell === id), checks: [], runs: []}; report.cells.push(cell); say(`${id}: ${cell.step}`); return cell; };
  const check = (cell, name, problems, detail) => { cell.checks.push({name, pass: problems.length === 0, problems, ...(detail ? {detail} : {})}); say(`${cell.cell} ${problems.length ? 'FAIL' : 'PASS'} ${name}${problems.length ? `: ${problems.join('; ')}` : ''}`); return problems.length === 0; };
  const finish = cell => { cell.verdict = {pass: cell.checks.length > 0 && cell.checks.every(c => c.pass), problems: cell.checks.flatMap(c => c.problems.map(p => `${c.name}: ${p}`))}; };
  const notRun = (id, why) => { const cell = cellOf(id); cell.checks.push({name: 'not run', pass: false, problems: [why]}); finish(cell); };

  // The judged fixture runs every session cell shares.
  const homeFacts = home => {
    const node = managedNode(home).path ?? null;
    return {engine: real(linuxEnginePath(home)), helper: real(helperFor({home, arch}).path), homes: [...new Set([home, real(home)])], node: node && real(node), nodes: node ? [...new Set([node, real(node)])] : []};
  };
  // Every session run: the REPL host on the home's managed Node at every sample (fix wave 1, #8).
  const ownNode = (cell, what, run, facts) => check(cell, `${what}: the worker and the kernel ran on the home's managed Node at every sample`,
    facts.node ? ownNodeProblems(run.watch, {node: facts.node}) : ['the home has no managed Node']);
  async function computerRuns(cell, {env, home, traced}) {
    const facts = homeFacts(home);
    for (const kind of ['smoke', 'witness']) {
      for (const mode of traced ? [false, true] : [false]) {
        const run = await r.fixture(kind, {env, traced: mode, helper: facts.helper, homes: facts.homes});
        cell.runs.push(projectRun(run));
        const what = `${kind === 'smoke' ? 'the item 1 smoke' : 'the item 6 witness'}${mode ? ' under strace -f' : ''}`;
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
      const what = `${label}${mode ? ' under strace -f' : ''}`;
      check(cell, `${what}: every step passes (the six entries selected from the module tree, the imports as ruled, its natives mapped, confined)`, fixtureProblems(run, {fixture: FIXTURE_ID.browser}),
        {imports: run.report?.imports?.comparison ?? null});
      check(cell, `${what}: no engine process at any sample`, noEngineProblems(run.watch));
      ownNode(cell, what, run, facts);
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
  // A refused open as the artifact carries it.
  const attemptRecord = (label, a) => ({label, exit: a.exit, signal: a.signal, replied: a.replied, spontaneous: a.spontaneous, drained: a.drained, err: a.err, trace: a.traceFile,
    launched: a.trace?.launched?.map(l => l.kind) ?? null, runtimes: a.trace?.runtimes ?? null});
  // The vendor tree at a cell's boundary, read rather than taken from the cell's label (fix wave 1, #5): by lstat alone
  // (recordedTree), the vendor selection's own lookup being gone with that engine (#171 M6b).
  const boundary = (cell, home, expected, when) => {
    const {resolves, why} = recordedTree(home, vendorName);
    return check(cell, `the vendor tree is ${expected} at the cell's ${when}`, boundaryProblems({expected, exists: existsSync(join(home, 'runtimes')), resolves, why}));
  };
  const launcherPasses = (env, cell) => {
    const {report: doctor} = readDoctor({cli: CLI, env});
    return check(cell, 'sandbox.launcher passes after the install', rowProblems(doctor, ['sandbox.launcher']));
  };

  try {
    const display = process.env.DISPLAY ?? '';
    report.preconditions = {display, sandbox: process.env.CUA_SHIM_SANDBOX ?? '(unset: scoped)', engine: process.env.CUA_NATIVE_ENGINE ?? null};
    const problems = [];
    if (process.platform !== 'linux') problems.push(`this is ${process.platform}, not Linux`);
    const inherited = inheritedOverrides(process.env).filter(name => name !== 'CUA_SHIM_SANDBOX' && name !== 'CUA_NATIVE_ENGINE');
    if (inherited.length) problems.push(`runtime overrides are inherited (${inherited.join(', ')}): a counted run sets none`);
    if (process.env.CUA_SHIM_SANDBOX !== undefined) problems.push('CUA_SHIM_SANDBOX is set: these runs are scoped');
    if (!/^:\d+/.test(display) || /^:0(\.\d+)?$/.test(display)) problems.push(`the display ${JSON.stringify(display)} is not a private one`);
    if (process.env.CUA_NATIVE_ENGINE !== undefined) problems.push('CUA_NATIVE_ENGINE is set: the cells set it where they need it');
    if (!process.env.CUA_HOME) problems.push('CUA_HOME is unset: the empty home is the one linux-runtime-env.sh makes');
    const olderClean = spawnSync('git', ['-C', older, 'status', '--porcelain'], {encoding: 'utf8'});
    report.older.clean = olderClean.status === 0 && olderClean.stdout.trim() === '';
    if (report.older.commit !== APPROVED_OLDER) problems.push(`the older checkout is at ${report.older.commit ?? 'an unread commit'}, not the approved ${APPROVED_OLDER}`);
    if (!report.older.clean) problems.push(`the older checkout ${older} has local changes`);
    report.preconditions.problems = problems;
    if (problems.length) throw new Error(`preconditions: ${problems.join('; ')}`);
    const environment = environmentVerdict(readDoctor({cli: CLI, env: process.env}).report);
    report.environment = environment;
    if (!environment.pass) throw new Error(`doctor's environment rows: ${environment.problems.join('; ')}`);

    // The upgraded home, installed by the cua before M6a, before anything else: the U cells run over it, and a
    // browser-only session of that cua there gives the by-name imports every browser-only run is compared with.
    const uHome = join(runDir, 'upgraded', 'cua');
    if (existsSync(uHome)) throw new Error(`${uHome} already exists: the upgraded home must be fresh`);
    mkdirSync(dirname(uHome), {recursive: true});
    const uEnv = {...process.env, CUA_HOME: uHome};
    const olderCli = join(older, 'bin', 'cua.mjs');
    const setup = await r.exec('older-install', process.execPath, [olderCli, 'install'], {env: uEnv, minutes: 25});
    const vendorRelease = readPointer(uHome);
    const vendorRecordPath = vendorRelease ? join(uHome, 'runtimes', vendorRelease, 'install.json') : null;
    const vendorRecord = vendorRecordPath && fileIdentity(vendorRecordPath);
    const pinnedRelease = vendorName;
    const vendorRow = readDoctor({cli: CLI, env: uEnv}).report?.checks?.find(c => c.name === 'runtime.vendor') ?? null;
    const setupProblems = olderProblems({commit: report.older.commit, clean: report.older.clean, exit: setup.code, vendorRelease, pinnedRelease, vendorRow, record: vendorRecord});
    report.upgradedHome = {home: uHome, olderInstall: {exit: setup.code, seconds: setup.seconds, out: setup.out}, vendorRelease, pinnedRelease, vendorRow: vendorRow?.status ?? null, problems: setupProblems};
    // The older cua's kernel resolves from its vendor tree's module directory (cua_node/lib/node_modules, the pin's
    // layout), the base being that directory's parent, read by the path the older install placed it at.
    const olderLib = vendorRelease ? join(uHome, 'runtimes', vendorRelease, 'cua_node', 'lib') : null;
    const olderBase = olderLib && recordedTree(uHome, vendorRelease).resolves ? real(olderLib) : null;
    report.measured.importsOlder = setup.code === 0 && olderBase ? await r.imports(olderCli, {env: uEnv, expectedBase: olderBase})
      : {failed: `the older cua's install exited ${setup.code}${olderBase ? '' : ', and its vendor tree does not resolve'}`};
    baselineFile = join(scratch, 'imports-older.json');
    writeFileSync(baselineFile, `${JSON.stringify(report.measured.importsOlder.failed ? null : {base: report.measured.importsOlder.base, imported: report.measured.importsOlder.imported})}\n`);

    if (phases.includes('E')) {
      const home = process.env.CUA_HOME;
      const env = {...process.env};
      const runtimes = join(home, 'runtimes');
      const moved = join(runDir, 'moved-runtimes');
      // E0
      let cell = cellOf('E0');
      const install = await r.exec('install', process.execPath, [CLI, 'install'], {env, minutes: 25});
      const {report: doctor} = readDoctor({cli: CLI, env});
      check(cell, 'cua install exits 0, the pointer is the derived name, doctor passes the runtime\'s rows and the pinned engine', installProblems({exit: install.code, pointer: readPointer(home), release, doctor, pin, arch}),
        {exit: install.code, seconds: install.seconds, doctorOk: doctor?.ok ?? null, rows: Object.fromEntries((doctor?.checks ?? []).map(c => [c.name, c.status]))});
      const started = install.lines.find(l => /^installing cua's Linux runtime/.test(l.text))?.ms ?? 0;
      const placed = install.lines.find(l => /^installed cua's module tree at/.test(l.text))?.ms ?? null;
      const target = loadModuleProvenance().targets.find(t => t.platform === 'linux' && t.arch === arch && t.libc === moduleHost().libc);
      const root = existsSync(join(home, 'modules')) ? resolveRuntime({home}).root : null;
      report.measured.moduleStep = {seconds: placed === null ? null : Math.round((placed - started) / 100) / 10, tarballBytes: target?.packages.reduce((n, p) => n + p.length, 0) ?? null,
        packages: target?.packages.length ?? null, treeBytes: root ? Number(spawnSync('du', ['-sb', root], {encoding: 'utf8'}).stdout.split('\t')[0]) : null};
      const launcher = cell.checks[0].detail.rows?.['sandbox.launcher'] === 'pass';
      finish(cell);
      if (!launcher) for (const id of ['E1', 'E2', 'E3']) notRun(id, 'sandbox.launcher does not pass in the empty home after E0');
      else {
        cell = cellOf('E1');
        boundary(cell, home, 'present', 'start');
        await computerRuns(cell, {env, home, traced: true});
        boundary(cell, home, 'present', 'end');
        finish(cell);
        cell = cellOf('E2');
        boundary(cell, home, 'present', 'start');
        await browserRuns(cell, {env, home, traced: true});
        report.measured.importsHere = await r.imports(CLI, {env, expectedBase: real(resolveRuntime({home}).root)});
        await loaderRun(cell, {env, home});
        boundary(cell, home, 'present', 'end');
        finish(cell);
        cell = cellOf('E3');
        renameSync(runtimes, moved);
        boundary(cell, home, 'absent', 'start');
        await computerRuns(cell, {env, home, traced: false});
        await browserRuns(cell, {env, home, traced: false});
        await loaderRun(cell, {env, home});
        boundary(cell, home, 'absent', 'end');
        finish(cell);
        // the home as it was before E3
        renameSync(moved, runtimes);
        if (sampleCount > 0) report.measured.firstAnswerHere = await r.firstAnswers(CLI, {env, n: sampleCount});
      }
    }

    if (phases.includes('U')) {
      const home = uHome;
      const env = uEnv;
      if (setupProblems.length) {
        for (const id of ['U0', 'U1', 'U2', 'U3', 'U5']) notRun(id, `the upgraded home's setup: ${setupProblems.join('; ')}`);
      } else {
        const facts = homeFacts(home);
        let cell = cellOf('U0');
        boundary(cell, home, 'present', 'start');
        const u0 = await r.attemptOpen('open-upgraded', {env, helper: facts.helper, homes: facts.homes});
        cell.runs.push(attemptRecord('open at the head', u0));
        check(cell, 'the session at the head is refused runtime_not_installed, naming this cua\'s installer by absolute path and the derived release', refusalProblems(u0, {code: 'runtime_not_installed', installer, release}));
        check(cell, 'nothing is launched, by the serve\'s trace', launchedProblems(u0.trace));
        const same = fileIdentity(vendorRecordPath);
        const vendorNow = readDoctor({cli: CLI, env}).report?.checks?.find(c => c.name === 'runtime.vendor') ?? null;
        check(cell, 'the vendor tree is intact: its install.json the same file, the release resolving, and doctor\'s runtime.vendor passing',
          [...(same && same.sha256 === vendorRecord.sha256 && same.ino === vendorRecord.ino && same.mtimeMs === vendorRecord.mtimeMs ? [] : ['the vendor tree\'s install.json changed']),
            ...(vendorNow?.status === 'pass' ? [] : [`runtime.vendor is ${vendorNow?.status ?? 'missing'}`])]);
        const {report: doctorU0} = readDoctor({cli: CLI, env});
        const installed = doctorU0?.checks?.find(c => c.name === 'runtime.installed');
        check(cell, 'doctor says the same: runtime.installed fails naming the installer and the release',
          installed?.status !== 'fail' ? [`runtime.installed is ${installed?.status ?? 'missing'}`] : [installer, release].filter(word => !installed.detail.includes(word)).map(word => `runtime.installed does not name ${word}`));
        boundary(cell, home, 'present', 'end');
        finish(cell);

        cell = cellOf('U1');
        boundary(cell, home, 'present', 'start');
        const again = await r.exec('older-install-again', process.execPath, [olderCli, 'install', '--json'], {env, minutes: 25});
        check(cell, 'the older cua\'s install exits 0 with all four of its parts changed: false, builds no module tree and keeps the vendor record',
          reinstallProblems({exit: again.code, report: readJson(again.out), modules: existsSync(join(home, 'modules')), vendorRecord: {before: vendorRecord, after: fileIdentity(vendorRecordPath)}}), {report: again.out});
        const u1 = await r.attemptOpen('open-upgraded-again', {env, helper: facts.helper, homes: facts.homes});
        cell.runs.push(attemptRecord('open at the head', u1));
        const [a, b] = [parseRefusal(u0.stderr), parseRefusal(u1.stderr)];
        check(cell, 'the session at the head is refused as in U0, word for word', [...refusalProblems(u1, {code: 'runtime_not_installed', installer, release}),
          ...(a && b && a.message === b.message && a.code === b.code && a.hint === b.hint ? [] : ['its sentence is not U0\'s'])]);
        check(cell, 'nothing is launched, by the serve\'s trace', launchedProblems(u1.trace));
        boundary(cell, home, 'present', 'end');
        finish(cell);
        if (sampleCount > 0) report.measured.firstAnswerOlder = await r.firstAnswers(olderCli, {env, n: sampleCount});

        cell = cellOf('U2');
        boundary(cell, home, 'present', 'start');
        const printed = /`node (.+) install`/.exec(a?.hint ?? '')?.[1];
        const entry = printed?.startsWith('\'') ? printed.slice(1, -1).replaceAll('\'\\\'\'', '\'') : printed;
        const headPins = {helper: readFileSync(HELPER_PIN_FILE, 'utf8'), node: readFileSync(join(REPO, 'runtime', 'releases', 'node', `${selectNodePin(loadNodePins()).version}-linux-${arch}.json`), 'utf8'), engine: pin};
        const olderFile = path => (existsSync(path) ? readFileSync(path, 'utf8') : null);
        const olderPins = {helper: olderFile(join(older, 'runtime', 'sandbox', 'linux-sandbox.json')), node: olderFile(join(older, 'runtime', 'releases', 'node', `${selectNodePin(loadNodePins()).version}-linux-${arch}.json`)),
          engine: JSON.parse(olderFile(join(older, 'runtime', 'engine', 'linux-engine.json')) ?? 'null')};
        const expectChanged = pinsChanged({head: headPins, older: olderPins, arch});
        const upgraded = entry ? await r.exec('printed-install', process.execPath, [entry, 'install', '--json'], {env, minutes: 25}) : null;
        cell.runs.push({label: 'the printed command, --json', command: printed ? `node ${printed} install --json` : null, exit: upgraded?.code ?? null, out: upgraded?.out ?? null, expectChanged});
        check(cell, 'the printed command migrates the pointer, places the tree, leaves the shared parts and the vendor tree\'s install.json as they were',
          !upgraded ? ['U0 printed no command'] : entry !== CLI ? [`U0 printed ${entry}, not this cua's ${CLI}`]
            : upgradeProblems({exit: upgraded.code, report: readJson(upgraded.out), pointer: readPointer(home), vendorRelease, release, expectChanged, vendorRecord: {before: vendorRecord, after: fileIdentity(vendorRecordPath)}}));
        const launcher = launcherPasses(env, cell);
        boundary(cell, home, 'present', 'end');
        finish(cell);

        if (!launcher) for (const id of ['U3', 'U5']) notRun(id, 'sandbox.launcher does not pass in the upgraded home after U2');
        else {
          cell = cellOf('U3');
          rmSync(join(home, 'runtimes'), {recursive: true, force: true});
          boundary(cell, home, 'absent', 'start');
          await computerRuns(cell, {env, home, traced: false});
          await browserRuns(cell, {env, home, traced: false});
          await loaderRun(cell, {env, home});
          boundary(cell, home, 'absent', 'end');
          finish(cell);
          cell = cellOf('U5');
          boundary(cell, home, 'absent', 'start');
          writePointer(home, vendorRelease);
          check(cell, 'the pointer is set back to the vendor name', readPointer(home) === vendorRelease ? [] : [`the pointer names ${readPointer(home)}`]);
          await computerRuns(cell, {env, home, traced: false});
          await browserRuns(cell, {env, home, traced: false});
          await loaderRun(cell, {env, home});
          boundary(cell, home, 'absent', 'end');
          finish(cell);
        }
      }
    }
  } catch (error) {
    report.error = error.message;
    say(`stopped: ${error.message}`);
  } finally {
    report.finishedAt = new Date().toISOString();
    report.verdict = runVerdict({phases, cells: report.cells, error: report.error});
    writeFileSync(join(out, 'runtime.json'), `${JSON.stringify(report, null, 1)}\n`);
    for (const c of report.cells) say(`${c.cell} ${c.verdict?.pass ? 'PASS' : 'FAIL'}${c.verdict?.pass ? '' : `: ${c.verdict?.problems.join('; ')}`}`);
    say(`verdict: ${report.verdict.pass ? 'PASS' : 'FAIL'}${report.verdict.pass && !report.verdict.acceptance ? ' (a partial run: not acceptance 12)' : ''}`);
    // 0 only for acceptance 12 whole; a partial run that passed exits 3, so it is never read as acceptance.
    process.exitCode = report.verdict.acceptance ? 0 : report.verdict.pass ? 3 : 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`linux-runtime: ${error.stack ?? error}\n`); process.exitCode = 2; });
}
