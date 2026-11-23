// Sitting D's alert guard and placement (rulings 1154, 1160, 1164; ./alert-guard.mjs, the module every sitting calls):
// D drives TextEdit only, on this runner (no loopback device), through the scratch document `textedit up` opens (verify
// --bind, #216's approval cycles and T3b's onboarding bind it) and accept-native's own TextEdit fixture document
// (scripts/accept/textedit.mjs, items 5, 6 and 8). None of D's code sends a pointer event: its cells bind, observe,
// capture by window, press keys and type. Its key cells follow the key-cell premise A and C share (./alert-guard.mjs
// keyCause): the activation click cua's route 3 may post around a keyed typeText or a paste goes to TextEdit's pid
// only, so a key cell is refused when the alert holds the key, and by the key guard when TextEdit is not in front; the
// fixture's marker cell, which captures TextEdit's window after typing, is held to the capture rule too
// (scripts/accept/textedit.mjs fixtureKeyCell, from this guard's `read`). TextEdit's windows are recorded where they
// stand once a document is up (placeWindows: the frame probe moves Finder windows only, so none of TextEdit's or the
// panel's is moved; the guard refuses what an alert overlaps). The readings are this runner's own (./guard-device.mjs
// readGuard, placeWindow).
import {spawnSync} from 'node:child_process';
import {placeWindows} from './alert-guard.mjs';
import {defaultGuardIo, placeWindow, readGuard} from './guard-device.mjs';

const runningTextEdits = () => String(spawnSync('/usr/bin/pgrep', ['-x', 'TextEdit'], {encoding: 'utf8'}).stdout ?? '').split('\n').filter(Boolean).map(Number);

// deps: {pids() (TextEdit's running processes), io (./guard-device.mjs's)}. -> {read({key, keyWindow}) (readGuard's
// reading of TextEdit's windows, with the key and TextEdit's own key window when asked), place() -> placeWindows' record}.
export function textEditGuard({pids = runningTextEdits, io = defaultGuardIo()} = {}) {
  const targets = () => pids().map(pid => ({scene: 'textedit', pid}));
  const read = ({key = false, keyWindow = false} = {}) => readGuard({targets: targets(), key, keyWindow}, io);
  return {
    read,
    // Each window under an alert that the frame probe can move (FRAME_PROBE_SCENES: none of D's today) moved clear, by
    // the pid that shows it or as the Open panel's; the others recorded where they stand.
    place: () => placeWindows(read().bounds, {move: ({scene, number, frame}) => {
      const asks = scene === 'openPanel' ? [{panel: true}] : pids().map(pid => ({pid}));
      let last = null;
      for (const ask of asks) {
        try { return placeWindow({...ask, window: number, frame: [frame.x, frame.y, frame.width, frame.height].join(',')}, io); } catch (error) { last = error; }
      }
      return {error: last?.message ?? 'no TextEdit process to place it by'};
    }}),
  };
}
