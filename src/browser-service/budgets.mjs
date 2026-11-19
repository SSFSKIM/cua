// Ported from readable chatgpt-26.928.40906 BS:48758-48804 (kt, ta, af, wO and lf, the deadline arithmetic of CDP calls); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: the clamp qe (BS:18546-18549) and the budgets of zO (BS:49779, $O), YO (BS:50015), qO (BS:49621), ZO
// (BS:50034), pf/m1 (BS:50431, FJ) and n1 (BS:50226, uncapped).
//
// Every timeout a command has. The one departure from the vendor (the owner's ruling, the spec's "Lifted"): the clamp
// keeps the 3 s default but its maximum is 120 s, so a caller's timeoutMs raises a locator, wait or evaluate budget
// instead of only lowering it. A command's budget is a Deadline; every CDP call made for the command asks it for the
// time left, so the host's own timeout never outlasts the command.
//
// A Deadline is spent once its clock reaches the end or once a timer armed on it fires, whichever is first: Node can
// fire a timer while Date.now() still reads up to about 1 ms under the end it was set for, and a command answered
// "timeout" by that timer must not then pass a check of the same budget and act (a paste run after its timeout invites
// a retry that pastes twice). race and whenSpent arm their timers so; a wait whose timer answers for a budget that other
// work still checks arms it through them, not on a count of remaining() milliseconds of its own.
import {BrowserServiceError, DEADLINE_EXCEEDED} from './errors.mjs';

export {DEADLINE_EXCEEDED};

export const DEFAULT_ACTION_MS = 3000, MAX_ACTION_MS = 120000, PRESS_SEQUENTIALLY_MS = 5000, DOWNLOAD_MS = 120000,
  CHOOSER_DEFAULT_MS = 3000, CHOOSER_MAX_MS = 120000, DIALOG_MS = 60000, LOAD_MS = 10000;
export const clamp = (requested, max = MAX_ACTION_MS) => Math.min(Math.max(0, requested ?? DEFAULT_ACTION_MS), max);

const exceeded = () => new BrowserServiceError('timeout', DEADLINE_EXCEEDED);

export class Deadline {
  #spent = false;

  // `ms` from now, kept as the budget (the vendor's timeoutMs, which its "Timed out after <ms>ms" sentences name); `at`
  // is the epoch millisecond it ends (the vendor's deadlineMs).
  constructor(ms) {
    if (typeof ms !== 'number' || Number.isNaN(ms)) throw new TypeError('Deadline needs a number of milliseconds');
    this.ms = Math.max(0, ms);
    this.at = Date.now() + this.ms;
  }

  remaining() { return this.#spent ? 0 : Math.max(0, this.at - Date.now()); }

  expired() { return this.#spent || Date.now() >= this.at; }

  // A sub-budget of at most `maxMs`, never outliving this one.
  child(maxMs) { return new Deadline(Math.min(this.remaining(), maxMs)); }

  // Throws the deadline error once the budget is spent (kt).
  check() { if (this.expired()) throw exceeded(); }

  // The timeout to give one CDP call: what is left, or the caller's smaller bound, never below 1 ms; throws once spent (af).
  timeoutMs(requested) {
    this.check();
    const left = this.at - Date.now();
    return Math.max(1, Math.min(requested ?? left, left));
  }

  // Calls `onSpent` when the budget runs out, the deadline spent from then on whatever the clock reads; -> a function
  // that disarms it.
  whenSpent(onSpent) {
    const timer = setTimeout(() => {
      this.#spent = true;
      onSpent();
    }, this.remaining());
    return () => clearTimeout(timer);
  }

  // Settles as `work` does, or rejects with the deadline error when the budget runs out first; a loser's later
  // rejection is absorbed (lf).
  async race(work) {
    if (this.expired()) {
      Promise.resolve(work).catch(() => {});
      throw exceeded();
    }
    let disarm;
    const bound = new Promise((resolve, reject) => { disarm = this.whenSpent(() => reject(exceeded())); });
    try {
      return await Promise.race([work, bound]);
    } finally {
      disarm();
    }
  }
}
