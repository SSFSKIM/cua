// CoreDocumentation's bytes (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md, Design "Owned facade and
// first-call documentation"): docs/cua-api/ holds the first-call document, the confirmations policy and the auxiliary
// "Other Browser APIs" document, each the pinned vendor document (chatgpt-26.928.40906 @oai/cua/docs, copied under
// ./fixtures/vendor-docs/ and pinned by SHA-256 here) with exactly the edits the surface inventory's Tables 2 and 3 list,
// and nothing else. Each edit is [exact vendor text, replacement] and must occur exactly once in the vendor document.
// With CUA_VENDOR_DOCS naming the readable tree's docs directory, the fixtures are also compared with it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {applyEdits} from '../../src/repl-host/instructions.mjs';
import {create_documentation} from '../../src/cua-api/documentation.mjs';

const DOCS = new URL('../../docs/cua-api/', import.meta.url);
const VENDOR = new URL('./fixtures/vendor-docs/', import.meta.url);
const read = (base, name) => readFileSync(new URL(name, base), 'utf8');
const sha = text => createHash('sha256').update(text).digest('hex');

const PINNED = {
  'tinysky-alt-core-cua-repl.md': '0a08dbe6ce18cadb55215be30ebbba9afd6195a7333023795424ef6aee2ad148',
  'tinysky-alt-confirmations.md': '68474884543a6a1e72275b59f27f383313fd6aa8604ccedabb5d5cd37077e6fc',
  'tinysky-alt-other-browser-apis.md': '174672af7e028a5e4815318c4133fdab0a5189c5701396df837d7aac76e90fd4',
};

// Table 3's rows for docs/tinysky-alt-core-cua-repl.md, in document order (Table 2's matching "documentation text
// edit" rows name the same text). Product names (ChatGPT, Codex, Orbit) appear in its prose only inside text these
// edits remove, so no rename remains.
const CORE_EDITS = [
  // :62-69 "API BrowserInfo provider type and desktop metadata": only the literals "iab" and "mcpapps" and codexSessionId.
  ['  type?: "iab" | "extension" | "cdp" | "mcpapps";\n', '  type?: "extension" | "cdp";\n'],
  ['  metadata?: { extensionInstanceId?: string; codexSessionId?: string };\n', '  metadata?: { extensionInstanceId?: string };\n'],
  // :128 "API Windows target literal".
  ['    target: "linux" | "mac" | "windows";\n', '    target: "linux" | "mac";\n'],
  // :154 "MCP App tabs paragraph": the whole paragraph.
  ['MCP App tabs support DOM-based interaction. Use `cua.getTab()` to bind an existing app tab; `createBrowserTab()` cannot create one. Navigation and tab lifecycle methods are optional. Use only methods listed in the returned browser documentation.\n\n', ''],
  // :160-162 "Native apps Windows selection claims".
  ['On Linux and Windows, use `cua.getApp({ windowId: 123 })`', 'On Linux, use `cua.getApp({ windowId: 123 })`'],
  ['`cua.listWindows()` is available on Linux and Windows and includes', '`cua.listWindows()` is available on Linux and includes'],
  ['`getApp` does not launch apps on Linux or Windows.', '`getApp` does not launch apps on Linux.'],
  // :164 "Native apps Windows activation and screenshot mapping": the last four sentences.
  [' Windows input activates the selected window. Get a fresh Windows screenshot before coordinate actions. The bound app uses that screenshot\'s coordinate mapping until the next observation; an AX-only observation clears it.\n', '\n'],
  // :170 "Workflow Windows full-state word".
  ['Linux and Windows always return full accessibility state.', 'Linux always return full accessibility state.'],
  // :175 "Workflow new-tab Orbit exception".
  ['(with or without a trailing slash) and Orbit’s signed new-tab extension page, `cua.getTab(...)`', '(with or without a trailing slash), `cua.getTab(...)`'],
  // :198 "Output Windows screenshot constraints": the three sentences after the first.
  [' Windows screenshot methods always display images through Sky and reject `emit: false` before capture. They also reject a result with multiple screenshot regions because the bound API returns one image. Sky displays those regions before the error.\n', '\n'],
  // :204 "Notes Windows paste word".
  ['Linux and Windows app `paste` support only `text`', 'Linux app `paste` support only `text`'],
  // :205 "Notes Windows scroll sentence".
  [' On Windows, pass a coordinate target and `{ pixels: 500 }`; element targets and page counts are unsupported.', ''],
  // :206 "Notes Windows selectText word".
  ['`selectText` is unavailable on Linux and Windows.', '`selectText` is unavailable on Linux.'],
];

// The surface inventory's "Table 3 amendment (2026-10-15, owner ruling)": two grammar repairs of sentences the Windows
// deletions above broke, applied after them and to nothing else.
const AMENDMENT_EDITS = [
  ['Linux always return full accessibility state.', 'Linux always returns full accessibility state.'],
  ['Linux app `paste` support only `text` and use the platform\'s native text input.', 'Linux app `paste` supports only `text` and uses the platform\'s native text input.'],
];

test('the vendor fixtures are the pinned chatgpt-26.928.40906 documents', () => {
  for (const [name, hash] of Object.entries(PINNED)) assert.equal(sha(read(VENDOR, name)), hash, name);
  const dir = process.env.CUA_VENDOR_DOCS;
  if (dir) for (const name of Object.keys(PINNED)) assert.equal(readFileSync(join(dir, name), 'utf8'), read(VENDOR, name), `${name} against ${dir}`);
});

test('core.md is the vendor first-call document with exactly the Table 2/3 edits, then the Table 3 amendment', () => {
  assert.equal(read(DOCS, 'core.md'), applyEdits(applyEdits(read(VENDOR, 'tinysky-alt-core-cua-repl.md'), CORE_EDITS), AMENDMENT_EDITS));
});

test('the confirmations policy and the "Other Browser APIs" document are the vendor bytes', () => {
  assert.equal(read(DOCS, 'confirmations.md'), read(VENDOR, 'tinysky-alt-confirmations.md'));
  assert.equal(read(DOCS, 'other-browser-apis.md'), read(VENDOR, 'tinysky-alt-other-browser-apis.md'));
});

test('no excluded provider, platform or product name survives in the first-call document', () => {
  const core = read(DOCS, 'core.md');
  for (const word of [/\bWindows\b/, /"windows"/, /\biab\b/, /mcpapps/, /MCP App/, /codexSessionId/, /Orbit/, /ChatGPT/, /Codex/])
    assert.equal(word.test(core), false, String(word));
  assert.ok(core.includes('# Computer Use') && core.endsWith('explain a concrete blocker you cannot resolve.\n'));
});

test('docs/cua-api holds only the shipped documents and their provenance', () => {
  assert.deepEqual(readdirSync(DOCS).sort(), ['PROVENANCE.md', 'agent-cursor.md', 'confirmations.md', 'core.md', 'other-browser-apis.md']);
});

// The surface inventory's "Table 3 addition (2026-10-30, #235)": cua's own paragraph, not the vendor's, on what the
// person sees while the agent acts (docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md, M3).
const AGENT_CURSOR = 'While you act in an app, a cursor labelled with this session\'s name shows the user where each action lands, unless the user has turned it off, and fades a few seconds after your last action. Your actions do not wait for it, it is not the user\'s pointer, and your screenshots do not show it.\n';
// The surface inventory's "Table 3 addition (2026-11-05, #282)", "(2026-11-05, #283)", "(2026-11-07, #315)" and
// "(2026-11-08, #318)": cua's own paragraph on background clicks into a Chromium or Firefox web page, which cua's macOS
// engine element-routes, focuses, refuses or leaves unconfirmed, and on a Firefox toolbar click left unconfirmed, in the
// same macOS-only document.
const BACKGROUND_CLICKS = '\nA web page in a Chromium-based app (Chrome, Electron apps) or in Firefox that is in the background does not take a pointer: unless this Mac is a dedicated desktop, a left click, double click or drag there is refused with "<App>\'s web page does not accept a background click; use a dedicated desktop, or ask the person to bring <App> forward", and nothing is sent. A plain click there on a button, checkbox, radio button, link, pop-up button or menu item goes through the accessibility action of that element instead, and one on a checkbox or radio button whose state does not change fails with `clickUnconfirmed`. A plain click there into a text field, text area or editable region gives it keyboard focus through accessibility instead, with no mouse event, so the page sees no click; the result\'s text says whether the caret was put at the point, and when it was not, typing goes to the field\'s existing selection or its start, so use select_text or set_value first if the position matters. In Firefox the field is focused by its own accessibility action instead, which does not put the caret at the point. A field that does not report focus fails with `clickUnconfirmed`. Unless this Mac is a dedicated desktop, a click on a background Firefox window outside its page, on the toolbar for instance, fails with `clickUnconfirmed` even when it took effect, as Reload does. A click or drag that fails with `clickUnconfirmed` was sent but may only have activated the window: observe the app before any retry.\n';
// The third (the surface inventory's "Table 3 addition (2026-11-06, #296)", its second half "(2026-11-08, #316)"): the
// stale-point guard's refusal, and what it still cannot see.
const STALE_POINT = '\nA click or drag at coordinates is checked against the screenshot the coordinates came from: when what that screenshot showed at the point is gone, has moved off it, or has given way to another control, it fails with `screenChangedSinceScreenshot` and nothing is sent. Take a new screenshot and give the coordinates in it. The check reads the accessibility tree at the point, and also refuses a click or drag when the app has opened a new window over the one in the screenshot, or when the point has left the page the screenshot showed. It still cannot see a page\'s own suggestion list, which can take a click aimed at a control under it, or text that has moved within the same text view (after Return or a paste in TextEdit). After typing into a field that offers suggestions, or editing text above the point, take a new screenshot before clicking at coordinates. When a screenshot shows a panel over the page, aim at what the screenshot shows, not at the page\'s elements under it.\n';

// The fourth (the surface inventory's "Table 3 addition (2026-11-06, #301)"): the truncation marker of a walk the
// node budget cut, which keeps what the window shows first.
const TRUNCATION = '\nWhen a window holds more than its accessibility tree can list, the tree lists what the window shows first, in its usual order, and ends with a line such as `[truncated: at least 1234 elements omitted, above and below the visible area]`, the count a lower bound and the words saying which way the omitted elements lie. To reach an element the tree does not list, scroll toward it and call `getAXState()` again. A visible control inside a container that reports a collapsed frame can still be left out. In a Chromium-based app, a table\'s column and header elements take new element IDs at every observation.\n';

test('agent-cursor.md is the Table 3 additions\' paragraphs, and the core carries it only where the facade asks for it', async () => {
  assert.equal(read(DOCS, 'agent-cursor.md'), AGENT_CURSOR + BACKGROUND_CLICKS + STALE_POINT + TRUNCATION);
  const read_ = async name => `<${name}>`;
  assert.equal(await create_documentation(read_).read_core(), '<core-cua-repl>\n<confirmations>');
  assert.equal(await create_documentation(read_, {agentCursor: () => false}).read_core(), '<core-cua-repl>\n<confirmations>');
  assert.equal(await create_documentation(read_, {agentCursor: () => true}).read_core(), '<core-cua-repl>\n<agent-cursor>\n<confirmations>');
});

test('the documents ship with the package, so an installed plugin reads them without the source tree', () => {
  const {files} = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.ok(files.includes('docs/cua-api/') && files.includes('src/'), JSON.stringify(files));
});
