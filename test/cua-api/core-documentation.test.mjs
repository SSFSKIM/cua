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
// same macOS-only document; with a sentence from "(2026-11-16, #360)": an arrow key in a background Firefox focuses
// the field first; its last sentence the "(2026-11-17, #366)" as amended by rulings 772 and 775: a first observation's
// wait in a Chromium app, in each task and after 5 minutes idle.
const BACKGROUND_CLICKS = '\nA web page in a Chromium-based app (Chrome, Electron apps) or in Firefox that is in the background does not take a pointer: unless this Mac is a dedicated desktop, a left click, double click or drag there is refused with "<App>\'s web page does not accept a background click; use a dedicated desktop, or ask the person to bring <App> forward", and nothing is sent. A plain click there on a button, checkbox, radio button, link, pop-up button or menu item goes through the accessibility action of that element instead, and one on a checkbox or radio button whose state does not change fails with `clickUnconfirmed`. A plain click there into a text field, text area or editable region gives it keyboard focus through accessibility instead, with no mouse event, so the page sees no click; the result\'s text says whether the caret was put at the point, and when it was not, typing goes to the field\'s existing selection or its start, so use select_text or set_value first if the position matters. In Firefox the field is focused by its own accessibility action instead, which does not put the caret at the point. A field that does not report focus fails with `clickUnconfirmed`. Unless this Mac is a dedicated desktop, a click on a background Firefox window outside its page, on the toolbar for instance, can fail with `clickUnconfirmed` even when it took effect, as Reload does. A click or drag that fails with `clickUnconfirmed` was sent but may only have activated the window: observe the app before any retry. In a Firefox window in the background, a `pressKey` of an arrow key, with or without modifiers, first focuses the field the key goes to, which the page can see as a focus event. The first observation of a Chromium-based app in each task (each end_task ends one), and again after 5 minutes without observing or acting on it, may take up to about 2.5 s longer while the app turns on its accessibility, and an action sent before then waits for it.\n';
// The third (the surface inventory's "Table 3 addition (2026-11-06, #296)", its second half "(2026-11-08, #316)" as
// amended by "(2026-11-08, #330)", "(2026-11-09, #298)", "(2026-11-20, #452)" and "(2026-11-20, #454)"): the stale-point
// guard's refusal, a menu item's click, and what it still cannot see.
const STALE_POINT = '\nA click or drag at coordinates is checked against the screenshot the coordinates came from: when what that screenshot showed at the point is gone, has moved off it, has given way to another control, or has been relabelled (a Save button that now reads Delete), it fails with `screenChangedSinceScreenshot` and nothing is sent. Take a new screenshot and give the coordinates in it. The check reads the accessibility tree at the point, and also refuses a click or drag when the app has opened a new window over the one in the screenshot, when the point has left the page the screenshot showed, or when a web page has added an element over the point since the screenshot, such as a suggestion list or popup. A click or drag on a window the app itself shows over the one in the screenshot, such as Chrome\'s address-bar suggestions, its popup of a field\'s `<datalist>` suggestions, a permission prompt or a popover, fails with `appWindowOverPoint` and nothing is sent, even when the screenshot shows that window, because the click would reach the window under it: use keys instead (the arrow keys and Return to take a suggestion, Escape to close the list), or call `getAXState()` and click an element it lists. A click on an item of a menu the app shows in a window of its own (the list of a pop-up button or a `<select>`, a context menu) goes through the item\'s own accessibility action instead, since a click posted there would only close the menu: it succeeds once the menu has closed and the control it belongs to has moved to the item, and otherwise fails with `clickUnconfirmed` (as an item of a context menu does, having no such control, and the item already chosen), so observe the app before any retry. When the item is not the one the screenshot showed at the point, or is disabled or takes no action, the click fails with `appWindowOverPoint` and nothing is sent: use the arrow keys to the item and Return, or click the menu item `getAXState()` lists by its element. A menu whose items the accessibility tree does not list at the point (a menu-bar menu or its submenu) fails the same way, with nothing sent: a click outside it closes it, and if a fresh `getAXState()` lists the item (a menu-bar menu\'s items, after its title in the menu bar is clicked by its element), click the item by its element. A suggestion list the page shows without adding elements (one shown by opacity, or moved into place) still takes a click aimed at the control under it. In Chrome, so can a list that overflows its field\'s container, because Chrome\'s hit-test answers the covered control. The check still cannot see text that has moved within the same text view (after Return or a paste in TextEdit), a label that changed only in its numbers (a list row reused from "Order #1234" for "Order #1235"), or a toggle switched with its label unchanged. After typing into a field that offers suggestions, press Escape or take a new screenshot before clicking near it. After editing text above the point, take a new screenshot before clicking at coordinates. When a screenshot shows a panel over the page, aim at what the screenshot shows, not at the page\'s elements under it.\n';
// The fourth (the surface inventory's "Table 3 addition (2026-11-08, #328)"): a point outside the screenshot refused,
// so a drag cannot leave the window (#334), and a scroll's answer: success when it moved or was at its end (with the
// text saying so), else scrollUnconfirmed; and a Show Menu's (the "Table 3 addition (2026-11-15, #374)"): success once a
// menu was seen to open, else menuUnconfirmed; and a set_value's (ruling 772's "(2026-11-17, #366)"): valueUnconfirmed when
// the field cannot be found again after an accepted write, and ("(2026-11-17, #359)") when, within a second of a click,
// it reads another value or its caret moved off the new value's end; and its last from "(2026-11-17, #390)": a
// background Chromium page's field set without a click, ok only once it reads back, never for a secret or a password field.
const OUTSIDE_AND_SCROLL = '\nA click, scroll or drag at coordinates outside the screenshot they came from fails with `pointOutsideScreenshot` and nothing is sent: give a point inside it, from 0 to its width less one across and from 0 to its height less one down, in its pixels. So a drag cannot end outside the app\'s window, on another app or the desktop. A scroll succeeds only once what is at its point was seen to move, or when that was already scrolled as far as it goes that way, in which case the result\'s text says so. Otherwise it fails with `scrollUnconfirmed`: the scroll was sent but nothing was seen to move, so observe the app (a new screenshot or `getAXState()`) before scrolling again. A Show Menu (`performSecondaryAction` with "Show Menu") succeeds only once a menu was seen to open. Otherwise it fails with `menuUnconfirmed`: the action was sent but no menu was seen within 1 s, and the app may have shown a menu of its own that accessibility does not expose (a web page\'s own menu, which a screenshot shows) or ignored the request, so observe the app before any retry. A Show Menu that succeeds means a menu appeared, not which one: if something else opens a menu in the same window within that second, its success can be that menu\'s, so check what the next observation shows before choosing an item. A `setValue` whose value was sent and accepted but whose field could not be found again afterwards fails with `valueUnconfirmed`: the value may have been entered, so observe the app before any retry. Within a second after a click in the same app, a `setValue` whose field then reads another value, or whose caret moves off the end of the new value (as a click the app takes in late moves it), also fails with `valueUnconfirmed`. Unless this Mac is a dedicated desktop, a `setValue` on a text field of a web page in a Chromium-based app in the background, when the field does not already have keyboard focus, sets the value without a click and then reads it back: it succeeds only once the field reads the new value, and otherwise fails with `valueUnconfirmed`, as it always does there for a `{{secret:…}}` or a password field, whose value is never read back, so observe the field before any retry. The field becomes the focused element of the page, but the page gets no focus or blur event for it, so anything a page does only on focus, such as opening a list of suggestions, does not happen.\n';

// The fifth (the surface inventory's "Table 3 addition (2026-11-06, #301)", its last sentences from "(2026-11-16,
// #367)" as amended by "(2026-11-17, #367, ruling 1ea561bc:782)"): the truncation marker of a walk the node budget cut,
// which keeps what the window shows first, and the line of a window off screen, its remedy and the windowOnAnotherSpace
// refusal.
const TRUNCATION = '\nWhen a window holds more than its accessibility tree can list, the tree lists what the window shows first, in its usual order, and ends with a line such as `[truncated: at least 1234 elements omitted, above and below the visible area]`, the count a lower bound and the words saying which way the omitted elements lie. To reach an element the tree does not list, scroll toward it and call `getAXState()` again. A visible control inside a container that reports a collapsed frame can still be left out. In a Chromium-based app, a table\'s column and header elements take new element IDs at every observation. When the app\'s window lies outside every display or on another Space, the tree says so in a line such as `[window off screen: …]`, the window may show no content, and `getScreenshot()` fails naming the reason; ask the user to move it onto a display, or to bring it here or switch to its Space. Some apps\' windows on another Space make observing the app fail with `windowOnAnotherSpace` instead, and a window\'s Raise action fails the same way there, with nothing sent.\n';

// The sixth (the surface inventory's "Table 3 addition (2026-11-10, #354)"): typeText's read-back and what
// `typeUnconfirmed` asks of the model, the OS's substitutions, keys in the text, and setValue over a select-all key;
// with a sentence from "(2026-11-17, #359)": the wait after a click, and typeText after selectText typing nothing once
// a late click moved its selection; and one from "(2026-11-17, #359, ruling 1ea561bc:788)": a click landing after the
// wait makes typeText unconfirmed, the text perhaps in at the click's point; and one from "(2026-11-17, #405)": an
// observation shows nothing of a password field's text or length, and selectText cannot select in it; as amended by
// "(2026-11-18, #395, ruling 1ea561bc:824)": background Safari's large page no longer named as failing; and by
// "(2026-11-18, #414, rulings 1ea561bc:826, 833 and 839)": a password field confirmed by its length (keys alone
// claiming none), or by its caret alone where it reports no length, either held for 220 ms within 680 ms (ruling 1ea561bc:842), a
// failure's time that can depend on the text typed (ruling 1ea561bc:851), and so can its reason
// (ruling 1ea561bc:856; widened by the review of 3b67bf4d..8bc291f1), what that proves and what it cannot, when it
// fails, one that stops being a password field while it is typed, Firefox naming its page as focused, and typeText
// right after selectText typing nothing into one.
const TYPING = '\n`typeText` reads the focused field back after typing, and succeeds only once the field holds what it held before with its selection replaced by the text; for an app in the background that names no focused field, it looks through the app\'s front window for the one text field that reads as focused, and reads that one. Otherwise it fails with `typeUnconfirmed`: the text was sent, but the field does not read as expected, so some of it may have gone in. Observe the field with `getAXState()`, then put it right with `setValue`; do not type the text again. When the field reads other text, the error shows the expected and the actual text around the first difference; for a `{{secret:…}}` it says only that the field does not match. It fails the same way where the field cannot be read back, such as a field longer than accessibility reports in full. A password field\'s text is never read, so `typeText` checks its length instead: it succeeds only once the field has taken exactly as many characters as were typed, in place of any selection, with its caret right after them where the app reports one, and the result\'s text then says it was confirmed by its length only; text that is only a Tab, or only a Return in a single-line field, and not a `{{secret:…}}`, checks no length, so its result says nothing of one. A password field that reports no length at all is checked by its caret alone, which must move from an empty selection to right after the text. Either way, `typeText` succeeds only once the field has held that for 220 ms, and only if it took the text within 680 ms. When it fails, how long it took can depend on the text typed, a `{{secret:…}}` included, and so can its reason. A length shows that no character was dropped or added, not that the right ones went in: under another keyboard layout or an input method, or in a page that rewrites what is typed, the same number of other characters still succeeds. Where a password field\'s length cannot be read, or it reports no length while text is selected in it, or its selection cannot be read while it already holds text, `typeText` fails with `typeUnconfirmed`; a screenshot shows how many masked characters the field holds. A password field that stops being one while the text is typed, as a page\'s show-password button makes it, is read no further, and `typeText` fails with `typeUnconfirmed`; the field may then show its text, so if that is a secret, do not take a screenshot of it or call `getAXState()`, and put it right with `setValue`. In Firefox, accessibility can name the page rather than a password field as focused; `typeText` then fails as it does for an element that is not a text field, even when the text went in. An observation never shows the text of a password field or its length: its value reads `secure text`, and `selectText` cannot select in it, so `typeText` into a password field right after a `selectText` types nothing and fails with `typeUnconfirmed`; a screenshot shows what the field displays. Firefox in the background does not report its caret moving as text is typed, so a `{{secret:…}}` typed there fails with `typeUnconfirmed` even when it went in: observe the field to see whether it did. Typing into an element that is not a text field, such as Finder\'s list when you type a name to select a row, also fails with `typeUnconfirmed` once the keys are sent: observe the selection to see whether it moved. macOS\'s own text substitutions, such as a period added after a double space, automatic capitalisation or text completion, change what was typed, so they make `typeText` fail with `typeUnconfirmed`, never succeed silently. In a multi-line field a Return is checked like any other character, except in Firefox\'s editable regions, where it is handled as a Tab is; a Return that ends the text may read back with an empty last line, which counts as typed when the caret sits at that line\'s start, so where the caret cannot be read, a doubled ending Return may read as confirmed in a multi-line field. A Tab, or a Return in a single-line field, is pressed only once the text before it reads back, and what it does, such as moving to the next field or submitting a form, is not confirmed; inside a `{{secret:…}}` it is sent with the rest of the secret, which is checked once, at its end. To replace a field\'s text, use `setValue`, or `selectText` and then `typeText`, rather than a select-all key and typing: `pressKey` answers once its keys are sent, without confirming what an editing key such as super+a, super+z or super+v did, so text typed right after it can land before the key takes effect. `typeText` within a second of `pressKey` in the same app first waits, up to a tenth of a second, for the field to hold still before taking what it held as its starting point; a key whose effect lands later still can make `typeText` fail with `typeUnconfirmed` while the field holds the right text, so observe the field, as for any `typeUnconfirmed`, to see which. A click is sent at once but an app can take it in later, so within a second after a click in the same app, `selectText`, `setValue` and `typeText` first wait, up to about 0.3 s, for the field\'s selection to hold still; `typeText` right after `selectText` types only over the selection `selectText` made, and when a late click has moved it, it types nothing and fails with `typeUnconfirmed`: observe the app, then select the text again. A click can still land after that wait; then `typeText` fails with `typeUnconfirmed` rather than claiming the text, which may already have gone in at the click\'s point, so observe the field and put it right with `setValue`. Under an input source that is not a Latin keyboard layout, `typeText` pastes its text instead, a line at a time with a Return between lines, and reads the field back the same way, except that its error never quotes the field, so observe the field to see what it holds; a Tab is then pasted as text and checked like any other character, so what is said above of a Tab, that it is pressed with its effect not confirmed and that text of only a Tab checks no length, holds for typed keys only, and a Return between lines is pressed as soon as the field shows any change, before the text before it is read back, so a form that Return submits may have received text that went in wrong. In Firefox in the background, pasted text cannot yet be read back, so `typeText` fails there with `typeUnconfirmed` even when the text went in: observe the field to see whether it did.\n';

test('agent-cursor.md is the Table 3 additions\' paragraphs, and the core carries it only where the facade asks for it', async () => {
  assert.equal(read(DOCS, 'agent-cursor.md'), AGENT_CURSOR + BACKGROUND_CLICKS + STALE_POINT + OUTSIDE_AND_SCROLL + TRUNCATION + TYPING);
  const read_ = async name => `<${name}>`;
  assert.equal(await create_documentation(read_).read_core(), '<core-cua-repl>\n<confirmations>');
  assert.equal(await create_documentation(read_, {agentCursor: () => false}).read_core(), '<core-cua-repl>\n<confirmations>');
  assert.equal(await create_documentation(read_, {agentCursor: () => true}).read_core(), '<core-cua-repl>\n<agent-cursor>\n<confirmations>');
});

test('the documents ship with the package, so an installed plugin reads them without the source tree', () => {
  const {files} = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.ok(files.includes('docs/cua-api/') && files.includes('src/'), JSON.stringify(files));
});
