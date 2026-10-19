// Finder's goldens, kept structurally (the own native engine spec, Verification system part 3: "structurally where a
// window could carry the user's content"). The run's Finder window is the harness's, but its sidebar lists the owner's
// favourites, devices and tags. So a Finder golden keeps what the run owns (its folder and file names) and the
// grammar's fixed structure, and fails closed: anything it does not recognise is replaced by its length, ⟨n⟩.
//   skyshot  a keep-list: per node the structural fields (index, depth, pid, role, subrole, role description, flags,
//            frame, counts, ranges, value type); the content fields (title, description, value, help, placeholder, url,
//            identifier, value description, Markdown) only when the run owns the string; AX-named actions only. At the
//            top level the app, the window's frame and pid, the lineage, the indexes and the timings; every other field,
//            and every unknown one, is replaced.
//   text     line by line. An element line (also inside the focused-element trailer and after `Selected:`) keeps its
//            diff mark, tabs and index, a leading role word from the English vocabulary, the flags group right after it
//            when every item is a flag word, the part labels, and the width rule's `(showing N of M items)`; every other
//            run is replaced. Fixed lines are kept (blank lines, the selection note, `Selected:`, the selected-text fence
//            lines, numeric `Removed element IDs:` lines, the truncation markers, the window header with its title and
//            app name replaced unless owned); every other line is replaced whole, including selected-text bodies and
//            multi-line value continuations. A part (the title, or a label's text) is kept only when it is exactly a
//            run-owned string.
import {NOTE} from '../render.mjs';

const mark = text => `⟨${[...String(text)].length}⟩`;
const markRun = text => (text.trim() ? text.replace(/\S(?:.*\S)?/, mark) : text);

// ---- Skyshot ----
const NODE_STRUCTURE = new Set(['index', 'depth', 'pid', 'role', 'subrole', 'roleDescription', 'valueType', 'flags', 'frame', 'children', 'shown',
  'rowIndexRange', 'columnIndexRange', 'traits', 'servesAsTitle', 'numberOfCharacters']);
const NODE_CONTENT = new Set(['title', 'description', 'value', 'help', 'placeholder', 'url', 'identifier', 'valueDescription', 'valueMarkdown']);
const TOP_STRUCTURE = new Set(['app', 'lineage', 'revision', 'truncated', 'focused', 'selectedElements', 'settle', 'timings']);

// A replaced value: a string by its length, an object or array wholesale; numbers, booleans and null are not content.
const replaced = value => (value === null || typeof value === 'number' || typeof value === 'boolean' ? value : typeof value === 'string' ? mark(value) : '⟨redacted⟩');
const content = (value, allowed) => (typeof value === 'string' && allowed.has(value) ? value : replaced(value));

function redactNode(node, allowed) {
  return Object.fromEntries(Object.entries(node).map(([key, value]) => {
    if (NODE_STRUCTURE.has(key)) return [key, value];
    if (NODE_CONTENT.has(key)) return [key, content(value, allowed)];
    if (key === 'actions' && Array.isArray(value)) return [key, value.map(action => (/^AX[A-Za-z]+$/.test(action) ? action : replaced(action)))];
    return [key, replaced(value)];
  }));
}

export function redactSkyshot(shot, allowed) {
  return Object.fromEntries(Object.entries(shot).map(([key, value]) => {
    if (TOP_STRUCTURE.has(key)) return [key, value];
    if (key === 'nodes' || key === 'menuBar') return [key, Array.isArray(value) ? value.map(n => redactNode(n, allowed)) : replaced(value)];
    if (key === 'window' && value && typeof value === 'object') return [key, {title: content(value.title, allowed), frame: value.frame ?? null, pid: value.pid ?? null}];
    if (key === 'screenshot' && value && typeof value === 'object') return [key, {width: value.width ?? null, height: value.height ?? null}];
    if (key === 'selectedText') return [key, content(value, allowed)];
    return [key, replaced(value)];
  }));
}

// ---- Text ----
// Role words the grammar prints in English (the vendor's overrides and common AX role descriptions), longest first.
const ROLE_WORDS = ['full screen button', 'disclosure triangle', 'search text field', 'minimize button', 'menu bar item', 'pop up button',
  'radio button', 'value indicator', 'close button', 'zoom button', 'scroll area', 'scroll bar', 'split group', 'static text', 'menu button',
  'text field', 'tab group', 'container', 'checkbox', 'splitter', 'element', 'toolbar', 'outline', 'heading', 'button', 'column', 'window',
  'slider', 'image', 'group', 'table', 'list', 'link', 'cell', 'text', 'row'];
const FLAG_WORDS = new Set(['selectable', 'selected', 'disabled', 'expanded', 'collapsed', 'settable', 'boolean', 'integer', 'float', 'string', 'sent by me']);
const LABELS = ['Secondary Actions', 'Description', 'Placeholder', 'Columns', 'Details', 'Value', 'Rows', 'Help', 'URL', 'ID'];
const LABEL = new RegExp(`(?:^ ?|, )(?:${LABELS.join('|')}): `, 'g');
const SHOWN = /( \(showing \d+ of \d+ items\))$/;

// The rest of an element line after its index.
export function redactParts(rest, allowed = new Set()) {
  const owned = segment => (allowed.has(segment.trim()) ? segment : markRun(segment));
  let out = '', i = 0;
  const role = ROLE_WORDS.find(word => rest === word || rest.startsWith(`${word} `));
  if (role) { out = role; i = role.length; }
  // The flags group only right after the role word (or the index, for the wordless roles), every item a flag word.
  const flags = (role ? /^ \(([^()]*)\)/ : /^\(([^()]*)\)/).exec(rest.slice(i));
  if (flags && flags[1].split(', ').every(item => FLAG_WORDS.has(item))) { out += flags[0]; i += flags[0].length; }
  let tail = rest.slice(i), shown = '';
  const width = SHOWN.exec(tail);
  if (width) { shown = width[1]; tail = tail.slice(0, -shown.length); }
  let kept = '', at = 0;
  LABEL.lastIndex = 0;
  for (let m; (m = LABEL.exec(tail));) { kept += owned(tail.slice(at, m.index)) + m[0]; at = m.index + m[0].length; }
  return out + kept + owned(tail.slice(at)) + shown;
}

const ELEMENT = /^([~+-]?)(\t*)(\d+) (.*)$/;
const element = (line, allowed) => { const m = ELEMENT.exec(line); return m ? `${m[1]}${m[2]}${m[3]} ${redactParts(m[4], allowed)}` : null; };
const FIXED = [/^$/, /^Selected:$/, /^```$/, /^Removed element IDs: [\d, –-]*$/, /^\[truncated: elements deeper than \d+ levels omitted\]$/, /^\[truncated: \d+ elements omitted\]$/];
const FOCUSED = 'The focused UI element is ';
const SELECTED_TEXT = 'Selected text: ```';

export function redactText(text, allowed) {
  let fenced = false;
  return String(text).split('\n').map(line => {
    // A selected-text body: everything between the fences is the selection itself, owned or not.
    if (fenced) { if (line === '```') { fenced = false; return line; } return markRun(line); }
    if (line === SELECTED_TEXT) { fenced = true; return line; }
    if (line === NOTE || FIXED.some(pattern => pattern.test(line))) return line;
    const header = /^Window: "(.*)", App: (.*)\.$/.exec(line);
    if (header) return `Window: "${allowed.has(header[1]) ? header[1] : mark(header[1])}", App: ${allowed.has(header[2]) ? header[2] : mark(header[2])}.`;
    if (line.startsWith(FOCUSED)) return FOCUSED + (element(line.slice(FOCUSED.length), allowed) ?? markRun(line.slice(FOCUSED.length)));
    return element(line, allowed) ?? markRun(line);
  }).join('\n');
}

// A golden file's bytes, redacted by its kind (a kind naming "skyshot" is a Skyshot's JSON, every other kind text).
export function redactGolden(text, kind, allowedNames) {
  const allowed = new Set(allowedNames);
  if (/skyshot/.test(kind)) return JSON.stringify(redactSkyshot(JSON.parse(text), allowed), null, 1);
  return redactText(text, allowed);
}
