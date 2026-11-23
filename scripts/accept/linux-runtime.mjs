#!/usr/bin/env node
// Acceptance 12's driver (#171 M6a, T6; the M6a pre-flight §5.2): inside the environment linux-runtime-env.sh makes (a
// private Xvfb with Openbox, a private session bus, accessibility on, the run's own homes, the sandbox scoped), it runs
// the cells of ./linux-runtime-cells.mjs over two homes and judges each by its own criterion:
//   E  an empty home (the wrapper's CUA_HOME): E0 this cua's install, E1 the item 1 smoke (./linux-native.mjs
//      --selection default) and the item 6 witness (./linux-text.mjs), each plain and under `strace -f`, E2 the
//      browser-only session (./linux-browser-only.mjs) plain and traced and the profile map's loader, E3 both again with
//      runtimes/ moved out, E4 the vendor selection refused (by the variable, by engine.json) while a browser-only
//      session with the variable passes, E5 the rollback with runtimes/ moved back (./linux-text.mjs --read-only);
//   U  an upgraded home (<run>/upgraded/cua) installed by the cua before M6a (--older, a checkout of it): U0 refused at
//      this cua, U1 the older install again, U2 the command U0 printed, U3 to U5 the sessions with runtimes/ removed,
//      the vendor selection refused, and the pointer set back to the vendor name.
// Around every fixture a 50 ms watch of its process tree (./linux-runtime-watch.mjs) says which engine answered. Before
// any cell doctor's four environment rows must pass, and after each home's install sandbox.launcher must pass, or no
// session cell starts there. Measured, not judged: the module step's time and bytes, the tree's size, and the time from
// `cua serve`'s start to a first cell's answer, --samples in E against as many under the older cua in U.
//
//   node scripts/accept/linux-runtime.mjs --out <dir> [--older <checkout>] [--phases E,U] [--leg <label>] [--samples <n>]
//     writes <dir>/runtime.json (labels, outcomes, counts and scratch paths: the artifact) and exits 0 only when every
//     cell run passed. Every raw stream (each fixture's own report, doctor's and the installs' output, the strace files)
//     stays in <dir>/../scratch. --older is needed for U. It refuses to start with CUA_SHIM_SANDBOX set, with no
//     DISPLAY, or on display :0.
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {engineSettingsPath} from '../../src/runtime/engine-sign.mjs';
import {readPointer, writePointer} from '../../src/runtime/layout.mjs';
import {linuxEnginePath, loadEnginePin} from '../../src/runtime/linux-engine.mjs';
import {linuxRelease, loadLinuxRuntime, ownInstaller, resolveRuntime, vendorLinuxRuntime} from '../../src/runtime/manifest.mjs';
import {loadModuleProvenance, moduleHost} from '../../src/runtime/module-tree.mjs';
import {loadNodePins, selectNodePin} from '../../src/runtime/managed-node.mjs';
import {HELPER_PIN_FILE, helperFor} from '../../src/sandbox/linux.mjs';
import {loadClassicLevel} from '../../src/profiles/directory-map.mjs';
import {CELLS, engineRowProblems, fixtureProblems, installProblems, parseRefusal, pinsChanged, refusalProblems, rowProblems, traceProblems, upgradeProblems} from './linux-runtime-cells.mjs';
import {cuaEngineProblems, noEngineProblems, nothingLaunchedProblems, startWatch, vendorEngineProblems} from './linux-runtime-watch.mjs';
import {environmentVerdict} from './linux-runtime-pilot.mjs';
import {summarizeTraceFile, TRACE_ARGS} from './linux-trace.mjs';
import {readDoctor} from './linux-selection.mjs';
import {cellJson, useCell} from './linux-browser-only.mjs';
import {openSession, resultText} from './mcp-session.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(REPO, 'bin', 'cua.mjs');
const FIXTURES = {
  smoke: [join(REPO, 'scripts', 'accept', 'linux-native.mjs'), '--selection', 'default'],
  witness: [join(REPO, 'scripts', 'accept', 'linux-text.mjs')],
  rollback: [join(REPO, 'scripts', 'accept', 'linux-text.mjs'), '--read-only'],
  browser: [join(REPO, 'scripts', 'accept', 'linux-browser-only.mjs')],
};
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
  async function fixture(kind, {env, traced = false, helper, homes, watchPaths}) {
    const id = label(`${kind}${traced ? '-traced' : ''}`);
    const files = {out: join(scratch, `${id}.out`), err: join(scratch, `${id}.err`), trace: join(scratch, `${id}.strace`)};
    const [script, ...args] = FIXTURES[kind];
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
    const result = {label: id, exit: code, signal, seconds: Math.round((Date.now() - started) / 100) / 10, report, watch, out: files.out};
    if (traced) {
      const watch = watchPaths?.(report) ?? null;
      result.trace = {file: files.trace, summary: existsSync(files.trace) ? await summarizeTraceFile(files.trace, {helper, home: homes, cwd: REPO, ...(watch ? {watch} : {})}) : null};
    }
    return result;
  }

  /** An open of a computer session at this cua that is expected to be refused, under the watch: {exit, initialized, stderr, watch}. */
  async function attemptOpen(name, {env}) {
    const id = label(name);
    const session = openSession({args: [CLI, 'serve'], env, clientName: 'cua-m6a-refusal'});
    const watching = startWatch(session.pid);
    const initialized = await Promise.race([session.initialize().then(() => true, () => false), session.exited.then(() => false)]);
    const exited = await session.terminate();
    await sleep(100);
    const watch = watching.stop();
    writeFileSync(join(scratch, `${id}.err`), session.stderr);
    return {exit: exited.code, signal: exited.signal, initialized, stderr: session.stderr, watch, err: join(scratch, `${id}.err`)};
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
  /** The six imports by name, and the native uses, in a browser-only session of `cli`'s serve (useCell): its `use`. */
  async function imports(cli, {env}) {
    const session = openSession({args: [cli, 'serve'], env: {...env, CUA_SHIM_SURFACES: 'browser'}, clientName: 'cua-m6a-imports'});
    try {
      await session.initialize();
      const used = await session.js(useCell(), 180_000);
      const use = cellJson(resultText(used), 'use');
      return use ? {imported: use.imported, used: use.used, via: use.via, natives: use.natives?.length ?? null} : {failed: resultText(used).slice(0, 300)};
    } catch (error) { return {failed: error.message}; } finally { await session.terminate(); }
  }
  return {exec, fixture, attemptOpen, firstAnswers, imports, out, scratch};
}

// A fixture run as the artifact carries it: its label, outcome, timing, each step's name and status, and its raw report's
// scratch path; the watch's counts; a trace's summary without paths beyond the scratch file.
const projectRun = run => run && ({label: run.label, exit: run.exit, signal: run.signal, seconds: run.seconds, status: run.report?.status ?? null,
  steps: (run.report?.steps ?? []).map(s => ({name: s.name, status: s.status})), report: run.out,
  watch: run.watch && {samples: run.watch.samples, maxSkyLinux: run.watch.maxSkyLinux, engines: run.watch.engines.length, skyLinux: run.watch.skyLinux.length, replHost: run.watch.replHost.map(p => p.role)},
  ...(run.trace ? {trace: {file: run.trace.file, processes: run.trace.summary?.processes ?? null, serve: run.trace.summary?.serve ?? null, workers: run.trace.summary?.workers ?? null,
    helpers: run.trace.summary?.helpers ?? null, kernels: run.trace.summary?.kernels?.map(k => ({...k, opened: k.opened?.length})) ?? null, runtimes: run.trace.summary?.runtimes ?? null}} : {})});

async function main() {
  const option = name => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
  if (process.argv.includes('--loader')) return loader(option('--loader'));
  const out = option('--out');
  if (!out) throw new Error('usage: linux-runtime.mjs --out <dir> [--older <checkout>] [--phases E,U] [--leg <label>] [--samples <n>]');
  const phases = (option('--phases') ?? 'E,U').split(',');
  const older = option('--older') ? resolve(option('--older')) : null;
  const sampleCount = Number(option('--samples') ?? 20);
  if (phases.includes('U') && !older) throw new Error('--older <checkout of the cua before M6a> is needed for the upgraded home\'s cells');
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
  const report = {driver: 'm6a-acceptance-12', leg: option('--leg') ?? null, arch, node: process.version, head: gitHead(REPO), release, installer,
    older: older && {path: older, commit: gitHead(older)}, phases, out: resolve(out), scratch, startedAt: new Date().toISOString(), cells: [], measured: {}};
  const say = line => process.stderr.write(`linux-runtime: ${line}\n`);

  // A cell's record, its checks appended as they are judged.
  const cellOf = id => { const cell = {...CELLS.find(c => c.cell === id), checks: [], runs: []}; report.cells.push(cell); say(`${id}: ${cell.step}`); return cell; };
  const check = (cell, name, problems, detail) => { cell.checks.push({name, pass: problems.length === 0, problems, ...(detail ? {detail} : {})}); say(`${cell.cell} ${problems.length ? 'FAIL' : 'PASS'} ${name}${problems.length ? `: ${problems.join('; ')}` : ''}`); return problems.length === 0; };
  const finish = cell => { cell.verdict = {pass: cell.checks.length > 0 && cell.checks.every(c => c.pass), problems: cell.checks.flatMap(c => c.problems.map(p => `${c.name}: ${p}`))}; };
  const notRun = (id, why) => { const cell = cellOf(id); cell.checks.push({name: 'not run', pass: false, problems: [why]}); finish(cell); };

  // The judged fixture runs every session cell shares.
  const homeFacts = home => ({engine: real(linuxEnginePath(home)), helper: real(helperFor({home, arch}).path), homes: [...new Set([home, real(home)])]});
  async function computerRuns(cell, {env, home, traced}) {
    const facts = homeFacts(home);
    for (const kind of ['smoke', 'witness']) {
      for (const mode of traced ? [false, true] : [false]) {
        const run = await r.fixture(kind, {env, traced: mode, helper: facts.helper, homes: facts.homes});
        cell.runs.push(projectRun(run));
        const what = `${kind === 'smoke' ? 'the item 1 smoke' : 'the item 6 witness'}${mode ? ' under strace -f' : ''}`;
        check(cell, `${what}: every step passes`, fixtureProblems(run));
        check(cell, `${what}: no sky_linux at any sample, the engine child the home's cua-engine`, cuaEngineProblems(run.watch, {engine: facts.engine}));
        if (mode) check(cell, `${what}: the trace holds the kernel and the worker, and the serve's tree named nothing under runtimes/`,
          run.trace.summary ? traceProblems(run.trace.summary) : ['strace wrote no trace']);
      }
    }
  }
  const selectedPaths = rep => { const s = Object.values(rep?.imports?.selected ?? {}).filter(p => typeof p === 'string'); return [...new Set([...s, ...s.map(real)])]; };
  async function browserRuns(cell, {env, home, traced, label = 'the browser-only session'}) {
    const facts = homeFacts(home);
    for (const mode of traced ? [false, true] : [false]) {
      const run = await r.fixture('browser', {env, traced: mode, helper: facts.helper, homes: facts.homes, watchPaths: selectedPaths});
      cell.runs.push(projectRun(run));
      const what = `${label}${mode ? ' under strace -f' : ''}`;
      check(cell, `${what}: every step passes (the six entries selected from the module tree, its natives mapped, confined)`, fixtureProblems(run));
      check(cell, `${what}: no engine process at any sample`, noEngineProblems(run.watch));
      if (mode) {
        const opened = Object.values(run.report?.imports?.selected ?? {}).filter(p => typeof p === 'string').map(real);
        check(cell, `${what}: the kernel opened each selected entry, and the serve's tree named nothing under runtimes/`,
          !run.trace.summary ? ['strace wrote no trace'] : opened.length !== 6 ? [`the fixture reported ${opened.length} selected entries, not 6`] : traceProblems(run.trace.summary, {opened}));
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
  // E4 and U4: the vendor selection refused with the tree absent, by the variable and by engine.json; a browser-only
  // session with the variable set still passes.
  async function vendorRefused(cell, {env, home}) {
    const settings = engineSettingsPath(env);
    const kept = existsSync(settings) ? readFileSync(settings, 'utf8') : null;
    for (const [by, sessionEnv] of [['CUA_NATIVE_ENGINE=vendor', {...env, CUA_NATIVE_ENGINE: 'vendor'}], ['"engine": "vendor" in engine.json', env]]) {
      if (sessionEnv === env) { mkdirSync(dirname(settings), {recursive: true}); writeFileSync(settings, `${JSON.stringify({...(kept ? JSON.parse(kept) : {}), engine: 'vendor'})}\n`); }
      try {
        const attempt = await r.attemptOpen(`open-vendor-${sessionEnv === env ? 'settings' : 'env'}`, {env: sessionEnv});
        cell.runs.push({label: `open with ${by}`, exit: attempt.exit, initialized: attempt.initialized, err: attempt.err, watch: {samples: attempt.watch.samples, replHost: attempt.watch.replHost.length}});
        check(cell, `with ${by}: the open is refused engine_not_installed, naming the installer`, refusalProblems(attempt, {code: 'engine_not_installed', installer}));
        check(cell, `with ${by}: nothing is launched`, nothingLaunchedProblems(attempt.watch));
        const {report: doctor} = readDoctor({cli: CLI, env: sessionEnv});
        const row = doctor?.checks?.find(c => c.name === 'engine');
        const refusal = parseRefusal(attempt.stderr);
        check(cell, `with ${by}: doctor's engine row fails with the sentence`,
          row?.status !== 'fail' ? [`the engine row is ${row?.status ?? 'missing'}`] : refusal && !row.detail.includes(refusal.message) ? ['the engine row does not carry the refusal\'s sentence'] : []);
      } finally {
        if (sessionEnv === env) { if (kept === null) rmSync(settings, {force: true}); else writeFileSync(settings, kept); }
      }
    }
    await browserRuns(cell, {env: {...env, CUA_NATIVE_ENGINE: 'vendor'}, home, traced: false, label: 'a browser-only session with CUA_NATIVE_ENGINE=vendor'});
  }
  const launcherPasses = (env, cell) => {
    const {report: doctor} = readDoctor({cli: CLI, env});
    return check(cell, 'sandbox.launcher passes after the install', rowProblems(doctor, ['sandbox.launcher']));
  };

  try {
    const display = process.env.DISPLAY ?? '';
    report.preconditions = {display, sandbox: process.env.CUA_SHIM_SANDBOX ?? '(unset: scoped)', engine: process.env.CUA_NATIVE_ENGINE ?? null};
    const problems = [];
    if (process.platform !== 'linux') problems.push(`this is ${process.platform}, not Linux`);
    if (process.env.CUA_SHIM_SANDBOX !== undefined) problems.push('CUA_SHIM_SANDBOX is set: these runs are scoped');
    if (!/^:\d+/.test(display) || /^:0(\.\d+)?$/.test(display)) problems.push(`the display ${JSON.stringify(display)} is not a private one`);
    if (process.env.CUA_NATIVE_ENGINE !== undefined) problems.push('CUA_NATIVE_ENGINE is set: the cells set it where they need it');
    if (!process.env.CUA_HOME) problems.push('CUA_HOME is unset: the empty home is the one linux-runtime-env.sh makes');
    report.preconditions.problems = problems;
    if (problems.length) throw new Error(`preconditions: ${problems.join('; ')}`);
    const environment = environmentVerdict(readDoctor({cli: CLI, env: process.env}).report);
    report.environment = environment;
    if (!environment.pass) throw new Error(`doctor's environment rows: ${environment.problems.join('; ')}`);

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
      if (!launcher) for (const id of ['E1', 'E2', 'E3', 'E4', 'E5']) notRun(id, 'sandbox.launcher does not pass in the empty home after E0');
      else {
        cell = cellOf('E1');
        await computerRuns(cell, {env, home, traced: true});
        finish(cell);
        cell = cellOf('E2');
        await browserRuns(cell, {env, home, traced: true});
        report.measured.importsHere = await r.imports(CLI, {env});
        await loaderRun(cell, {env, home});
        finish(cell);
        cell = cellOf('E3');
        renameSync(runtimes, moved);
        check(cell, 'runtimes/ is moved out of the home', existsSync(runtimes) ? ['runtimes/ is still there'] : []);
        await computerRuns(cell, {env, home, traced: false});
        await browserRuns(cell, {env, home, traced: false});
        finish(cell);
        cell = cellOf('E4');
        await vendorRefused(cell, {env, home});
        finish(cell);
        cell = cellOf('E5');
        renameSync(moved, runtimes);
        const vendor = vendorLinuxRuntime({home});
        const run = await r.fixture('rollback', {env: {...env, CUA_NATIVE_ENGINE: 'vendor'}});
        cell.runs.push(projectRun(run));
        check(cell, 'the vendor selection lists the apps, binds the harness gedit and reads its tree; a cell\'s import loads from the module tree', fixtureProblems(run));
        check(cell, 'the engine child is this home\'s sky_linux behind the vendor service, and no cua-engine runs',
          vendorEngineProblems(run.watch, {bin: real(vendor.paths.skyLinuxBin), service: vendor.paths.skyVendorService}));
        finish(cell);
        if (sampleCount > 0) report.measured.firstAnswerHere = await r.firstAnswers(CLI, {env, n: sampleCount});
      }
    }

    if (phases.includes('U')) {
      const home = join(runDir, 'upgraded', 'cua');
      if (existsSync(home)) throw new Error(`${home} already exists: the upgraded home must be fresh`);
      mkdirSync(dirname(home), {recursive: true});
      const env = {...process.env, CUA_HOME: home};
      const olderCli = join(older, 'bin', 'cua.mjs');
      const setup = await r.exec('older-install', process.execPath, [olderCli, 'install'], {env, minutes: 25});
      const vendorRelease = readPointer(home);
      const vendorRecordPath = vendorRelease ? join(home, 'runtimes', vendorRelease, 'install.json') : null;
      const vendorRecord = vendorRecordPath && fileIdentity(vendorRecordPath);
      report.upgradedHome = {home, olderInstall: {exit: setup.code, seconds: setup.seconds, out: setup.out}, vendorRelease};
      if (setup.code !== 0 || !vendorRecord) {
        for (const id of ['U0', 'U1', 'U2', 'U3', 'U4', 'U5']) notRun(id, `the older cua's install did not place a vendor release (exit ${setup.code}, pointer ${vendorRelease ?? 'none'})`);
      } else {
        let cell = cellOf('U0');
        const u0 = await r.attemptOpen('open-upgraded', {env});
        cell.runs.push({label: 'open at the head', exit: u0.exit, initialized: u0.initialized, err: u0.err});
        check(cell, 'the session at the head is refused runtime_not_installed, naming this cua\'s installer by absolute path and the derived release', refusalProblems(u0, {code: 'runtime_not_installed', installer, release}));
        check(cell, 'nothing is launched', nothingLaunchedProblems(u0.watch));
        const same = fileIdentity(vendorRecordPath);
        check(cell, 'the vendor tree is intact', same && same.sha256 === vendorRecord.sha256 && same.ino === vendorRecord.ino && same.mtimeMs === vendorRecord.mtimeMs ? [] : ['the vendor tree\'s install.json changed']);
        const {report: doctorU0} = readDoctor({cli: CLI, env});
        const installed = doctorU0?.checks?.find(c => c.name === 'runtime.installed');
        check(cell, 'doctor says the same: runtime.installed fails naming the installer and the release',
          installed?.status !== 'fail' ? [`runtime.installed is ${installed?.status ?? 'missing'}`] : [installer, release].filter(word => !installed.detail.includes(word)).map(word => `runtime.installed does not name ${word}`));
        finish(cell);

        cell = cellOf('U1');
        const again = await r.exec('older-install-again', process.execPath, [olderCli, 'install'], {env, minutes: 25});
        check(cell, 'the older cua\'s install exits 0 and builds nothing', [...(again.code === 0 ? [] : [`it exited ${again.code}`]), ...(existsSync(join(home, 'modules')) ? ['a modules/ directory is there'] : [])]);
        const u1 = await r.attemptOpen('open-upgraded-again', {env});
        cell.runs.push({label: 'open at the head', exit: u1.exit, initialized: u1.initialized, err: u1.err});
        const [a, b] = [parseRefusal(u0.stderr), parseRefusal(u1.stderr)];
        check(cell, 'the session at the head is refused as in U0, word for word', [...refusalProblems(u1, {code: 'runtime_not_installed', installer, release}),
          ...(a && b && a.message === b.message && a.code === b.code && a.hint === b.hint ? [] : ['its sentence is not U0\'s'])]);
        check(cell, 'nothing is launched from the vendor tree', nothingLaunchedProblems(u1.watch));
        finish(cell);
        if (sampleCount > 0) report.measured.firstAnswerOlder = await r.firstAnswers(olderCli, {env, n: sampleCount});
        // Beside E2's: the six imports by name under the cua before M6a, from the vendor tree.
        report.measured.importsOlder = await r.imports(olderCli, {env});

        cell = cellOf('U2');
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
        finish(cell);

        if (!launcher) for (const id of ['U3', 'U4', 'U5']) notRun(id, 'sandbox.launcher does not pass in the upgraded home after U2');
        else {
          cell = cellOf('U3');
          rmSync(join(home, 'runtimes'), {recursive: true, force: true});
          check(cell, 'runtimes/ is removed', existsSync(join(home, 'runtimes')) ? ['runtimes/ is still there'] : []);
          await computerRuns(cell, {env, home, traced: false});
          await browserRuns(cell, {env, home, traced: false});
          finish(cell);
          cell = cellOf('U4');
          await vendorRefused(cell, {env, home});
          finish(cell);
          cell = cellOf('U5');
          writePointer(home, vendorRelease);
          check(cell, 'the pointer is set back to the vendor name', readPointer(home) === vendorRelease ? [] : [`the pointer names ${readPointer(home)}`]);
          await computerRuns(cell, {env, home, traced: false});
          await browserRuns(cell, {env, home, traced: false});
          finish(cell);
        }
      }
    }
  } catch (error) {
    report.error = error.message;
    say(`stopped: ${error.message}`);
  } finally {
    report.finishedAt = new Date().toISOString();
    const expected = CELLS.filter(c => phases.includes(c.cell[0])).map(c => c.cell);
    const missing = expected.filter(id => !report.cells.some(c => c.cell === id));
    report.verdict = {pass: !report.error && missing.length === 0 && report.cells.every(c => c.verdict?.pass),
      cells: Object.fromEntries(report.cells.map(c => [c.cell, c.verdict?.pass ? 'PASS' : 'FAIL'])), missing, ...(report.error ? {error: report.error} : {})};
    writeFileSync(join(out, 'runtime.json'), `${JSON.stringify(report, null, 1)}\n`);
    for (const c of report.cells) say(`${c.cell} ${c.verdict?.pass ? 'PASS' : 'FAIL'}${c.verdict?.pass ? '' : `: ${c.verdict?.problems.join('; ')}`}`);
    say(`verdict: ${report.verdict.pass ? 'PASS' : 'FAIL'}`);
    process.exitCode = report.verdict.pass ? 0 : 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`linux-runtime: ${error.stack ?? error}\n`); process.exitCode = 2; });
}
