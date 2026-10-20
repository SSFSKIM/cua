// The renderer of cua's own macOS engine service (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// "The service", Renderer; Interfaces, SkyshotRenderer): an engine observation (a `Skyshot`, whose nodes carry the
// engine's per-lineage tokens) becomes the text the model reads, in the vendor's grammar. The rules are
// docs/doperpowers/research/2026-10-18-own-native-engine/sky-behaviour.md §5–§8 (cited `[B §n]`), from F-helper-logic.md
// §2–§3 (`[F §n]`) and E-helper-catalogue.md §5 (`[E §n]`); where a rule was settled by the recorded vendor text rather
// than read in the vendor's code, it says `[golden]` (test/native-goldens/, PROVENANCE.md).
//
// Pure: every export is a function of its arguments. The pipeline per observation:
//   1. the vendor's thirteen transformations over the Skyshot's tree, in pipeline order [B §5], keeping each surviving
//      node's token (`present`);
//   2. the numbering: indexes over the surviving tokens (`advanceNumbering`, below);
//   3. the lines: `<tabs><index> <role word> (<flags>) <parts>`, the header and the trailer [B §6–§7] (`render`), or the
//      diff against the previous observation (`./diff.mjs`).
//
// THE NUMBERING (the shape the service keeps per (connection, app) and passes in; decided in the spec's M1a pre-flight
// entry, item 3):
//
//   Numbering = {lineage: string, indexes: Map<token, index>, next: number}   (frozen; never mutated)
//
//   lineage  the Skyshot lineage it numbers. A Skyshot of another lineage (a new connection, `disableDiff`, an engine
//            restart) starts a fresh numbering from 0.
//   indexes  the index of every token the latest observation rendered (live tokens only). The model's index i names
//            the token t with indexes.get(t) === i.
//   next     the next index never issued in this lineage. An index below `next` that no live token holds is retired:
//            it is never issued again in the lineage (cua's departure from the vendor's reuse above the surviving
//            maximum [B §8]), so the service answers it "The element ID is no longer valid…", and an index at or above
//            `next` "<n> is an invalid element ID" (`indexState`).
//
//   advanceNumbering(previous | null, skyshot) → the numbering of `skyshot`: in preorder over the rendered tree (then
//   the trailer's elements that the tree does not print), a token the previous numbering of the same lineage held
//   keeps its index; every other token takes `next`, `next + 1`, …; a token absent from this observation is retired
//   with its index. A token retired and seen again later is a new element to the model and takes a new index.
//
// The service's sequence per observation (M1a.5):
//   const numbering = advanceNumbering(state?.numbering ?? null, skyshot);
//   const text = state && !disableDiff ? diff(state, {skyshot, numbering}) : render(skyshot, numbering);
//   state = {skyshot, numbering};   // every observation advances the baseline [B §9]
//
// The menu bar: the Skyshot's `menuBar` carries the engine's AXMenuBar node and, under it, the top-level items the
// vendor keeps (the engine leaves out the Apple menu and any titled `Debug`); the vendor prints that element after the
// window's tree, numbered like any other, with its items' actions cleared (`addMenuBarWithImmediateItems` 0x1007569b8).

// The vendor's selection note [E §5.1], the first of its two variants (they print identically).
export const NOTE = 'Note: Pay special attention to the content selected by the user. If the user asks a question or refers to the content they are looking at on-screen, they might be referring to the selected content (but they might be referring to something else that\'s visible, too).';

// ---------------------------------------------------------------------------------------------------------------------
// Numbering.

export function advanceNumbering(previous, skyshot) {
  const continuing = previous != null && previous.lineage === skyshot.lineage;
  const indexes = new Map();
  let next = continuing ? previous.next : 0;
  for (const token of presentedTokens(present(skyshot))) {
    if (indexes.has(token)) continue;
    const kept = continuing ? previous.indexes.get(token) : undefined;
    indexes.set(token, kept ?? next++);
  }
  return Object.freeze({lineage: skyshot.lineage, indexes, next});
}

// What an index the model sent names in a numbering: {state: 'live', token}, {state: 'retired'} (issued in this
// lineage and gone since) or {state: 'invalid'} (never issued).
export function indexState(numbering, index) {
  if (!Number.isInteger(index) || index < 0 || index >= numbering.next) return {state: 'invalid'};
  for (const [token, held] of numbering.indexes) if (held === index) return {state: 'live', token};
  return {state: 'retired'};
}

// ---------------------------------------------------------------------------------------------------------------------
// Rendering.

// The full text of one observation [B §6]: the header, one line per rendered element, cua's truncation markers, then
// the trailer.
export function render(skyshot, numbering) {
  const view = layout(skyshot, numbering);
  return `${view.header}\n${[...view.lines, ...view.markers].join('\n')}\n${view.trailer}`;
}

// The numbered, rendered tree of one observation, shared with ./diff.mjs: `roots` are {index, depth, text, detailText,
// children} (text compared by the diff, detailText never [B §9]), `lines` the element lines in preorder, `nodeCount`
// their number (the diff's line budget [B §9]), `trailer` the selection or focus trailer (with its leading newline).
export function layout(skyshot, numbering) {
  const presented = present(skyshot);
  const urls = urlConfiguration(presented);
  const indexOf = token => {
    const index = numbering.indexes.get(token);
    if (index === undefined) throw new Error(`the numbering has no index for token ${token}; advance it over this Skyshot first`);
    return index;
  };
  const number = (node, depth) => ({
    index: indexOf(node.token), depth, text: lineText(node, urls), detailText: detailText(node),
    children: node.children.map(child => number(child, depth + 1)),
  });
  const roots = presented.roots.map(root => number(root, 0));
  const lines = [];
  (function visit(nodes) { for (const node of nodes) { lines.push(elementLine(node)); visit(node.children); } })(roots);
  const lineOf = node => elementLine({index: indexOf(node.token), depth: 0, text: lineText(node, urls), detailText: detailText(node)});
  return {
    title: presented.title, appName: presented.appName, header: `Window: "${presented.title}", App: ${presented.appName}.`,
    roots, lines, nodeCount: lines.length, markers: truncationMarkers(skyshot), trailer: trailer(presented, lineOf),
  };
}

// `<tabs><index> <text>[ <detailText>]` [F §2.4, §4.5].
export function elementLine({index, depth, text, detailText}) {
  return `${'\t'.repeat(depth)}${index} ${text}${detailText ? ` ${detailText}` : ''}`;
}

// cua's own markers for the engine's caps (the vendor has none) [B §4; Design, Observation].
function truncationMarkers(skyshot) {
  const out = [];
  if (skyshot.truncated?.depth != null) out.push(`[truncated: elements deeper than ${skyshot.truncated.depth} levels omitted]`);
  if (skyshot.truncated?.count) out.push(`[truncated: ${skyshot.truncated.count} elements omitted]`);
  return out;
}

// The trailer's precedence: selected text, else selected elements, else the focused element [B §6]. Selected element
// lines carry one tab [golden: Finder]; a blank line then the note follows selected elements [golden: Finder]. The same
// blank line before the note after selected text is an inference: no golden has selected text, F §2.6 reads both
// branches ending "then the note" in the one function, and the one branch pinned shows the blank line (B §6's block,
// without it, is labelled a reading for the goldens to pin).
function trailer(presented, lineOf) {
  if (presented.selectedText) return `\nSelected text: \`\`\`\n${presented.selectedText}\n\`\`\`\n\n${NOTE}`;
  if (presented.selected.length) return `\nSelected:\n${presented.selected.map(node => `\t${lineOf(node)}`).join('\n')}\n\n${NOTE}`;
  if (presented.focused) return `\nThe focused UI element is ${lineOf(presented.focused)}`;
  return '';
}

// ---------------------------------------------------------------------------------------------------------------------
// The presented tree: the Skyshot's nodes after the transformations, memoized per Skyshot object (the numbering and the
// rendering of one observation both need it).

const presentations = new WeakMap();

export function present(skyshot) {
  let presented = presentations.get(skyshot);
  if (!presented) presentations.set(skyshot, presented = presentUncached(skyshot));
  return presented;
}

function presentUncached(skyshot) {
  const context = {bundleIdentifier: skyshot.app?.bundleIdentifier ?? null, catalyst: skyshot.app?.catalyst === true};
  const roots = forest(skyshot.nodes ?? [], context).flatMap(root => transform(root, context));
  roots.push(...menuBar(skyshot.menuBar ?? [], context));
  const inTree = new Map();
  (function visit(nodes) { for (const node of nodes) { if (!inTree.has(node.token)) inTree.set(node.token, node); visit(node.children); } })(roots);
  const raw = new Map([...(skyshot.nodes ?? []), ...(skyshot.menuBar ?? [])].map(node => [node.token, node]));
  // A trailer element the tree does not print (pruned, or merged away) is rendered from its own attributes [B §6,
  // focus-only node].
  const resolve = token => inTree.get(token) ?? (raw.has(token) ? {...element(raw.get(token), context), children: []} : null);
  const selected = (skyshot.selectedElements ?? []).map(resolve).filter(Boolean);
  return {
    title: skyshot.window?.title ?? 'Unknown', appName: skyshot.app?.displayName ?? 'Unknown', roots,
    selectedText: typeof skyshot.selectedText === 'string' && skyshot.selectedText !== '' ? skyshot.selectedText : null,
    selected, focused: skyshot.focused == null ? null : resolve(skyshot.focused),
  };
}

// Tokens in numbering order: the tree in preorder, then trailer elements outside it.
function presentedTokens(presented) {
  const tokens = [];
  (function visit(nodes) { for (const node of nodes) { tokens.push(node.token); visit(node.children); } })(presented.roots);
  for (const node of [...presented.selected, presented.focused]) if (node) tokens.push(node.token);
  return tokens;
}

// The Skyshot's preorder node list (each with its depth) as a tree.
function forest(nodes, context) {
  const roots = [], open = [];
  for (const raw of nodes) {
    const node = element(raw, context);
    while (open.length && open.at(-1).depth >= raw.depth) open.pop();
    (open.length ? open.at(-1).node.children : roots).push(node);
    open.push({depth: raw.depth, node});
  }
  return roots;
}

// A working copy of one Skyshot node. A text area's value is its Markdown rendering when the engine fetched one
// (retrieveAttributedTextFromTextAreas [B §5]); actions pass filterActions and keep the descriptions the engine read.
function element(raw, context) {
  const markdown = raw.role === 'AXTextArea' && typeof raw.valueMarkdown === 'string' ? raw.valueMarkdown : null;
  return {
    token: raw.token, role: raw.role, subrole: raw.subrole ?? null, roleDescription: raw.roleDescription ?? null,
    title: raw.title ?? null, description: raw.description ?? null, value: markdown ?? raw.value ?? null,
    valueType: markdown != null ? 'string' : raw.valueType ?? null, identifier: raw.identifier ?? null,
    valueDescription: raw.valueDescription ?? null, placeholder: raw.placeholder ?? null, help: raw.help ?? null,
    url: raw.url ?? null, rowIndexRange: raw.rowIndexRange ?? null, columnIndexRange: raw.columnIndexRange ?? null,
    domClassList: raw.domClassList ?? null, servesAsTitleFor: raw.servesAsTitleFor ?? null, shown: raw.shown ?? null,
    flags: {...raw.flags}, actions: filterActions(raw, context), descriptions: actionDescriptions(raw), children: [],
  };
}

// The engine's description of each action, by name, when the Skyshot carries them (M0's recordings carry none).
function actionDescriptions(raw) {
  if (!Array.isArray(raw.actionDescriptions)) return null;
  return new Map((raw.actions ?? []).map((action, i) => [action, raw.actionDescriptions[i]]));
}

// The menu bar (`addMenuBarWithImmediateItems` 0x1007569b8): the engine's AXMenuBar node, printed by the ordinary line
// (with no role description, the vendor's fallback word `menu bar` [B §6]; golden: all four scenes), whose children are
// the items the engine emitted under it, each with its actions cleared, so an item prints its title and flags. A
// Skyshot without the bar's node (M0's recordings) prints its items as top-level elements.
function menuBar(nodes, context) {
  const roots = forest(nodes, context);
  for (const root of roots) {
    if (root.role !== 'AXMenuBar') continue;
    root.children = root.children.map(item => ({...item, actions: [], actionsCleared: true, children: []}));
  }
  return roots;
}

// ---------------------------------------------------------------------------------------------------------------------
// The transformations [B §5; F §2.1–2.3]. Top-down: a node runs the whole pipeline (a replacement runs it again), then
// its resulting children are transformed. → the node's replacement list (empty when removed).

function transform(node, context) {
  let current = node;
  for (;;) {
    const outcome = pipeline(current, context);
    if (outcome === null) return [];
    if (outcome.replaced) { current = outcome.replaced; continue; }
    current = outcome.node;
    break;
  }
  current.children = current.children.flatMap(child => transform(child, context));
  // An element whose line would be empty (a radio group says nothing: no role word, flags or parts) is not printed;
  // its children take its place [golden: Finder's view-mode segments, printed at the radio group's depth].
  if (lineText(current, DEFAULT_URLS) === '') return current.children;
  return [current];
}

function pipeline(node, context) {
  associateTitleUIElements(node);                                           // (0)
  flattenIntoSelectableAncestor(node);                                      // (1)
  if (prunedAsNonDescriptive(node)) return null;                            // (2)
  if (emptyAndDisabled(node)) return null;                                  // (3)
  const group = singleItemGroup(node);                                      // (4)
  if (group === 'removed') return null;
  if (group) return {replaced: group};
  flattenRedundantHierarchy(node);                                          // (5)
  flattenRepetitiveStaticText(node);                                        // (6)
  flattenLinkIntoMarkdownText(node);                                        // (7)
  mergeTextOnlySiblings(node);                                              // (8)
  removeElementsUnderCalendarEvents(node, context);                         // Mac
  return {node};
}

const nonEmpty = value => value !== null && value !== undefined && value !== '';
const descriptive = node => nonEmpty(node.description) || nonEmpty(node.value) || nonEmpty(node.title) || nonEmpty(node.placeholder) || node.role === 'AXImage';
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
const interesting = node => node.actions.some(action => action !== 'AXScrollToVisible' && action !== 'AXShowMenu');
const userInteractive = node => (node.role === 'AXStaticText' ? node.flags.focusable || node.flags.selectable
  : node.role === 'AXTextArea' || node.role === 'AXGroup' ? node.flags.focusable : true);
const stringValue = node => (typeof node.value === 'string' ? node.value : null);

// (0) A child serving as title for exactly one sibling gives that sibling its text (value, else title, else
// description) and is removed.
function associateTitleUIElements(node) {
  for (const child of [...node.children]) {
    if (child.servesAsTitleFor?.length !== 1) continue;
    const target = node.children.find(sibling => sibling !== child && sibling.token === child.servesAsTitleFor[0]);
    const text = [child.value, child.title, child.description].find(nonEmpty);
    if (!target || text === undefined) continue;
    target.title = String(text);
    node.children = node.children.filter(sibling => sibling !== child);
  }
}

// (1) A selectable, unfocused node (not a table or table row) with no settable or selectable descendant takes its
// subtree's titles, descriptions and string values, and keeps only its toggle descendants as children. The join is not
// read [B §5]; one space. The vendor's flattened role words (`radio button` / `radio buttons`, `outline row` / `rows`,
// E §5.2's "<target> <separator> <container>" reading) are not applied: B §5 and E leave their use an inference and no
// golden prints one, so the node keeps its own role word.
function flattenIntoSelectableAncestor(node) {
  if (!node.flags.selectable || node.flags.focused || node.role === 'AXTable' || node.subrole === 'AXTableRow') return;
  const below = descendants(node);
  if (below.some(child => child.flags.settable || child.flags.selectable)) return;
  const joined = key => [node, ...below].map(each => each[key]).filter(value => typeof value === 'string' && value !== '').join(' ') || null;
  node.title = joined('title');
  node.description = joined('description');
  node.value = [node, ...below].map(stringValue).filter(nonEmpty).join(' ') || null;
  node.valueType = node.value === null ? null : 'string';
  node.flags = {...node.flags, focusable: below.some(child => child.flags.focusable)};
  node.children = below.filter(child => child.valueType === 'boolean' || typeof child.value === 'boolean').map(child => ({...child, children: []}));
}

// (2) Removed unless it, or something under it, can be interacted with or says something.
function prunedAsNonDescriptive(node) {
  if (node.flags.focusable || node.flags.selectable || interesting(node)) return false;
  const below = descendants(node);
  if (descriptive(node) || below.some(descriptive)) return false;
  return !below.some(child => child.flags.focusable || child.flags.selectable || interesting(child));
}

// (3) Disabled, unfocused, childless and saying nothing.
const emptyAndDisabled = node => node.flags.enabled === false && !node.flags.focused && node.children.length === 0 && !descriptive(node);

// (4) A plain group (not selectable, not focused, saying nothing) is replaced by its only child (one without a
// partial-array marker), or removed when it has none. → the replacement, 'removed', or null.
function singleItemGroup(node) {
  if (node.role !== 'AXGroup' || node.flags.selectable || node.flags.focused || descriptive(node)) return null;
  if (node.children.length === 0) return 'removed';
  if (node.children.length === 1 && !node.children[0].shown) return node.children[0];
  return null;
}

// (5) Under a node saying nothing (not selectable, not focused), a child of the same role whose line is the node's own
// is replaced by its children. One level: a promoted grandchild is not compared again [golden: Chrome, the browser
// view's nested containers].
function flattenRedundantHierarchy(node) {
  if (node.flags.selectable || node.flags.focused || descriptive(node)) return;
  const own = lineText(node, DEFAULT_URLS);
  node.children = node.children.flatMap(child => (child.role === node.role && !child.shown && lineText(child, DEFAULT_URLS) === own ? child.children : [child]));
}

// (6) Under a node that cannot be interacted with, a child whose text the node already says is dissolved into its
// children, repeatedly.
function flattenRepetitiveStaticText(node) {
  if (node.flags.focusable || node.flags.selectable || descendants(node).some(userInteractive)) return;
  const description = typeof node.description === 'string' ? node.description : '';
  const value = stringValue(node) ?? '';
  const repeats = child => {
    const ownDescription = typeof child.description === 'string' ? child.description.trim() : '';
    const ownValue = stringValue(child)?.trim() ?? '';
    return (ownDescription !== '' && description.includes(ownDescription)) || (ownValue !== '' && value.includes(ownValue));
  };
  for (let changed = true; changed;) {
    changed = false;
    node.children = node.children.flatMap(child => (repeats(child) ? (changed = true, child.children) : [child]));
  }
}

// (7) A link with a URL becomes a `link` text whose title is its text and whose value is the URL [golden: Chrome,
// "link Scene section, Value: 127.0.0.1:…/#section"]; its children go.
function flattenLinkIntoMarkdownText(node) {
  if (node.role !== 'AXLink' || !nonEmpty(node.url)) return;
  const text = nonEmpty(node.title) ? node.title : subtreeText(node);
  Object.assign(node, {role: 'AXStaticText', roleDescription: 'link', title: text || null, value: {url: node.url}, valueType: 'string', url: null, children: []});
}

const subtreeText = node => descendants(node).map(child => [child.title, stringValue(child), child.description].find(nonEmpty)).filter(Boolean).join(' ');

// (8) Under a node that is neither selectable nor focusable, a run of text-only children (static text with a string
// value, or a leaf link with a URL) merges into its first element, links as Markdown. The join is not read [B §5]; one
// space.
function mergeTextOnlySiblings(node) {
  if (node.flags.selectable || node.flags.focusable) return;
  const textOnly = child => child.children.length === 0
    && ((child.role === 'AXStaticText' && typeof child.value === 'string' && child.value !== '') || (child.role === 'AXLink' && nonEmpty(child.url)));
  const spansOf = child => (child.role === 'AXLink' ? [{text: nonEmpty(child.title) ? child.title : '', url: child.url}] : child.value.spans ?? [{text: child.value}]);
  const merged = [];
  for (let i = 0; i < node.children.length;) {
    const child = node.children[i];
    let end = i + 1;
    while (textOnly(child) && end < node.children.length && textOnly(node.children[end])) end++;
    if (end - i > 1) merged.push({...child, role: 'AXStaticText', url: null, value: {spans: node.children.slice(i, end).flatMap(spansOf)}, valueType: 'string'});
    else merged.push(child);
    i = end;
  }
  node.children = merged;
}

// Calendar: an `Event` static text's single static-text child is cleared.
function removeElementsUnderCalendarEvents(node, {bundleIdentifier}) {
  if (bundleIdentifier === 'com.apple.iCal' && node.role === 'AXStaticText' && node.roleDescription === 'Event'
    && node.children.length === 1 && node.children[0].role === 'AXStaticText') node.children = [];
}

// filterActions [B §5]: the vendor's predicate FUN_100782c24, per action (true keeps it). AXShowDefaultUI and
// AXShowAlternateUI never show; AXCancel not in a Catalyst app (the context's isCatalyst, ApplicationUIElement.
// isCatalystApp 0x100704c88: `_AXExhibitsMacCatalystBehavior`, the engine's app.catalyst) nor on the menu bar or a menu
// item; AXPick not on a menu item; AXConfirm not on a text field; a horizontal page scroll only on an element with an
// AXHorizontalScrollBar, a vertical one only with an AXVerticalScrollBar (the engine's `scrollBars`; a Skyshot without
// it, M0's recordings, keeps them); AXIncrement and AXDecrement not on an element whose value is settable (the
// AccessibilityNode witness at +0xb8, TransformedUIElement's isValueSettable, 0x100750ffc).
function keepsAction(action, raw, {catalyst}) {
  switch (action) {
    case 'AXShowDefaultUI': case 'AXShowAlternateUI': return false;
    case 'AXCancel': return !catalyst && raw.role !== 'AXMenuBar' && raw.role !== 'AXMenuItem';
    case 'AXPick': return raw.role !== 'AXMenuItem';
    case 'AXScrollLeftByPage': case 'AXScrollRightByPage': return raw.scrollBars?.horizontal ?? true;
    case 'AXScrollUpByPage': case 'AXScrollDownByPage': return raw.scrollBars?.vertical ?? true;
    case 'AXConfirm': return raw.role !== 'AXTextField';
    case 'AXIncrement': case 'AXDecrement': return !raw.flags?.settable;
    default: return true;
  }
}
function filterActions(raw, context) {
  return (raw.actions ?? []).filter(action => keepsAction(action, raw, context));
}

// ---------------------------------------------------------------------------------------------------------------------
// The element line [B §6; F §2.4].

// `text`: the non-empty pieces of [role word, flags, parts], joined by one space.
function lineText(node, urls) {
  return [roleWord(node), flagsOf(node), parts(node, urls)].filter(Boolean).join(' ');
}

// The width rule's partial children [B §6]: `(showing <lo-hi>, … of <count> items)`, present only with ranges.
function detailText(node) {
  const ranges = node.shown?.ranges;
  if (!ranges?.length) return null;
  return `(showing ${ranges.map(([lo, hi]) => `${lo}-${hi}`).join(', ')} of ${node.shown.of} items)`;
}

// The vendor's presentation kinds [F §2.4], from the role (the vendor's role-to-kind table is not read).
function kindOf({role, subrole}) {
  if (role === 'AXRow' || subrole === 'AXTableRow' || subrole === 'AXOutlineRow') return 'row';
  return {
    AXButton: 'button', AXCheckBox: 'checkBox', AXMenu: 'menu', AXMenuBar: 'menuBar', AXMenuBarItem: 'menuBarItem',
    AXMenuButton: 'menuButton', AXMenuItem: 'menuItem', AXRadioGroup: 'radioGroup',
  }[role] ?? 'other';
}

function roleWord(node) {
  const kind = kindOf(node);
  if (kind === 'row') return 'row';
  if (kind === 'menuBarItem' || kind === 'menuItem' || kind === 'radioGroup') return '';
  // The vendor's `element` (kind generic, no description) is not printed for any role these rules know: AXUnknown, the
  // first guess, prints its role description [golden: Finder's AXUnknown line].
  if (node.role === 'AXGroup') return 'container';
  if (nonEmpty(node.roleDescription)) return node.roleDescription;
  return kind === 'menu' ? 'menu' : kind === 'menuBar' ? 'menu bar' : 'unknown';
}

// `(selectable, selected, disabled, expanded|collapsed, settable[, <type>], sent by me)` [B §6].
function flagsOf(node) {
  const {flags} = node, out = [];
  if (flags.selectable && !flags.selected) out.push('selectable');
  if (flags.selected) out.push('selected');
  if (flags.enabled === false && node.role !== 'AXGroup' && node.role !== 'AXStaticText') out.push('disabled');
  if (flags.disclosable) out.push(flags.expanded ? 'expanded' : 'collapsed');
  if (flags.settable) {
    const type = valueTypeName(node);
    out.push(type === 'string' ? 'settable' : `settable, ${type}`);
  }
  if (node.domClassList?.includes('is-sender')) out.push('sent by me');
  return out.length ? `(${out.join(', ')})` : '';
}

// The vendor's six type names, float, integer, boolean, string, date or unknown (valueTypeName, FUN_10074a794), as the
// engine names them. M0's recordings name a CFNumber "number", which is split by the value.
const VALUE_TYPES = new Set(['float', 'integer', 'boolean', 'string', 'date', 'unknown']);
function valueTypeName({valueType, value}) {
  if (VALUE_TYPES.has(valueType)) return valueType;
  if (typeof value === 'boolean') return 'boolean';
  if (valueType === 'number' || typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'float';
  return 'string';
}

const LONG_PART = 100;   // characters; a part this long, or with a newline, prints after the short ones [B §6]

// The details: title (bare), then the labelled parts in the vendor's order; a repeated value skipped, long parts last,
// a lone part (not Secondary Actions) printed without its label [B §6].
function parts(node, urls) {
  const candidates = [
    [null, node.title], ['Description', node.description], ['Rows', range(node.rowIndexRange)], ['Columns', range(node.columnIndexRange)],
    ['URL', nonEmpty(node.url) ? shortenUrl(node.url, urls) : null], ['Help', node.help], ['Value', valueText(node.value, urls)],
    ['Details', node.valueDescription], ['Placeholder', node.placeholder],
    ['ID', typeof node.identifier === 'string' && !/^(_|NS)/.test(node.identifier) ? node.identifier : null],
    ['Secondary Actions', secondaryActions(node).join(', ')],
  ];
  const seen = new Set(), kept = [];
  for (const [label, value] of candidates) {
    if (!nonEmpty(value)) continue;
    const text = String(value);
    if (seen.has(text)) continue;
    seen.add(text);
    kept.push({label, text});
  }
  const long = part => part.text.length >= LONG_PART || part.text.includes('\n');
  const ordered = [...kept.filter(part => !long(part)), ...kept.filter(long)];
  if (ordered.length === 1 && ordered[0].label !== 'Secondary Actions') return ordered[0].text;
  return ordered.map(part => (part.label ? `${part.label}: ${part.text}` : part.text)).join(', ');
}

// `a-b`, only when lower < upper [B §6], over the closed range the vendor holds: the Skyshot carries the CFRange's
// half-open bounds [location, location + length] (M1a.1's Fetch.swift), so a span of one row or column (a plain table
// cell) prints nothing [golden: Finder's cells, none of which prints Rows or Columns] and a span of n > 1 prints
// `location-(location + n - 1)`.
const range = pair => (Array.isArray(pair) && pair.length === 2 && pair[1] - pair[0] > 1 ? `${pair[0]}-${pair[1] - 1}` : null);

// A value as the vendor prints it: a number as NSNumber describes it (%.16g) [golden: TextEdit's ruler markers], a
// Boolean as on/off [golden: Chrome's tab, "on"], a link's URL shortened, merged text with its links as Markdown.
function valueText(value, urls) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'object' && 'url' in value) return shortenUrl(value.url, urls);
  if (typeof value === 'object' && Array.isArray(value.spans)) {
    return value.spans.map(span => {
      if (!span.url) return span.text;
      const url = shortenUrl(span.url, urls);
      return url === null ? span.text : `[${span.text.replace(/[[\]]/g, match => `\\${match}`)}](${url})`;
    }).join(' ');
  }
  return String(value);
}

// C's %.16g, which NSNumber's description uses: 16 significant digits, trailing zeros dropped, exponent form below
// 1e-4 and from 1e16.
export function formatNumber(number) {
  if (!Number.isFinite(number)) return String(number);
  if (number === 0) return '0';
  const [mantissa, exponentText] = number.toExponential(15).split('e');
  const exponent = Number(exponentText);
  const trim = digits => (digits.includes('.') ? digits.replace(/0+$/, '').replace(/\.$/, '') : digits);
  if (exponent < -4 || exponent >= 16) return `${trim(mantissa)}e${exponent < 0 ? '-' : '+'}${String(Math.abs(exponent)).padStart(2, '0')}`;
  return trim(number.toFixed(15 - exponent));
}

// The vendor describes an action by the first of (FUN_1007816a0): a fixed English word (FUN_100783260, its statics at
// 0x1014033e8; so AXRaise prints `Raise` on the Korean mini too [golden]), a custom action's `Name:` (FUN_100783928),
// the system's description (AXUIElementCopyActionDescription, localized to the Mac's language: `zoom the window` in
// TextEdit, `윈도우 확대/축소` in Chrome on the Korean mini), else the action's name (FUN_1007515a8). The engine asks the
// system only past the first two and carries the answer in the Skyshot's `actionDescriptions`. A Skyshot without them
// (M0's recordings) prints the AX name split into words instead (`Zoom Window`, a declared difference in the goldens).
const ACTION_WORDS = {
  AXPress: 'Press', AXPick: 'Pick', AXIncrement: 'Increment', AXDecrement: 'Decrement', AXConfirm: 'Confirm', AXCancel: 'Cancel',
  AXShowDefaultUI: 'Show Default UI', AXShowAlternateUI: 'Show Alternate UI', AXRaise: 'Raise', AXShowMenu: 'Show Menu',
  AXScrollToVisible: 'Scroll to Visible', AXScrollLeftByPage: 'Scroll Left', AXScrollRightByPage: 'Scroll Right',
  AXScrollUpByPage: 'Scroll Up', AXScrollDownByPage: 'Scroll Down', AXDelete: 'Delete', SAIExpand: 'Expand', SAICollapse: 'Collapse',
};
// Kinds press, showMenu and scrollToVisible are not secondary [B §6]; AXPick is the vendor's click action [B §10].
const PRIMARY_ACTIONS = new Set(['AXPress', 'AXPick', 'AXShowMenu', 'AXScrollToVisible']);
const DROPPED_DESCRIPTIONS = new Set(['Add comment', 'Remove unused rows', 'Remove unused columns', 'Remove unused rows and columns']);

// The pseudo-actions SAIExpand and SAICollapse follow a disclosable element's state, last in the vendor's action order
// [E §2.1; golden: Finder's expanded sidebar sections carry one 8-character secondary action].
function secondaryActions(node) {
  if (node.actionsCleared) return [];
  const describe = action => ACTION_WORDS[action] ?? customActionName(action) ?? node.descriptions?.get(action) ?? splitName(action);
  const names = node.actions.filter(action => !PRIMARY_ACTIONS.has(action)).map(describe).filter(name => name && !DROPPED_DESCRIPTIONS.has(name));
  if (node.flags.disclosable) names.push(node.flags.expanded ? 'Collapse' : 'Expand');
  return names;
}

// FUN_100783928: an NSScanner scans `Name:` off, skips whitespace and newlines (its default), and scans up to the next
// newline; null when nothing is left.
function customActionName(action) {
  if (!action.startsWith('Name:')) return null;
  return action.slice(5).replace(/^\s+/, '').split('\n')[0] || null;
}

function splitName(action) {
  return action.replace(/^AX/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

// ---------------------------------------------------------------------------------------------------------------------
// URLs [B §7]: per URL, webdoc: and data: are not rendered, http(s):, a leading // and the host's www. go; over the
// per-URL limit, the first limit − 1 characters and `…`. Per tree, a budget of 4,000 URL characters: fragments go,
// then queries, then the per-URL limit falls from 120 to 20 in steps of 10.

const URL_BUDGET = 4000;
const DEFAULT_URLS = Object.freeze({includeFragment: true, includeQuery: true, limit: null});

export function shortenUrl(url, {includeFragment, includeQuery, limit} = DEFAULT_URLS) {
  let text = String(url);
  if (/^(webdoc|data):/i.test(text)) return null;
  if (!includeFragment) text = text.replace(/#.*$/s, '');
  if (!includeQuery) text = text.replace(/\?[^#]*/s, '');
  text = text.replace(/^https?:/i, '').replace(/^\/\//, '').replace(/^www\./i, '');
  if (limit !== null && text.length > limit) text = `${text.slice(0, limit - 1)}…`;
  return text;
}

function urlConfiguration(presented) {
  const urls = [];
  (function visit(nodes) {
    for (const node of nodes) {
      if (nonEmpty(node.url)) urls.push(node.url);
      if (node.value && typeof node.value === 'object') {
        if ('url' in node.value) urls.push(node.value.url);
        else for (const span of node.value.spans ?? []) if (span.url) urls.push(span.url);
      }
      visit(node.children);
    }
  })(presented.roots);
  const total = configuration => urls.reduce((sum, url) => sum + (shortenUrl(url, configuration)?.length ?? 0), 0);
  const steps = [DEFAULT_URLS, {...DEFAULT_URLS, includeFragment: false}, {...DEFAULT_URLS, includeFragment: false, includeQuery: false}];
  for (let limit = 120; limit >= 20; limit -= 10) steps.push({includeFragment: false, includeQuery: false, limit});
  return steps.find(configuration => total(configuration) <= URL_BUDGET) ?? steps.at(-1);
}
