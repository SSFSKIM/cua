// The frontmost guard for the harnesses' TextEdit keys (scripts/accept/key-guard.mjs, #162): a key-sending cell runs
// only while the run's target app is the frontmost application; otherwise nothing is sent and the skip is recorded
// with the frontmost app's bundle id. Doubles only: the frontmost reader is a stub, nothing reads this Mac's state.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FRONTMOST_SCRIPT, KEY_SKIPPED, parseFrontmost, sendIfFrontmost} from '../scripts/accept/key-guard.mjs';

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
