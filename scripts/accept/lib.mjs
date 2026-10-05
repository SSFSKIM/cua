// Pure, testable pieces of the acceptance runner (scripts/accept-native.mjs): how sub-check statuses roll up, how the
// suites' summaries are read, the narrow TextEdit approval rule of the live fixture, the installed-tree snapshot that
// proves a reinstall mutated nothing, and the packaging/tracking policies of acceptance 10.
import {lstatSync, readdirSync, readlinkSync} from 'node:fs';
import {join} from 'node:path';

export const STATUSES = ['PASS', 'FAIL', 'BLOCKED'];

// An item passes only when it has checks and every one passed; any failure fails it; otherwise it is blocked. An item
// with nothing evaluated is BLOCKED, never PASS: a skipped check must not read as a pass.
export function rollup(statuses) {
  if (!statuses.length) return 'BLOCKED';
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.includes('BLOCKED')) return 'BLOCKED';
  return 'PASS';
}

// What a required suite's run proves. Exit 0 with no failure is not enough: a suite that executed nothing, or skipped
// or left TODO any test, has not shown its coverage, so it is BLOCKED (never PASS); a failure, cancellation, nonzero
// exit or missing summary is FAIL.
export function suiteVerdict({code, totals}) {
  if (!totals) return {status: 'FAIL', reason: 'no test summary'};
  if (code !== 0 || totals.fail > 0 || totals.cancelled > 0) return {status: 'FAIL', reason: `exit ${code}, ${totals.fail} failed, ${totals.cancelled} cancelled`};
  if (totals.tests === 0 || totals.pass === 0) return {status: 'BLOCKED', reason: 'no test was executed'};
  if (totals.skipped > 0 || totals.todo > 0) return {status: 'BLOCKED', reason: `${totals.skipped} skipped and ${totals.todo} TODO of ${totals.tests}: required coverage did not run`};
  if (totals.pass !== totals.tests) return {status: 'FAIL', reason: `${totals.pass} of ${totals.tests} passed`};
  return {status: 'PASS', reason: `${totals.pass}/${totals.tests} passed`};
}

// The summary node:test prints at the end of a run, or null when there is none. Two forms are read: the TAP
// reporter's `# tests N` lines, which the runners request (testReporterEnv), and the spec reporter's `ℹ tests N` lines,
// which Node 23 and later print by default even when stdout is not a terminal. All six counts must come from one form;
// colour codes are ignored.
const SUMMARY_KEYS = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
export function testTotals(text) {
  const plain = text.replace(/\x1b\[[0-9;]*m/g, '');
  for (const prefix of ['#', '\u2139']) {
    const totals = {};
    for (const key of SUMMARY_KEYS) {
      const match = plain.match(new RegExp(`^${prefix} ${key} (\\d+)$`, 'm'));
      if (!match) break;
      totals[key] = Number(match[1]);
    }
    if (Object.keys(totals).length === SUMMARY_KEYS.length) return totals;
  }
  return null;
}

// The environment for a spawned test command (`npm test`, `npm run test:helper`): node:test's default reporter differs
// by Node version and terminal, so every node process in the run, nested runners included, is told through
// NODE_OPTIONS to report TAP on stdout. A reporter already named in NODE_OPTIONS is replaced, not doubled.
export const TAP_REPORTER_OPTIONS = ['--test-reporter=tap', '--test-reporter-destination=stdout'];
export function testReporterEnv(env) {
  const kept = (env.NODE_OPTIONS ?? '').split(/\s+/).filter(option => option && !option.startsWith('--test-reporter'));
  return {...env, NODE_OPTIONS: [...kept, ...TAP_REPORTER_OPTIONS].join(' ')};
}

// The vendor's app-use elicitation, exactly as the pinned computer-use policy builds it, for TextEdit and nothing
// else: the message names the app, the structured parameters carry its bundle identifier, and it is a form asking for
// no field (an object schema with no properties).
// The live TextEdit fixture accepts this one request (for the session only) and declines everything else.
export const TEXTEDIT_BUNDLE = 'com.apple.TextEdit';
export function isTextEditApproval(msg) {
  if (msg?.method !== 'elicitation/create') return false;
  const params = msg.params ?? {};
  const meta = params._meta ?? {};
  const toolParams = meta.tool_params;
  const schema = params.requestedSchema;
  return params.message === 'Allow Computer Use to use "TextEdit"?'
    && params.mode === 'form'
    && schema !== null && typeof schema === 'object' && schema.type === 'object'
    && schema.properties !== null && typeof schema.properties === 'object' && Object.keys(schema.properties).length === 0
    && meta.connector_id === 'computer-use'
    && meta.codex_approval_kind === 'mcp_tool_call'
    && toolParams !== null && typeof toolParams === 'object'
    && Object.keys(toolParams).length === 1 && toolParams.app === TEXTEDIT_BUNDLE;
}

// Every entry under `root` (symbolic links are recorded, not followed) with what a mutation would change.
export function snapshotTree(root) {
  const entries = new Map();
  const visit = relative => {
    const path = join(root, relative);
    const stat = lstatSync(path);
    const kind = stat.isSymbolicLink() ? `link>${readlinkSync(path)}` : stat.isDirectory() ? 'dir' : stat.isFile() ? 'file' : 'other';
    entries.set(relative || '.', `${kind}:${stat.mode}:${stat.isDirectory() ? 0 : stat.size}:${stat.mtimeMs}:${stat.ino}`);
    if (stat.isDirectory()) for (const name of readdirSync(path).sort()) visit(relative ? join(relative, name) : name);
  };
  visit('');
  return entries;
}

export function diffSnapshots(before, after) {
  const added = [...after.keys()].filter(key => !before.has(key));
  const removed = [...before.keys()].filter(key => !after.has(key));
  const changed = [...before.keys()].filter(key => after.has(key) && after.get(key) !== before.get(key));
  return {added, removed, changed, same: !added.length && !removed.length && !changed.length};
}

// Acceptance 10: what must never be tracked or packed (runtime archives and trees, build output, credentials, logs,
// sockets), and what the package needs to run, diagnose and build its helper.
const FORBIDDEN = [
  [/\.zip$/i, 'a runtime archive'],
  [/(^|\/)runtimes\//, 'an extracted runtime'],
  [/(^|\/)\.build\//, 'build output'],
  [/(^|\/)node_modules\//, 'installed dependencies'],
  [/(^|\/)(auth\.json|\.env|credentials[^/]*)$/i, 'a credential file'],
  [/\.(log|sock)$/i, 'a log or socket'],
  [/(^|\/)current\.json$/, 'an active-release pointer'],
];
export function forbiddenPaths(paths) {
  return paths.flatMap(path => FORBIDDEN.filter(([pattern]) => pattern.test(path)).map(([, why]) => `${path} (${why})`));
}

export const PACKAGE_REQUIRED = [
  'bin/cua.mjs', 'cua-shim.mjs', 'verify.mjs', 'scripts/probe/lib.mjs', 'scripts/build-helper.mjs', 'README.md',
  '.claude-plugin/plugin.json', 'src/cli.mjs', 'src/mcp/server.mjs', 'src/services/sky.mjs', 'src/secrets/client.mjs',
  'native/keychain/Package.swift', 'native/keychain/Sources/cua-keychain/main.swift',
];
export function missingFromPackage(files) {
  const packed = new Set(files);
  const missing = PACKAGE_REQUIRED.filter(path => !packed.has(path));
  if (!files.some(path => /^runtime\/releases\/[^/]+\.json$/.test(path))) missing.push('runtime/releases/<release>.json');
  return missing;
}

// Strings that look like credentials or personal tokens in tracked text.
const TOKEN_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
];
export const tokenLike = text => TOKEN_PATTERNS.some(pattern => pattern.test(text));

// Acceptance 6/7: every step scripts/probe-secrets.mjs records on a complete run, grouped into the spec's phases. A
// phase passes only when each of its steps ran and passed; a step that never ran is BLOCKED (requested, not executed).
const FIRST = 'first value: ';
const failClosed = tag => [...['type_text', 'paste', 'set_value'].map(m => `${tag}: ${m} reference fails closed`), `${tag}: close`];
export const PROBE_SECRETS_PHASES = [
  {name: 'live: preconditions and create (generated sentinel, test-owned pty fixture)', steps: ['preconditions', 'create']},
  {name: 'live: first substitution through helper → broker → trusted wrapper → controlled target', steps: ['paste', 'type_text', 'set_value'].map(m => `${FIRST}${m} substitution`)},
  {name: 'live: ordinary input, unsupported method, unknown/invalid label, unsupported shape', steps: ['ordinary input', 'unsupported method', 'unknown label', 'invalid label', 'unsupported shape', 'target saw only what it should'].map(s => FIRST + s)},
  {name: 'live: replace with a second generated sentinel and substitute it', steps: ['replace', 'replaced value: type_text substitution']},
  {name: 'live: failure output stays value-free (induced and real vendor failures)', steps: [`${FIRST}induced substituted-command failure`, `${FIRST}cell timeout during a substituted call`, 'real vendor: failure after substitution', 'real vendor: unknown label']},
  {name: 'live: model cells cannot plant code in a trusted root', steps: ['model cells cannot plant a module in a trusted code root']},
  {name: 'live: fail closed before any input (secrets off, broker unavailable)', steps: [...failClosed('secrets off'), ...failClosed('broker unavailable')]},
  {name: 'live: every connection closed cleanly', steps: [`${FIRST}close`, 'replaced value: close', 'real serve: close']},
  {name: 'live: no value in any observed channel or report', steps: ['scanner self-check', 'sentinel scan']},
  {name: 'live: finally cleanup of only the scenario-owned item', steps: ['cleanup']},
];

// One check per expected step group: statuses of the steps that ran, BLOCKED for each that did not.
export function inventoryCheck(name, steps, expected) {
  const results = expected.map(step => ({step, found: steps.find(s => s.name === step)}));
  const missing = results.filter(r => !r.found).map(r => r.step);
  const status = rollup(results.map(r => r.found?.status ?? 'BLOCKED'));
  const ran = results.filter(r => r.found).map(r => `${r.step}: ${r.found.status}${expected.length === 1 && r.found.detail ? ` (${r.found.detail})` : ''}`);
  return {name, status, detail: [...ran, ...(missing.length ? [`not executed: ${missing.join('; ')}`] : [])].join('; ')};
}

// A child scenario's own overall verdict, with every step that did not pass named (including ones no phase expects).
export function scenarioVerdict(name, scenario, expected) {
  if (!scenario || !Array.isArray(scenario.steps) || !scenario.steps.length) return {name, status: 'FAIL', detail: 'the scenario produced no report'};
  const unexpected = scenario.steps.filter(s => !expected.includes(s.name)).map(s => `${s.name}: ${s.status}`);
  const notPassed = scenario.steps.filter(s => s.status !== 'PASS').map(s => `${s.name}: ${s.status}`);
  const status = STATUSES.includes(scenario.status) ? rollup([scenario.status, ...scenario.steps.map(s => s.status)]) : 'FAIL';
  return {name, status, detail: `scenario status ${scenario.status}; ${scenario.steps.length} steps${notPassed.length ? `; not passed: ${notPassed.join('; ')}` : ', all passed'}${unexpected.length ? `; steps no phase expects: ${unexpected.join('; ')}` : ''}`};
}

// Acceptance 8, from the live TextEdit fixture: per-connection approval is observed only when both connections bound
// the fixture's document, the vendor asked for approval on each and was answered, the session approval file existed
// while each was open and was gone after it closed.
export function approvalObservation(connections) {
  const names = ['connection A', 'connection B'];
  const entries = names.map(name => connections?.find(c => c.name === name));
  const describe = c => `${c.name}: bound ${c.bound}, asked ${c.approvalRequests}, accepted ${c.approvalsAccepted}, session file ${c.sessionFileWhileOpen ? 'present' : 'absent'} while open, ${c.sessionFileAfterClose === false ? 'removed' : c.sessionFileAfterClose ? 'still present' : 'unchecked'} after close`;
  if (entries.some(c => !c)) return {status: 'BLOCKED', detail: `not every connection ran (${entries.filter(Boolean).map(describe).join('; ') || 'none'})`};
  const detail = entries.map(describe).join('; ');
  if (entries.some(c => !c.bound)) return {status: 'BLOCKED', detail: `a connection did not bind the fixture's document: ${detail}`};
  if (entries.some(c => c.approvalRequests === 0)) return {status: 'BLOCKED', detail: `the vendor did not ask on every connection (TextEdit may be on the machine-wide always-allow list): ${detail}`};
  const ok = entries.every(c => c.approvalsAccepted === c.approvalRequests && c.sessionFileWhileOpen && c.sessionFileAfterClose === false);
  return {status: ok ? 'PASS' : 'FAIL', detail};
}
