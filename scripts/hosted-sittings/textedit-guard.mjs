// Sitting D's alert guard and placement (rulings 1154, 1160, 1164; ./alert-guard.mjs, the module every sitting calls):
// D drives TextEdit only, on this runner (no loopback device), through the scratch document `textedit up` opens (verify
// --bind, #216's approval cycles and T3b's onboarding bind it) and accept-native's own TextEdit fixture document
// (scripts/accept/textedit.mjs, items 5, 6 and 8). None of D's code sends a pointer event: its cells bind, observe,
// capture by window, press keys and type. What may click is the engine: cua's route 3 posts an activation click around
// a keyed typeText or a paste (native/engine/Sources/Engine/Activation.swift), so every cell of the fixture that types or
// presses a key is held to the pointer rule (guardCause: TextEdit's windows and the Open panel's clear of every alert,
// the alert holding neither front nor key, the screen read), and TextEdit's windows are placed clear of the alerts once
// a document is up. The readings are this runner's own (./guard-device.mjs readGuard, placeWindow).
import {spawnSync} from 'node:child_process';
import {guardCause, placeWindows} from './alert-guard.mjs';
import {defaultGuardIo, placeWindow, readGuard} from './guard-device.mjs';

const runningTextEdits = () => String(spawnSync('/usr/bin/pgrep', ['-x', 'TextEdit'], {encoding: 'utf8'}).stdout ?? '').split('\n').filter(Boolean).map(Number);

// deps: {pids() (TextEdit's running processes), io (./guard-device.mjs's)}. -> {read({key}), check() -> cause | null,
// place() -> placeWindows' record}.
export function textEditGuard({pids = runningTextEdits, io = defaultGuardIo()} = {}) {
  const targets = () => pids().map(pid => ({scene: 'textedit', pid}));
  const read = ({key = false} = {}) => readGuard({targets: targets(), key}, io);
  return {
    read,
    check() {
      const r = read({key: true});
      return guardCause(r.bounds, {front: r.front, key: r.key}, {scenes: ['textedit']});
    },
    // Each window under an alert moved clear, by the pid that shows it (a TextEdit window) or as the Open panel's.
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
