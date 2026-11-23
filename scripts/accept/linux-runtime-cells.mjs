// Acceptance 12's cells and their judges (#171 M6a, T6; the M6a pre-flight §5.2, the cell table). The driver
// (./linux-runtime.mjs) runs each cell's steps and hands what it observed to these judges; each returns its problems,
// none when the observation holds. The process watch's judges are ./linux-runtime-watch.mjs's.
import {traceVerdict} from './linux-trace.mjs';

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

/** A fixture's run `{exit, signal, report}`: it passes only when it exited 0 and its own status is PASS. */
export function fixtureProblems({exit, signal, report}) {
  const problems = [];
  if (exit !== 0) problems.push(`it exited ${exit ?? signal}`);
  if (!report) problems.push('it printed no report');
  else {
    if (report.status !== 'PASS') problems.push(`its status is ${report.status}`);
    for (const s of report.steps ?? []) if (s.status !== 'PASS') problems.push(`${s.name} failed`);
  }
  return problems;
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
 * A refused open (`attempt` {exit, initialized, stderr}): serve exited before answering, with the refusal `code`, its
 * sentence naming `installer` (this cua's own, by absolute path) and, when given, the `release`.
 */
export function refusalProblems({exit, initialized, stderr}, {code, installer, release}) {
  const problems = [];
  if (initialized || exit === 0) problems.push(`the open was answered (initialize ${initialized ? 'answered' : 'unanswered'}, exit ${exit})`);
  const refusal = parseRefusal(stderr);
  if (!refusal) return [...problems, 'serve printed no refusal sentence'];
  const sentence = `${refusal.message} ${refusal.hint ?? ''}`;
  if (refusal.code !== code) problems.push(`refused ${refusal.code}, not ${code}`);
  if (!sentence.includes(installer)) problems.push(`the sentence does not name this cua's installer, ${installer}`);
  if (release && !sentence.includes(release)) problems.push(`the sentence does not name the release ${release}`);
  return problems;
}

/**
 * A traced run's trace (linux-trace.mjs's summary): it followed the helper's children into the kernel (traceVerdict),
 * the serve's tree named no path under runtimes/ with every path resolved, and, with `opened`, a kernel of the serve's
 * under the helper opened each of those paths.
 */
export function traceProblems(summary, {opened} = {}) {
  const problems = [...traceVerdict(summary).problems];
  const {calls, unresolved, complete} = summary.runtimes ?? {};
  if (calls) problems.push(`${calls} calls of the serve's process tree named a path under runtimes/`);
  if (!complete) problems.push(`the count is incomplete: ${unresolved ?? 'some'} calls left a path unresolved`);
  if (opened) {
    const kernels = summary.kernels.filter(k => k.underServe && k.underHelper);
    for (const path of opened) if (!kernels.some(k => (k.opened ?? []).includes(path))) problems.push(`the serve's kernel did not open ${path}`);
  }
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
