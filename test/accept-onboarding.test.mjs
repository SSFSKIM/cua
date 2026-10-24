import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import {advanceNumbering, render} from '../src/services/engine/render.mjs';
import {ENGINE_GRANTS, grantSteps} from '../src/runtime/engine.mjs';

const textEditShot = JSON.parse(readFileSync(new URL('./native-goldens/textedit/skyshot.json', import.meta.url), 'utf8'));
function textEditState(value) {
  const shot = structuredClone(textEditShot);
  const node = shot.nodes.find(node => node.identifier === 'First Text View');
  Object.assign(node, {value, valueMarkdown: null, numberOfCharacters: value.length});
  return render(shot, advanceNumbering(null, shot));
}

const path = '/fixture/cua Engine.app';
const expected = {engine: 'cua', version: '1', build: 'build-a'};
// Native Permissions.swift deliberately mirrors grantSteps. Use the producer's actual pane words, including
// Screen & System Audio Recording, rather than inventing a shortened Screen Recording sentence.
const errorText = permission => `Computer Use server error -10014: ${grantSteps(ENGINE_GRANTS.find(grant => grant.key === permission), path)}`
  + (permission === 'screenRecording' ? '; a relaunch of the engine is pending before screenshots can use it. Retry after granting it.' : ', then retry.');

// External boundaries only: the runner's real cells execute against the fixture API, and real orchestration judges
// the resulting model replies, statuses, operator answers and cleanup. No GUI, TCC, engine or subprocess is started.
function fixture(over = {}) {
  const events = [], logs = [];
  let phase = 'revoked', pid = 10, calls = 0, owners = 0, value = '', activated = false, clock = 1_000;
  const context = {};
  let activeMeta;
  const status = () => ({bundlePath: path, exists: true, build: expected.build, engineVersion: expected.version,
    approved: true, approvedBuild: expected.build, signature: {kind: 'identity', identityMatches: true},
    status: {pid, bundlePath: path, build: expected.build, connections: calls ? 1 : 0,
      accessibility: phase !== 'revoked', screenRecording: ['granted', 'all'].includes(phase), inputMonitoring: phase === 'all' || (phase === 'granted' && over.listenAfterRelaunch === true), canPostHid: ['granted', 'all'].includes(phase)}});
  const session = {
    async initialize() { events.push('initialize'); },
    async js(code) {
      events.push('cell'); calls++;
      if (over.modelTimeout) return {timedOut: true};
      const content = [];
      const meta = activeMeta = {'cua/nativeEngine': expected};
      context.cua = {getApp: async () => {
        if (!['granted', 'all'].includes(phase)) throw new Error(errorText(phase === 'revoked' ? 'accessibility' : 'screenRecording'));
        pid = over.noRelaunch ? 10 : 11;
        return {
          getScreenshot: async () => new Uint8Array(over.emptyScreenshot ? [] : [1, 2, 3]),
          getAXState: async () => textEditState(over.documentChanged ? 'user text' : value),
          typeText: async text => {
            value += text;
            Object.assign(activeMeta, {'cua/inputRoute': "2'", 'cua/actionInterval': {startedAt: 1000, endedAt: 1001}, 'cua/hidIdleMs': phase === 'all' ? null : 100, 'cua/intervention': phase === 'all' || over.listenAfterRelaunch || over.metadataMissing ? null : 'off'});
            if (over.deliveredButIncomplete) throw new Error('sensitive input failure after posting');
          },
        };
      }};
      context.nodeRepl = {write: value => content.push({type: 'text', text: value})};
      try {
        await runInNewContext(`(async () => { ${code} })()`, context);
        return {result: {content, _meta: meta}};
      } catch (error) {
        return {result: {isError: true, content: [{type: 'text', text: over.wrongError ? 'unrelated failure' : error.message}], _meta: {...meta, 'cua/nativeEngine': over.wrongEngine ? {...expected, build: 'other'} : expected, 'cua/permission': over.wrongPermission ? null : phase === 'revoked' ? 'accessibility' : 'screenRecording'}}};
      }
    },
    async close() { events.push('close'); calls = 0; return {code: over.closeFailed ? 1 : 0, signal: null}; },
  };
  const deps = {
    platform: 'darwin',
    now: () => clock++,
    prepare: async () => ({expected, bundlePath: path}),
    checkoutBuild: () => over.staleBuild ? 'new-checkout-build' : expected.build,
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
    connect: () => ({...session}),
    textEditStopped: async () => !(over.cleanupFailed && owners === 7),
    doctor: async () => {
      events.push(`doctor:${phase}`);
      return {engine: {permissions: {accessibility: true, screenRecording: phase !== 'ax', inputMonitoring: phase === 'granted' && over.listenAfterRelaunch === true}},
        checks: [{name: 'engine', status: phase === 'ax' ? 'fail' : over.listenAfterRelaunch ? 'pass' : 'warn', detail: (over.axDoctorMissing && phase === 'ax') || (over.doctorMissing && phase === 'granted') ? 'Screen Recording missing' : phase === 'granted' && over.listenAfterRelaunch ? 'Input Monitoring granted' : 'Input Monitoring missing, so the engine runs with intervention detection off'}]};
    },
    approve: async () => { events.push('approve'); return {approved: !over.approveFailed, grants: {accessibility: true, screenRecording: true, inputMonitoring: true}, build: expected.build}; },
    operator: {next: async () => {
      events.push('owner'); owners++;
      if (over.abort) return null;
      if (owners === 1) { if (over.expireWindow) clock += 26 * 60_000; return 'revoked'; }
      if (owners === 2) { phase = 'ax'; if (over.axRelaunch) pid = 15; return 'granted'; }
      if (owners === 3) {
        phase = 'granted';
        if (over.externalRelaunch) pid = 12;
        return 'granted';
      }
      if (owners === 4) {
        if (over.relaunchDuringObservation) pid = 17;
        return over.captureDeclined ? null : over.recoveryAlerts ?? 'none';
      }
      if (owners === 5) {
        if (over.expireInputObservation) clock += 26 * 60_000;
        return over.inputObservationAbsent ? null : over.inputAlerts ?? 'none';
      }
      if (owners === 6) { phase = 'all'; return 'granted'; }
      return 'closed';
    }},
    log: message => logs.push(message),
  };
  return {deps, events, logs, advance: ms => { clock += ms; }};
}

const run = async (f, options = {}) => {
  const {runFreshOnboarding} = await import('../scripts/accept/onboarding.mjs');
  return runFreshOnboarding({home: '/scratch', engine: {engine: 'cua'}, requested: true, ...options}, f.deps);
};

test('owner sequence proves both model errors, same-session relaunch, then approval, with no automated revocation', async () => {
  const f = fixture(), report = await run(f);
  assert.equal(report.status, 'PASS', JSON.stringify(report));
  assert.deepEqual(f.events, ['stop', 'owner', 'initialize', 'cell', 'owner', 'cell', 'doctor:ax', 'owner', 'cell', 'owner', 'focus', 'cell', 'doctor:granted', 'owner', 'owner', 'close', 'approve', 'initialize', 'cell', 'focus', 'cell', 'close', 'owner']);
  assert.equal(report.observations.recoveryPrompts[0].source, 'owner-observed');
  assert.deepEqual(report.observations.recoveryPrompts[0].prompts, []);
  assert.match(f.logs.join('\n'), /owner.*only|OWNER/);
  assert.match(f.logs.join('\n'), /Later/);
  assert.match(f.logs.join('\n'), /Input Monitoring/);
  assert.match(f.logs.join('\n'), /25 minutes/);
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

test('AX-only doctor must say intervention detection off before asking the owner to grant Screen Recording', async () => {
  const f = fixture({axDoctorMissing: true}), report = await run(f);
  assert.equal(report.status, 'FAIL', JSON.stringify(report));
  assert.equal(f.events.filter(event => event === 'owner').length, 2, 'no Screen Recording grant prompt');
  assert.equal(f.events.at(-1), 'close');
  assert.ok(!f.events.includes('approve'));
});

test('a different running engine is left alone before asking the owner to revoke anything', async () => {
  const f = fixture({initialMismatch: true}), report = await run(f);
  assert.equal(report.status, 'FAIL', JSON.stringify(report));
  assert.deepEqual(f.events, []);
});

test('a stale but approved installed build is refused before stopping the engine or asking for owner revocation', async () => {
  const f = fixture({staleBuild: true}), report = await run(f);
  assert.equal(report.status, 'FAIL', JSON.stringify(report));
  assert.match(report.checks.find(c => c.name === 'preconditions').detail, /checkout/);
  assert.deepEqual(f.events, []);
});

test('guidance must identify the precise permission and approved path, not merely mention permissions', async () => {
  const {permissionGuidance} = await import('../scripts/accept/onboarding.mjs');
  const reply = (text, permission = 'accessibility') => ({result: {isError: true, content: [{type: 'text', text}], _meta: {'cua/permission': permission}}});
  const good = errorText('accessibility');
  assert.equal(permissionGuidance(reply(good), {permission: 'accessibility', bundlePath: path}), true);
  assert.equal(permissionGuidance(reply(good.replace(path, `"${path}"`)), {permission: 'accessibility', bundlePath: path}), true);
  for (const bad of [good.replace(path, path + '/other.app'), good.replace('"+"', 'add it'), good.replace('-10014', '-10001')]) {
    assert.equal(permissionGuidance(reply(bad), {permission: 'accessibility', bundlePath: path}), false);
  }
  const screen = errorText('screenRecording');
  assert.equal(permissionGuidance(reply(screen, 'screenRecording'), {permission: 'screenRecording', bundlePath: path}), true);
  assert.equal(permissionGuidance(reply(screen.replace('a relaunch of the engine is pending', 'retry'), 'screenRecording'), {permission: 'screenRecording', bundlePath: path}), false);
  assert.equal(permissionGuidance(reply(screen.replaceAll('Screen & System Audio Recording', 'Accessibility'), 'screenRecording'), {permission: 'screenRecording', bundlePath: path}), false);
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

for (const [option, verdicts] of [
  ['metadataMissing', ['PASS', 'FAIL', 'PASS']],
  ['doctorMissing', ['PASS', 'PASS', 'FAIL']],
  ['deliveredButIncomplete', ['FAIL', 'PASS', 'PASS']],
]) test(`negative-capability input retains and distinguishes ${option} before refusing approval`, async () => {
  const f = fixture({[option]: true}), report = await run(f);
  assert.equal(report.status, 'FAIL');
  assert.ok(!f.events.includes('approve'));
  assert.deepEqual(['input completion', 'metadata', 'doctor'].map(part =>
    report.checks.find(c => c.name === `post-recovery input: ${part}`)?.status), verdicts);
  const input = report.observations.cells.find(c => c.stage === 'post-recovery input');
  assert.equal(input.reply.typed, option === 'deliveredButIncomplete' ? null : true);
  assert.equal(input.reply.completion, option === 'deliveredButIncomplete' ? 'error' : 'returned');
  assert.equal(input.reply.metadata.intervention, option === 'metadataMissing' ? null : 'off');
  assert.equal(input.reply.metadata.inputRoute, "2'");
  assert.deepEqual(input.reply.metadata.actionInterval, {startedAt: 1000, endedAt: 1001});
  const doctor = report.observations.doctors.find(d => d.stage === 'post-recovery input');
  assert.deepEqual(doctor.permissions, {accessibility: true, screenRecording: true, inputMonitoring: false});
  assert.equal(doctor.engineRow.interventionOff, option !== 'doctorMissing');
  assert.equal(doctor.engineRow.status, 'warn');
  const status = report.observations.statuses.find(s => s.stage === 'post-relaunch');
  assert.deepEqual(status, {stage: 'post-relaunch', pid: 11, connections: 1, accessibility: true,
    screenRecording: true, inputMonitoring: false, canPostHid: true});
  assert.ok(!JSON.stringify(report).includes('sensitive input failure'));
});

test('timed recovery observations retain multiple alert kinds and answers without claiming prompt origin or UI actor', async () => {
  const f = fixture({recoveryAlerts: 'accessibility:deny capture:allow', inputAlerts: 'other:answered'});
  const report = await run(f);
  assert.equal(report.status, 'PASS', JSON.stringify(report));
  assert.deepEqual(report.observations.recoveryPrompts.map(o => o.prompts), [
    [{kind: 'accessibility', response: 'deny'}, {kind: 'capture', response: 'allow'}],
    [{kind: 'other', response: 'answered'}],
  ]);
  for (const observation of report.observations.recoveryPrompts) {
    assert.equal(observation.source, 'owner-observed');
    assert.equal(observation.origin, 'unknown');
    assert.ok(observation.startedAt < observation.finishedAt);
    assert.ok(observation.finishedAt <= observation.reportedAt);
  }
  const manual = report.checks.find(c => c.name === 'manual revocation');
  assert.match(manual.detail, /terminal confirmed/);
  assert.doesNotMatch(manual.detail, /owner confirmed|not performed by automation/);
  assert.match(f.logs.join('\n'), /separately authorized coordinator/);
  assert.match(f.logs.join('\n'), /OWNER ONLY.*system alert/);
});

test('a failed capture still retains post-relaunch status and owner alert observations', async () => {
  const f = fixture({emptyScreenshot: true, recoveryAlerts: 'accessibility:deny'}), report = await run(f);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.observations.cells.find(c => c.stage === 'service relaunch recovery').reply.screenshotBytes, 0);
  assert.equal(report.observations.statuses.find(s => s.stage === 'post-relaunch').pid, 11);
  assert.deepEqual(report.observations.recoveryPrompts[0].prompts, [{kind: 'accessibility', response: 'deny'}]);
  assert.ok(!f.events.includes('approve'));
});

test('timeout and rejected attestation retain only safe response facts before their assertions', async () => {
  for (const option of ['modelTimeout', 'wrongEngine']) {
    const f = fixture({[option]: true}), report = await run(f);
    assert.equal(report.observations.cells.length, 1);
    assert.equal(report.observations.cells[0].reply.completion, option === 'modelTimeout' ? 'timeout' : 'error');
    assert.equal(report.observations.cells[0].attestation, option === 'modelTimeout' ? null : 'refused');
    assert.ok(!f.events.includes('approve'));
  }
});

test('doctor and reply diagnostics allowlist facts rather than copying content or signing identity', async () => {
  const f = fixture();
  const doctor = f.deps.doctor;
  f.deps.doctor = async () => {
    const d = await doctor();
    d.engine.signature = {identity: 'PRIVATE_SIGNER'};
    d.engine.secret = 'PRIVATE_SECRET';
    d.checks[0].detail += ' PRIVATE_ROW_TEXT';
    return d;
  };
  const session = f.deps.connect(), js = session.js.bind(session);
  session.js = async (...args) => {
    const reply = await js(...args);
    if (reply.result) {
      reply.result.content.push({type: 'image', data: 'PRIVATE_SCREENSHOT'}, {type: 'text', text: 'PRIVATE_TEXT'});
      reply.result._meta['unknown'] = 'PRIVATE_META';
    }
    return reply;
  };
  f.deps.connect = () => ({...session});
  const report = await run(f);
  assert.equal(report.status, 'PASS', JSON.stringify(report));
  assert.ok(report.observations.doctors.length >= 2);
  assert.equal(report.observations.cells.length, 6);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_'));
  assert.ok(!f.logs.join('\n').includes('PRIVATE_'));
});

test('the combined owner budget expires rather than offering another fifteen minutes per question', async () => {
  const f = fixture({expireWindow: true}), report = await run(f);
  assert.equal(report.status, 'BLOCKED');
  assert.equal(f.events.filter(e => e === 'owner').length, 1);
  assert.ok(!f.events.includes('approve'));
});

test('doctor execution failure preserves input operands and produces its own failed verdict without raw errors', async () => {
  const f = fixture(), doctor = f.deps.doctor;
  let calls = 0;
  f.deps.doctor = async () => {
    if (++calls === 2) throw new Error('PRIVATE_DOCTOR_ERROR');
    return doctor();
  };
  const report = await run(f);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.checks.find(c => c.name === 'post-recovery input: input completion').status, 'PASS');
  assert.equal(report.checks.find(c => c.name === 'post-recovery input: doctor').status, 'FAIL');
  assert.deepEqual(report.observations.doctors.at(-1), {stage: 'post-recovery input', received: false});
  assert.ok(!JSON.stringify(report).includes('PRIVATE_'));
  assert.ok(!f.events.includes('approve'));
});

test('unknown metadata values are classified, not retained as arbitrary strings or objects', async () => {
  const f = fixture(), connect = f.deps.connect;
  f.deps.connect = () => {
    const session = connect(), js = session.js.bind(session);
    session.js = async (...args) => {
      const reply = await js(...args);
      if (reply.result?._meta?.['cua/inputRoute']) Object.assign(reply.result._meta, {
        'cua/inputRoute': 'PRIVATE_ROUTE', 'cua/intervention': {secret: 'PRIVATE_META'},
        'cua/actionInterval': {startedAt: 'PRIVATE_TIME', endedAt: 'PRIVATE_TIME'},
      });
      return reply;
    };
    return session;
  };
  const report = await run(f);
  assert.equal(report.status, 'FAIL');
  const meta = report.observations.cells.at(-1).reply.metadata;
  assert.equal(meta.inputRoute, 'unrecognized');
  assert.equal(meta.intervention, 'unrecognized');
  assert.deepEqual(meta.actionInterval, {startedAt: null, endedAt: null});
  assert.ok(!JSON.stringify(report).includes('PRIVATE_'));
});

test('a recovery timeout retains post-relaunch capabilities and the owner observation without trying input', async () => {
  const f = fixture({recoveryAlerts: 'accessibility:deny'}), connect = f.deps.connect;
  f.deps.connect = () => {
    const session = connect(), js = session.js.bind(session);
    session.js = async (...args) => {
      const reply = await js(...args);
      return args[0].includes('getScreenshot') ? {timedOut: true} : reply;
    };
    return session;
  };
  const report = await run(f);
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.observations.statuses.find(s => s.stage === 'post-relaunch')?.pid, 11);
  assert.deepEqual(report.observations.recoveryPrompts[0].prompts, [{kind: 'accessibility', response: 'deny'}]);
  assert.ok(!f.events.includes('focus'));
  assert.ok(!f.events.includes('approve'));
});

test('a PID change while the owner answers cannot substitute for the service recovery relaunch', async () => {
  const f = fixture({noRelaunch: true, relaunchDuringObservation: true}), report = await run(f);
  assert.equal(report.status, 'FAIL');
  assert.deepEqual(report.observations.relaunch, {before: 10, after: 10});
  assert.equal(report.observations.statuses.find(s => s.stage === 'post-relaunch').pid, 10);
  assert.equal(report.checks.find(c => c.name === 'service relaunch recovery').status, 'FAIL');
  assert.equal(report.checks.find(c => c.name === 'owner recovery prompt observation').status, 'PASS');
  assert.ok(!f.events.includes('focus'));
  assert.ok(!f.events.includes('approve'));
});

for (const [name, options] of [
  ['absent', {inputObservationAbsent: true}],
  ['invalid', {inputAlerts: 'not a valid observation'}],
  ['expired', {expireInputObservation: true}],
]) test(`an ${name} owner observation cannot discard delivered-but-incomplete input and doctor verdicts`, async () => {
  const f = fixture({deliveredButIncomplete: true, ...options}), report = await run(f);
  assert.equal(report.status, 'FAIL');
  assert.deepEqual(['input completion', 'metadata', 'doctor'].map(part =>
    report.checks.find(c => c.name === `post-recovery input: ${part}`)?.status), ['FAIL', 'PASS', 'PASS']);
  assert.equal(report.checks.find(c => c.name === 'owner input prompt observation').status, 'BLOCKED');
  assert.equal(report.observations.cells.at(-1).reply.completion, 'error');
  assert.equal(report.observations.doctors.at(-1).stage, 'post-recovery input');
  assert.equal(report.observations.doctors.at(-1).received, true);
  assert.deepEqual(f.events.slice(-3), ['doctor:granted', 'owner', 'close']);
  assert.equal(f.events.filter(e => e === 'owner').length, 5, 'no Input Monitoring grant question');
  assert.equal(f.events.filter(e => e === 'cell').length, 4, 'no further input');
  assert.ok(!f.events.includes('approve'));
});

test('successful input operands still pass independently when the owner observation is absent', async () => {
  const f = fixture({inputObservationAbsent: true}), report = await run(f);
  assert.equal(report.status, 'BLOCKED');
  for (const part of ['input completion', 'metadata', 'doctor']) {
    assert.equal(report.checks.find(c => c.name === `post-recovery input: ${part}`)?.status, 'PASS');
  }
  assert.equal(report.checks.find(c => c.name === 'owner input prompt observation').status, 'BLOCKED');
  assert.ok(!f.events.includes('approve'));
});

test('an input timeout plus missing owner observation never starts doctor or another grant stage', async () => {
  const f = fixture({inputObservationAbsent: true}), connect = f.deps.connect;
  f.deps.connect = () => {
    const session = connect(), js = session.js.bind(session);
    session.js = async (...args) => {
      const reply = await js(...args);
      return args[0].includes("app.typeText('X')") ? {timedOut: true} : reply;
    };
    return session;
  };
  const report = await run(f);
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.observations.cells.at(-1).reply.completion, 'timeout');
  assert.ok(!f.events.includes('doctor:granted'));
  for (const part of ['input completion', 'metadata', 'doctor']) {
    const check = report.checks.find(c => c.name === `post-recovery input: ${part}`);
    assert.equal(check?.status, 'BLOCKED');
    assert.doesNotMatch(check.detail, /not reached/, 'the timeout was judged, not discarded by prompt failure');
  }
  assert.equal(report.checks.find(c => c.name === 'owner input prompt observation').status, 'BLOCKED');
  assert.equal(f.events.filter(e => e === 'owner').length, 5);
  assert.ok(!f.events.includes('approve'));
});

for (const listen of [true, false]) test(`post-recovery input follows measured listen=${listen}, not the absent Settings row`, async () => {
  const f = fixture({listenAfterRelaunch: listen}), report = await run(f);
  assert.equal(report.status, 'PASS', JSON.stringify(report));
  assert.equal(report.checks.find(c => c.name === 'AX-only intervention diagnostic').status, 'PASS');
  assert.deepEqual(report.observations.statuses.find(s => s.stage === 'AX-only'), {
    stage: 'AX-only', pid: 10, connections: 1, accessibility: true, screenRecording: false, inputMonitoring: false, canPostHid: false,
  });
  for (const part of ['input completion', 'metadata', 'doctor']) {
    assert.equal(report.checks.find(c => c.name === `post-recovery input: ${part}`).status, 'PASS');
  }
  assert.equal(report.observations.statuses.find(s => s.stage === 'post-recovery input before').inputMonitoring, listen);
  assert.equal(report.observations.doctors.find(d => d.stage === 'post-recovery input').permissions.inputMonitoring, listen);
  assert.equal(report.observations.cells.find(c => c.stage === 'post-recovery input').reply.metadata.intervention, listen ? null : 'off');
  assert.ok(f.events.includes('approve'), 'final explicit grants and approval still run');
  assert.equal(report.checks.find(c => c.name === 'intervention on').status, 'PASS');
  assert.match(f.logs.join('\n'), /physical intervention.*not.*proven|does not prove physical intervention/i);
});

for (const [name, mutate] of [
  ['listen unavailable', s => { s.inputMonitoring = undefined; }],
  ['listen contradicts the warm off state', s => { s.inputMonitoring = true; }],
  ['post capability contradicts the warm off state', s => { s.canPostHid = true; }],
  ['engine changes while doctor runs', s => { s.pid = 19; }],
]) test(`warm AX-only ${name} cannot be promoted to live off evidence`, async () => {
  const f = fixture(), status = f.deps.status;
  let axReads = 0;
  f.deps.status = async () => {
    const result = await status();
    if (result.status.accessibility && !result.status.screenRecording && ++axReads === 2) mutate(result.status);
    return result;
  };
  const report = await run(f);
  assert.equal(report.status, 'FAIL', JSON.stringify(report));
  assert.ok(!f.events.includes('doctor:granted'));
  assert.equal(f.events.filter(e => e === 'owner').length, 2);
  assert.ok(!f.events.includes('approve'));
});

for (const [name, mutate] of [
  ['off metadata despite listen access', meta => { meta['cua/intervention'] = 'off'; }],
  ['missing intervention key', meta => { delete meta['cua/intervention']; }],
  ['missing route', meta => { meta['cua/inputRoute'] = null; }],
  ['missing action interval', meta => { meta['cua/actionInterval'] = null; }],
]) test(`listen-available input rejects ${name} independently of completion`, async () => {
  const f = fixture({listenAfterRelaunch: true}), connect = f.deps.connect;
  f.deps.connect = () => {
    const session = connect(), js = session.js.bind(session);
    session.js = async (...args) => {
      const reply = await js(...args);
      if (args[0].includes("app.typeText('X')")) mutate(reply.result._meta);
      return reply;
    };
    return session;
  };
  const report = await run(f);
  assert.deepEqual(['input completion', 'metadata', 'doctor'].map(part =>
    report.checks.find(c => c.name === `post-recovery input: ${part}`)?.status), ['PASS', 'FAIL', 'PASS']);
  assert.ok(!f.events.includes('approve'));
});

test('listen-available input keeps doctor disagreement separate from successful completion and metadata', async () => {
  const f = fixture({listenAfterRelaunch: true}), doctor = f.deps.doctor;
  f.deps.doctor = async () => {
    const result = await doctor();
    if (result.engine.permissions.screenRecording) result.engine.permissions.inputMonitoring = false;
    return result;
  };
  const report = await run(f);
  assert.deepEqual(['input completion', 'metadata', 'doctor'].map(part =>
    report.checks.find(c => c.name === `post-recovery input: ${part}`)?.status), ['PASS', 'PASS', 'FAIL']);
  assert.ok(!f.events.includes('approve'));
});

test('a changed PID during recovery prompt observation blocks input using the old capability sample', async () => {
  const f = fixture({listenAfterRelaunch: true, relaunchDuringObservation: true}), report = await run(f);
  assert.equal(report.status, 'BLOCKED', JSON.stringify(report));
  assert.equal(report.checks.find(c => c.name === 'service relaunch recovery').status, 'PASS');
  assert.ok(!f.events.includes('focus'));
  assert.ok(!f.events.includes('approve'));
});

test('unknown fresh-process listen capability never defaults to active or off metadata', async () => {
  const f = fixture({listenAfterRelaunch: true}), status = f.deps.status;
  f.deps.status = async () => {
    const result = await status();
    if (result.status.screenRecording) delete result.status.inputMonitoring;
    return result;
  };
  const report = await run(f);
  assert.equal(report.status, 'BLOCKED', JSON.stringify(report));
  assert.ok(!f.events.includes('focus'));
  assert.ok(!f.events.includes('approve'));
});

for (const change of ['pid', 'inputMonitoring']) test(`post-input ${change} change invalidates capability provenance without erasing operands`, async () => {
  const f = fixture({listenAfterRelaunch: true}), status = f.deps.status;
  let readyReads = 0;
  f.deps.status = async () => {
    const result = await status();
    if (result.status.screenRecording && ++readyReads === 4) result.status[change] = change === 'pid' ? 99 : false;
    return result;
  };
  const report = await run(f);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.checks.find(c => c.name === 'post-recovery input: capability stability').status, 'FAIL');
  for (const part of ['input completion', 'metadata', 'doctor']) {
    assert.equal(report.checks.find(c => c.name === `post-recovery input: ${part}`).status, 'PASS');
  }
  assert.ok(!f.events.includes('approve'));
});

test('listen-available doctor must retain a real engine row rather than infer agreement from silence', async () => {
  const f = fixture({listenAfterRelaunch: true}), doctor = f.deps.doctor;
  f.deps.doctor = async () => {
    const result = await doctor();
    if (result.engine.permissions.screenRecording) result.checks = [];
    return result;
  };
  const report = await run(f);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.checks.find(c => c.name === 'post-recovery input: doctor').status, 'FAIL');
  assert.equal(report.observations.doctors.at(-1).engineRow.present, false);
  assert.ok(!f.events.includes('approve'));
});

for (const budget of [undefined, 40]) test(`owner budget ${budget ?? 'default'} permits a staged sitting longer than fifteen minutes without resetting the overall deadline`, async () => {
  const f = fixture(), next = f.deps.operator.next;
  f.deps.operator.next = async () => { f.advance(3 * 60_000); return next(); };
  const report = await run(f, budget === undefined ? {} : {ownerWindowMinutes: budget});
  assert.equal(report.status, 'PASS', JSON.stringify(report));
  assert.equal(report.observations.ownerBudget.minutes, budget ?? 25);
  assert.equal(report.observations.ownerBudget.deadlineAt - report.observations.ownerBudget.startedAt, (budget ?? 25) * 60_000);
  assert.ok(f.events.includes('approve'));
  assert.match(f.logs.join('\n'), /ONE blank TextEdit document \(File > New\)/);
});

test('invalid direct owner budgets refuse before engine or permission work', async () => {
  for (const ownerWindowMinutes of [0, -1, 121, 1.5, NaN, Infinity, 'junk']) {
    const f = fixture();
    await assert.rejects(run(f, {ownerWindowMinutes}), /owner-window-minutes/);
    assert.deepEqual(f.events, []);
  }
});

for (const [minutes, expiredBound, waitMs] of [[25, 'observation', 5 * 60_000], [1, 'overall', 60_000]]) {
  test(`${expiredBound} timeout bounds an unanswered owner alert observation`, async t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const f = fixture(), next = f.deps.operator.next;
    let reached, release, calls = 0;
    const waiting = new Promise(resolve => { reached = resolve; });
    f.deps.operator.next = () => {
      if (++calls < 4) return next();
      reached();
      return new Promise(resolve => { release = resolve; });
    };
    const running = run(f, {ownerWindowMinutes: minutes});
    await waiting;
    f.advance(waitMs);
    t.mock.timers.tick(waitMs);
    release(null); // also settles an implementation missing the timer, so RED cannot hang
    const report = await running;
    assert.equal(report.status, 'BLOCKED');
    assert.equal(report.observations.ownerWaits.at(-1).expiredBound, expiredBound);
    assert.ok(report.observations.ownerWaits.at(-1).waitMs <= waitMs);
    assert.equal(report.observations.ownerWaits.at(-1).stage, 'owner recovery prompt observation');
    assert.ok(!f.events.includes('focus'));
  });
}

test('the overall deadline clips later waits even after individually timely answers', async () => {
  const f = fixture(), next = f.deps.operator.next;
  f.deps.operator.next = async () => { f.advance(4 * 60_000); return next(); };
  const report = await run(f, {ownerWindowMinutes: 10});
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.observations.ownerWaits.at(-1).expiredBound, 'overall');
  assert.ok(report.observations.ownerWaits.at(-1).waitMs < 2 * 60_000);
  assert.ok(!f.events.includes('approve'));
});

for (const boundary of ['focus', 'close', 'approve']) test(`automatic work consuming the budget at ${boundary} cannot start a later input or approval stage`, async () => {
  const f = fixture();
  if (boundary === 'focus') {
    const focus = f.deps.focus;
    f.deps.focus = async () => { const result = await focus(); f.advance(26 * 60_000); return result; };
  } else if (boundary === 'close') {
    const connect = f.deps.connect;
    f.deps.connect = () => {
      const session = connect(), close = session.close.bind(session);
      session.close = async () => { const result = await close(); f.advance(26 * 60_000); return result; };
      return session;
    };
  } else {
    const approve = f.deps.approve;
    f.deps.approve = async args => { const result = await approve(args); f.advance(26 * 60_000); return result; };
  }
  const report = await run(f);
  assert.equal(report.status, 'BLOCKED', JSON.stringify(report));
  if (boundary === 'focus') assert.equal(f.events.filter(e => e === 'cell').length, 3);
  if (boundary === 'close') assert.ok(!f.events.includes('approve'));
  if (boundary === 'approve') assert.equal(f.events.filter(e => e === 'initialize').length, 1);
  assert.ok(report.checks.some(c => c.status === 'BLOCKED' && /overall.*expired/.test(c.detail)));
});

test('approve respects the remaining overall budget and cannot turn its expired wait into approval', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const f = fixture();
  let reached, release;
  const waiting = new Promise(resolve => { reached = resolve; });
  f.deps.approve = async ({operator}) => {
    f.events.push('approve');
    f.deps.operator.next = () => { reached(); return new Promise(resolve => { release = resolve; }); };
    assert.equal(await operator.next(), 'n', 'approval is explicitly aborted, never implicitly confirmed');
    return {approved: false};
  };
  const running = run(f);
  await waiting;
  f.advance(25 * 60_000);
  t.mock.timers.tick(25 * 60_000);
  release(null);
  const report = await running;
  assert.equal(report.status, 'BLOCKED');
  assert.equal(report.observations.ownerWaits.at(-1).expiredBound, 'overall');
  assert.equal(f.events.filter(e => e === 'initialize').length, 1);
});

test('expired input observation preserves independent verdicts without inventing an owner report timestamp', async () => {
  const f = fixture(), next = f.deps.operator.next;
  let calls = 0;
  f.deps.operator.next = async () => { if (++calls === 5) f.advance(6 * 60_000); return next(); };
  const report = await run(f);
  assert.equal(report.status, 'BLOCKED');
  for (const part of ['input completion', 'metadata', 'doctor']) {
    assert.equal(report.checks.find(c => c.name === `post-recovery input: ${part}`).status, 'PASS');
  }
  const observation = report.observations.recoveryPrompts.at(-1);
  assert.equal(observation.confirmed, false);
  assert.equal(observation.reportedAt, null);
  assert.ok(Number.isFinite(observation.observationEndedAt));
  assert.equal(report.observations.ownerWaits.at(-1).expiredBound, 'observation');
  assert.ok(!f.events.includes('approve'));
});

test('approval cancels an unused terminal wait when grant polling finishes first', async () => {
  const f = fixture();
  let unused;
  f.deps.approve = async ({operator}) => {
    const next = f.deps.operator.next;
    f.deps.operator.next = () => new Promise(() => {});
    unused = operator.next();
    f.deps.operator.next = next;
    return {approved: true, build: expected.build};
  };
  const report = await run(f);
  assert.equal(report.status, 'PASS', JSON.stringify(report));
  assert.equal(await unused, null);
  const cancelled = report.observations.ownerWaits.find(w => w.cancelled);
  assert.equal(cancelled.stage, 'engine approval');
  assert.equal(cancelled.expiredBound, null);
});

test('manual revocation and fixture preparation may take over five minutes within the overall budget', async () => {
  const f = fixture(), next = f.deps.operator.next;
  let calls = 0;
  f.deps.operator.next = async () => { if (++calls === 1) f.advance(6 * 60_000); return next(); };
  const report = await run(f);
  assert.equal(report.status, 'PASS', JSON.stringify(report));
  assert.equal(report.observations.ownerWaits[0].expiredBound, null);
  assert.ok(report.observations.ownerWaits[0].waitMs > 5 * 60_000);
});

test('manual approval confirmation uses remaining overall time, not the alert-observation cap', async () => {
  const f = fixture();
  f.deps.approve = async ({operator}) => {
    const next = f.deps.operator.next;
    f.deps.operator.next = async () => { f.advance(6 * 60_000); return ''; };
    assert.equal(await operator.next(), '');
    f.deps.operator.next = next;
    return {approved: true, build: expected.build};
  };
  const report = await run(f);
  assert.equal(report.status, 'PASS', JSON.stringify(report));
  const wait = report.observations.ownerWaits.find(w => w.stage === 'engine approval');
  assert.equal(wait.expiredBound, null);
  assert.ok(wait.waitMs > 5 * 60_000);
});
