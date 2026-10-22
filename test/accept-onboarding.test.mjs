import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import {advanceNumbering, render} from '../src/services/engine/render.mjs';

const textEditShot = JSON.parse(readFileSync(new URL('./native-goldens/textedit/skyshot.json', import.meta.url), 'utf8'));
function textEditState(value) {
  const shot = structuredClone(textEditShot);
  const node = shot.nodes.find(node => node.identifier === 'First Text View');
  Object.assign(node, {value, valueMarkdown: null, numberOfCharacters: value.length});
  return render(shot, advanceNumbering(null, shot));
}

const path = '/fixture/cua Engine.app';
const expected = {engine: 'cua', version: '1', build: 'build-a'};
const errorText = pane => `Computer Use server error -10014: cua Engine needs the ${pane} permission. System Settings > Privacy & Security > ${pane}; click "+", enter ${path}, then switch it on; a relaunch is pending.`;

// External boundaries only: the runner's real cells execute against the fixture API, and real orchestration judges
// the resulting model replies, statuses, operator answers and cleanup. No GUI, TCC, engine or subprocess is started.
function fixture(over = {}) {
  const events = [], logs = [];
  let phase = 'revoked', pid = 10, calls = 0, owners = 0, value = '', activated = false;
  const context = {};
  let activeMeta;
  const status = () => ({bundlePath: path, exists: true, build: expected.build, engineVersion: expected.version,
    approved: true, approvedBuild: expected.build, signature: {kind: 'identity', identityMatches: true},
    status: {pid, bundlePath: path, build: expected.build, connections: calls ? 1 : 0,
      accessibility: phase !== 'revoked', screenRecording: ['granted', 'all'].includes(phase), inputMonitoring: phase === 'all'}});
  const session = {
    async initialize() { events.push('initialize'); },
    async js(code) {
      events.push('cell'); calls++;
      if (over.modelTimeout) return {timedOut: true};
      const content = [];
      const meta = activeMeta = {'cua/nativeEngine': expected};
      context.cua = {getApp: async () => {
        if (!['granted', 'all'].includes(phase)) throw new Error(errorText(phase === 'revoked' ? 'Accessibility' : 'Screen Recording'));
        pid = over.noRelaunch ? 10 : 11;
        return {
          getScreenshot: async () => new Uint8Array(over.emptyScreenshot ? [] : [1, 2, 3]),
          getAXState: async () => textEditState(over.documentChanged ? 'user text' : value),
          typeText: async text => {
            value += text;
            Object.assign(activeMeta, {'cua/inputRoute': "2'", 'cua/actionInterval': {startedAt: 1000, endedAt: 1001}, 'cua/hidIdleMs': phase === 'all' ? null : 100, 'cua/intervention': phase === 'all' ? null : 'off'});
          },
        };
      }};
      context.nodeRepl = {write: value => content.push({type: 'text', text: value})};
      try {
        await runInNewContext(`(async () => { ${code} })()`, context);
        return {result: {content, _meta: meta}};
      } catch (error) {
        return {result: {isError: true, content: [{type: 'text', text: over.wrongError ? 'unrelated failure' : error.message}], _meta: {'cua/nativeEngine': over.wrongEngine ? {...expected, build: 'other'} : expected, 'cua/permission': over.wrongPermission ? null : phase === 'revoked' ? 'accessibility' : 'screenRecording'}}};
      }
    },
    async close() { events.push('close'); calls = 0; return {code: over.closeFailed ? 1 : 0, signal: null}; },
  };
  const deps = {
    platform: 'darwin',
    prepare: async () => ({expected, bundlePath: path}),
    status: async () => {
      const value = status();
      if (over.otherConnection && phase === 'granted') value.status.connections = 2;
      if (over.finalGrantMissing && phase === 'all') value.status.inputMonitoring = false;
      if (over.initialMismatch && !owners) value.status.bundlePath = '/other/Engine.app';
      return value;
    },
    stop: async () => events.push('stop'),
    window: async () => (over.windowLost && phase === 'granted') || (over.activationChangedWindow && activated) ? null : {pid: 20, number: 30},
    focus: async () => { events.push('focus'); activated = true; return !over.focusFailed; },
    frontmost: () => over.focusLost ? 'com.apple.finder' : 'com.apple.TextEdit',
    connect: () => session,
    textEditStopped: async () => !(over.cleanupFailed && owners === 6),
    doctor: async () => ({engine: {permissions: {accessibility: true, screenRecording: true, inputMonitoring: false}}, checks: [{name: 'engine', status: 'warn', detail: 'Input Monitoring missing, so the engine runs with intervention detection off'}]}),
    approve: async () => { events.push('approve'); return {approved: !over.approveFailed, grants: {accessibility: true, screenRecording: true, inputMonitoring: true}, build: expected.build}; },
    operator: {next: async () => {
      events.push('owner'); owners++;
      if (over.abort) return null;
      if (owners === 1) return 'revoked';
      if (owners === 2) { phase = 'ax'; if (over.axRelaunch) pid = 15; return 'granted'; }
      if (owners === 3) {
        phase = 'granted';
        if (over.externalRelaunch) pid = 12;
        return 'granted';
      }
      if (owners === 4) return over.captureDeclined ? null : 'none';
      if (owners === 5) { phase = 'all'; return 'granted'; }
      return 'closed';
    }},
    log: message => logs.push(message),
  };
  return {deps, events, logs};
}

const run = async f => {
  const {runFreshOnboarding} = await import('../scripts/accept/onboarding.mjs');
  return runFreshOnboarding({home: '/scratch', engine: {engine: 'cua'}, requested: true}, f.deps);
};

test('owner sequence proves both model errors, same-session relaunch, then approval, with no automated revocation', async () => {
  const f = fixture(), report = await run(f);
  assert.equal(report.status, 'PASS', JSON.stringify(report));
  assert.deepEqual(f.events, ['stop', 'owner', 'initialize', 'cell', 'owner', 'cell', 'owner', 'cell', 'owner', 'focus', 'cell', 'owner', 'close', 'approve', 'initialize', 'cell', 'focus', 'cell', 'close', 'owner']);
  assert.deepEqual(report.observations.stage3CaptureConfirmation, {source: 'owner-observed', outcome: 'none'});
  assert.match(f.logs.join('\n'), /owner.*only|OWNER/);
  assert.match(f.logs.join('\n'), /Later/);
  assert.match(f.logs.join('\n'), /Input Monitoring/);
  assert.match(f.logs.join('\n'), /9 minutes/);
  assert.match(f.logs.join('\n'), /Don’t Save/);
  assert.equal(report.observations.relaunch.before, 10);
  assert.equal(report.observations.relaunch.after, 11);
});

for (const [name, option, status] of [
  ['missing operator confirmation', 'abort', 'BLOCKED'],
  ['unrelated model error', 'wrongError', 'FAIL'],
  ['wrong engine attestation', 'wrongEngine', 'FAIL'],
  ['wrong permission attribution', 'wrongPermission', 'FAIL'],
  ['model transport timeout', 'modelTimeout', 'BLOCKED'],
  ['owner does not confirm the capture prompt state', 'captureDeclined', 'BLOCKED'],
  ['engine changed at Accessibility-only stage', 'axRelaunch', 'FAIL'],
  ['connection fails to close before approve', 'closeFailed', 'FAIL'],
  ['empty recovered screenshot', 'emptyScreenshot', 'FAIL'],
  ['document changed before input', 'documentChanged', 'FAIL'],
  ['no service relaunch', 'noRelaunch', 'FAIL'],
  ['System Settings already relaunched the engine', 'externalRelaunch', 'BLOCKED'],
  ['another live connection', 'otherConnection', 'BLOCKED'],
  ['fixture window disappeared', 'windowLost', 'BLOCKED'],
  ['activation changed the fixture window', 'activationChangedWindow', 'BLOCKED'],
  ['TextEdit focus could not be verified', 'focusFailed', 'BLOCKED'],
  ['focus changed during the post-activation window check', 'focusLost', 'BLOCKED'],
]) test(`${name} cannot pass onboarding or run approve before recovery`, async () => {
  const f = fixture({[option]: true}), report = await run(f);
  assert.equal(report.status, status, JSON.stringify(report));
  assert.ok(!f.events.includes('approve'));
  if (f.events.includes('initialize')) assert.equal(f.events.at(-1), 'close');
});

for (const option of ['approveFailed', 'finalGrantMissing', 'cleanupFailed']) test(`${option} remains FAIL after earlier stages passed`, async () => {
  const f = fixture({[option]: true}), report = await run(f);
  assert.equal(report.status, 'FAIL', JSON.stringify(report));
  assert.ok(f.events.includes('approve'));
});

test('a different running engine is left alone before asking the owner to revoke anything', async () => {
  const f = fixture({initialMismatch: true}), report = await run(f);
  assert.equal(report.status, 'FAIL', JSON.stringify(report));
  assert.deepEqual(f.events, []);
});

test('guidance must identify the precise permission and approved path, not merely mention permissions', async () => {
  const {permissionGuidance} = await import('../scripts/accept/onboarding.mjs');
  const reply = (text, permission = 'accessibility') => ({result: {isError: true, content: [{type: 'text', text}], _meta: {'cua/permission': permission}}});
  const good = errorText('Accessibility');
  assert.equal(permissionGuidance(reply(good), {pane: 'Accessibility', bundlePath: path}), true);
  assert.equal(permissionGuidance(reply(good.replace(path, `"${path}"`)), {pane: 'Accessibility', bundlePath: path}), true);
  for (const bad of [good.replace(path, path + '/other.app'), good.replace('"+"', 'add it'), good.replace('-10014', '-10001')]) {
    assert.equal(permissionGuidance(reply(bad), {pane: 'Accessibility', bundlePath: path}), false);
  }
  assert.equal(permissionGuidance(reply(errorText('Screen Recording').replace('a relaunch is pending', 'retry'), 'screenRecording'), {pane: 'Screen Recording', bundlePath: path}), false);
});

test('five internal off-screen TextEdit windows do not block the one visible fixture, but two visible windows do', async () => {
  const {onboardingWindow} = await import('../scripts/accept/onboarding.mjs');
  const bounds = {x: 0, y: 0, width: 640, height: 480};
  const visible = {ownerPid: 20, number: 30, onScreen: true, bounds};
  const internal = Array.from({length: 5}, (_, index) => ({ownerPid: 20, number: 40 + index, onScreen: false, bounds: {...bounds, x: -1000}, title: 'must never be recorded'}));
  const result = onboardingWindow([visible, ...internal], 20);
  assert.equal(result.pid, 20);
  assert.equal(result.number, 30);
  assert.equal(result.offScreenBounds.length, 5);
  assert.deepEqual(result.offScreenBounds[0], {x: -1000, y: 0, width: 640, height: 480});
  assert.ok(!JSON.stringify(result).includes('title'));
  assert.equal(onboardingWindow([visible, {...visible, number: 31}, ...internal], 20), null);
  assert.equal(onboardingWindow(internal, 20), null);
});

test('onboarding is inert unless requested on the cua macOS lane', async () => {
  const {runFreshOnboarding} = await import('../scripts/accept/onboarding.mjs');
  for (const options of [{requested: false, engine: {engine: 'cua'}}, {requested: true, engine: {engine: 'vendor'}}]) {
    const f = fixture();
    const report = await runFreshOnboarding({home: '/scratch', ...options}, f.deps);
    assert.equal(report.status, 'BLOCKED');
    assert.deepEqual(f.events, []);
  }
});
