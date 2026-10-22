// The offline re-judge of recorded mid-switch rows (scripts/native-matrix/rejudge-midswitch.mjs): rows that kept the
// engine's message by the live rule, older rows left unjudged with their fields reported, invalid rows left invalid.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rejudgeMidSwitch} from '../../scripts/native-matrix/rejudge-midswitch.mjs';

// Hold 2b's korean run 3 (cua), as recorded: judged by an error name the REPL never carries.
const recorded = (outcome, extra = {}) => ({section: 'unicode', id: 'textedit/midSwitch/typeText.long', engine: 'cua', sample: 3, ok: false, condition: 'midSwitch',
  outcome: {stopped: false, errorName: 'Error', entered: 194, length: 194, exact: true, intervalSource: 'engine', switchOffsetMs: 396, ...outcome}, ...extra});

test('a recorded row without the message is never judged: its fields are reported as consistent or not', () => {
  const out = rejudgeMidSwitch(recorded({}));
  assert.equal('ok' in out, false);
  assert.match(out.unjudged, /cause is not established/);
  assert.deepEqual([out.consistent, out.recordedOk], [true, false]);
  assert.match(out.basis, /recorded fields/);
  // Chrome's: one unit more in the field than the engine said it entered.
  assert.equal(rejudgeMidSwitch(recorded({entered: 180, length: 181, exact: false})).consistent, false);
  // No throw (no error name): not consistent with a stop.
  assert.equal(rejudgeMidSwitch(recorded({errorName: null})).consistent, false);
});

test('a kept message that names another stop fails though the field holds exactly what was entered', () => {
  const out = rejudgeMidSwitch(recorded({entered: 30, length: 30, message: 'Computer Use server error -10005: Unable to create the key event after 30 of 1079 characters.'}));
  assert.deepEqual([out.ok, out.stopped], [false, false]);
});

test('a row that kept the message is judged by the engine\'s sentence; an invalid row stays invalid', () => {
  const sentence = 'Computer Use server error -10005: The input source changed after 194 of 1079 characters were entered; get the app\'s state to see what was typed.';
  assert.equal(rejudgeMidSwitch(recorded({message: sentence})).ok, true);
  assert.equal(rejudgeMidSwitch(recorded({message: 'Computer Use server error -10005: Timed out'})).stopped, false);
  assert.deepEqual(rejudgeMidSwitch(recorded({}, {invalid: 'the probe switched 10 ms after the action\'s interval'})),
    {id: 'textedit/midSwitch/typeText.long', engine: 'cua', sample: 3, invalid: 'the probe switched 10 ms after the action\'s interval'});
});
