// Acceptance 12's cells and their judges (#171 M6a, T6; the M6a pre-flight §5.2, the cell table). The driver
// (./linux-runtime.mjs) runs each cell's steps and hands what it observed to these judges; each returns its problems,
// none when the observation holds. The process watch's judges are ./linux-runtime-watch.mjs's.
import {relative, sep} from 'node:path';
import {traceVerdict} from './linux-trace.mjs';

// The cua before M6a whose install makes the upgraded home: main's tip that the M6a branch merged (0.4.4's pin, plugin
// 0.29.9). A counted run takes no other (fix wave 1, #6).
export const APPROVED_OLDER = '0d19fdfadce47fc6ba88db180fb4845346c9be26';
const PHASES = ['E', 'U'];

/** The cells, in the pre-flight's order: the home each runs over, its state, its step, what passing means. */
export const CELLS = Object.freeze([
  {cell: 'E0', home: 'empty', state: '-', step: 'cua install at the head', passing: 'exit 0; the tree, helper, Node and engine placed; the pointer the derived name; doctor\'s runtime.installed, runtime.modules, runtime.node and sandbox.launcher pass, its engine row the pinned version and hash behind service cua'},
  {cell: 'E1', home: 'empty', state: 'vendor tree present', step: 'the item 1 smoke and the item 6 witness, plain and under strace -f', passing: 'every step passes; no sky_linux at any sample; the engine child the home\'s cua-engine; traced, no call of the serve\'s tree under runtimes/, with the kernel and the worker in the trace'},
  {cell: 'E2', home: 'empty', state: 'present', step: 'the browser-only session, plain and traced; the loader', passing: 'every step passes; each of the six selected entries the one named, in the module tree, and opened by the kernel in the traced run; the mapped natives the tree\'s; no engine process at any sample'},
  {cell: 'E3', home: 'empty', state: 'runtimes/ moved out of the home', step: 'E1 and E2, plain', passing: 'as E1 and E2'},
  {cell: 'E4', home: 'empty', state: 'moved out', step: 'a computer session with CUA_NATIVE_ENGINE=vendor, then with "engine": "vendor"', passing: 'the open refused engine_not_installed, naming the installer; nothing launched; doctor\'s engine row fails with the sentence; a browser-only session with the variable set passes'},
  {cell: 'E5', home: 'empty', state: 'moved back', step: 'the vendor selection: list the apps, bind a harness gedit, read its tree; no input', passing: 'the engine child this home\'s sky_linux behind the vendor service, no cua-engine; a cell\'s import from the module tree'},
  {cell: 'U0', home: 'upgraded', state: 'installed by the cua before M6a', step: 'at the head, before any install: a session', passing: 'refused runtime_not_installed, the vendor tree intact; the sentence names the head\'s own installer by absolute path and the derived release; doctor says the same'},
  {cell: 'U1', home: 'upgraded', state: '-', step: 'the older cua\'s cua install again', passing: 'exit 0, nothing built; the session at the head refused as in U0, word for word; nothing launched'},
  {cell: 'U2', home: 'upgraded', state: '-', step: 'the command U0 printed', passing: 'the pointer from the vendor name to the derived one, both recorded; the tree placed; helper, Node and engine unchanged; the vendor tree\'s install.json the same file'},
  {cell: 'U3', home: 'upgraded', state: 'runtimes/ removed', step: 'E1 and E2, plain', passing: 'as E1 and E2'},
  {cell: 'U4', home: 'upgraded', state: 'removed', step: 'E4', passing: 'as E4'},
  {cell: 'U5', home: 'upgraded', state: 'removed, and the pointer set back to the vendor name', step: 'E1 and E2, plain', passing: 'as E1 and E2'},
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
 * read as acceptance 12.
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
  'linux-text --read-only': ['preconditions: Linux, a private display, gedit', 'list the apps', 'bind the harness gedit by X11 id and read its tree', 'a cell\'s import still loads from the module tree',
    'end_task', 'approvals: the harness gedit\'s app asked once and accepted, nothing else asked', 'cua serve exited cleanly', 'no run entry left for the connection'],
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

/** The runtime overrides a counted run may not inherit: every CUA_* but CUA_HOME, every OAI_*, NODE_OPTIONS, NODE_PATH. */
export const inheritedOverrides = env => Object.keys(env).filter(name => (/^(CUA|OAI)_/.test(name) && name !== 'CUA_HOME') || name === 'NODE_OPTIONS' || name === 'NODE_PATH').sort();

/** The vendor tree at a cell's boundary: `expected` present (there, and resolving as the pinned release) or absent. */
export function boundaryProblems({expected, exists, resolves, why}) {
  if (expected === 'absent') return exists ? ['runtimes/ is there'] : [];
  if (!exists) return ['runtimes/ is not there'];
  return resolves ? [] : [`the vendor tree does not resolve (${why ?? 'unread'})`];
}

/**
 * The upgraded home's setup: the older checkout is the approved commit with no local changes, its install exited 0, and
 * it placed the arch's pinned vendor release, with its install record, which doctor's runtime.vendor verifies.
 */
export function olderProblems({commit, clean, exit, vendorRelease, pinnedRelease, vendorRow, record}) {
  const problems = [];
  if (commit !== APPROVED_OLDER) problems.push(`the older checkout is at ${commit ?? 'an unread commit'}, which is not the approved ${APPROVED_OLDER}`);
  if (!clean) problems.push('the older checkout has local changes');
  if (exit !== 0) problems.push(`the older cua's install exited ${exit}`);
  if (vendorRelease !== pinnedRelease) problems.push(`the pointer names ${vendorRelease ?? 'nothing'}, not the arch's pinned vendor release ${pinnedRelease}`);
  if (!record) problems.push('the vendor release has no install.json');
  if (vendorRow?.status !== 'pass') problems.push(`doctor's runtime.vendor is ${vendorRow?.status ?? 'missing'}${vendorRow?.detail ? `: ${vendorRow.detail}` : ''}`);
  return problems;
}

const sameFile = record => !!record?.before && !!record?.after && record.before.sha256 === record.after.sha256 && record.before.ino === record.after.ino && record.before.mtimeMs === record.after.mtimeMs;

/**
 * U1: the older cua's install again, `--json`: exit 0 and all four of its parts explicitly `changed: false` (the vendor
 * release, the helper, the engine, Node), no module tree built, and the vendor record the same file.
 */
export function reinstallProblems({exit, report, modules, vendorRecord}) {
  const problems = exit === 0 ? [] : [`it exited ${exit}`];
  if (!report) problems.push('it printed no report');
  else for (const [what, changed] of [['the vendor release', report.changed], ['sandboxHelper', report.sandboxHelper?.changed], ['engine', report.engine?.changed], ['node', report.node?.changed]])
    if (changed !== false) problems.push(`${what} changed: ${changed}, not false`);
  if (modules) problems.push('a modules/ directory is there');
  if (!sameFile(vendorRecord)) problems.push('the vendor tree\'s install.json is not the same file');
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

/** E0: the install `exit`, the `pointer` against the derived `release`, and doctor after it. */
export function installProblems({exit, pointer, release, doctor, pin, arch}) {
  const problems = exit === 0 ? [] : [`cua install exited ${exit}`];
  if (pointer !== release) problems.push(`the pointer names ${pointer ?? 'nothing'}, not the derived ${release}`);
  return [...problems, ...rowProblems(doctor, ['runtime.installed', 'runtime.modules', 'runtime.node', 'sandbox.launcher']), ...engineRowProblems(doctor, {pin, arch})];
}

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
 * no signal, before any reply to initialize (a JSON-RPC error is a reply), its standard error drained, with the refusal
 * `code`, its sentence naming `installer` (this cua's own, by absolute path) and, when given, the `release`.
 */
export function refusalProblems({exit, signal, replied, spontaneous, drained, stderr}, {code, installer, release}) {
  const problems = [];
  if (replied !== false) problems.push('initialize was answered (a result or an error), not left unanswered by an exit');
  if (signal) problems.push(`serve was ended by ${signal}, not a nonzero exit of its own`);
  else if (!(Number.isInteger(exit) && exit !== 0)) problems.push(`serve exited ${exit}`);
  if (spontaneous !== true) problems.push('serve did not exit on its own before the driver ended it');
  if (drained !== true) problems.push('serve\'s standard error was not drained');
  const refusal = parseRefusal(stderr);
  if (!refusal) return [...problems, 'serve printed no refusal sentence'];
  const sentence = `${refusal.message} ${refusal.hint ?? ''}`;
  if (refusal.code !== code) problems.push(`refused ${refusal.code}, not ${code}`);
  if (!sentence.includes(installer)) problems.push(`the sentence does not name this cua's installer, ${installer}`);
  if (release && !sentence.includes(release)) problems.push(`the sentence does not name the release ${release}`);
  return problems;
}

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
  const {calls} = summary.runtimes ?? {};
  if (calls) problems.push(`${calls} calls of the serve's process tree named a path under runtimes/`);
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
      for (const p of (list ?? []).filter(x => x.underServe)) if (!node.includes(p.exe)) problems.push(`the ${what} ${p.pid} ran ${p.exe}, not the home's managed Node ${node[0]}`);
  }
  return problems;
}

/** Nothing launched, by exec evidence: a trace of the serve, whole, in which its tree exec'd no helper, bubblewrap, REPL host or engine. */
export function launchedProblems(summary) {
  if (!summary) return ['no trace of the open'];
  const problems = summary.serve === null ? ['the trace holds no cua serve exec'] : [];
  problems.push(...incompleteness(summary.runtimes));
  for (const l of summary.launched ?? []) problems.push(`${l.kind} ${l.pid} was launched (${l.program})`);
  return problems;
}

/**
 * U2: the printed installer's `exit` and `report` (`--json`), current.json after it (`pointer`), the vendor release the
 * older cua pointed at, the derived `release`, which parts the older cua's pins differ in (`expectChanged`), and the
 * vendor tree's install.json `{sha256, ino, mtimeMs}` before and after.
 */
export function upgradeProblems({exit, report, pointer, vendorRelease, release, expectChanged, vendorRecord}) {
  const problems = exit === 0 ? [] : [`the installer exited ${exit}`];
  if (!report) return [...problems, 'the installer printed no report'];
  if (report.pointer?.previous !== vendorRelease) problems.push(`the report records the previous pointer ${report.pointer?.previous ?? null}, not the vendor's ${vendorRelease}`);
  if (report.pointer?.current !== release) problems.push(`the report records the pointer ${report.pointer?.current ?? null}, not the derived ${release}`);
  if (pointer !== release) problems.push(`current.json names ${pointer ?? 'nothing'}, not the derived ${release}`);
  if (report.modules?.changed !== true) problems.push(`the module tree was not placed (${JSON.stringify(report.modules?.failed ?? report.modules ?? null)})`);
  for (const part of ['sandboxHelper', 'node', 'engine']) {
    if (report[part]?.changed !== expectChanged[part]) problems.push(`${part} changed: ${report[part]?.changed ?? JSON.stringify(report[part]?.failed ?? null)}, expected ${expectChanged[part]}`);
  }
  const {before, after} = vendorRecord ?? {};
  if (!before || !after || before.sha256 !== after.sha256 || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs) problems.push('the vendor tree\'s install.json is not the same file');
  return problems;
}

/**
 * Which shared parts the older cua's pins differ in from this one's, for an install over its home: the helper's pin
 * file, the Node pin file for the host, the engine asset's SHA-256 for `arch`. Each side `{helper, node, engine}` (the
 * two files' text, null when absent, and the parsed engine pin).
 */
export function pinsChanged({head, older, arch}) {
  return {
    sandboxHelper: head.helper !== older.helper,
    node: head.node !== older.node,
    engine: head.engine?.assets?.[arch]?.sha256 !== older.engine?.assets?.[arch]?.sha256,
  };
}
