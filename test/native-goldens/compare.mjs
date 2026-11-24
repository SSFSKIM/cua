// The comparison the renderer's goldens are judged by (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// Verification system, part 3): the vendor's text and cua's, recorded on the same scene state, compared line by line,
// **literally**: element lines are matched in order (a longest common subsequence) by their index and their head (role
// word, flags and title, up to the first labelled part) with the labels of their parts; a vendor line cua lacks is
// `missing`, a cua line the vendor lacks is `added`. Each matched pair is then compared whole: its depth, and its full
// text, values and value lines included, with only what genuinely drifts between the two lanes normalized (the loopback
// page's port, DRIFT). The trailer and a diff's removed IDs are compared as text. Every difference is declared in
// ./expected.json with its cause and its exact value or count, never absorbed.
//
// Why indexes are compared, not renumbered (fail-closed): the vendor prints every free-text attribute raw, newlines
// included (the window title in the header, the role description as the role word, the title, Description, Help, Value,
// Details, Placeholder and ID parts), so after the header no line of its text is certainly an element line rather than
// the continuation of one of those, and a line renumbered away could be a value's text (`200 apples` against `300
// apples`). cua's renderer escapes those breaks (src/services/engine/render.mjs escapeLineBreaks; #526, ruling 1175),
// which the `lineBreaks` departure declares. With the two lanes numbering alike (the recorded goldens
// add no line) the comparison is exact; where a declared added or missing line or another lineage shifts the
// numbering, the shifted lines are differences in plain view: a false positive is visible, a hidden difference is not.
//
// `structural`: the scene window can carry content the harness does not own (Finder's sidebar), so both captures were
// redacted (every string not run-owned replaced by its length, ⟨n⟩; scripts/spike/engine/measure/redact.mjs). There an
// element line is matched by its diff mark, its depth, its role word when the redaction kept one (the English
// vocabulary) and the flags group after it, and a matched pair's text is compared by its length with each ⟨n⟩ counted
// as n characters: the redaction folds a localized role word, the flags and the title into one ⟨n⟩, so the length is
// what the redacted line still tells.

import {NOTE, escapeLineBreaks, selectedTextFence} from '../../src/services/engine/render.mjs';

export const LABELS = ['Secondary Actions', 'Description', 'Placeholder', 'Columns', 'Details', 'Value', 'Rows', 'Help', 'URL', 'ID'];
const LABEL_ANYWHERE = new RegExp(`(?:^|, | )(${LABELS.join('|')}): `, 'g');
const FLAG_WORDS = new Set(['selectable', 'selected', 'disabled', 'expanded', 'collapsed', 'settable', 'boolean', 'integer', 'float', 'string', 'sent by me']);
// The redaction's English role words (scripts/spike/engine/measure/redact.mjs), longest first.
const ROLE_WORDS = ['full screen button', 'disclosure triangle', 'search text field', 'minimize button', 'menu bar item', 'pop up button',
  'radio button', 'value indicator', 'close button', 'zoom button', 'scroll area', 'scroll bar', 'split group', 'static text', 'menu button',
  'text field', 'tab group', 'container', 'checkbox', 'splitter', 'element', 'toolbar', 'outline', 'heading', 'button', 'column', 'window',
  'slider', 'image', 'group', 'table', 'list', 'link', 'cell', 'text', 'row'];
// The selected-text fence is three backticks in the vendor's text and in cua's at least three (ruling 1177).
const TRAILER = /^(The focused UI element is |Selected:$|Selected text: `{3,}$)/;
// What differs between the lanes without being a rendering: each lane served the Chrome scene's page on its own port.
const DRIFT = [[/127\.0\.0\.1:\d+/g, '127.0.0.1:⟨port⟩']];

// A text as {header, items: [{mark, depth, index, rest}], trailer: {kind, text} | null, removed: string | null,
// unparsed: [line]}. Every line shaped as an element line (`<tabs><index> `, in a diff `~` or `+` first) opens an item;
// any other line continues the last item's (`rest`: its line after the index, then its continuation lines; `index`: the
// index's digits as printed, compared as text, never as a number, which would make `0200` and `200` alike). The
// numbered prefix is matched apart from the rest of the line, which may hold any character a value carries (a CR, LS
// or PS the split on LF leaves inside the line), so such a line still opens its own item. `unparsed`
// holds the lines before the first item that are none of the text's kind (a full tree read as a diff, say), which a
// comparison reports rather than drops. The trailer runs to the end and is kept whole.
export function parse(text, {kind}) {
  // A final LF ends a tree with no trailer; after a focused-element trailer it is that element's own text (a value
  // ending in a break), kept for the trailer (#526).
  const full = text.split('\n'), lines = full.slice(0, text.endsWith('\n') ? -1 : undefined);
  const header = lines.shift();
  const items = [];
  // headerTail: how many of the unparsed lines directly follow the header, before any line the parse consumed (a
  // diff's removed IDs): only those can be a window title's or app name's later lines.
  const out = {header, items, trailer: null, removed: null, unparsed: [], headerTail: 0};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (TRAILER.test(line) && (i === 0 || lines[i - 1] === '' || kind === 'diff')) {
      const last = items.at(-1);
      if (last && lines[i - 1] === '') last.rest = last.rest.replace(/\n$/, '');
      out.trailer = parseTrailer(line.startsWith('The focused UI element is ') ? full.slice(i + 1) : lines.slice(i));
      break;
    }
    const removed = /^Removed element IDs: (.*)$/.exec(line);
    if (removed && kind === 'diff' && !items.length && out.removed === null) { out.removed = removed[1]; continue; }
    const match = (kind === 'diff' ? /^([~+])(\t*)(\d+) ([^]*)$/ : /^()(\t*)(\d+) ([^]*)$/).exec(line);
    if (match) items.push({mark: match[1], depth: match[2].length, index: match[3], rest: match[4]});
    else if (items.length) items.at(-1).rest += `\n${line}`;   // a multi-line value's continuation
    else { out.unparsed.push(line); if (out.removed === null) out.headerTail++; }
  }
  return out;
}

const TRAILER_KINDS = [['focused', 'The focused UI element is '], ['selected', 'Selected:'], ['selectedText', 'Selected text: ']];
const parseTrailer = lines => ({kind: TRAILER_KINDS.find(([, start]) => lines[0].startsWith(start))[0], text: lines.join('\n')});

// An element line's matching form: {role, flags, title, labels}.
export function normalize(rest, {structural = false} = {}) {
  const first = rest.split('\n')[0];
  if (structural) return normalizeStructurally(first);
  LABEL_ANYWHERE.lastIndex = 0;
  const labels = [], starts = [];
  for (let match; (match = LABEL_ANYWHERE.exec(first));) { labels.push(match[1]); starts.push(match.index); }
  const head = starts.length ? first.slice(0, starts[0]) : first;
  const flagged = /^(.*?) ?\(([^()]*)\)(?: (.*))?$/.exec(head);
  if (flagged && flagged[2].split(', ').every(word => FLAG_WORDS.has(word))) {
    return {role: flagged[1], flags: flagged[2].split(', '), title: flagged[3] ?? '', labels};
  }
  return {role: null, flags: [], title: head, labels};
}

function normalizeStructurally(first) {
  const role = ROLE_WORDS.find(word => first === word || first.startsWith(`${word} `)) ?? null;
  const tail = role ? first.slice(role.length) : first;
  const group = (role ? /^ \(([^()]*)\)/ : /^\(([^()]*)\)/).exec(tail);
  const flags = group && group[1].split(', ').every(word => FLAG_WORDS.has(word)) ? group[1].split(', ') : [];
  return {role: role ?? '⟨⟩', flags, title: '', labels: []};
}

// Exported for the goldens recorder (scripts/native-matrix/goldens-device.mjs), which compares two of cua's own
// renderings of the scene's fixed state across a restart, where the page's port drifts the same way.
export const normalizeDrift = text => DRIFT.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
const textOf = (rest, structural) => (structural ? rest : normalizeDrift(rest));
const lengthOf = text => [...text.replace(/⟨(\d+)⟩/g, (_, n) => 'x'.repeat(Number(n)))].length;

// An element line's head, as a declaration names it: diff mark, role word, flags and title, then ` | ` and the labels.
// `rest` is the item's text as compared (the vendor's with its breaks escaped under the lineBreaks departure).
function headOf(item, structural, rest = item.rest) {
  const line = normalize(rest, {structural});
  const head = line.role === null ? line.title : [line.role, line.flags.length ? `(${line.flags.join(', ')})` : '', line.title].filter(Boolean).join(' ');
  return `${structural ? `${item.depth}:` : ''}${item.mark}${normalizeDrift(head)} | ${line.labels.join(', ')}`;
}

// The longest common subsequence of two key lists, as pairs of positions.
function matchInOrder(a, b) {
  const table = Array.from({length: a.length + 1}, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const pairs = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; } else if (table[i + 1][j] >= table[i][j + 1]) i++; else j++;
  }
  return pairs;
}

// A declared part difference applied to cua's line: `<label>: <cua>` becomes `<label>: <vendor>`, or goes (with its
// separator) when `vendor` is null.
function applyPart(text, {label, cua, vendor}) {
  const part = `${label}: ${cua}`;
  if (!text.includes(part)) return null;
  if (vendor !== null) return text.replace(part, `${label}: ${vendor}`);
  return text.includes(`, ${part}`) ? text.replace(`, ${part}`, '') : text.replace(part, '').replace(/, $/, '');
}

// The one vendor defect a golden declares (`kind: "subsetCount"`, fault "vendor"): the vendor's `(showing <ranges> of
// <N> items)` counts the element's childCount (availableSubsetDescription 0x10063e220, through get_childCount
// 0x10079e94c) over the hierarchy its prefetch read with _AXUIElementCopyHierarchy and AXChildren capped at
// MaxArrayCount 100 (docs/doperpowers/research/2026-10-18-own-native-engine/F-helper-logic.md §1 item 1), so it never
// exceeds 100; cua prints the true count, which tells a model the list goes on. Only that N may differ: the count is the
// one the renderer appends at the end of the element's line (src/services/engine/render.mjs elementLine; any
// count-shaped text before it is the element's own text), everything before it is equal on both sides and ends with
// the rule's whole `ID: <identifier>` (after the role word or after `, `), the visible ranges are the same, the
// vendor's N is min(cua's N, cap) and cua's N is above the cap. -> cua's line with the vendor's N, or null.
const SUBSET = / \(showing ([\d, -]+) of (\d+) items\)$/;
function applySubsetCount(vendorLine, cuaLine, {identifier, cap}) {
  const v = SUBSET.exec(vendorLine), c = SUBSET.exec(cuaLine);
  if (!v || !c || v[1] !== c[1]) return null;
  const head = cuaLine.slice(0, c.index);
  if (head !== vendorLine.slice(0, v.index) || !(head === `ID: ${identifier}` || head.endsWith(` ID: ${identifier}`))) return null;
  const vendorN = Number(v[2]), cuaN = Number(c[2]);
  if (!(cuaN > cap) || vendorN !== Math.min(cuaN, cap)) return null;
  return `${head} (showing ${c[1]} of ${vendorN} items)`;
}

// A vendor trailer as cua prints it (the lineBreaks departure, rulings 1175 and 1177): the focused element's line with its
// breaks escaped; each selected element's line escaped, the boundaries between them and before the note kept; the
// selected text raw in the fence cua gives it. -> the text, or the vendor's own when its shape is not the trailer's.
function asCuaTrailer({kind, text}) {
  if (kind === 'focused') return escapeLineBreaks(text);
  const tail = `\n\n${NOTE}`;
  if (!text.endsWith(tail)) return text;
  const body = text.slice(0, -tail.length);
  if (kind === 'selected') {
    const lines = body.split('\n').slice(1), elements = [];
    for (const line of lines) { if (/^\t\d+ /.test(line) || !elements.length) elements.push(line); else elements[elements.length - 1] += `\n${line}`; }
    return `Selected:\n${elements.map(escapeLineBreaks).join('\n')}${tail}`;
  }
  const open = /^Selected text: (`{3,})\n/.exec(body);
  if (!open || !body.endsWith(`\n${open[1]}`)) return text;
  const selected = body.slice(open[0].length, -(open[1].length + 1)), fence = selectedTextFence(selected);
  return `Selected text: ${fence}\n${selected}\n${fence}${tail}`;
}

// → {differences: [{kind, …}], added, lines, lineBreaks (the lines and trailers the departure below made equal)}.
// `declared`: the entries of ./expected.json for this golden: `missing` and `added` lines by head, `part` differences
// inside a matched line, the `header` and the `trailer` (each pinned to both sides' exact text), the vendor's capped
// `subsetCount`, each `count` times exactly (default 1); and `lineBreaks`, cua's departure of printing an attribute's
// line breaks escaped where the vendor prints them raw (#526, ruling 1175) and fencing the selected text with more
// backticks than it holds (#552, ruling 1177), a rule with no count that is never over-declared. Under it each vendor
// item is keyed and compared by its text with its breaks escaped (its index, depth and the parse's boundaries kept), and
// the header and every trailer by their text as cua prints them (asCuaTrailer); it holds only on exact equality, so a
// redacted line, compared by length otherwise, takes it only where its visible text matches whole.
export function compare(vendorText, cuaText, {kind = 'full', structural = false, declared: rules = []} = {}) {
  const declared = rules.map(rule => ({...rule, left: rule.count ?? 1}));
  const vendor = parse(vendorText, {kind}), cua = parse(cuaText, {kind});
  const escapesBreaks = declared.some(rule => rule.kind === 'lineBreaks');
  // Under the departure, a vendor item is keyed and compared by its text with its breaks escaped: its index, depth and
  // the item boundaries the parse found stay as they are.
  const asCua = text => (escapesBreaks ? escapeLineBreaks(text) : text);
  const vendorHeads = vendor.items.map(item => headOf(item, structural, asCua(item.rest))), cuaHeads = cua.items.map(item => headOf(item, structural));
  // Matched by index and head: an index is never renumbered away (the top of this file).
  const pairs = matchInOrder(vendor.items.map((item, i) => `${item.index} ${vendorHeads[i]}`), cua.items.map((item, j) => `${item.index} ${cuaHeads[j]}`));
  const differences = [];
  const allow = (kindName, test) => {
    const rule = declared.find(each => each.kind === kindName && each.left > 0 && test(each));
    if (rule) rule.left--;
    return Boolean(rule);
  };

  // Two texts alike: exactly, or (redacted) by length. The departure is taken only on exact equality: a redacted
  // line's length cannot show where its breaks were, so there it holds only where the visible text matches whole.
  const same = (a, b) => (structural ? lengthOf(a) === lengthOf(b) : a === b);
  const matchedVendor = new Set(pairs.map(([i]) => i)), matchedCua = new Set(pairs.map(([, j]) => j));
  vendorHeads.forEach((head, i) => {
    if (!matchedVendor.has(i) && !allow('missing', rule => rule.head === head)) differences.push({kind: 'missing', head, index: vendor.items[i].index, line: vendor.items[i].rest});
  });
  let added = 0;
  cuaHeads.forEach((head, j) => {
    if (matchedCua.has(j)) return;
    added++;
    if (!allow('added', rule => rule.head === head)) differences.push({kind: 'added', head, index: cua.items[j].index, line: cua.items[j].rest});
  });

  const parts = declared.filter(rule => rule.kind === 'part'), subsets = declared.filter(rule => rule.kind === 'subsetCount');
  let lineBreaks = 0;   // the lines, headers and trailers the lineBreaks departure made equal
  for (const [i, j] of pairs) {
    const v = vendor.items[i], c = cua.items[j];
    if (v.depth !== c.depth) differences.push({kind: 'depth', line: v.rest, vendor: v.depth, cua: c.depth});
    const raw = textOf(v.rest, structural), escaped = asCua(raw);
    // Where the vendor's text holds a break, only its escaped form is cua's: cua printing it raw is a difference.
    const required = escaped !== raw;
    let cuaLine = textOf(c.rest, structural);
    if (required ? escaped === cuaLine : same(raw, cuaLine)) { if (required) lineBreaks++; continue; }
    // The declared part and subset differences, on the vendor's text as cua must print it.
    const vendorLine = escaped;
    const applied = [];
    for (const rule of subsets) {
      const next = rule.left > 0 ? applySubsetCount(vendorLine, cuaLine, rule) : null;
      if (next !== null) { cuaLine = next; applied.push(rule); break; }
    }
    for (const rule of parts) {
      const next = rule.left > 0 ? applyPart(cuaLine, rule) : null;
      if (next !== null) { cuaLine = next; applied.push(rule); }
    }
    if (applied.length && (required ? vendorLine === cuaLine : same(vendorLine, cuaLine))) { for (const rule of applied) rule.left--; if (required) lineBreaks++; }
    else differences.push({kind: 'text', vendor: v.rest, cua: c.rest});
  }

  // A header the redaction replaced whole is compared by its length. Under the departure a vendor header whose window
  // title or app name held a break is its first line and the lines before the first element, escaped, compared exactly.
  const redactedWhole = /^⟨(\d+)⟩$/.exec(vendor.header);
  const headerOf = text => (structural ? text.replace(/App: .*\.$/, 'App: ⟨⟩.').replace(/⟨\d+⟩/g, '⟨⟩') : text);
  let sameHeader = structural && redactedWhole ? Number(redactedWhole[1]) === [...cua.header].length : headerOf(vendor.header) === headerOf(cua.header);
  if (escapesBreaks) {
    // Only the lines right after the header, before any line the parse consumed, can continue it; and where the
    // vendor's header holds a break, only its escaped form is cua's.
    const tail = vendor.unparsed.slice(0, vendor.headerTail), whole = [vendor.header, ...tail].join('\n'), own = escapeLineBreaks(vendor.header);
    if (tail.length && !cua.unparsed.length && escapeLineBreaks(whole) === cua.header) { sameHeader = true; lineBreaks++; vendor.unparsed = vendor.unparsed.slice(tail.length); }
    else if (own !== vendor.header) { sameHeader = own === cua.header; if (sameHeader) lineBreaks++; }
  }
  if (!sameHeader && !allow('header', rule => rule.vendor === vendor.header && rule.cua === cua.header)) {
    differences.push({kind: 'header', vendor: vendor.header, cua: cua.header});
  }

  // The trailer, whole: its kind and its text, the elements it names by their indexes; under the departure, the
  // vendor's as cua prints it (asCuaTrailer), compared exactly.
  // Where the vendor's trailer needs an escape or a longer fence, only that form is cua's.
  const requiredTrailer = escapesBreaks && vendor.trailer ? asCuaTrailer(vendor.trailer) : null;
  let sameTrailer;
  if (requiredTrailer !== null && requiredTrailer !== vendor.trailer.text) {
    sameTrailer = Boolean(cua.trailer) && vendor.trailer.kind === cua.trailer.kind && textOf(requiredTrailer, structural) === textOf(cua.trailer.text, structural);
    if (sameTrailer) lineBreaks++;
  } else {
    sameTrailer = !vendor.trailer || !cua.trailer ? vendor.trailer === cua.trailer
      : vendor.trailer.kind === cua.trailer.kind && same(textOf(vendor.trailer.text, structural), textOf(cua.trailer.text, structural));
  }
  if (!sameTrailer && !allow('trailer', rule => rule.vendor === (vendor.trailer?.text ?? null) && rule.cua === (cua.trailer?.text ?? null))) {
    differences.push({kind: 'trailer', vendor: vendor.trailer?.text ?? null, cua: cua.trailer?.text ?? null});
  }
  if (vendor.unparsed.length || cua.unparsed.length) differences.push({kind: 'unparsed', vendor: vendor.unparsed, cua: cua.unparsed});
  // A diff's removed IDs, as the two previous trees' indexes.
  if (kind === 'diff' && vendor.removed !== cua.removed) differences.push({kind: 'removed', vendor: vendor.removed, cua: cua.removed});

  for (const rule of declared) {
    if (['missing', 'added', 'part', 'header', 'trailer', 'subsetCount'].includes(rule.kind) && rule.left !== 0) {
      differences.push({kind: 'overdeclared', rule: rule.kind, head: rule.head ?? rule.label ?? rule.identifier ?? null, left: rule.left});
    }
  }
  return {differences, added, lines: cua.items.length, lineBreaks};
}

// The engine-side differences a golden declares (./expected.json, `kind: "skyshot"`), applied to a copy of cua's
// Skyshot before it is rendered for the comparison, so the comparison judges the renderer and each engine difference is
// named once, with its cause, instead of in every line it touches. The pinned rendering (cua.txt) is always of the
// Skyshot as recorded.
export const CORRECTIONS = {
  // flags.disclosable only where the element is expanded (no vendor line prints `collapsed`).
  disclosableWhenExpanded: node => (node.flags.disclosable && !node.flags.expanded ? {...node, flags: {...node.flags, disclosable: false}} : node),
  // flags.settable in a Chromium window only where the vendor reads it (FUN_100751614; the engine's
  // readsValueSettability): the roles a rule names, and a tab (AXRadioButton, subrole AXTabButton).
  chromiumSettable: (node, {roles}) => (node.flags.settable && !roles.includes(node.role) && !(node.role === 'AXRadioButton' && node.subrole === 'AXTabButton')
    ? {...node, flags: {...node.flags, settable: false}} : node),
  // A numeric value's type as the element's CFNumber carried it, by role.
  valueType: (node, {roles, valueType}) => (roles.includes(node.role) && node.valueType === 'number' ? {...node, valueType} : node),
  // The identifiers the vendor drops by their `_`/`NS` prefix, which the redaction hid (each replaced by its length):
  // the elements named by token, per lineage.
  hiddenIdentifier: (node, {tokens}, shot) => (tokens[shot.lineage]?.includes(node.token) ? {...node, identifier: null} : node),
  // The window element's URL (its document).
  windowUrl: (node, {url}) => (node.role === 'AXWindow' && node.depth === 0 ? {...node, url} : node),
  // flags.selectable never on the roles a rule names (menu and menu-bar items).
  notSelectableRoles: (node, {roles}) => (node.flags.selectable && roles.includes(node.role) ? {...node, flags: {...node.flags, selectable: false}} : node),
};

// Corrections of the Skyshot as a whole.
export const SHOT_CORRECTIONS = {
  // The menu bar as the engine now emits it, which the recordings lack: the AXMenuBar element (no role description)
  // leading the items, which sit one level under it, the first (the Apple menu, never read into a node) left out.
  menuBarElement: (shot, {token}) => (shot.menuBar.length && shot.menuBar[0].role !== 'AXMenuBar'
    ? {...shot, menuBar: [{token, depth: 0, pid: shot.app.pid, role: 'AXMenuBar', subrole: null, roleDescription: null, title: null,
        description: null, value: null, valueType: null, valueMarkdown: null, identifier: null,
        flags: {enabled: true, focused: false, focusable: false, selected: false, selectable: false, settable: false},
        actions: [], frame: null, children: shot.menuBar.length - 1}, ...shot.menuBar.slice(1).map(item => ({...item, depth: 1}))]}
    : shot),
};

export function correct(shot, rules) {
  let out = shot;
  for (const rule of rules.filter(each => each.kind === 'skyshot')) {
    if (SHOT_CORRECTIONS[rule.correction]) { out = SHOT_CORRECTIONS[rule.correction](out, rule); continue; }
    const fix = CORRECTIONS[rule.correction];
    if (!fix) throw new Error(`unknown correction ${rule.correction}`);
    out = {...out, nodes: out.nodes.map(node => fix(node, rule, shot)), menuBar: out.menuBar.map(node => fix(node, rule, shot))};
  }
  return out;
}
