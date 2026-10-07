// Pure, testable pieces of the Phase C acceptance (`node scripts/accept-chrome.mjs --all`, scripts/accept/chrome-all.mjs):
// how each of C1-C7 is judged from the evidence the runner gathers. The rule is the native runner's: only evidence that
// was produced and checked passes; anything skipped, missing or waiting on a human is FAIL or BLOCKED, and a BLOCKED
// check names the exact command and human step that would produce it.
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {profileView} from '../../src/mcp/surface.mjs';
import {chromeUserData, hostPathClass, OPENAI_EXTENSION_ID, PERMISSION_FIX} from '../../src/profiles/chrome.mjs';
import {awaitsLiveEvidence, REASONS} from '../../src/profiles/registry.mjs';
import {browsersFor, isOwnHostPath} from '../../src/chrome/registration.mjs';
import {doctorHealth, forbiddenPaths, inventoryCheck, missingFromPackage, rollup, scenarioVerdict, tokenLike} from './lib.mjs';

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
  {claim: 'invalid and unknown labels fail before input, value-free', title: 'an unknown label, an invalid label and store refusals fail before input, value-free'},
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

// The live profile is the runner's --profile (default personal): the registered key the supplied live reports drove.

// A supplied live report counts only if it is C2's scenario, for the live profile, passed as a whole with every
// expected step run and passed, and left no tab behind.
export function liveRoundTripChecks(report, {profile = 'personal', prefix = 'live'} = {}) {
  if (!isObject(report) || report.scenario !== C2_SCENARIO || !Array.isArray(report.steps))
    return [check(`${prefix}: supplied report`, 'FAIL', `not an accept-chrome --live report (scenario ${isObject(report) ? JSON.stringify(report.scenario ?? null) : typeof report})`)];
  return [
    check(`${prefix}: profile`, report.profile === profile ? 'PASS' : 'FAIL', `the run drove profile ${JSON.stringify(report.profile ?? null)}; --profile is ${profile}`),
    scenarioVerdict(`${prefix}: accept-chrome --live verdict${report.at ? ` (run at ${report.at})` : ''}`, report, C2_LIVE_STEPS),
    inventoryCheck(`${prefix}: every expected step ran and passed`, report.steps, C2_LIVE_STEPS),
    check(`${prefix}: no leftover tab`, report.leftover === 'none' ? 'PASS' : 'FAIL', `leftover ${JSON.stringify(report.leftover ?? null)}`),
  ];
}

const LIVE_REPORT = '/tmp/cua-accept-chrome.json';
const liveCommand = (profile, report = LIVE_REPORT) => `node scripts/accept-chrome.mjs --live --profile ${profile} --report ${report}`;
const ADD_HINT = profile => `pass --profile <a registered key>, or node bin/cua.mjs profiles add ${profile} --chrome-profile <its Chrome profile directory>`;
const pickPending = (p, profile) => `${profile} ${p.reason === 'not_bound' ? 'not bound' : 'binding stale (its extension instance is no longer live)'}; user pick pending`;

// A supplied live report is judged against this home: the live profile must be registered here and bound (its report's
// `profile` is compared separately). `entry` is its file-based registry status; instance ids are not reported.
export function liveProfileCheck(entry, profile, {prefix = 'live', registryError} = {}) {
  const name = `${prefix}: profile ${profile} is registered and bound in this home`;
  if (registryError) return check(name, 'FAIL', `the default profile registry cannot be read (${registryError})`);
  if (!entry) return check(name, 'FAIL', `${profile} is not registered in this home; ${ADD_HINT(profile)}`);
  return check(name, entry.extensionInstanceId ? 'PASS' : 'FAIL', `${profile} -> Chrome profile "${entry.chromeProfileDirectory}"; ${entry.extensionInstanceId ? 'bound' : 'not bound'}`);
}

// C2's live part when no report was supplied: why, and what produces it. `entry` is the live profile's default-home
// registry status.
export function c2LiveBlocked(entry, profile = 'personal') {
  const rerun = `then rerun this runner with --c2-report ${LIVE_REPORT}${profile === 'personal' ? '' : ` --profile ${profile}`}`;
  const command = liveCommand(profile);
  const open = entry ? ` (Chrome open on the "${entry.chromeProfileDirectory}" profile)` : '';
  if (!entry) return check('live: round trip through cua serve', 'BLOCKED', `${profile} is not registered in this home: ${ADD_HINT(profile)}, bind it, run ${command}, ${rerun}`);
  if (entry.reason === 'not_bound' || entry.reason === 'binding_stale')
    return check('live: round trip through cua serve', 'BLOCKED', `${pickPending(entry, profile)}. The user picks ${profile}'s backend from \`node bin/cua.mjs profiles bind ${profile}\` (instance ids with tab counts), then node bin/cua.mjs profiles bind ${profile} --extension-instance-id <picked id>, then ${command}${open}, ${rerun}`);
  if (awaitsLiveEvidence(entry))
    return check('live: round trip through cua serve', 'BLOCKED', `no live report was supplied; ${profile} is bound but this process may not read Chrome's data directory (${entry.chromeDataError ?? 'unknown'}), so the live run decides on the live check: run ${command}${open}, ${rerun}`);
  if (!entry.ready) return check('live: round trip through cua serve', 'BLOCKED', `${profile} is not ready (${entry.reason}); once it is, run ${command}, ${rerun}`);
  return check('live: round trip through cua serve', 'BLOCKED', `no live report was supplied; ${profile} is ready: run ${command}${open}, ${rerun}`);
}

// ---- C6's --replace live gate ----------------------------------------------------------------------------------------

// What a supplied gate report must hold (the controller assembles it from the steps below):
//   {scenario: 'C6-replace-live-gate', servingHost: {pathClass: 'cua'}, roundTrip: <the accept-chrome --live report run
//    while cua's host was registered>, unregister: <the `cua chrome unregister --json` output>}
export function replaceGateChecks(report, {profile = 'personal'} = {}) {
  const name = 'live: --replace gate';
  if (!isObject(report) || report.scenario !== 'C6-replace-live-gate') return [check(`${name}: supplied report`, 'FAIL', 'not a C6-replace-live-gate report')];
  const rows = Array.isArray(report.unregister?.browsers) ? report.unregister.browsers.filter(b => !['absent', 'not_ours'].includes(b?.action)) : [];
  const restored = rows.length > 0 && rows.every(b => b.restoration === 'restored') && report.unregister.ok === true && report.unregister.blocked === false;
  return [
    check(`${name}: the backend was served by cua's host`, report.servingHost?.pathClass === 'cua' ? 'PASS' : 'FAIL', `serving host class ${JSON.stringify(report.servingHost?.pathClass ?? null)}`),
    ...liveRoundTripChecks(report.roundTrip, {profile, prefix: `${name}: round trip`}),
    check(`${name}: unregister restored every replaced manifest`, restored ? 'PASS' : 'FAIL',
      rows.length ? rows.map(b => `${b.browser} ${b.action}/${b.restoration ?? 'none'}`).join(', ') + `; blocked ${report.unregister?.blocked}` : 'nothing was removed or restored'),
  ];
}

const replaceGateSteps = profile => [
  `with the user, Chrome open with the OpenAI extension in ${profile}'s Chrome profile and codex.login pass; never kill the running desktop hosts`,
  'node bin/cua.mjs chrome register --replace (prints the two consequences, backs up the five desktop manifests to <home>/chrome/manifest-backup/, writes cua\'s)',
  'node bin/cua.mjs doctor --json (chrome.host.registered: pass, cua)',
  'the user makes the extension reconnect (disable/enable it at chrome://extensions, or reopen its side panel)',
  'ps -axo pid=,ppid=,comm= | grep \'ChatGPT for Chrome\' (a host under <home>/runtimes/.../chrome-plugin/)',
  liveCommand(profile, '/tmp/cua-m12-replace-roundtrip.json'),
  'node bin/cua.mjs chrome unregister --json (restored, verified byte-for-byte, for every browser)',
  'node bin/cua.mjs doctor --json (chrome.host.registered: pass, desktop)',
  `assemble {scenario: "C6-replace-live-gate", servingHost: {pathClass: "cua"}, roundTrip: <that report>, unregister: <that output>} and rerun this runner with --c6-report <file>${profile === 'personal' ? '' : ` --profile ${profile}`}`,
];

export const replaceGateBlocked = (profile = 'personal') => check('live: --replace gate', 'BLOCKED',
  `needs the user (docs/evidence/m12-host-placement.md): ${replaceGateSteps(profile).map((s, i) => `(${i + 1}) ${s}`).join('; ')}`);

// ---- C6's desktop-absent live gate (issue #9) ----------------------------------------------------------------------

// On a machine without the desktop app no browser holds a registration, so there is nothing to refuse, replace or
// restore. C6 there means: register writes cua's manifests into empty slots only (nothing backed up, the slots then
// name cua's host), Chrome launches that placed host when the extension wakes, the round trip passes through it, and
// unregister removes cua's manifests so every slot is absent again, as before. The controller assembles:
//   {scenario: 'C6-desktop-absent-live-gate', slotsBefore, register: <`cua chrome register --json`>, slotsRegistered,
//    servingHost: {pathClass: 'cua'}, roundTrip: <accept-chrome --live report>, unregister: <`cua chrome unregister
//    --json`>, slotsAfter}, each slots* the `slots` of `node scripts/accept-chrome.mjs --c6-slots` at that moment.
const ABSENT_SCENARIO = 'C6-desktop-absent-live-gate';
// C6 is a macOS gate: its slots are the macOS browsers' (the paths only matter to slotStates).
export const C6_BROWSERS = (userHome = '/') => browsersFor({host: {platform: 'darwin'}, userHome});
const BROWSERS = C6_BROWSERS();
const coversEveryBrowser = map => map !== null && map.size === BROWSERS.length && BROWSERS.every(b => map.has(b.browser));
const bySlot = slots => {
  if (!Array.isArray(slots) || slots.length !== BROWSERS.length || !slots.every(s => isObject(s) && typeof s.browser === 'string' && typeof s.state === 'string')) return null;
  const map = new Map(slots.map(s => [s.browser, s]));
  return coversEveryBrowser(map) ? map : null;
};
const slotWords = slots => Array.isArray(slots) ? slots.map(s => `${s?.browser} ${s?.state === 'foreign' ? `foreign (${s.pathClass})` : s?.state === 'unreadable' ? `unreadable (${s.error})` : s?.state}`).join(', ') : 'missing';
const snapshotStatus = (map, matches) => !coversEveryBrowser(map) ? 'FAIL'
  : [...map.values()].some(s => s.state !== 'unreadable' && !matches(s)) ? 'FAIL'
    : [...map.values()].some(s => s.state === 'unreadable') ? 'BLOCKED' : 'PASS';
const snapshotReadHint = (...maps) => {
  const unreadable = maps.flatMap(map => map ? [...map.values()].filter(s => s.state === 'unreadable') : []);
  const words = [...new Set(unreadable.map(s => `${s.browser}'s manifest (${s.error})`))];
  return words.length ? `; cannot read ${words.join(', ')}; rerun node scripts/accept-chrome.mjs --c6-slots from a process that can read the browsers' directories (over SSH, or a terminal with Full Disk Access)` : '';
};

export function desktopAbsentGateChecks(report, {profile = 'personal'} = {}) {
  const name = 'live: desktop-absent gate';
  if (!isObject(report) || report.scenario !== ABSENT_SCENARIO) return [check(`${name}: supplied report`, 'FAIL', `not a ${ABSENT_SCENARIO} report`)];
  const before = bySlot(report.slotsBefore);
  const registered = bySlot(report.slotsRegistered);
  const after = bySlot(report.slotsAfter);
  const rows = Array.isArray(report.register?.browsers) ? report.register.browsers.filter(isObject) : [];
  const placed = new Set(rows.filter(r => r.action === 'placed').map(r => r.browser));
  const emptyBefore = snapshotStatus(before, s => s.state === 'absent');
  const wroteEmptyOnly = report.register?.ok === true && placed.has('chrome') && rows.every(r => r.action === 'placed' && !r.backup) && !report.register.consequences
    && [...placed].every(b => before?.has(b));
  const namesCua = placed.has('chrome') ? snapshotStatus(registered, s => placed.has(s.browser) ? s.state === 'ours' : s.state === 'absent') : 'FAIL';
  const unrows = Array.isArray(report.unregister?.browsers) ? report.unregister.browsers.filter(isObject) : [];
  const removedOnly = report.unregister?.ok === true && report.unregister.blocked === false && unrows.length > 0
    && unrows.every(r => placed.has(r.browser) ? r.action === 'removed' && r.restoration === 'not_needed' : r.action === 'absent')
    && [...placed].every(b => unrows.some(r => r.browser === b));
  const afterStatus = snapshotStatus(after, s => s.state === 'absent');
  const identical = isDeepStrictEqual(report.slotsAfter, report.slotsBefore);
  // Unreadable rows cannot prove equality or inequality; readable rows and browser order still must match.
  const equalityStatus = identical ? 'PASS' : before && after && (emptyBefore === 'BLOCKED' || afterStatus === 'BLOCKED')
    && report.slotsBefore.every((s, i) => s.browser === report.slotsAfter[i].browser
      && (s.state === 'unreadable' || report.slotsAfter[i].state === 'unreadable' || isDeepStrictEqual(s, report.slotsAfter[i]))) ? 'BLOCKED' : 'FAIL';
  const emptyAfter = rollup([emptyBefore, afterStatus, equalityStatus]);
  return [
    check(`${name}: no registration before register (desktop absent)`, emptyBefore, `slots before: ${slotWords(report.slotsBefore)}${snapshotReadHint(before)}`),
    check(`${name}: register wrote cua's manifest into empty slots only, nothing backed up`, wroteEmptyOnly ? emptyBefore : 'FAIL',
      (rows.length ? rows.map(r => `${r.browser} ${r.action}${r.backup ? ' (backup)' : ''}`).join(', ') + (report.register?.consequences ? '; replacement consequences announced' : '') : 'register wrote nothing') + snapshotReadHint(before)),
    check(`${name}: the written slots name cua's host`, namesCua, `slots registered: ${slotWords(report.slotsRegistered)}${snapshotReadHint(registered)}`),
    check(`${name}: the backend was served by cua's host`, report.servingHost?.pathClass === 'cua' ? 'PASS' : 'FAIL', `serving host class ${JSON.stringify(report.servingHost?.pathClass ?? null)}`),
    ...liveRoundTripChecks(report.roundTrip, {profile, prefix: `${name}: round trip`}),
    check(`${name}: unregister removed cua's manifests, nothing to restore`, removedOnly ? 'PASS' : 'FAIL',
      unrows.length ? unrows.map(r => `${r.browser} ${r.action}/${r.restoration ?? 'none'}`).join(', ') + `; blocked ${report.unregister?.blocked}` : 'no unregister result'),
    check(`${name}: absent before, absent after`, emptyAfter, `slots after: ${slotWords(report.slotsAfter)}; identical to before: ${identical}${snapshotReadHint(before, after)}`),
  ];
}

const absentGateSteps = profile => [
  `with the user, Chrome open on ${profile}'s Chrome profile with the OpenAI extension installed and codex.login pass; no ChatGPT desktop app installed`,
  'node scripts/accept-chrome.mjs --c6-slots (slotsBefore: every browser absent)',
  'node bin/cua.mjs chrome register --json (register: every present browser placed, nothing backed up)',
  'node scripts/accept-chrome.mjs --c6-slots (slotsRegistered: the placed browsers ours)',
  'the user wakes the extension (click its icon, or turn it off and on at chrome://extensions and rebind)',
  'ps -axo pid=,ppid=,comm= | grep \'ChatGPT for Chrome\' (a host under <home>/runtimes/.../chrome-plugin/: servingHost.pathClass cua)',
  liveCommand(profile, '/tmp/cua-c6-absent-roundtrip.json'),
  'node bin/cua.mjs chrome unregister --json (unregister: placed browsers removed, restoration not_needed)',
  'node scripts/accept-chrome.mjs --c6-slots (slotsAfter: every browser absent again)',
  `assemble {scenario: "${ABSENT_SCENARIO}", slotsBefore, register, slotsRegistered, servingHost: {pathClass: "cua"}, roundTrip: <that report>, unregister, slotsAfter}`,
  're-register: node bin/cua.mjs chrome register (cua\'s own registration is the steady state without the desktop app; the extension needs it to launch a host)',
  `rerun this runner, registered, with --c6-report <file>${profile === 'personal' ? '' : ` --profile ${profile}`}`,
];

export const desktopAbsentGateBlocked = (profile = 'personal') => check('live: desktop-absent gate', 'BLOCKED',
  `needs the user (issue #9): ${absentGateSteps(profile).map((s, i) => `(${i + 1}) ${s}`).join('; ')}`);

// Which gate a machine owes: the --replace gate where some browser holds a registration cua did not write (the
// desktop's, or another host's), the desktop-absent gate otherwise.
export function c6GateBlocked(slotsNow, profile = 'personal') {
  const unreadable = slotsNow.filter(s => s.state === 'unreadable');
  if (unreadable.length) return check('live: C6 gate', 'BLOCKED', `cannot read ${unreadable.map(s => `${s.browser}'s manifest (${s.error})`).join(', ')}, so which gate this machine owes cannot be told; rerun from a process that can read the browsers' directories (over SSH, or a terminal with Full Disk Access)`);
  return slotsNow.some(s => s.state === 'foreign') ? replaceGateBlocked(profile) : desktopAbsentGateBlocked(profile);
}

// A supplied gate report, judged by its scenario. A desktop-absent report cannot stand for a machine that holds a
// registration cua did not write: there the --replace gate applies.
export function c6GateChecks(report, {profile = 'personal', slotsNow = []} = {}) {
  if (report?.scenario === ABSENT_SCENARIO) {
    const foreign = slotsNow.filter(s => s.state === 'foreign');
    const unreadable = slotsNow.filter(s => s.state === 'unreadable');
    return [
      check('live: desktop-absent gate: no registration cua did not write on this machine now', foreign.length ? 'FAIL' : unreadable.length ? 'BLOCKED' : 'PASS',
        foreign.length ? `${foreign.map(s => `${s.browser} ${s.pathClass}`).join(', ')} present: a desktop (or other) registration exists, so the --replace gate applies`
          : unreadable.length ? `cannot read ${unreadable.map(s => `${s.browser}'s manifest (${s.error})`).join(', ')}; rerun from a process that can read the browsers' directories`
          : 'no browser holds a foreign registration'),
      ...desktopAbsentGateChecks(report, {profile}),
    ];
  }
  return replaceGateChecks(report, {profile});
}

// A machine without the desktop app (issue #9): no browser holds a registration cua did not write. Its steady state is
// cua's own registration written into empty slots, which cua's record proves (replaced: false for every browser cua
// holds); right after the desktop-absent gate's unregister it is absent. -> 'absent' | 'registered' | null, where null
// is anything else (a foreign or unreadable slot, or cua's registration replacing something or without a record:
// the --replace gate).
export function desktopAbsentState(slots, record) {
  if (!Array.isArray(slots) || !slots.length || !slots.every(s => s?.state === 'absent' || s?.state === 'ours')) return null;
  const ours = slots.filter(s => s.state === 'ours');
  if (!ours.length) return 'absent';
  return ours.every(s => record?.browsers?.[s.browser]?.replaced === false) ? 'registered' : null;
}

// Each browser's manifest slot for `--c6-slots` and the runner: its class and, when present, the sha256 of its bytes.
// Only a path that is not there is absent; a read this process may not make (macOS can protect Chrome's directory from
// a terminal without Full Disk Access) is `unreadable` with its code, never absence.
export function slotStates({home, userHome, suffixes, nativeHost = 'com.openai.codexextension'}) {
  return C6_BROWSERS(userHome).map(({browser, dataDir}) => {
    let bytes = null;
    try { bytes = readFileSync(join(dataDir, 'NativeMessagingHosts', `${nativeHost}.json`)); } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) return {browser, state: 'unreadable', error: error.code ?? error.message};
    }
    const slot = classifySlot(bytes === null ? null : bytes.toString('utf8'), {home, userHome, suffixes});
    return {browser, ...slot, ...(bytes === null ? {} : {sha256: createHash('sha256').update(bytes).digest('hex')})};
  });
}

// ---- C1 ------------------------------------------------------------------------------------------------------------

const TOOLS = ['js', 'js_reset', 'end_task', 'secrets_list'];

export function verifyCheck(name, {code, report}, {browser}) {
  if (!isObject(report)) return check(name, 'FAIL', `exit ${code}; no report`);
  const tools = [...TOOLS, ...(browser ? ['profiles_list'] : []), 'devices_list', 'devices_use'];
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

// The scratch scenario runs against a fixture Chrome, never this Mac's: three profile directories named in Local State,
// the OpenAI extension's manifest in exactly one. The CLI finds Chrome's user-data directory under $HOME
// (src/profiles/chrome.mjs chromeUserData), so the scratch commands run with HOME set to `userHome`.
export const SCRATCH_PROFILES = [
  {key: 'personal', directory: 'Default', extension: 'installed'},
  {key: 'work', directory: 'Profile 8', extension: 'absent'},
  {key: 'school', directory: 'Profile 6', extension: 'absent'},
];
export function writeScratchChrome(userHome) {
  // Where the CLI run with HOME=userHome (and no XDG overrides) looks for this host's Chrome.
  const userData = chromeUserData({userHome, env: {}});
  const infoCache = {};
  for (const {key, directory, extension} of SCRATCH_PROFILES) {
    mkdirSync(join(userData, directory), {recursive: true});
    infoCache[directory] = {name: `Fixture ${key}`};
    if (extension === 'installed') {
      const version = join(userData, directory, 'Extensions', OPENAI_EXTENSION_ID, '1.0.0_0');
      mkdirSync(version, {recursive: true});
      writeFileSync(join(version, 'manifest.json'), '{}\n');
    }
  }
  writeFileSync(join(userData, 'Local State'), JSON.stringify({profile: {info_cache: infoCache, profiles_order: Object.keys(infoCache)}}));
  return userData;
}

const EXPECTED_SCRATCH = {personal: 'not_bound', school: 'extension_not_installed', work: 'extension_not_installed'};
const describe = list => list.map(p => `${p.key} ${p.ready ? 'ready' : `not ready (${p.reason})`}`).join(', ') || 'no profiles registered';

// Where this process may not read Chrome's data directory (macOS privacy protection), presence cannot be shown here.
const UNREADABLE_BLOCK = `this process may not read Chrome's data directory, so extension presence cannot be shown from it: ${PERMISSION_FIX}`;

// Failure outranks BLOCKED: the key set, "nothing is ready in an unbound scratch registry" and every readable row are
// judged first; only the presence reasons an unreadable row cannot show are BLOCKED.
export function scratchListCheck(list) {
  const name = 'scratch home: list shows personal not yet bound and work/school not ready (extension manifest absent)';
  if (!Array.isArray(list)) return check(name, 'FAIL', 'no list');
  const violated = !isDeepStrictEqual(list.map(p => p.key), Object.keys(EXPECTED_SCRATCH)) || list.some(p => p.ready !== false)
    || list.some(p => p.reason !== 'chrome_data_unreadable' && p.reason !== EXPECTED_SCRATCH[p.key]);
  if (violated) return check(name, 'FAIL', describe(list));
  if (list.some(p => p.reason === 'chrome_data_unreadable')) return check(name, 'BLOCKED', `${describe(list)}; ${UNREADABLE_BLOCK}`);
  return check(name, 'PASS', describe(list));
}

// The human `cua profiles list` of the same scratch registry, by the same precedence: every key has a "not ready" line
// naming its expected reason (FAIL otherwise), except lines naming chrome_data_unreadable, which make it BLOCKED.
export function scratchHumanCheck(lines, reasons) {
  const name = 'scratch home: the human list names each reason';
  const rows = Object.keys(EXPECTED_SCRATCH).map(key => ({key, line: (lines ?? []).find(l => l.startsWith(`${key} `))}));
  const bad = rows.filter(({key, line}) => !line || !new RegExp(`^${key}\\s+not ready\\s`).test(line)
    || !(line.includes(reasons[EXPECTED_SCRATCH[key]]) || line.includes(reasons.chrome_data_unreadable)));
  if (bad.length) return check(name, 'FAIL', `missing, ready or with another reason: ${bad.map(r => r.key).join(', ')}`);
  const unreadable = rows.filter(({line}) => line.includes(reasons.chrome_data_unreadable)).map(r => r.key);
  if (unreadable.length) return check(name, 'BLOCKED', `${unreadable.join(', ')} name chrome_data_unreadable; ${UNREADABLE_BLOCK}`);
  return check(name, 'PASS', 'work and school: extension not installed; personal: not bound yet');
}

// One scratch `profiles add` against the fixture Chrome: the reported extension state must be the expected one; an
// unreadable state is BLOCKED (the registration itself still succeeded). The fixture has every directory, so a missing
// one means the command did not read the fixture.
export function scratchAddCheck({key, directory, expected, code, out}) {
  if (out?.error?.code === 'chrome_profile_not_found') return {key, status: 'FAIL', detail: `${key}: no Chrome profile directory "${directory}" (the fixture has it: the command did not read the fixture Chrome)`};
  if (code !== 0 || !out?.ok) return {key, status: 'FAIL', detail: `${key} -> "${directory}": exit ${code} ${out?.error?.code ?? ''}`};
  if (out.extension === 'unreadable') return {key, status: 'BLOCKED', detail: `${key} -> "${directory}": registered; extension unreadable (${out.chromeDataError}): ${UNREADABLE_BLOCK}`};
  return {key, status: out.extension === expected ? 'PASS' : 'FAIL', detail: `${key} -> "${directory}": extension ${out.extension} (expected ${expected})`};
}

// What doctor's chrome.extension.<key> row must say for a `cua profiles list --json` row: the same file facts. A
// profile whose Chrome data this process may not read (ready on live evidence, or chrome_data_unreadable) has a
// blocked row naming that; a missing directory or absent extension has a blocked row naming the reason; every other
// row (ready, or not ready only for its binding or the live check) has the extension installed, so doctor passes.
const UNREADABLE_ROW = /may not read Chrome's data directory/;
function doctorAgrees(row, doctorRow) {
  if (!doctorRow) return false;
  if (row.chromeDataError) return doctorRow.status === 'blocked' && UNREADABLE_ROW.test(doctorRow.detail);
  if (row.reason === 'profile_directory_missing' || row.reason === 'extension_not_installed') return doctorRow.status === 'blocked' && doctorRow.detail.includes(REASONS[row.reason]);
  return doctorRow.status === 'pass';
}

// The list contract's readiness shape: ready only bound and without a reason; not ready only with a known reason.
const wellFormed = row => row.ready === true ? row.reason === undefined && Boolean(row.extensionInstanceId)
  : row.ready === false && Object.hasOwn(REASONS, row.reason);

// The default home's registry, read only, judged from its own data rather than fixed keys: every registered key's
// readiness (`cua profiles list --json`) agrees with doctor's facts for it (`cua doctor --json`), doctor has a row for
// exactly the registered keys, at least one key is ready, and the live profile (--profile) is among the ready ones.
// Instance ids are not reported.
export function defaultRegistryChecks({profiles, doctor, profile = 'personal'}) {
  const list = Array.isArray(profiles) ? profiles : [];
  const rows = Array.isArray(doctor?.checks) ? doctor.checks.filter(c => c.name?.startsWith('chrome.extension.')) : null;
  const checks = [];
  if (!rows) checks.push(check('default home: doctor --json for the registered profiles', 'FAIL', 'doctor gave no report'));
  else {
    const keys = rows.map(c => c.name.slice('chrome.extension.'.length)).sort();
    const registered = list.map(p => p.key).sort();
    checks.push(check('default home: doctor has a chrome.extension row for exactly the registered keys', isDeepStrictEqual(keys, registered) ? 'PASS' : 'FAIL',
      `registered: ${registered.join(', ') || 'none'}; doctor rows: ${keys.join(', ') || 'none'}`));
    for (const p of list) {
      const doctorRow = rows.find(c => c.name === `chrome.extension.${p.key}`);
      const name = `default home: ${p.key} ${p.ready ? 'ready' : `not ready (${p.reason})`}, consistent with doctor chrome.extension.${p.key}`;
      const facts = `doctor ${doctorRow ? doctorRow.status : 'has no row'}${p.chromeDataError ? `; Chrome's data directory unreadable from this process (${p.chromeDataError})` : ''}`;
      if (!wellFormed(p)) checks.push(check(name, 'FAIL', `the list row contradicts itself: ready ${JSON.stringify(p.ready ?? null)} with reason ${JSON.stringify(p.reason ?? null)}${p.ready === true && !p.extensionInstanceId ? ' and no binding' : ''}`));
      else if (!doctorAgrees(p, doctorRow)) checks.push(check(name, 'FAIL', `${facts}: disagrees with the registry's readiness`));
      else if (p.reason === 'chrome_data_unreadable') checks.push(check(name, 'BLOCKED', `${facts}; ${UNREADABLE_BLOCK}`));
      else checks.push(check(name, 'PASS', `${facts}${p.ready && p.chromeDataError ? ': ready on live evidence (bound, and its bound extension instance is live)' : p.ready ? ': bound, extension installed, bound instance live' : ''}`));
    }
  }
  const ready = list.filter(p => p.ready).map(p => p.key);
  checks.push(check('default home: at least one registered profile is ready', ready.length ? 'PASS' : 'BLOCKED',
    ready.length ? `ready: ${ready.join(', ')}` : `${describe(list)}; bind one with node bin/cua.mjs profiles bind <key> (the user picks its backend)`));
  const live = list.find(p => p.key === profile);
  const name = `default home: --profile ${profile} is ready`;
  checks.push(live?.ready ? check(name, 'PASS', live.chromeDataError ? `bound and its bound extension instance is live (ready on live evidence; Chrome's data directory unreadable from this process, ${live.chromeDataError})` : 'bound to a live-picked extension instance and its extension is installed')
    : check(name, 'BLOCKED', !live ? `${profile} is not registered in this home; ${ADD_HINT(profile)}`
      : live.reason === 'not_bound' || live.reason === 'binding_stale' ? `${pickPending(live, profile)}: the user picks its backend, then node bin/cua.mjs profiles bind ${profile} --extension-instance-id <picked id>`
        : live.reason === 'chrome_data_unreadable' ? `${profile} is bound but its bound instance was not confirmed live and ${UNREADABLE_BLOCK}`
          : `${profile} not ready (${live.reason})`));
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
// back not ready for a stale binding, no live host or unlistable backends, without its instance id; and a bound profile
// whose Chrome data this process may not read may come back ready with its stored instance id (the live backend is the
// evidence).
const LIVENESS_REASONS = ['binding_stale', 'host_not_live', 'backends_unlistable'];
const viewMatches = (view, status) => isDeepStrictEqual(view, profileView(status))
  || (status.ready && LIVENESS_REASONS.includes(view?.reason) && isDeepStrictEqual(view, {key: status.key, ready: false, reason: view.reason}))
  || (awaitsLiveEvidence(status) && isDeepStrictEqual(view, {key: status.key, ready: true, extensionInstanceId: status.extensionInstanceId}));
export function profilesListCheck(structured, statuses) {
  const name = 'profiles_list returns the registered keys with readiness';
  if (structured?.status !== 'ok' || !Array.isArray(structured.profiles)) return check(name, 'FAIL', `status ${JSON.stringify(structured?.status ?? null)}${structured?.code ? ` (${structured.code})` : ''}`);
  const ok = structured.profiles.length === statuses.length && structured.profiles.every((view, i) => viewMatches(view, statuses[i]))
    && structured.profiles.every(p => !('chromeProfileDirectory' in p));
  const unreadable = statuses.filter(p => p.reason === 'chrome_data_unreadable');
  const state = unreadable.length ? `; Chrome's data directory unreadable from this process for ${unreadable.map(p => `${p.key} (${p.chromeDataError ?? 'unknown'}, ${p.extensionInstanceId ? 'bound: readiness from the live check' : 'unbound'})`).join(', ')}` : '';
  return check(name, ok ? 'PASS' : 'FAIL', `${describe(structured.profiles)}; ${ok ? 'equal to the registry (instance ids only for ready profiles, no directories)' : 'differs from the registry'}${state}`);
}

// ---- C5 ------------------------------------------------------------------------------------------------------------

// Doctor on this Mac: the expected statuses pass (the extension check is the live profile's); a check whose evidence
// needs the user's environment (Chrome open, the server's login) is BLOCKED with what to do; a missing check or an
// unhealthy report is FAIL. Every other registered key's row is judged against the registry in C3 (defaultRegistryChecks).
export function doctorChromeChecks({code, doctor, profile = 'personal', slotsNow, record}) {
  if (!isObject(doctor) || !Array.isArray(doctor.checks)) return [check('doctor --json', 'FAIL', `exit ${code}; no report`)];
  const get = name => doctor.checks.find(c => c.name === name);
  const health = doctorHealth({code, doctor});
  const out = [check('doctor --json: runtime health', health.healthy ? 'PASS' : 'FAIL', health.detail)];
  const expect = (name, judge) => {
    const c = get(name);
    // Doctor has a per-profile check only for a registered profile.
    if (!c && name === `chrome.extension.${profile}`) return out.push(check(name, 'BLOCKED', `${profile} is not registered in this home; ${ADD_HINT(profile)}`));
    if (!c) return out.push(check(name, 'FAIL', 'missing from doctor'));
    const [status, why] = judge(c);
    out.push(check(name, status, `${c.status}: ${c.detail}${why ? ` (${why})` : ''}`));
  };
  expect(`chrome.extension.${profile}`, c => c.status === 'pass' ? ['PASS'] : c.status !== 'blocked' ? ['FAIL']
    : UNREADABLE_ROW.test(c.detail) ? ['BLOCKED', PERMISSION_FIX] : ['BLOCKED', `install the OpenAI extension in ${profile}'s Chrome profile; cua never does`]);
  expect('chrome.host.registered', c => {
    const state = desktopAbsentState(slotsNow, record);
    const absent = state === 'absent';
    const noManifest = /^no native-messaging manifest for com\.openai\.codexextension in .+: the OpenAI extension cannot reach a host/.test(c.detail);
    const expected = saw => `no desktop registration present; cua's own registration (the steady state) or none (right after the gate's unregister) expected; saw ${saw}`;
    if (absent && c.status === 'blocked' && noManifest) return ['PASS', expected('absent')];
    if (state === 'registered') {
      const chrome = slotsNow.find(s => s.browser === 'chrome');
      if (chrome?.state === 'ours') return c.status === 'pass' && /^cua:/.test(c.detail) ? ['PASS', expected('cua')]
        // Doctor could not read the manifest (it reads before the snapshot): unknown, not a disagreement.
        : c.status === 'blocked' && !noManifest && /is unknown/.test(c.detail) ? ['BLOCKED', 'doctor could not read Chrome\'s manifest; rerun from a process that can read the browsers\' directories']
          : ['FAIL', 'Chrome\'s slot holds cua\'s registration but doctor does not report class cua'];
      if (c.status === 'blocked' && noManifest) return ['BLOCKED', `cua is registered only for ${slotsNow.filter(s => s.state === 'ours').map(s => s.browser).join(', ')}; register Chrome too: node bin/cua.mjs chrome register, then rerun`];
    }
    if (absent && /^(desktop|cua|other):/.test(c.detail)) return ['FAIL', 'doctor reports a registration but every browser slot is absent'];
    const chromeSlot = slotsNow?.find(s => s.browser === 'chrome');
    if (noManifest && ['foreign', 'ours'].includes(chromeSlot?.state)) return ['FAIL', 'doctor reports no manifest but Chrome\'s slot holds a registration'];
    const unreadable = slotsNow?.filter(s => s.state === 'unreadable');
    if (unreadable?.length) return ['BLOCKED', `cannot read ${unreadable.map(s => `${s.browser}'s manifest (${s.error})`).join(', ')}, so whether a registration is present cannot be told`];
    return c.status !== 'pass' ? [c.status === 'blocked' ? 'BLOCKED' : 'FAIL', 'expected the desktop\'s registration on this Mac']
      : /^desktop:/.test(c.detail) ? ['PASS'] : /^cua:/.test(c.detail) ? ['BLOCKED', 'cua\'s host is registered: the --replace gate is in progress or was left registered; rerun after node bin/cua.mjs chrome unregister']
        : ['FAIL', 'expected the desktop\'s registration on this Mac'];
  });
  expect('chrome.hosts.live', c => c.status === 'pass' ? ['PASS'] : c.status === 'blocked' ? ['BLOCKED', `open Chrome on ${profile}'s Chrome profile with the OpenAI extension enabled, then rerun`] : ['FAIL']);
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
export function registrationGuard(slots, {record} = {}) {
  const ours = slots.filter(s => s.state === 'ours').map(s => s.browser);
  if (ours.length && desktopAbsentState(slots, record) === 'registered') {
    // cua's own registration on a machine without the desktop app is its steady state: nothing foreign to refuse, and
    // unregister would remove the only host registration there is.
    const na = what => ({run: false, notApplicable: true, reason: `no desktop registration present: cua's own registration in ${ours.join(', ')} is this machine's steady state; ${what}`});
    return {refusal: na('no manifest cua did not write exists for register to refuse'), noop: na('unregister would remove it, and the desktop-absent gate covers unregister')};
  }
  if (ours.length) {
    const reason = `cua's host is registered in ${ours.join(', ')} (the --replace gate is in progress or was left registered); not touched. Rerun after node bin/cua.mjs chrome unregister`;
    return {refusal: {run: false, reason}, noop: {run: false, reason}};
  }
  const unreadable = slots.filter(s => s.state === 'unreadable');
  if (unreadable.length) {
    const reason = `cannot read ${unreadable.map(s => `${s.browser}'s manifest (${s.error})`).join(', ')}, so whether a registration is present cannot be told; not run. Rerun from a process that can read the browsers' directories (over SSH, or a terminal with Full Disk Access)`;
    return {refusal: {run: false, reason}, noop: {run: false, reason}};
  }
  if (!slots.some(s => s.state === 'foreign')) {
    // No registration at all: the machine has no desktop app (issue #9). Both checks presuppose one, so they are N/A,
    // stated as such; the desktop-absent gate covers register and unregister there.
    const na = what => ({run: false, notApplicable: true, reason: `no desktop registration present: ${what}; the desktop-absent gate covers register and unregister here`});
    return {refusal: na('no manifest cua did not write exists for register to refuse'), noop: na('no manifest cua did not write exists for unregister to leave alone')};
  }
  return {refusal: {run: true}, noop: {run: true}};
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
