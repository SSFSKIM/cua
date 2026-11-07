// The deferred action settle of cua's Linux service (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// Design "The service"; R/A §1.6): a successful input defers the next eligible call by its method's constant, and that
// call waits until the deadline before it reaches the engine. Which methods wait and which defer is methods.mjs's. The
// vendor's ActionSettler (@oai/sky 0.7.5 targets/linux/action_settler.js) defers every input by one 100 ms
// (post_action_sleep_ms, whose default cua's launch never changes, since it passes no options file); M4's T8 measured
// each method's own (below).
import {setTimeout as sleep} from 'node:timers/promises';

// Each settle, in ms (M4's T8, by the design session's wait rule): one per method that defers, and the click's split by
// what it runs (the design session, 2026-11-06): a coordinate click, right clicks included (an element's right click
// presses at its point); an element's primary action (`click_element`, a left click naming an element); and that
// action in each family whose toolkit animates it, which cua-engine names in its answer (ANIMATED_ACTION below).
// Each is the smallest of the steps 0, 10, 25, 50, 75 and 100 (from 100 by 25 ms for an animating family) at which an
// observation through this service, straight after the input's answer, showed the complete effect on every cell that
// takes it, 30 consecutive runs idle and at twice the gate's load, searched upward from 0 and then confirmed on the
// values as shipped (`--experiment settle`, scripts/linux-engine-diff/action-settle.mjs; evidence
// docs/evidence/2026-10-28-own-linux-engine/m4/settle/, its fix wave in fix/). The slowest cell sets it, named beside
// it. Where some cell showed its effect at no step up to 100, the method keeps the vendor's 100: a key's release on an
// Electron page (60 to 150 ms later in a third of the runs, at every step; #302). launch_app's is never reached in
// service (src/services/sky.mjs launches) and keeps it too.
export const SETTLE_MS = Object.freeze({
  perform_secondary_action: 10, // a named action but an animated primary one: Electron's page (0 missed, confirmed)
  click: 25, // a coordinate click: gnome-terminal's screen at twice the load
  click_element: 10, // an element's primary action, its family not animating it: Electron's page (0 missed, confirmed)
  animated_gtk4: 250, // GTK 4's button, idle and at twice the load
  animated_qt: 125, // Qt's animated click: Qt 6 at twice the load (Qt 5 held at 100)
  clipboard_read: 0,
  clipboard_write: 0, // the engine confirms the paste before it answers
  drag: 10, // Electron's page and gedit; gedit and xterm at twice the load
  drag_handle: 10, // Electron's page; gedit at twice the load
  activate_window: 10, // every family whose window manager's activation it reads but GTK 3's scene, idle and loaded
  move: 75, // Electron's page through the desktop route: its last motion, idle and at twice the load
  move_relative: 0,
  press_key: 100, // an Electron page's key release (#302; a key into a text field held at 25: Writer, gnome-terminal)
  key_down: 25, // Writer and gnome-terminal
  key_up: 50, // Chrome's page on the desktop route at twice the load
  scroll: 75, // Electron's page: its every wheel step, idle and at twice the load
  type_text: 0, // the engine confirms the paste before it answers
  launch_app: 100,
});

// The settle of an element's primary action in a family whose toolkit animates it, by the family's name as cua-engine
// answers it (`{animated_action: <family>}`; native/linux-engine/src/families.rs `animates_primary_action`): the action
// takes effect after DoAction answers (GTK 4's button about 250 ms later, as its keyboard activation does; Qt about
// 100 ms later, its animated click; each family's value measured from 100 by 25 ms).
export const ANIMATED_ACTION = Object.freeze({'GTK 4': 'animated_gtk4', Qt: 'animated_qt'});

// The settle for `family`'s animated action: its own, or for a family this service does not know, the longest of them.
export function animatedSettle(family) {
  if (Object.hasOwn(ANIMATED_ACTION, family)) return ANIMATED_ACTION[family];
  return Object.values(ANIMATED_ACTION).reduce((a, b) => (SETTLE_MS[b] > SETTLE_MS[a] ? b : a));
}

// A settle table checked whole: a constant for every settle of SETTLE_MS and for nothing else, each a whole number of
// ms from 0 (the experiment's lanes give the settler their own).
function checked(settles) {
  for (const method of Object.keys(settles)) if (!(method in SETTLE_MS)) throw new Error(`the action settle has no method ${method}`);
  for (const method of Object.keys(SETTLE_MS)) {
    if (!(method in settles)) throw new Error(`the action settle needs a constant for ${method}`);
    const ms = settles[method];
    if (!Number.isInteger(ms) || ms < 0) throw new Error(`the action settle for ${method} must be a whole number of ms from 0, not ${ms}`);
  }
  return Object.freeze({...settles});
}

export class ActionSettler {
  constructor({now = () => performance.now(), sleep: pause = sleep, settles = SETTLE_MS} = {}) {
    this.now = now;
    this.sleep = pause;
    this.settles = checked(settles);
    this.deadline = 0;
  }

  async wait() {
    for (;;) {
      const remaining = this.deadline - this.now();
      if (!(remaining > 0)) return;
      await this.sleep(remaining);
    }
  }

  // After `method`'s input succeeded: the next eligible call waits until its constant has passed, unless an earlier
  // input's deadline is later.
  defer(method) {
    if (!Object.hasOwn(this.settles, method)) throw new Error(`cua's Linux service has no action settle for ${method}`);
    this.deadline = Math.max(this.deadline, this.now() + this.settles[method]);
  }
}
