import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  arrayFailures,
  formatWireReport,
  loadFixtures,
  nullFailures,
  objectFailures,
  outputKind,
  preorderIds,
  stringFailures,
} from '../../scripts/linux-engine-diff/wire-check.mjs';

const tree = { id: 'a', role: 'frame', children: [{ id: 'b', children: [{ id: 'c', children: [] }] }, { id: 'd', children: [] }] };
const output = { ax_tree: tree, ax_tree_source: 'at_spi', screenshots: [], window: { id: 7, title: 't' } };

function wrapperResult(overrides = {}) {
  const ax = { id: '0', to_string: () => '0 frame\n\t1 x\n\t\t2 y\n\t3 z' };
  return { ...output, ax_tree: ax, ...overrides };
}

test('preorder ids follow the vendor numbering order', () => {
  assert.deepEqual(preorderIds(tree), ['a', 'b', 'c', 'd']);
});

test('output kinds', () => {
  assert.equal(outputKind(null), 'null');
  assert.equal(outputKind([]), 'array');
  assert.equal(outputKind({}), 'object');
  assert.equal(outputKind('h'), 'string');
});

test('an object answer passes when the window, source, numbering and screenshots match', () => {
  const resolved = [
    { decimal: '0', native: 'a' },
    { decimal: '3', native: 'd' },
  ];
  assert.deepEqual(objectFailures(wrapperResult(), output, { screenshotBytes: null, resolved }), []);
});

test('an object answer fails on a JSON-encoded output, a wrong id resolution, or a missing screenshot load', () => {
  assert.match(objectFailures('{"ax_tree":{}}', output, { resolved: [] })[0], /not an object/);
  const wrong = objectFailures(wrapperResult(), output, { resolved: [{ decimal: '3', native: 'c' }] });
  assert.match(wrong.join(), /element 3 resolved to "c"/);
  const shots = { ...output, screenshots: [{ filepath: '/x.jpg' }] };
  const bytes = Buffer.from([1, 2, 3]);
  const loaded = wrapperResult({ screenshots: [{ filepath: '/x.jpg', bytes: new Uint8Array([1, 2, 3]), data_url: `data:image/jpeg;base64,${bytes.toString('base64')}` }] });
  assert.deepEqual(objectFailures(loaded, shots, { screenshotBytes: bytes, resolved: [] }), []);
  const unloaded = wrapperResult({ screenshots: [{ filepath: '/x.jpg' }] });
  assert.match(objectFailures(unloaded, shots, { screenshotBytes: bytes, resolved: [] }).join(), /not loaded/);
});

test('a rendered tree naming an id outside the tree fails', () => {
  const bad = wrapperResult({ ax_tree: { id: '0', to_string: () => '0 frame\n\t9 x' } });
  assert.match(objectFailures(bad, output, { resolved: [] }).join(), /outside the tree/);
});

test('array, string and void answers', () => {
  assert.deepEqual(arrayFailures([{ id: 1 }], [{ id: 1 }]), []);
  assert.match(arrayFailures('[{"id":1}]', [{ id: 1 }])[0], /not an array/);
  assert.deepEqual(stringFailures('h-1', 'h-1'), []);
  assert.match(stringFailures('"h-1"', 'h-1')[0], /is "\\"h-1\\""/);
  const request = { command: 'click', input: { x: 1, y: 2 } };
  assert.deepEqual(nullFailures(undefined, request, { command: 'click', input: { x: 1, y: 2 } }), []);
  assert.match(nullFailures(undefined, request, { command: 'click', input: { x: 1 } })[0], /as sent/);
});

test('the report has one line per fixture and names a missing kind with its reason', () => {
  const lines = formatWireReport([
    { name: 'cua-object.json', kind: 'object', engine: 'cua-engine', pass: true, failures: [], negative: true },
    { name: 'cua-null.json', kind: 'null', engine: 'cua-engine', pass: true, failures: [], negative: null },
    { name: 'vendor-pinned-array.json', kind: 'array', engine: 'v', pass: true, failures: [], negative: false },
  ]);
  assert.match(lines[0], /^PASS object cua .*negative control refused/);
  assert.match(lines[1], /^PASS null cua .*n\/a/);
  assert.match(lines[2], /^FAIL array vendor-pinned .*NEGATIVE CONTROL PASSED/);
  assert.ok(lines.includes('SKIP string cua: the spike answers no string-valued command (clipboard_read arrives in M2)'));
  assert.ok(lines.some((l) => l.startsWith('SKIP object vendor-pinned')));
});

test('every committed fixture is of its declared kind and carries its source', () => {
  const fixtures = loadFixtures();
  assert.ok(fixtures.length >= 8);
  for (const f of fixtures) {
    assert.equal(outputKind(f.response.output), f.kind, f.name);
    assert.ok(f.engine && f.source && f.request.command, f.name);
  }
  for (const set of ['vendor-pinned', 'vendor-newest']) {
    for (const kind of ['object', 'array', 'string', 'null']) {
      assert.ok(fixtures.some((f) => f.name === `${set}-${kind}.json`), `${set}-${kind}`);
    }
  }
});
