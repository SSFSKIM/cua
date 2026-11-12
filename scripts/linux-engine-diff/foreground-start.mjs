// The start of a foreground-route sample (#171 M4, T7's carry to T18, fix 3; the design session, 2026-11-04, matching
// the holder-window ruling). The foreground route activates its target, and an activation makes the client that loses
// the focus close its own focus-loss popups: the run's Chrome unmaps and destroys its override-redirect window about
// 0.1 ms after it loses the active state (Surprises, task 56's speed series). Inside the span that is another client's
// unmap, which the witness's foreground allowance does not cover (witness.mjs `judgeRestacks`), and it fails closed: a
// foreground sample that followed a Chrome sample which left Chrome active failed its witness falsely, once in 40.
// The rule is not loosened. Instead each foreground sample starts, outside its span, as every condition means it to:
// with the run's front window active, not another client's window a previous sample left active, and once that
// client's popups have closed. Nothing the engine does is hidden: an unmap that comes inside the span still fails it,
// and an engine-made unmap of a foreign window is still caught by the route audit of cua's own requests.

import { activeWindow } from './scenes.mjs';
import { xprobe } from './xtools.mjs';

/** The X server's resource range of one client: a window id with its resource bits cleared (witness.mjs). */
const CLIENT_MASK = 0x1fffff;
const clientOf = (id) => id & ~CLIENT_MASK;

/** The viewable override-redirect windows of the clients the windows belong to (`xprobe popups`). */
const openPopups = (ids) => JSON.parse(xprobe(['popups', ...ids])).popups;

/**
 * Prepares a foreground sample's start on `target` (a window id), outside its span. The run's other clients are those
 * of its registered windows (`desktop.windows`) less the target's and the front window's. When one of them holds the
 * active window, the front window takes it back (`desktop.focusFront`, as every condition leaves it); a window of the
 * target's own client stays active (a case that activated its target, or Chrome in front on purpose). Then it waits,
 * at most `boundMs`, until none of those clients has a popup open. Returns the sample's record
 * (`{activated_front, quiet, waited_ms, open?}`; `open` the popups still open at the bound, after which the sample
 * goes on), or null for a run with no other client. `active`, `popups`, `sleep` and `now` are given only by the tests.
 */
export async function foregroundStart(desktop, target, { active = activeWindow, popups = openPopups, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now, boundMs = 1000, pollMs = 20 } = {}) {
  const exempt = new Set([clientOf(target), ...(desktop.front?.id ? [clientOf(desktop.front.id)] : [])]);
  const others = new Map();
  for (const { id } of desktop.windows) {
    if (Number.isSafeInteger(id) && id > 0 && !exempt.has(clientOf(id)) && !others.has(clientOf(id))) others.set(clientOf(id), id);
  }
  if (others.size === 0) return null;
  const activatedFront = Boolean(desktop.front?.id) && others.has(clientOf(active()));
  if (activatedFront) desktop.focusFront();
  // the quiet wait's own time, from the front window's activation on
  const now0 = now();
  const ids = [...others.values()];
  let open = popups(ids);
  const atStart = open.length;
  while (open.length && now() - now0 < boundMs) {
    await sleep(pollMs);
    open = popups(ids);
  }
  return { activated_front: activatedFront, popups_at_start: atStart, quiet: open.length === 0, waited_ms: Math.round(now() - now0), ...(open.length ? { open } : {}) };
}
