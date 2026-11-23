// The AT-SPI probe's summary and verdict (#171 M4, T6; atspi-probe.mjs `atspiMarkdown`), from rows in the shapes its
// live steps emit: the verdict reads each answer's signature (not the row's own kind), counts an empty Qt answer and a
// comparison that is not exact against adoption, and shows what only the cache holds. Display-free.

import assert from 'node:assert/strict';
import test from 'node:test';

import { atspiMarkdown, requiredBus } from '../../scripts/linux-engine-diff/atspi-probe.mjs';

const compare = (over = {}) => ({
  equal: false,
  structural: false,
  nodes: { cache: 3, tree: 2, both: 2 },
  only: { cache: 1, tree: 0, cache_first: [{ id: ':1.3:/x', cache: { role: 'panel', index: 1, parent_child_count: 1 }, role_name: 'generic', index_in_parent: 1, listed_by_parent: false }], tree_first: [] },
  fields: { role: 2, name: 0, description: 0, states: 0, children: 1 },
  roles: [
    [23, 'application'],
    [39, 'generic'],
  ],
  ...over,
});

const rows = () => ({
  display: ':7',
  answers: [
    { kind: 'atspi-answer', family: 'gedit', source: 'at_spi', provider: true, toolkit: { toolkit: 'gtk', toolkit_version: '3.24.41' }, signature: null, items: null, error: 'Call failed: Method "GetItems" with signature "" on interface "org.a11y.atspi.Cache" doesn\'t exist' },
    { kind: 'atspi-answer', family: 'gnome-text-editor', source: 'at_spi', provider: true, toolkit: { toolkit: 'GTK', toolkit_version: '4.14.5' }, signature: 'current', type: 'a((so)(so)(so)iiassusau)', items: 66, compare: compare(), sentinels: { index: { count: 2 }, child_count: { count: 0 } } },
    { kind: 'atspi-answer', family: 'kate', source: 'x11', provider: true, signature: 'legacy', type: 'a((so)(so)(so)a(so)assusau)', advertised: 'a((so)(so)a(so)assusau)', items: 0 },
    { kind: 'atspi-answer', family: 'xterm', source: 'x11', provider: false },
  ],
  menus: [{ kind: 'atspi-menus', family: 'atspi-gtk4', menu_opened: true, signature: 'current', items: 30, compare: compare() }],
  changing: [{ kind: 'atspi-changing', family: 'atspi-gtk4', changes: 12, quiet: { pairs: 17, compared: 17, equal: 0, structural: 0, moving_same: 17 }, straddled: { pairs: 13, compared: 13, equal: 0, structural: 0, moving_same: 12 } }],
  qt: [{ kind: 'atspi-qt', family: 'atspi-qt6', toolkit: { toolkit: 'Qt', toolkit_version: '6.4.2' }, at_menu: { signature: 'legacy', items: 0, tree_nodes: 13, tree_menu_nodes: 10 }, while_changing: [0, 0] }],
  editable: [{ kind: 'atspi-editable', family: 'atspi-gtk4', mode: 'entry', control: true, control_undone: true }, { kind: 'atspi-editable', family: 'atspi-gtk4', mode: 'entry', control: false, role: 'text box', methods: ['.InsertText method isi b'], caret_set: true, steps: [{ step: 'before', text: 'a', whole_by_minus_one: '' }], findings: { answer: true, inserted: true, undoRemovesInsert: true, historyKept: true, insertEvents: ['entry changed'], typedEvents: null } }],
});

test("the verdict reads each answer's signature, and every reason against adoption is named", () => {
  const { md, reasons } = atspiMarkdown(rows());
  assert.ok(reasons.some((r) => /^gedit does not answer GetItems/.test(r)));
  assert.ok(reasons.some((r) => /^kate answers GetItems \(the legacy signature\) with no items/.test(r)));
  assert.ok(reasons.some((r) => /^atspi-qt6 \(its menu open\) answers GetItems \(the legacy signature\) with no items/.test(r)));
  assert.ok(reasons.some((r) => /gnome-text-editor's window/.test(r)));
  assert.ok(reasons.some((r) => /atspi-gtk4 changing, quiet pairs/.test(r)));
  assert.ok(!reasons.some((r) => /xterm/.test(r)), 'a family with no accessibility provider is not held against the cache');
  assert.ok(!reasons.some((r) => /atspi-answer/.test(r)), "the row's own kind is never read as a signature");
  assert.match(md.at(-1), /^\*\*Cache\.GetItems: not adopted\.\*\*/);
});

test('the summary shows the advertised signature where the answer differs, what only the cache holds, and unrecorded signals as such', () => {
  const text = atspiMarkdown(rows()).md.join('\n');
  assert.match(text, /\| kate \|[^\n]*legacy \(advertised `a\(\(so\)\(so\)a\(so\)assusau\)`\)/);
  assert.match(text, /gnome-text-editor: the cache holds 1 node\(s\) the read does not: panel \(GetRoleName generic\) at index 1 under a parent whose child count is 1, not listed by the parent's GetChildren/);
  assert.match(text, /\| atspi-gtk4 entry \| text box \| InsertText \| no \| yes \| yes \| yes \|/);
  assert.match(text, /entry changed \| not recorded \|$/m);
  assert.match(text, /\| 39 \| panel \| generic \(2\) \|/);
});

test('a menus or changing-tree row with no comparison (its scene failed, or no read was compared) is held neither for nor against the cache', () => {
  const base = rows();
  const { reasons } = atspiMarkdown({
    ...base,
    menus: [{ kind: 'atspi-menus', family: 'atspi-gtk4', failure: 'its window did not appear' }],
    changing: [
      { kind: 'atspi-changing', family: 'atspi-gtk4', failure: 'its window did not appear' },
      { kind: 'atspi-changing', family: 'atspi-gtk4-uncompared', changes: 3, quiet: { pairs: 20, compared: 0, equal: 0, structural: 0, moving_same: 0 }, straddled: { pairs: 10, compared: 0, equal: 0, structural: 0, moving_same: 0 } },
    ],
  });
  assert.ok(!reasons.some((r) => /with its menu open: the tree rebuilt/.test(r)), reasons.join('\n'));
  assert.ok(!reasons.some((r) => /changing, quiet pairs/.test(r)), reasons.join('\n'));
  // a compared row still counts: the fixture's own is not exact
  assert.ok(atspiMarkdown(base).reasons.some((r) => /atspi-gtk4 with its menu open: the tree rebuilt/.test(r)));
});

test("a scene whose process has no application on the run's accessibility bus fails by name: no cache is asked of an empty bus name", () => {
  assert.throws(() => requiredBus({ appsOf: () => [] }, { label: 'cua171-diff-t-n0-atspigtk4-menus', pid: 42 }, null), /^Error: cua171-diff-t-n0-atspigtk4-menus: no application of its process \(pid 42\) is on the run's accessibility bus/);
  assert.equal(requiredBus({ appsOf: () => [':1.7:/org/a11y/atspi/accessible/root'] }, { label: 'x', pid: 42 }, null), ':1.7');
  // a window's own AT-SPI tree names its bus
  assert.equal(requiredBus({ appsOf: () => [] }, { label: 'x', pid: 42 }, { id: ':1.9:/org/a11y/atspi/accessible/3' }), ':1.9');
});
