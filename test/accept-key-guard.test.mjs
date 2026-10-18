// The frontmost guard for the harnesses' TextEdit keys (scripts/accept/key-guard.mjs, #162): a key-sending cell runs
// only while the run's target app is the frontmost application; otherwise nothing is sent and the skip is recorded
// with the frontmost app's bundle id. Doubles only: the frontmost reader is a stub, nothing reads this Mac's state.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FRONTMOST_SCRIPT, KEY_SKIPPED, parseFrontmost, sendIfFrontmost, sendToPausedSession} from '../scripts/accept/key-guard.mjs';
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
