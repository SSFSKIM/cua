// The service's observations of cua's own macOS engine (src/services/engine/observations.mjs; docs/doperpowers/specs/
// 2026-10-18-own-native-engine-design.md, Design "Indexes, tokens and handles" and "The service", Diff): per
// (connection, app) the numbering over the engine's tokens (render.mjs's, passed in), the text of each observation (the
// full tree, or the diff against the previous one, the baseline advancing on every observation), and the translation of
// the model's index into the lineage's token: an index never issued answers `<n> is an invalid element ID`, a retired
// one the "no longer valid" sentence, and `disableDiff`'s new lineage renumbers from 0.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createObservations} from '../src/services/engine/observations.mjs';
import {SkyComputerUseError} from '../src/services/engine/protocol.mjs';
import {node, skyshot} from './native-goldens/builder.mjs';

const NO_LONGER_VALID = 'The element ID is no longer valid. Try to get the on-screen content again and see if that resolves the issue.';
const APP = '/Applications/Example.app';
const win = () => node('t0', 0, 'AXWindow', {roleDescription: 'standard window', title: 'W', actions: ['AXRaise']});
const button = (token, title) => node(token, 1, 'AXButton', {roleDescription: 'button', title, actions: ['AXPress']});

const refusal = (sentence, errorName) => error => error instanceof SkyComputerUseError && error.code === -10005
  && error.errorName === errorName && error.message === `Computer Use server error -10005: ${sentence}`;

test('the first observation is the full tree numbered from 0; an unchanged one answers the no-change sentence', () => {
  const observations = createObservations();
  const first = observations.observe(APP, skyshot([win(), button('t1', 'OK'), button('t2', 'Cancel')]), {disableDiff: true});
  assert.equal(first, 'Window: "W", App: Example.\n0 standard window W, Secondary Actions: Raise\n\t1 button OK\n\t2 button Cancel\n');
  assert.equal(observations.observe(APP, skyshot([win(), button('t1', 'OK'), button('t2', 'Cancel')], {revision: 2}), {disableDiff: false}),
    'There has been no change in the accessibility tree for Window: "W".');
  assert.equal(observations.lineage(APP), 'L1');
});

test('an index names the token the latest observation gave it, in its lineage; a vanished element\'s index is retired, a new one takes the next', () => {
  const observations = createObservations();
  observations.observe(APP, skyshot([win(), button('t1', 'OK'), button('t2', 'Cancel')]), {disableDiff: true});
  assert.deepEqual(observations.element(APP, 2), {token: 't2', lineage: 'L1'});
  const text = observations.observe(APP, skyshot([win(), button('t2', 'Cancel'), button('t3', 'Help')], {revision: 2}), {disableDiff: false});
  assert.match(text, /^The following is a diff from the previous accessibility tree for Window: "W" .*\nRemoved element IDs: 1\n\+\t3 button Help$/);
  assert.deepEqual(observations.element(APP, 2), {token: 't2', lineage: 'L1'}, 'a kept element keeps its index');
  assert.deepEqual(observations.element(APP, 3), {token: 't3', lineage: 'L1'});
  assert.throws(() => observations.element(APP, 1), refusal(NO_LONGER_VALID, 'elementNoLongerValid'), 'retired, never reissued');
  assert.throws(() => observations.element(APP, 4), refusal('4 is an invalid element ID', 'invalidElementID'));
  assert.throws(() => observations.element(APP, -1), refusal('-1 is an invalid element ID', 'invalidElementID'));
});

test('every observation advances the baseline, including one whose text the caller discards', () => {
  const observations = createObservations();
  observations.observe(APP, skyshot([win(), button('t1', 'OK')]), {disableDiff: true});
  observations.observe(APP, skyshot([win(), button('t1', 'OK'), button('t2', 'New')], {revision: 2}), {disableDiff: false});  // a screenshot's
  assert.equal(observations.observe(APP, skyshot([win(), button('t1', 'OK'), button('t2', 'New')], {revision: 3}), {disableDiff: false}),
    'There has been no change in the accessibility tree for Window: "W".');
});

test('disableDiff\'s new lineage is renumbered from 0 with the full tree; the old lineage\'s indexes no longer name anything', () => {
  const observations = createObservations();
  observations.observe(APP, skyshot([win(), button('t1', 'A'), button('t2', 'B'), button('t3', 'C')]), {disableDiff: true});
  observations.observe(APP, skyshot([win(), button('t3', 'C')], {revision: 2}), {disableDiff: false});
  const fresh = observations.observe(APP, skyshot([node('t0', 0, 'AXWindow', {roleDescription: 'standard window', title: 'W', actions: ['AXRaise']}), button('t1', 'C')], {lineage: 'L2'}), {disableDiff: true});
  assert.equal(fresh, 'Window: "W", App: Example.\n0 standard window W, Secondary Actions: Raise\n\t1 button C\n');
  assert.deepEqual(observations.element(APP, 1), {token: 't1', lineage: 'L2'});
  assert.throws(() => observations.element(APP, 3), refusal('3 is an invalid element ID', 'invalidElementID'));
  // A new lineage without disableDiff (a reconnected or relaunched engine) also starts over, with the full text.
  const relaunched = observations.observe(APP, skyshot([win(), button('t1', 'C')], {lineage: 'L3'}), {disableDiff: false});
  assert.equal(relaunched, fresh);
});

test('per app: one app\'s observations never number or diff another\'s; an app never observed refuses every index as no longer valid', () => {
  const observations = createObservations();
  observations.observe(APP, skyshot([win(), button('t1', 'OK')]), {disableDiff: true});
  const other = '/Applications/Other.app';
  assert.throws(() => observations.element(other, 0), refusal(NO_LONGER_VALID, 'elementNoLongerValid'));
  assert.equal(observations.lineage(other), undefined);
  assert.equal(observations.observe(other, skyshot([win(), button('t1', 'OK')], {lineage: 'L9'}), {disableDiff: false}),
    'Window: "W", App: Example.\n0 standard window W, Secondary Actions: Raise\n\t1 button OK\n');
});

test('an index that is not an integer is refused as the vendor\'s client refuses it', () => {
  const observations = createObservations();
  observations.observe(APP, skyshot([win(), button('t1', 'OK')]), {disableDiff: true});
  for (const index of ['1', 1.5, null, Number.NaN]) assert.throws(() => observations.element(APP, index), {name: 'TypeError', message: 'elementIndex must be an integer'});
});
