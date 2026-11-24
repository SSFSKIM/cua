// Acceptance 13's cells and their judges (#171 M6b, T6; the M6b pre-flight §5.2, the cell table), built on acceptance
// 12's (M6a). The driver (./linux-runtime.mjs) runs each cell's steps and hands what it observed to these judges; each
// returns its problems, none when the observation holds, and a missing record (no report, no trace, no log) is always a
// problem, never a pass. The process watch's judges are ./linux-runtime-watch.mjs's. The literals here (the refusals'
// sentences, the retired tree's sentence) are written from the pre-flight's §2 and §3.3, not taken from cua's code, so
// a sentence that drifts fails here.
import {createHash} from 'node:crypto';
import {lstatSync, readdirSync, readFileSync, readlinkSync} from 'node:fs';
import {basename, join, posix, relative, sep} from 'node:path';
import {RETIRED_RELEASES} from '../../src/runtime/retired-tree.mjs';
import {traceVerdict} from './linux-trace.mjs';

// The cua before M6b whose install makes the upgraded home: main's tip that the M6b branch starts from (0.4.5's merge,
// #585). Its install places cua's own runtime and the vendor's release, as every home updated from main holds them
// (F11). A counted run takes no other.
export const APPROVED_OLDER = '854103aa58b56521ba85afb4b392e1f3c5a8287d';
// The only vendor releases a cua install ever placed on Linux, by architecture: the U cells' tree. Their names are
// retired-tree.mjs's own constants (T2), which install and doctor report from; no pin and no provenance record is read.
export const VENDOR_RELEASES = Object.freeze(Object.fromEntries(['x64', 'arm64'].map(arch => [arch, Object.keys(RETIRED_RELEASES).find(name => name.endsWith(`-linux-${arch}`)) ?? null])));
/** The vendor release a cua install placed on a Linux machine of `arch` before M6b, by name; null for any other. */
export const vendorReleaseFor = arch => (Object.hasOwn(VENDOR_RELEASES, arch) ? VENDOR_RELEASES[arch] : null);
// The release that retired the vendor's engine on Linux, as every sentence below names it (ruling 1215's F1).
const RETIRED_IN = '0.30.0';
// The hint every Linux engine refusal carries (§2.1).
export const ENGINE_HINT_LITERAL = 'a `cua` from another checkout installs that checkout\'s engine, not this one\'s';
// E3's override: cua's engine 0.4.4, the release before the minimum, as linux-engine-v0.4.4 published it (the pin at
// 0d19fdfa, M6a's older cua). The driver fetches the arch's asset and checks it against this hash before it is named.
export const OUTDATED_ENGINE = Object.freeze({version: '0.4.4', release: 'linux-engine-v0.4.4', assets: Object.freeze({
  x64: Object.freeze({url: 'https://github.com/SSFSKIM/cua/releases/download/linux-engine-v0.4.4/cua-engine-0.4.4-linux-x64', sha256: 'eff8befcf591b937c3b019f32a2b9e36b47d126ffb12b1c187dc18519e4d67ca'}),
  arm64: Object.freeze({url: 'https://github.com/SSFSKIM/cua/releases/download/linux-engine-v0.4.4/cua-engine-0.4.4-linux-arm64', sha256: 'f54b2aeb8e00676a9f521410156c9bdd1b578e2308724013eef2eb6145c7da3e'}),
})});
// Doctor's rows of a vendor runtime, which no Linux doctor of this cua has (E0, U1).
export const FORBIDDEN_ROWS = Object.freeze(['runtime.vendor', 'runtime.files', 'runtime.vendor-manifest', 'runtime.ipc', 'runtime.signatures']);
const PHASES = ['E', 'U'];

/** The cells, in the pre-flight's order: the home each runs over, its state, its step, what passing means. */
export const CELLS = Object.freeze([
  {cell: 'E0', home: 'empty', state: '-', step: 'cua install at the head, under the fetch log and the trace', passing: 'exit 0; the parts placed and the pointer the derived name; the URLs asked exactly the arch\'s pinned assets, none OpenAI\'s; no ar and no xz executed; no runtimes/, retired empty, no line naming a vendor release; doctor ok with none of the vendor rows, its engine row the pin behind service cua; the engine statically linked'},
  {cell: 'E1', home: 'empty', state: '-', step: 'the item 1 smoke and the item 6 witness, plain and traced', passing: 'every step passes; no sky_linux at any sample; the engine child the home\'s cua-engine under the trusted worker; no traced call under runtimes/'},
  {cell: 'E2', home: 'empty', state: '-', step: 'the browser-only session, plain and traced; the profile map\'s loader', passing: 'as M6a\'s E2'},
  {cell: 'E3', home: 'empty', state: '-', step: 'a computer session under each source (the variable, engine.json, both, an override naming a 0.4.4 engine), doctor under each, a browser-only session with the variable, cua install under the variable, then a session with it unset', passing: 'each open refused with its source\'s sentence and the hint; under the vendor sources no exec of an engine, a worker, a helper or a host, under the override exactly one, its --version, per open and per doctor run; doctor\'s engine and repl.host rows fail with the sentence; the browser-only session passes; the install exits nonzero with §2.2\'s sentence, every part placed; unset, the session opens with no further install'},
  {cell: 'U0', home: 'upgraded', state: 'installed by the cua before M6b', step: 'at the head, before any install: the item 1 smoke, traced; then the vendor selection', passing: 'the default session passes with the tree present and whole, no traced call under runtimes/; the vendor selection refused as in E3'},
  {cell: 'U1', home: 'upgraded', state: '-', step: 'cua doctor --json, plain and traced', passing: 'exit 0; E0\'s rows and runtime.retired, a skip naming the release with the driver\'s count and the record\'s date; under runtimes/ only lstat, directory reads and one open of install.json, inside the two release names; nothing executed or written there'},
  {cell: 'U2', home: 'upgraded', state: 'a directory and a file of the run\'s added to runtimes/', step: 'cua install at the head, under the fetch log and the trace', passing: 'exit 0; the line §3.3\'s once; the added entries named nowhere; runtimes/ unchanged (listing, hashes, mtimes); no unlink, rename or write there; nothing fetched, every part as it was'},
  {cell: 'U3', home: 'upgraded', state: '-', step: 'doctor; E1 and E2, plain; cua install again', passing: 'doctor as U1\'s; the sessions pass; the second install reports the same and changes nothing'},
  {cell: 'U4', home: 'a copy', state: 'a new home holding a copy of U\'s release whose record has one digit of its hash changed', step: 'cua install; cua doctor', passing: 'neither names it: retired empty, no runtime.retired row; the copy as before'},
  {cell: 'U5', home: 'a copy', state: 'a new home holding a copy with no install.json', step: 'cua install; cua doctor', passing: 'neither names it: retired empty, no runtime.retired row; the copy as before'},
]);

/** `--phases`: E, U or both, each named once (the default both). Anything else is refused, never a selection of nothing. */
export function parsePhases(value) {
  if (value === undefined) return [...PHASES];
  const phases = String(value).split(',');
  if (!phases.length || phases.some(p => !PHASES.includes(p)) || new Set(phases).size !== phases.length)
    throw new Error(`--phases must name E, U or E,U, each once; ${JSON.stringify(value)} does not`);
  return phases;
}

/**
 * The run's verdict over its `cells` for the selected `phases`: it passes only when every expected cell ran and passed
 * and nothing stopped it; it is acceptance only when both homes ran (`scope` full), so a partial run that passes is never
 * read as acceptance 13.
 */
export function runVerdict({phases, cells, error}) {
  const expected = CELLS.filter(c => phases.includes(c.cell[0])).map(c => c.cell);
  const missing = expected.filter(id => !cells.some(c => c.cell === id));
  const pass = !error && expected.length > 0 && missing.length === 0 && cells.every(c => c.verdict?.pass);
  const scope = PHASES.every(p => phases.includes(p)) ? 'full' : 'partial';
  return {pass, scope, acceptance: pass && scope === 'full', cells: Object.fromEntries(cells.map(c => [c.cell, c.verdict?.pass ? 'PASS' : 'FAIL'])), missing, ...(error ? {error} : {})};
}

/**
 * Each fixture's identity (its report's `fixture`) and the steps it must have run and passed, in its own words. The item
 * 1 smoke is linux-native.mjs with --selection default (its selection steps are linux-selection.mjs's).
 */
export const FIXTURE_STEPS = Object.freeze({
  'linux-native': ['preconditions', 'the default mode: nothing selects an engine (no CUA_NATIVE_ENGINE, no "engine" in engine.json)', 'the default selects cua\'s engine (cua doctor --json)',
    'bind the fixture window by X11 id', 'type the marker and read it back from the accessibility tree', 'the kernel reads no private state and no store',
    'the kernel connects to nothing: the controls reach the X server, the bus and two listeners, the kernel is refused on each, under the pinned helper', 'screenshot of the window',
    'launch_app starts the application outside the sandbox (this PID namespace), and it outlives the call', 'end_task',
    'approvals: the fixture window\'s app and the launched entry\'s id, each asked once and accepted, nothing else asked', 'cua serve exited cleanly', 'no run entry left for the connection',
    'CUA_REPL_HOST=vendor is refused on Linux with a sentence'],
  'linux-text': ['preconditions: Linux, a private display, gedit', 'bind the harness gedit by X11 id', 'the field is found and read through the fixture\'s own accessibility reads',
    'typeText answers success, and the field holds acceptance 6\'s string exactly, once', 'end_task', 'approvals: the harness gedit\'s app asked once and accepted, nothing else asked',
    'cua serve exited cleanly', 'no run entry left for the connection'],
  'linux-browser-only': ['preconditions: Linux, a private display', 'the handshake and the tool list', 'the browser service answers: cua.listBrowsers gives a list',
    'the kernel\'s resolver selects each of the six entries in the module tree',
    'pixelmatch, pngjs, jpeg-js and classic-level import by name, playwright and sharp as under the cua before M6a; sharp (through require) resizes a pngjs image and classic-level writes and reads a key in the sandbox',
    'playwright loads through require from the module tree: its resolved entry and every file of the graph that require loaded',
    'the native files mapped are the module tree\'s: classic-level\'s, sharp\'s and libvips',
    'the kernel connects to nothing: the controls reach the X server, the bus and two listeners, the kernel is refused on each, under the pinned helper', 'end_task', 'cua serve exited cleanly',
    'no run entry left for the connection'],
});

/**
 * A fixture's run `{exit, signal, report}` as `fixture`'s: it exited 0, the report is that fixture's, every one of its
 * mandatory steps ran and passed, no other step failed, and its status is PASS. A status alone never passes.
 */
export function fixtureProblems({exit, signal, report}, {fixture}) {
  const problems = [];
  if (exit !== 0) problems.push(`it exited ${exit ?? signal}`);
  if (!report) return [...problems, 'it printed no report'];
  if (report.fixture !== fixture) problems.push(`its report is ${report.fixture ?? 'unnamed'}, not ${fixture}`);
  const steps = Array.isArray(report.steps) ? report.steps : [];
  for (const name of FIXTURE_STEPS[fixture] ?? []) {
    const step = steps.find(s => s.name === name);
    if (!step) problems.push(`did not run: ${name}`);
  }
  for (const s of steps) if (s.status !== 'PASS') problems.push(`${s.name} failed`);
  if (report.status !== 'PASS') problems.push(`its status is ${report.status}`);
  return problems;
}

// The variables that name a part of the runtime or how it launches (src/runtime/launch.mjs, the REPL host, the engine
// service): a counted run inherits none of them, so what it runs is what the home holds (fix wave 1, #8).
const OVERRIDES = ['CUA_NODE', 'CUA_LINUX_ENGINE_BIN', 'CUA_NATIVE_ENGINE', 'CUA_REPL_HOST', 'CUA_DESKTOP_MODE', 'CUA_SKY_SERVICE', 'CUA_ENGINE_BIN', 'CUA_ENGINE_APP', 'CUA_ENGINE_SCREENSHOTS',
  'CUA_SHIM_SANDBOX', 'CUA_SHIM_SURFACES', 'CUA_SHIM_PERSIST', 'CUA_SHIM_SECRETS', 'CUA_BROWSER_DEFAULT_INSTANCE', 'CUA_RUNTIME_IDLE_MS', 'NODE_OPTIONS', 'NODE_PATH'];
const OVERRIDE_PREFIXES = ['CUA_REPL_', 'CUA_SANDBOX_', 'OAI_', 'SKY_'];

/** The runtime overrides in `env` a counted run may not inherit, by name. */
export const inheritedOverrides = env => Object.keys(env).filter(name => OVERRIDES.includes(name) || OVERRIDE_PREFIXES.some(prefix => name.startsWith(prefix))).sort();

/** The vendor tree at a cell's boundary: `expected` present (there, and recorded as an install placed it) or absent. */
export function boundaryProblems({expected, exists, resolves, why}) {
  if (expected === 'absent') return exists ? ['runtimes/ is there'] : [];
  if (!exists) return ['runtimes/ is not there'];
  return resolves ? [] : [`the vendor tree does not resolve (${why ?? 'unread'})`];
}

/**
 * The upgraded home's setup: the older checkout is the approved commit with no local changes, its install exited 0, the
 * pointer names the derived release (the cua before M6b installs cua's own runtime), and it placed the vendor's release
 * with its install record (`recorded`), which the older cua's own doctor verifies (its runtime.vendor row).
 */
export function olderProblems({commit, clean, exit, pointer, release, vendorRelease, recorded, vendorRow}) {
  const problems = [];
  if (commit !== APPROVED_OLDER) problems.push(`the older checkout is at ${commit ?? 'an unread commit'}, which is not the approved ${APPROVED_OLDER}`);
  if (!clean) problems.push('the older checkout has local changes');
  if (exit !== 0) problems.push(`the older cua's install exited ${exit}`);
  if (pointer !== release) problems.push(`the pointer names ${pointer ?? 'nothing'}, not the derived ${release}`);
  if (!recorded) problems.push(`no recorded vendor release ${vendorRelease} in the home`);
  if (vendorRow?.status !== 'pass') problems.push(`the older cua's doctor's runtime.vendor is ${vendorRow ? `${vendorRow.status}: ${vendorRow.detail}` : 'missing'}`);
  return problems;
}

/**
 * A browser-only run's witnesses, kept relative to the module root (`root`) so its provenance can be read without the
 * raw trace: the selected entries, the mapped natives, playwright's loaded entry and graph, and each served kernel's
 * opens. A path outside the root stays absolute.
 */
export function witnessOf(report, {root, kernels = []}) {
  const rel = path => (typeof path === 'string' && path.startsWith(`${root}${sep}`) ? relative(root, path) : path);
  const pw = report?.imports?.loaded?.playwright;
  const files = Array.isArray(pw?.files) ? pw.files : [];
  return {
    root,
    selected: Object.fromEntries(Object.entries(report?.imports?.selected ?? {}).map(([spec, path]) => [spec, rel(path)])),
    natives: (report?.imports?.natives ?? []).map(rel),
    playwright: pw ? {entry: rel(pw.entry), files: files.length, outside: files.filter(f => rel(f) === f)} : null,
    ...(kernels.length ? {opened: kernels.filter(k => Array.isArray(k.opened)).map(k => ({pid: k.pid, paths: [...new Set(k.opened.map(rel))]}))} : {}),
  };
}

const rowOf = (doctor, name) => (doctor?.checks ?? []).find(c => c.name === name) ?? null;

/** Doctor's rows `names` each pass. */
export function rowProblems(doctor, names) {
  return names.flatMap(name => {
    const row = rowOf(doctor, name);
    return row?.status === 'pass' ? [] : [`${name} is ${row ? `${row.status}: ${row.detail}` : 'missing'}`];
  });
}

/** Doctor's engine row passes and reports the pinned engine (`pin`, its version and the arch's hash) behind service cua. */
export function engineRowProblems(doctor, {pin, arch}) {
  const row = rowOf(doctor, 'engine');
  if (!row) return ['doctor reports no engine row'];
  const problems = row.status === 'pass' ? [] : [`the engine row is ${row.status}: ${row.detail}`];
  const engine = doctor.engine ?? {};
  const installed = engine.installed ?? {};
  if (installed.version !== pin.version) problems.push(`the engine row reports engine ${installed.version ?? 'none'}, not the pinned ${pin.version}`);
  if (installed.sha256 !== pin.assets[arch]?.sha256) problems.push(`the engine's SHA-256 ${installed.sha256 ?? 'unread'} is not the pin's ${pin.assets[arch]?.sha256}`);
  if (engine.service !== 'cua') problems.push(`its service is ${engine.service ?? 'none'}, not cua`);
  return problems;
}

// Doctor's rows of a vendor runtime that are there.
const forbiddenRows = doctor => FORBIDDEN_ROWS.filter(name => rowOf(doctor, name)).map(name => `doctor has a row named ${name}`);

/**
 * E0: the install `exit`, the `pointer` against the derived `release`, and doctor after it: ok, the runtime's four rows
 * passing, none of the vendor rows, and the engine row the pin behind service cua.
 */
export function installProblems({exit, pointer, release, doctor, pin, arch}) {
  const problems = exit === 0 ? [] : [`cua install exited ${exit}`];
  if (pointer !== release) problems.push(`the pointer names ${pointer ?? 'nothing'}, not the derived ${release}`);
  if (!doctor) return [...problems, 'doctor printed no report'];
  if (doctor.ok !== true) problems.push('doctor is not ok');
  return [...problems, ...rowProblems(doctor, ['runtime.installed', 'runtime.modules', 'runtime.node', 'sandbox.launcher']), ...forbiddenRows(doctor), ...engineRowProblems(doctor, {pin, arch})];
}

// What names the vendor's release in an install's words.
const VENDOR_WORDS = /26\.928\.40906|vendor's release|\/runtimes\//;

/**
 * E0's home after its install: `runtimes` the kind lstat gave there (ENOENT expected), `out` the install's output, and
 * doctor's report: no line names a vendor release, doctor's `retired` is empty and it has no runtime.retired row.
 */
export function emptyHomeProblems({runtimes, out, doctor}) {
  const problems = runtimes === 'ENOENT' ? [] : [`runtimes/ is a ${runtimes}, not absent`];
  if (typeof out !== 'string') problems.push('the install printed no output');
  else for (const line of out.split('\n')) if (VENDOR_WORDS.test(line)) problems.push(`a line names a vendor release: ${line}`);
  if (!doctor) return [...problems, 'no doctor report'];
  if (rowOf(doctor, 'runtime.retired')) problems.push('doctor has a runtime.retired row');
  if (!Array.isArray(doctor.retired)) problems.push('doctor\'s retired is not a list');
  else if (doctor.retired.length) problems.push(`doctor's retired lists ${doctor.retired.length}, not none`);
  return problems;
}

/** Item 9: `file -bL` of the installed engine (`run` {status, stdout}) exits 0 and its linkage field is static. */
export function staticEngineProblems(run) {
  if (!run) return ['file did not run'];
  if (run.status !== 0) return [`file exited ${run.status}`];
  const text = String(run.stdout ?? '').trim();
  if (!text) return ['file said nothing of the engine'];
  // `file -b`'s description is comma-separated fields; the linkage is one of them, whole.
  return text.split(/,\s*/).some(field => field === 'statically linked' || field === 'static-pie linked') ? [] : [`the engine is not statically linked: ${text}`];
}

// ---- the fetch log (./fetch-log.mjs) ----

// A URL that is OpenAI's, or the vendor's package wherever it is served from.
const isOpenAI = url => {
  if (typeof url !== 'string') return false;
  try {
    const {hostname, pathname} = new URL(url);
    return /(^|\.)(openai\.com|oaistatic\.com|oaiusercontent\.com|chatgpt\.com)$/.test(hostname) || /\.deb$|chatgpt_/i.test(pathname);
  } catch { return false; }
};

/**
 * E0's fetch log (readFetchLog's entries) against `expected`, the arch's pinned assets [{url, length?}]: each asked for
 * exactly once, answered 200 and read whole, with its pinned length where it has one; no other URL asked; nothing asked
 * for or answering from OpenAI.
 */
export function fetchLogProblems(log, {expected}) {
  if (!Array.isArray(log)) return ['no fetch log'];
  if (!expected?.length) return ['the pinned assets are unknown'];
  const problems = [];
  for (const entry of log) {
    if (isOpenAI(entry.url)) problems.push(`${entry.url} was asked for, OpenAI's`);
    if (isOpenAI(entry.answered)) problems.push(`${entry.url} answered from ${entry.answered}, OpenAI's`);
    if (!expected.some(a => a.url === entry.url)) problems.push(`${entry.url} is no pinned asset`);
  }
  for (const asset of expected) {
    const asked = log.filter(e => e.url === asset.url);
    if (asked.length !== 1) { problems.push(asked.length ? `${asset.url} was asked for ${asked.length} times` : `${asset.url} was not asked for`); continue; }
    const [entry] = asked;
    if (entry.error) problems.push(`${asset.url} failed: ${entry.error}`);
    else if (entry.status !== 200) problems.push(`${asset.url} answered ${entry.status ?? 'nothing'}`);
    if (entry.complete !== true) problems.push(`${asset.url} was not read whole`);
    if (asset.length !== undefined && entry.bytes !== asset.length) problems.push(`${asset.url} gave ${entry.bytes} bytes, not its pinned ${asset.length}`);
  }
  return problems;
}

/**
 * The control: the older cua's install log under the same preload holds the vendor's deb (`deb` {url, length}, the older
 * checkout's own pin), asked for, answered 200 and read whole to its length. Without it the fetch log is no witness.
 */
export function controlProblems(log, {deb}) {
  if (!deb?.url) return ['the deb\'s URL is unknown'];
  if (!Array.isArray(log)) return ['no fetch log'];
  const entry = log.find(e => e.url === deb.url);
  if (!entry) return [`the log does not hold the deb ${deb.url}`];
  if (entry.status === null || entry.status === undefined) return [`the deb ${deb.url} was not answered${entry.error ? ` (${entry.error})` : ''}`];
  const problems = entry.status === 200 ? [] : [`the deb answered ${entry.status}`];
  if (entry.complete !== true) problems.push('the deb was not read whole');
  if (entry.bytes !== deb.length) problems.push(`the deb gave ${entry.bytes} bytes, not its ${deb.length}`);
  return problems;
}

/** Nothing fetched: a log that exists and holds no URL asked. */
export function noFetchProblems(log) {
  if (!Array.isArray(log)) return ['no fetch log'];
  return log.map(e => `the install asked for ${e.url}`);
}

// ---- the traces (./linux-trace.mjs's summary) ----

const processes = n => `${n} ${n === 1 ? 'process' : 'processes'}`;
const calls = n => `${n} ${n === 1 ? 'call' : 'calls'}`;
// Why the whole trace is not complete by the reader's rule.
function wholeProblems(whole) {
  if (whole?.complete === true) return [];
  const why = [!whole?.processes ? 'it holds no process' : null, whole?.unreadLines ? `${whole.unreadLines} ${whole.unreadLines === 1 ? 'line' : 'lines'} it could not read` : null,
    whole?.orphans ? `${whole.orphans} ${whole.orphans === 1 ? 'resumption' : 'resumptions'} of no call` : null,
    whole?.unresolved ? `${calls(whole.unresolved)} left a path unresolved` : null, whole?.pending ? `${calls(whole.pending)} unfinished at its end` : null,
    whole?.unended ? `${processes(whole.unended)} with no end` : null].filter(Boolean);
  return [`the trace is incomplete: ${why.length ? why.join(', ') : 'the reader did not call it complete'}`];
}

/**
 * Whether the trace is of `cua <command>`: its root, the first process's first exec, runs this cua's bin/cua.mjs with
 * `command` right after it. A trace of anything else, or of nothing, judges nothing.
 */
export function rootProblems(summary, {command}) {
  const argv = summary?.root?.argv;
  if (!Array.isArray(argv)) return ['the trace names no root command'];
  const at = argv.findIndex(arg => /(^|\/)bin\/cua\.mjs$/.test(arg));
  return at >= 0 && argv[at + 1] === command ? [] : [`the trace's root is ${argv.join(' ')}, not cua ${command}`];
}

// The checks every whole-trace judge starts with: a trace, of `cua <command>`, complete, with its execs and its calls.
function tracedCommand(summary, {command}) {
  if (!summary) return ['no trace'];
  const problems = [...rootProblems(summary, {command}), ...wholeProblems(summary.whole)];
  if (!Array.isArray(summary.execs)) problems.push('the trace lists no execs');
  if (!Array.isArray(summary.files)) problems.push('the trace lists no calls under runtimes/');
  return problems;
}

// The deb's tools: an install that runs, or looks for, any of them is unpacking a deb.
const DEB_TOOLS = new Set(['ar', 'xz', 'unxz', 'xzcat', 'xzdec', 'lzma', 'unlzma', 'dpkg', 'dpkg-deb']);

/**
 * E0: the trace is of `cua install`, whole, and holds no exec, done or looked up along PATH, of a deb's tool
 * (DEB_TOOLS); an exec whose executable is unread fails, as it could be one.
 */
export function toolProblems(summary, {command = 'install'} = {}) {
  const problems = tracedCommand(summary, {command});
  for (const e of Array.isArray(summary?.execs) ? summary.execs : []) {
    if (!e.program) problems.push(`process ${e.pid} ran an executable the trace does not name`);
    else if (DEB_TOOLS.has(basename(e.program))) problems.push(`${e.program} was ${e.ok ? 'executed' : 'looked up'}`);
  }
  return problems;
}

/**
 * The traced calls `cua <command>` made under `<home>/runtimes/` (U1 doctor, U2 install): the trace is of that command
 * and whole; every call there names runtimes/ itself or a path under one of `releases`; each is an lstat (runtimes/
 * itself takes nothing else), a read-only open of a directory, a stat of a descriptor so opened, or the one successful
 * open of a release's install.json, which happens exactly `recordOpens` times; nothing is executed, written, renamed or
 * removed there, and no other open is made, failed or not.
 */
export function runtimesCallProblems(summary, {home, releases, command, recordOpens = 1}) {
  const problems = tracedCommand(summary, {command});
  const roots = [home].flat().map(h => `${h.replace(/\/$/, '')}/runtimes`);
  let opens = 0;
  for (const call of Array.isArray(summary?.files) ? summary.files : []) {
    // A call names a path once, though strace shows it twice: as its argument and as the descriptor it returned.
    for (const path of new Set(call.paths)) {
      const root = roots.find(r => path === r || path.startsWith(`${r}/`));
      if (!root) continue;
      const rel = posix.relative(root, path);
      const [name] = rel.split('/');
      if (rel && !releases.includes(name)) { problems.push(`a call outside the two release names: ${call.kind} of ${path}`); continue; }
      const record = releases.some(release => rel === `${release}/install.json`);
      // A stat of a descriptor already opened (fstat) looks nothing up: the open was judged.
      if (call.kind === 'lstat' || (rel && (call.kind === 'opendir' || call.kind === 'fstat'))) continue;
      if (call.kind === 'open' && record) {
        // Only an open that returned a descriptor is the record's read; a failed one is not.
        if (call.ok === true) opens += 1;
        else problems.push(`an open of ${path} that ${call.ok === false ? 'failed' : 'did not finish'}`);
        continue;
      }
      problems.push(`${call.kind} of ${path}`);
    }
  }
  if (opens !== recordOpens) problems.push(`install.json was opened ${opens} times, not ${recordOpens === 1 ? 'once' : recordOpens}`);
  return problems;
}

// What a program an exec ran is, by role: an engine, the sandbox helper, bubblewrap, a REPL host process (by the
// script Node runs, its path absolute or relative; a Node whose arguments are unread counts too), anything under a
// runtimes/, or an executable the trace does not name; null for anything else (a shell, gzip, a probe).
const ROLE_SCRIPT = /(^|\/)src\/repl-host\/([\w-]+)\.mjs$/;
function roleOf(e, {helper}) {
  if (!e.program) return 'an unnamed executable';
  const program = e.program;
  if (/\/runtimes\//.test(program)) return 'runtimes';
  if (basename(program) === 'cua-engine' || /^sky_linux/.test(basename(program))) return 'engine';
  if (helper && program === helper) return 'helper';
  if (basename(program) === 'bwrap') return 'bwrap';
  if (/^node/.test(basename(program))) {
    // A Node whose arguments the trace did not print whole may be running the REPL host: it is never passed unread.
    if (!Array.isArray(e.argv)) return 'node with unread arguments';
    for (const arg of e.argv) { const role = ROLE_SCRIPT.exec(arg)?.[2]; if (role) return role; }
  }
  return null;
}
const sameArgv = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
const words = e => (e.program ? [e.program, ...(e.argv ?? []).slice(1)] : (e.argv ?? ['?'])).join(' ');
// An allowed exec: {program, argv} exactly, or {role, argvTail}: an exec of that role whose argv[0] is its executable
// and whose other arguments are exactly the tail (doctor's sandbox.userns probe, `bwrap --ro-bind / / true`, wherever
// bubblewrap is).
const allows = (a, e, role) => (a.role ? a.role === role && Array.isArray(e.argv) && e.argv[0] === e.program && sameArgv(a.argvTail, e.argv.slice(1))
  : a.program === e.program && sameArgv(a.argv, e.argv));
const allowedWords = a => (a.role ? `${a.role} ${a.argvTail.join(' ')}` : words(a));

/**
 * What a refused open (`command` serve) or a doctor run (`command` doctor) executed (E3, U0): the trace is of that
 * command and whole; no exec, done or attempted, of an engine, the sandbox helper (`helper`), bubblewrap, a REPL host
 * process, anything under runtimes/ or an executable the trace does not name, but `allowed`, each of which ran exactly
 * once (the override's `--version`; doctor's bubblewrap probe).
 */
export function execRoleProblems(summary, {helper, command, allowed = []}) {
  const problems = tracedCommand(summary, {command});
  const counts = allowed.map(() => 0);
  for (const e of Array.isArray(summary?.execs) ? summary.execs : []) {
    const role = roleOf(e, {helper});
    if (!role) continue;
    const match = e.ok ? allowed.findIndex(a => allows(a, e, role)) : -1;
    if (match >= 0) { counts[match] += 1; continue; }
    problems.push(`${role} ${e.pid} ${e.ok ? 'ran' : 'was attempted:'} ${words(e)}`);
  }
  allowed.forEach((a, i) => { if (counts[i] !== 1) problems.push(`${allowedWords(a)} ran ${counts[i]} times, not once`); });
  return problems;
}

// ---- the refusals' literals (§2.1, §2.2) ----

const NAMED = {variable: () => 'CUA_NATIVE_ENGINE=vendor', file: path => `"engine": "vendor" in ${path}`};
const UNDO = {variable: () => 'unset CUA_NATIVE_ENGINE', file: path => `remove "engine" from ${path}`};

/**
 * The engine_retired sentence for `sources` (`variable`, `file`, in precedence order), `settings` the engine.json path,
 * `installer` this checkout's install command: from a selection (`after` open) it ends with the one command, from `cua
 * install` (`after` install) with that the install otherwise completed.
 */
export function retiredMessage({sources, settings, installer, after = 'open'}) {
  const and = list => list.join(' and ');
  return `${and(sources.map(s => NAMED[s](settings)))} ${sources.length > 1 ? 'select' : 'selects'} the vendor's engine, which cua ${RETIRED_IN} removed from Linux, `
    + `where cua's own engine (CUA_NATIVE_ENGINE=cua, the default) is the only one: ${and(sources.map(s => UNDO[s](settings)))}`
    + (after === 'install' ? '; the install otherwise completed' : `, then run \`${installer} --engine\``);
}

/** engine_outdated for an override at `path` answering `version`, below `minimum`, selected by `source`. */
export const outdatedOverrideMessage = ({path, version, minimum, installer, source = 'the default engine (cua)'}) =>
  `${source} selects cua's own engine, and CUA_LINUX_ENGINE_BIN names ${path}, which is ${version}, older than ${minimum}, which this cua needs: unset CUA_LINUX_ENGINE_BIN, then run \`${installer} --engine\``;

/** The refusal `cua serve` prints when an open fails: `cua: <message> [<code>]`, then its remedy indented. Or null. */
export function parseRefusal(stderr) {
  const lines = String(stderr ?? '').split('\n');
  const at = lines.findIndex(line => /^cua: .* \[[a-z_]+\]$/.test(line));
  if (at < 0) return null;
  const [, message, code] = /^cua: (.*) \[([a-z_]+)\]$/.exec(lines[at]);
  const hint = /^\s+\S/.test(lines[at + 1] ?? '') ? lines[at + 1].trim() : null;
  return {message, code, hint};
}

/**
 * A refused open (`attempt` {exit, signal, replied, spontaneous, drained, stderr}): serve exited on its own, nonzero and by
 * no signal, before any reply to initialize (a JSON-RPC error is a reply), its standard error drained, refused with
 * exactly `code`, `message` and `hint`.
 */
export function refusedAsProblems(attempt, {code, message, hint}) {
  if (!attempt) return ['no attempt to open was recorded'];
  const {exit, signal, replied, spontaneous, drained, stderr} = attempt;
  const problems = [];
  if (replied !== false) problems.push('initialize was answered (a result or an error), not left unanswered by an exit');
  if (signal) problems.push(`serve was ended by ${signal}, not a nonzero exit of its own`);
  else if (!(Number.isInteger(exit) && exit !== 0)) problems.push(`serve exited ${exit}`);
  if (spontaneous !== true) problems.push('serve did not exit on its own before the driver ended it');
  if (drained !== true) problems.push('serve\'s standard error was not drained');
  const refusal = parseRefusal(stderr);
  if (!refusal) return [...problems, 'serve printed no refusal sentence'];
  if (refusal.code !== code) problems.push(`refused ${refusal.code}, not ${code}`);
  if (refusal.message !== message) problems.push(`its sentence is not the literal: ${refusal.message}`);
  if (refusal.hint !== hint) problems.push(`its hint is not the literal: ${refusal.hint}`);
  return problems;
}

/** Doctor under a refused selection: its engine and repl.host rows fail, each naming `code` and carrying `<message>; <hint>`. */
export function doctorRefusalProblems(doctor, {code, message, hint}) {
  if (!doctor) return ['no doctor report'];
  return ['engine', 'repl.host'].flatMap(name => {
    const row = rowOf(doctor, name);
    if (!row) return [`doctor has no ${name} row`];
    const problems = row.status === 'fail' ? [] : [`the ${name} row is ${row.status}, not fail`];
    if (!String(row.detail).includes(`(${code}`)) problems.push(`${name} does not name ${code}`);
    if (!String(row.detail).includes(`${message}; ${hint}`)) problems.push(`${name} does not carry the sentence and the hint: ${row.detail}`);
    return problems;
  });
}

const PARTS = ['modules', 'sandboxHelper', 'node', 'engine'];

/**
 * `cua install --json` under a vendor source (E3): a nonzero exit, every part in place and the pointer the derived
 * `release`, nothing named retired, and its error engine_retired with exactly `message` and no hint.
 */
export function retiredInstallProblems({exit, report}, {message, release}) {
  if (!report) return ['the install printed no report'];
  const problems = Number.isInteger(exit) && exit !== 0 ? [] : [`it exited ${exit}, not nonzero`];
  if (report.ok !== false) problems.push(`its report is ok: ${report.ok}`);
  for (const part of PARTS) if (!report[part] || report[part].failed) problems.push(`${part} was not placed: ${JSON.stringify(report[part]?.failed ?? null)}`);
  if (report.pointer?.current !== release) problems.push(`the pointer is ${report.pointer?.current ?? 'nothing'}, not ${release}`);
  if (!Array.isArray(report.retired) || report.retired.length) problems.push(`it names retired releases: ${JSON.stringify(report.retired ?? null)}`);
  const {error} = report;
  if (error?.code !== 'engine_retired') problems.push(`its error is ${error?.code ?? 'none'}, not engine_retired`);
  if (error?.message !== message) problems.push(`its sentence is not the literal: ${error?.message}`);
  if (error?.hint) problems.push(`it carries a hint: ${error.hint}`);
  return problems;
}

// ---- the retired tree (§3) ----

// 10^6 bytes to the MB, to one decimal; a tree under a tenth of one is said in bytes (§3.2).
const amount = bytes => (bytes < 100_000 ? `${bytes} bytes` : `${(bytes / 1e6).toFixed(1)} MB`);

/** §3.3's sentence for a tree at `path` of `bytes`, whose record says it was placed at `installedAt`. */
export const retiredSentence = ({path, bytes, installedAt}) => `cua ${RETIRED_IN} no longer uses the vendor's release at ${path} for sessions: ${amount(bytes)} as it is now, `
  + `where a cua install recorded placing it on ${installedAt.slice(0, 10)}. cua leaves it in place and has not checked what it holds. Before deleting it by hand, check `
  + 'that no older cua (another checkout on this home) still runs from it, and for files added to it';

const TREE_FIELDS = ['release', 'path', 'bytes', 'installedAt', 'source'];

/** A report's `retired` list against `expected` [{release, path, bytes, installedAt, source}], field by field. */
export function retiredReportProblems(list, {expected}) {
  if (!Array.isArray(list)) return ['the report has no retired list'];
  if (list.length !== expected.length) return [`retired lists ${list.length} releases, not ${expected.length}`];
  return list.flatMap((tree, i) => TREE_FIELDS.filter(f => tree?.[f] !== expected[i][f]).map(f => `retired's ${f} ${tree?.[f]}, not ${expected[i][f]}`));
}

/**
 * Doctor in a home with one recorded release (`retired`, U1, U3), or none (`retired` null): ok, none of the vendor rows;
 * with a release, its runtime.retired row a skip whose detail is the sentence and `retired` that release; with none, no
 * such row and nothing retired. With `reference` (E0's doctor), every other row is E0's, by name and status.
 */
export function doctorRowsProblems(doctor, {retired, reference = null}) {
  if (!doctor) return ['no doctor report'];
  const problems = doctor.ok === true ? [] : ['doctor is not ok'];
  problems.push(...forbiddenRows(doctor));
  const row = rowOf(doctor, 'runtime.retired');
  if (retired) {
    if (!row) problems.push('doctor has no runtime.retired row');
    else {
      if (row.status !== 'skip') problems.push(`runtime.retired is ${row.status}, not skip`);
      if (row.detail !== retiredSentence(retired)) problems.push(`runtime.retired's sentence is not the literal: ${row.detail}`);
    }
    problems.push(...retiredReportProblems(doctor.retired, {expected: [retired]}));
  } else {
    if (row) problems.push('doctor has a runtime.retired row');
    problems.push(...retiredReportProblems(doctor.retired, {expected: []}));
  }
  if (reference) {
    const others = (doctor.checks ?? []).filter(c => c.name !== 'runtime.retired');
    for (const ref of reference.checks ?? []) {
      const mine = others.find(c => c.name === ref.name);
      if (!mine) problems.push(`doctor has no ${ref.name} row, which E0's had`);
      else if (mine.status !== ref.status) problems.push(`${ref.name} is ${mine.status}, not E0's ${ref.status}: ${mine.detail}`);
    }
    for (const c of others) if (!(reference.checks ?? []).some(ref => ref.name === c.name)) problems.push(`doctor has a ${c.name} row, which E0's did not`);
  }
  return problems;
}

/** An install's output (`out`, `err`): the sentence exactly once as a line, and none of `unnamed` anywhere. */
export function retiredLineProblems({out, err}, {sentence, unnamed = []}) {
  if (typeof out !== 'string') return ['the install printed no output'];
  const text = `${out}\n${err ?? ''}`;
  const times = text.split('\n').filter(line => line.trim() === sentence).length;
  const problems = times === 1 ? [] : [`the install printed the sentence ${times} times, not once`];
  for (const name of unnamed) if (text.includes(name)) problems.push(`the output names ${name}`);
  return problems;
}

/**
 * The second install (U3, `--json`): exit 0, nothing changed (the report's `changed` and every part's, the pointer's
 * included, explicitly false), and the same `retired` list.
 */
export function reinstallProblems({exit, report}, {retired}) {
  if (!report) return ['the install printed no report'];
  const problems = exit === 0 ? [] : [`it exited ${exit}`];
  if (report.changed !== false) problems.push(`the install changed: ${report.changed}`);
  for (const part of [...PARTS, 'pointer']) if (report[part]?.changed !== false) problems.push(`${part} changed: ${report[part]?.changed}, not false`);
  problems.push(...retiredReportProblems(report.retired, {expected: retired}));
  return problems;
}

/**
 * U4, U5: a copy whose record fails is named by neither command. `install` and `doctor` are each {exit, report, text}
 * (`--json`, `text` the whole of its standard output and error): both exit 0; neither report lists a retired release,
 * doctor has no runtime.retired row; and no `names` (the release's name, the copy's path) appear anywhere in either text.
 */
export function notNamedProblems({install, doctor}, {names}) {
  const problems = [];
  if (!install?.report) problems.push('the install printed no report');
  else {
    if (install.exit !== 0) problems.push(`the install exited ${install.exit}`);
    if (!Array.isArray(install.report.retired)) problems.push('the install\'s report has no retired list');
    else if (install.report.retired.length) problems.push(`the install named ${install.report.retired.map(t => t.release).join(', ')}`);
  }
  if (!doctor?.report) problems.push('no doctor report');
  else {
    if (doctor.exit !== 0) problems.push(`doctor exited ${doctor.exit}`);
    if (rowOf(doctor.report, 'runtime.retired')) problems.push('doctor has a runtime.retired row');
    if (!Array.isArray(doctor.report.retired)) problems.push('doctor\'s report has no retired list');
    else if (doctor.report.retired.length) problems.push(`doctor named ${doctor.report.retired.map(t => t.release).join(', ')}`);
  }
  // Anywhere else in either command's output, a row's detail or a diagnostic, the copy is named too (fix wave 1).
  for (const [what, run] of [['install', install], ['doctor', doctor]]) {
    if (typeof run?.text !== 'string') { problems.push(`${what} printed no output`); continue; }
    for (const name of names) if (run.text.includes(name)) problems.push(`${what}'s output names ${name}`);
  }
  return problems;
}

// ---- the trees' snapshots ----

/**
 * Every entry under `dir` by lstat, following no link: {entries: [{path, kind, mode, size, mtimeMs, target?, sha256?}]},
 * sorted by path, the root as `.`; null when `dir` cannot be read. A file's bytes are hashed, a link's target kept.
 */
export function treeSnapshot(dir) {
  const entries = [];
  const visit = rel => {
    const path = rel === '.' ? dir : join(dir, rel);
    const s = lstatSync(path);
    const kind = s.isDirectory() ? 'directory' : s.isFile() ? 'file' : s.isSymbolicLink() ? 'link' : 'other';
    const entry = {path: rel, kind, mode: s.mode, size: s.size, mtimeMs: s.mtimeMs};
    if (kind === 'file') entry.sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (kind === 'link') entry.target = readlinkSync(path);
    entries.push(entry);
    if (kind === 'directory') for (const name of readdirSync(path)) visit(rel === '.' ? name : `${rel}/${name}`);
  };
  try { visit('.'); } catch { return null; }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {entries};
}

const SNAPSHOT_FIELDS = [['kind', 'kind'], ['mode', 'mode'], ['size', 'size'], ['sha256', 'sha256'], ['target', 'target'], ['mtimeMs', 'mtime']];

/** Two snapshots of one tree: every entry there before is there after with the same kind, mode, size, bytes, target and mtime, and none is added. */
export function snapshotProblems(before, after) {
  if (!before || !after) return [`no snapshot ${before ? 'after' : 'before'}`];
  const was = new Map(before.entries.map(e => [e.path, e]));
  const now = new Map(after.entries.map(e => [e.path, e]));
  const problems = [];
  for (const [path, b] of was) {
    const a = now.get(path);
    if (!a) { problems.push(`${path} was removed`); continue; }
    const changed = SNAPSHOT_FIELDS.filter(([f]) => b[f] !== a[f]).map(([f, label]) => `${label} ${b[f]} -> ${a[f]}`);
    if (changed.length) problems.push(`${path}: ${changed.join(', ')}`);
  }
  for (const path of now.keys()) if (!was.has(path)) problems.push(`${path} was added`);
  return problems;
}

// ---- M6a's trace judges, kept ----

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// Why a trace's count of runtimes/ calls is not a whole one, by the reader's own rule.
function incompleteness(runtimes) {
  const {unresolved, pending, unended, complete} = runtimes ?? {};
  if (complete === true) return [];
  const why = [unresolved ? `${plural(unresolved, 'call')} left a path unresolved` : null, pending ? `${plural(pending, 'file call')} unfinished at the trace's end` : null,
    unended ? `${unended} processes of the serve's tree with no end` : null].filter(Boolean);
  return [`the count is incomplete: ${why.length ? why.join(', ') : 'the reader did not call it complete'}`];
}

/**
 * A traced run's trace (linux-trace.mjs's summary): it followed the helper's children into the kernel (traceVerdict),
 * the serve's tree named no path under runtimes/ and the count is whole by the reader's rule; with `opened`, one kernel of
 * the serve's under the helper opened every one of those paths after its exec; with `node` (the managed Node's
 * spellings), every worker and kernel of the serve's ran it.
 */
export function traceProblems(summary, {opened, node} = {}) {
  const problems = [...traceVerdict(summary).problems];
  // A line the reader could not read, or a resumption of no call, could have been a call under runtimes/.
  if (summary.whole?.unreadLines || summary.whole?.orphans) problems.push(...wholeProblems({...summary.whole, complete: false}));
  const {calls: n} = summary.runtimes ?? {};
  if (n) problems.push(`${n} calls of the serve's process tree named a path under runtimes/`);
  problems.push(...incompleteness(summary.runtimes));
  if (opened) {
    const kernels = summary.kernels.filter(k => k.underServe && k.underHelper);
    if (!kernels.some(k => opened.every(path => (k.opened ?? []).includes(path)))) {
      const best = kernels.reduce((a, k) => ((k.opened ?? []).length > (a?.opened ?? []).length ? k : a), null);
      const missed = opened.filter(path => !(best?.opened ?? []).includes(path));
      problems.push(`no one kernel of the serve's opened all ${opened.length}: ${missed.map(path => `the serve's kernel did not open ${path}`).join('; ')}`);
    }
  }
  if (node) {
    for (const [what, list] of [['worker', summary.workers], ['kernel', summary.kernels]])
      // Every Node the pid exec'd, not only its last (fix wave 2, #4).
      for (const p of (list ?? []).filter(x => x.underServe)) for (const exe of new Set(p.nodeExes ?? [p.exe])) if (!node.includes(exe)) problems.push(`the ${what} ${p.pid} ran ${exe}, not the home's managed Node ${node[0]}`);
  }
  return problems;
}

/**
 * Whether serve answered initialize (the transcript's first request, its id 1), a result or an error, read from the whole
 * transcript once stdout has drained (fix wave 2, #3): a reply buffered at the exit is a reply.
 */
export function initializeAnswered(transcript, id = 1) {
  return transcript.some(line => {
    let msg;
    try { msg = JSON.parse(line); } catch { return false; }
    return msg?.id === id && msg.method === undefined && ('result' in msg || 'error' in msg);
  });
}

/**
 * Nothing launched, by exec evidence: a trace of the serve, whole, in which its tree exec'd no helper, bubblewrap, REPL
 * host or engine, and exec'd or attempted nothing under runtimes/, whatever its name. Other calls there are not launches.
 */
export function launchedProblems(summary) {
  if (!summary) return ['no trace of the open'];
  const problems = summary.serve === null ? ['the trace holds no cua serve exec'] : [];
  problems.push(...incompleteness(summary.runtimes));
  for (const l of summary.launched ?? []) problems.push(`${l.kind} ${l.pid} was ${l.attempted ? 'attempted' : 'launched'} (${l.program})`);
  return problems;
}
