// The deferred action settle of cua's Linux service (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// Design "The service"; R/A §1.6): a successful input defers the next eligible call by its method's constant, and that
// call waits until the deadline before it reaches the engine. Which methods wait and which defer is methods.mjs's. The
// vendor's ActionSettler (@oai/sky 0.7.5 targets/linux/action_settler.js) defers every input by one 100 ms
// (post_action_sleep_ms, whose default cua's launch never changes, since it passes no options file); M4's T8 measured
// each method's own (below).
import {setTimeout as sleep} from 'node:timers/promises';

// Each method's settle, in ms (M4's T8, by the design session's wait rule): the smallest of the steps 0, 10, 25, 50, 75
// and 100 at which an observation through this service, straight after the input's answer, showed the effect on every
// cell that takes the method, 30 consecutive runs idle and at twice the gate's load (`--experiment settle`,
// scripts/linux-engine-diff/action-settle.mjs; evidence docs/evidence/2026-10-28-own-linux-engine/m4/settle/). The
// slowest cell sets it, named beside it. Where some cell showed its effect at no step up to 100, the method keeps the
// vendor's 100: a click's element action on GTK 4 (its button answers about 250 ms later) and on Qt (about 100 ms
// later, Qt's own animated click), and a key's release on an Electron page (60 to 150 ms later in a third of the runs,
// at every step). launch_app's is never reached in service (src/services/sky.mjs launches) and keeps it too.
export const SETTLE_MS = Object.freeze({
  perform_secondary_action: 10, // Electron's page
  click: 100, // GTK 4's and Qt's element actions (coordinate clicks held at 10: Electron)
  clipboard_read: 0,
  clipboard_write: 0,
  drag: 10, // Electron's page
  drag_handle: 10, // Electron's page, and gedit at twice the load
  activate_window: 10, // kate and qtcreator at twice the load
  move: 0,
  move_relative: 0,
  press_key: 100, // an Electron page's key release (a key into a text field held at 25: Writer, gnome-terminal)
  key_down: 25, // Writer and gnome-terminal
  key_up: 50, // Chrome's page on the desktop route at twice the load
  scroll: 0,
  type_text: 0, // the engine confirms the paste before it answers
  launch_app: 100,
});

// A settle table checked whole: a constant for every method of SETTLE_MS and for nothing else, each a whole number of
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
