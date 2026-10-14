// Keys as the vendor presses them (src/browser-service/keyboard.mjs, the port of Gu, Ui and BC): the CDP key events of
// a press over a recording controller, the names and aliases a press accepts, the modifier rules for typed text and
// editing commands, and the native clipboard shortcuts named for the virtual clipboard rather than pressed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Deadline} from '../../src/browser-service/budgets.mjs';
import {NATIVE_CLIPBOARD_DISABLED, clipboardShortcut, modifierMask, pressKeys, typeCharacter} from '../../src/browser-service/keyboard.mjs';

function recorder() {
  const calls = [];
  return {calls, cdp: {async callTarget(target, method, params, options) { calls.push({target, method, params, options}); return {}; }}};
}
const events = calls => calls.map(({method, params}) => (method === 'Input.insertText' ? `insert ${params.text}`
  : `${params.type} ${params.key}${params.text ? ` text=${JSON.stringify(params.text)}` : ''}${params.modifiers ? ` mod=${params.modifiers}` : ''}${params.commands ? ` ${params.commands.join(',')}` : ''}`));
const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };

test('a single key is pressed and released with its code, key code and text', async () => {
  const {calls, cdp} = recorder();
  await pressKeys(cdp, 4, ['Enter'], {platform: 'linux'});
  assert.deepEqual(calls.map(c => c.target), [{tabId: 4}, {tabId: 4}]);
  assert.deepEqual(calls[0].params, {type: 'keyDown', modifiers: 0, windowsVirtualKeyCode: 13, code: 'Enter', key: 'Enter',
    text: '\r', unmodifiedText: '\r', location: 0, isKeypad: false});
  assert.deepEqual(calls[1].params, {type: 'keyUp', modifiers: 0, windowsVirtualKeyCode: 13, code: 'Enter', key: 'Enter', location: 0, isKeypad: false});
});

test('modifiers are held in order around the last key and released in reverse; a key types only alone or with Shift', async () => {
  const {calls, cdp} = recorder();
  await pressKeys(cdp, 1, 'Shift+a', {platform: 'linux'});
  assert.deepEqual(events(calls), ['rawKeyDown Shift mod=8', 'keyDown A text="A" mod=8', 'keyUp A mod=8', 'keyUp Shift']);
  calls.length = 0;
  await pressKeys(cdp, 1, ['Alt', 'Control', 'k'], {platform: 'linux'});
  assert.deepEqual(events(calls), ['rawKeyDown Alt mod=1', 'rawKeyDown Control mod=3', 'rawKeyDown k mod=3', 'keyUp k mod=3', 'keyUp Control mod=1', 'keyUp Alt']);
});

test('the aliases the model writes resolve to the layout\'s names; ControlOrMeta follows the platform', async () => {
  const {calls, cdp} = recorder();
  await pressKeys(cdp, 1, ['HOME'], {platform: 'linux'});
  await pressKeys(cdp, 1, ['esc'], {platform: 'linux'});
  await pressKeys(cdp, 1, ['page_down'], {platform: 'linux'});
  assert.deepEqual(events(calls).filter(e => e.startsWith('rawKeyDown') || e.startsWith('keyDown')), ['rawKeyDown Home', 'rawKeyDown Escape', 'rawKeyDown PageDown']);
  calls.length = 0;
  await pressKeys(cdp, 1, ['cmd', 'a'], {platform: 'darwin'});
  assert.deepEqual(events(calls), ['rawKeyDown Meta mod=4', 'rawKeyDown a mod=4 selectAll', 'keyUp a mod=4', 'keyUp Meta']);
  calls.length = 0;
  await pressKeys(cdp, 1, ['ctrl+a'], {platform: 'linux'});
  assert.deepEqual(events(calls), ['rawKeyDown Control mod=2', 'rawKeyDown a mod=2 selectAll', 'keyUp a mod=2', 'keyUp Control']);
  assert.equal(modifierMask(['ControlOrMeta', 'Shift'], 'darwin'), 12);
  assert.equal(modifierMask(['ControlOrMeta', 'Alt'], 'linux'), 3);
  assert.equal(modifierMask(undefined, 'linux'), 0);
});

test('on macOS Backspace, Delete and Meta+Z carry Chrome\'s editing commands', async () => {
  const {calls, cdp} = recorder();
  await pressKeys(cdp, 1, ['Backspace'], {platform: 'darwin'});
  await pressKeys(cdp, 1, ['Meta', 'Shift', 'z'], {platform: 'darwin'});
  await pressKeys(cdp, 1, ['Backspace'], {platform: 'linux'});
  assert.deepEqual(events(calls).filter(e => !e.startsWith('keyUp')),
    ['rawKeyDown Backspace deleteBackward', 'rawKeyDown Meta mod=4', 'rawKeyDown Shift mod=12', 'rawKeyDown Z mod=12 redo', 'rawKeyDown Backspace']);
});

test('an unknown key and an empty press are refused before anything is dispatched', async () => {
  const {calls, cdp} = recorder();
  assert.equal((await rejection(pressKeys(cdp, 1, ['Hyper'], {platform: 'linux'}))).message, 'Unknown key: "Hyper"');
  assert.equal((await rejection(pressKeys(cdp, 1, [], {platform: 'linux'}))).message, 'keypress requires at least one key');
  assert.equal(calls.length, 0);
});

test('native clipboard shortcuts are named for the virtual clipboard, never pressed', async () => {
  assert.equal(clipboardShortcut(['ctrl', 'c'], 'linux'), 'copy');
  assert.equal(clipboardShortcut(['ctrl+v'], 'darwin'), 'paste');
  assert.equal(clipboardShortcut(['Meta', 'Shift', 'v'], 'darwin'), 'paste-plain-text');
  assert.equal(clipboardShortcut('Control+x', 'linux'), 'cut');
  assert.equal(clipboardShortcut(['Shift', 'Insert'], 'linux'), 'paste');
  assert.equal(clipboardShortcut(['Control', 'Insert'], 'linux'), 'copy');
  assert.equal(clipboardShortcut(['Shift', 'Delete'], 'linux'), 'cut');
  assert.equal(clipboardShortcut(['Control', 'Shift', 'c'], 'linux'), null, 'the browser\'s own shortcut');
  assert.equal(clipboardShortcut(['Control', 'Alt', 'v'], 'linux'), 'blocked');
  assert.equal(clipboardShortcut(['Control', 'a'], 'linux'), null);
  assert.equal(clipboardShortcut(['Enter'], 'linux'), null);
  const {calls, cdp} = recorder();
  assert.equal((await rejection(pressKeys(cdp, 1, ['Control', 'v'], {platform: 'linux'}))).message, NATIVE_CLIPBOARD_DISABLED);
  assert.equal(calls.length, 0);
});

test('one typed character: a layout key is pressed, anything else inserted; the deadline rides every call', async () => {
  const {calls, cdp} = recorder();
  const deadline = new Deadline(5000);
  await typeCharacter(cdp, {tabId: 2, sessionId: 'S'}, 'x', {deadline, platform: 'linux'});
  await typeCharacter(cdp, {tabId: 2}, 'é', {deadline, platform: 'linux'});
  await typeCharacter(cdp, {tabId: 2}, '\n', {deadline, platform: 'linux'});
  assert.deepEqual(events(calls), ['keyDown x text="x"', 'keyUp x', 'insert é', 'keyDown Enter text="\\r"', 'keyUp Enter']);
  assert.deepEqual(calls[0].target, {tabId: 2, sessionId: 'S'});
  assert.ok(calls.every(c => c.options.deadline === deadline));
  assert.equal((await rejection(typeCharacter(cdp, 2, 'ab'))).message, 'dispatchTextCharacter requires one Unicode character');
});
