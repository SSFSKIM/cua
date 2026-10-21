// The live hold's pure parts (scripts/native-matrix/live-checks.mjs): what the checks read off cua's Skyshots and the
// vendor's text, how each check's result is judged, the refusals before anything is prepared, and the put-back plan.
// Driven by the committed TextEdit goldens (real captures from the mini) and small hand-made trees; nothing runs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {
  ABC, FIRST_LINE, KOREAN_2SET, LAST_LINE, NEVER_TOUCHED, allSelected, enablementOf, enablementVerdict, failureOf, firstLineBold, frontAppAction,
  inputSourceVerdict, liveRefusals, menuBarItem, menuComparison, menuItemAt, minimizeButton, minimizedVerdict, parsePerContext, perContextRestore,
  putBackPlan, restoreTarget, textArea, vendorMenuBarIndex, vendorMenuItem, vendorSelectedText, vendorTextAreaIndex,
} from '../../scripts/native-matrix/live-checks.mjs';
import {SkyComputerUseError} from '../../src/services/engine/protocol.mjs';

const GOLDENS = new URL('../native-goldens/textedit/', import.meta.url);
const shot = name => JSON.parse(fs.readFileSync(new URL(name, GOLDENS), 'utf8'));
const vendorText = name => fs.readFileSync(new URL(name, GOLDENS), 'utf8');

// A menu-rooted Skyshot as M2a.2 builds it: the recorded item, its menu, the menu items (a submenu under Font).
const node = (token, depth, role, title, extra = {}) => ({token, depth, role, subrole: null, title, flags: {enabled: true, ...(extra.flags ?? {})}, actions: ['AXPress'], ...extra});
const rooted = (title, items) => ({lineage: 'L1', nodes: [node('t70', 0, 'AXMenuBarItem', title), node('t71', 1, 'AXMenu', null), ...items], menuBar: [], selectedText: null, screenshot: null});

test('the scene readers find the text area, the minimize button and the menu-bar items in a real TextEdit capture', () => {
  const s = shot('skyshot.json');
  assert.equal(textArea(s).token, 't2');
  assert.equal(minimizeButton(s).token, 't49');
  assert.equal(menuBarItem(s, 'Edit').token, 't56');
  assert.equal(menuBarItem(s, 'Format').token, 't57');
  assert.equal(menuBarItem(s, 'Nope'), null);
  assert.ok(textArea(s).valueMarkdown.startsWith(FIRST_LINE));
  assert.equal(firstLineBold(textArea(s).valueMarkdown), false, 'the scene\'s first line is plain; only "Bold scene line" is bold');
});

test('menuItemAt follows a path through submenus by depth and reads only inside the parent\'s subtree', () => {
  const s = rooted('Format', [
    node('t72', 2, 'AXMenuItem', 'Font'), node('t73', 3, 'AXMenu', null), node('t74', 4, 'AXMenuItem', 'Show Fonts'), node('t75', 4, 'AXMenuItem', 'Bold', {flags: {enabled: false}}),
    node('t76', 2, 'AXMenuItem', 'Text'), node('t77', 3, 'AXMenu', null), node('t78', 4, 'AXMenuItem', 'Bold'),
  ]);
  assert.equal(menuItemAt(s, ['Font', 'Bold']).token, 't75');
  assert.equal(menuItemAt(s, ['Font', 'Bold']).flags.enabled, false);
  assert.equal(menuItemAt(s, ['Text', 'Bold']).token, 't78');
  assert.equal(menuItemAt(s, ['Font', 'Italic']), null);
  // A submenu whose items are not exposed (filled lazily) has no path to them.
  assert.equal(menuItemAt(rooted('Format', [node('t72', 2, 'AXMenuItem', 'Font')]), ['Font', 'Bold']), null);
});

test('allSelected and firstLineBold read the run\'s own document, start to end', () => {
  const whole = ['cua scene document', 'Bold scene line', ...Array.from({length: 60}, (_, i) => `Line ${String(i + 1).padStart(2, '0')}`)].join('\n');
  assert.equal(FIRST_LINE, 'cua scene document');
  assert.equal(LAST_LINE, 'Line 60');
  assert.equal(allSelected(whole), true);
  assert.equal(allSelected(`${whole}\n`), true);
  assert.equal(allSelected('cua scene document'), false);
  assert.equal(allSelected(null), false);
  assert.equal(firstLineBold('**cua scene document**\n**Bold scene line**'), true);
  assert.equal(firstLineBold(null), false);
});

test('the vendor text readers find the menu bar\'s items, the text area and the selection in the vendor\'s grammar', () => {
  const full = vendorText('vendor.txt');
  assert.equal(vendorMenuBarIndex(full, 'Edit'), 54);
  assert.equal(vendorMenuBarIndex(full, 'Format'), 55);
  assert.equal(vendorMenuBarIndex(full, 'Nope'), null);
  assert.equal(vendorTextAreaIndex(full, FIRST_LINE), 2);
  // A rooted text, as a diff with added lines, and an item's disabled flag.
  const menu = ['Window: "cua-scene.rtf", App: TextEdit.', '+70 Format', '+\t71 menu', '+\t\t72 Font', '+\t\t\t73 menu', '+\t\t\t\t74 Show Fonts',
    '+\t\t\t\t75 (disabled) Bold, Secondary Actions: Cancel', '+\t\t76 Text', '+\t\t\t77 menu', '+\t\t\t\t78 Bold', '+\t\t79 Select All'].join('\n');
  assert.deepEqual(vendorMenuItem(menu, ['Font', 'Bold']), {index: 75, enabled: false});
  assert.deepEqual(vendorMenuItem(menu, ['Text', 'Bold']), {index: 78, enabled: true});
  assert.deepEqual(vendorMenuItem(menu, ['Select All']), {index: 79, enabled: true});
  assert.equal(vendorMenuItem(menu, ['Font', 'Italic']), null);
  assert.equal(vendorSelectedText('x\nSelected text: ```\ncua scene document\nLine 01\n```\n\nnote'), 'cua scene document\nLine 01');
  assert.equal(vendorSelectedText(full), null);
});

test('the vendor text readers are self-contained, so a cell can embed them by their source', () => {
  for (const fn of [vendorMenuBarIndex, vendorMenuItem, vendorSelectedText, vendorTextAreaIndex]) {
    const embedded = new Function(`return (${fn.toString()});`)();
    assert.equal(typeof embedded, 'function');
  }
  const embedded = new Function(`return (${vendorMenuItem.toString()});`)();
  assert.deepEqual(embedded('+0 Edit\n+\t1 menu\n+\t\t2 Select All', ['Select All']), {index: 2, enabled: true});
});

test('failureOf keeps the error name, a bounded sentence and whether anything was posted, never more', () => {
  const error = new SkyComputerUseError({code: -10005, reason: `The TextEdit window is minimized, so nothing can be clicked ${'x'.repeat(400)}`, errorName: 'windowMinimized',
    meta: {inputRoute: null, startedAt: null, endedAt: null}});
  const out = failureOf(error);
  assert.equal(out.errorName, 'windowMinimized');
  assert.ok(out.message.length <= 300);
  assert.equal(out.posted, false);
  assert.equal(failureOf(new Error('boom')).errorName, null);
  assert.equal(failureOf(Object.assign(new Error('x'), {errorName: 'userIntervened', meta: {startedAt: 5, endedAt: 6}})).posted, true);
});

test('minimizedVerdict: the observation, the refusal and the Accessibility routes are expectations; typing and the ⌘A are recorded', () => {
  const steps = {
    minimize: {ok: true, minimized: true},
    observe: {ok: true, treePresent: true, textArea: true, screenshotNull: true, screenshotOmitted: 'windowMinimized'},
    click: {ok: false, refused: true, errorName: 'windowMinimized', namesMinimized: true, posted: false},
    setValue: {ok: true, valueMatches: true},
    selectText: {ok: true, selectionMatches: true},
    typeText: {ok: true, valueChanged: false, route: "2'"},
    selectAll: {ok: true, effect: false, route: "2'"},
    restore: {ok: true, onScreen: true},
  };
  const out = minimizedVerdict(steps);
  assert.equal(out.pass, true);
  assert.deepEqual(out.recorded, {typeTextValueChanged: false, superAEffect: false});
  // The two outcomes decide two refusals apart (M2a.4's ruling): plain typing decides type_text and press_key without ⌘;
  // ⌘A decides ⌘ chords, refused only when it did not act. All four combinations read as their consequences.
  const REFUSE_PLAIN = 'refuse type_text and press_key without ⌘ into a minimized window: typed text did not reach it';
  const ALLOW_PLAIN = 'type_text and press_key without ⌘ stay allowed: typed text reached the minimized window';
  const REFUSE_CHORDS = 'refuse ⌘ chords into a minimized window too: ⌘A did not act';
  const ALLOW_CHORDS = '⌘ chords stay allowed: ⌘A acted with the window minimized';
  assert.deepEqual(out.decision, {plainKeys: REFUSE_PLAIN, commandChords: REFUSE_CHORDS});
  const combo = (valueChanged, effect) => minimizedVerdict({...steps, typeText: {ok: true, valueChanged}, selectAll: {ok: true, effect}});
  assert.deepEqual(combo(false, true).decision, {plainKeys: REFUSE_PLAIN, commandChords: ALLOW_CHORDS});
  assert.deepEqual(combo(true, false).decision, {plainKeys: ALLOW_PLAIN, commandChords: REFUSE_CHORDS});
  assert.deepEqual(combo(true, true).decision, {plainKeys: ALLOW_PLAIN, commandChords: ALLOW_CHORDS});
  assert.equal(combo(true, true).pass, true);
  assert.deepEqual(combo(false, null).decision, {plainKeys: REFUSE_PLAIN, commandChords: null});
  assert.equal(combo(false, null).pass, false, 'an outcome not recorded is no result');
  const leaked = minimizedVerdict({...steps, observe: {...steps.observe, screenshotNull: false, screenshotOmitted: null}});
  assert.equal(leaked.pass, false);
  assert.deepEqual(leaked.failed, ['screenshotNull', 'screenshotOmitted']);
  const posted = minimizedVerdict({...steps, click: {...steps.click, posted: true}});
  assert.deepEqual(posted.failed, ['clickRefusedNothingPosted']);
  const unrestored = minimizedVerdict({...steps, restore: {ok: false, onScreen: false}});
  assert.deepEqual(unrestored.failed, ['restored']);
  const missing = minimizedVerdict({minimize: steps.minimize});
  assert.equal(missing.pass, false);
  assert.deepEqual(missing.decision, {plainKeys: null, commandChords: null});
});

test('menuComparison: per item the enabled state and the effect on each lane, and what the pair decides', () => {
  const works = {found: true, enabled: true, clicked: true, effect: true};
  const both = menuComparison({selectAll: works, bold: works}, {selectAll: works, bold: works});
  assert.equal(both.decision, 'no activation: cua reads the responder-chain items enabled and they act without it');
  assert.equal(both.items.selectAll.same, true);
  const disabled = menuComparison({selectAll: {...works, enabled: false, clicked: false, effect: false}, bold: works}, {selectAll: works, bold: works});
  assert.equal(disabled.decision, 'the menu path takes activation: cua reads an item disabled or it does nothing where the vendor\'s works');
  assert.equal(disabled.items.selectAll.same, false);
  const vendorFails = menuComparison({selectAll: works, bold: works}, {selectAll: {...works, effect: false}, bold: works});
  assert.equal(vendorFails.decision, 'no activation: cua reads the responder-chain items enabled and they act without it');
  assert.equal(vendorFails.items.selectAll.cuaBetter, true);
  const unexposed = menuComparison({selectAll: works, bold: {found: false}}, {selectAll: works, bold: works});
  assert.equal(unexposed.decision, 'undecided: an item was not exposed or a lane is missing');
  assert.equal(menuComparison({selectAll: works, bold: works}, null).decision, 'undecided: an item was not exposed or a lane is missing');
});

test('enablementOf and enablementVerdict: a second connection\'s observation that sets the attribute again shows the release', () => {
  assert.deepEqual(enablementOf({enable: 0.4, enabled: 'AXManualAccessibility', webShaped: true, chromium: true, webAreaWait: 120, webAreaFound: true, nodes: 83}),
    {set: 'AXManualAccessibility', webShaped: true, chromium: true, webAreaSeen: false, webAreaFound: true});
  const first = {set: 'AXManualAccessibility', webShaped: true, chromium: true, webAreaSeen: false, webAreaFound: true};
  const released = enablementVerdict({first, second: first});
  assert.equal(released.released, true);
  assert.match(released.diagnostic, /false from unreadable/);
  const kept = enablementVerdict({first, second: {set: null, webShaped: true, chromium: true, webAreaSeen: true, webAreaFound: null}});
  assert.equal(kept.released, false);
  assert.equal(enablementVerdict({first: {...first, set: null}, second: first}).released, null, 'the first connection never set it: nothing to release');
});

test('inputSourceVerdict: selected, read back as Korean 2-Set, and the owner\'s source and preference restored', () => {
  const saved = {source: {id: ABC}, perContext: false};
  const ok = inputSourceVerdict({saved, selected: {selected: true, current: {id: KOREAN_2SET}}, readBack: {id: KOREAN_2SET}, restored: {source: ABC, sourceRestored: true, perContextRestored: true}});
  assert.equal(ok.pass, true);
  const notRead = inputSourceVerdict({saved, selected: {selected: true, current: {id: KOREAN_2SET}}, readBack: {id: ABC}, restored: {sourceRestored: true, perContextRestored: true}});
  assert.deepEqual(notRead.failed, ['readBack']);
  const notRestored = inputSourceVerdict({saved, selected: {selected: true}, readBack: {id: KOREAN_2SET}, restored: {sourceRestored: false, perContextRestored: true}});
  assert.deepEqual(notRestored.failed, ['sourceRestored']);
});

test('the per-context preference: parsed from defaults, restored only where it differs, never invented', () => {
  assert.equal(parsePerContext('{\n    TextInputGlobalPropertyPerContextInput = 1;\n}\n'), true);
  assert.equal(parsePerContext('{\n    TextInputGlobalPropertyPerContextInput = 0;\n}'), false);
  assert.equal(parsePerContext('{\n    SomethingElse = 1;\n}'), null);
  assert.equal(parsePerContext(null), null);
  assert.deepEqual(perContextRestore(true, true), {write: false});
  assert.deepEqual(perContextRestore(false, true), {write: true, value: false});
  assert.deepEqual(perContextRestore(true, null), {write: true, value: true});
  assert.match(perContextRestore(null, true).unrestorable, /System Settings/);
  assert.deepEqual(perContextRestore(null, null), {write: false});
});

test('restoreTarget: the owner\'s saved source, ABC only when nothing was saved', () => {
  assert.equal(restoreTarget({source: {id: 'com.apple.keylayout.US'}}), 'com.apple.keylayout.US');
  assert.equal(restoreTarget(null), ABC);
  assert.equal(restoreTarget({source: {}}), ABC);
});

test('liveRefusals: the scenes\' refusals, a dirty or other checkout, a wrong engine, scenes a dead run left up', () => {
  const clean = {preflight: {refusals: []}, checkout: {commit: 'c1', dirty: false}, engine: {ok: true, problems: []}, state: {scenes: {}}};
  assert.deepEqual(liveRefusals(clean, {controllerCommit: 'c1'}), []);
  const all = liveRefusals({preflight: {refusals: [{message: 'TextEdit is running and is not the run\'s'}]}, checkout: {commit: 'c2', dirty: true},
    engine: {ok: false, problems: ['no approved engine on this Mac']}, state: {scenes: {textedit: {}}}}, {controllerCommit: 'c1'});
  assert.equal(all.length, 5);
  assert.match(all.join('\n'), /TextEdit is running/);
  assert.match(all.join('\n'), /uncommitted/);
  assert.match(all.join('\n'), /c2.*c1|c1.*c2/);
  assert.match(all.join('\n'), /no approved engine/);
  assert.match(all.join('\n'), /left textedit up.*cleanup/);
});

test('putBackPlan: Finder\'s teardown before the scenes go down, the engine stopped after, the front app last', () => {
  assert.deepEqual(putBackPlan({scenesUp: ['textedit', 'finder'], inputSourceSaved: true, frontSaved: true}),
    ['finder-teardown', 'scenes-down', 'input-source', 'engine-stop', 'apps-check', 'front-app']);
  assert.deepEqual(putBackPlan({scenesUp: [], inputSourceSaved: false, frontSaved: false}), ['scenes-down', 'engine-stop', 'apps-check']);
  assert.deepEqual(putBackPlan({scenesUp: ['chrome'], inputSourceSaved: false, frontSaved: true}), ['scenes-down', 'engine-stop', 'apps-check', 'front-app']);
});

test('frontAppAction: the owner\'s app back in front, except the owner\'s Chrome and Claude, which are never touched', () => {
  assert.deepEqual(frontAppAction({pid: 5, bundleId: 'com.apple.Terminal'}), {reactivate: true});
  for (const bundleId of NEVER_TOUCHED) assert.equal(frontAppAction({pid: 5, bundleId}).reactivate, false);
  assert.ok(NEVER_TOUCHED.includes('com.google.Chrome') && NEVER_TOUCHED.includes('com.anthropic.claudefordesktop'));
  assert.equal(frontAppAction(null).reactivate, false);
});
