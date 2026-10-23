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
      accessibility: phase !== 'revoked', screenRecording: ['granted', 'all'].includes(phase), inputMonitoring: phase === 'all', canPostHid: true}});
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
            Object.assign(activeMeta, {'cua/inputRoute': "2'", 'cua/actionInterval': {startedAt: 1000, endedAt: 1001}, 'cua/hidIdleMs': phase === 'all' ? null : 100, 'cua/intervention': phase === 'all' || over.metadataMissing ? null : 'off'});
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
      return {engine: {permissions: {accessibility: true, screenRecording: phase !== 'ax', inputMonitoring: false}},
        checks: [{name: 'engine', status: phase === 'ax' ? 'fail' : 'warn', detail: (over.axDoctorMissing && phase === 'ax') || (over.doctorMissing && phase === 'granted') ? 'Screen Recording missing' : 'Input Monitoring missing, so the engine runs with intervention detection off'}]};
    },
    approve: async () => { events.push('approve'); return {approved: !over.approveFailed, grants: {accessibility: true, screenRecording: true, inputMonitoring: true}, build: expected.build}; },
    operator: {next: async () => {
      events.push('owner'); owners++;
      if (over.abort) return null;
      if (owners === 1) { if (over.expireWindow) clock += 16 * 60_000; return 'revoked'; }
      if (owners === 2) { phase = 'ax'; if (over.axRelaunch) pid = 15; return 'granted'; }
      if (owners === 3) {
        phase = 'granted';
        if (over.externalRelaunch) pid = 12;
        return 'granted';
      }
      if (owners === 4) return over.captureDeclined ? null : over.recoveryAlerts ?? 'none';
      if (owners === 5) return over.inputAlerts ?? 'none';
      if (owners === 6) { phase = 'all'; return 'granted'; }
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
  assert.deepEqual(f.events, ['stop', 'owner', 'initialize', 'cell', 'owner', 'cell', 'doctor:ax', 'owner', 'cell', 'owner', 'focus', 'cell', 'owner', 'doctor:granted', 'owner', 'close', 'approve', 'initialize', 'cell', 'focus', 'cell', 'close', 'owner']);
  assert.equal(report.observations.recoveryPrompts[0].source, 'owner-observed');
  assert.deepEqual(report.observations.recoveryPrompts[0].prompts, []);
  assert.match(f.logs.join('\n'), /owner.*only|OWNER/);
  assert.match(f.logs.join('\n'), /Later/);
  assert.match(f.logs.join('\n'), /Input Monitoring/);
  assert.match(f.logs.join('\n'), /15 minutes/);
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
]) test(`intervention-off retains and distinguishes ${option} before refusing approval`, async () => {
  const f = fixture({[option]: true}), report = await run(f);
  assert.equal(report.status, 'FAIL');
  assert.ok(!f.events.includes('approve'));
  assert.deepEqual(['input completion', 'metadata', 'doctor'].map(part =>
    report.checks.find(c => c.name === `intervention off: ${part}`)?.status), verdicts);
  const input = report.observations.cells.find(c => c.stage === 'intervention off');
  assert.equal(input.reply.typed, option === 'deliveredButIncomplete' ? null : true);
  assert.equal(input.reply.completion, option === 'deliveredButIncomplete' ? 'error' : 'returned');
  assert.equal(input.reply.metadata.intervention, option === 'metadataMissing' ? null : 'off');
  assert.equal(input.reply.metadata.inputRoute, "2'");
  assert.deepEqual(input.reply.metadata.actionInterval, {startedAt: 1000, endedAt: 1001});
  const doctor = report.observations.doctors.find(d => d.stage === 'intervention off');
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
  assert.equal(report.checks.find(c => c.name === 'intervention off: input completion').status, 'PASS');
  assert.equal(report.checks.find(c => c.name === 'intervention off: doctor').status, 'FAIL');
  assert.deepEqual(report.observations.doctors.at(-1), {stage: 'intervention off', received: false});
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
