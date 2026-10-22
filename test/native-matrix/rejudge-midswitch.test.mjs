// The offline re-judge of recorded mid-switch rows (scripts/native-matrix/rejudge-midswitch.mjs): rows that kept the
// engine's message by the live rule, older rows by the fields they kept, invalid rows left invalid.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rejudgeMidSwitch} from '../../scripts/native-matrix/rejudge-midswitch.mjs';

// Hold 2b's korean run 3 (cua), as recorded: judged by an error name the REPL never carries.
const recorded = (outcome, extra = {}) => ({section: 'unicode', id: 'textedit/midSwitch/typeText.long', engine: 'cua', sample: 3, ok: false, condition: 'midSwitch',
  outcome: {stopped: false, errorName: 'Error', entered: 194, length: 194, exact: true, intervalSource: 'engine', switchOffsetMs: 396, ...outcome}, ...extra});

test('a recorded row without the message: a throw with a short entered count and the field holding exactly that much passes', () => {
  const out = rejudgeMidSwitch(recorded({}));
  assert.deepEqual([out.ok, out.stopped, out.recordedOk], [true, true, false]);
  assert.match(out.basis, /recorded fields/);
  // Chrome's: one unit more in the field than the engine said it entered.
  assert.deepEqual([rejudgeMidSwitch(recorded({entered: 180, length: 181, exact: false})).ok, rejudgeMidSwitch(recorded({entered: 180, length: 181, exact: false})).stopped], [false, true]);
  // No throw (no error name): not stopped.
  assert.equal(rejudgeMidSwitch(recorded({errorName: null})).stopped, false);
});

test('a row that kept the message is judged by the engine\'s sentence; an invalid row stays invalid', () => {
  const sentence = 'Computer Use server error -10005: The input source changed after 194 of 1079 characters were entered; get the app\'s state to see what was typed.';
  assert.equal(rejudgeMidSwitch(recorded({message: sentence})).ok, true);
  assert.equal(rejudgeMidSwitch(recorded({message: 'Computer Use server error -10005: Timed out'})).stopped, false);
  assert.deepEqual(rejudgeMidSwitch(recorded({}, {invalid: 'the probe switched 10 ms after the action\'s interval'})),
    {id: 'textedit/midSwitch/typeText.long', engine: 'cua', sample: 3, invalid: 'the probe switched 10 ms after the action\'s interval'});
});
