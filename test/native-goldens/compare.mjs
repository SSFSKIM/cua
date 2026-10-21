// The comparison the renderer's goldens are judged by (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// Verification system, part 3): the vendor's text and cua's, recorded on the same scene state, compared **modulo index
// renumbering**. Lines are matched in order (a longest common subsequence) by their head (role word, flags and title, up
// to the first labelled part) and the labels of their parts; a vendor line cua lacks is `missing`, a cua line the vendor
// lacks is `added`. Each matched pair is then compared whole: its depth, and its full text, values included, with only
// what genuinely drifts between the two lanes normalized (the loopback page's port, DRIFT). Indexes never take part in
// a line's text; they are followed through the matched pairs instead: the trailer must name the matched element, and a
// diff's removed IDs and `~` lines must name, through the matched lines of the two `before` texts (`indexMap`), the same
// elements. Every difference is declared in ./expected.json with its cause and its exact value or count, never absorbed.
//
// `structural`: the scene window can carry content the harness does not own (Finder's sidebar), so both captures were
// redacted (every string not run-owned replaced by its length, ⟨n⟩; scripts/spike/engine/measure/redact.mjs). There an
// element line is matched by its diff mark, its depth, its role word when the redaction kept one (the English
// vocabulary) and the flags group after it, and a matched pair's text is compared by its length with each ⟨n⟩ counted
// as n characters: the redaction folds a localized role word, the flags and the title into one ⟨n⟩, so the length is
// what the redacted line still tells.

export const LABELS = ['Secondary Actions', 'Description', 'Placeholder', 'Columns', 'Details', 'Value', 'Rows', 'Help', 'URL', 'ID'];
const LABEL_ANYWHERE = new RegExp(`(?:^|, | )(${LABELS.join('|')}): `, 'g');
const FLAG_WORDS = new Set(['selectable', 'selected', 'disabled', 'expanded', 'collapsed', 'settable', 'boolean', 'integer', 'float', 'string', 'sent by me']);
// The redaction's English role words (scripts/spike/engine/measure/redact.mjs), longest first.
const ROLE_WORDS = ['full screen button', 'disclosure triangle', 'search text field', 'minimize button', 'menu bar item', 'pop up button',
  'radio button', 'value indicator', 'close button', 'zoom button', 'scroll area', 'scroll bar', 'split group', 'static text', 'menu button',
  'text field', 'tab group', 'container', 'checkbox', 'splitter', 'element', 'toolbar', 'outline', 'heading', 'button', 'column', 'window',
  'slider', 'image', 'group', 'table', 'list', 'link', 'cell', 'text', 'row'];
const TRAILER = /^(The focused UI element is |Selected:$|Selected text: ```$)/;
// What differs between the lanes without being a rendering: each lane served the Chrome scene's page on its own port.
const DRIFT = [[/127\.0\.0\.1:\d+/g, '127.0.0.1:⟨port⟩']];

// A text as {header, items: [{mark, depth, index, rest, literal}], trailer: {kind, items, text} | null, removed: [id] |
// null, unparsed: [line]}. An item's `rest` is its line after the index, with any continuation lines of a multi-line
// value; `unparsed` holds the lines before the first element line that are none of the text's kind (a full tree read as
// a diff, say), which a comparison reports rather than drops.
//
// Where an element line ends and a value's continuation begins: the renderer prints a value raw (its newlines included,
// long and multi-line parts last; src/services/engine/render.mjs parts), so a continuation line can look like an element
// line and the grammar cannot always tell them apart. A full tree's element line opens at depth 0 first, then at most
// one below the last element's, with an index not seen yet (indexes need not run from 0 without gaps: a default-mode
// fallback keeps the lineage's surviving ones); any other line is a continuation. Of the element lines, two kinds may
// still be a value's line, and are `literal`: compared with their index, which is never renumbered away, so a value's
// numeric line is never matched away: the index of a literal line must be the vendor's shifted by exactly the
// renumbering in force where it stands (the offset of the nearest matched pair before it whose lines are both element
// lines beyond doubt; none, no shift), so a renumbered element there still matches and a value's number that changed
// is a difference. These lines are
//   - an untabbed line after the first: the tree's further roots (the menu bar) are untabbed, and so is a value's
//     plain line;
//   - a line right after a continuation line: inside a multi-line value, any line may be the value's.
// In a diff (marked `~` or `+` lines, in no depth order) the second applies.
export function parse(text, {kind}) {
  const lines = text.replace(/\n$/, '').split('\n');
  const header = lines.shift();
  const items = [];
  const out = {header, items, trailer: null, removed: null, unparsed: []};
  const seen = new Set();
  let inValue = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (TRAILER.test(line) && (i === 0 || lines[i - 1] === '' || kind === 'diff')) {
      const last = items.at(-1);
      if (last && lines[i - 1] === '') last.rest = last.rest.replace(/\n$/, '');
      out.trailer = parseTrailer(lines.slice(i));
      break;
    }
    const removed = /^Removed element IDs: (.*)$/.exec(line);
    if (removed && kind === 'diff') { out.removed = expandRanges(removed[1]); continue; }
    const match = (kind === 'diff' ? /^([~+])(\t*)(\d+) (.*)$/ : /^()(\t*)(\d+) (.*)$/).exec(line);
    const depth = match?.[2].length, index = Number(match?.[3]);
    if (match && (kind === 'diff' || (depth <= (items.length ? items.at(-1).depth + 1 : 0) && !seen.has(index)))) {
      const literal = items.length > 0 && (inValue || (kind !== 'diff' && depth === 0));
      seen.add(index);
      items.push({mark: match[1], depth, index, rest: match[4], literal});
      inValue = false;
    } else if (items.length) {
      items.at(-1).rest += `\n${line}`;   // a multi-line value's continuation
      inValue = true;
    } else {
      out.unparsed.push(line);
    }
  }
  return out;
}

function parseTrailer(lines) {
  const text = lines.join('\n');
  if (lines[0].startsWith('The focused UI element is ')) {
    const match = /^(\d+) (.*)$/.exec(lines[0].slice('The focused UI element is '.length));
    return {kind: 'focused', items: match ? [{index: Number(match[1]), rest: match[2]}] : [], text};
  }
  if (lines[0] === 'Selected:') {
    const items = [];
    for (const line of lines.slice(1)) { const match = /^\t(\d+) (.*)$/.exec(line); if (!match) break; items.push({index: Number(match[1]), rest: match[2]}); }
    return {kind: 'selected', items, text};
  }
  return {kind: 'selectedText', items: [], text};
}

const expandRanges = text => text.split(', ').flatMap(part => {
  const [lo, hi = lo] = part.split('-').map(Number);
  return Array.from({length: hi - lo + 1}, (_, n) => lo + n);
});

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

function matchKey(item, structural) {
  const line = normalize(item.rest, {structural});
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

// → {differences: [{kind, …}], added, lines, indexMap}. `declared`: the entries of ./expected.json for this golden:
// `missing` and `added` lines by matching key, `part` differences inside a matched line, the `header` and the `trailer`
// (each pinned to both sides' exact text), the vendor's capped `subsetCount`, each `count` times exactly (default 1). `indexMap` (a diff only): the vendor
// index → cua index of the matched lines of the two `before` texts. The result's `indexMap` is this comparison's.
export function compare(vendorText, cuaText, {kind = 'full', structural = false, declared: rules = [], indexMap = null} = {}) {
  const declared = rules.map(rule => ({...rule, left: rule.count ?? 1}));
  const vendor = parse(vendorText, {kind}), cua = parse(cuaText, {kind});
  const vendorKeys = vendor.items.map(item => matchKey(item, structural)), cuaKeys = cua.items.map(item => matchKey(item, structural));
  const pairs = matchInOrder(vendorKeys, cuaKeys);
  const differences = [];
  const allow = (kindName, test) => {
    const rule = declared.find(each => each.kind === kindName && each.left > 0 && test(each));
    if (rule) rule.left--;
    return Boolean(rule);
  };

  // Two texts alike: exactly, or (redacted) by length.
  const same = (a, b) => (structural ? lengthOf(a) === lengthOf(b) : a === b);
  const matchedVendor = new Set(pairs.map(([i]) => i)), matchedCua = new Set(pairs.map(([, j]) => j));
  vendorKeys.forEach((head, i) => {
    if (!matchedVendor.has(i) && !allow('missing', rule => rule.head === head)) differences.push({kind: 'missing', head, line: vendor.items[i].rest});
  });
  let added = 0;
  cuaKeys.forEach((head, j) => {
    if (matchedCua.has(j)) return;
    added++;
    if (!allow('added', rule => rule.head === head)) differences.push({kind: 'added', head, line: cua.items[j].rest});
  });

  const parts = declared.filter(rule => rule.kind === 'part'), subsets = declared.filter(rule => rule.kind === 'subsetCount');
  // A literal line's index: the vendor's, shifted by the renumbering in force where it stands (see parse).
  let offset = 0;
  for (const [i, j] of pairs) {
    const v = vendor.items[i], c = cua.items[j];
    if (!v.literal && !c.literal) offset = c.index - v.index;
    else if (c.index - v.index !== offset) differences.push({kind: 'literalIndex', line: v.rest, vendor: v.index, cua: c.index, offset});
  }

  for (const [i, j] of pairs) {
    const v = vendor.items[i], c = cua.items[j];
    if (v.depth !== c.depth) differences.push({kind: 'depth', line: v.rest, vendor: v.depth, cua: c.depth});
    const vendorLine = textOf(v.rest, structural);
    let cuaLine = textOf(c.rest, structural);
    if (same(vendorLine, cuaLine)) continue;
    const applied = [];
    for (const rule of subsets) {
      const next = rule.left > 0 ? applySubsetCount(vendorLine, cuaLine, rule) : null;
      if (next !== null) { cuaLine = next; applied.push(rule); break; }
    }
    for (const rule of parts) {
      const next = rule.left > 0 ? applyPart(cuaLine, rule) : null;
      if (next !== null) { cuaLine = next; applied.push(rule); }
    }
    if (applied.length && same(vendorLine, cuaLine)) for (const rule of applied) rule.left--;
    else differences.push({kind: 'text', vendor: v.rest, cua: c.rest});
  }

  // A header the redaction replaced whole is compared by its length.
  const redactedWhole = /^⟨(\d+)⟩$/.exec(vendor.header);
  const headerOf = text => (structural ? text.replace(/App: .*\.$/, 'App: ⟨⟩.').replace(/⟨\d+⟩/g, '⟨⟩') : text);
  const sameHeader = structural && redactedWhole ? Number(redactedWhole[1]) === [...cua.header].length : headerOf(vendor.header) === headerOf(cua.header);
  if (!sameHeader && !allow('header', rule => rule.vendor === vendor.header && rule.cua === cua.header)) {
    differences.push({kind: 'header', vendor: vendor.header, cua: cua.header});
  }

  // The trailer: the same kind, naming the matched elements. An element's index is followed through this comparison's
  // matched lines and, in a diff (which prints only what changed), through the two `before` texts' (`indexMap`); an
  // element neither names must not be one a matched line names on cua's side. Either way the rest of its line is
  // compared. Selected text is compared whole.
  const map = new Map(pairs.map(([i, j]) => [vendor.items[i].index, cua.items[j].index]));
  const resolve = index => map.get(index) ?? (kind === 'diff' ? indexMap?.get(index) : undefined);
  const named = new Set([...map.values(), ...(kind === 'diff' && indexMap ? indexMap.values() : [])]);
  const sameTrailer = () => {
    if (!vendor.trailer || !cua.trailer) return vendor.trailer === cua.trailer;
    if (vendor.trailer.kind !== cua.trailer.kind || vendor.trailer.items.length !== cua.trailer.items.length) return false;
    if (vendor.trailer.kind === 'selectedText') return same(textOf(vendor.trailer.text, structural), textOf(cua.trailer.text, structural));
    return vendor.trailer.items.every((item, n) => {
      const other = cua.trailer.items[n];
      const mapped = resolve(item.index);
      const sameIndex = mapped === undefined ? !named.has(other.index) : mapped === other.index;
      return sameIndex && same(textOf(item.rest, structural), textOf(other.rest, structural));
    });
  };
  if (!sameTrailer() && !allow('trailer', rule => rule.vendor === (vendor.trailer?.text ?? null) && rule.cua === (cua.trailer?.text ?? null))) {
    differences.push({kind: 'trailer', vendor: vendor.trailer?.text ?? null, cua: cua.trailer?.text ?? null});
  }
  if (vendor.unparsed.length || cua.unparsed.length) differences.push({kind: 'unparsed', vendor: vendor.unparsed, cua: cua.unparsed});

  if (kind === 'diff') {
    // The removed IDs and the `~` lines name elements of the previous tree: the same ones, through the before texts.
    const toCua = id => indexMap?.get(id);
    const vendorRemoved = (vendor.removed ?? []).map(toCua), cuaRemoved = cua.removed ?? [];
    const sorted = list => [...list].sort((a, b) => (a ?? -1) - (b ?? -1));
    if (JSON.stringify(sorted(vendorRemoved)) !== JSON.stringify(sorted(cuaRemoved))) {
      differences.push({kind: 'removed', vendor: vendor.removed, mapped: vendorRemoved, cua: cua.removed});
    }
    for (const [i, j] of pairs) {
      if (vendor.items[i].mark === '~' && toCua(vendor.items[i].index) !== cua.items[j].index) {
        differences.push({kind: 'changedIndex', line: vendor.items[i].rest, vendor: vendor.items[i].index, cua: cua.items[j].index});
      }
    }
  }

  for (const rule of declared) {
    if (['missing', 'added', 'part', 'header', 'trailer', 'subsetCount'].includes(rule.kind) && rule.left !== 0) {
      differences.push({kind: 'overdeclared', rule: rule.kind, head: rule.head ?? rule.label ?? rule.identifier ?? null, left: rule.left});
    }
  }
  return {differences, added, lines: cua.items.length, indexMap: map};
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
