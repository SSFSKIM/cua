// What an application's `org.a11y.atspi.Cache.GetItems` answer says, read against the engine's per-element tree read
// (#171 M4, T6; the Design's Observation paragraph on `Cache.GetItems`). The probe (atspi-probe.mjs) asks; this file
// only reads the answers, so it is display-free and tested on its own.
//
// Two signatures are known. The current one, AT-SPI's own since at-spi2-core moved the cache to index-and-count items,
// `a((so)(so)(so)iiassusau)`: the object, its application, its parent, its index in the parent, its child count, its
// interfaces, Name, role (a number), Description and the two state words. And the legacy one, Qt's
// (`QSpiAccessibleCacheItem`), `a((so)(so)(so)a(so)assusau)`: a children list in place of the index and the count.
// Qt's introspection data advertises a third shape without the parent, which its answers do not have, so a signature
// is taken from the answer itself and any other is refused rather than guessed at.
//
// Adoption's rules (Observation) are what the comparison measures: every node of the window's subtree with the fields
// the per-element read gives (the role's name, Name, Description, the vendor's states, the children in order); the
// numbers mapped to names through a fixed table (`compareWithTree`'s `roleName`, libatspi's own on the probe's
// display), with `roleCollisions` showing where one number stands for several `GetRoleName` answers; and the -1
// sentinels, where the index in the parent or the child count is unknown and `GetChildren` would be needed anyway.

/** Where an application serves its cache. */
export const CACHE_PATH = '/org/a11y/atspi/cache';
export const CACHE_INTERFACE = 'org.a11y.atspi.Cache';

/** The two signatures a `GetItems` answer is known to carry. */
export const CACHE_SIGNATURES = {
  current: 'a((so)(so)(so)iiassusau)',
  legacy: 'a((so)(so)(so)a(so)assusau)',
};

/** `current`, `legacy`, or null for any other signature. */
export function signatureKind(type) {
  for (const [kind, signature] of Object.entries(CACHE_SIGNATURES)) if (type === signature) return kind;
  return null;
}

/** A `(so)` reference as the engine's node id (`<bus>:<path>`), or null for AT-SPI's null reference. */
const refId = ([bus, path]) => (bus === '' || path === '/org/a11y/atspi/null' ? null : `${bus}:${path}`);

/**
 * A `GetItems` answer (busctl's JSON `type` and `data`) as items: `{id, app, parent, index, childCount, children,
 * interfaces, name, role, description, states}`, with `index` and `childCount` null in a legacy answer and `children`
 * null in a current one. Refuses an answer under any other signature.
 */
export function parseItems(type, data) {
  const kind = signatureKind(type);
  if (!kind) throw new Error(`a GetItems answer under the signature ${type}, which is neither the current nor Qt's legacy one`);
  const items = data[0].map((entry) => {
    if (kind === 'current') {
      const [self, app, parent, index, childCount, interfaces, name, role, description, states] = entry;
      return { id: refId(self), app: refId(app), parent: refId(parent), index, childCount, children: null, interfaces, name, role, description, states };
    }
    const [self, app, parent, children, interfaces, name, role, description, states] = entry;
    return { id: refId(self), app: refId(app), parent: refId(parent), index: null, childCount: null, children: children.map(refId).filter(Boolean), interfaces, name, role, description, states };
  });
  return { kind, items };
}

/**
 * The subtree under `rootId`, rebuilt from the items alone: children from the parent references in index order (a
 * current answer) or from each item's children list (a legacy one). Answers `{tree, nodes, sentinels, unordered,
 * anomalies}`: `tree` null when the answer does not hold the root; `sentinels` counts the subtree's -1 indexes (the
 * root's own aside, which places it in a parent outside the subtree) and -1 child counts; `unordered` lists the parents
 * whose children's order the answer does not give (a -1 among their indexes); `anomalies` the child counts that
 * disagree with the children found, two siblings at one index, a child the answer does not hold, and a cycle.
 */
export function cacheSubtree(items, rootId) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const byParent = new Map();
  for (const i of items) {
    if (i.parent === null) continue;
    if (!byParent.has(i.parent)) byParent.set(i.parent, []);
    byParent.get(i.parent).push(i);
  }
  const sentinels = { index: 0, childCount: 0 };
  const unordered = [];
  const anomalies = [];
  const root = byId.get(rootId);
  if (!root) return { tree: null, nodes: 0, sentinels, unordered, anomalies };
  const seen = new Set();
  let nodes = 0;
  const childrenOf = (item) => {
    if (item.children) {
      const out = [];
      for (const child of item.children) {
        if (byId.has(child)) out.push(byId.get(child));
        else anomalies.push({ what: 'missing child', id: item.id, child });
      }
      return out;
    }
    const siblings = [...(byParent.get(item.id) ?? [])];
    if (siblings.some((s) => s.index === -1)) unordered.push(item.id);
    else {
      siblings.sort((a, b) => a.index - b.index);
      for (let k = 1; k < siblings.length; k++) if (siblings[k].index === siblings[k - 1].index) anomalies.push({ what: 'duplicate index', id: item.id, index: siblings[k].index });
    }
    if (item.childCount === -1) sentinels.childCount += 1;
    else if (item.childCount !== siblings.length) anomalies.push({ what: 'child count', id: item.id, count: item.childCount, found: siblings.length });
    return siblings;
  };
  const build = (item, isRoot) => {
    seen.add(item.id);
    nodes += 1;
    if (!isRoot && item.index === -1) sentinels.index += 1;
    const node = { id: item.id, role: item.role, name: item.name, description: item.description, states: item.states, interfaces: item.interfaces, children: [] };
    for (const child of childrenOf(item)) {
      if (seen.has(child.id)) {
        anomalies.push({ what: 'cycle', id: item.id, child: child.id });
        continue;
      }
      node.children.push(build(child, false));
    }
    return node;
  };
  const tree = build(root, true);
  return { tree, nodes, sentinels, unordered, anomalies };
}

/** The vendor's state names (native/linux-engine/src/tree.rs `STATE_BITS`), in its order. */
const STATE_BITS = [
  [4, 'checked'],
  [6, 'defunct'],
  [7, 'editable'],
  [8, 'enabled'],
  [10, 'expanded'],
  [11, 'focusable'],
  [12, 'focused'],
  [23, 'selected'],
  [24, 'sensitive'],
  [25, 'showing'],
  [30, 'visible'],
  [32, 'indeterminate'],
  [41, 'checkable'],
];

/** The two state words as the per-element read names them (`decode_states`). */
export function decodeStateWords([low, high]) {
  const has = (bit) => (bit < 32 ? (low >>> bit) & 1 : (high >>> (bit - 32)) & 1) === 1;
  return STATE_BITS.filter(([bit]) => has(bit)).map(([, name]) => name);
}

const preorderOf = (node, out = []) => {
  if (!node) return out;
  out.push(node);
  for (const child of node.children ?? []) preorderOf(child, out);
  return out;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const label = (s) => (typeof s === 'string' && s !== '' ? s : null);
const EXAMPLES = 12;

/**
 * The rebuilt subtree (`cacheSubtree`'s `tree`) against the engine's tree read of the same window, node by node by id:
 * `{equal, structural, nodes: {cache, tree, both}, only: {cache, tree}, fields: {role, name, description, states,
 * children}, unknownRoles, examples, roles}`; `structural` when only the role names differ. A field counts once per node where it differs: the role as `roleName(number)` names
 * it (a number it does not know counts as unknown and as a difference) against the read's `GetRoleName`, Name and
 * Description with an empty string as absent (the read omits them), the decoded states against the read's, and the
 * children's ids in order. `roles` holds each node's `[number, GetRoleName]` in the rebuilt tree's preorder.
 */
export function compareWithTree(cacheTree, engineTree, roleName) {
  const cacheNodes = preorderOf(cacheTree);
  const treeNodes = preorderOf(engineTree);
  const treeById = new Map(treeNodes.map((n) => [n.id, n]));
  const cacheIds = new Set(cacheNodes.map((n) => n.id));
  const fields = { role: 0, name: 0, description: 0, states: 0, children: 0 };
  const examples = [];
  const roles = [];
  let unknownRoles = 0;
  let both = 0;
  const differ = (field, id, cache, tree) => {
    fields[field] += 1;
    if (examples.filter((e) => e.field === field).length < EXAMPLES) examples.push({ field, id, cache, tree });
  };
  for (const c of cacheNodes) {
    const t = treeById.get(c.id);
    if (!t) continue;
    both += 1;
    roles.push([c.role, t.role]);
    const named = roleName(c.role);
    if (named === null) unknownRoles += 1;
    if (named !== t.role) differ('role', c.id, named ?? `unknown role ${c.role}`, t.role);
    if (label(c.name) !== label(t.name)) differ('name', c.id, label(c.name), label(t.name));
    if (label(c.description) !== label(t.description)) differ('description', c.id, label(c.description), label(t.description));
    const states = decodeStateWords(c.states);
    if (!same(states, t.states ?? [])) differ('states', c.id, states, t.states ?? []);
    const kids = c.children.map((k) => k.id);
    const treeKids = (t.children ?? []).map((k) => k.id);
    if (!same(kids, treeKids)) differ('children', c.id, kids, treeKids);
  }
  const only = { cache: cacheNodes.filter((n) => !treeById.has(n.id)).map((n) => n.id), tree: treeNodes.filter((n) => !cacheIds.has(n.id)).map((n) => n.id) };
  const sameNodes = only.cache.length === 0 && only.tree.length === 0;
  const equal = Object.values(fields).every((n) => n === 0) && sameNodes;
  // the same nodes in the same places with the same labels and states, whatever the table made of the role numbers
  const structural = sameNodes && Object.entries(fields).every(([field, n]) => field === 'role' || n === 0);
  return { equal, structural, nodes: { cache: cacheNodes.length, tree: treeNodes.length, both }, only, fields, unknownRoles, examples, roles };
}

/** The Names matching `pattern` in a tree's preorder (a rebuilt tree or a read): a changing scene's moving parts. */
export function trackedNames(tree, pattern) {
  return preorderOf(tree)
    .map((n) => n.name)
    .filter((name) => typeof name === 'string' && pattern.test(name));
}

/**
 * The role numbers against the names `GetRoleName` gave for them (`pairs`, `[number, name]`): each number with the
 * table's name and the names seen, how often; the numbers seen under more than one name (no table can map those), and
 * how many pairs the table names otherwise than `GetRoleName`.
 */
export function roleCollisions(pairs, table) {
  const byRole = new Map();
  for (const [role, name] of pairs) {
    if (!byRole.has(role)) byRole.set(role, { role, table: table(role), names: {} });
    const entry = byRole.get(role);
    entry.names[name] = (entry.names[name] ?? 0) + 1;
  }
  const numbers = [...byRole.values()];
  const ambiguous = numbers.filter((n) => Object.keys(n.names).length > 1).map((n) => n.role).sort((a, b) => a - b);
  const tableMisses = pairs.filter(([role, name]) => table(role) !== name).length;
  return { numbers, ambiguous, tableMisses };
}

/** Whether any change (`{t}`, ms since the epoch) was made while a read ran (`{start, end}`, the same clock). */
export function straddles(changes, span) {
  return changes.some((c) => c.t >= span.start && c.t <= span.end);
}

/**
 * libatspi's role names by number, `atspi_role_get_name` of at-spi2-core 2.52 (Ubuntu 24.04's libatspi2.0-0t64
 * 2.52.0-1build1, read through ctypes on the #171 VM, 2026-11-03): the fixed table the Observation rule's "maps numeric
 * roles to names" would use. 130 is `ATSPI_ROLE_LAST_DEFINED`, a count and no role, so it is left out. Regenerated
 * against another libatspi (give `range` its `ATSPI_ROLE_LAST_DEFINED`) by: `python3 -I -c 'import ctypes, json; f =
 * ctypes.CDLL("libatspi.so.0").atspi_role_get_name; f.restype = ctypes.c_char_p; print(json.dumps([f(i).decode() for
 * i in range(130)]))'`.
 */
export const ATSPI_ROLE_NAMES = [
  'invalid', 'accelerator label', 'alert', 'animation', 'arrow', 'calendar', 'canvas', 'check box', 'check menu item', 'color chooser',
  'column header', 'combo box', 'date editor', 'desktop icon', 'desktop frame', 'dial', 'dialog', 'directory pane', 'drawing area', 'file chooser',
  'filler', 'focus traversable', 'font chooser', 'frame', 'glass pane', 'html container', 'icon', 'image', 'internal frame', 'label',
  'layered pane', 'list', 'list item', 'menu', 'menu bar', 'menu item', 'option pane', 'page tab', 'page tab list', 'panel',
  'password text', 'popup menu', 'progress bar', 'push button', 'radio button', 'radio menu item', 'root pane', 'row header', 'scroll bar', 'scroll pane',
  'separator', 'slider', 'spin button', 'split pane', 'status bar', 'table', 'table cell', 'table column header', 'table row header', 'tearoff menu item',
  'terminal', 'text', 'toggle button', 'tool bar', 'tool tip', 'tree', 'tree table', 'unknown', 'viewport', 'window',
  'extended', 'header', 'footer', 'paragraph', 'ruler', 'application', 'autocomplete', 'editbar', 'embedded', 'entry',
  'chart', 'caption', 'document frame', 'heading', 'page', 'section', 'redundant object', 'form', 'link', 'input method window',
  'table row', 'tree item', 'document spreadsheet', 'document presentation', 'document text', 'document web', 'document email', 'comment', 'list box', 'grouping',
  'image map', 'notification', 'info bar', 'level bar', 'title bar', 'block quote', 'audio', 'video', 'definition', 'article',
  'landmark', 'log', 'marquee', 'math', 'rating', 'timer', 'static', 'math fraction', 'math root', 'subscript',
  'superscript', 'description list', 'description term', 'description value', 'footnote', 'content deletion', 'content insertion', 'mark', 'suggestion', 'push button menu',
];

/** A role number's name in libatspi's table, or null for a number it does not name. */
export const atspiRoleName = (role) => (Number.isInteger(role) && role >= 0 && role < ATSPI_ROLE_NAMES.length ? ATSPI_ROLE_NAMES[role] : null);

/**
 * Why `GetItems` cannot be adopted under the Observation rules, or `[]` when nothing stands against it: every family
 * with an accessibility provider (`provider`) must answer under a known signature (`kind`) with items, every comparison
 * of a rebuilt tree with the per-element read must be exact (`comparisons`, `{what, equal}`), and libatspi's table must
 * name every number as `GetRoleName` does (`roles`, `roleCollisions`' `tableMisses` and `ambiguous`).
 */
export function adoptionReasons({ answers, comparisons, roles }) {
  const reasons = [];
  for (const a of answers.filter((x) => x.provider)) {
    if (!a.kind) reasons.push(`${a.family} does not answer GetItems (${a.error ?? 'no answer'}), so its tree still needs the per-element read`);
    else if (!a.items) reasons.push(`${a.family} answers GetItems (the ${a.kind} signature) with no items`);
  }
  for (const c of comparisons.filter((x) => !x.equal)) reasons.push(`${c.what}: the tree rebuilt from GetItems is not the per-element read`);
  if (roles.tableMisses > 0 || roles.ambiguous.length > 0) reasons.push(`${roles.tableMisses} nodes' role numbers name another role through libatspi's table than GetRoleName does; numbers GetRoleName names several ways: ${roles.ambiguous.join(', ') || 'none'}`);
  return reasons;
}

/**
 * What GTK 4's `EditableText.InsertText` did in one text widget, from the probe's steps (`{step, text, answer?,
 * events?}`: `before`; `typed`, one key through XTEST, the control; `inserted`, the probe's `InsertText` of `insert`;
 * `undo 1` and `undo 2`, Ctrl+Z through XTEST): whether the key and the insert each showed in the text, the call's
 * answer, whether the first undo took the insert back and the second the typed key (the undo history kept), the
 * signals each edit raised in the widget, and whether the insert came inside a user action as typed input does (the
 * text buffer's `begin-user-action`, which a text view's applications and its undo grouping key on).
 */
export function editableFindings(steps, insert) {
  const at = (name) => steps.find((s) => s.step === name) ?? {};
  const before = at('before').text;
  const typed = at('typed');
  const inserted = at('inserted');
  const typedText = typed.text ?? null;
  // null where the widget records nothing (an application's own): unknown, not absent
  const insertEvents = inserted.events ?? null;
  const shown = typeof inserted.text === 'string' && inserted.text.includes(insert) && !String(typedText).includes(insert);
  // an undo takes back only an insert that showed: with none, the typed text left after it says nothing
  const undoRemovesInsert = shown && at('undo 1').text === typedText;
  return {
    typed: typeof typedText === 'string' && typedText !== before,
    inserted: shown,
    answer: inserted.answer ?? null,
    undoRemovesInsert,
    historyKept: undoRemovesInsert && at('undo 2').text === before,
    insertEvents,
    typedEvents: typed.events ?? null,
    userAction: insertEvents ? insertEvents.includes('buffer begin-user-action') : null,
  };
}
