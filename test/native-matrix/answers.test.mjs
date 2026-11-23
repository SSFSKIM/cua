// What a sample's act answered and whether two failures are the same (scripts/native-matrix/answers.mjs): the kind by
// the recorded error name alone, ruling 1144's same failure (the same answer and the same read-back).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {answerOf, sameAnswer, sameEffect, sameFailure} from '../../scripts/native-matrix/answers.mjs';

const row = outcome => ({section: 'unicode', id: 'chrome/korean/typeText.lines', engine: 'cua', sample: 1, ok: false, outcome});

test('the answer\'s kind comes from the recorded error name, never the sentence', () => {
  assert.deepEqual(answerOf(row({exact: false, hash: 'h'})), {kind: 'ok', name: null, sentence: null});
  assert.deepEqual(answerOf(row({threw: 'Computer Use server error -10005: background click refused', errorName: 'backgroundClickRefused'})),
    {kind: 'refused', name: 'backgroundClickRefused', sentence: 'background click refused'});
  assert.equal(answerOf(row({threw: 'x', errorName: 'typeUnconfirmed'})).kind, 'unconfirmed');
  assert.equal(answerOf(row({threw: 'refused, nothing was sent', errorName: 'timeoutReached'})).kind, 'error', 'a timeout is no refusal, whatever it says');
  assert.equal(answerOf(row({threw: 'background click refused', errorName: 'Error'})).kind, 'error', 'the facade\'s plain Error names nothing');
  assert.equal(answerOf(row({refused: true, expected: true, unchanged: true, errorName: 'Error', message: 'Could not find the requested text'})).kind, 'error');
  assert.equal(answerOf(row({refused: false, expected: false, unchanged: false, errorName: null, message: null})).kind, 'ok', 'a refusal case answered ok');
});

test('the same failure: the same answer and the same read-back; two errors need the same sentence', () => {
  const falseOk = hash => row({exact: false, length: 3, expectedLength: 5, hash});
  assert.ok(sameFailure(falseOk('h1'), falseOk('h1'), {readBack: true}));
  assert.ok(!sameFailure(falseOk('h1'), falseOk('h2'), {readBack: true}), 'another read-back');
  assert.ok(!sameFailure(row({exact: false}), row({exact: false}), {readBack: true}), 'no read-back recorded is no proof');
  const error = (sentence, hash = 'h0') => row({exact: false, hash, threw: `Computer Use server error -10005: ${sentence}`, errorName: 'Error'});
  assert.ok(sameFailure(error('Timed out'), error('Timed out'), {readBack: true}));
  assert.ok(!sameFailure(error('Timed out'), error('Other'), {readBack: true}));
  assert.ok(!sameFailure(error('Timed out'), falseOk('h0'), {readBack: true}), 'a false ok is not the vendor\'s refusal');
  assert.ok(!sameAnswer(answerOf(row({threw: 'x', errorName: 'typeUnconfirmed'})), answerOf(row({threw: 'x', errorName: 'pasteUnconfirmed'}))));
  // A method row without a read-back: its boolean effect readings, the answer's keys apart.
  assert.ok(sameEffect(row({collapsed: false, unchanged: true, elements: 3}), row({collapsed: false, unchanged: true, elements: 9})));
  assert.ok(!sameEffect(row({collapsed: false, unchanged: true}), row({collapsed: false, unchanged: false})));
  assert.ok(!sameEffect(row({elements: 3}), row({elements: 3})), 'nothing to compare');
});
