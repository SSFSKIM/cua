// Pure, testable pieces of the Phase C acceptance (`node scripts/accept-chrome.mjs --all`, scripts/accept/chrome-all.mjs):
// how each of C1-C7 is judged from the evidence the runner gathers. The rule is the native runner's: only evidence that
// was produced and checked passes; anything skipped, missing or waiting on a human is FAIL or BLOCKED, and a BLOCKED
// check names the exact command and human step that would produce it.
import {isDeepStrictEqual} from 'node:util';
import {profileView} from '../../src/mcp/surface.mjs';
import {hostPathClass} from '../../src/profiles/chrome.mjs';
import {isOwnHostPath} from '../../src/chrome/registration.mjs';
import {forbiddenPaths, inventoryCheck, missingFromPackage, rollup, scenarioVerdict, suiteVerdict, testSummary, tokenLike} from './lib.mjs';

const check = (name, status, detail) => ({name, status, detail});

// ---- reading the actual node:test run ----------------------------------------------------------------------------

// node:test escapes `\` and `#` in TAP test names.
const tapName = title => title.replace(/\\/g, '\\\\').replace(/#/g, '\\#');

// The outcome of every test called exactly `title` in a TAP run: PASS only when at least one ran and all passed; a
// skipped or TODO one is BLOCKED (its coverage did not run); a failure or no such test is FAIL.
export function tapTestStatus(tap, title) {
  const name = tapName(title);
  const lines = String(tap ?? '').split('\n').map(line => line.trim()).filter(line => {
    const match = line.match(/^(?:not )?ok \d+ - (.*)$/);
    return match && (match[1] === name || match[1].startsWith(`${name} # `));
  });
  if (!lines.length) return {status: 'FAIL', detail: 'no test of this name ran'};
  if (lines.some(line => line.startsWith('not ok'))) return {status: 'FAIL', detail: 'the test failed'};
  if (lines.some(line => / # (SKIP|TODO)\b/i.test(line))) return {status: 'BLOCKED', detail: 'the test was skipped or left TODO'};
  return {status: 'PASS', detail: 'ran and passed'};
}

// ---- C2 ------------------------------------------------------------------------------------------------------------

// The wrapper's substitution matrix as the spec states it, each claim tied to the test in test/services-browser.test.mjs
// that proves it.
export const C2_MATRIX = [
  {claim: 'both eligible shapes (playwright_locator_fill value; tab_ax_action text and value) substitute an exact reference', title: 'an exact reference in each eligible field is replaced by the stored value before the vendor sees it'},
  {claim: 'ordinary values and every other command pass through unchanged', title: 'ordinary values and every other command are delegated unchanged and never read a secret'},
  {claim: 'invalid and unknown labels fail before input, value-free', title: 'an unknown label, an invalid label and broker failures fail before input, value-free'},
  {claim: 'secrets off or unavailable fail closed', title: 'with secrets turned off or unavailable, a reference fails closed and is never entered literally'},
  {claim: 'an unsupported shape fails before input', title: 'a reference in a shape other than the pinned one fails before input instead of guessing'},
  {claim: 'a vendor rejection after substitution becomes a value-free classification', title: 'a substituted command the vendor rejects becomes a bounded value-free classification'},
  {claim: 'an {ok:false} envelope after substitution becomes the same classification', title: 'an {ok:false} recovery envelope after substitution is rewritten to the same value-free classification'},
];

export const matrixChecks = tap => C2_MATRIX.map(({claim, title}) => {
  const outcome = tapTestStatus(tap, title);
  return check(`hermetic: ${claim}`, outcome.status, `npm test, "${title}": ${outcome.detail}`);
});

// Every step `node scripts/accept-chrome.mjs --live` records on a complete run.
export const C2_LIVE_STEPS = [
  'preconditions', 'seed-disposable-secret', 'browser-surface', 'profiles-list', 'select-profile-backend', 'create-tab', 'owned-page',
  'fill-secret-reference', 'page-digest-matches-sentinel', 'induced-failure-value-free', 'screenshot', 'close-created-tab', 'end-task',
  'serve-exit', 'cleanup-disposable-secret', 'elicitations-own-origin-only', 'sentinel-scan',
];
const C2_SCENARIO = 'C2-live-browser-secret-round-trip';
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// A supplied live report counts only if it is C2's scenario, for the personal profile, passed as a whole with every
// expected step run and passed, and left no tab behind.
export function liveRoundTripChecks(report, {profile = 'personal', prefix = 'live'} = {}) {
  if (!isObject(report) || report.scenario !== C2_SCENARIO || !Array.isArray(report.steps))
    return [check(`${prefix}: supplied report`, 'FAIL', `not an accept-chrome --live report (scenario ${isObject(report) ? JSON.stringify(report.scenario ?? null) : typeof report})`)];
  return [
    check(`${prefix}: profile`, report.profile === profile ? 'PASS' : 'FAIL', `the run drove profile ${JSON.stringify(report.profile ?? null)}; C2 needs ${profile}`),
    scenarioVerdict(`${prefix}: accept-chrome --live verdict${report.at ? ` (run at ${report.at})` : ''}`, report, C2_LIVE_STEPS),
    inventoryCheck(`${prefix}: every expected step ran and passed`, report.steps, C2_LIVE_STEPS),
    check(`${prefix}: no leftover tab`, report.leftover === 'none' ? 'PASS' : 'FAIL', `leftover ${JSON.stringify(report.leftover ?? null)}`),
  ];
}

const LIVE_REPORT = '/tmp/cua-accept-chrome.json';
const LIVE_COMMAND = `node scripts/accept-chrome.mjs --live --profile personal --report ${LIVE_REPORT}`;

// C2's live part when no report was supplied: why, and what produces it. `personal` is its default-home registry entry.
export function c2LiveBlocked(personal) {
  const rerun = `then rerun this runner with --c2-report ${LIVE_REPORT}`;
  if (!personal) return check('live: round trip through cua serve', 'BLOCKED', `personal is not registered in this home: node bin/cua.mjs profiles add personal --chrome-profile Default, bind it, run ${LIVE_COMMAND}, ${rerun}`);
  if (personal.reason === 'not_bound' || personal.reason === 'binding_stale')
    return check('live: round trip through cua serve', 'BLOCKED', `personal ${personal.reason === 'not_bound' ? 'not bound' : 'binding stale (its extension instance is no longer live)'}; user pick pending. The user picks personal's backend from \`node bin/cua.mjs profiles bind personal\` (instance ids with tab counts), then node bin/cua.mjs profiles bind personal --extension-instance-id <picked id>, then ${LIVE_COMMAND} (Chrome open on the Default profile), ${rerun}`);
  if (!personal.ready) return check('live: round trip through cua serve', 'BLOCKED', `personal is not ready (${personal.reason}); once it is, run ${LIVE_COMMAND}, ${rerun}`);
  return check('live: round trip through cua serve', 'BLOCKED', `no live report was supplied; personal is ready: run ${LIVE_COMMAND} (Chrome open on the Default profile), ${rerun}`);
}

// ---- C6's --replace live gate ----------------------------------------------------------------------------------------

// What a supplied gate report must hold (the controller assembles it from the steps below):
//   {scenario: 'C6-replace-live-gate', servingHost: {pathClass: 'cua'}, roundTrip: <the accept-chrome --live report run
//    while cua's host was registered>, unregister: <the `cua chrome unregister --json` output>}
export function replaceGateChecks(report) {
  const name = 'live: --replace gate';
  if (!isObject(report) || report.scenario !== 'C6-replace-live-gate') return [check(`${name}: supplied report`, 'FAIL', 'not a C6-replace-live-gate report')];
  const rows = Array.isArray(report.unregister?.browsers) ? report.unregister.browsers.filter(b => !['absent', 'not_ours'].includes(b?.action)) : [];
  const restored = rows.length > 0 && rows.every(b => b.restoration === 'restored') && report.unregister.ok === true && report.unregister.blocked === false;
  return [
    check(`${name}: the backend was served by cua's host`, report.servingHost?.pathClass === 'cua' ? 'PASS' : 'FAIL', `serving host class ${JSON.stringify(report.servingHost?.pathClass ?? null)}`),
    ...liveRoundTripChecks(report.roundTrip, {prefix: `${name}: round trip`}),
    check(`${name}: unregister restored every replaced manifest`, restored ? 'PASS' : 'FAIL',
      rows.length ? rows.map(b => `${b.browser} ${b.action}/${b.restoration ?? 'none'}`).join(', ') + `; blocked ${report.unregister?.blocked}` : 'nothing was removed or restored'),
  ];
}

export const REPLACE_GATE_STEPS = [
  'with the user, Chrome open with the OpenAI extension in personal (Default) and codex.login pass; never kill the running desktop hosts',
  'node bin/cua.mjs chrome register --replace (prints the two consequences, backs up the five desktop manifests to <home>/chrome/manifest-backup/, writes cua\'s)',
  'node bin/cua.mjs doctor --json (chrome.host.registered: pass, cua)',
  'the user makes the extension reconnect (disable/enable it at chrome://extensions, or reopen its side panel)',
  'ps -axo pid=,ppid=,comm= | grep \'ChatGPT for Chrome\' (a host under <home>/runtimes/.../chrome-plugin/)',
  `${LIVE_COMMAND.replace(LIVE_REPORT, '/tmp/cua-m12-replace-roundtrip.json')}`,
  'node bin/cua.mjs chrome unregister --json (restored, verified byte-for-byte, for every browser)',
  'node bin/cua.mjs doctor --json (chrome.host.registered: pass, desktop)',
  'assemble {scenario: "C6-replace-live-gate", servingHost: {pathClass: "cua"}, roundTrip: <that report>, unregister: <that output>} and rerun this runner with --c6-report <file>',
];

export const replaceGateBlocked = () => check('live: --replace gate', 'BLOCKED',
  `needs the user (docs/evidence/m12-host-placement.md): ${REPLACE_GATE_STEPS.map((s, i) => `(${i + 1}) ${s}`).join('; ')}`);

// ---- C1 ------------------------------------------------------------------------------------------------------------

const TOOLS = ['js', 'js_reset', 'end_task', 'secrets_list'];

export function verifyCheck(name, {code, report}, {browser}) {
  if (!isObject(report)) return check(name, 'FAIL', `exit ${code}; no report`);
  const tools = [...TOOLS, ...(browser ? ['profiles_list'] : [])];
  const surfaces = browser ? ['computer', 'browser'] : ['computer'];
  const ok = code === 0 && Array.isArray(report.problems) && !report.problems.length && isDeepStrictEqual(report.tools, tools)
    && isDeepStrictEqual(report.surfaces, surfaces) && report.browserApiDocumented === browser;
  return check(name, ok ? 'PASS' : 'FAIL', `exit ${code}; surfaces ${report.surfaces?.join(',')}; tools ${report.tools?.join(', ')}; browser API documented ${report.browserApiDocumented}; problems: ${report.problems?.length ? report.problems.join('; ') : 'none'}`);
}

// The environment of the launch record serve builds for these surfaces: by default no browser variable at all; with the
// browser surface exactly the vendor service path and the Chrome-only backend filter, never a backend list, network or
// security override.
export function launchEnvCheck(name, env, {browser}) {
  const browserKeys = Object.keys(env).filter(k => /BROWSER/.test(k)).sort();
  let services = [];
  try { services = Object.keys(JSON.parse(env.NODE_REPL_TRUSTED_SERVICES)); } catch {}
  const ok = browser
    ? env.CUA_REPL_ENABLED_SURFACES === 'computer,browser' && isDeepStrictEqual(browserKeys, ['BROWSER_USE_AVAILABLE_BACKENDS', 'CUA_BROWSER_VENDOR_SERVICE'])
      && env.BROWSER_USE_AVAILABLE_BACKENDS === 'chrome' && isDeepStrictEqual(services, ['sky', 'browser'])
    : env.CUA_REPL_ENABLED_SURFACES === 'computer' && !browserKeys.length && isDeepStrictEqual(services, ['sky']);
  return check(name, ok ? 'PASS' : 'FAIL', `CUA_REPL_ENABLED_SURFACES ${env.CUA_REPL_ENABLED_SURFACES}; trusted services ${services.join(', ') || 'none'}; browser variables: ${browserKeys.join(', ') || 'none'}`);
}

// ---- C3 ------------------------------------------------------------------------------------------------------------

const EXPECTED_SCRATCH = {personal: 'not_bound', school: 'extension_not_installed', work: 'extension_not_installed'};
const describe = list => list.map(p => `${p.key} ${p.ready ? 'ready' : `not ready (${p.reason})`}`).join(', ') || 'no profiles registered';

export function scratchListCheck(list) {
  const ok = Array.isArray(list) && isDeepStrictEqual(list.map(p => p.key), Object.keys(EXPECTED_SCRATCH))
    && list.every(p => p.ready === false && p.reason === EXPECTED_SCRATCH[p.key]);
  return check('scratch home: list shows personal not yet bound and work/school not ready (extension manifest absent)', ok ? 'PASS' : 'FAIL', Array.isArray(list) ? describe(list) : 'no list');
}

// The default home's registry, read only: personal ready after its bind, work and school not ready for the absent
// extension. Instance ids are not reported.
export function defaultRegistryChecks(statuses) {
  const byKey = new Map((statuses ?? []).map(p => [p.key, p]));
  const personal = byKey.get('personal');
  const checks = [personal?.ready
    ? check('default home: personal ready after bind', 'PASS', 'personal is bound to a live-picked extension instance and its extension is installed')
    : check('default home: personal ready after bind', 'BLOCKED', personal?.reason === 'not_bound' || personal?.reason === 'binding_stale'
      ? `personal ${personal.reason === 'not_bound' ? 'not bound' : 'binding stale (its extension instance is no longer live)'}; user pick pending: the user picks its backend, then node bin/cua.mjs profiles bind personal --extension-instance-id <picked id>`
      : personal ? `personal not ready (${personal.reason})` : 'personal is not registered here: node bin/cua.mjs profiles add personal --chrome-profile Default')];
  for (const key of ['work', 'school']) {
    const p = byKey.get(key);
    checks.push(!p ? check(`default home: ${key} not ready (extension absent)`, 'BLOCKED', `${key} is not registered in this home (the scratch home shows the behaviour)`)
      : check(`default home: ${key} not ready (extension absent)`, !p.ready && p.reason === 'extension_not_installed' ? 'PASS' : 'FAIL', p.ready ? 'ready' : `not ready (${p.reason})`));
  }
  return checks;
}

// ---- C4 ------------------------------------------------------------------------------------------------------------

export const BROWSER_RULES = [
  {rule: 'select a registered profile with cua.getBrowser({extensionInstanceId})', pattern: /cua\.getBrowser\(\{extensionInstanceId\}\)/},
  {rule: 'DOM-only input through tab.playwright locators', pattern: /tab\.playwright/},
  {rule: 'createBrowserTab with timeout_ms of at least 60000', pattern: /timeout_ms of at least 60000/},
  {rule: 'a possible leftover tab after a create timeout', pattern: /tab may still have opened/},
];

export function hostNotesCheck(instructions) {
  if (typeof instructions !== 'string') return check('host notes carry the browser rules', 'FAIL', 'no instructions');
  const missing = BROWSER_RULES.filter(r => !r.pattern.test(instructions)).map(r => r.rule);
  const ok = !missing.length && instructions.length <= 2048;
  return check('host notes carry the browser rules', ok ? 'PASS' : 'FAIL', `${instructions.length} characters (limit 2048); ${missing.length ? `missing: ${missing.join('; ')}` : `all present: ${BROWSER_RULES.map(r => r.rule).join('; ')}`}`);
}

// profiles_list over MCP against the registry it reads: the same keys, readiness and reasons, an instance id only when
// ready, and no directory names. Liveness is checked on each request, so a profile the registry has ready may come
// back not ready for a stale binding or unlistable backends, without its instance id.
const LIVENESS_REASONS = ['binding_stale', 'backends_unlistable'];
const viewMatches = (view, status) => isDeepStrictEqual(view, profileView(status))
  || (status.ready && LIVENESS_REASONS.includes(view?.reason) && isDeepStrictEqual(view, {key: status.key, ready: false, reason: view.reason}));
export function profilesListCheck(structured, statuses) {
  const name = 'profiles_list returns the registered keys with readiness';
  if (structured?.status !== 'ok' || !Array.isArray(structured.profiles)) return check(name, 'FAIL', `status ${JSON.stringify(structured?.status ?? null)}${structured?.code ? ` (${structured.code})` : ''}`);
  const ok = structured.profiles.length === statuses.length && structured.profiles.every((view, i) => viewMatches(view, statuses[i]))
    && structured.profiles.every(p => !('chromeProfileDirectory' in p));
  return check(name, ok ? 'PASS' : 'FAIL', `${describe(structured.profiles)}; ${ok ? 'equal to the registry (instance ids only for ready profiles, no directories)' : 'differs from the registry'}`);
}

// ---- C5 ------------------------------------------------------------------------------------------------------------

// Doctor on this Mac: the expected statuses pass; a check whose evidence needs the user's environment (Chrome open,
// the server's login) is BLOCKED with what to do; a missing check or an unhealthy report is FAIL.
export function doctorChromeChecks({code, doctor}) {
  if (!isObject(doctor) || !Array.isArray(doctor.checks)) return [check('doctor --json', 'FAIL', `exit ${code}; no report`)];
  const get = name => doctor.checks.find(c => c.name === name);
  const out = [check('doctor --json: runtime health', code === 0 && doctor.ok === true ? 'PASS' : 'FAIL', `exit ${code}; ok ${doctor.ok}`)];
  const expect = (name, judge) => {
    const c = get(name);
    // Doctor has a per-profile check only for a registered profile.
    if (!c && name === 'chrome.extension.personal') return out.push(check(name, 'BLOCKED', 'personal is not registered in this home: node bin/cua.mjs profiles add personal --chrome-profile Default'));
    if (!c) return out.push(check(name, 'FAIL', 'missing from doctor'));
    const [status, why] = judge(c);
    out.push(check(name, status, `${c.status}: ${c.detail}${why ? ` (${why})` : ''}`));
  };
  expect('chrome.extension.personal', c => c.status === 'pass' ? ['PASS'] : c.status === 'blocked' ? ['BLOCKED', 'install the OpenAI extension in the Default profile; cua never does'] : ['FAIL']);
  expect('chrome.host.registered', c => c.status !== 'pass' ? [c.status === 'blocked' ? 'BLOCKED' : 'FAIL', 'expected the desktop\'s registration on this Mac']
    : /^desktop:/.test(c.detail) ? ['PASS'] : /^cua:/.test(c.detail) ? ['BLOCKED', 'cua\'s host is registered: the --replace gate is in progress or was left registered; rerun after node bin/cua.mjs chrome unregister']
      : ['FAIL', 'expected the desktop\'s registration on this Mac']);
  expect('chrome.hosts.live', c => c.status === 'pass' ? ['PASS'] : c.status === 'blocked' ? ['BLOCKED', 'open Chrome on the Default profile with the OpenAI extension enabled, then rerun'] : ['FAIL']);
  expect('codex.login', c => c.status === 'pass' ? ['PASS'] : c.status === 'blocked' ? ['BLOCKED', 'the user runs node bin/cua.mjs login at a terminal'] : ['FAIL']);
  return out;
}

// ---- C6: when the live refusal and the no-op unregister may run --------------------------------------------------------

// A browser's manifest slot from its text (null when absent): cua's only at cua's pinned host path in this home.
export function classifySlot(text, {home, userHome, suffixes}) {
  if (text === null || text === undefined) return {state: 'absent'};
  let manifest = null;
  try { manifest = JSON.parse(text); } catch {}
  const hostPath = typeof manifest?.path === 'string' ? manifest.path : null;
  if (isOwnHostPath(hostPath, {home, suffixes})) return {state: 'ours'};
  return {state: 'foreign', pathClass: hostPath ? hostPathClass(hostPath, {cuaHome: home, userHome}) : 'unreadable'};
}

// The refusal is shown only where it must refuse (a foreign manifest is present and none is cua's: register refuses as
// a whole before writing); the no-op only where nothing is cua's (unregister would otherwise remove a live
// registration, the user's --replace gate included).
export function registrationGuard(slots) {
  const ours = slots.filter(s => s.state === 'ours').map(s => s.browser);
  if (ours.length) {
    const reason = `cua's host is registered in ${ours.join(', ')} (the --replace gate is in progress or was left registered); not touched. Rerun after node bin/cua.mjs chrome unregister`;
    return {refusal: {run: false, reason}, noop: {run: false, reason}};
  }
  const foreign = slots.some(s => s.state === 'foreign');
  return {refusal: foreign ? {run: true} : {run: false, reason: 'no manifest cua did not write is present, so register would write rather than refuse; not run'}, noop: {run: true}};
}

// ---- C7 ------------------------------------------------------------------------------------------------------------

// The modules Phase C added; the pack must carry them (and every other tracked src/ module).
export const PHASE_C_MODULES = [
  'src/chrome/registration.mjs', 'src/profiles/bind.mjs', 'src/profiles/checks.mjs', 'src/profiles/chrome.mjs', 'src/profiles/commands.mjs',
  'src/profiles/inventory.mjs', 'src/profiles/registry.mjs', 'src/runtime/chrome-component.mjs', 'src/runtime/login.mjs',
  'src/services/browser.mjs', 'src/services/secret-input.mjs',
];

// Beyond the native slice's forbidden paths: the Chrome host and its plugin tree, browser registrations and their
// backups, the profile registry and anything from a CUA_HOME's state.
const PHASE_C_FORBIDDEN = [
  [/(^|\/)ChatGPT for Chrome$/, 'the Chrome host binary'],
  [/(^|\/)(chrome-plugin|extension-host)\//, 'the placed Chrome plugin'],
  [/(^|\/)NativeMessagingHosts\/|com\.openai\.codexextension\.json$/, 'a browser registration'],
  [/(^|\/)manifest-backup\//, 'a registration backup'],
  [/(^|\/)profiles\.json$/, 'a profile registry'],
  [/(^|\/)state\//, 'CUA_HOME state'],
];

const MAGIC = [
  [[0xcf, 0xfa, 0xed, 0xfe], 'Mach-O'], [[0xce, 0xfa, 0xed, 0xfe], 'Mach-O'], [[0xfe, 0xed, 0xfa, 0xcf], 'Mach-O'], [[0xfe, 0xed, 0xfa, 0xce], 'Mach-O'],
  [[0xca, 0xfe, 0xba, 0xbe], 'Mach-O'], [[0x50, 0x4b, 0x03, 0x04], 'zip archive'], [[0x1f, 0x8b], 'gzip archive'],
];
export const binaryKind = bytes => MAGIC.find(([magic]) => magic.every((b, i) => bytes[i] === b))?.[1] ?? null;

// `files`: what `npm pack --dry-run` packs; `tracked`: the clone's tracked files; `read(path)`: a packed file's bytes.
export function packChecks({files, tracked, read, userHome}) {
  const packed = new Set(files);
  const missing = [...missingFromPackage(files), ...PHASE_C_MODULES.filter(p => !packed.has(p)),
    ...tracked.filter(p => p.startsWith('src/') && !PHASE_C_MODULES.includes(p) && !packed.has(p))];
  const badPaths = [...forbiddenPaths(files), ...files.flatMap(p => PHASE_C_FORBIDDEN.filter(([pattern]) => pattern.test(p)).map(([, why]) => `${p} (${why})`))];
  const contents = files.map(path => ({path, bytes: read(path)}));
  const binaries = contents.map(({path, bytes}) => [path, binaryKind(bytes)]).filter(([, kind]) => kind).map(([path, kind]) => `${path} (${kind})`);
  const personal = contents.filter(({bytes}) => { const text = bytes.toString('latin1'); return tokenLike(text) || text.includes(userHome + '/'); }).map(({path}) => path);
  const untracked = files.filter(p => !tracked.includes(p));
  return [
    check('pack carries the Phase C modules and every tracked src module', files.length && !missing.length ? 'PASS' : 'FAIL',
      `${files.length} files; Phase C modules: ${PHASE_C_MODULES.length}${missing.length ? `; missing ${missing.join(', ')}` : ', all present'}`),
    check('pack holds no archive, host binary, registration, runtime state or credential', files.length && !badPaths.length && !binaries.length ? 'PASS' : 'FAIL',
      `forbidden paths: ${badPaths.join(', ') || 'none'}; binary content (Mach-O/zip/gzip magic): ${binaries.join(', ') || 'none'}`),
    check('no packed file holds a token-like string or names this user\'s home', files.length && !personal.length ? 'PASS' : 'FAIL', personal.join(', ') || 'none'),
    check('every packed file is tracked', files.length && !untracked.length ? 'PASS' : 'FAIL', untracked.join(', ') || 'all tracked'),
  ];
}

// `npm run test:helper`: swift-testing's summary line and the Node-driven executable tests' node:test summary must both show
// executed, passing coverage.
export function helperSuiteVerdict({code, text}) {
  const swift = text.match(/Test run with (\d+) tests? in \d+ suites? (passed|failed)/);
  const nodeVerdict = suiteVerdict({code, ...testSummary(text)});
  const swiftSkipped = /^\S*\s*Test .* skipped/m.test(text);
  const swiftStatus = code !== 0 || !swift || swift[2] !== 'passed' ? 'FAIL' : Number(swift[1]) === 0 || swiftSkipped ? 'BLOCKED' : 'PASS';
  return {status: rollup([swiftStatus, nodeVerdict.status]),
    detail: `exit ${code}; Swift ${swift ? `${swift[1]} tests ${swift[2]}${swiftSkipped ? ', some skipped' : ''}` : 'summary not found'}; Node-driven executable tests: ${nodeVerdict.reason}`};
}
