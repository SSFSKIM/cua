// The live hold's pure parts (scripts/native-matrix/live-checks.mjs): what the checks read off cua's Skyshots and the
// vendor's text, how each check's result is judged, the refusals before anything is prepared, and the put-back plan.
// Driven by the committed TextEdit goldens (real captures from the mini) and small hand-made trees; nothing runs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {
  ABC, FIRST_LINE, KOREAN_2SET, LAST_LINE, NEVER_OBSERVED, allSelected, alertWatch, enablementOf, failureOf, finderCheck, firstLineBold,
  compositionGuard, compositionReading, frontAppAction, inputSourceVerdict, liveRefusals, menuBarItem, menuComparison, menuItemAt, menuItemLabel, minimizeButton, minimizedVerdict,
  RECOVERY_BOUNDS, parseJournal, parseProcessTable, parsePerContext, putBackBoundMs, recoverBoundMs, recoveryPlan, pasteVerdict, perContextRestore, putBackPlan, restoreTarget, textArea, vendorMenuBarIndex, vendorMenuItem, vendorSelectedText, vendorTextAreaIndex,
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
  // A failed activation guard's time rides on the error (M2a.2's menu press and route 3 keep it).
  assert.equal(failureOf(Object.assign(new Error('x'), {errorName: 'activationFailed', meta: {inputRoute: 1, startedAt: null, activationGuardMs: 41.5}})).activationGuardMs, 41.5);
  assert.equal('activationGuardMs' in failureOf(error), false);
});

test('minimizedVerdict: the observation, the refusals and the Accessibility routes are expectations; typing and ⌘A each decide a policy', () => {
  const measured = (out) => ({...out, minimizedBefore: true, minimizedAfter: true});
  const steps = {
    minimize: {ok: true, minimized: true},
    observe: measured({ok: true, treePresent: true, textArea: true, screenshotNull: true, screenshotOmitted: 'windowMinimized'}),
    click: measured({ok: false, refused: true, errorName: 'windowMinimized', namesMinimized: true, posted: false}),
    scroll: measured({ok: false, refused: true, errorName: 'windowMinimized', posted: false}),
    setValue: measured({ok: true, valueMatches: true, posted: false}),
    selectText: measured({ok: true, selectionMatches: true, posted: false}),
    typeText: measured({ok: true, valueChanged: false, route: "2'"}),
    selectAll: measured({ok: true, effect: false, route: "2'"}),
    restore: {ok: true, onScreen: true},
  };
  const out = minimizedVerdict(steps);
  assert.equal(out.status, 'valid');
  assert.equal(out.pass, true, JSON.stringify(out.failed));
  assert.deepEqual(out.recorded, {typeTextValueChanged: false, superAEffect: false});
  // The focus click is skipped in a minimized window (62235d71): set_value and select_text post nothing.
  assert.deepEqual(minimizedVerdict({...steps, setValue: {...steps.setValue, posted: true}}).failed, ['setValueNoClick']);
  assert.deepEqual(minimizedVerdict({...steps, selectText: {...steps.selectText, posted: true}}).failed, ['selectTextNoClick']);
  // The hold's live reading (m2a/live/minimized/result.json): route 1 (an Accessibility write) has its own action
  // interval, so `posted` is no click; only the pointer route (3) is. selectText's selection did not match there.
  const live = {...steps,
    setValue: {ok: true, route: 1, posted: true, valueMatches: true, minimizedBefore: true, minimizedAfter: true},
    selectText: {ok: true, route: 1, posted: true, selectionMatches: false, minimizedBefore: true, minimizedAfter: true}};
  assert.deepEqual(minimizedVerdict(live).failed, ['selectTextActs'], 'no click on route 1');
  assert.deepEqual(minimizedVerdict({...steps, setValue: {...steps.setValue, route: 3, posted: true}}).failed, ['setValueNoClick'], 'route 3 is a click');
  assert.deepEqual(minimizedVerdict({...steps, selectText: {...steps.selectText, route: 3, posted: true}}).failed, ['selectTextNoClick']);
  // The element scroll's refusal is required: a scroll posted into a minimized window fails the check.
  assert.deepEqual(minimizedVerdict({...steps, scroll: measured({ok: true, route: 3, posted: true})}).failed, ['scrollRefused']);
  assert.deepEqual(minimizedVerdict({...steps, scroll: undefined}).failed, ['scrollRefused']);
  // Plain typing decides type_text and press_key without ⌘; ⌘A decides ⌘ chords and paste (maws-3f's correction).
  const REFUSE_PLAIN = 'refuse type_text and press_key without ⌘ into a minimized window: typed text did not reach it';
  const ALLOW_PLAIN = 'type_text and press_key without ⌘ stay allowed: typed text reached the minimized window';
  const REFUSE_CHORDS = 'refuse ⌘ chords and paste into a minimized window: ⌘A did not act';
  const ALLOW_CHORDS = '⌘ chords and paste go through: ⌘A acted with the window minimized';
  assert.deepEqual(out.decision, {plainKeys: REFUSE_PLAIN, commandChordsAndPaste: REFUSE_CHORDS});
  const combo = (valueChanged, effect) => minimizedVerdict({...steps, typeText: measured({ok: true, valueChanged}), selectAll: measured({ok: true, effect})});
  assert.deepEqual(combo(false, true).decision, {plainKeys: REFUSE_PLAIN, commandChordsAndPaste: ALLOW_CHORDS});
  assert.deepEqual(combo(true, false).decision, {plainKeys: ALLOW_PLAIN, commandChordsAndPaste: REFUSE_CHORDS});
  assert.deepEqual(combo(true, true).decision, {plainKeys: ALLOW_PLAIN, commandChordsAndPaste: ALLOW_CHORDS});
  // A key request that answers an error is inconclusive, never policy evidence.
  const intervened = minimizedVerdict({...steps, typeText: measured({ok: false, errorName: 'userIntervened', posted: true})});
  assert.equal(intervened.status, 'inconclusive');
  assert.equal(intervened.pass, false);
  assert.equal(intervened.decision.plainKeys, 'inconclusive: type_text answered userIntervened');
  assert.equal(intervened.decision.commandChordsAndPaste, REFUSE_CHORDS);
  assert.equal(minimizedVerdict({...steps, selectAll: measured({ok: false, errorName: 'timeoutReached'})}).decision.commandChordsAndPaste, 'inconclusive: press_key super+a answered timeoutReached');
  // Any measurement taken while the window was not minimized, before or after, invalidates the section.
  const unminimized = minimizedVerdict({...steps, selectText: {...steps.selectText, minimizedAfter: false}, invalid: {at: 'selectText'}});
  assert.equal(unminimized.status, 'invalid');
  assert.equal(unminimized.pass, false);
  assert.equal(unminimized.decision, null);
  assert.match(unminimized.reason, /selectText/);
  assert.equal(minimizedVerdict({...steps, typeText: {...steps.typeText, minimizedBefore: false}}).status, 'invalid', 'a step that reads un-minimized is invalid even unflagged');
  const leaked = minimizedVerdict({...steps, observe: {...steps.observe, screenshotNull: false, screenshotOmitted: null}});
  assert.deepEqual(leaked.failed, ['screenshotNull', 'screenshotOmitted']);
  assert.deepEqual(minimizedVerdict({...steps, click: {...steps.click, posted: true}}).failed, ['clickRefusedNothingPosted']);
  assert.deepEqual(minimizedVerdict({...steps, restore: {ok: false, onScreen: false}}).failed, ['restored']);
  const missing = minimizedVerdict({minimize: steps.minimize});
  assert.equal(missing.pass, false);
  assert.deepEqual(missing.decision, {plainKeys: null, commandChordsAndPaste: null});
});

test('menuComparison: per item each lane\'s label, and what the pair decides; only a valid cua item counts', () => {
  const works = {found: true, enabled: true, clicked: true, click: {ok: true, route: 1, activationGuardMs: 41}, effect: true, valid: true};
  const both = menuComparison({selectAll: works, bold: works}, {selectAll: works, bold: works});
  assert.equal(both.decision, 'parity: cua\'s held activation acts on every item the vendor\'s does');
  assert.equal(both.conclusive, true);
  assert.deepEqual(both.items.selectAll.cua, {label: 'acts', enabled: true, effect: true, route: 1, activationGuardMs: 41});
  assert.equal(both.items.selectAll.same, true);
  // Both lanes read an item disabled: nothing acted, so nothing is shown either way.
  const readDisabled = {...works, enabled: false, clicked: false, click: undefined, effect: false};
  const neither = menuComparison({selectAll: works, bold: readDisabled}, {selectAll: works, bold: {...works, enabled: false, effect: false}});
  assert.equal(neither.decision, 'inconclusive: no demonstrated success for bold: neither lane\'s item acts');
  assert.equal(neither.items.bold.vendor.label, 'read disabled');
  const disabled = menuComparison({selectAll: readDisabled, bold: works}, {selectAll: works, bold: works});
  assert.equal(disabled.decision, 'the held activation falls short: cua reads selectAll disabled or it does nothing where the vendor\'s works');
  assert.equal(disabled.items.selectAll.cua.label, 'read disabled');
  assert.equal(menuComparison({selectAll: {...works, effect: false}, bold: works}, {selectAll: works, bold: works}).items.selectAll.cuaWorse, true);
  const vendorFails = menuComparison({selectAll: works, bold: works}, {selectAll: {...works, effect: false}, bold: works});
  assert.equal(vendorFails.items.selectAll.cuaBetter, true);
  assert.match(menuComparison({selectAll: works, bold: {found: false}}, {selectAll: works, bold: works}).decision, /^undecided/);
  assert.match(menuComparison({selectAll: {...works, valid: false}, bold: works}, {selectAll: works, bold: works}).decision, /^undecided/, 'an invalid cua item decides nothing');
  assert.match(menuComparison({selectAll: works, bold: works}, null).decision, /^undecided/);
  assert.equal(menuComparison(null, {selectAll: works, bold: works}).conclusive, false);
});

test('menuItemLabel: not found, invalid, unattempted, read disabled, inconclusive, acts, no effect', () => {
  const base = {found: true, enabled: true, valid: true};
  assert.equal(menuItemLabel({found: false}), 'not found');
  assert.equal(menuItemLabel({...base, valid: false, clicked: true, click: {ok: true}, effect: true}), 'invalid');
  assert.equal(menuItemLabel({...base, attempted: false, reason: 'the lane lost the background condition'}), 'unattempted');
  assert.equal(menuItemLabel({...base, enabled: false, clicked: false}), 'read disabled');
  assert.equal(menuItemLabel({...base, clicked: false, click: {ok: false, errorName: 'activationFailed'}}), 'inconclusive');
  assert.equal(menuItemLabel({...base, clicked: true, click: {ok: true}, effect: true}), 'acts');
  assert.equal(menuItemLabel({...base, enabled: false, clicked: true, click: {ok: true}, effect: false}), 'no effect', 'a disabled item pressed in the on lane');
  assert.equal(menuItemLabel(undefined), 'not found');
});

test('enablementOf: the engine\'s enablement diagnostics, kept beside the enablement cell and never judged', () => {
  assert.deepEqual(enablementOf({enable: 0.4, enablementPrior: 'false', enabled: 'AXManualAccessibility', webShaped: true, chromium: true, webAreaWait: 120, webAreaFound: true, nodes: 83}),
    {prior: 'false', set: 'AXManualAccessibility', webShaped: true, chromium: true, webAreaFound: true});
  assert.equal(enablementOf({}).prior, null, 'an app listing neither attribute reports no prior');
});

test('pasteVerdict: the pastes land behind the user window, type_text takes the paste route under a met Korean precondition, the clipboard\'s types unchanged', () => {
  const met = {selected: true, readBack: KOREAN_2SET, perContextOff: true, met: true};
  const steps = {
    userInFront: [true, true, true],
    text: {ok: true, route: 'paste', posted: true, lands: true},
    markdown: {ok: true, route: 'paste', posted: true, lands: true, bold: true},
    typeText: {measured: true, ok: true, route: 'paste', posted: true, lands: true, entered: 27},
    precondition: met,
    inputSource: {restored: true, perContext: {read: true, setOff: true, restored: true}},
    pasteAlert: false,
    clipboard: {typesUnchanged: true},
  };
  const out = pasteVerdict(steps);
  assert.equal(out.pass, true, JSON.stringify(out.failed));
  assert.equal(out.typeText, 'measured');
  assert.deepEqual(out.recorded, {markdownBold: true, entered: 27, perContext: {read: true, setOff: true, restored: true}, sourceAfter: null});
  assert.equal(out.finding, null);
  // The precondition unmet: type_text is not measured and the verdict says so; no finding.
  const unmet = pasteVerdict({...steps, precondition: {...met, perContextOff: false, met: false}, typeText: {measured: false, reason: 'precondition unmet: the per-context preference still reads on'}});
  assert.equal(unmet.typeText, 'precondition unmet: the per-context preference still reads on');
  assert.deepEqual(unmet.failed, ['typeTextMeasured']);
  assert.equal(unmet.finding, null);
  // A met precondition followed by a keyed route: the engine finding, beside the failed expectation.
  const keyed = pasteVerdict({...steps, typeText: {measured: true, ok: true, route: "2'", lands: false, sourceAfter: KOREAN_2SET}});
  assert.deepEqual(keyed.failed, ['typeTextPasteRoute', 'typeTextLands']);
  assert.match(keyed.finding, /^engine finding: type_text keyed \(route 2'\) with Korean 2-Set selected and read back and the per-context preference off; the engine reports no source on the wire, and the probe read com\.apple\.inputmethod\.Korean\.2SetKorean right after$/);
  // An alert: the section aborted before type_text.
  const alerted = pasteVerdict({...steps, pasteAlert: true, typeText: undefined});
  assert.deepEqual(alerted.failed, ['typeTextMeasured', 'noPasteAlert']);
  assert.equal(alerted.typeText, 'not reached');
  assert.deepEqual(pasteVerdict({...steps, clipboard: {typesUnchanged: false}}).failed, ['clipboardTypesUnchanged']);
  assert.deepEqual(pasteVerdict({...steps, userInFront: [true, false, true]}).failed, ['userStaysInFront']);
  assert.deepEqual(pasteVerdict({...steps, markdown: {...steps.markdown, bold: false}}).failed, [], 'bold is recorded, not judged');
  assert.deepEqual(pasteVerdict({...steps, text: {ok: false, errorName: 'clipboardReadTimedOut', posted: true}}).failed, ['textLands']);
  assert.deepEqual(pasteVerdict({...steps, inputSource: {...steps.inputSource, restored: false}}).failed, ['inputSourceRestored']);
  assert.equal(pasteVerdict({}).pass, false);
});

test('alertWatch: system-alert processes are read by name; anything else new aborts but leaves only its layer; a pasteboard title leaves only the keyword', () => {
  const w = (number, ownerPid, extra = {}) => ({number, ownerPid, ownerName: 'Mail', ownerBundleId: 'com.apple.mail', layer: 0, name: 'Inbox — private', ...extra});
  const before = [w(1, 10), w(2, 11, {layer: 25, ownerName: 'Control Center', ownerBundleId: 'com.apple.controlcenter', name: null}), w(3, 600)];
  const runPids = [600, 700];
  const quiet = alertWatch(before, before, {runPids});
  assert.equal(quiet.abort, false);
  assert.deepEqual(quiet.export, {alerts: [], keywords: [], unknown: {count: 0, windows: []}});
  assert.equal(alertWatch(before, [...before, w(4, 600), w(5, 700, {layer: 8})], {runPids}).abort, false, 'the run\'s own windows are never alerts');
  // A system-alert process: abort; its bundle id leaves; it is the only owner whose text may be read.
  const unc = w(6, 12, {ownerName: 'UserNotificationCenter', ownerBundleId: 'com.apple.UserNotificationCenter', layer: 8, name: 'secret'});
  const alerted = alertWatch([...before, unc], [...before, unc], {runPids});
  assert.equal(alerted.abort, true);
  assert.deepEqual(alerted.export.alerts, [{bundleId: 'com.apple.UserNotificationCenter', layer: 8, isAlertProcess: true}]);
  assert.deepEqual(alerted.readable, [{bundleId: 'com.apple.UserNotificationCenter'}]);
  // A localized owner name with no bundle id still identifies an alert process by its name.
  assert.deepEqual(alertWatch(before, [...before, w(7, 13, {ownerName: 'CoreServicesUIAgent', ownerBundleId: null, layer: 0})], {runPids}).export.alerts,
    [{bundleId: 'com.apple.coreservices.uiagent', layer: 0, isAlertProcess: true}]);
  // A title naming the pasteboard: abort; only the keyword leaves; the owner leaves only when it is an alert process.
  const titled = alertWatch(before, [...before, w(8, 14, {name: 'Allow “cua Engine” to paste from Mail?', layer: 3})], {runPids});
  assert.equal(titled.abort, true);
  assert.deepEqual(titled.export.keywords, [{keyword: 'paste', layer: 3, isAlertProcess: false}]);
  assert.deepEqual(titled.readable, [], 'an unknown owner is never observed');
  // Any other new low-layer window: abort, sanitized to its layer.
  const fresh = alertWatch(before, [...before, w(9, 15, {layer: 3}), w(10, 16, {layer: 101}), w(11, 17, {layer: 25})], {runPids});
  assert.equal(fresh.abort, true);
  assert.deepEqual(fresh.export.unknown, {count: 1, windows: [{layer: 3, isAlertProcess: false}]});
  assert.doesNotMatch(JSON.stringify([titled.export, fresh.export, alerted.export]), /Mail|private|secret|Inbox|com\.apple\.mail|ownerPid|"number"/);
  // Chrome and Claude Desktop are never readable, whatever they show.
  for (const bundleId of NEVER_OBSERVED) {
    const out = alertWatch(before, [...before, w(12, 18, {ownerBundleId: bundleId, ownerName: 'UserNotificationCenter', name: 'paste'})], {runPids});
    assert.deepEqual(out.readable, []);
  }
});

test('compositionGuard: HID keys only while the scene\'s TextEdit is the front app, its scene window the front window and TextEdit\'s key window', () => {
  const record = {pid: 600, window: {number: 41, bounds: {x: 10, y: 20, width: 600, height: 800}}};
  const ok = {frontmost: {pid: 600, bundleId: 'com.apple.TextEdit'}, topWindow: {ownerPid: 600, number: 41, bounds: {x: 10, y: 20, width: 600, height: 800}}, observedWindow: {pid: 600, frame: {x: 10, y: 20, width: 600, height: 800}}, record};
  assert.deepEqual(compositionGuard(ok), {post: true, reason: null});
  assert.deepEqual(compositionGuard({...ok, frontmost: {pid: 5, bundleId: 'com.google.Chrome'}}),
    {post: false, reason: 'front app not the scene', seen: {frontmost: {pid: 5, bundleId: 'com.google.Chrome'}, topWindow: ok.topWindow, sceneWindow: 41}});
  assert.deepEqual(compositionGuard({...ok, frontmost: null}), {post: false, reason: 'front app not the scene', seen: {frontmost: null, topWindow: ok.topWindow, sceneWindow: 41}});
  assert.equal(compositionGuard({...ok, topWindow: {ownerPid: 600, number: 99}}).reason, 'front window not the scene window');
  assert.equal(compositionGuard({...ok, topWindow: {ownerPid: 5, number: 41}}).reason, 'front window not the scene window');
  assert.equal(compositionGuard({...ok, observedWindow: {pid: 600, frame: {x: 400, y: 20, width: 600, height: 800}}}).reason, 'the scene window is not TextEdit\'s key window');
  assert.equal(compositionGuard({...ok, observedWindow: null}).post, false);
  // The window moved or resized after up (hold 1): the comparison is the front window's bounds now, not the recorded ones.
  const placed = {x: 300, y: 120, width: 700, height: 900};
  assert.deepEqual(compositionGuard({...ok, topWindow: {...ok.topWindow, bounds: placed}, observedWindow: {pid: 600, frame: placed}}), {post: true, reason: null});
  const refused = compositionGuard({...ok, topWindow: {...ok.topWindow, bounds: placed}});
  assert.equal(refused.post, false);
  assert.deepEqual(refused.frames, {observed: ok.observedWindow.frame, observedPid: 600, frontWindow: placed, recordedAtUp: record.window.bounds});
  assert.deepEqual(compositionGuard({...ok, topWindow: {ownerPid: 600, number: 99}}).seen.topWindow, {ownerPid: 600, number: 99}, 'a refused front window is kept');
  assert.equal(compositionGuard({...ok, topWindow: {ownerPid: 600, number: 41}}).post, false, 'no bounds read now: no post');
  assert.equal(compositionGuard({...ok, observedWindow: {pid: 600, frame: {x: 10, y: 20, width: Number.NaN, height: 800}}}).post, false, 'an unreadable dimension is no match');
});

test('compositionReading: 가, rk, ㄱㅏ, or anything else verbatim, and nothing more', () => {
  assert.deepEqual(compositionReading('가'), {reading: '가'});
  assert.deepEqual(compositionReading('가\n'), {reading: '가'}, 'the commit Return\'s newline is not part of the reading');
  assert.deepEqual(compositionReading('rk'), {reading: 'rk'});
  assert.deepEqual(compositionReading('ㄱㅏ'), {reading: 'ㄱㅏ'});
  assert.deepEqual(compositionReading('ㄱ'), {reading: 'other', verbatim: 'ㄱ'});
  assert.deepEqual(compositionReading(null), {reading: 'other', verbatim: ''});
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

test('putBackPlan: the watcher stopped first, Finder\'s teardown before the scenes go down, the engine stopped after, Finder observed, the front app last', () => {
  assert.deepEqual(putBackPlan({scenesUp: ['textedit', 'finder'], inputSourceSaved: true, frontSaved: true, watchSaved: true, finderBaseline: true}),
    ['watch-stop', 'finder-teardown', 'scenes-down', 'input-source', 'engine-stop', 'apps-check', 'finder-check', 'front-app']);
  assert.deepEqual(putBackPlan({scenesUp: [], inputSourceSaved: false, frontSaved: false}), ['scenes-down', 'engine-stop', 'apps-check']);
  assert.deepEqual(putBackPlan({scenesUp: ['chrome'], inputSourceSaved: false, frontSaved: true, finderBaseline: true}), ['scenes-down', 'engine-stop', 'apps-check', 'finder-check', 'front-app']);
});

test('frontAppAction: the owner\'s app back in front by activation alone, Chrome and Claude Desktop included; never a scene app', () => {
  assert.deepEqual(frontAppAction({pid: 5, bundleId: 'com.apple.Terminal'}), {reactivate: true});
  assert.deepEqual(frontAppAction({pid: 5, bundleId: 'com.google.Chrome'}), {reactivate: true});
  assert.deepEqual(frontAppAction({pid: 5, bundleId: 'com.anthropic.claudefordesktop'}), {reactivate: true});
  assert.equal(frontAppAction(null).reactivate, false);
  assert.equal(frontAppAction({pid: 5, bundleId: 'com.apple.TextEdit'}).reactivate, false);
  assert.ok(NEVER_OBSERVED.includes('com.google.Chrome') && NEVER_OBSERVED.includes('com.anthropic.claudefordesktop'));
});

test('finderCheck: the run\'s Finder window gone, Finder\'s windows as at begin, its chrome keys as the owner\'s', () => {
  const keys = {ShowSidebar: true, ShowStatusBar: false, ShowPathbar: false};
  const baseline = {windows: [], keys};
  assert.deepEqual(finderCheck(baseline, {windows: [], keys}, {runWindow: 42}), {ok: true, runWindowGone: true, windowsAsAtBegin: true, keysAsSaved: true});
  assert.deepEqual(finderCheck(baseline, {windows: [42], keys}, {runWindow: 42}), {ok: false, runWindowGone: false, windowsAsAtBegin: false, keysAsSaved: true});
  assert.equal(finderCheck(baseline, {windows: [7], keys}, {runWindow: 42}).windowsAsAtBegin, false);
  assert.equal(finderCheck(baseline, {windows: [], keys: {...keys, ShowPathbar: true}}, {runWindow: 42}).keysAsSaved, false);
  assert.equal(finderCheck({windows: [3], keys}, {windows: [3], keys}, {runWindow: null}).ok, true, 'a window the owner had at begin stays');
  assert.equal(finderCheck(null, {windows: [], keys}, {runWindow: null}).ok, false, 'no baseline, nothing verified');
});

test('parseProcessTable and parseJournal: ps\'s lstart and the journal\'s rows read alike, whitespace aside', () => {
  const table = parseProcessTable([
    '  100     1  501 Tue Oct 21 10:00:00 2026     node scripts/native-matrix/live-device.mjs paste --run /r',
    '  101   100  501 Wed Oct  1 09:05:07 2026     /usr/bin/swift x.swift',
    'garbage',
  ].join('\n'));
  assert.deepEqual(table, [
    {pid: 100, ppid: 1, uid: 501, start: 'Tue Oct 21 10:00:00 2026', command: 'node scripts/native-matrix/live-device.mjs paste --run /r'},
    {pid: 101, ppid: 100, uid: 501, start: 'Wed Oct 1 09:05:07 2026', command: '/usr/bin/swift x.swift'}]);
  assert.deepEqual(parseJournal('cli\t100\tTue Oct 21 10:00:00 2026\tlive-device.mjs paste\nprobe\t-\t-\tkeystroke\n\nbad\nprobe\tpending\t-\tinput-source#a1\n'), [
    {kind: 'cli', pid: 100, start: 'Tue Oct 21 10:00:00 2026', label: 'live-device.mjs paste'},
    {kind: 'probe', pid: null, start: null, label: 'keystroke'},
    {kind: 'probe', pid: null, start: null, label: 'input-source#a1'}]);
});

test('recoveryPlan: only journaled pids whose start time still matches are stopped; an in-flight scene up is awaited; anything else is listed, untouched', () => {
  const checkout = '/Users/u/Developer/GitHub/cua-parity', bundle = '/Users/u/Applications/Cua Engine.app';
  const T = 'Tue Oct 21 10:00:00 2026', LATER = 'Tue Oct 21 11:00:00 2026';
  const row = (pid, command, start = T, uid = 501) => ({pid, ppid: 1, uid, start, command});
  const table = [
    row(100, 'node scripts/native-matrix/live-device.mjs paste --run /r'),
    row(101, 'node scripts/repl-parity/scenes-mac.mjs up textedit --run /r'),
    row(102, `node ${checkout}/bin/cua.mjs serve`),
    row(103, 'node scripts/native-matrix/live-device.mjs menu --run /other', LATER),
    row(104, 'node scripts/native-matrix/live-device.mjs paste --run /another-run'),
    row(105, `${bundle}/Contents/MacOS/cua-engine --probe keystroke --user-pid 1 rk`),
    row(106, `${bundle}/Contents/MacOS/cua-engine --probe input-source current`),
    row(107, `${bundle}/Contents/MacOS/cua-engine --probe watch-activations`),
    row(108, 'node scripts/native-matrix/live-device.mjs paste --run /r', T, 502),
    row(200, 'node scripts/native-matrix/live-device.mjs recover --run /r'),
    row(300, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
  ];
  const journal = [
    {kind: 'cli', pid: 100, start: T, label: 'live-device.mjs paste'},
    {kind: 'cli', pid: 101, start: T, label: 'scenes-mac.mjs up'},
    {kind: 'cli', pid: 102, start: T, label: 'vendor serve'},
    // pid 103 was this run's once, but the process there now started later: another run's, or a reused pid.
    {kind: 'cli', pid: 103, start: T, label: 'live-device.mjs menu'},
    {kind: 'probe', pid: 105, start: T, label: 'keystroke'},
    {kind: 'probe', pid: null, start: null, label: 'input-source'},
    {kind: 'cli', pid: 108, start: T, label: 'live-device.mjs paste'},
    {kind: 'cli', pid: 200, start: T, label: 'live-device.mjs recover'},
    {kind: 'cli', pid: 999, start: T, label: 'live-device.mjs begin'},
  ];
  const plan = recoveryPlan(journal, table, {self: 200, ancestors: [1], uid: 501, checkout, bundle, known: [107]});
  assert.deepEqual(plan.stop, [{pid: 100, kind: 'cli', label: 'live-device.mjs paste'}, {pid: 102, kind: 'cli', label: 'vendor serve'}, {pid: 105, kind: 'probe', label: 'keystroke'}]);
  assert.deepEqual(plan.await, [{pid: 101, kind: 'cli', label: 'scenes-mac.mjs up'}], 'a scene startup is awaited, never killed');
  assert.equal(plan.unresolvedProbes, 1);
  assert.deepEqual(plan.untouched.map(p => p.pid), [103, 104, 106], 'another run\'s CLI and a probe nobody journaled are listed only');
  assert.equal(plan.untouched[0].command, 'node scripts/native-matrix/live-device.mjs');
  assert.deepEqual(recoveryPlan([], table, {self: 200, ancestors: [], uid: 501, checkout, bundle: null}).stop, [], 'nothing journaled, nothing signaled');
  // A probe launch is journaled pending before its open, then resolved to its pid or left unresolved: a launch with no
  // pid row is unresolved, pending or not.
  const launches = [{kind: 'probe', pid: null, start: null, label: 'keystroke#1'}, {kind: 'probe', pid: 105, start: T, label: 'keystroke#1'},
    {kind: 'probe', pid: null, start: null, label: 'input-source#2'},
    {kind: 'probe', pid: null, start: null, label: 'input-source#3'}, {kind: 'probe', pid: null, start: null, label: 'input-source#3'}];
  const resolved = recoveryPlan(launches, table, {self: 200, ancestors: [], uid: 501, checkout, bundle});
  assert.equal(resolved.unresolvedProbes, 2, 'one still pending, one resolved to nothing');
  assert.deepEqual(resolved.stop, [{pid: 105, kind: 'probe', label: 'keystroke#1'}]);
});

test('the recovery\'s bound covers its waits and every put-back step with the stop after it', () => {
  const b = RECOVERY_BOUNDS;
  assert.equal(putBackBoundMs(b), 8 * (b.stepMs + 2 * b.stepKillMs + 2 * b.killMs));
  assert.equal(recoverBoundMs(b), 4 * b.killMs + b.sceneUpWaitMs + b.probeWaitMs + putBackBoundMs(b));
});
