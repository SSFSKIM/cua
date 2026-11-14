// The documents that teach a Linux computer surface quote what it answers: cua's Linux document
// (docs/cua-api/linux-engine.md, read by the model after core.md; the #171 spec's Decision Log, M5 pre-flight, F4) and
// the README's Linux part, for a person. Every sentence they quote is the engine's, the service's or the facade's own
// text, so a reworded answer fails here instead of leaving a document that names a sentence nobody sends. The README's
// Chromium menu line is the engine README's, word for word. The Linux document is served under either engine, so it
// describes answers, never which engine gives them.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
// Prose wraps where it likes: compare with every run of whitespace as one space.
const flat = text => text.replace(/\s+/g, ' ');
// A Rust string's line continuation (a backslash ending the line, and the next line's indentation) is no text.
const source = path => flat(file(path).replace(/\\\n\s*/g, ''));

const LINUX_DOCUMENT = 'docs/cua-api/linux-engine.md';
const README = 'README.md';

// [the text as the documents quote it, which documents, the file that answers it, the text there]
const QUOTED = [
  ['<App> does not accept background input; use a dedicated desktop or activate the window first', [LINUX_DOCUMENT, README],
    'native/linux-engine/src/engine/way.rs', '{app} does not accept background input; use a dedicated desktop or activate the window first'],
  ['Window <id> is minimized; activate it first', [LINUX_DOCUMENT, README], 'native/linux-engine/src/engine.rs', 'Window {window} is minimized; activate it first'],
  ['Screenshot unavailable for window <id>.', [LINUX_DOCUMENT], 'src/cua-api/bind-linux-app.mjs', 'Screenshot unavailable for window ${window.id}.'],
  ['Window <id> matches several accessibility windows; close or retitle the duplicates', [LINUX_DOCUMENT, README],
    'native/linux-engine/src/identity.rs', 'Window {window} matches several accessibility windows; close or retitle the duplicates'],
  ['Paste was sent once and could not be confirmed; read the field before retrying', [LINUX_DOCUMENT],
    'native/linux-engine/src/paste.rs', 'Paste was sent once and could not be confirmed; read the field before retrying'],
  ['nothing was sent', [LINUX_DOCUMENT], 'native/linux-engine/src/paste.rs', 'requested field or selection changed before dispatch; nothing was sent'],
  ['a focusing click already reached the window', [LINUX_DOCUMENT], 'native/linux-engine/src/paste.rs',
    'no paste was dispatched, but a focusing click already reached the window, so read the window before retrying'],
  // The engine's own test spells the wait out (`copy::MENU_WAIT`, 1 s), as the answer renders it.
  ['showContextMenu was sent and no menu was seen within 1 s; the application may have shown its own menu or ignored the request; read the window before retrying',
    [LINUX_DOCUMENT, README], 'native/linux-engine/src/engine/elements.rs',
    'showContextMenu was sent and no menu was seen within 1 s; the application may have shown its own menu or ignored the request; read the window before retrying'],
  ['<App> began a drag and drop, which changes the desktop', [LINUX_DOCUMENT], 'native/linux-engine/src/dnd.rs',
    '{app} began a drag and drop, which changes the desktop; it was cancelled before the drop, so nothing was dropped.'],
  ['Pending from your last drag,', [LINUX_DOCUMENT], 'native/linux-engine/src/dnd.rs',
    'Pending from your last drag, {}. Read the window before sending input again: your next input request will not be run'],
  ['Accessibility tree truncated: at least <n> elements not shown (<reason>)', [LINUX_DOCUMENT, README], 'src/cua-api/bind-linux-app.mjs',
    'Accessibility tree truncated: at least ${total} elements not shown (${reason})'],
  ['clipboard update timed out', [README], 'native/linux-engine/src/copy.rs', 'CopyRoute::Text => "clipboard update timed out",'],
  ['cua-engine <found> is older than 0.4.0, which this cua needs; run cua install --engine', [README], 'src/services/engine/linux/client.mjs',
    'cua-engine ${found} is older than ${MIN_ENGINE_VERSION}, which this cua needs; ${REMEDY}'],
];

test('every answer the Linux documents quote is the text that answers it', () => {
  for (const [quoted, documents, path, said] of QUOTED) {
    assert.ok(source(path).includes(flat(said)), `${path} no longer says: ${said}`);
    for (const document of documents) assert.ok(flat(file(document)).includes(flat(quoted)), `${document} does not quote: ${quoted}`);
  }
  // The version the README names is the one the service requires.
  assert.match(file('src/services/engine/linux/client.mjs'), /export const MIN_ENGINE_VERSION = '0\.4\.0'/);
});

test('the README\'s Chromium menu line is the engine README\'s, word for word', () => {
  const engine = flat(file('native/linux-engine/README.md'));
  const start = engine.indexOf('In Chromium, a context menu requested on a window that is not focused');
  const end = engine.indexOf('for copy and paste.', start) + 'for copy and paste.'.length;
  assert.ok(start >= 0 && end > start, 'the engine README still has its Chromium menu line');
  assert.ok(flat(file(README)).includes(engine.slice(start, end)), engine.slice(start, end));
});

test('the Linux document describes answers, not which engine gives them', () => {
  const text = file(LINUX_DOCUMENT);
  assert.doesNotMatch(text, /cua-engine|sky_linux|\bvendor\b|cua's (own )?engine|\bSky\b/i);
  assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), 'one final newline, as the other documents');
});
