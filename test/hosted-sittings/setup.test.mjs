// The runner's setup for a sitting (scripts/hosted-sittings/setup.mjs): in H0's order, the loopback device, the
// harness checkout, the run's install and engine, the system-database rows for the vendor's helper and cua's engine
// before either launches, the relaunch and two-pass approve, then the runner's record the harnesses attest. Every
// command, row and approve is a spy here; nothing runs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hostedSetup} from '../../scripts/hosted-sittings/setup.mjs';
import {CLIENTS} from '../../scripts/hosted-sittings/tcc.mjs';

const HOSTED = {RUNNER_ENVIRONMENT: 'github-hosted', ImageOS: 'macos15', ImageVersion: '20261118.1', GITHUB_RUN_ID: '45144483807', GITHUB_RUN_ATTEMPT: '1', PATH: '/usr/bin'};
const HOME = '/Users/runner';
const CUA_HOME = `${HOME}/Library/Application Support/cua`;
const ENGINE = `${CUA_HOME}/engine/cua Engine.app`;
const SKY = `${CUA_HOME}/runtimes/r1/SkyComputerUseService.app`;
const COMMIT = 'c'.repeat(40);
const UNC = {pid: 2596, bundleId: 'com.apple.UserNotificationCenter'};
// A warm-up as ./warm-up.mjs records it: cua's copy alerted at its approve and raises none; the vendor's raises its own.
const warmedUp = copy => ({copy, capture: {ok: true, engine: copy, bytes: 1, textEdit: {pids: [4009], ended: true}}, captureAlerts: {watched: true, count: copy === 'vendor' ? 2 : 0},
  frontAfter: UNC, windowsAfter: [], wait: {cleared: true, waitedMs: 3000, polls: 4, seen: [UNC, {pid: 410, bundleId: 'com.apple.finder'}], front: {pid: 410, bundleId: 'com.apple.finder'}}, windowsAtEnd: []});

// The screen after the warm-ups (../native-matrix/system-windows.swift): no alert window unless a test gives one.
const SCREEN = {windows: [], displays: [{x: 0, y: 0, width: 1920, height: 1080}]};
// The display mode switch as ./display-mode.mjs answers it (ruling 1164): 1024x768 to 1920x1080, no prompt.
const MODE = (width, height, modeId) => ({width, height, modeId, pixelWidth: width, pixelHeight: height});
const SWITCHED = {ok: true, detail: '1024x768 (mode 3) -> 1920x1080 (mode 10), read back 1920x1080; 0 alert windows, none moved; no prompt',
  record: {before: {mode: MODE(1024, 768, 3), alerts: [], front: null}, set: MODE(1920, 1080, 10), readBack: {bounds: {x: 0, y: 0, width: 1920, height: 1080}, mode: MODE(1920, 1080, 10)},
    after: {alerts: [], front: null}, promptSeen: [], recentred: [], watchedMs: 3000}};
function spies({fail = null, vendorUp = false, approved = true, missing = [], warmUp = null, screen = () => SCREEN, switched = SWITCHED, trust = {trusted: true}} = {}) {
  const calls = [], defaults = new Map();
  const exec = (command, args, options = {}) => {
    const line = [command, ...args].join(' ');
    calls.push({kind: 'exec', line, env: options.env});
    if (fail && line.includes(fail)) return {status: 1, stdout: '', stderr: 'no'};
    // TextEdit's preferences (../../scripts/hosted-sittings/venue.mjs): written, then read back as defaults prints them.
    if (command === '/usr/bin/defaults' && args[0] === 'write') { defaults.set(`${args[1]} ${args[2]}`, args[4]); return {status: 0, stdout: '', stderr: ''}; }
    if (command === '/usr/bin/defaults' && args[0] === 'read') { const v = defaults.get(`${args[1]} ${args[2]}`); return v === undefined ? {status: 1, stdout: '', stderr: 'does not exist'} : {status: 0, stdout: `${v.trimEnd()}\n`, stderr: ''}; }
    // The key-window reader's grant over the loopback ssh (guard-device.mjs trust), as its last line prints it.
    if (command === 'ssh' && line.includes('guard-device.mjs trust')) return trust === null ? {status: 255, stdout: '', stderr: 'Connection refused'} : {status: 0, stdout: `${JSON.stringify(trust)}\n`, stderr: ''};
    if (command === 'ssh') return {status: 0, stdout: `${process.version}\n`, stderr: ''};
    if (line.includes('install --json')) return {status: 0, stdout: JSON.stringify({ok: true, release: 'r1'}), stderr: ''};
    return {status: 0, stdout: '', stderr: ''};
  };
  const deps = {
    env: HOSTED, platform: 'darwin', home: HOME, checkout: '/w/cua', commit: COMMIT, exec,
    runtimeOf: home => { calls.push({kind: 'runtime', home}); return {release: 'r1', home, paths: {skyServiceApp: SKY}}; },
    engineOf: () => ENGINE,
    identityOf: () => ({build: 'b'.repeat(40), engineVersion: '0.5.0'}),
    vmOf: () => ({platformUuid: '5F2C1A9E-1D2B-4C3D-8E4F-0123456789AB', bootedAt: '2026-11-23T09:58:12.000Z'}), newId: () => 'setup-1',
    realpath: path => path,
    vendorRunning: app => { calls.push({kind: 'vendor-running', app}); return vendorUp; },
    grant: grants => { calls.push({kind: 'grant', clients: grants.map(g => g.client)}); return {rows: [], missing}; },
    approve: ({home}) => { calls.push({kind: 'approve', home}); return {approved, summary: approved ? 'approved in two passes: pass 1 engine_capture_confirmation, pass 2 approved' : 'not approved: pass 1 engine_capture_confirmation, pass 2 engine_capture_confirmation'}; },
    warmUp: async copy => { calls.push({kind: `warm-up ${copy}`}); return warmUp ? warmUp(copy) : warmedUp(copy); },
    switchMode: async () => { calls.push({kind: 'display mode'}); return switched; },
    screen: () => { calls.push({kind: 'screen'}); return screen(); },
    stopEngine: async () => { calls.push({kind: 'engine-stop'}); return {wasRunning: true, pid: 2142}; },
    write: (path, record) => calls.push({kind: 'write', path, record}),
    log: () => {},
  };
  return {calls, deps};
}

test('off a GitHub-hosted runner it refuses before any command, row or approve', async () => {
  for (const [env, platform] of [[{}, 'darwin'], [{RUNNER_ENVIRONMENT: 'self-hosted'}, 'darwin'], [HOSTED, 'linux']]) {
    const {calls, deps} = spies();
    await assert.rejects(hostedSetup({...deps, env, platform}), /refused/);
    assert.deepEqual(calls, []);
  }
});

test('on a runner: the loopback device, the harness checkout, the install and engine, the rows, the approve, then the record', async () => {
  const {calls, deps} = spies();
  const report = await hostedSetup({...deps, engineArchive: '/t/engine.tgz'});
  assert.equal(report.ok, true, report.steps.map(s => `${s.step}: ${s.detail}`).join('\n'));
  assert.deepEqual(report.steps.map(s => s.step), ['loopback', 'harness checkout', 'prepare', 'install', 'engine', 'vendor helper not running', 'vendor rows', 'approve', 'warm-up cua', 'warm-up vendor', 'display mode', 'placement', 'textedit defaults', 'key-window trust', 'engine stop', 'record']);
  const order = calls.map(c => (c.kind === 'exec' ? c.line.split(' ').slice(0, 3).join(' ') : c.kind === 'grant' ? `grant ${c.clients}` : c.kind));
  const at = needle => order.findIndex(o => o.startsWith(needle));
  assert.ok(at('sh scripts/hosted-sittings/loopback.sh') === 0);
  assert.ok(at('ssh') > 0);
  assert.ok(calls.some(c => c.kind === 'exec' && c.line === `ssh -F ${HOME}/.local/share/cua-hosted/ssh/config hosted-macos node -v`), 'the device is reached through its own config only');
  assert.ok(at('node scripts/native-baseline.mjs prepare') > at('git -C'), 'the parity clone is made from the job\'s checkout before prepare');
  assert.ok(at('tar') > at('node bin/cua.mjs install'), 'the engine is unpacked into the run\'s install');
  assert.ok(at('codesign') > at('tar'));
  assert.ok(at(`grant ${CLIENTS.vendor}`) > at('vendor-running'), 'the helper is known not to be running before its rows');
  assert.ok(at('approve') > at(`grant ${CLIENTS.vendor}`), 'both bundles\' rows precede any launch the approve makes');
  assert.equal(at('write'), order.length - 1, 'the record comes last, once the engine is approved');
  // Pilot A (run 45218179501): the engine approve left running is stopped, so every sitting starts from a known engine state.
  assert.ok(at('engine-stop') > at('approve') && at('engine-stop') < at('write'));
  // Ruling 1153: each copy's first capture in setup, after the approve and before the engine stop, both recorded alike.
  assert.ok(at('approve') < at('warm-up cua') && at('warm-up cua') < at('warm-up vendor') && at('warm-up vendor') < at('engine-stop'));
  assert.deepEqual(report.warmUps, [warmedUp('cua'), warmedUp('vendor')]);
  assert.match(report.steps.find(s => s.step === 'warm-up vendor').detail, /^capture made \(vendor's\), 2 SCAlert lines, com\.apple\.UserNotificationCenter in front after it; it left the front after 3000 ms$/);
  // Ruling 1154: the alert windows read once the warm-ups raised them, and where each planned scene window would go.
  assert.ok(at('warm-up vendor') < at('display mode') && at('display mode') < at('screen') && at('screen') < at('engine-stop'), 'the mode set after the warm-ups, the placement read after it');
  assert.deepEqual(report.modeSwitch, SWITCHED.record);
  assert.deepEqual(report.placement.alerts, []);
  assert.deepEqual(Object.values(report.placement.scenes).map(p => p.moved), [false, false, false, false, false]);
  // Ruling 1169: TextEdit's preferences written once the venue is chosen, after the warm-ups' TextEdit has ended and
  // before any run launches it; the venue rides in the runner's record, which the device's scenes and every lane read.
  assert.ok(at('/usr/bin/defaults write') > at('screen') && at('/usr/bin/defaults write') < at('engine-stop'));
  assert.ok(calls.filter(c => c.kind === 'exec' && c.line.startsWith('/usr/bin/defaults ')).every(c => c.line.split(' ')[2] === 'com.apple.TextEdit'), 'TextEdit\'s own domain only');
  assert.equal(report.venue.textEdit.ok, true);
  // The key-window reader's grant, read where the runs reach the device: over the loopback ssh, in the harness checkout.
  assert.ok(calls.some(c => c.kind === 'exec' && c.line.startsWith(`ssh -F ${HOME}/.local/share/cua-hosted/ssh/config hosted-macos cd `) && c.line.endsWith('&& node scripts/hosted-sittings/guard-device.mjs trust')));
  assert.ok(at('ssh -F') < at('engine-stop'));
  assert.deepEqual(report.venue.keyWindowTrust, {trusted: true, via: 'loopback ssh'});
  assert.equal(report.steps.find(s => s.step === 'key-window trust').detail, 'trusted over the loopback ssh: the key-window requirement is observed');
  assert.deepEqual(report.venue.frames.chrome, {x: 80, y: 60, width: 800, height: 760}, 'no alert: the hosted size at the mini\'s origin');
  assert.deepEqual(calls.at(-1).record.venue, report.venue);
  assert.deepEqual(report.engineStop, {wasRunning: true, pid: 2142, stopped: true});
  assert.match(report.steps.find(s => s.step === 'engine stop').detail, /^was running \(pid 2142\), stopped$/);
  const install = calls.find(c => c.kind === 'exec' && c.line.includes('install --json'));
  assert.equal(install.env.CUA_NATIVE_ENGINE, 'vendor');
  assert.equal(install.env.CUA_HOME, undefined, 'the default home, the one the engine directory lives in');
  const {path, record} = calls.at(-1);
  assert.equal(path, `${HOME}/.local/share/cua-hosted/runner.json`);
  assert.deepEqual(record.run, {id: '45144483807', attempt: '1'});
  assert.deepEqual(record.install, {home: CUA_HOME, release: 'r1'});
  assert.deepEqual(record.engine, {bundle: ENGINE, build: 'b'.repeat(40), engineVersion: '0.5.0'});
  assert.deepEqual(record.vm, {id: 'setup-1', platformUuid: '5F2C1A9E-1D2B-4C3D-8E4F-0123456789AB', bootedAt: '2026-11-23T09:58:12.000Z'}, 'the VM the setup ran on, under the setup\'s own id');
  assert.deepEqual(report.approved, {runtime: CUA_HOME, engine: ENGINE});
});

test('the key-window reader not trusted, or not reached, over the loopback ssh: recorded with why, and the setup goes on', async () => {
  const untrusted = await hostedSetup({...spies({trust: {trusted: false, reason: 'the reader is not trusted for Accessibility'}}).deps, engineArchive: '/t/engine.tgz'});
  assert.equal(untrusted.ok, true);
  assert.deepEqual(untrusted.venue.keyWindowTrust, {trusted: false, reason: 'the reader is not trusted for Accessibility', via: 'loopback ssh'});
  assert.match(untrusted.steps.find(s => s.step === 'key-window trust').detail, /^not trusted over the loopback ssh \(the reader is not trusted for Accessibility\): every key-window reading will be unread/);
  const unreached = await hostedSetup({...spies({trust: null}).deps, engineArchive: '/t/engine.tgz'});
  assert.equal(unreached.ok, true);
  assert.deepEqual(unreached.venue.keyWindowTrust, {trusted: null, reason: 'the loopback reading failed (exit 255: Connection refused)', via: 'loopback ssh'});
});

test('ruling 1169: the venue: each scene\'s hosted frame clear of the alerts read after the switch, TextEdit\'s preferences, kept in setup.json and the record', async () => {
  const alert = {ownerPid: 2596, ownerName: 'UserNotificationCenter', ownerBundleId: 'com.apple.UserNotificationCenter', layer: 0, number: 90, name: null, bounds: {x: 750, y: 220, width: 420, height: 180}};
  const {calls, deps} = spies({screen: () => ({...SCREEN, windows: [alert]})});
  const report = await hostedSetup({...deps, engineArchive: '/t/engine.tgz'});
  assert.equal(report.ok, true, report.steps.map(s => `${s.step}: ${s.detail}`).join('\n'));
  const {alerts, displays, scenes} = report.placement;
  assert.deepEqual([alerts, displays], [[alert.bounds], SCREEN.displays]);
  // Each the hosted size at the mini's origin, moved by the smallest move clear of the alert: Finder's 800x520 below it,
  // the fixture and the Open panel left of it. Chrome's 800x760 has no clear frame beside this wide alert on 1920x1080:
  // it is kept at its base, said so, and the guard refuses what the alert overlaps.
  assert.deepEqual(report.venue.frames, {chrome: {x: 80, y: 60, width: 800, height: 760}, electron: {x: 22, y: 100, width: 720, height: 560},
    finder: {x: 80, y: 408, width: 800, height: 520}, openPanel: {x: 22, y: 80, width: 720, height: 440}});
  assert.deepEqual(scenes.chrome, {base: {x: 80, y: 60, width: 800, height: 760}, frame: report.venue.frames.chrome, moved: false, reason: 'no 800x760 frame on the display clears the alert windows'});
  // TextEdit sizes its own windows from its preferences; each run reads them back.
  assert.equal(scenes.textedit.base, null);
  assert.match(scenes.textedit.reason, /WidthInChars 60/);
  assert.equal(report.steps.find(s => s.step === 'placement').detail,
    '1 alert window; hosted frames: chrome 80,60 800x760 (no clear frame: kept), electron 22,100 720x560 (moved), finder 80,408 800x520 (moved), openPanel 22,80 720x440 (moved)');
  assert.deepEqual(report.venue.alerts, [{number: 90, bounds: alert.bounds}]);
  assert.deepEqual(report.venue.differences.map(d => d.scene), ['chrome', 'electron', 'finder', 'textedit', 'openPanel']);
  // The Open panel's saved frame, in AppKit's coordinates on the 1920x1080 display.
  const writes = calls.filter(c => c.kind === 'exec' && c.line.startsWith('/usr/bin/defaults write')).map(c => c.line);
  assert.deepEqual(writes, ['/usr/bin/defaults write com.apple.TextEdit WidthInChars -int 60', '/usr/bin/defaults write com.apple.TextEdit NSWindow Frame NSNavPanelAutosaveName -string 22 560 720 440 0 0 1920 1055 ',
    '/usr/bin/defaults write com.apple.TextEdit NSNavPanelExpandedSizeForOpenMode -string {720, 440}']);
  assert.match(report.steps.find(s => s.step === 'textedit defaults').detail, /^com\.apple\.TextEdit: WidthInChars 60, NSWindow Frame NSNavPanelAutosaveName 22 560 720 440 0 0 1920 1055, NSNavPanelExpandedSizeForOpenMode \{720, 440\}; each read back$/);
  assert.deepEqual(calls.at(-1).record.venue, report.venue);

  // The screen unread: the hosted sizes at the mini's origins, unplaced; the setup goes on and the guard refuses what overlaps.
  const unread = await hostedSetup({...spies({screen: () => { throw new Error('swift exited 1'); }}).deps, engineArchive: '/t/engine.tgz'});
  assert.equal(unread.ok, true);
  assert.deepEqual(unread.placement, {unread: true});
  assert.equal(unread.venue.alerts, null);
  assert.deepEqual(unread.venue.frames.chrome, {x: 80, y: 60, width: 800, height: 760});
  assert.match(unread.steps.find(s => s.step === 'placement').detail, /unread/);
});

test('ruling 1169: a preference that does not read back as written fails the setup before the record: a venue not in force is never declared', async () => {
  const {calls, deps} = spies({fail: 'defaults read com.apple.TextEdit WidthInChars'});
  const report = await hostedSetup({...deps, engineArchive: '/t/engine.tgz'});
  assert.equal(report.ok, false);
  assert.equal(report.steps.at(-1).step, 'textedit defaults');
  assert.match(report.steps.at(-1).detail, /WidthInChars not read back/);
  assert.ok(!calls.some(c => ['engine-stop', 'write'].includes(c.kind)));
});

test('without an archive the engine is built on the runner', async () => {
  const {calls, deps} = spies();
  assert.equal((await hostedSetup(deps)).ok, true);
  assert.ok(calls.some(c => c.kind === 'exec' && c.line.includes('bin/cua.mjs engine build --sign adhoc --json')));
  assert.ok(!calls.some(c => c.kind === 'exec' && c.line.startsWith('tar')));
});

test('each step gates the next: a failed one stops the setup with no row, approve or record after it', async () => {
  {
    const {calls, deps} = spies({vendorUp: true});
    const report = await hostedSetup(deps);
    assert.equal(report.ok, false);
    assert.equal(report.steps.at(-1).step, 'vendor helper not running');
    assert.match(report.steps.at(-1).detail, /already running/);
    assert.ok(!calls.some(c => ['grant', 'approve', 'write'].includes(c.kind)));
  }
  {
    const {calls, deps} = spies({approved: false});
    const report = await hostedSetup(deps);
    assert.equal(report.ok, false);
    assert.match(report.steps.at(-1).detail, /not approved/);
    assert.ok(!calls.some(c => c.kind === 'write'));
  }
  {
    const {calls, deps} = spies({missing: ['com.openai.sky.CUAService kTCCServiceAccessibility']});
    const report = await hostedSetup(deps);
    assert.equal(report.steps.at(-1).step, 'vendor rows');
    assert.ok(!calls.some(c => c.kind === 'approve'));
  }
  {
    const {calls, deps} = spies({fail: 'codesign'});
    const report = await hostedSetup({...deps, engineArchive: '/t/engine.tgz'});
    assert.equal(report.steps.at(-1).step, 'engine');
    assert.ok(!calls.some(c => c.kind === 'grant'));
  }
});

// Ruling 1153 and the pilot A ruling: an alert that never leaves the front, or a capture that fails, is recorded and
// the setup goes on; nothing retries.
test('a warm-up whose alert stays in front, or whose capture fails, is recorded and the setup goes on', async () => {
  const held = copy => ({...warmedUp(copy), wait: {cleared: false, waitedMs: 60_000, polls: 61, seen: [UNC], front: UNC}});
  const failed = copy => ({...warmedUp(copy), capture: {ok: false, engine: null, error: 'timeoutReached', textEdit: {pids: [], ended: true}}, captureAlerts: {watched: true, count: 0}});
  for (const [warmUp, detail] of [[held, /UserNotificationCenter still in front after 60000 ms; the sitting goes on/], [failed, /^capture failed \(timeoutReached\), 0 SCAlert lines/]]) {
    const {calls, deps} = spies({warmUp});
    const report = await hostedSetup({...deps, engineArchive: '/t/engine.tgz'});
    assert.equal(report.ok, true);
    assert.match(report.steps.find(s => s.step === 'warm-up vendor').detail, detail);
    assert.equal(calls.filter(c => c.kind === 'warm-up vendor').length, 1, 'no retry');
    assert.equal(calls.at(-1).kind, 'write');
  }
});

// Ruling 1164: a prompt across the switch, or a read-back that is not 1920x1080, fails the setup before any placement,
// engine stop or record; the mode switch's record is kept either way.
test('the display mode: a failed switch stops the setup with its record kept; nothing after it runs', async () => {
  const failed = {ok: false, detail: 'a prompt appeared across the switch (UserNotificationCenter window 95): recorded, never answered',
    record: {...SWITCHED.record, promptSeen: [{number: 95, owner: 'UserNotificationCenter', layer: 8, bounds: {x: 800, y: 400, width: 300, height: 200}}]}};
  const {calls, deps} = spies({switched: failed});
  const report = await hostedSetup({...deps, engineArchive: '/t/engine.tgz'});
  assert.equal(report.ok, false);
  assert.equal(report.steps.at(-1).step, 'display mode');
  assert.match(report.steps.at(-1).detail, /a prompt appeared across the switch/);
  assert.deepEqual(report.modeSwitch, failed.record);
  assert.ok(!calls.some(c => ['screen', 'engine-stop', 'write'].includes(c.kind)));
  // The warm-ups ran before the switch, at the image's 1024x768: one alert raised per copy, recorded as before.
  assert.deepEqual(report.warmUps.map(w => w.copy), ['cua', 'vendor']);
  assert.ok(calls.findIndex(c => c.kind === 'warm-up vendor') < calls.findIndex(c => c.kind === 'display mode'));
});
