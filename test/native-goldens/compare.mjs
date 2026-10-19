// The comparison the renderer's goldens are judged by (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// Verification system, part 3): the vendor's text and cua's, recorded on the same scene state, compared **modulo index
// renumbering**. Indexes never take part in a line's comparison; an index the trailer names is followed through the
// matched lines, and a diff's removed IDs are compared by count. Each element line is normalized to its role word,
// flags and title (the line's head, up to its first labelled part) and the labels of its parts (their values are not
// compared), and the vendor's normalized lines must appear in cua's text in the same order. cua's other lines are added
// lines, allowed only when declared by their head; a vendor line cua lacks is a difference unless declared. Every
// difference is declared in ./expected.json with its cause, never absorbed silently.
//
// Matched lines must also sit at the same depth (a `depth` difference otherwise).
//
// `structural`: the scene window can carry content the harness does not own (Finder's sidebar), so both captures were
// redacted (every string not run-owned replaced by its length, ⟨n⟩; scripts/spike/engine/measure/redact.mjs) and are
// compared by structure: an element line is its diff mark, its depth, its role word when the redaction kept one (the
// English vocabulary) and the flags group after it; titles and parts are not compared, since the redaction kept or
// merged labels by their position on the line and hid the identifiers' `_`/`NS` prefix the ID rule reads.

export const LABELS = ['Secondary Actions', 'Description', 'Placeholder', 'Columns', 'Details', 'Value', 'Rows', 'Help', 'URL', 'ID'];
const LABEL_ANYWHERE = new RegExp(`(?:^|, | )(${LABELS.join('|')}): `, 'g');
const LABEL_LISTED = new RegExp(`(?:^ ?|, )(${LABELS.join('|')}): `, 'g');
const FLAG_WORDS = new Set(['selectable', 'selected', 'disabled', 'expanded', 'collapsed', 'settable', 'boolean', 'integer', 'float', 'string', 'sent by me']);
// The redaction's English role words (scripts/spike/engine/measure/redact.mjs), longest first.
const ROLE_WORDS = ['full screen button', 'disclosure triangle', 'search text field', 'minimize button', 'menu bar item', 'pop up button',
  'radio button', 'value indicator', 'close button', 'zoom button', 'scroll area', 'scroll bar', 'split group', 'static text', 'menu button',
  'text field', 'tab group', 'container', 'checkbox', 'splitter', 'element', 'toolbar', 'outline', 'heading', 'button', 'column', 'window',
  'slider', 'image', 'group', 'table', 'list', 'link', 'cell', 'text', 'row'];
const TRAILER = /^(The focused UI element is |Selected:$|Selected text: ```$)/;

// A text as {header, items: [{mark, index, rest}], trailer: {kind, items}, removed: number | null}.
export function parse(text, {kind}) {
  const lines = text.split('\n');
  const header = lines.shift();
  const items = [];
  const out = {header, items, trailer: null, removed: null};
  let expected = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (TRAILER.test(line) && (i === 0 || lines[i - 1] === '' || kind === 'diff')) { out.trailer = parseTrailer(lines.slice(i)); break; }
    const removed = /^Removed element IDs: (.*)$/.exec(line);
    if (removed && kind === 'diff') { out.removed = countRanges(removed[1]); continue; }
    const match = (kind === 'diff' ? /^([~+])(\t*)(\d+) (.*)$/ : /^()(\t*)(\d+) (.*)$/).exec(line);
    if (match && (kind === 'diff' || Number(match[3]) === expected)) {
      expected = Number(match[3]) + 1;
      items.push({mark: match[1], depth: match[2].length, index: Number(match[3]), rest: match[4]});
    }
    // Anything else continues the previous line's value (a multi-line value), or is a blank line before the trailer.
  }
  return out;
}

function parseTrailer(lines) {
  if (lines[0].startsWith('The focused UI element is ')) {
    const match = /^(\d+) (.*)$/.exec(lines[0].slice('The focused UI element is '.length));
    return {kind: 'focused', items: match ? [{index: Number(match[1]), rest: match[2]}] : []};
  }
  if (lines[0] === 'Selected:') {
    const items = [];
    for (const line of lines.slice(1)) { const match = /^\t(\d+) (.*)$/.exec(line); if (!match) break; items.push({index: Number(match[1]), rest: match[2]}); }
    return {kind: 'selected', items};
  }
  return {kind: 'selectedText', items: []};
}

const countRanges = text => text.split(', ').reduce((sum, part) => { const [lo, hi] = part.split('-').map(Number); return sum + (hi === undefined ? 1 : hi - lo + 1); }, 0);

// An element line's comparable form: {head, role, flags, title, labels}.
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

// The comparable key of a normalized line under the declared flag and label exceptions of its scene.
function key(line, mark, exceptions) {
  const roleOf = line.role ?? line.title;
  const applies = rule => !rule.roles || rule.roles.some(role => roleOf === role || roleOf.startsWith(`${role} `));
  const ignoredFlags = new Set(exceptions.filter(rule => rule.kind === 'flag' && applies(rule)).map(rule => rule.flag));
  const ignoredLabels = new Set(exceptions.filter(rule => rule.kind === 'label' && applies(rule)).map(rule => rule.label));
  const flags = line.flags.filter(flag => !ignoredFlags.has(flag) && !(ignoredFlags.has('settable') && ['boolean', 'integer', 'float'].includes(flag)));
  const head = line.role === null ? line.title : [line.role, flags.length ? `(${flags.join(', ')})` : '', line.title].filter(Boolean).join(' ');
  return `${mark}${head} | ${line.labels.filter(label => !ignoredLabels.has(label)).join(', ')}`;
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

// → {differences: [{kind, …}], added: number, lines: number}. `declared`: the scene's entries of ./expected.json for
// this golden (`flag` and `label` exceptions, `added` and `missing` lines by head, `header`, `trailer`, `removed`).
export function compare(vendorText, cuaText, {kind = 'full', structural = false, declared: rules = []} = {}) {
  const declared = rules.map(rule => ({...rule}));
  const vendor = parse(vendorText, {kind}), cua = parse(cuaText, {kind});
  const exceptions = declared.filter(rule => rule.kind === 'flag' || rule.kind === 'label');
  const keys = side => side.items.map(item => `${structural ? `${item.depth}:` : ''}${key(normalize(item.rest, {structural}), item.mark, exceptions)}`);
  const vendorKeys = keys(vendor), cuaKeys = keys(cua);
  const pairs = matchInOrder(vendorKeys, cuaKeys);
  const differences = [];
  const allowance = (kindName, head) => declared.find(rule => rule.kind === kindName && rule.head === head && (rule.left = (rule.left ?? rule.count ?? 1)) > 0);
  const take = rule => { rule.left--; return true; };

  const matchedVendor = new Set(pairs.map(([i]) => i)), matchedCua = new Set(pairs.map(([, j]) => j));
  vendorKeys.forEach((head, i) => {
    if (matchedVendor.has(i)) return;
    const rule = allowance('missing', head);
    if (!(rule && take(rule))) differences.push({kind: 'missing', head, line: vendor.items[i].rest.split('\n')[0]});
  });
  let added = 0;
  cuaKeys.forEach((head, j) => {
    if (matchedCua.has(j)) return;
    added++;
    const rule = allowance('added', head);
    if (!(rule && take(rule))) differences.push({kind: 'added', head, line: cua.items[j].rest.split('\n')[0]});
  });

  for (const [i, j] of pairs) {
    if (vendor.items[i].depth !== cua.items[j].depth && !declared.some(rule => rule.kind === 'depth')) {
      differences.push({kind: 'depth', line: vendor.items[i].rest.split('\n')[0], vendor: vendor.items[i].depth, cua: cua.items[j].depth});
    }
  }

  // A header the redaction replaced whole is compared by its length.
  const redactedWhole = /^⟨(\d+)⟩$/.exec(vendor.header);
  const headerOf = text => (structural ? text.replace(/App: .*\.$/, 'App: ⟨⟩.').replace(/⟨\d+⟩/g, '⟨⟩') : text);
  const sameHeader = structural && redactedWhole ? Number(redactedWhole[1]) === [...cua.header].length : headerOf(vendor.header) === headerOf(cua.header);
  if (!sameHeader && !declared.some(rule => rule.kind === 'header')) {
    differences.push({kind: 'header', vendor: vendor.header, cua: cua.header});
  }

  // The trailer: the same kind, naming the matched elements.
  const cuaIndexOf = new Map(pairs.map(([i, j]) => [vendor.items[i].index, cua.items[j].index]));
  const sameTrailer = () => {
    if (!vendor.trailer || !cua.trailer) return vendor.trailer === cua.trailer;
    if (vendor.trailer.kind !== cua.trailer.kind || vendor.trailer.items.length !== cua.trailer.items.length) return false;
    return vendor.trailer.items.every((item, n) => {
      const mapped = cuaIndexOf.get(item.index);
      const other = cua.trailer.items[n];
      // A trailer element outside the tree (or a diff, which prints only changed lines) is compared by its line.
      return mapped === undefined ? key(normalize(item.rest, {structural}), '', exceptions) === key(normalize(other.rest, {structural}), '', exceptions) : mapped === other.index;
    });
  };
  if (!sameTrailer() && !declared.some(rule => rule.kind === 'trailer')) differences.push({kind: 'trailer', vendor: vendor.trailer, cua: cua.trailer});
  if (kind === 'diff' && vendor.removed !== cua.removed && !declared.some(rule => rule.kind === 'removed')) {
    differences.push({kind: 'removed', vendor: vendor.removed, cua: cua.removed});
  }
  return {differences, added, lines: cua.items.length};
}

// The engine-side differences a golden declares (./expected.json, `kind: "skyshot"`), applied to a copy of cua's
// Skyshot before it is rendered for the comparison, so the comparison judges the renderer and each engine difference is
// named once, with its cause, instead of in every line it touches. The pinned rendering (cua.txt) is always of the
// Skyshot as recorded.
export const CORRECTIONS = {
  // flags.disclosable only where the element is expanded (no vendor line prints `collapsed`).
  disclosableWhenExpanded: node => (node.flags.disclosable && !node.flags.expanded ? {...node, flags: {...node.flags, disclosable: false}} : node),
  // flags.settable only on the roles a rule names, and on Boolean values.
  settableRoles: (node, {roles}) => (node.flags.settable && !roles.includes(node.role) && node.valueType !== 'boolean' ? {...node, flags: {...node.flags, settable: false}} : node),
  // A numeric value's type as the element's CFNumber carried it.
  valueType: (node, {role, valueType}) => (node.role === role && node.valueType === 'number' ? {...node, valueType} : node),
  // The window element's URL (its document).
  windowUrl: (node, {url}) => (node.role === 'AXWindow' && node.depth === 0 ? {...node, url} : node),
};

export function correct(shot, rules) {
  let out = shot;
  for (const rule of rules.filter(each => each.kind === 'skyshot')) {
    const fix = CORRECTIONS[rule.correction];
    if (!fix) throw new Error(`unknown correction ${rule.correction}`);
    out = {...out, nodes: out.nodes.map(node => fix(node, rule)), menuBar: out.menuBar.map(node => fix(node, rule))};
  }
  return out;
}
