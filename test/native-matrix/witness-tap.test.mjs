// Ruling 1225: R3's witness on the device side. The key-route tap app, extended with an `events` mode: listen-only taps
// on the run's scene processes for the span of the matrix's judged cells, each event kept by its tap, kind, target and
// source pids and time, never a keycode or a character; its own start, stop and any disable recorded. And the positive
// control: one modifier-free flagsChanged the harness posts to a scene's pid (CGEventPostToPid), which the tap must see.
// Hosted only, every piece of it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {CONTROL_SCRIPT, controlPost, main as deviceMain, startTap, stopTap, TAP_APP, TAP_EXECUTABLE, TAP_SCRIPT, WITNESS_MAX_SECONDS} from '../../scripts/native-matrix/key-route-device.mjs';

function deviceIo({env = {RUNNER_ENVIRONMENT: 'github-hosted'}, files = {}} = {}) {
  const calls = [];
  return {calls, files, io: {
    env, platform: 'darwin', sleep: async () => {}, now: () => 1_000, nonce: () => 'n0nce',
    exists: path => path === TAP_EXECUTABLE, mkdir: path => calls.push(['mkdir', path]), remove: path => { calls.push(['remove', path]); delete files[path]; },
    readText: path => files[path] ?? null, writeText: (path, text) => { calls.push(['write', path]); files[path] = text; },
    open: a => { calls.push(['open', ...a]); files[a[a.indexOf('--out') + 1]] = `${JSON.stringify({ready: true, pid: 41, listenAccess: true, at: 900, taps: [{label: 'textedit', pid: 5, created: true}]})}\n`; },
    alive: () => false, kill: pid => calls.push(['kill', pid]), isTap: () => true,
    control: pid => { calls.push(['control', pid]); return {posted: true, pid: 77, at: 1_100, kind: 'flagsChanged'}; },
    journal: entry => calls.push(['journal', entry]),
  }};
}

test('the witness tap starts in its own directory in events mode, bounded for a whole run', async () => {
  const {io, calls} = deviceIo();
  const start = await startTap({run: '/r', targets: ['textedit:5', 'finder:6'], mode: 'events'}, io);
  assert.deepEqual(start, {launched: true, ready: true, pid: 41, listenAccess: true, startedAt: 900, taps: [{label: 'textedit', pid: 5, created: true}]});
  const open = calls.find(c => c[0] === 'open');
  assert.equal(open[open.indexOf('--out') + 1], join('/r', 'witness', 'tap.jsonl'));
  assert.deepEqual(open.slice(open.indexOf('--mode'), open.indexOf('--mode') + 2), ['--mode', 'events']);
  assert.equal(open[open.indexOf('--max-seconds') + 1], String(WITNESS_MAX_SECONDS));
  assert.deepEqual(open.slice(open.indexOf('--pid')), ['--pid', 'textedit:5', '--pid', 'finder:6']);
  // Fix wave M6: the witness tap is journaled with the run's launches once it is up, so the run's recover stops it.
  assert.deepEqual(calls.filter(c => c[0] === 'journal'), [['journal', {kind: 'cli', pid: 41, label: 'key-route tap (witness)'}]]);
  const never = deviceIo();
  never.io.open = a => never.calls.push(['open', ...a]);
  assert.equal((await startTap({run: '/r', targets: ['textedit:5'], mode: 'events'}, never.io)).ready, false);
  assert.deepEqual(never.calls.filter(c => c[0] === 'journal'), [], 'a tap that never said its pid is not journaled');
  // The key-route diagnostic's tap is left as it was: its own directory, no mode flag.
  const keyRoute = deviceIo();
  await startTap({run: '/r', targets: ['textedit:5']}, keyRoute.io);
  const plain = keyRoute.calls.find(c => c[0] === 'open');
  assert.deepEqual(keyRoute.calls.filter(c => c[0] === 'journal'), []);
  assert.equal(plain.includes('--mode'), false);
  assert.equal(plain[plain.indexOf('--out') + 1], join('/r', 'key-route', 'tap.jsonl'));
});

test('the witness tap\'s stop keeps each event by tap, kind, target, source and time alone: never a keycode or a character', async () => {
  const {io, files} = deviceIo();
  await startTap({run: '/r', targets: ['textedit:5'], mode: 'events'}, io);
  // A log line that carried more than the tap writes (a keycode, characters) leaves only the kept fields.
  files[join('/r', 'witness', 'tap.jsonl')] += [
    {label: 'textedit', tapPid: 5, kind: 'keyDown', target: 5, source: 88, at: 1_200, keycode: 0, characters: 'a', unicode: 'a'},
    {label: 'textedit', tapPid: 5, kind: 'flagsChanged', target: 5, source: 77, at: 1_101},
    {disabled: 'timeout', label: 'textedit', tapPid: 5, reenabled: true, at: 1_300},
    {stopped: true, why: 'stop', at: 2_000},
  ].map(l => JSON.stringify(l)).join('\n');
  const stop = await stopTap({run: '/r', mode: 'events'}, io);
  assert.deepEqual(stop, {exited: true, killed: false, why: 'stop', logRead: true, ready: true, startedAt: 900, stoppedAt: 2_000, taps: [{label: 'textedit', pid: 5, created: true}],
    disabled: [{label: 'textedit', tapPid: 5, why: 'timeout', reenabled: true, at: 1_300}],
    events: [{tapPid: 5, kind: 'keyDown', target: 5, source: 88, at: 1_200}, {tapPid: 5, kind: 'flagsChanged', target: 5, source: 77, at: 1_101}]});
  for (const event of stop.events) assert.deepEqual(Object.keys(event).sort(), ['at', 'kind', 'source', 'tapPid', 'target'], 'no keycode, no character');
  // A kind the tap does not write is no event.
  assert.equal(JSON.stringify(stop).includes('keycode'), false);
  assert.equal(JSON.stringify(stop).includes('characters'), false);
});

test('the control: one modifier-free flagsChanged posted to the pid by the harness\'s own helper, hosted only', async () => {
  const {io, calls} = deviceIo();
  assert.deepEqual(controlPost(5, io), {posted: true, pid: 77, at: 1_100, kind: 'flagsChanged'});
  assert.deepEqual(calls, [['control', 5]]);
  const off = deviceIo({env: {}});
  assert.match(controlPost(5, off.io).refused, /the witness control: refused/);
  assert.deepEqual(off.calls, []);
  const out = await deviceMain(['control', '--pid', '5', '--run', '/r'], {io: off.io});
  assert.match(out.answer.refused, /refused: it runs only on a GitHub-hosted runner/);
  assert.deepEqual((await deviceMain(['control', '--pid', '5', '--run', '/r'], {io})).answer, {posted: true, pid: 77, at: 1_100, kind: 'flagsChanged'});
  assert.deepEqual((await deviceMain(['tap', 'start', '--mode', 'events', '--pid', 'textedit:5', '--run', '/r'], {io})).answer.startedAt, 900);
  await assert.rejects(deviceMain(['tap', 'start', '--mode', 'loud', '--pid', 'textedit:5', '--run', '/r'], {io}), /--mode events/);
});

test('the tap is listen-only, records its disables, and its events mode reads no keycode; the control posts a modifier-free flagsChanged to the pid', () => {
  const tap = readFileSync(TAP_SCRIPT, 'utf8');
  assert.ok((tap.match(/tapCreateForPid\(/g) ?? []).length >= 1);
  assert.ok(!/options: \.defaultTap/.test(tap), 'never an active tap');
  for (const call of tap.match(/tapCreateForPid\([^)]*\)/gs) ?? []) assert.match(call, /options: \.listenOnly/);
  assert.match(tap, /tapDisabledByTimeout/);
  assert.match(tap, /"disabled"/);
  // The events branch writes the kind and pids alone.
  const branch = tap.slice(tap.indexOf('// events mode'), tap.indexOf('// end events mode'));
  assert.ok(branch.length > 0);
  assert.doesNotMatch(branch, /keycode|keyboardEventKeycode|keyboardGetUnicodeString|Characters/i);
  const control = readFileSync(CONTROL_SCRIPT, 'utf8');
  assert.match(control, /postToPid/);
  assert.match(control, /\.flagsChanged/);
  assert.match(control, /flags = \[\]/);
  assert.match(control, /RUNNER_ENVIRONMENT/);
  assert.ok(control.indexOf('RUNNER_ENVIRONMENT') < control.indexOf('postToPid'), 'the venue checked before any post');
  assert.equal(TAP_APP.endsWith('KeyRouteTap.app'), true);
});
