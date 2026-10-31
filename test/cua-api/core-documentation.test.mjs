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

// The surface inventory's "Table 3 amendment (2026-10-30, #235)": one sentence pair added after the Native apps
// section's last paragraph, what the person sees while an agent acts on macOS (the agent cursor's spec,
// docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md, M3), applied after the 2026-10-15 amendment.
const ADDITION_EDITS = [
  ['Coordinates are relative to the selected window.\n', 'Coordinates are relative to the selected window.\n\nOn macOS, unless the user has turned it off, a cursor labelled with this session\'s name shows the user where each of your actions in an app lands, and fades a few seconds after your last one. Your actions do not wait for it, it is not the user\'s pointer, and your screenshots do not show it.\n'],
];

test('the vendor fixtures are the pinned chatgpt-26.928.40906 documents', () => {
  for (const [name, hash] of Object.entries(PINNED)) assert.equal(sha(read(VENDOR, name)), hash, name);
  const dir = process.env.CUA_VENDOR_DOCS;
  if (dir) for (const name of Object.keys(PINNED)) assert.equal(readFileSync(join(dir, name), 'utf8'), read(VENDOR, name), `${name} against ${dir}`);
});

test('core.md is the vendor first-call document with exactly the Table 2/3 edits, then the Table 3 amendments', () => {
  assert.equal(read(DOCS, 'core.md'), applyEdits(applyEdits(applyEdits(read(VENDOR, 'tinysky-alt-core-cua-repl.md'), CORE_EDITS), AMENDMENT_EDITS), ADDITION_EDITS));
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
  assert.deepEqual(readdirSync(DOCS).sort(), ['PROVENANCE.md', 'confirmations.md', 'core.md', 'other-browser-apis.md']);
});

test('the documents ship with the package, so an installed plugin reads them without the source tree', () => {
  const {files} = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.ok(files.includes('docs/cua-api/') && files.includes('src/'), JSON.stringify(files));
});
