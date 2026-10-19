// Finder's goldens, kept structurally (the own native engine spec, Verification system part 3: "structurally where a
// window could carry the user's content"). The run's Finder window is the harness's, but its sidebar lists the owner's
// favourites, devices and tags, so a Finder golden keeps every string the run owns (its folder and file names) and the
// grammar's structure, and replaces every other string by its length: ⟨n⟩.
//   skyshot  the raw Skyshot JSON: the content fields of every node (title, description, value, help, placeholder, url,
//            identifier, valueDescription, valueMarkdown), non-AX action names, the window title and the selected text;
//            roles, subroles, role descriptions (system text), flags, frames, indexes and counts are kept.
//   text     the accessibility text (full or diff): an element line keeps its diff mark, tabs, index, a leading role word
//            from the common English vocabulary, its flags group and its part labels; other lines keep their label and
//            numbers. Any line that names a run-owned string is kept whole.
const CONTENT_FIELDS = ['title', 'description', 'value', 'help', 'placeholder', 'url', 'identifier', 'valueDescription', 'valueMarkdown'];
const LABELS = ['Secondary Actions', 'Description', 'Placeholder', 'Columns', 'Details', 'Value', 'Rows', 'Help', 'URL', 'ID'];
// Role words the grammar prints in English (the vendor's overrides and common AX role descriptions), longest first.
const ROLE_WORDS = ['full screen button', 'disclosure triangle', 'search text field', 'minimize button', 'menu bar item', 'pop up button',
  'radio button', 'value indicator', 'close button', 'zoom button', 'scroll area', 'scroll bar', 'split group', 'static text', 'menu button',
  'text field', 'tab group', 'container', 'checkbox', 'splitter', 'element', 'toolbar', 'outline', 'heading', 'button', 'column', 'window',
  'slider', 'image', 'group', 'table', 'list', 'link', 'cell', 'text', 'row'];

const mark = text => `⟨${[...text].length}⟩`;

function redactValue(value, allowed) {
  return typeof value === 'string' && value !== '' && !allowed.has(value) ? mark(value) : value;
}

function redactNode(node, allowed) {
  const out = {...node};
  for (const field of CONTENT_FIELDS) if (field in out) out[field] = redactValue(out[field], allowed);
  if (Array.isArray(out.actions)) out.actions = out.actions.map(action => (/^AX[A-Za-z]+$/.test(action) ? action : mark(action)));
  return out;
}

export function redactSkyshot(shot, allowed) {
  return {
    ...shot,
    window: shot.window ? {...shot.window, title: redactValue(shot.window.title, allowed)} : shot.window,
    nodes: (shot.nodes ?? []).map(n => redactNode(n, allowed)),
    menuBar: (shot.menuBar ?? []).map(n => redactNode(n, allowed)),
    selectedText: redactValue(shot.selectedText, allowed),
  };
}

// The rest of an element line after its index: the leading role word, the flags group and the part labels kept, every
// other run replaced by its length.
function redactParts(rest) {
  let out = '', i = 0;
  const role = ROLE_WORDS.find(word => rest === word || rest.startsWith(`${word} `));
  if (role) { out = role; i = role.length; }
  const token = new RegExp(`\\([^()]*\\)|(?:${LABELS.join('|')}): `, 'g');
  token.lastIndex = i;
  for (let m; (m = token.exec(rest));) {
    const gap = rest.slice(i, m.index);
    out += gap.trim() ? gap.replace(/\S.*\S|\S/, mark) : gap;
    out += m[0];
    i = m.index + m[0].length;
  }
  const tail = rest.slice(i);
  return out + (tail.trim() ? tail.replace(/\S.*\S|\S/, mark) : tail);
}

export function redactText(text, allowed) {
  const names = [...allowed].filter(Boolean);
  return String(text).split('\n').map(line => {
    if (names.some(name => line.includes(name))) return line;
    const header = /^(.*?Window: ")([^"]*)(".*)$/.exec(line);
    if (header) return `${header[1]}${mark(header[2])}${header[3].replace(/"([^"]*)"/g, (_, q) => `"${mark(q)}"`)}`;
    const element = /^([~+-]?)(\t*)(\d+) (.*)$/.exec(line);
    if (element) return `${element[1]}${element[2]}${element[3]} ${redactParts(element[4])}`;
    const labelled = /^([^:]*: )(.*)$/.exec(line);
    if (labelled) return labelled[1] + (/^[\d\s,–-]*$/.test(labelled[2]) ? labelled[2] : mark(labelled[2]));
    return line.replace(/"([^"]*)"/g, (_, q) => `"${mark(q)}"`);
  }).join('\n');
}

// A golden file's bytes, redacted by its kind (".json" files are Skyshots, everything else text).
export function redactGolden(content, kind, allowedNames) {
  const allowed = new Set(allowedNames);
  if (/skyshot/.test(kind)) return JSON.stringify(redactSkyshot(JSON.parse(content), allowed), null, 1);
  return redactText(content, allowed);
}
