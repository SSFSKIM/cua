// The deferred action settle of cua's Linux service (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// Design "The service"; R/A §1.6), the vendor's: a successful input defers the next eligible call by 100 ms, and that
// call waits until the deadline before it reaches the engine. Which methods wait and which defer is methods.mjs's.
// M4 replaces the fixed 100 ms with what its measurements allow (M4, "the action settle reduced where effects still
// verify"). The vendor's ActionSettler (@oai/sky 0.7.5 targets/linux/action_settler.js), translated as it reads; cua's
// launch passes no options file, so the vendor's post_action_sleep_ms is always its default.
import {setTimeout as sleep} from 'node:timers/promises';

export const POST_ACTION_MS = 100;

export class ActionSettler {
  constructor({now = () => performance.now(), sleep: pause = sleep} = {}) {
    this.now = now;
    this.sleep = pause;
    this.deadline = 0;
  }

  async wait() {
    for (;;) {
      const remaining = this.deadline - this.now();
      if (!(remaining > 0)) return;
      await this.sleep(remaining);
    }
  }

  defer() {
    this.deadline = Math.max(this.deadline, this.now() + POST_ACTION_MS);
  }
}
