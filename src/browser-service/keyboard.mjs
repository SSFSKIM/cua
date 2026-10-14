// Ported from readable chatgpt-26.928.40906 BS:18925-19880 (Gu, the keyboard over Input.dispatchKeyEvent; Ui and BC, a key press and one typed character; OC, NC, dj and RC, the clipboard shortcuts; Zg, Vu, LC, lj, cj, Qg and uj, key names and editing commands; the US layout tb with yj, bj, hj and gj); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: Xg, Io and $u (BS:18479-18513, the modifiers); eb (BS:18845).
//
// Keys as the vendor presses them. A key press is a list of key names (`['Control', 'a']`, `'Shift+Tab'`, or the
// lowercase aliases `ctrl`, `cmd`, `esc`, `pageup`, ...): every name but the last is held down while the last is
// pressed, then released in reverse. `ControlOrMeta` is Meta on macOS and Control elsewhere. Ctrl/Meta+A carries
// Chrome's selectAll command and, on macOS, Backspace, Delete and Meta(+Shift)+Z carry their editing commands, as a
// native key would. The native clipboard shortcuts (Ctrl/Meta+C, V, X, Ctrl+Insert, Shift+Insert, Shift+Delete) are
// never pressed: clipboardShortcut names the virtual clipboard action a press stands for (paste.mjs performs it), or
// 'blocked'. Dropped from Gu, Ui and BC: the in-app browser's input target tokens and its closed-shadow-root focus
// guard (Yg and the input-guard world), which only the in-app browser backend turns on.
import {platform as osPlatform} from 'node:os';

export const NATIVE_CLIPBOARD_DISABLED = 'Native clipboard shortcuts are disabled; use Browser Use virtual clipboard commands instead.';   // eb
export const PLATFORM = osPlatform();
const NUMPAD = 3;                                                                                                    // ot
const MODIFIER_ORDER = ['Shift', 'Control', 'Alt', 'Meta'];                                                          // pj
const CLIPBOARD_CODES = new Set(['KeyC', 'KeyV', 'KeyX']);                                                           // mj
const MAC_EDITING_COMMANDS = new Map([                                                                               // fj
  ['Backspace', 'deleteBackward'], ['Delete', 'deleteForward'], ['Meta+KeyZ', 'undo'], ['Shift+Meta+KeyZ', 'redo'],
]);

// Lowercase names (underscores dropped) -> the layout's (hj).
const ALIASES = new Map(Object.entries({
  alt: 'Alt', option: 'Alt', control: 'Control', controlormeta: 'ControlOrMeta', ctrl: 'ControlOrMeta', cmd: 'Meta',
  command: 'Meta', meta: 'Meta', win: 'Meta', super: 'Meta', shift: 'Shift', capslock: 'CapsLock', shiftlock: 'CapsLock',
  esc: 'Escape', escape: 'Escape', enter: 'Enter', return: 'Enter', linefeed: 'Enter', backspace: 'Backspace',
  delete: 'Delete', del: 'Delete', tab: 'Tab', space: 'Space', left: 'ArrowLeft', arrowleft: 'ArrowLeft',
  right: 'ArrowRight', arrowright: 'ArrowRight', up: 'ArrowUp', arrowup: 'ArrowUp', down: 'ArrowDown',
  arrowdown: 'ArrowDown', home: 'Home', begin: 'Home', end: 'End', insert: 'Insert', pageup: 'PageUp', prior: 'PageUp',
  pagedown: 'PageDown', next: 'PageDown', menu: 'ContextMenu', exclam: '!', quotedbl: '"', numbersign: '#',
  dollar: '$', percent: '%', ampersand: '&', apostrophe: "'", parenleft: '(', parenright: ')', asterisk: '*',
  plus: '+', comma: ',', minus: '-', period: '.', slash: '/', colon: ':', semicolon: ';', less: '<', equal: '=',
  greater: '>', question: '?', at: '@', bracketleft: '[', backslash: '\\', bracketright: ']', asciicircum: '^',
  underscore: '_', grave: '`', braceleft: '{', bar: '|', braceright: '}', asciitilde: '~', kpenter: 'NumpadEnter',
  kpmultiply: 'NumpadMultiply', kpadd: 'NumpadAdd', kpsubtract: 'NumpadSubtract', kpdecimal: 'NumpadDecimal',
  kpdivide: 'NumpadDivide', kp0: 'Numpad0', kp1: 'Numpad1', kp2: 'Numpad2', kp3: 'Numpad3', kp4: 'Numpad4',
  kp5: 'Numpad5', kp6: 'Numpad6', kp7: 'Numpad7', kp8: 'Numpad8', kp9: 'Numpad9',
}));

// Whole presses spelled the X11 way -> the press they mean (gj).
const COMBINATIONS = new Map([
  ['ctrl+a', ['ControlOrMeta', 'a']], ['ctrl+c', ['ControlOrMeta', 'c']], ['ctrl+l', ['ControlOrMeta', 'l']],
  ['ctrl+n', ['ControlOrMeta', 'n']], ['ctrl+shift+v', ['ControlOrMeta', 'Shift', 'v']], ['ctrl+v', ['ControlOrMeta', 'v']],
  ['ctrl+x', ['ControlOrMeta', 'x']], ['ctrl+y', ['ControlOrMeta', 'Shift', 'z']], ['ctrl+z', ['ControlOrMeta', 'z']],
]);

// Codes a key is also known by (bj).
const EXTRA_NAMES = new Map([
  ['AltLeft', ['Alt']], ['ControlLeft', ['Control']], ['Enter', ['\n', '\r']], ['MetaLeft', ['Meta']], ['ShiftLeft', ['Shift']],
]);

// The US layout, by code (tb's source, the vendor's table as it is).
const US_LAYOUT = {
  Escape: {keyCode: 27, key: 'Escape'},
  F1: {keyCode: 112, key: 'F1'},
  F2: {keyCode: 113, key: 'F2'},
  F3: {keyCode: 114, key: 'F3'},
  F4: {keyCode: 115, key: 'F4'},
  F5: {keyCode: 116, key: 'F5'},
  F6: {keyCode: 117, key: 'F6'},
  F7: {keyCode: 118, key: 'F7'},
  F8: {keyCode: 119, key: 'F8'},
  F9: {keyCode: 120, key: 'F9'},
  F10: {keyCode: 121, key: 'F10'},
  F11: {keyCode: 122, key: 'F11'},
  F12: {keyCode: 123, key: 'F12'},
  F13: {keyCode: 124, key: 'F13'},
  F14: {keyCode: 125, key: 'F14'},
  F15: {keyCode: 126, key: 'F15'},
  F16: {keyCode: 127, key: 'F16'},
  F17: {keyCode: 128, key: 'F17'},
  F18: {keyCode: 129, key: 'F18'},
  F19: {keyCode: 130, key: 'F19'},
  F20: {keyCode: 131, key: 'F20'},
  Backquote: {keyCode: 192, shiftKey: '~', key: '`'},
  Digit1: {keyCode: 49, shiftKey: '!', key: '1'},
  Digit2: {keyCode: 50, shiftKey: '@', key: '2'},
  Digit3: {keyCode: 51, shiftKey: '#', key: '3'},
  Digit4: {keyCode: 52, shiftKey: '$', key: '4'},
  Digit5: {keyCode: 53, shiftKey: '%', key: '5'},
  Digit6: {keyCode: 54, shiftKey: '^', key: '6'},
  Digit7: {keyCode: 55, shiftKey: '&', key: '7'},
  Digit8: {keyCode: 56, shiftKey: '*', key: '8'},
  Digit9: {keyCode: 57, shiftKey: '(', key: '9'},
  Digit0: {keyCode: 48, shiftKey: ')', key: '0'},
  Minus: {keyCode: 189, shiftKey: '_', key: '-'},
  Equal: {keyCode: 187, shiftKey: '+', key: '='},
  Backslash: {keyCode: 220, shiftKey: '|', key: '\\'},
  Backspace: {keyCode: 8, key: 'Backspace'},
  Tab: {keyCode: 9, key: 'Tab'},
  KeyQ: {keyCode: 81, shiftKey: 'Q', key: 'q'},
  KeyW: {keyCode: 87, shiftKey: 'W', key: 'w'},
  KeyE: {keyCode: 69, shiftKey: 'E', key: 'e'},
  KeyR: {keyCode: 82, shiftKey: 'R', key: 'r'},
  KeyT: {keyCode: 84, shiftKey: 'T', key: 't'},
  KeyY: {keyCode: 89, shiftKey: 'Y', key: 'y'},
  KeyU: {keyCode: 85, shiftKey: 'U', key: 'u'},
  KeyI: {keyCode: 73, shiftKey: 'I', key: 'i'},
  KeyO: {keyCode: 79, shiftKey: 'O', key: 'o'},
  KeyP: {keyCode: 80, shiftKey: 'P', key: 'p'},
  BracketLeft: {keyCode: 219, shiftKey: '{', key: '['},
  BracketRight: {keyCode: 221, shiftKey: '}', key: ']'},
  CapsLock: {keyCode: 20, key: 'CapsLock'},
  KeyA: {keyCode: 65, shiftKey: 'A', key: 'a'},
  KeyS: {keyCode: 83, shiftKey: 'S', key: 's'},
  KeyD: {keyCode: 68, shiftKey: 'D', key: 'd'},
  KeyF: {keyCode: 70, shiftKey: 'F', key: 'f'},
  KeyG: {keyCode: 71, shiftKey: 'G', key: 'g'},
  KeyH: {keyCode: 72, shiftKey: 'H', key: 'h'},
  KeyJ: {keyCode: 74, shiftKey: 'J', key: 'j'},
  KeyK: {keyCode: 75, shiftKey: 'K', key: 'k'},
  KeyL: {keyCode: 76, shiftKey: 'L', key: 'l'},
  Semicolon: {keyCode: 186, shiftKey: ':', key: ';'},
  Quote: {keyCode: 222, shiftKey: '"', key: "'"},
  Enter: {keyCode: 13, key: 'Enter', text: '\r'},
  ShiftLeft: {keyCode: 160, keyCodeWithoutLocation: 16, key: 'Shift', location: 1},
  KeyZ: {keyCode: 90, shiftKey: 'Z', key: 'z'},
  KeyX: {keyCode: 88, shiftKey: 'X', key: 'x'},
  KeyC: {keyCode: 67, shiftKey: 'C', key: 'c'},
  KeyV: {keyCode: 86, shiftKey: 'V', key: 'v'},
  KeyB: {keyCode: 66, shiftKey: 'B', key: 'b'},
  KeyN: {keyCode: 78, shiftKey: 'N', key: 'n'},
  KeyM: {keyCode: 77, shiftKey: 'M', key: 'm'},
  Comma: {keyCode: 188, shiftKey: '<', key: ','},
  Period: {keyCode: 190, shiftKey: '>', key: '.'},
  Slash: {keyCode: 191, shiftKey: '?', key: '/'},
  ShiftRight: {keyCode: 161, keyCodeWithoutLocation: 16, key: 'Shift', location: 2},
  ControlLeft: {keyCode: 162, keyCodeWithoutLocation: 17, key: 'Control', location: 1},
  MetaLeft: {keyCode: 91, key: 'Meta', location: 1},
  AltLeft: {keyCode: 164, keyCodeWithoutLocation: 18, key: 'Alt', location: 1},
  Space: {keyCode: 32, key: ' '},
  AltRight: {keyCode: 165, keyCodeWithoutLocation: 18, key: 'Alt', location: 2},
  AltGraph: {keyCode: 225, key: 'AltGraph'},
  MetaRight: {keyCode: 92, key: 'Meta', location: 2},
  ContextMenu: {keyCode: 93, key: 'ContextMenu'},
  ControlRight: {keyCode: 163, keyCodeWithoutLocation: 17, key: 'Control', location: 2},
  PageUp: {keyCode: 33, key: 'PageUp'},
  PageDown: {keyCode: 34, key: 'PageDown'},
  Insert: {keyCode: 45, key: 'Insert'},
  Delete: {keyCode: 46, key: 'Delete'},
  Home: {keyCode: 36, key: 'Home'},
  End: {keyCode: 35, key: 'End'},
  ArrowLeft: {keyCode: 37, key: 'ArrowLeft'},
  ArrowUp: {keyCode: 38, key: 'ArrowUp'},
  ArrowRight: {keyCode: 39, key: 'ArrowRight'},
  ArrowDown: {keyCode: 40, key: 'ArrowDown'},
  NumpadEnter: {keyCode: 13, key: 'Enter', text: '\r', location: NUMPAD},
  Numpad0: {keyCode: 96, key: '0', location: NUMPAD},
  Numpad1: {keyCode: 97, key: '1', location: NUMPAD},
  Numpad2: {keyCode: 98, key: '2', location: NUMPAD},
  Numpad3: {keyCode: 99, key: '3', location: NUMPAD},
  Numpad4: {keyCode: 100, key: '4', location: NUMPAD},
  Numpad5: {keyCode: 101, key: '5', location: NUMPAD},
  Numpad6: {keyCode: 102, key: '6', location: NUMPAD},
  Numpad7: {keyCode: 103, key: '7', location: NUMPAD},
  Numpad8: {keyCode: 104, key: '8', location: NUMPAD},
  Numpad9: {keyCode: 105, key: '9', location: NUMPAD},
  NumpadMultiply: {keyCode: 106, key: '*', location: NUMPAD},
  NumpadAdd: {keyCode: 107, key: '+', location: NUMPAD},
  NumpadSubtract: {keyCode: 109, key: '-', location: NUMPAD},
  NumpadDecimal: {keyCode: 110, key: '.', location: NUMPAD},
  NumpadDivide: {keyCode: 111, key: '/', location: NUMPAD},
};

// Every name a key is pressed by -> its description {key, keyCode, keyCodeWithoutLocation, code, text, location,
// shifted?} (yj): its code, its other names, and, outside the numpad, its character and its shifted character.
function buildLayout(layout) {
  const keys = new Map();
  for (const [code, definition] of Object.entries(layout)) {
    const description = {
      key: definition.key, keyCode: definition.keyCode, keyCodeWithoutLocation: definition.keyCodeWithoutLocation ?? definition.keyCode,
      code, text: definition.text ?? '', location: definition.location ?? 0,
    };
    if (definition.key.length === 1) description.text = definition.key;
    let shifted;
    if (definition.shiftKey) {
      shifted = {...description, key: definition.shiftKey, keyCode: definition.shiftKeyCode ?? description.keyCode, text: definition.shiftKey};
      description.shifted = shifted;
    }
    keys.set(code, description);
    for (const name of EXTRA_NAMES.get(code) ?? []) keys.set(name, description);
    if (!definition.location) {
      if (description.key.length === 1) keys.set(description.key, description);
      if (shifted) keys.set(shifted.key, {...shifted, shifted: undefined});
    }
  }
  return keys;
}

const KEYS = buildLayout(US_LAYOUT);                                                                                 // tb

export const isMac = platform => platform === 'darwin';                                                              // $u
const resolveModifier = (key, platform) => (key === 'ControlOrMeta' ? (isMac(platform) ? 'Meta' : 'Control') : key);   // Xg
const modifierOf = key => (key === 'Alt' || key === 'Control' || key === 'Meta' || key === 'Shift' ? key : undefined);  // Qg

// The CDP modifier bits of a list or set of modifier names (Io): Alt 1, Control 2, Meta 4, Shift 8.
export function modifierMask(modifiers, platform = PLATFORM) {
  let mask = 0;
  for (const modifier of modifiers ?? []) {
    switch (resolveModifier(modifier, platform)) {
      case 'Alt': mask |= 1; break;
      case 'Control': mask |= 2; break;
      case 'Meta': mask |= 4; break;
      case 'Shift': mask |= 8; break;
    }
  }
  return mask;
}

// A key's description, its shifted form while Shift is down (Zg).
function describeKey(name, pressed, platform) {
  const description = KEYS.get(resolveModifier(name, platform));
  if (!description) throw new Error(`Unknown key: "${name}"`);
  return pressed.has('Shift') && description.shifted ? description.shifted : description;
}

// 'Shift+a' -> ['Shift', 'a']; a lone '+' is the plus key (Vu).
function splitKeys(text) {
  const names = [];
  let current = '';
  for (const character of text) {
    if (character === '+' && current) {
      names.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  if (current) names.push(current);
  return names;
}

const keyNames = keys => (Array.isArray(keys) ? keys.flatMap(splitKeys) : splitKeys(keys));
const canonicalName = name => (KEYS.has(name) ? name : ALIASES.get(name.toLowerCase().replaceAll('_', '')) ?? name);   // lj
const canonicalKeys = names => COMBINATIONS.get(names.map(name => name.toLowerCase()).join('+')) ?? names.map(canonicalName);   // LC, cj

// The editing commands a native key carries (uj).
function editingCommands(code, pressed, platform) {
  if (code === 'KeyA' && pressed.size === 1 && pressed.has(isMac(platform) ? 'Meta' : 'Control')) return ['selectAll'];
  if (!isMac(platform)) return [];
  const command = MAC_EDITING_COMMANDS.get([...MODIFIER_ORDER.filter(modifier => pressed.has(modifier)), code].join('+'));
  return command ? [command] : [];
}

// A press a native clipboard shortcut would be (RC); Ctrl/Meta+Shift+C and +X are the browser's own (devtools,
// spelling), not the clipboard.
function isClipboardKey(code, pressed) {
  if ((code === 'KeyC' || code === 'KeyX') && pressed.size === 2 && pressed.has('Shift') && (pressed.has('Meta') || pressed.has('Control'))) return false;
  return ((pressed.has('Meta') || pressed.has('Control')) && CLIPBOARD_CODES.has(code))
    || (code === 'Insert' && (pressed.has('Control') || pressed.has('Shift')))
    || (code === 'Delete' && pressed.has('Shift'));
}

// The virtual clipboard action of a shortcut, or null (dj).
function shortcutAction(code, pressed) {
  if (pressed.size === 1) {
    if (code === 'Insert' && pressed.has('Control')) return 'copy';
    if (code === 'Insert' && pressed.has('Shift')) return 'paste';
    if (code === 'Delete' && pressed.has('Shift')) return 'cut';
  }
  const oneCommandKey = (pressed.has('Meta') || pressed.has('Control')) && !(pressed.has('Meta') && pressed.has('Control'));
  const shiftAtMost = pressed.size === 1 || (pressed.size === 2 && pressed.has('Shift'));
  if (!oneCommandKey || !shiftAtMost) return null;
  switch (code) {
    case 'KeyC': return pressed.has('Shift') ? null : 'copy';
    case 'KeyV': return pressed.has('Shift') ? 'paste-plain-text' : 'paste';
    case 'KeyX': return pressed.has('Shift') ? null : 'cut';
    default: return null;
  }
}

// 'copy' | 'cut' | 'paste' | 'paste-plain-text' for a press that is a clipboard shortcut, 'blocked' for one that is a
// native clipboard key otherwise, null for anything else (NC).
function classify(names, platform) {
  const pressed = new Set();
  const codes = [];
  let clipboardKey = false;
  for (const name of names) {
    const description = describeKey(name, pressed, platform);
    const modifier = modifierOf(description.key);
    if (modifier) {
      pressed.add(modifier);
    } else {
      codes.push(description.code);
      if (isClipboardKey(description.code, pressed)) clipboardKey = true;
    }
  }
  const only = codes.length === 1 ? codes[0] : undefined;
  if (only != null) {
    const action = shortcutAction(only, pressed);
    if (action != null) return action;
    if (isClipboardKey(only, pressed)) return 'blocked';
  }
  return clipboardKey ? 'blocked' : null;
}

// The clipboard shortcut a key press is, if any (OC).
export function clipboardShortcut(keys, platform = PLATFORM) {
  return classify(canonicalKeys(keyNames(keys)), platform);
}

// One target's keyboard (Gu): the modifiers held, and key events dispatched to the tab or to a frame's session.
class Keyboard {
  constructor(cdp, target, {deadline, platform = PLATFORM} = {}) {
    this.cdp = cdp;
    this.target = typeof target === 'object' ? target : {tabId: target};
    this.deadline = deadline;
    this.platform = platform;
  }

  cdp;
  target;
  deadline;
  platform;
  pressedModifiers = new Set();

  async down(name) {
    const description = describeKey(name, this.pressedModifiers, this.platform);
    const modifier = modifierOf(description.key);
    if (modifier) this.pressedModifiers.add(modifier);
    const text = this.keyText(description);
    const commands = editingCommands(description.code, this.pressedModifiers, this.platform);
    await this.dispatch({
      type: text ? 'keyDown' : 'rawKeyDown', modifiers: modifierMask(this.pressedModifiers, this.platform),
      windowsVirtualKeyCode: description.keyCodeWithoutLocation, code: description.code, ...(commands.length > 0 ? {commands} : {}),
      key: description.key, text, unmodifiedText: text, location: description.location, isKeypad: description.location === NUMPAD,
    });
  }

  async up(name) {
    const description = describeKey(name, this.pressedModifiers, this.platform);
    const modifier = modifierOf(description.key);
    if (modifier) this.pressedModifiers.delete(modifier);
    await this.dispatch({
      type: 'keyUp', modifiers: modifierMask(this.pressedModifiers, this.platform), windowsVirtualKeyCode: description.keyCodeWithoutLocation,
      code: description.code, key: description.key, location: description.location, isKeypad: description.location === NUMPAD,
    });
  }

  async insertText(text) {
    await this.cdp.callTarget(this.target, 'Input.insertText', {text}, this.options());
  }

  // A key types its text only with no modifier or Shift alone held.
  keyText(description) {
    const size = this.pressedModifiers.size;
    return size === 0 || (size === 1 && this.pressedModifiers.has('Shift')) ? description.text : '';
  }

  async dispatch(params) {
    await this.cdp.callTarget(this.target, 'Input.dispatchKeyEvent', params, this.options());
  }

  options() { return this.deadline === undefined ? {} : {deadline: this.deadline}; }
}

// Presses `keys` (Ui): the modifiers down in order, the last key down and up, the modifiers up in reverse. A clipboard
// shortcut is refused here; callers that serve one (paste.mjs) check clipboardShortcut first.
export async function pressKeys(cdp, target, keys, {deadline, platform = PLATFORM} = {}) {
  const keyboard = new Keyboard(cdp, target, {deadline, platform});
  const names = canonicalKeys(keyNames(keys));
  const last = names[names.length - 1];
  if (!last) throw new Error('keypress requires at least one key');
  if (classify(names, platform) != null) throw new Error(NATIVE_CLIPBOARD_DISABLED);
  for (const name of names.slice(0, -1)) await keyboard.down(name);
  await keyboard.down(last);
  await keyboard.up(last);
  for (const name of names.slice(0, -1).reverse()) await keyboard.up(name);
}

// Types one character (BC): a key of the layout is pressed, anything else inserted as text.
export async function typeCharacter(cdp, target, character, {deadline, platform = PLATFORM} = {}) {
  if (Array.from(character).length !== 1) throw new Error('dispatchTextCharacter requires one Unicode character');
  const keyboard = new Keyboard(cdp, target, {deadline, platform});
  if (!KEYS.has(character)) {
    await keyboard.insertText(character);
    return;
  }
  await keyboard.down(character);
  await keyboard.up(character);
}
