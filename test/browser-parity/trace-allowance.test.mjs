// A trace allowance (expected-differences, kind 'trace') may name the CDP methods it covers and the largest count change
// it accepts; the host-comparison allowance for actions/wait-for's polling does both (M2 task 3 review).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareRuns} from '../../scripts/browser-parity/compare.mjs';

const expected = JSON.parse(readFileSync(new URL('./repl-host-expected-differences.json', import.meta.url), 'utf8'));
const trace = counts => Object.entries(counts).flatMap(([cdp, n]) => Array.from({length: n}, () => ({kind: 'request', method: 'executeCdp', cdp})));
const run = counts => [
  {case: 'actions/wait-for', cell: 'visible', ok: true, value: 'ready', trace: trace(counts)},
  {case: 'actions/wait-for', assertion: {ok: true}},
];
const vendor = {'Runtime.evaluate': 12, 'Runtime.releaseObject': 8, 'Input.dispatchMouseEvent': 3};

test('the wait-for allowance accepts its polling methods moving by one, as the vendor host varies against itself', () => {
  const result = compareRuns(run(vendor), run({...vendor, 'Runtime.evaluate': 11, 'Runtime.releaseObject': 7}), {expected});
  assert.equal(result.ok, true);
  assert.deepEqual(result.expected.map(e => e.method).sort(), ['Runtime.evaluate', 'Runtime.releaseObject']);
});

test('it does not cover another method, however small the change', () => {
  const missingInput = compareRuns(run(vendor), run({...vendor, 'Input.dispatchMouseEvent': 0}), {expected});
  assert.equal(missingInput.ok, false);
  assert.deepEqual(missingInput.differences.map(d => [d.kind, d.method, d.a, d.b]), [['trace', 'Input.dispatchMouseEvent', 3, 0]]);
  assert.equal(compareRuns(run(vendor), run({...vendor, 'Input.dispatchMouseEvent': 2}), {expected}).ok, false);
});

test('it does not cover a larger change of its own methods', () => {
  const twice = compareRuns(run(vendor), run({...vendor, 'Runtime.evaluate': 10}), {expected});
  assert.equal(twice.ok, false);
  assert.deepEqual(twice.differences.map(d => [d.method, d.a, d.b]), [['Runtime.evaluate', 12, 10]]);
});

test('an allowance\'s methods and maxDelta must be well formed', () => {
  const base = {cases: ['actions/wait-for'], cells: ['visible'], kind: 'trace', reason: 'x'};
  for (const bad of [{methods: 'Runtime.evaluate'}, {methods: []}, {methods: [1]}, {maxDelta: -1}, {maxDelta: 1.5}, {maxDelta: '1'}])
    assert.throws(() => compareRuns(run(vendor), run(vendor), {expected: [{...base, ...bad}]}), /Invalid expected-differences entry/, JSON.stringify(bad));
});
