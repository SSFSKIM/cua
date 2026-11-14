// Drop-signals rows as drop-signals.mjs `oneDrag` writes them, for the gate's drop judges' tests (drop-signals-judge.mjs
// `electronDropVerdict`, `chromeDropVerdict`): the page's status before and after the drag, the read's notice after the
// watch's lifetime, and the preflight's answer after it. Not a test file of its own.

/** What an Electron and a Chrome drag left pending, in the engine's words (dnd.rs `pending_cause`). */
export const CAUSES = {
  unconfirmed: (app) => `an unconfirmed drop: your drag into ${app} began a drag and drop, and ${app} did not confirm a drop after the release, so the drop may not have landed as the drag answered`,
  late: (app) => `a late drag and drop: ${app} started a drag and drop after your drag into it ended, so the drag did not end as it answered; it may have dropped and changed the desktop`,
  failed: (app) => `a failed watch: the drag-and-drop watch after your drag into ${app} failed (connection lost), so a drop may have happened unseen and changed the desktop`,
};

/** The notice every reply carries while `cause` is pending (dnd.rs `pending_notice`). */
export const noticeOf = (cause) => `Pending from your last drag, ${cause}. Read the window before sending input again: your next input request will not be run`;
/** The refusal of the first acting request, a preflight, while `cause` is pending (dnd.rs `pending_refusal`). */
export const refusalOf = (cause) => `Pending from your last drag, ${cause}; this preflight request was not run, so read the window before sending it again`;

/** Each cell's page source where it is not the plain one (drop-signals-judge.mjs `T14_SOURCE`, `CELL_SOURCE`). */
const SRC = { 'inzone-out': 'inzone', move: 'move', 'freeze-250': 'press-150' };

/**
 * One drag's row. By default a landed drop into the zone, answered ok with nothing pending. `pending` names what the
 * drag left pending (a key of `CAUSES`), its notice on the read and the preflight refused with it unless `next` says
 * otherwise. `started` false leaves the page's last record as the earlier trial's (`inherited`: a drop by default), as
 * the page keeps it until the next dragstart. `stamp` false writes the page's record as it was before the press stamp
 * (the stored sittings'), with the dragstart's latency from the press `lat`.
 */
export function dropRow({ family = 'electron', app = family === 'chrome' ? 'Google-chrome' : 'cua171-electron-page', lane = 'cua', cell = 'plain', i = 0, load = 'idle', ok = true, pending = null, landed = cell === 'plain' || cell === 'plain-long', effect = landed ? 1 : 0, cold = false, verified, started = true, inherited = {}, stamp = true, lat = 4, next, late = false, escaped = false, accepted } = {}) {
  const src = SRC[cell] ?? 'plain';
  const earlier = { src: 'plain', ...(stamp ? { seq: 9 } : {}), effect: 1, lat: 3, dur: 300, ...inherited };
  const before = { dnd: { [src]: { starts: 9, drops: 7 } }, press: { seq: 9, at: 1 }, last: earlier };
  const after = {
    dnd: { [src]: { starts: 9 + (started ? 1 : 0), drops: 7 + (landed ? 1 : 0) } },
    press: { seq: 10, at: 2 },
    last: started ? { src, ...(stamp ? { seq: 10 } : {}), effect, lat, dur: 300 } : earlier,
  };
  const cause = pending && CAUSES[pending](app);
  const lateDnd = pending === 'late' ? { app, escaped: true } : pending === 'unconfirmed' ? { app, unconfirmed: true } : pending ? { app, failed: 'connection lost' } : null;
  return {
    kind: 'drop-signal',
    load,
    family,
    lane,
    cell,
    base: cell,
    i,
    cold,
    ok,
    notice: cause ? noticeOf(cause) : null,
    next: next ?? (cause ? { ok: false, error: refusalOf(cause), late_dnd: lateDnd } : { ok: true, error: null, late_dnd: null }),
    before,
    after,
    outcome: { started, landed, effect: null },
    signals: { take_after_press_ms: started ? 20 : null, late_take: late },
    escaped,
    ...(accepted === undefined ? {} : { accept: { accepted } }),
    ...(verified === undefined ? {} : { end_park: { over: 1, verified } }),
  };
}
