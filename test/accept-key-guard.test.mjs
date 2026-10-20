// The frontmost guard for the harnesses' TextEdit keys (scripts/accept/key-guard.mjs, #162): a key-sending cell runs
// only while the run's target app is the frontmost application; otherwise nothing is sent and the skip is recorded
// with the frontmost app's bundle id. Doubles only: the frontmost reader is a stub, nothing reads this Mac's state.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FRONTMOST_SCRIPT, FRONTMOST_PROCESS_SCRIPT, FRONT_WINDOW_SCRIPT, KEY_SKIPPED, frontmostFromProbe, parseFrontmost, parseFrontmostProcess, sendIfFrontmost, sendToPausedSession} from '../scripts/accept/key-guard.mjs';
import {pausing} from '../scripts/mini-pause.mjs';

const TEXTEDIT = 'com.apple.TextEdit';

test('with the target frontmost the key is sent and its result returned', async () => {
  const sent = [];
  const out = await sendIfFrontmost({target: TEXTEDIT, keys: ['super+w'], frontmost: () => TEXTEDIT, send: async () => { sent.push('super+w'); return 'closed'; }});
  assert.deepEqual(out, {sent: true, result: 'closed'});
  assert.deepEqual(sent, ['super+w']);
});

test('with another app frontmost, or none readable, nothing is sent and the skip names the frontmost app', async () => {
  for (const [frontmost, named] of [[() => 'com.google.Chrome', 'com.google.Chrome'], [async () => null, 'unreadable'], [() => { throw new Error('ssh failed'); }, 'unreadable']]) {
    let sent = false;
    const out = await sendIfFrontmost({target: TEXTEDIT, keys: ['super+q'], frontmost, send: () => { sent = true; }});
    assert.equal(sent, false, named);
    assert.deepEqual(out, {sent: false, skipped: {event: KEY_SKIPPED, keys: ['super+q'], target: TEXTEDIT, frontmost: named}});
  }
});

test('the frontmost reader parses lsappinfo in both spellings it prints', () => {
  assert.equal(FRONTMOST_SCRIPT, 'lsappinfo info -only bundleid "$(lsappinfo front)"');
  assert.equal(parseFrontmost('"CFBundleIdentifier"="com.apple.TextEdit"\n'), TEXTEDIT);
  assert.equal(parseFrontmost('bundleID="com.apple.TextEdit"'), TEXTEDIT);
  assert.equal(parseFrontmost(''), null);
});

// accept-native's TextEdit sitting runs its cells through mini-pause's pausing() session, which waits at the pause
// gate before each cell (#162 review): the wait must come before the frontmost check, with no pause point between the
// check and the dispatch, or a pause of any length would let another app come to the front after the check.
test('a paused session waits first, then checks the frontmost app, then dispatches with no pause between', async () => {
  let front = TEXTEDIT;
  const order = [];
  // The pause holds while Chrome comes to the front, then ends.
  const gate = {wait: async where => { order.push(`wait ${where}`); front = 'com.google.Chrome'; }};
  const sent = [];
  const session = pausing({js: async code => { order.push('dispatch'); sent.push(code); return {ok: true}; }}, gate, 'the TextEdit sitting\'s connection B cell');
  const out = await sendToPausedSession({session, target: TEXTEDIT, keys: ['super+w'], frontmost: () => { order.push('frontmost'); return front; }, args: ['await app.pressKey("super+w")', 60_000]});
  assert.deepEqual(out, {sent: false, skipped: {event: KEY_SKIPPED, keys: ['super+w'], target: TEXTEDIT, frontmost: 'com.google.Chrome'}});
  assert.deepEqual(sent, [], 'the key was not sent after the pause');
  assert.deepEqual(order, ['wait the TextEdit sitting\'s connection B cell', 'frontmost']);

  // With TextEdit still in front after the pause: one wait, the check, then the cell, which does not wait again.
  order.length = 0;
  const steady = {wait: async where => { order.push(`wait ${where}`); }};
  const s2 = pausing({js: async (...args) => { order.push('dispatch'); return args; }}, steady, 'a cell');
  const ok = await sendToPausedSession({session: s2, target: TEXTEDIT, keys: ['typeText'], frontmost: () => { order.push('frontmost'); return TEXTEDIT; }, args: ['code', 5]});
  assert.deepEqual(ok, {sent: true, result: ['code', 5]});
  assert.deepEqual(order, ['wait a cell', 'frontmost', 'dispatch']);
});

// From M1b (the own native engine spec, Verification system part 2): a harness that launched the scene's process names
// it by pid, so the guard compares the frontmost process, not its bundle id: another process of the same id (a second
// TextEdit, the owner's) is not the target. A target that names the run's window too (Finder, whose process is the
// system's) also needs that window on top.
test('the frontmost process reader parses pid and bundle id from lsappinfo in both spellings', () => {
  assert.equal(FRONTMOST_PROCESS_SCRIPT, 'lsappinfo info -only pid,bundleid "$(lsappinfo front)"');
  assert.deepEqual(parseFrontmostProcess('"pid"=736\n"CFBundleIdentifier"="com.apple.finder"\n'), {pid: 736, bundleId: 'com.apple.finder'});
  assert.deepEqual(parseFrontmostProcess('pid = 42 bundleID="com.apple.TextEdit"'), {pid: 42, bundleId: TEXTEDIT});
  assert.deepEqual(parseFrontmostProcess('"pid"=42\n'), {pid: 42, bundleId: null});
  assert.equal(parseFrontmostProcess(''), null);
  assert.equal(parseFrontmostProcess('"pid"=0'), null);
  // The bundle-id reader still reads the bundle id out of the pid form's output.
  assert.equal(parseFrontmost('"pid"=42\n"CFBundleIdentifier"="com.apple.TextEdit"\n'), TEXTEDIT);
});

test('a pid target is sent to only while that process is frontmost; the same bundle id in another process is not it', async () => {
  const target = {pid: 501, bundleId: TEXTEDIT};
  let sent = 0;
  const ok = await sendIfFrontmost({target, keys: ['super+n'], frontmost: () => ({pid: 501, bundleId: TEXTEDIT}), send: async () => { sent++; return 'new'; }});
  assert.deepEqual(ok, {sent: true, result: 'new'});
  for (const [frontmost, named] of [
    [() => ({pid: 777, bundleId: TEXTEDIT}), {pid: 777, bundleId: TEXTEDIT}],
    [() => ({pid: 9, bundleId: 'com.apple.finder'}), {pid: 9, bundleId: 'com.apple.finder'}],
    [() => TEXTEDIT, 'unreadable'],                       // a bundle id alone cannot name a process
    [() => null, 'unreadable'],
    [() => { throw new Error('ssh failed'); }, 'unreadable'],
  ]) {
    const out = await sendIfFrontmost({target, keys: ['super+n'], frontmost, send: () => { sent++; }});
    assert.deepEqual(out, {sent: false, skipped: {event: KEY_SKIPPED, keys: ['super+n'], target, frontmost: named}});
  }
  assert.equal(sent, 1);
  // A process target without a pid names nothing, whatever the reading: never sent.
  for (const bad of [{bundleId: TEXTEDIT}, {pid: '501'}, {pid: 0}])
    assert.equal((await sendIfFrontmost({target: bad, keys: ['x'], frontmost: () => ({}), send: () => { sent++; }})).sent, false, JSON.stringify(bad));
  assert.equal(sent, 1);
});

test('a target naming a window needs that window on top of the frontmost process too', async () => {
  const target = {pid: 736, bundleId: 'com.apple.finder', window: 4242};
  const front = topWindow => ({pid: 736, bundleId: 'com.apple.finder', topWindow});
  let sent = 0;
  const send = () => { sent++; return 'ok'; };
  assert.equal((await sendIfFrontmost({target, keys: ['super+2'], frontmost: () => front({ownerPid: 736, number: 4242}), send})).sent, true);
  for (const top of [{ownerPid: 736, number: 1}, {ownerPid: 99, number: 4242}, null, undefined]) {
    const out = await sendIfFrontmost({target, keys: ['super+2'], frontmost: () => front(top), send});
    assert.equal(out.sent, false, JSON.stringify(top));
    assert.deepEqual(out.skipped.frontmost, {pid: 736, bundleId: 'com.apple.finder', topWindow: top ?? null});
  }
  assert.equal(sent, 1);
});

test('FrontWindowProbe\'s reading becomes the guard\'s frontmost process with its top window', () => {
  assert.deepEqual(frontmostFromProbe({at: 1, frontmost: {bundleId: 'com.apple.finder', pid: 736}, topWindow: {ownerPid: 736, number: 7, bounds: {x: 0, y: 0, width: 10, height: 10}, onScreen: true}}),
    {pid: 736, bundleId: 'com.apple.finder', topWindow: {ownerPid: 736, number: 7, bounds: {x: 0, y: 0, width: 10, height: 10}, onScreen: true}});
  assert.equal(frontmostFromProbe({at: 1, frontmost: null, topWindow: null}), null);
  assert.equal(frontmostFromProbe(null), null);
  assert.match(FRONT_WINDOW_SCRIPT, /scripts\/accept\/front-window\.swift$/);
});
