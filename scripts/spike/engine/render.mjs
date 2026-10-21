// The own native engine spike's stand-in renderer (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, M0
// "Spike": "a stand-in renderer in the spike's service so the measured getAXState includes rendering"; Design "The
// service", Renderer). `render(skyshot)` turns the engine's Skyshot tree into the vendor's text grammar as
// docs/doperpowers/research/2026-10-18-own-native-engine/F-helper-logic.md §2.4–2.6 reads it:
//
//   Window: "<title>", App: <name>.          (no App= line, F §2.6; title and name default to Unknown)
//   <tabs × depth><index> <roleWord> (<flags>) <parts>
//   [truncation markers]                     (cua's own: the engine's caps, which the vendor does not have)
//   then one trailer: the selected text, else the selected elements, else the focused element's line (F §2.6)
//
// The Skyshot is the Interfaces shape (spec at 25fa9b1): the window's nodes, then `menuBar` (the top-level menu-bar items,
// numbered after them in the same lineage, printed after the window's lines), `selectedElements` for the trailer, and per
// node `valueType` (the `settable, <type>` flag), `flags.disclosable` (expanded/collapsed), `rowIndexRange` and
// `columnIndexRange` (Rows/Columns), `shown` (the width rule's `(showing N of M items)`) and `domClassList` (`sent by
// me`). What a stand-in leaves out, for M1a's renderer and its goldens: the vendor's nine plus four tree
// transformations (every node the engine sends is printed, so a pruned group the vendor would drop still has its line),
// URL compaction under the 4,000-character budget, and the vendor's ranged subset text (`(showing <lo-hi>, <lo-hi> of
// N items)`; the Skyshot's `shown` carries a count, not ranges). The point is the cost and the shape of rendering, not
// its final text.

// The vendor's selection note (E §5.1, the first of its two variants).
export const NOTE = 'Note: Pay special attention to the content selected by the user. If the user asks a question or refers to the content they are looking at on-screen, they might be referring to the selected content (but they might be referring to something else that\'s visible, too).';

// Roles whose line has no role word (F §2.4: kinds menuBarItem, menuItem, radioGroup).
const WORDLESS = new Set(['AXMenuBarItem', 'AXMenuItem', 'AXRadioGroup']);
// Roles never flagged disabled (F §2.4).
const NEVER_DISABLED = new Set(['AXGroup', 'AXStaticText']);
// Actions that are not secondary (kinds press, showMenu, scrollToVisible; AXPick is the vendor's click action, F §5.1)
// and the descriptions the vendor drops.
const PRIMARY_ACTIONS = new Set(['AXPress', 'AXPick', 'AXShowMenu', 'AXScrollToVisible']);
const DROPPED_ACTIONS = new Set(['Add comment', 'Remove unused rows', 'Remove unused columns', 'Remove unused rows and columns']);
// A part is long, and printed after the short ones, from about 100 characters or with a newline (F §2.4).
const LONG = 100;

export function render(skyshot) {
  const title = skyshot.window?.title ?? 'Unknown';
  const name = skyshot.app?.displayName ?? 'Unknown';
  const lines = [...skyshot.nodes, ...(skyshot.menuBar ?? [])].map(elementLine);
  if (skyshot.truncated?.depth != null) lines.push(`[truncated: elements deeper than ${skyshot.truncated.depth} levels omitted]`);
  if (skyshot.truncated?.count) lines.push(`[truncated: ${skyshot.truncated.count} elements omitted]`);
  return `Window: "${title}", App: ${name}.\n${lines.join('\n')}\n${trailer(skyshot)}`;
}

function trailer(skyshot) {
  if (skyshot.selectedText) return `\nSelected text: \`\`\`\n${skyshot.selectedText}\n\`\`\`\n\n${NOTE}`;
  const byIndex = new Map([...skyshot.nodes, ...(skyshot.menuBar ?? [])].map(node => [node.index, node]));
  const selected = (skyshot.selectedElements ?? []).map(index => byIndex.get(index)).filter(Boolean);
  if (selected.length) return `\nSelected:\n${selected.map(node => elementLine({...node, depth: 0})).join('\n')}\n\n${NOTE}`;
  const focused = skyshot.focused == null ? null : byIndex.get(skyshot.focused);
  return focused ? `\nThe focused UI element is ${elementLine({...focused, depth: 0})}` : '';
}

// One element's line: indentation, index, the non-empty pieces of [roleWord, flags, details] joined by a space, then
// the width rule's detail text.
export function elementLine(node) {
  const pieces = [roleWord(node), flagsOf(node), details(node)].filter(Boolean);
  const shown = node.shown ? ` (showing ${node.shown.count} of ${node.shown.of} items)` : '';
  return `${'\t'.repeat(node.depth)}${node.index} ${pieces.join(' ')}${shown}`;
}

function roleWord({role, subrole, roleDescription, description}) {
  if (WORDLESS.has(role)) return '';
  if (role === 'AXRow' || subrole === 'AXTableRow' || subrole === 'AXOutlineRow') return 'row';
  if (role === 'AXGroup') return 'container';
  if (role === 'AXUnknown' && !description) return 'element';
  if (roleDescription) return roleDescription;
  return role === 'AXMenu' ? 'menu' : role === 'AXMenuBar' ? 'menu bar' : 'unknown';
}

function flagsOf({role, value, valueType: type, domClassList, flags = {}}) {
  const out = [];
  if (flags.selectable && !flags.selected) out.push('selectable');
  if (flags.selected) out.push('selected');
  if (flags.enabled === false && !NEVER_DISABLED.has(role)) out.push('disabled');
  if (flags.disclosable) out.push(flags.expanded ? 'expanded' : 'collapsed');
  if (flags.settable) {
    const name = typeName(type, value);
    out.push(name === 'string' ? 'settable' : `settable, ${name}`);
  }
  if (domClassList?.includes('is-sender')) out.push('sent by me');
  return out.length ? `(${out.join(', ')})` : '';
}

// The vendor's value type names (E §5.2): boolean, integer, float, string, from the node's valueType ("number" split by
// the value); a node without one (or a null type) reads as a string.
function typeName(type, value) {
  if (type === 'boolean') return 'boolean';
  if (type === 'number') return Number.isInteger(value) ? 'integer' : 'float';
  return 'string';
}

// `Rows: a-b` / `Columns: a-b`, only when lower < upper (F §2.4).
const range = pair => (Array.isArray(pair) && pair[0] < pair[1] ? `${pair[0]}-${pair[1]}` : null);

function details(node) {
  const parts = [];
  const add = (label, value) => {
    if (value === null || value === undefined) return;
    const text = String(value);
    if (text) parts.push({label, text});
  };
  add(null, node.title);
  add('Description', node.description);
  add('Rows', range(node.rowIndexRange));
  add('Columns', range(node.columnIndexRange));
  add('URL', node.url == null ? null : shortUrl(node.url));
  add('Help', node.help);
  add('Value', node.valueMarkdown ?? node.value);
  add('Details', node.valueDescription);
  add('Placeholder', node.placeholder);
  if (node.identifier && !/^(_|NS)/.test(node.identifier)) add('ID', node.identifier);
  const secondary = (node.actions ?? []).filter(action => !PRIMARY_ACTIONS.has(action)).map(actionName).filter(name => name && !DROPPED_ACTIONS.has(name));
  if (secondary.length) add('Secondary Actions', secondary.join(', '));

  const seen = new Set();
  const kept = parts.filter(part => (seen.has(part.text) ? false : (seen.add(part.text), true)));
  const isLong = part => part.text.length >= LONG || part.text.includes('\n');
  const ordered = [...kept.filter(part => !isLong(part)), ...kept.filter(isLong)];
  if (ordered.length === 1 && ordered[0].label !== 'Secondary Actions') return ordered[0].text;
  return ordered.map(part => (part.label ? `${part.label}: ${part.text}` : part.text)).join(', ');
}

// `AXShowDefaultUI` → `Show Default UI`; a custom action (`Name:<name>\nTarget:…`) → its name.
function actionName(action) {
  const custom = /^Name:([^\n]*)/.exec(action);
  if (custom) return custom[1];
  return action.replace(/^AX/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

// The vendor's per-URL shortening without the budget: scheme, a leading // and www. removed (F §2.5).
function shortUrl(url) {
  return String(url).replace(/^https?:/i, '').replace(/^\/\//, '').replace(/^www\./i, '');
}
