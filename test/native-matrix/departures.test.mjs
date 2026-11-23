// The declared-departures file (scripts/native-matrix/departures.mjs, R3 as ruled 1108): one kind of entry only, cua
// refused or answered unconfirmed where the vendor answered ok, each naming its row, both answers and the Decision Log
// entry; an entry of any other kind is itself a failure, and no pressKey row may be declared (ruling 1119).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {answeredAs, departureProblems, readDepartures, usableDepartures} from '../../scripts/native-matrix/departures.mjs';

const ROW = {section: 'method', id: 'chrome/background/drag.select@textedit'};
const entry = (patch = {}) => ({...ROW, vendor: {answer: 'ok'}, cua: {answer: 'refused', sentence: 'refused a background drag'}, decision: 'Decision Log, 2026-11-20, a background drag into Chromium is refused', ...patch});

test('the shipped file loads and holds no entry of another kind', () => {
  const list = readDepartures();
  assert.ok(Array.isArray(list));
  assert.deepEqual(departureProblems(list), []);
});

test('the one declarable kind: the vendor answered ok, cua refused or answered unconfirmed', () => {
  assert.deepEqual(departureProblems([entry()]), []);
  assert.deepEqual(departureProblems([entry({cua: {answer: 'unconfirmed', sentence: 'typeUnconfirmed'}})]), []);
  for (const [vendor, cua] of [[{answer: 'refused'}, {answer: 'ok', sentence: 'x'}], [{answer: 'ok'}, {answer: 'ok', sentence: 'x'}], [{answer: 'ok'}, {answer: 'differs', sentence: 'x'}],
    [{answer: 'unconfirmed'}, {answer: 'refused', sentence: 'x'}], [undefined, {answer: 'refused', sentence: 'x'}]]) {
    const problems = departureProblems([entry({vendor, cua})]);
    assert.ok(problems.some(p => /is not the one declarable kind \(R3\): only cua refused or answered unconfirmed where the vendor answered ok/.test(p)), `${JSON.stringify({vendor, cua})}: ${problems.join('; ')}`);
  }
});

test('an entry must name a judged row of the matrix, cua\'s sentence and its Decision Log entry; never a pressKey row', () => {
  const named = patch => departureProblems([entry(patch)]).join('; ');
  assert.match(named({section: 'unicode', id: 'textedit/korean/pressKey.rk'}), /no pressKey row may be declared \(ruling 1119\)/);
  assert.match(named({section: 'unicode', id: 'chrome/perContext@textedit/typeText.hangul'}), /names no judged row of the matrix/, 'a not-judged row (ruling 1119)');
  assert.match(named({section: 'speed', id: 'textedit/getAXState'}), /names no judged row of the matrix/, 'speed is measured, not answered');
  assert.match(named({id: 'textedit/frontmost/nothing.here'}), /names no judged row of the matrix/);
  assert.match(named({id: 'textedit/frontmost/selectText.notText'}), /is a refusal case: the vendor's ok there is its refusal/, 'cua refusing otherwise there is cua acting differently');
  assert.match(named({decision: ''}), /cites no Decision Log entry/);
  assert.match(named({cua: {answer: 'refused'}}), /names no sentence for cua's answer/);
  assert.match(named({cua: {answer: 'refused', sentence: '('}}), /sentence is not a regular expression/);
  assert.match(departureProblems([entry(), entry()]).join('; '), /declared twice/);
  assert.deepEqual(usableDepartures([entry(), entry({id: 'textedit/frontmost/click.control', vendor: {answer: 'refused'}}), entry({section: 'unicode', id: 'textedit/latin/pressKey.rk'})]).map(e => e.id), [ROW.id], 'only well-formed entries apply');
  assert.deepEqual(usableDepartures([entry(), entry()]), [], 'a row declared twice applies neither');
});

test('answeredAs: the act threw cua\'s declared sentence, and the row\'s own effect check read what that answer allows', () => {
  const refused = entry(), unconfirmed = entry({cua: {answer: 'unconfirmed', sentence: '^typeUnconfirmed'}});
  const row = outcome => ({...ROW, engine: 'cua', sample: 1, ok: false, outcome});
  assert.deepEqual(answeredAs(refused, row({threw: 'Computer Use server error -10005: refused a background drag', unchanged: true})), {answered: true, effect: true});
  assert.deepEqual(answeredAs(refused, row({message: 'refused a background drag here', unchanged: true})), {answered: true, effect: true}, 'a refusal case keeps it as message');
  assert.deepEqual(answeredAs(refused, row({threw: 'refused a background drag'})), {answered: true, effect: false}, 'no reading that nothing took effect');
  assert.deepEqual(answeredAs(refused, row({threw: 'refused a background drag', unchanged: true, effect: true})), {answered: true, effect: false}, 'a refusal whose effect took place is no refusal');
  assert.deepEqual(answeredAs(refused, row({threw: 'something else', unchanged: true})), {answered: false, effect: true});
  assert.deepEqual(answeredAs(refused, row({unchanged: false})), {answered: false, effect: false}, 'answered ok but acted differently');
  // Unconfirmed: the intended effect or nothing; anything else is cua acting differently.
  assert.deepEqual(answeredAs(unconfirmed, row({threw: 'typeUnconfirmed: the field did not read back', effect: true})), {answered: true, effect: true});
  assert.deepEqual(answeredAs(unconfirmed, row({threw: 'typeUnconfirmed: the field did not read back', unchanged: true})), {answered: true, effect: true});
  assert.deepEqual(answeredAs(unconfirmed, row({threw: 'typeUnconfirmed: the field did not read back', effect: false})), {answered: true, effect: false});
});
