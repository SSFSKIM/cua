// The Phase C acceptance runner's own rules (scripts/accept/chrome-all-lib.mjs): every C1-C7 verdict is computed from
// evidence, a skipped, missing or not-yet-run item is FAIL or BLOCKED and never PASS, and the BLOCKED items name the
// exact command and human step.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {
  binaryKind, C2_LIVE_STEPS, C2_MATRIX, c2LiveBlocked, classifySlot, defaultRegistryChecks, doctorChromeChecks, helperSuiteVerdict,
  hostNotesCheck, launchEnvCheck, liveProfileCheck, liveRoundTripChecks, packChecks, PHASE_C_MODULES, profilesListCheck, registrationGuard,
  replaceGateBlocked, replaceGateChecks, SCRATCH_PROFILES, scratchAddCheck, scratchHumanCheck, scratchListCheck, tapTestStatus, matrixChecks, verifyCheck,
  writeScratchChrome,
} from '../scripts/accept/chrome-all-lib.mjs';
import {runAll} from '../scripts/accept/chrome-all.mjs';
import {rollup} from '../scripts/accept/lib.mjs';
import {chromeFacts} from '../src/profiles/chrome.mjs';
import {REASONS} from '../src/profiles/registry.mjs';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';

const statuses = checks => checks.map(c => c.status);

// ---- C2: the hermetic matrix, read from the actual node:test TAP --------------------------------------------------

const tapOf = lines => `TAP version 13\n${lines.join('\n')}\n1..${lines.length}\n# tests ${lines.length}\n`;

test('a matrix claim passes only when its named test ran and passed', () => {
  const title = C2_MATRIX[0].title;
  assert.equal(tapTestStatus(tapOf([`# Subtest: ${title}`, `ok 7 - ${title}`]), title).status, 'PASS');
  assert.equal(tapTestStatus(tapOf([`not ok 7 - ${title}`]), title).status, 'FAIL');
  assert.equal(tapTestStatus(tapOf([`ok 7 - ${title} # SKIP not on this host`]), title).status, 'BLOCKED');
  assert.equal(tapTestStatus(tapOf([`ok 7 - ${title} # TODO later`]), title).status, 'BLOCKED');
  assert.equal(tapTestStatus(tapOf(['ok 1 - something else']), title).status, 'FAIL', 'a missing test is missing evidence, not a pass');
  assert.equal(tapTestStatus(tapOf([`ok 1 - ${title} and more`]), title).status, 'FAIL', 'a longer title is another test');
  assert.equal(tapTestStatus(tapOf([`ok 1 - ${title}`, `not ok 9 - ${title}`]), title).status, 'FAIL', 'every test of that name must pass');
});

test('the matrix covers both shapes, ordinary values, labels, secrets off/unavailable, unsupported shapes and both failure channels', () => {
  const claims = C2_MATRIX.map(m => m.claim).join(' | ');
  for (const word of ['both', 'ordinary', 'invalid', 'unknown', 'off', 'unavailable', 'unsupported', 'rejection', '{ok:false}']) assert.match(claims, new RegExp(word.replace(/[{}]/g, '\\$&')), word);
  const all = tapOf(C2_MATRIX.map((m, i) => `ok ${i + 1} - ${m.title}`));
  assert.deepEqual(statuses(matrixChecks(all)), C2_MATRIX.map(() => 'PASS'));
  const oneMissing = tapOf(C2_MATRIX.slice(1).map((m, i) => `ok ${i + 1} - ${m.title}`));
  assert.equal(rollup(statuses(matrixChecks(oneMissing))), 'FAIL');
});

// ---- C2 live and C6 --replace: only a supplied report that proves it ----------------------------------------------

const passingLive = (over = {}) => ({scenario: 'C2-live-browser-secret-round-trip', status: 'PASS', profile: 'personal', leftover: 'none',
  steps: C2_LIVE_STEPS.map(name => ({name, status: 'PASS'})), ...over});

test('a complete passing live report for personal passes C2\'s live part', () => {
  assert.equal(rollup(statuses(liveRoundTripChecks(passingLive()))), 'PASS');
});

test('a live report that failed, skipped a step, used another profile or left a tab is never a pass', () => {
  const failed = passingLive({status: 'FAIL', steps: C2_LIVE_STEPS.map(name => ({name, status: name === 'sentinel-scan' ? 'FAIL' : 'PASS'}))});
  assert.equal(rollup(statuses(liveRoundTripChecks(failed))), 'FAIL');
  const short = passingLive({steps: C2_LIVE_STEPS.filter(n => n !== 'page-digest-matches-sentinel').map(name => ({name, status: 'PASS'}))});
  assert.notEqual(rollup(statuses(liveRoundTripChecks(short))), 'PASS', 'a step that never ran is not a pass');
  const blocked = passingLive({status: 'BLOCKED', steps: [{name: 'preconditions', status: 'BLOCKED'}]});
  assert.notEqual(rollup(statuses(liveRoundTripChecks(blocked))), 'PASS');
  assert.equal(rollup(statuses(liveRoundTripChecks(passingLive({profile: 'work'})))), 'FAIL');
  assert.equal(rollup(statuses(liveRoundTripChecks(passingLive({leftover: 'possibly-open'})))), 'FAIL');
  for (const junk of [null, 'text', {}, {scenario: 'something-else', status: 'PASS', steps: []}]) assert.equal(rollup(statuses(liveRoundTripChecks(junk))), 'FAIL');
});

test('without a live report C2 is BLOCKED, naming the pending pick or the exact live command', () => {
  const unbound = c2LiveBlocked({key: 'personal', ready: false, reason: 'not_bound'});
  assert.equal(unbound.status, 'BLOCKED');
  assert.match(unbound.detail, /personal not bound; user pick pending/);
  assert.match(unbound.detail, /profiles bind personal --extension-instance-id/);
  assert.match(unbound.detail, /accept-chrome\.mjs --live --profile personal --report/);
  assert.match(unbound.detail, /--c2-report/);
  const ready = c2LiveBlocked({key: 'personal', ready: true});
  assert.equal(ready.status, 'BLOCKED');
  assert.doesNotMatch(ready.detail, /user pick pending/);
  assert.match(ready.detail, /accept-chrome\.mjs --live --profile personal/);
  assert.match(c2LiveBlocked(undefined).detail, /not registered/);
});

const passingGate = (over = {}) => ({scenario: 'C6-replace-live-gate', servingHost: {pathClass: 'cua'}, roundTrip: passingLive(),
  unregister: {ok: true, blocked: false, browsers: ['chrome', 'edge'].map(browser => ({browser, action: 'restored', restoration: 'restored'})).concat({browser: 'opera', action: 'absent'})}, ...over});

test('the --replace gate passes only with cua\'s host serving, a passing round trip and every replaced manifest restored', () => {
  assert.equal(rollup(statuses(replaceGateChecks(passingGate()))), 'PASS');
  assert.equal(rollup(statuses(replaceGateChecks(passingGate({servingHost: {pathClass: 'desktop'}})))), 'FAIL');
  assert.equal(rollup(statuses(replaceGateChecks(passingGate({roundTrip: passingLive({status: 'FAIL'})})))), 'FAIL');
  const unrestored = passingGate({unregister: {ok: true, blocked: true, browsers: [{browser: 'chrome', action: 'removed', restoration: 'blocked'}]}});
  assert.equal(rollup(statuses(replaceGateChecks(unrestored))), 'FAIL');
  const nothing = passingGate({unregister: {ok: true, blocked: false, browsers: [{browser: 'chrome', action: 'not_ours'}]}});
  assert.equal(rollup(statuses(replaceGateChecks(nothing))), 'FAIL', 'nothing restored means the gate never replaced anything');
  assert.equal(rollup(statuses(replaceGateChecks({scenario: 'C2-live-browser-secret-round-trip'}))), 'FAIL');
});

test('without a gate report the --replace gate is BLOCKED with the exact steps, never a pass', () => {
  const blocked = replaceGateBlocked();
  assert.equal(blocked.status, 'BLOCKED');
  for (const step of ['chrome register --replace', 'reconnect', 'ChatGPT for Chrome', 'accept-chrome.mjs --live --profile personal', 'chrome unregister', '--c6-report'])
    assert.ok(blocked.detail.includes(step), step);
});

// ---- C1 ---------------------------------------------------------------------------------------------------------------

const verifyReport = browser => ({surfaces: browser ? ['computer', 'browser'] : ['computer'], problems: [], browserApiDocumented: browser,
  tools: ['js', 'js_reset', 'end_task', 'secrets_list', ...(browser ? ['profiles_list'] : [])]});

test('verify passes C1 only with the surface\'s exact tools and browser documentation', () => {
  assert.equal(verifyCheck('default', {code: 0, report: verifyReport(false)}, {browser: false}).status, 'PASS');
  assert.equal(verifyCheck('both', {code: 0, report: verifyReport(true)}, {browser: true}).status, 'PASS');
  assert.equal(verifyCheck('default', {code: 0, report: {...verifyReport(false), browserApiDocumented: true}}, {browser: false}).status, 'FAIL');
  assert.equal(verifyCheck('both', {code: 0, report: verifyReport(false)}, {browser: true}).status, 'FAIL');
  assert.equal(verifyCheck('default', {code: 1, report: {...verifyReport(false), problems: ['x']}}, {browser: false}).status, 'FAIL');
  assert.equal(verifyCheck('default', {code: 0, report: null}, {browser: false}).status, 'FAIL');
});

test('the launch serve builds carries no browser env by default, and exactly the browser env with the surface', () => {
  const base = {CUA_REPL_ENABLED_SURFACES: 'computer', NODE_REPL_TRUSTED_SERVICES: JSON.stringify({sky: '/s'}), CODEX_HOME: '/h'};
  assert.equal(launchEnvCheck('default', base, {browser: false}).status, 'PASS');
  assert.equal(launchEnvCheck('default', {...base, BROWSER_USE_AVAILABLE_BACKENDS: 'chrome'}, {browser: false}).status, 'FAIL');
  const both = {...base, CUA_REPL_ENABLED_SURFACES: 'computer,browser', NODE_REPL_TRUSTED_SERVICES: JSON.stringify({sky: '/s', browser: '/b'}), CUA_BROWSER_VENDOR_SERVICE: '/v', BROWSER_USE_AVAILABLE_BACKENDS: 'chrome'};
  assert.equal(launchEnvCheck('both', both, {browser: true}).status, 'PASS');
  for (const extra of ['BROWSER_USE_BACKEND_PATHS', 'BROWSER_USE_DISABLE_AMBIENT_NETWORK', 'BROWSER_USE_SECURITY_MODE'])
    assert.equal(launchEnvCheck('both', {...both, [extra]: '1'}, {browser: true}).status, 'FAIL', extra);
  assert.equal(launchEnvCheck('both', {...both, NODE_REPL_TRUSTED_SERVICES: JSON.stringify({sky: '/s'})}, {browser: true}).status, 'FAIL');
});

// ---- C3 / C4 / C5 -------------------------------------------------------------------------------------------------------

test('the scratch registry lists personal not bound and work/school without the extension', () => {
  const list = [{key: 'personal', ready: false, reason: 'not_bound'}, {key: 'school', ready: false, reason: 'extension_not_installed'}, {key: 'work', ready: false, reason: 'extension_not_installed'}];
  assert.equal(scratchListCheck(list).status, 'PASS');
  assert.equal(scratchListCheck(list.slice(0, 2)).status, 'FAIL');
  assert.equal(scratchListCheck([{...list[0], reason: 'extension_not_installed'}, list[1], list[2]]).status, 'FAIL');
});

// The default home is judged from its own registry: the owner's (personal ready, work/school without the extension) and
// a second Mac's (school ready on "Profile 12", ssfs without the extension) both pass with their own --profile.
const doctorRows = rows => ({ok: true, checks: Object.entries(rows).map(([name, [status, detail]]) => ({name, status, detail}))});
const installedRow = dir => ['pass', `the OpenAI extension is installed in Chrome profile "${dir}" (file presence only; enabled/connected is not checked)`];
const absentRow = dir => ['blocked', `${REASONS.extension_not_installed} (Chrome profile "${dir}")`];
const OWNER = {
  profiles: [{key: 'personal', chromeProfileDirectory: 'Default', ready: true, extensionInstanceId: 'inst-owner'},
    {key: 'school', chromeProfileDirectory: 'Profile 6', ready: false, reason: 'extension_not_installed'},
    {key: 'work', chromeProfileDirectory: 'Profile 8', ready: false, reason: 'extension_not_installed'}],
  doctor: doctorRows({'chrome.extension.personal': installedRow('Default'), 'chrome.extension.school': absentRow('Profile 6'), 'chrome.extension.work': absentRow('Profile 8')}),
};
const SECOND_MAC = {
  profiles: [{key: 'school', chromeProfileDirectory: 'Profile 12', ready: true, extensionInstanceId: 'inst-second'},
    {key: 'ssfs', chromeProfileDirectory: 'Profile 1', ready: false, reason: 'extension_not_installed'}],
  doctor: doctorRows({'chrome.extension.school': installedRow('Profile 12'), 'chrome.extension.ssfs': absentRow('Profile 1')}),
};

test('the default home passes on the owner\'s registry and on a second Mac\'s, each with its own live profile', () => {
  const owner = defaultRegistryChecks({...OWNER, profile: 'personal'});
  assert.equal(rollup(statuses(owner)), 'PASS');
  for (const name of ['default home: personal ready, consistent with doctor chrome.extension.personal', 'default home: work not ready (extension_not_installed), consistent with doctor chrome.extension.work',
    'default home: at least one registered profile is ready', 'default home: --profile personal is ready'])
    assert.ok(owner.some(c => c.name === name), name);
  const second = defaultRegistryChecks({...SECOND_MAC, profile: 'school'});
  assert.equal(rollup(statuses(second)), 'PASS');
  assert.ok(second.some(c => c.name === 'default home: school ready, consistent with doctor chrome.extension.school'));
  assert.ok(second.some(c => c.name === 'default home: ssfs not ready (extension_not_installed), consistent with doctor chrome.extension.ssfs'));
  // The second Mac without --profile: personal is not registered there, which is BLOCKED with the way out, never FAIL.
  const unnamed = defaultRegistryChecks({...SECOND_MAC, profile: 'personal'});
  assert.equal(rollup(statuses(unnamed)), 'BLOCKED');
  assert.match(unnamed.at(-1).detail, /personal is not registered in this home; pass --profile <a registered key>/);
  // An owner key that is registered but not ready is not the live profile.
  assert.equal(rollup(statuses(defaultRegistryChecks({...OWNER, profile: 'work'}))), 'BLOCKED');
  for (const shape of [OWNER, SECOND_MAC]) assert.ok(!JSON.stringify(defaultRegistryChecks({...shape, profile: 'school'})).includes('inst-'), 'instance ids stay out of the report');
});

test('the default home fails when readiness disagrees with doctor\'s facts for any registered key', () => {
  const judged = (profiles, rows, profile = 'school') => rollup(statuses(defaultRegistryChecks({profiles, doctor: doctorRows(rows), profile})));
  const [school, ssfs] = SECOND_MAC.profiles;
  // Ready, but doctor says the extension is absent.
  assert.equal(judged(SECOND_MAC.profiles, {'chrome.extension.school': absentRow('Profile 12'), 'chrome.extension.ssfs': absentRow('Profile 1')}), 'FAIL');
  // Not ready for an absent extension, but doctor finds it installed.
  assert.equal(judged(SECOND_MAC.profiles, {'chrome.extension.school': installedRow('Profile 12'), 'chrome.extension.ssfs': installedRow('Profile 1')}), 'FAIL');
  // A missing directory against doctor's absent-extension row: another reason.
  assert.equal(judged([school, {...ssfs, reason: 'profile_directory_missing'}], {'chrome.extension.school': installedRow('Profile 12'), 'chrome.extension.ssfs': absentRow('Profile 1')}), 'FAIL');
  // Doctor has no row for a registered key, or one for an unregistered key.
  assert.equal(judged(SECOND_MAC.profiles, {'chrome.extension.school': installedRow('Profile 12')}), 'FAIL');
  assert.equal(judged([school], {'chrome.extension.school': installedRow('Profile 12'), 'chrome.extension.ssfs': absentRow('Profile 1')}), 'FAIL');
  assert.equal(rollup(statuses(defaultRegistryChecks({profiles: SECOND_MAC.profiles, doctor: null, profile: 'school'}))), 'FAIL');
  // Not ready only for its binding or the live check: the extension is installed, so doctor passes, and that agrees.
  for (const reason of ['not_bound', 'binding_stale', 'backends_unlistable'])
    assert.equal(judged([school, {...ssfs, reason}], {'chrome.extension.school': installedRow('Profile 12'), 'chrome.extension.ssfs': installedRow('Profile 1')}), 'PASS', reason);
});

test('a list row whose readiness contradicts its reason fails before doctor or unreadable data are considered', () => {
  const [school, ssfs] = SECOND_MAC.profiles;
  const judge = (row, doctorRow) => defaultRegistryChecks({profiles: [school, row], doctor: doctorRows({'chrome.extension.school': installedRow('Profile 12'), 'chrome.extension.ssfs': doctorRow}), profile: 'school'})
    .find(c => c.name.startsWith('default home: ssfs '));
  // Ready yet not installed, against doctor's absent-extension row: the reproduced case.
  const contradicted = judge({...ssfs, ready: true, extensionInstanceId: 'inst-x'}, absentRow('Profile 1'));
  assert.equal(contradicted.status, 'FAIL');
  assert.doesNotMatch(contradicted.detail, /extension installed/);
  for (const reason of ['profile_directory_missing', 'not_bound', 'binding_stale', 'backends_unlistable', 'chrome_data_unreadable'])
    assert.equal(judge({...ssfs, ready: true, reason, extensionInstanceId: 'inst-x'}, installedRow('Profile 1')).status, 'FAIL', reason);
  const unreadable = ['blocked', 'whether the OpenAI extension is installed is unknown: this process may not read Chrome\'s data directory (EPERM)'];
  assert.equal(judge({...ssfs, ready: true, reason: 'chrome_data_unreadable', chromeDataError: 'EPERM', extensionInstanceId: 'inst-x'}, unreadable).status, 'FAIL', 'not BLOCKED');
  // Not ready without a reason, or with an unknown one; ready without a binding.
  assert.equal(judge({key: 'ssfs', chromeProfileDirectory: 'Profile 1', ready: false}, installedRow('Profile 1')).status, 'FAIL');
  assert.equal(judge({...ssfs, reason: 'something_else'}, installedRow('Profile 1')).status, 'FAIL');
  assert.equal(judge({key: 'ssfs', chromeProfileDirectory: 'Profile 1', ready: true}, installedRow('Profile 1')).status, 'FAIL');
  // The well-formed shapes still pass.
  assert.equal(rollup(statuses(defaultRegistryChecks({...OWNER, profile: 'personal'}))), 'PASS');
  assert.equal(rollup(statuses(defaultRegistryChecks({...SECOND_MAC, profile: 'school'}))), 'PASS');
});

test('the live profile not ready is BLOCKED on the pick or the reason, and an empty registry is BLOCKED, never a pass', () => {
  const rows = {'chrome.extension.school': installedRow('Profile 12'), 'chrome.extension.ssfs': absentRow('Profile 1')};
  const unbound = defaultRegistryChecks({profiles: [{...SECOND_MAC.profiles[0], ready: false, reason: 'not_bound', extensionInstanceId: undefined}, SECOND_MAC.profiles[1]], doctor: doctorRows(rows), profile: 'school'});
  assert.equal(rollup(statuses(unbound)), 'BLOCKED');
  assert.match(unbound.at(-1).detail, /school not bound; user pick pending.*profiles bind school --extension-instance-id/);
  assert.match(unbound.at(-2).detail, /no registered profile is ready|bind one/);
  const stale = defaultRegistryChecks({profiles: [{...SECOND_MAC.profiles[0], ready: false, reason: 'binding_stale', extensionInstanceId: 'old-id'}, SECOND_MAC.profiles[1]], doctor: doctorRows(rows), profile: 'school'});
  assert.equal(rollup(statuses(stale)), 'BLOCKED');
  assert.match(stale.at(-1).detail, /school binding stale.*user pick pending/);
  assert.ok(!JSON.stringify(stale).includes('old-id'));
  assert.equal(rollup(statuses(defaultRegistryChecks({profiles: [], doctor: doctorRows({}), profile: 'personal'}))), 'BLOCKED');
});

test('--profile names the live profile: the reports must have driven it and this home must register it bound', () => {
  assert.equal(rollup(statuses(liveRoundTripChecks(passingLive({profile: 'school'}), {profile: 'school'}))), 'PASS');
  const other = liveRoundTripChecks(passingLive(), {profile: 'school'});
  assert.equal(rollup(statuses(other)), 'FAIL');
  assert.match(other[0].detail, /drove profile "personal"; --profile is school/);
  const [school, ssfs] = SECOND_MAC.profiles;
  assert.equal(liveProfileCheck(school, 'school').status, 'PASS');
  assert.ok(!JSON.stringify(liveProfileCheck(school, 'school')).includes('inst-second'));
  assert.equal(liveProfileCheck(ssfs, 'ssfs').status, 'FAIL', 'registered but not bound');
  assert.equal(liveProfileCheck(undefined, 'personal').status, 'FAIL', 'not registered here');
  assert.equal(liveProfileCheck(undefined, 'school', {registryError: 'profiles_invalid'}).status, 'FAIL');
  assert.equal(liveProfileCheck(school, 'school', {prefix: 'live: --replace gate'}).name, 'live: --replace gate: profile school is registered and bound in this home');
  assert.equal(rollup(statuses(replaceGateChecks(passingGate({roundTrip: passingLive({profile: 'school'})}), {profile: 'school'}))), 'PASS');
  assert.equal(rollup(statuses(replaceGateChecks(passingGate(), {profile: 'school'}))), 'FAIL');
  const blocked = c2LiveBlocked({...school, ready: false, reason: 'not_bound'}, 'school');
  assert.match(blocked.detail, /profiles bind school --extension-instance-id.*--live --profile school.*"Profile 12".*--c2-report \S+ --profile school/);
  assert.ok(replaceGateBlocked('school').detail.includes('accept-chrome.mjs --live --profile school'));
  assert.ok(replaceGateBlocked('school').detail.includes('--c6-report <file> --profile school'));
});

test('C5 reads the live profile\'s extension check: a second Mac passes with --profile school and is BLOCKED without it', () => {
  const doctor = doctorRows({'chrome.extension.school': installedRow('Profile 12'), 'chrome.extension.ssfs': absentRow('Profile 1'),
    'chrome.host.registered': ['pass', 'desktop: com.openai.codexextension names ~/.codex/x'], 'chrome.hosts.live': ['pass', '1 OpenAI Chrome host(s) running under Google Chrome'], 'codex.login': ['pass', 'logged in']});
  assert.equal(rollup(statuses(doctorChromeChecks({code: 0, doctor, profile: 'school'}))), 'PASS');
  const unnamed = doctorChromeChecks({code: 0, doctor});
  assert.equal(rollup(statuses(unnamed)), 'BLOCKED');
  assert.match(unnamed.find(c => c.name === 'chrome.extension.personal').detail, /pass --profile <a registered key>/);
  assert.equal(rollup(statuses(doctorChromeChecks({code: 0, doctor, profile: 'ssfs'}))), 'BLOCKED', 'its extension is absent');
});

test('an invalid --profile is a usage error before anything runs', async () => {
  assert.equal(await runAll(['--all', '--report', '/nonexistent/report.json', '--profile', 'Not A Key']), 2);
});

// ---- C3's scratch scenario: a fixture Chrome, never this Mac's ------------------------------------------------------

test('the scratch Chrome fixture names three profiles with the OpenAI extension in exactly one', t => {
  const s = scratch();
  t.after(s.cleanup);
  const chrome = chromeFacts({userData: writeScratchChrome(s.dir)});
  assert.deepEqual(SCRATCH_PROFILES.map(p => [p.key, chrome.profileDirectoryExists(p.directory), chrome.extensionInstalled(p.directory)]),
    SCRATCH_PROFILES.map(p => [p.key, 'exists', p.extension]));
  assert.equal(SCRATCH_PROFILES.filter(p => p.extension === 'installed').length, 1);
  assert.deepEqual([...chrome.displayNames().keys()].sort(), SCRATCH_PROFILES.map(p => p.directory).sort());
});

test('the scratch scenario passes through the real CLI against the fixture, and fails when the CLI does not read it', t => {
  const s = scratch();
  t.after(s.cleanup);
  writeScratchChrome(join(s.dir, 'user'));
  mkdirSync(join(s.dir, 'empty'));
  const cli = (args, user) => {
    const r = spawnSync(process.execPath, [join(REPO, 'bin', 'cua.mjs'), ...args], {env: {...process.env, CUA_HOME: join(s.dir, `cua-${user}`), HOME: join(s.dir, user)}, encoding: 'utf8', timeout: 30_000});
    return {code: r.status, stdout: r.stdout};
  };
  const adds = user => SCRATCH_PROFILES.map(({key, directory, extension}) => {
    const r = cli(['profiles', 'add', key, '--chrome-profile', directory, '--json'], user);
    return scratchAddCheck({key, directory, expected: extension, code: r.code, out: JSON.parse(r.stdout)});
  });
  assert.deepEqual(statuses(adds('user')), ['PASS', 'PASS', 'PASS']);
  assert.equal(scratchListCheck(JSON.parse(cli(['profiles', 'list', '--json'], 'user').stdout).profiles).status, 'PASS');
  assert.equal(scratchHumanCheck(cli(['profiles', 'list'], 'user').stdout.split('\n'), REASONS).status, 'PASS');
  // A HOME without the fixture: every directory is missing, which is a failure of the scenario, not a BLOCKED Mac.
  assert.deepEqual(statuses(adds('empty')), ['FAIL', 'FAIL', 'FAIL']);
});

test('the host notes must carry the three browser rules within the instructions limit', () => {
  const notes = 'select it with cua.getBrowser({extensionInstanceId}). use tab.playwright locators. give that js call timeout_ms of at least 60000. If it times out, a tab may still have opened';
  assert.equal(hostNotesCheck(notes).status, 'PASS');
  assert.equal(hostNotesCheck(notes.replace('tab.playwright', 'typeText')).status, 'FAIL');
  assert.equal(hostNotesCheck(notes + 'x'.repeat(2048)).status, 'FAIL');
  assert.equal(hostNotesCheck(undefined).status, 'FAIL');
});

test('profiles_list must equal the registry: keys, readiness, reasons, instance ids only when ready, no directories', () => {
  const registry = [{key: 'personal', chromeProfileDirectory: 'Default', ready: true, extensionInstanceId: 'i1', boundAt: 't'}, {key: 'work', chromeProfileDirectory: 'Profile 8', ready: false, reason: 'extension_not_installed'}];
  const good = {status: 'ok', profiles: [{key: 'personal', ready: true, extensionInstanceId: 'i1'}, {key: 'work', ready: false, reason: 'extension_not_installed'}]};
  const check = profilesListCheck(good, registry);
  assert.equal(check.status, 'PASS');
  assert.ok(!JSON.stringify(check).includes('i1'));
  assert.equal(profilesListCheck({...good, profiles: [{...good.profiles[0], chromeProfileDirectory: 'Default'}, good.profiles[1]]}, registry).status, 'FAIL');
  assert.equal(profilesListCheck({...good, profiles: good.profiles.slice(1)}, registry).status, 'FAIL');
  assert.equal(profilesListCheck({status: 'error', code: 'profiles_invalid'}, registry).status, 'FAIL');
  // Liveness is checked per request: a profile the registry has ready may be reported stale or unverifiable, never
  // with its instance id; a profile the registry has not ready cannot become a liveness case.
  for (const reason of ['binding_stale', 'backends_unlistable'])
    assert.equal(profilesListCheck({...good, profiles: [{key: 'personal', ready: false, reason}, good.profiles[1]]}, registry).status, 'PASS', reason);
  assert.equal(profilesListCheck({...good, profiles: [{key: 'personal', ready: false, reason: 'binding_stale', extensionInstanceId: 'i1'}, good.profiles[1]]}, registry).status, 'FAIL');
  assert.equal(profilesListCheck({...good, profiles: [good.profiles[0], {key: 'work', ready: false, reason: 'binding_stale'}]}, registry).status, 'FAIL');
  assert.equal(profilesListCheck({...good, profiles: [{key: 'personal', ready: false, reason: 'not_bound'}, good.profiles[1]]}, registry).status, 'FAIL');
});

const doctorOf = over => ({ok: true, checks: Object.entries({
  'chrome.extension.personal': ['pass', 'installed'], 'chrome.host.registered': ['pass', 'desktop: com.openai.codexextension names ~/.codex/x'],
  'chrome.hosts.live': ['pass', '1 OpenAI Chrome host(s) running under Google Chrome'], 'codex.login': ['pass', 'logged in'], 'chrome.host.config': ['pass', 'ok'], ...over,
}).map(([name, [status, detail]]) => ({name, status, detail}))});

test('C5 passes on this Mac\'s expected doctor; environment gaps are BLOCKED and a missing check FAILs', () => {
  assert.equal(rollup(statuses(doctorChromeChecks({code: 0, doctor: doctorOf()}))), 'PASS');
  assert.equal(rollup(statuses(doctorChromeChecks({code: 0, doctor: doctorOf({'chrome.hosts.live': ['blocked', 'no host']})}))), 'BLOCKED');
  assert.equal(rollup(statuses(doctorChromeChecks({code: 0, doctor: doctorOf({'codex.login': ['blocked', 'run cua login']})}))), 'BLOCKED');
  assert.equal(rollup(statuses(doctorChromeChecks({code: 0, doctor: doctorOf({'chrome.host.registered': ['pass', 'cua: names ~/Library/x']})}))), 'BLOCKED', 'cua registered means the gate is mid-run');
  const unregistered = doctorOf();
  unregistered.checks = unregistered.checks.filter(c => c.name !== 'chrome.extension.personal');
  assert.equal(rollup(statuses(doctorChromeChecks({code: 0, doctor: unregistered}))), 'BLOCKED', 'doctor has no per-profile check for an unregistered profile');
  const missing = doctorOf();
  missing.checks = missing.checks.filter(c => c.name !== 'chrome.hosts.live');
  assert.equal(rollup(statuses(doctorChromeChecks({code: 0, doctor: missing}))), 'FAIL');
  assert.equal(rollup(statuses(doctorChromeChecks({code: 1, doctor: {...doctorOf(), ok: false}}))), 'FAIL');
  assert.equal(rollup(statuses(doctorChromeChecks({code: 1, doctor: null}))), 'FAIL');
});

// ---- C6: when the live refusal and no-op may run ---------------------------------------------------------------------

test('a manifest slot is cua\'s only at cua\'s pinned host path; anything else is foreign with its class', () => {
  const home = '/Users/u/Library/Application Support/cua';
  const ctx = {home, userHome: '/Users/u', suffixes: new Set(['chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome'])};
  assert.deepEqual(classifySlot(null, ctx), {state: 'absent'});
  assert.deepEqual(classifySlot(JSON.stringify({path: `${home}/runtimes/26.928.40906-darwin-arm64/chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome`}), ctx), {state: 'ours'});
  assert.deepEqual(classifySlot(JSON.stringify({path: '/Users/u/.codex/plugins/cache/x/ChatGPT for Chrome'}), ctx), {state: 'foreign', pathClass: 'desktop'});
  assert.deepEqual(classifySlot('garbage', ctx), {state: 'foreign', pathClass: 'unreadable'});
});

test('the live refusal runs only against a foreign manifest and never while cua\'s host is registered', () => {
  const foreign = [{browser: 'chrome', state: 'foreign', pathClass: 'desktop'}, {browser: 'edge', state: 'absent'}];
  assert.deepEqual(registrationGuard(foreign), {refusal: {run: true}, noop: {run: true}});
  const ours = registrationGuard([{browser: 'chrome', state: 'ours'}, {browser: 'edge', state: 'foreign', pathClass: 'desktop'}]);
  assert.equal(ours.refusal.run, false);
  assert.equal(ours.noop.run, false, 'unregister would remove cua\'s live registration');
  assert.match(ours.refusal.reason, /chrome/);
  const empty = registrationGuard([{browser: 'chrome', state: 'absent'}]);
  assert.equal(empty.refusal.run, false, 'with nothing foreign, register would write');
  assert.equal(empty.noop.run, true);
});

// ---- C7 ---------------------------------------------------------------------------------------------------------------

test('binary sniffing finds Mach-O executables and archives by their magic', () => {
  assert.equal(binaryKind(Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 1])), 'Mach-O');
  assert.equal(binaryKind(Buffer.from([0xca, 0xfe, 0xba, 0xbe])), 'Mach-O');
  assert.equal(binaryKind(Buffer.from('PK\x03\x04rest', 'latin1')), 'zip archive');
  assert.equal(binaryKind(Buffer.from([0x1f, 0x8b, 8])), 'gzip archive');
  assert.equal(binaryKind(Buffer.from('#!/usr/bin/env node\n')), null);
  assert.equal(binaryKind(Buffer.alloc(0)), null);
});

const BASE_PACK = ['bin/cua.mjs', 'cua-shim.mjs', 'verify.mjs', 'scripts/probe/lib.mjs', 'scripts/build-helper.mjs', 'README.md', '.claude-plugin/plugin.json',
  'src/cli.mjs', 'src/mcp/server.mjs', 'src/services/sky.mjs', 'src/secrets/client.mjs', 'native/keychain/Package.swift', 'native/keychain/Sources/cua-keychain/main.swift',
  'runtime/releases/26.928.40906-darwin-arm64.json', ...PHASE_C_MODULES];

test('the pack passes with the Phase C modules and only tracked, text, non-machine files', () => {
  const read = () => Buffer.from('export const x = 1;\n');
  assert.equal(rollup(statuses(packChecks({files: BASE_PACK, tracked: BASE_PACK, read, userHome: '/Users/u'}))), 'PASS');
});

test('the pack fails without a new module, with an untracked file, a host binary, an archive or a credential', () => {
  const read = () => Buffer.from('ok\n');
  const without = BASE_PACK.filter(p => p !== 'src/profiles/registry.mjs');
  assert.equal(rollup(statuses(packChecks({files: without, tracked: BASE_PACK, read, userHome: '/Users/u'}))), 'FAIL');
  const trackedSrc = [...BASE_PACK, 'src/new/thing.mjs'];
  assert.equal(rollup(statuses(packChecks({files: BASE_PACK, tracked: trackedSrc, read, userHome: '/Users/u'}))), 'FAIL', 'every tracked src module is packed');
  for (const bad of ['runtimes/x/chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome', 'ChatGPT-darwin-arm64.zip', 'state/codex/auth.json', 'profiles.json', 'chrome/manifest-backup/chrome.json']) {
    const files = [...BASE_PACK, bad];
    assert.equal(rollup(statuses(packChecks({files, tracked: files, read, userHome: '/Users/u'}))), 'FAIL', bad);
  }
  const machO = path => path === 'bin/cua.mjs' ? Buffer.from([0xcf, 0xfa, 0xed, 0xfe]) : Buffer.from('ok\n');
  assert.equal(rollup(statuses(packChecks({files: BASE_PACK, tracked: BASE_PACK, read: machO, userHome: '/Users/u'}))), 'FAIL', 'a binary under an innocent name');
  const token = path => path === 'src/cli.mjs' ? Buffer.from(`const k = "sk-proj-${'a'.repeat(30)}";`) : Buffer.from('ok\n');
  assert.equal(rollup(statuses(packChecks({files: BASE_PACK, tracked: BASE_PACK, read: token, userHome: '/Users/u'}))), 'FAIL');
  const personal = path => path === 'src/cli.mjs' ? Buffer.from('"/Users/u/Library/x"') : Buffer.from('ok\n');
  assert.equal(rollup(statuses(packChecks({files: BASE_PACK, tracked: BASE_PACK, read: personal, userHome: '/Users/u'}))), 'FAIL');
  const untracked = [...BASE_PACK, 'notes.txt'];
  assert.equal(rollup(statuses(packChecks({files: untracked, tracked: BASE_PACK, read, userHome: '/Users/u'}))), 'FAIL');
  assert.equal(rollup(statuses(packChecks({files: [], tracked: BASE_PACK, read, userHome: '/Users/u'}))), 'FAIL');
});

test('the helper suite passes only when both the Swift and the Node-driven tests ran and passed', () => {
  const node = '# tests 7\n# suites 0\n# pass 7\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  assert.equal(helperSuiteVerdict({code: 0, text: `Test run with 55 tests in 9 suites passed after 1.2 seconds.\n${node}`}).status, 'PASS');
  assert.equal(helperSuiteVerdict({code: 1, text: `Test run with 55 tests in 9 suites failed after 1.2 seconds.\n${node}`}).status, 'FAIL');
  assert.equal(helperSuiteVerdict({code: 0, text: node}).status, 'FAIL', 'no Swift summary');
  assert.equal(helperSuiteVerdict({code: 0, text: 'Test run with 55 tests in 9 suites passed after 1 s.\n'}).status, 'FAIL', 'no Node summary');
  assert.equal(helperSuiteVerdict({code: 0, text: `Test run with 0 tests in 0 suites passed after 0 s.\n${node}`}).status, 'BLOCKED');
  // The Node summary must be one coherent block: a partial TAP block after a passing spec block, or counters spread over
  // a truncated block and a complete one, are not a pass.
  const swiftPassed = 'Test run with 55 tests in 9 suites passed after 1.2 seconds.\n';
  const spec = node.replaceAll('# ', 'ℹ ');
  for (const tail of [`${spec}# tests 7\n# pass 6\n# skipped 1\n`, `ℹ tests 7\nℹ pass 7\nℹ fail 0\n--\n${spec.replace('pass 7', 'pass 6').replace('skipped 0', 'skipped 1')}`]) {
    const verdict = helperSuiteVerdict({code: 0, text: swiftPassed + tail});
    assert.equal(verdict.status, 'FAIL');
    assert.match(verdict.detail, /incomplete test summary/);
  }
  assert.match(helperSuiteVerdict({code: 0, text: `${swiftPassed}${spec}${node.replace('pass 7', 'pass 6').replace('skipped 0', 'skipped 1')}`}).detail, /conflicting test summaries/);
});

// ---- Chrome data this process may not read (macOS privacy protection) ---------------------------------------------

test('unreadable Chrome data: a bound live profile passes C4 with the state recorded; presence checks are BLOCKED, never FAIL or PASS', () => {
  const unreadable = {chromeDataError: 'EPERM', reason: 'chrome_data_unreadable', ready: false};
  const registry = [{key: 'personal', chromeProfileDirectory: 'Default', extensionInstanceId: 'i1', boundAt: 't', ...unreadable}, {key: 'work', chromeProfileDirectory: 'Profile 8', ...unreadable}];
  // C4: live evidence makes the bound one ready with its stored id; unbound stays chrome_data_unreadable.
  const live = {status: 'ok', profiles: [{key: 'personal', ready: true, extensionInstanceId: 'i1'}, {key: 'work', ready: false, reason: 'chrome_data_unreadable'}]};
  const c4 = profilesListCheck(live, registry);
  assert.equal(c4.status, 'PASS');
  assert.match(c4.detail, /unreadable from this process for personal \(EPERM, bound: readiness from the live check\), work \(EPERM, unbound\)/);
  assert.equal(profilesListCheck({status: 'ok', profiles: [{key: 'personal', ready: false, reason: 'chrome_data_unreadable'}, live.profiles[1]]}, registry).status, 'PASS', 'not live: still unreadable');
  assert.equal(profilesListCheck({status: 'ok', profiles: [{key: 'personal', ready: true, extensionInstanceId: 'other'}, live.profiles[1]]}, registry).status, 'FAIL', 'only its stored id');
  assert.equal(profilesListCheck({status: 'ok', profiles: [live.profiles[0], {key: 'work', ready: true, extensionInstanceId: 'w'}]}, registry).status, 'FAIL', 'unbound never ready');
  // C2 without a report: the live run is what decides.
  assert.match(c2LiveBlocked(registry[0]).detail, /bound but this process may not read Chrome's data directory \(EPERM\).*live run decides.*accept-chrome\.mjs --live/);
  // C3: the scratch add registers but presence cannot be shown; the list and the default registry are BLOCKED.
  assert.deepEqual(scratchAddCheck({key: 'work', directory: 'Profile 8', expected: 'absent', code: 0, out: {ok: true, extension: 'unreadable', chromeDataError: 'EPERM'}}).status, 'BLOCKED');
  assert.equal(scratchAddCheck({key: 'work', directory: 'Profile 8', expected: 'absent', code: 0, out: {ok: true, extension: 'absent'}}).status, 'PASS');
  assert.equal(scratchAddCheck({key: 'work', directory: 'Profile 8', expected: 'absent', code: 0, out: {ok: true, extension: 'installed'}}).status, 'FAIL');
  assert.equal(scratchListCheck([{key: 'personal', ...unreadable}, {key: 'school', ...unreadable}, {key: 'work', ...unreadable}]).status, 'BLOCKED');
  const unreadableRow = key => [`chrome.extension.${key}`, ['blocked', 'whether the OpenAI extension is installed is unknown: this process may not read Chrome\'s data directory (EPERM) (Chrome profile "x")']];
  const defaults = defaultRegistryChecks({profiles: [{key: 'personal', ready: true, extensionInstanceId: 'i1', chromeDataError: 'EPERM'}, {key: 'school', ...unreadable}, {key: 'work', ...unreadable}],
    doctor: doctorRows(Object.fromEntries(['personal', 'school', 'work'].map(unreadableRow)))});
  assert.deepEqual(statuses(defaults), ['PASS', 'PASS', 'BLOCKED', 'BLOCKED', 'PASS', 'PASS']);
  assert.match(defaults[1].detail, /ready on live evidence/);
  assert.match(defaults.at(-1).detail, /ready on live evidence/);
  // C5: doctor's unreadable row is BLOCKED with the Full Disk Access fix.
  const c5 = doctorChromeChecks({code: 0, doctor: doctorOf({'chrome.extension.personal': ['blocked', 'whether the OpenAI extension is installed is unknown: this process may not read Chrome\'s data directory (EPERM)']})});
  const row = c5.find(c => c.name === 'chrome.extension.personal');
  assert.equal(row.status, 'BLOCKED');
  assert.match(row.detail, /Full Disk Access/);
});

test('the scratch list checks fail on any contract violation before an unreadable row can make them BLOCKED', () => {
  const unreadable = key => ({key, ready: false, reason: 'chrome_data_unreadable', chromeDataError: 'EPERM'});
  assert.equal(scratchListCheck([unreadable('personal'), unreadable('school'), unreadable('work')]).status, 'BLOCKED', 'pure unreadable');
  assert.equal(scratchListCheck([unreadable('personal'), {key: 'school', ready: false, reason: 'extension_not_installed'}, unreadable('work')]).status, 'BLOCKED', 'readable rows as expected');
  assert.equal(scratchListCheck([unreadable('personal'), {key: 'school', ready: false, reason: 'extension_not_installed'}, {key: 'work', ready: true, extensionInstanceId: 'w'}]).status, 'FAIL', 'a ready row in an unbound scratch registry');
  assert.equal(scratchListCheck([unreadable('personal'), {key: 'school', ready: false, reason: 'not_bound'}, unreadable('work')]).status, 'FAIL', 'a readable row with the wrong reason');
  assert.equal(scratchListCheck([unreadable('personal'), unreadable('work')]).status, 'FAIL', 'a missing key');
  assert.equal(scratchListCheck([unreadable('extra'), unreadable('personal'), unreadable('school'), unreadable('work')]).status, 'FAIL', 'an unexpected key');
  assert.equal(scratchListCheck(undefined).status, 'FAIL');

  const row = (key, status, reason) => `${key.padEnd(12)} ${status.padEnd(10)} Default      ${REASONS[reason] ?? `extension instance ${reason}`}`;
  const lines = rows => rows.map(r => row(...r));
  assert.equal(scratchHumanCheck(lines([['personal', 'not ready', 'not_bound'], ['school', 'not ready', 'extension_not_installed'], ['work', 'not ready', 'extension_not_installed']]), REASONS).status, 'PASS');
  assert.equal(scratchHumanCheck(lines([['personal', 'not ready', 'chrome_data_unreadable'], ['school', 'not ready', 'chrome_data_unreadable'], ['work', 'not ready', 'chrome_data_unreadable']]), REASONS).status, 'BLOCKED', 'pure unreadable');
  assert.equal(scratchHumanCheck(lines([['personal', 'not ready', 'chrome_data_unreadable'], ['school', 'not ready', 'extension_not_installed'], ['work', 'ready', 'inst-w']]), REASONS).status, 'FAIL', 'mixed with a wrongly ready row');
  assert.equal(scratchHumanCheck(lines([['personal', 'not ready', 'chrome_data_unreadable'], ['school', 'not ready', 'not_bound']]), REASONS).status, 'FAIL', 'a wrong reason and a missing key');
});
