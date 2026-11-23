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

test('a skipped act (its activate step failed, nothing read after it) stays an activation cause, never unread', () => {
  const skipped = readings({activate: {app: TEXTEDIT, front: false, key: false}, before: {front: ALERT, key: null}, after: null});
  assert.deepEqual(frontKeyProblems(skipped), [], 'after: null records the skipped act');
  assert.equal(frontKeyCause(skipped, {hosted: true}).category, 'activation');
  assert.equal(frontKeyCause(readings({after: null}), {hosted: true}).category, 'unread', 'an act that ran needs its readings after it');
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
  for (const category of ['unread', 'activation', 'alert', 'keyWindow', 'venue', 'invalid', 'unmeasured', 'unpaired']) assert.ok(NO_VERDICT_CAUSES[category], category);
});

test('the shape: what does not conform is named, field by field', () => {
  assert.deepEqual(frontKeyProblems(readings()), []);
  assert.deepEqual(frontKeyProblems(readings({after: {front: null, key: null}})), [], 'null is unread, which conforms');
  const bad = frontKeyProblems({apps: 'x', activate: {app: 1, front: 'yes'}, before: {front: 3}, after: 'later'});
  for (const field of ['apps', 'activate.app', 'activate.front', 'activate.key', 'before.front', 'before.key', 'after']) assert.ok(bad.some(p => p.includes(`frontKey.${field}`)), `${field}: ${bad.join('; ')}`);
  assert.deepEqual(frontKeyProblems(null), ['frontKey is not an object']);
});

test('a hosted sample the harness left invalid before anything was read keeps its own reason: no readings is not what kept its verdict', () => {
  const row = {section: 'method', id: 'textedit/frontmost/click.control', engine: 'cua', sample: 1, ok: false, hosted: true};
  assert.deepEqual(sampleCause({...row, invalid: 'not prepared: the field is not in the text'}), {category: 'invalid', detail: 'not prepared: the field is not in the text'});
  assert.equal(sampleCause(row).category, 'unread', 'a sample with nothing to say why stays unread');
  assert.equal(sampleCause({...row, invalid: 'x', frontKey: readings({before: {front: ALERT, key: ALERT}})}).category, 'alert', 'readings, when there are some, still come first');
});

test('a sample whose guarded key the capture alert held is NO VERDICT \'alert\' by its own mark, whatever its readings say', () => {
  const held = {alertHeld: {keys: ['super+o'], front: ALERT}, invalid: 'the key guard held the action\'s keys: replayd\'s capture alert in front'};
  // The alert left the front before the re-read: the readings alone would let the unexecuted row count.
  assert.equal(sampleCause({section: 'method', ok: false, frontKey: readings()}), null);
  assert.deepEqual(sampleCause({section: 'method', ok: false, frontKey: readings(), ...held}), {category: 'alert', detail: `${ALERT} in front at the key guard; super+o held`});
  assert.deepEqual(sampleCause({section: 'method', ok: false, hosted: true, ...held}), {category: 'alert', detail: `${ALERT} in front at the key guard; super+o held`});
});
