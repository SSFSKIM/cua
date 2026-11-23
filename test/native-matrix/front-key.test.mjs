// The front/key readings of a judged sample (scripts/native-matrix/front-key.mjs): rulings 1136 and 1141's rules, an
// alert frontmost or a failed activate step is NO VERDICT for the sample, never a pass and never a fail; a hosted run's
// sample without its readings is NO VERDICT too.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {frontKeyCause, frontKeyProblems, NO_VERDICT_CAUSES, sampleCause} from '../../scripts/native-matrix/front-key.mjs';

const TEXTEDIT = 'com.apple.TextEdit', FINDER = 'com.apple.finder', ALERT = 'com.apple.UserNotificationCenter';
const readings = (patch = {}) => ({apps: [TEXTEDIT], activate: {app: TEXTEDIT, front: true, key: true},
  before: {front: TEXTEDIT, key: TEXTEDIT}, after: {front: TEXTEDIT, key: TEXTEDIT}, ...patch});

test('a sample whose scene took front and key, and kept them, has no cause: its verdict counts', () => {
  assert.equal(frontKeyCause(readings(), {hosted: true}), null);
  // A background cell: the user window's app activated and in front, the driven app among the cell's own.
  assert.equal(frontKeyCause(readings({apps: [TEXTEDIT, FINDER], activate: {app: FINDER, front: true, key: true},
    before: {front: FINDER, key: FINDER}, after: {front: FINDER, key: FINDER}}), {hosted: true}), null);
  // The driven app taking front in a background cell is the oracle's interference, not an alert: no cause here.
  assert.equal(frontKeyCause(readings({apps: [TEXTEDIT, FINDER], activate: {app: FINDER, front: true, key: true},
    before: {front: FINDER, key: FINDER}, after: {front: TEXTEDIT, key: TEXTEDIT}}), {hosted: true}), null);
});

test('an alert front or key, before or after the act, is NO VERDICT (ruling 1136)', () => {
  for (const patch of [{before: {front: ALERT, key: TEXTEDIT}}, {before: {front: TEXTEDIT, key: ALERT}}, {after: {front: ALERT, key: ALERT}}, {after: {front: TEXTEDIT, key: ALERT}}]) {
    assert.deepEqual(frontKeyCause(readings(patch), {hosted: true}), {category: 'alert', detail: ALERT}, JSON.stringify(patch));
    assert.deepEqual(frontKeyCause(readings(patch), {hosted: false}), {category: 'alert', detail: ALERT}, 'whatever the venue, readings that show one count');
  }
});

test('an activate step that did not take front and key is NO VERDICT, not FAIL (ruling 1141)', () => {
  assert.equal(frontKeyCause(readings({activate: {app: TEXTEDIT, front: false, key: true}}), {hosted: true}).category, 'activation');
  assert.equal(frontKeyCause(readings({activate: {app: TEXTEDIT, front: true, key: false}, before: {front: TEXTEDIT, key: ALERT}}), {hosted: true}).category, 'activation',
    'the failed activation is the first cause: the alert keeping key is its consequence');
});

test('readings missing: NO VERDICT on a hosted run, judged as before off it; readings present but unread are NO VERDICT anywhere', () => {
  assert.deepEqual(frontKeyCause(undefined, {hosted: true}), {category: 'unread', detail: 'no front/key readings on a hosted run'});
  assert.equal(frontKeyCause(undefined, {hosted: false}), null, 'a record before the rule (hold 3) or a run off a hosted runner');
  assert.equal(frontKeyCause(readings({after: {front: null, key: TEXTEDIT}}), {hosted: false}).category, 'unread');
});

test('sampleCause: the readings first, then the harness\'s own invalid reason, then an unmeasured speed or finding sample', () => {
  const row = {section: 'method', id: 'textedit/frontmost/click.control', engine: 'cua', sample: 1, ok: true};
  assert.equal(sampleCause(row), null);
  assert.deepEqual(sampleCause({...row, invalid: 'not in front'}), {category: 'invalid', detail: 'not in front'});
  assert.equal(sampleCause({...row, invalid: 'not in front', frontKey: readings({before: {front: ALERT, key: ALERT}})}).category, 'alert');
  assert.equal(sampleCause({...row, hosted: true}).category, 'unread', 'the judge tags a hosted run\'s rows');
  assert.equal(sampleCause({...row, section: 'speed', id: 'textedit/getAXState', ok: false}).category, 'unmeasured');
  assert.equal(sampleCause({...row, ok: false}), null, 'a method sample that failed has a verdict: it failed');
  for (const category of ['unread', 'activation', 'alert', 'invalid', 'unmeasured', 'unpaired']) assert.ok(NO_VERDICT_CAUSES[category], category);
});

test('the shape: what does not conform is named, field by field', () => {
  assert.deepEqual(frontKeyProblems(readings()), []);
  assert.deepEqual(frontKeyProblems(readings({after: {front: null, key: null}})), [], 'null is unread, which conforms');
  const bad = frontKeyProblems({apps: 'x', activate: {app: 1, front: 'yes'}, before: {front: 3}, after: null});
  for (const field of ['apps', 'activate.app', 'activate.front', 'activate.key', 'before.front', 'before.key', 'after']) assert.ok(bad.some(p => p.includes(`frontKey.${field}`)), `${field}: ${bad.join('; ')}`);
  assert.deepEqual(frontKeyProblems(null), ['frontKey is not an object']);
});
