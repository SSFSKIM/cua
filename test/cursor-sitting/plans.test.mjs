// The sitting's scripted items (scripts/cursor-sitting/plans.mjs, timing.mjs, remote.mjs) and the runner that executes
// them (runner.mjs), checked without a Mac: every acceptance item has its steps, every cell is valid JavaScript, every
// step's session is open when it runs, and whatever an item changes outside its sessions is put back even when it fails.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readDevices} from '../../src/remote/devices.mjs';
import {clientSecretKey} from '../../src/remote/device.mjs';
import {fileStore, storeDir} from '../../src/secrets/store.mjs';
import {longTyping, MOVES, PLANS} from '../../scripts/cursor-sitting/plans.mjs';
import {enrollKit, kitPaths, prepareKit, relayDevicesFile, remoteSteps} from '../../scripts/cursor-sitting/remote.mjs';
import {cursorOffSettings, engineActivations, runSteps} from '../../scripts/cursor-sitting/runner.mjs';
import {SAMPLE_GAP_MS, SERIES, timingRows, timingSteps} from '../../scripts/cursor-sitting/timing.mjs';

const AsyncFunction = (async () => {}).constructor;
const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'cua-235-plans-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };

// Every item's steps, as the CLI builds them.
const ITEMS = t => ({
  ...Object.fromEntries(Object.keys(PLANS).filter(k => k !== '11').map(k => [k, PLANS[k]({})])),
  '2 (another session)': PLANS[2]({otherSession: '00000000-0000-0000-0000-000000000000'}),
  '11 vendor': PLANS[11]({engine: 'vendor'}), '11 cua': PLANS[11]({engine: 'cua'}),
  8: remoteSteps(scratch(t)), 12: timingSteps('typing', 3), 13: timingSteps('clicks', 3),
});
const flat = steps => steps.flatMap(s => (s.together ? s.together : [s]));

test('every acceptance item, 1 to 13, has its steps', t => {
  const items = ITEMS(t);
  for (let n = 1; n <= 13; n++) assert.ok(Object.keys(items).some(k => k.split(' ')[0] === String(n)), `item ${n}`);
});

test('every cell is valid JavaScript for the REPL, whatever results it is built from', t => {
  for (const [item, steps] of Object.entries(ITEMS(t))) {
    for (const step of flat(steps).filter(s => s.run)) {
      const code = typeof step.cell === 'function' ? step.cell({}) : step.cell;
      assert.equal(typeof code, 'string', `${item}: ${step.label}`);
      assert.doesNotThrow(() => new AsyncFunction('nodeRepl', 'cua', code), `${item}: ${step.label}`);
    }
  }
});

test('each step runs on a session opened before it and not yet closed, keys only on a scene that session bound, and every session is closed', t => {
  for (const [item, steps] of Object.entries(ITEMS(t))) {
    const open = new Map();
    const watches = new Set();
    for (const step of steps) {
      if (step.open) { assert.ok(!open.has(step.open), `${item}: ${step.open} opened twice`); open.set(step.open, step.scenes); }
      for (const s of flat([step]).filter(x => x.run)) {
        assert.ok(open.has(s.run), `${item}: ${s.label} on ${s.run}, which is not open`);
        if (s.keys) assert.ok(open.get(s.run).includes(s.keys), `${item}: ${s.label}'s key guard names ${s.keys}, which ${s.run} did not bind`);
      }
      if (step.endTask) assert.ok(open.has(step.endTask), `${item}: end_task on ${step.endTask}`);
      if (step.close) { assert.ok(open.has(step.close), `${item}: closing ${step.close}`); open.delete(step.close); }
      if (step.watch) { assert.ok(step.id && !watches.has(step.id), `${item}: watch ids are given and unique (${step.id})`); watches.add(step.id); }
      if (step.cue) assert.ok(step.ms > 0, `${item}: a cue says how long the owner has`);
    }
    assert.deepEqual([...open.keys()], [], `${item}: sessions left open`);
  }
});

test('the side-by-side runs the same moves through either engine', () => {
  const cells = engine => flat(PLANS[11]({engine})).filter(s => s.run).map(s => s.cell);
  assert.deepEqual(cells('vendor'), cells('cua'));
  assert.equal(PLANS[11]({engine: 'vendor'}).find(s => s.open).engine, 'vendor');
  assert.ok(MOVES.length >= 6);
});

test('the timing samples: n a side, interleaved with the leading side alternating, 6 s apart, cursor off by CUA_CURSOR=0', () => {
  for (const kind of ['typing', 'clicks']) {
    const steps = timingSteps(kind, 4);
    const sampled = steps.filter(s => s.sample);
    const perSample = kind === 'typing' ? 1 : 3;
    assert.equal(sampled.filter(s => s.sample.side === 'on').length, 4 * perSample);
    assert.equal(sampled.filter(s => s.sample.side === 'off').length, 4 * perSample);
    const leads = [0, 1, 2, 3].map(i => sampled.find(s => s.sample.i === i).sample.side);
    assert.deepEqual(leads, ['on', 'off', 'on', 'off']);
    assert.deepEqual(steps.find(s => s.open === 'off').env, {CUA_CURSOR: '0'});
    assert.equal(steps.find(s => s.open === 'on').env, undefined);
    // every sample is followed by the gap
    steps.forEach((s, k) => { if (s.sample && (kind === 'typing' || s.sample.series === 'drag')) assert.equal(steps[k + 1].wait, SAMPLE_GAP_MS); });
    if (kind === 'typing') assert.ok(sampled.every(s => s.keys === 'textedit'), 'typing goes only while TextEdit is frontmost');
  }
  assert.throws(() => timingSteps('scrolls', 2), /typing or clicks/);
});

test('timing rows: a typing cell gives both series, a click cell its own with its route, a failed cell an error row', () => {
  const rows = [
    {kind: 'cell', ok: true, sample: {side: 'on', i: 0}, value: {type_text: 210.5, press_key: 95.2}},
    {kind: 'cell', ok: false, sample: {side: 'off', i: 0}, error: 'not sent'},
    {kind: 'watch', id: 'x'},
  ];
  assert.deepEqual(timingRows(rows, 'typing'), [
    {series: 'type_text', side: 'on', i: 0, ms: 210.5}, {series: 'press_key x30', side: 'on', i: 0, ms: 95.2},
    {series: 'type_text', side: 'off', i: 0, ms: null, error: 'not sent'}, {series: 'press_key x30', side: 'off', i: 0, ms: null, error: 'not sent'}]);
  assert.deepEqual(timingRows([{kind: 'cell', ok: true, route: '3', sample: {side: 'on', i: 2, series: 'element click'}, value: {ms: 41}}], 'clicks'),
    [{series: 'element click', side: 'on', i: 2, ms: 41, route: '3'}]);
  assert.deepEqual(SERIES.clicks, ['coordinate click', 'element click', 'drag']);
});

test('the long type_text is sized to about 7 s from the measured rate, within bounds', () => {
  assert.equal(longTyping({ok: true, value: {ms: 300, chars: 300}}), 7000);
  assert.equal(longTyping({ok: true, value: {ms: 30, chars: 300}}), 20_000);
  assert.equal(longTyping({ok: true, value: {ms: 6000, chars: 300}}), 1000);
  assert.equal(longTyping(undefined), 7000);
});

test('engine.json\'s off switch keeps the other keys, and refuses a file that is not an object', () => {
  assert.deepEqual(JSON.parse(cursorOffSettings('{"engine": "cua", "routes": {"x": 4}}')), {engine: 'cua', routes: {x: 4}, cursor: false});
  assert.deepEqual(JSON.parse(cursorOffSettings(null)), {cursor: false});
  assert.throws(() => cursorOffSettings('[1]'), /not a JSON object/);
});

test('the activation watcher\'s lines: only the engine\'s own activations count against it', () => {
  const lines = [{pid: 9, watch: 'activations'}, {kind: 'activated', pid: 10, bundleId: 'io.github.ssfskim.cua.fixture.electron'},
    {kind: 'activated', pid: 11, bundleId: 'io.github.ssfskim.cua.engine'}, {kind: 'deactivated', pid: 11, bundleId: 'io.github.ssfskim.cua.engine'}];
  assert.deepEqual(engineActivations(lines).map(l => l.pid), [11]);
});

// A fake Mac: sessions that answer every cell, and a record of what was asked of it.
function fakeIo(log, {failTask = null} = {}) {
  return {
    scene: id => ({id, app: `/Apps/${id}.app`, pid: 100}),
    open: async ({name, env, scenes}) => { log.push(`open ${name} ${scenes.map(s => s.id).join(',')} ${JSON.stringify(env)}`);
      return {run: async (code, {keys}) => { log.push(`run ${name}${keys ? ` keys ${keys}` : ''}`); return {ok: true, value: {ms: 1}, route: '1', engine: 'cua', images: []}; },
        endTask: async () => { log.push(`end_task ${name}`); return {result: {}}; }, close: async () => { log.push(`close ${name}`); return {code: 0}; }}; },
    wait: async () => {}, cue: async text => log.push(`cue ${text}`), waitGo: async () => log.push('go'), goFile: '/dev/null',
    tasks: new Proxy({}, {get: (_, name) => async args => { log.push(`task ${name}`); if (name === failTask) throw new Error(`${name} failed`); return {ok: true}; }}),
    cleanup: async ctx => log.push(`cleanup settingsChanged=${ctx.settingsChanged}`),
  };
}

test('the runner records every step and closes its sessions', async t => {
  const out = scratch(t), log = [];
  const {rows, failed} = await runSteps(PLANS[3](), {item: 3, out, io: fakeIo(log), log: () => {}});
  assert.equal(failed, 0);
  assert.ok(log.includes('end_task a'));
  assert.equal(log.at(-2), 'close a');
  const recorded = readFileSync(join(out, 'item-3.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.equal(recorded.length, rows.length);
  assert.ok(recorded.some(r => r.kind === 'watch' && r.id === 'taken-over'));
  assert.ok(recorded.some(r => r.kind === 'cue'));
  assert.ok(recorded.filter(r => r.kind === 'cell').every(r => r.ok && r.route === '1'));
});

test('an item that fails after switching engine.json off still puts it back and closes its sessions', async t => {
  const out = scratch(t), log = [];
  await assert.rejects(runSteps(PLANS[10](), {item: 10, out, io: fakeIo(log, {failTask: 'engine-status'}), log: () => {}}), /engine-status failed/);
  assert.ok(log.includes('task engine-json-off'));
  assert.ok(!log.includes('task engine-json-restore'), 'the failure came before the plan\'s own restore');
  assert.equal(log.at(-1), 'cleanup settingsChanged=true');
  assert.ok(log.includes('close a'));
});

test('a dry run sends nothing and writes nothing', async t => {
  const out = join(scratch(t), 'never');
  const {rows} = await runSteps(PLANS[5](), {item: 5, out, io: null, dryRun: true, log: () => {}});
  assert.deepEqual([...new Set(rows.map(r => r.kind))], ['start', 'plan']);
  assert.ok(!existsSync(out));
});

test('the loopback kit: enrolment fills the relay\'s devices file and the kit\'s own client registry and store, and only them', async t => {
  const kit = scratch(t);
  const {needs} = prepareKit(kit);
  assert.ok(needs.some(n => n.includes('node bin/cua.mjs install')), 'an empty device home needs the runtime');
  const deviceId = 'AAAAAAAAAAAAAAAAAAAAAA';
  const entry = `"${deviceId}": {"deviceCredentialSha256": "${'a'.repeat(64)}", "clientCredentialSha256": "${'b'.repeat(64)}"}`;
  const asked = [];
  const record = await enrollKit(kit, {port: 7999, enroll: args => { asked.push(args); return {deviceId, devicesEntry: entry, clientCredential: 'c'.repeat(64)}; }});
  const paths = kitPaths(kit);
  assert.deepEqual(asked, [{deviceHome: paths.deviceHome, relay: 'ws://127.0.0.1:7999/ws'}]);
  assert.deepEqual(record, {deviceId, relayUrl: 'http://127.0.0.1:7999', port: 7999});
  assert.equal(readFileSync(paths.relayDevices, 'utf8'), relayDevicesFile(entry));
  assert.ok(JSON.parse(readFileSync(paths.relayDevices, 'utf8'))[deviceId]);
  assert.equal(statSync(paths.relayDevices).mode & 0o777, 0o600);
  assert.deepEqual(readDevices({env: {HOME: paths.clientHome}}), {loop: {deviceId, relayUrl: 'http://127.0.0.1:7999'}});
  const store = fileStore({dir: storeDir({HOME: paths.clientHome})});
  assert.equal(await store.read(clientSecretKey(deviceId)), 'c'.repeat(64));
  assert.ok(storeDir({HOME: paths.clientHome}).startsWith(kit));
  await assert.rejects(enrollKit(kit, {port: 7999, enroll: () => ({})}), /enrolled already/);
});

test('the remote clients resolve their own cursor contexts: a MAWS label and colour, a folder name, and off', t => {
  const kit = scratch(t);
  const steps = remoteSteps(kit), opens = steps.filter(s => s.open);
  assert.deepEqual(opens.map(s => s.device), ['loop', 'loop', 'loop']);
  assert.ok(opens.every(s => s.env.HOME === kitPaths(kit).clientHome && s.env.CUA_HOME === kitPaths(kit).deviceHome));
  assert.equal(opens[0].env.CUA_CURSOR_LABEL, 'Loop A');
  assert.equal(opens[1].env.CLAUDE_PROJECT_DIR, kitPaths(kit).bravo);
  assert.equal(opens[1].env.CLAUDE_CODE_SESSION_ID, null);
  assert.equal(opens[2].env.CUA_CURSOR, '0');
});

test('every timed sample runs with the cursor already visible: an untimed prime at the opposite point before its first click', async () => {
  const {PRIME_MS} = await import('../../scripts/cursor-sitting/cells.mjs');
  const typing = timingSteps('typing', 2).find(s => s.sample).cell;
  const first = typing.indexOf('await __app.click(');
  assert.ok(typing.slice(first, typing.indexOf('typeText')).includes(`setTimeout(resolve, ${PRIME_MS})`), 'the prime and its pause come before the click the type_text follows');
  assert.ok(typing.indexOf(`setTimeout(resolve, ${PRIME_MS})`) < typing.indexOf('performance.now(); await __app.typeText'), 'the prime is outside the timed call');
  const clicks = timingSteps('clicks', 2);
  clicks.forEach((s, k) => { if (s.sample?.series === 'coordinate click') { assert.match(clicks[k - 1].label, /^prime /); assert.equal(clicks[k - 1].sample, undefined); } });
});
