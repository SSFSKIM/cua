// What the key-route diagnostic's taps caught of its one Escape (ruling 1198): read by its lane's record
// (./key-route-run.mjs re-exports it) and by the sitting's report (../hosted-sittings/key-route-report.mjs). Pure, and
// apart from the lane's run machinery so the report's readers import only this.

// How far around the press's own device-clock window a tap's event is still the press's: the post can precede the
// cell's clock reading by a little, and its delivery follow the call's return.
export const CAPTURE_MS = Object.freeze({before: 50, after: 500});
// A pid field that could not be read (0 or below) is "unavailable", never printed as a pid.
const pidOf = value => (Number.isSafeInteger(value) && value > 0 ? value : 'unavailable');

// Why the taps cannot say where the Escape went: [string], empty when they could.
function tapFailures(tap) {
  const start = tap?.start;
  if (!start) return ['no tap was started'];
  if (start.refused) return [`the tap was refused: ${start.refused}`];
  if (start.launched !== true) return [`the tap did not launch: ${start.reason ?? 'unnamed'}`];
  if (start.ready !== true) return [`the tap did not report ready: ${start.reason ?? 'unnamed'}`];
  const failures = [], taps = Array.isArray(start.taps) ? start.taps : [];
  if (start.listenAccess !== true) failures.push('the tap app has no Input Monitoring access');
  if (!taps.length) failures.push('the tap app created no tap');
  for (const t of taps) if (t.created !== true) failures.push(`the ${t.label} tap (pid ${t.pid}) was not created`);
  const stop = tap.stop;
  if (!stop) failures.push('the tap was not stopped');
  else if (stop.refused) failures.push(`the tap's stop was refused: ${stop.refused}`);
  else if (stop.logRead !== true) failures.push('the tap\'s log could not be read');
  else if (stop.ready !== true) failures.push('the tap\'s log holds no readiness line');
  return failures;
}

// What the taps caught of the press (meta.keyRoute's tap and press).
// -> {state: 'seen' | 'none' (the taps worked and saw no Escape in the window) | 'failed' (`failures` name why) |
//     'no-press' (no window to read against), window: [from, to] | null, failures, events (in the window), unmatched
//     (the rest)}; each event's target and source a pid or "unavailable".
export function captureOf(tap, press) {
  const failures = tapFailures(tap);
  const window = press?.sent === true && Array.isArray(press.at) && press.at.length === 2 && press.at.every(Number.isFinite)
    ? [press.at[0] - CAPTURE_MS.before, press.at[1] + CAPTURE_MS.after] : null;
  const all = (tap?.stop?.events ?? []).map(e => ({...e, target: pidOf(e.target), source: pidOf(e.source)}));
  const inside = e => window !== null && Number.isFinite(e.at) && e.at >= window[0] && e.at <= window[1];
  const events = all.filter(inside), unmatched = all.filter(e => !inside(e));
  return {state: failures.length ? 'failed' : !window ? 'no-press' : events.length ? 'seen' : 'none', window, failures, events, unmatched};
}
