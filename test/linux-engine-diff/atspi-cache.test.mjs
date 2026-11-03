// The AT-SPI probe's reading of `Cache.GetItems` (#171 M4, T6; atspi-cache.mjs): the two cache signatures parsed, a
// window's subtree rebuilt from an answer, the -1 sentinels and the anomalies counted, and the rebuilt tree compared
// with the engine's per-element read, field by field, with the numeric roles weighed against `GetRoleName`.
// Display-free: the answers are written here in the shapes busctl's JSON gives them.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CACHE_SIGNATURES,
  adoptionReasons,
  atspiRoleName,
  cacheSubtree,
  compareWithTree,
  decodeStateWords,
  editableFindings,
  parseItems,
  roleCollisions,
  signatureKind,
  straddles,
  trackedNames,
} from '../../scripts/linux-engine-diff/atspi-cache.mjs';

const BUS = ':1.9';
const ref = (n) => [BUS, `/a/${n}`];
const NULL_REF = ['', '/org/a11y/atspi/null'];
const id = (n) => `${BUS}:/a/${n}`;

/** A current-signature item: `[self, app, parent, index, childCount, interfaces, name, role, description, states]`. */
const item = (n, parent, index, childCount, { name = '', role = 39, description = '', states = [0, 0], interfaces = ['org.a11y.atspi.Accessible'] } = {}) => [
  ref(n),
  [BUS, '/org/a11y/atspi/accessible/root'],
  parent === null ? NULL_REF : ref(parent),
  index,
  childCount,
  interfaces,
  name,
  role,
  description,
  states,
];

/** A legacy (Qt) item: `[self, app, parent, children, interfaces, name, role, description, states]`. */
const legacy = (n, parent, children, { name = '', role = 39 } = {}) => [ref(n), [BUS, '/org/a11y/atspi/accessible/root'], parent === null ? NULL_REF : ref(parent), children.map(ref), ['org.a11y.atspi.Accessible'], name, role, '', [0, 0]];

test('the two signatures are told apart, and any other is not taken for either', () => {
  assert.equal(signatureKind(CACHE_SIGNATURES.current), 'current');
  assert.equal(signatureKind('a((so)(so)(so)iiassusau)'), 'current');
  assert.equal(signatureKind(CACHE_SIGNATURES.legacy), 'legacy');
  assert.equal(signatureKind('a((so)(so)(so)a(so)assusau)'), 'legacy');
  // the shape Qt's own introspection advertises, which its answer does not have
  assert.equal(signatureKind('a((so)(so)a(so)assusau)'), null);
  assert.equal(signatureKind('a(so)'), null);
});

test('a current answer parses into items with ids, a null parent, the index, the child count and the state words', () => {
  const { kind, items } = parseItems(CACHE_SIGNATURES.current, [[item(1, null, -1, 1, { name: 'app', role: 75 }), item(2, 1, 0, 0, { name: 'win', role: 23, states: [1 << 8, 0] })]]);
  assert.equal(kind, 'current');
  assert.deepEqual(items[0], { id: id(1), app: `${BUS}:/org/a11y/atspi/accessible/root`, parent: null, index: -1, childCount: 1, children: null, interfaces: ['org.a11y.atspi.Accessible'], name: 'app', role: 75, description: '', states: [0, 0] });
  assert.equal(items[1].parent, id(1));
  assert.deepEqual(items[1].states, [256, 0]);
});

test('a legacy answer parses its children lists, with no index or child count', () => {
  const { kind, items } = parseItems(CACHE_SIGNATURES.legacy, [[legacy(1, null, [2, 3]), legacy(2, 1, []), legacy(3, 1, [])]]);
  assert.equal(kind, 'legacy');
  assert.deepEqual(items[0].children, [id(2), id(3)]);
  assert.equal(items[0].index, null);
  assert.equal(items[0].childCount, null);
});

test('an answer under another signature is refused, not guessed at', () => {
  assert.throws(() => parseItems('a((so)(so)a(so)assusau)', [[]]), /signature/);
});

test("a window's subtree is rebuilt from parent references, its children in index order, whatever order the answer lists them in", () => {
  const { items } = parseItems(CACHE_SIGNATURES.current, [[item(4, 2, 1, 0), item(1, null, -1, 1), item(3, 2, 0, 0), item(2, 1, 0, 2), item(9, 1, 1, 0)]]);
  const { tree, nodes, sentinels, anomalies } = cacheSubtree(items, id(2));
  assert.equal(tree.id, id(2));
  assert.deepEqual(tree.children.map((c) => c.id), [id(3), id(4)]);
  assert.equal(nodes, 3);
  assert.deepEqual(sentinels, { index: 0, childCount: 0 });
  assert.deepEqual(anomalies, []);
});

test('-1 sentinels are counted, siblings whose order the cache does not give are flagged, and a wrong child count is an anomaly', () => {
  const { items } = parseItems(CACHE_SIGNATURES.current, [[item(1, null, -1, 3), item(2, 1, -1, -1), item(3, 1, 0, 0), item(4, 2, 0, 0)]]);
  const { sentinels, anomalies, unordered } = cacheSubtree(items, id(1));
  assert.deepEqual(sentinels, { index: 1, childCount: 1 });
  assert.deepEqual(unordered, [id(1)]);
  assert.deepEqual(
    anomalies.map((a) => a.what),
    ['child count'],
  );
  assert.equal(anomalies[0].id, id(1));
});

test('two siblings at one index, and a reference to an item the answer lacks, are anomalies', () => {
  const current = parseItems(CACHE_SIGNATURES.current, [[item(1, null, -1, 2), item(2, 1, 0, 0), item(3, 1, 0, 0)]]).items;
  assert.ok(cacheSubtree(current, id(1)).anomalies.some((a) => a.what === 'duplicate index'));
  const old = parseItems(CACHE_SIGNATURES.legacy, [[legacy(1, null, [2, 5]), legacy(2, 1, [])]]).items;
  const { tree, anomalies } = cacheSubtree(old, id(1));
  assert.deepEqual(tree.children.map((c) => c.id), [id(2)]);
  assert.deepEqual(anomalies, [{ what: 'missing child', id: id(1), child: id(5) }]);
});

test('a root the answer does not hold gives no tree, and a cycle ends the walk', () => {
  assert.equal(cacheSubtree([], id(1)).tree, null);
  const { items } = parseItems(CACHE_SIGNATURES.legacy, [[legacy(1, null, [2]), legacy(2, 1, [1])]]);
  const { nodes, anomalies } = cacheSubtree(items, id(1));
  assert.equal(nodes, 2);
  assert.ok(anomalies.some((a) => a.what === 'cycle'));
});

test("the state words decode to the vendor's state names, in the vendor's order", () => {
  // enabled (8), sensitive (24), showing (25), visible (30), checkable (41)
  const low = (1 << 8) | (1 << 24) | (1 << 25) | (1 << 30);
  assert.deepEqual(decodeStateWords([low >>> 0, 1 << 9]), ['enabled', 'sensitive', 'showing', 'visible', 'checkable']);
  assert.deepEqual(decodeStateWords([0, 0]), []);
});

/** An engine tree node as `get_window_state` gives it. */
const node = (n, role, children = [], extra = {}) => ({ id: id(n), role, children, ...extra });

test('a rebuilt tree equal to the engine read compares equal in every field, its roles weighed against GetRoleName', () => {
  const { items } = parseItems(CACHE_SIGNATURES.current, [[item(1, null, 0, 2, { role: 23, name: 'win', states: [1 << 8, 0] }), item(2, 1, 0, 0, { role: 62, name: 'OK' }), item(3, 1, 1, 0, { role: 39 })]]);
  const { tree } = cacheSubtree(items, id(1));
  const engine = node(1, 'frame', [node(2, 'push button', [], { name: 'OK' }), node(3, 'panel')], { name: 'win', states: ['enabled'] });
  const table = { 23: 'frame', 39: 'panel', 62: 'push button' };
  const result = compareWithTree(tree, engine, (n) => table[n] ?? null);
  assert.equal(result.equal, true);
  assert.deepEqual(result.nodes, { cache: 3, tree: 3, both: 3 });
  assert.deepEqual(result.fields, { role: 0, name: 0, description: 0, states: 0, children: 0 });
  assert.deepEqual(result.roles, [
    [23, 'frame'],
    [62, 'push button'],
    [39, 'panel'],
  ]);
});

test("a number the table names otherwise than GetRoleName, a missing node, a reordered child and another state each count where they differ", () => {
  const { items } = parseItems(CACHE_SIGNATURES.current, [[item(1, null, 0, 3, { role: 23 }), item(2, 1, 1, 0, { role: 39 }), item(3, 1, 0, 0, { role: 39, states: [1 << 12, 0] }), item(5, 1, 2, 0, { role: 39 })]]);
  const { tree } = cacheSubtree(items, id(1));
  const engine = node(1, 'frame', [node(2, 'group'), node(3, 'panel'), node(4, 'label')]);
  const result = compareWithTree(tree, engine, (n) => ({ 23: 'frame', 39: 'panel' })[n] ?? null);
  assert.equal(result.equal, false);
  assert.deepEqual(result.only, { cache: [id(5)], tree: [id(4)] });
  assert.equal(result.fields.role, 1);
  assert.equal(result.fields.states, 1);
  assert.equal(result.fields.children, 1);
  assert.ok(result.examples.some((e) => e.field === 'role' && e.id === id(2) && e.cache === 'panel' && e.tree === 'group'));
});

test('a tree that differs from the read only in its role names is the same structure, and one with a node more is not', () => {
  const { items } = parseItems(CACHE_SIGNATURES.current, [[item(1, null, 0, 1, { role: 23 }), item(2, 1, 0, 0, { role: 39 })]]);
  const table = (n) => ({ 23: 'frame', 39: 'panel' })[n] ?? null;
  const renamed = compareWithTree(cacheSubtree(items, id(1)).tree, node(1, 'application', [node(2, 'generic')]), table);
  assert.equal(renamed.equal, false);
  assert.equal(renamed.structural, true);
  const extra = parseItems(CACHE_SIGNATURES.current, [[item(1, null, 0, 1, { role: 23 }), item(2, 1, 0, 0), item(3, 1, 1, 0)]]).items;
  assert.equal(compareWithTree(cacheSubtree(extra, id(1)).tree, node(1, 'frame', [node(2, 'panel')]), table).structural, false);
});

test('the names a changing scene gives its moving parts, in tree order, from a rebuilt tree and from a read alike', () => {
  const { items } = parseItems(CACHE_SIGNATURES.current, [[item(1, null, 0, 3), item(2, 1, 0, 0, { name: 'tick 4' }), item(3, 1, 1, 0, { name: 'row 2' }), item(4, 1, 2, 0, { name: 'other' })]]);
  const pattern = /^(tick|row) \d+$/;
  assert.deepEqual(trackedNames(cacheSubtree(items, id(1)).tree, pattern), ['tick 4', 'row 2']);
  assert.deepEqual(trackedNames(node(1, 'frame', [node(2, 'label', [], { name: 'tick 4' }), node(3, 'label', [], { name: 'row 3' })]), pattern), ['tick 4', 'row 3']);
  assert.deepEqual(trackedNames(null, pattern), []);
});

test('a role number the table does not know counts as unknown, not as a match', () => {
  const { items } = parseItems(CACHE_SIGNATURES.current, [[item(1, null, 0, 0, { role: 999 })]]);
  const result = compareWithTree(cacheSubtree(items, id(1)).tree, node(1, 'frame'), () => null);
  assert.equal(result.fields.role, 1);
  assert.equal(result.unknownRoles, 1);
});

test('role collisions: one number GetRoleName names several ways is ambiguous, and the table misses are counted', () => {
  const pairs = [
    [39, 'panel'],
    [39, 'group'],
    [39, 'group'],
    [39, 'tab panel'],
    [62, 'push button'],
  ];
  const { numbers, ambiguous, tableMisses } = roleCollisions(pairs, (n) => ({ 39: 'panel', 62: 'push button' })[n] ?? null);
  assert.deepEqual(ambiguous, [39]);
  assert.equal(tableMisses, 3);
  assert.deepEqual(numbers.find((n) => n.role === 39), { role: 39, table: 'panel', names: { group: 2, panel: 1, 'tab panel': 1 } });
});

test("libatspi's role names stand for the numbers, and the sentinel past the last role names none", () => {
  assert.equal(atspiRoleName(23), 'frame');
  assert.equal(atspiRoleName(39), 'panel');
  assert.equal(atspiRoleName(61), 'text');
  assert.equal(atspiRoleName(129), 'push button menu');
  assert.equal(atspiRoleName(130), null);
  assert.equal(atspiRoleName(-1), null);
});

test('adoption: GetItems is adopted only when every family with a tree answers it whole, every comparison is exact and no role is mapped wrong', () => {
  const good = {
    answers: [
      { family: 'a', provider: true, kind: 'current', items: 10 },
      { family: 'x', provider: false, kind: null, items: null },
    ],
    comparisons: [{ what: 'a menus', equal: true }],
    roles: { tableMisses: 0, ambiguous: [] },
  };
  assert.deepEqual(adoptionReasons(good), []);
  const reasons = adoptionReasons({
    answers: [
      { family: 'gedit', provider: true, kind: null, items: null, error: 'org.freedesktop.DBus.Error.UnknownMethod' },
      { family: 'kate', provider: true, kind: 'legacy', items: 0 },
    ],
    comparisons: [{ what: 'gtk4 changing, quiet pairs', equal: false }],
    roles: { tableMisses: 13, ambiguous: [39] },
  });
  assert.equal(reasons.length, 4);
  assert.match(reasons[0], /gedit.*does not answer/);
  assert.match(reasons[1], /kate.*no items/);
  assert.match(reasons[2], /gtk4 changing, quiet pairs/);
  assert.match(reasons[3], /13 .*39/);
});

test("GTK 4's EditableText findings: the insert shown, undone by the first undo with the typed edit kept for the second, and the signals of each step", () => {
  const typedEvents = ['key-pressed', 'buffer begin-user-action', 'buffer insert-text', 'buffer changed', 'buffer end-user-action'];
  const steps = [
    { step: 'before', text: 'line' },
    { step: 'typed', text: 'qline', events: typedEvents },
    { step: 'inserted', text: 'qline INS', answer: true, events: ['buffer insert-text', 'buffer changed'] },
    { step: 'undo 1', text: 'qline' },
    { step: 'undo 2', text: 'line' },
  ];
  assert.deepEqual(editableFindings(steps, ' INS'), {
    typed: true,
    inserted: true,
    answer: true,
    undoRemovesInsert: true,
    historyKept: true,
    insertEvents: ['buffer insert-text', 'buffer changed'],
    typedEvents,
    userAction: false,
  });
  // an insert the first undo does not take back: the typed edit went instead, and the insert stays
  const lost = editableFindings([...steps.slice(0, 3), { step: 'undo 1', text: 'line INS' }, { step: 'undo 2', text: 'line INS' }], ' INS');
  assert.equal(lost.undoRemovesInsert, false);
  assert.equal(lost.historyKept, false);
  // an insert that never showed: the first undo leaving the typed text is no undo of it
  const absent = editableFindings([...steps.slice(0, 2), { step: 'inserted', text: 'qline', answer: true }, { step: 'undo 1', text: 'qline' }, { step: 'undo 2', text: 'line' }], ' INS');
  assert.equal(absent.inserted, false);
  assert.equal(absent.undoRemovesInsert, false);
  assert.equal(absent.historyKept, false);
  // an insert inside a user action, as typed input is
  const bracketed = editableFindings(steps.map((s) => (s.step === 'inserted' ? { ...s, events: ['buffer begin-user-action', 'buffer insert-text', 'buffer end-user-action'] } : s)), ' INS');
  assert.equal(bracketed.userAction, true);
  // an application that records nothing: its signals are unknown, not absent
  const unrecorded = editableFindings(steps.map(({ events, ...s }) => s), ' INS');
  assert.equal(unrecorded.insertEvents, null);
  assert.equal(unrecorded.typedEvents, null);
  assert.equal(unrecorded.userAction, null);
  assert.equal(unrecorded.historyKept, true);
});

test('a read straddles a change made between its start and its end, and only then', () => {
  const changes = [{ t: 100 }, { t: 350 }];
  assert.equal(straddles(changes, { start: 90, end: 110 }), true);
  assert.equal(straddles(changes, { start: 120, end: 340 }), false);
  assert.equal(straddles(changes, { start: 350, end: 360 }), true);
});
