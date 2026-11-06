// The deferred action settle of cua's Linux service (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// Design "The service"; R/A §1.6): a successful input defers the next eligible call by its method's constant, and that
// call waits until the deadline before it reaches the engine. Which methods wait and which defer is methods.mjs's. The
// vendor's ActionSettler (@oai/sky 0.7.5 targets/linux/action_settler.js) defers every input by one 100 ms
// (post_action_sleep_ms, whose default cua's launch never changes, since it passes no options file); M4's T8 measured
// each method's own (below).
import {setTimeout as sleep} from 'node:timers/promises';

// Each method's settle, in ms: the smallest step whose effect an observation through this service, straight after the
// input's answer, showed on every family that takes the method, 30 consecutive runs idle and at twice the gate's load
// (`--experiment settle`, scripts/linux-engine-diff/action-settle.mjs; evidence
// docs/evidence/2026-10-28-own-linux-engine/m4/settle/), or the vendor's 100 where nothing measured allows less.
export const SETTLE_MS = Object.freeze({
  perform_secondary_action: 100,
  click: 100,
  clipboard_read: 100,
  clipboard_write: 100,
  drag: 100,
  drag_handle: 100,
  activate_window: 100,
  move: 100,
  move_relative: 100,
  press_key: 100,
  key_down: 100,
  key_up: 100,
  scroll: 100,
  type_text: 100,
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
