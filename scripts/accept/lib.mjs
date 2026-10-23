// Pure, testable pieces of the acceptance runner (scripts/accept-native.mjs): how sub-check statuses roll up, how the
// suites' summaries are read, the narrow TextEdit approval rule of the live fixture, the installed-tree snapshot that
// proves a reinstall mutated nothing, and the packaging/tracking policies of acceptance 10.
import {existsSync, lstatSync, readdirSync, readlinkSync} from 'node:fs';
import {join} from 'node:path';
import {SANDBOX_DISABLED_STEP, SANDBOX_SCOPED_STEP} from '../probe/trusted-roots.mjs';
import {SECRETS_OFF, STORE_UNREADABLE, failClosedSteps, refusedLaunchStep} from '../probe/fail-closed.mjs';
import {approvalsByBehaviour} from '../probe/lib.mjs';
export {tapDiagnostics} from './tap-diagnostics.mjs';

// A selected item must bring the results it consumes. Refuse rather than silently add live work or a whole suite
// (#197); item 14 is independent so the owner window can finish before unattended checks start.
export function acceptanceSelection(value) {
  if (value === undefined) return null;
  const parts = value.split(',');
  if (!parts.every(p => /^\d+$/.test(p) && Number(p) >= 1 && Number(p) <= 14))
    throw new Error('--items takes item numbers 1 to 14, comma-separated');
  const selected = new Set(parts.map(Number));
  const dependencies = {2: [1, 3], 3: [1], 6: [1, 4], 7: [1], 8: [1]};
  const missing = [...new Set([...selected].flatMap(id => dependencies[id] ?? []))].filter(id => !selected.has(id));
  if (missing.length) throw new Error(`selection requires item(s) ${missing.sort((a, b) => a - b).join(',')}; include them in --items`);
  return selected;
}

export const STATUSES = ['PASS', 'FAIL', 'BLOCKED'];
// A row that records an accepted consequence rather than checking a guarantee (the trusted roots a cell can write
// under an explicitly requested disabled sandbox, #34, #36): it is reported, never a failure, and does not change what the rest rolls up to.
export const INFO = 'INFO';

// An item passes only when it has checks and every one passed; any failure fails it; otherwise it is blocked. An item
// with nothing evaluated is BLOCKED, never PASS: a skipped check must not read as a pass. Informational rows are
// neutral; a roll-up of nothing but informational rows stays INFO.
export function rollup(statuses) {
  if (!statuses.length) return 'BLOCKED';
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.includes('BLOCKED')) return 'BLOCKED';
  if (statuses.every(status => status === INFO)) return INFO;
  return 'PASS';
}

// Doctor's runtime health as an acceptance runner needs it. Doctor's own `ok` also counts the remote-control rows
// (agent.*), which describe this Mac's launchd agent and console, not the runtime: an enrolled Mac whose screen is
// locked fails agent.console with nothing native wrong (#56). Those rows are informational here: reported, never
// gating. So are secrets.store and secrets.project, which describe the account's own store (~/.config/claude-secrets
// and the runner's project tier beneath it: a stray 0644 file there fails them), not the runtime. Every other failing row still fails, and the exit code and `ok` must agree with the
// rows (a report that contradicts itself is not health). A caller may name more informational rows. -> {healthy, detail}
export const DOCTOR_INFORMATIONAL = row => row.name.startsWith('agent.') || row.name === 'secrets.store' || row.name === 'secrets.project';
export function doctorHealth({code, doctor, informational = DOCTOR_INFORMATIONAL}) {
  if (!doctor || !Array.isArray(doctor.checks)) return {healthy: false, detail: `exit ${code}; no report`};
  const anyFail = doctor.checks.some(c => c.status === 'fail');
  const gating = doctor.checks.filter(c => c.status === 'fail' && !informational(c)).map(c => c.name);
  const info = doctor.checks.filter(c => informational(c) && c.status !== 'skip').map(c => `${c.name} ${c.status}`);
  const consistent = doctor.ok === !anyFail && code === (anyFail ? 1 : 0);
  return {
    healthy: consistent && !gating.length,
    detail: `exit ${code}; ok ${doctor.ok}${consistent ? '' : ' (disagrees with its rows)'}${gating.length ? `; failing: ${gating.join(', ')}` : ''}`
      + (info.length ? `; informational, not gating: ${info.join(', ')}` : ''),
  };
}

// Skips that are not missing coverage on this host (#157), each by its exact reason and only while its gate is really
// absent: a vendor differential needs a local research tree (its variable unset, or naming a path that does not exist;
// a clean checkout must not need one, acceptance 10); a platform-only test cannot run elsewhere; and a test of an npm
// package skips in a checkout without it (acceptance 10's clean clone, which proves npm test runs without
// node_modules, README). A declared skip whose gate is present (the tree there, the package installed), and any other
// skip, is missing coverage.
export const DECLARED_SKIPS = [
  {reason: 'set CUA_VENDOR_CUA to the readable @oai/cua directory to compare with the vendor facade', researchTree: 'CUA_VENDOR_CUA'},
  {reason: 'set CUA_VENDOR_CUA to the readable @oai/cua directory to compare with the vendor Sky facade', researchTree: 'CUA_VENDOR_CUA'},
  {reason: 'set CUA_VENDOR_BROWSER_CLIENT to the vendor\'s readable browser-client.js to compare', researchTree: 'CUA_VENDOR_BROWSER_CLIENT'},
  {reason: 'std\'s SUN_LEN refusal is the Linux vendor\'s connect', onlyOn: 'linux'},
  {reason: 'non-UTF-8 file names exist only on Linux (APFS refuses them with EILSEQ)', onlyOn: 'linux'},
  {reason: 'Linux only: a systemd user unit', onlyOn: 'linux'},
  {reason: 'needs the ws package: run npm ci', dependency: 'ws'},
  {reason: 'playwright-core not installed (npm ci): the drift check needs the pinned package', dependency: 'playwright-core'},
  {reason: 'markdown-it not installed (npm ci): the drift check needs the pinned package', dependency: 'markdown-it'},
  {reason: 'meriyah not installed (npm ci): the drift check needs the pinned package', dependency: 'meriyah'},
  {reason: 'zod is not installed (npm ci)', dependency: 'zod'},
];
// Each skipped test's reason in TAP output (`ok N - name # SKIP reason`, nested subtests too) -> Map reason -> count.
export function skipReasons(text) {
  const tally = new Map();
  for (const [, reason = ''] of text.replace(/\x1b\[[0-9;]*m/g, '').matchAll(/^\s*ok \d+ - .*? # SKIP(?: (.*?))?\s*$/gm)) tally.set(reason, (tally.get(reason) ?? 0) + 1);
  return tally;
}
// -> {accepted: [{reason, count}], other: [{reason, count}]} for this host (`env`, `platform`, `exists`) and the
// checkout the suite ran in (`root`, whose node_modules a dependency entry looks in).
export function judgeSkips(tally, {env = process.env, platform = process.platform, root, exists = existsSync, declared = DECLARED_SKIPS} = {}) {
  const applies = d => d.researchTree ? !env[d.researchTree] || !exists(env[d.researchTree])
    : d.dependency ? Boolean(root) && !exists(join(root, 'node_modules', d.dependency, 'package.json')) : d.onlyOn !== platform;
  const accepted = [], other = [];
  for (const [reason, count] of tally) (declared.some(d => d.reason === reason && applies(d)) ? accepted : other).push({reason, count});
  return {accepted, other};
}

// What a required suite's run proves. Exit 0 with no failure is not enough: a suite that executed nothing, or skipped
// or left TODO any test, has not shown its coverage, so it is BLOCKED (never PASS); a failure, cancellation, nonzero
// exit or a missing, incomplete or conflicting summary (testSummary's `problem`) is FAIL. The one exception is a skip
// declared above whose gate is absent on this host (`skips`, judgeSkips): it is listed with its count, not missing
// coverage, provided the reasons account for every skipped test.
export function suiteVerdict({code, totals, problem, skips = null}) {
  if (!totals) return {status: 'FAIL', reason: problem ?? 'no test summary'};
  if (code !== 0 || totals.fail > 0 || totals.cancelled > 0) return {status: 'FAIL', reason: `exit ${code}, ${totals.fail} failed, ${totals.cancelled} cancelled`};
  if (totals.tests === 0 || totals.pass === 0) return {status: 'BLOCKED', reason: 'no test was executed'};
  const accepted = skips?.accepted ?? [], acceptedCount = accepted.reduce((n, s) => n + s.count, 0);
  const declaredOnly = skips && !skips.other.length && acceptedCount === totals.skipped;
  const listed = accepted.length ? `; declared skips not applicable on this host: ${accepted.map(s => `${s.count} × "${s.reason}"`).join('; ')}` : '';
  if ((totals.skipped > 0 && !declaredOnly) || totals.todo > 0) {
    const undeclared = skips?.other.length ? `; not declared: ${skips.other.map(s => `${s.count} × "${s.reason || '(no reason)'}"`).join('; ')}` : '';
    return {status: 'BLOCKED', reason: `${totals.skipped} skipped and ${totals.todo} TODO of ${totals.tests}: required coverage did not run${undeclared}`};
  }
  if (totals.pass + totals.skipped !== totals.tests) return {status: 'FAIL', reason: `${totals.pass} of ${totals.tests} passed`};
  return {status: 'PASS', reason: `${totals.pass}/${totals.tests} passed${listed}`};
}

// The summary node:test prints at the end of a run. Two forms are read: the TAP reporter's `# tests N` lines, which the
// runners request (testReporterEnv), and the spec reporter's `ℹ tests N` lines, which Node 23 and later print by
// default even when stdout is not a terminal. Colour codes are ignored. A summary block is a run of consecutive counter
// lines of one form; every block must carry each of the six counts exactly once, and every complete block must agree,
// or the run has no totals (a truncated or contradictory summary is not evidence). The last block is the run's.
const SUMMARY_KEYS = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
const SUMMARY_LINE = /^(#|ℹ) (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) (\S+)$/;
export function testSummary(text) {
  const blocks = [];
  let open = null;
  for (const line of text.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)) {
    const match = line.match(SUMMARY_LINE);
    if (!match) { open = null; continue; }
    const [, form, key, value] = match;
    if (!open || open.form !== form) blocks.push(open = {form, lines: []});
    open.lines.push([key, value]);
  }
  if (!blocks.length) return {totals: null, problem: 'no test summary'};
  const complete = [];
  for (const {lines} of blocks) {
    const counts = lines.filter(([key]) => SUMMARY_KEYS.includes(key));
    const totals = Object.fromEntries(counts.map(([key, value]) => [key, /^\d+$/.test(value) ? Number(value) : NaN]));
    const whole = counts.length === SUMMARY_KEYS.length && SUMMARY_KEYS.every(key => Number.isInteger(totals[key]));
    if (!whole) return {totals: null, problem: 'incomplete test summary'};
    complete.push(Object.fromEntries(SUMMARY_KEYS.map(key => [key, totals[key]])));
  }
  const last = complete.at(-1);
  if (complete.some(totals => SUMMARY_KEYS.some(key => totals[key] !== last[key]))) return {totals: null, problem: 'conflicting test summaries'};
  return {totals: last, problem: null};
}

// The environment for a spawned test command (`npm test`): node:test's default reporter differs
// by Node version and terminal, so every node process in the run, nested runners included, is told through
// NODE_OPTIONS to report TAP on stdout. Reporter and destination options already there (either spelling, `=value` or
// separate value) are removed with their values; every other option is kept as written, quoting included. Acceptance
// can select its structured-event reporter; all other callers keep TAP unchanged.
export const TAP_REPORTER_OPTIONS = ['--test-reporter=tap', '--test-reporter-destination=stdout'];
const REPORTER_OPTIONS = new Set(['test-reporter', 'test-reporter-destination']);
export function testReporterEnv(env, {reporter = 'tap'} = {}) {
  const tokens = nodeOptionsTokens(env.NODE_OPTIONS ?? '');
  const kept = [];
  for (let i = 0; i < tokens.length; i++) {
    const {raw, value} = tokens[i];
    const option = value.startsWith('--') ? value.slice(2).split('=')[0].replaceAll('_', '-') : null;
    if (!REPORTER_OPTIONS.has(option)) { kept.push(raw); continue; }
    if (!value.includes('=')) i++;   // its value is the next argument
  }
  const selected = reporter === 'tap' ? TAP_REPORTER_OPTIONS : [`--test-reporter=${JSON.stringify(reporter)}`, '--test-reporter-destination=stdout'];
  return {...env, NODE_OPTIONS: [...kept, ...selected].join(' ')};
}

// NODE_OPTIONS split as Node splits it: whitespace separates arguments except inside double quotes, where a backslash
// escapes the next character. Each argument keeps its text as written (`raw`) and its unquoted value.
function nodeOptionsTokens(text) {
  const tokens = [];
  let raw = '', value = '', quoted = false, started = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!quoted && /\s/.test(ch)) {
      if (started) tokens.push({raw, value});
      raw = value = ''; started = false;
      continue;
    }
    started = true;
    raw += ch;
    if (ch === '"') quoted = !quoted;
    else if (quoted && ch === '\\' && i + 1 < text.length) { raw += text[++i]; value += text[i]; }
    else value += ch;
  }
  if (started) tokens.push({raw, value});
  return tokens;
}

// The vendor's app-use elicitation, exactly as the pinned computer-use policy builds it, for TextEdit and nothing
// else: the message names the app, the structured parameters carry its bundle identifier, and it is a form asking for
// no field (an object schema with no properties).
// The live TextEdit fixture accepts this one request (for the session only) and declines everything else.
export const TEXTEDIT_BUNDLE = 'com.apple.TextEdit';
export const isTextEditApproval = msg => isComputerUseApproval(msg, {app: TEXTEDIT_BUNDLE, display: 'TextEdit'});

// The same request for any one app: `app` the key it carries (macOS: the bundle id; Linux: the window's app as
// listWindows() names it, launch_app's id, or the whole desktop's key), `display` the name its message shows (Linux:
// the key itself). The Linux harnesses accept it for the app of the window they own and decline everything else.
export function isComputerUseApproval(msg, {app, display = app}) {
  if (msg?.method !== 'elicitation/create') return false;
  const params = msg.params ?? {};
  const meta = params._meta ?? {};
  const toolParams = meta.tool_params;
  const schema = params.requestedSchema;
  return typeof app === 'string' && app !== ''
    && params.message === `Allow Computer Use to use "${display}"?`
    && params.mode === 'form'
    && schema !== null && typeof schema === 'object' && schema.type === 'object'
    && schema.properties !== null && typeof schema.properties === 'object' && Object.keys(schema.properties).length === 0
    && meta.connector_id === 'computer-use'
    && meta.codex_approval_kind === 'mcp_tool_call'
    && toolParams !== null && typeof toolParams === 'object'
    && Object.keys(toolParams).length === 1 && toolParams.app === app;
}

// A server-request handler (scripts/accept/mcp-session.mjs onServerRequest, a parity client's answer) that accepts, for
// the session, exactly the approval of an app in `pinned()` (the apps of the windows the harness owns, read once known)
// and declines everything else, recording each request's app and answer in `asked`.
export function pinnedApprovals(pinned, asked = []) {
  return msg => {
    const app = msg?.params?._meta?.tool_params?.app ?? null;
    const accepted = [...pinned()].some(key => isComputerUseApproval(msg, {app: key}));
    asked.push({method: msg?.method ?? null, app, action: accepted ? 'accept' : 'decline'});
    return accepted ? {action: 'accept', content: {}} : {action: 'decline'};
  };
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
// sockets), and what the package needs to run and diagnose.
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
  'bin/cua.mjs', 'cua-shim.mjs', 'verify.mjs', 'scripts/probe/lib.mjs', 'scripts/probe/pinned-engine.mjs', 'scripts/accept/window-close.mjs', 'scripts/accept/key-guard.mjs', 'scripts/accept/front-window.swift', 'README.md', '.claude-plugin/plugin.json',
  'src/cli.mjs', 'src/mcp/server.mjs', 'src/services/sky.mjs', 'src/secrets/store.mjs',
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

// Acceptance 10's tracked-file check: a code or config file fails when it names the running account's home (`home`/)
// or holds a token-like string. The home rule has one declared exception: files that are by design the mini's own
// layout, whose account home is the controller's too (/Users/new): the gate's paths to the approved runtime and the
// runner's executable (scripts/mini-rules.mjs), the tests that pin them, and a sandbox recording made on the mini.
// Every other fixture uses a made-up home. Token-like strings have no exception anywhere.
export const MINI_LAYOUT_FILES = [
  'scripts/mini-rules.mjs', 'test/mini-pause.test.mjs', 'test/mini-rules.test.mjs', 'test/mini-worker-probe.test.mjs',
  'test/fixtures/sandbox/seatbelt/tmpdir-relative.json',
];
// -> {home, token}: whether `text` (the tracked file `path`) breaks either rule.
export const personalText = (path, text, home) => ({home: !MINI_LAYOUT_FILES.includes(path) && text.includes(home + '/'), token: tokenLike(text)});

// Acceptance 10's "clean clone needs no research trees": the lines of code that name `pattern`, a local research tree
// (the pattern itself lives only in accept-native.mjs, which the check does not search). A comment that cites one (a
// `//` before the name, or a line opening with * or #) is a citation, not a dependency.
export function researchTreeLines(text, pattern) {
  return text.split('\n').map((line, index) => ({line: index + 1, text: line})).filter(({text: line}) => {
    const at = line.indexOf(pattern);
    return at >= 0 && !line.slice(0, at).includes('//') && !/^\s*[*#]/.test(line);
  }).map(({line}) => line);
}

// Acceptance 6/7: every step scripts/probe-secrets.mjs records on a complete run, grouped into the spec's phases, with
// the items each phase is evidence for. A phase passes only when each of its steps ran and passed; a step that never
// ran is BLOCKED (requested, not executed). The trusted-root guarantee is proven under the scoped default; what an
// explicitly requested `disabled` lets a cell write is an informational row, the accepted consequence of #20.
const FIRST = 'first value: ';
export const PROBE_SECRETS_PHASES = [
  {items: [6], name: 'live: preconditions and create (generated sentinel, cua secrets set at a pty, temporary $HOME)', steps: ['preconditions', 'create']},
  {items: [6, 7], name: 'live: first substitution through store file → trusted wrapper → controlled target', steps: ['paste', 'type_text', 'set_value'].map(m => `${FIRST}${m} substitution`)},
  {items: [7], name: 'live: ordinary input, unsupported method, unknown/invalid label, unsupported shape', steps: ['ordinary input', 'unsupported method', 'unknown label', 'invalid label', 'unsupported shape', 'target saw only what it should'].map(s => FIRST + s)},
  {items: [6], name: 'live: replace with a second generated sentinel and substitute it', steps: ['replace', 'replaced value: type_text substitution']},
  {items: [6], name: 'live: failure output stays value-free (induced and real vendor failures)', steps: [`${FIRST}induced substituted-command failure`, `${FIRST}cell timeout during a substituted call`, 'real vendor: failure after substitution', 'real vendor: unknown label']},
  {items: [7], name: 'live: sandbox scoped (default): trusted roots unwritable, run directory and $TMPDIR writable', steps: [SANDBOX_SCOPED_STEP]},
  {items: [7], name: 'live (informational): sandbox disabled (CUA_SHIM_SANDBOX=disabled): trusted roots a cell could write, accepted under the trust model (#20)', steps: [SANDBOX_DISABLED_STEP]},
  // Since #115 M1 an unreadable store refuses the confined launch itself (scripts/probe/fail-closed.mjs).
  {items: [6, 7], name: 'live: fail closed before any input (secrets off; store unreadable: the launch is refused)', steps: [...failClosedSteps(SECRETS_OFF), refusedLaunchStep(STORE_UNREADABLE)]},
  {items: [6], name: 'live: every connection closed cleanly', steps: [`${FIRST}close`, 'replaced value: close', 'real serve: close', 'real serve (sandbox disabled): close']},
  {items: [6], name: 'live: no value in any observed channel or report', steps: ['scanner self-check', 'sentinel scan']},
  {items: [6], name: 'live: finally cleanup of the scenario-owned key and temporary homes', steps: ['cleanup']},
];
export const probePhasesFor = item => PROBE_SECRETS_PHASES.filter(phase => phase.items.includes(item));

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
  const notPassed = scenario.steps.filter(s => s.status !== 'PASS' && s.status !== INFO).map(s => `${s.name}: ${s.status}`);
  const informational = scenario.steps.filter(s => s.status === INFO).map(s => s.name);
  const status = STATUSES.includes(scenario.status) ? rollup([scenario.status, ...scenario.steps.map(s => s.status)]) : 'FAIL';
  return {name, status, detail: `scenario status ${scenario.status}; ${scenario.steps.length} steps${notPassed.length ? `; not passed: ${notPassed.join('; ')}` : ', all passed'}${informational.length ? `; informational: ${informational.join('; ')}` : ''}${unexpected.length ? `; steps no phase expects: ${unexpected.join('; ')}` : ''}`};
}

// Acceptance 8, from the live TextEdit fixture's approvals observed by behaviour (scripts/accept/engine-lane.mjs
// approvalLedger; no file the host keeps, #117 M3): connection A binds twice and B once, each first bind asking once and
// A's second asking nothing (the connection's memory), with nothing else declined (approvalsByBehaviour). Observed only
// when both connections bound the fixture's document and A's second bind ran; else BLOCKED. A first bind that asked
// nothing is BLOCKED on the vendor's engine (TextEdit may be on the vendor's own always-allow list) and a failure on
// cua's (`engine`), whose memory is per connection and never persists beyond one.
export function approvalObservation(connections, {engine} = {}) {
  const entries = ['connection A', 'connection B'].map(name => connections?.find(c => c.name === name));
  const judged = approvalsByBehaviour(entries.filter(Boolean));
  if (entries.some(c => !c)) return {status: 'BLOCKED', detail: `not every connection ran (${judged.detail || 'none'})`};
  if (entries.some(c => !c.bound)) return {status: 'BLOCKED', detail: `a connection did not bind the fixture's document: ${judged.detail}`};
  if (entries[0].binds.length < 2) return {status: 'BLOCKED', detail: `connection A's second bind did not run: ${judged.detail}`};
  if (judged.ok) return {status: 'PASS', detail: judged.detail};
  const unasked = judged.problems.every(p => /first bind asked nothing/.test(p));
  return {status: unasked && engine !== 'cua' ? 'BLOCKED' : 'FAIL', detail: `${judged.problems.join('; ')} (${judged.detail})`};
}
