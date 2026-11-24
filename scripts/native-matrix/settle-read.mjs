// The settle read-back (ruling 1197), shared by the rows whose field's accessibility value can trail the action: the
// Unicode matrix's pressKey rows (an input method composing its keys; pilot C-2's vendor read ㄱ for r k) and the Save
// sheet's setValue.name (ruling 1204: a write the panel service may take late, or not at all). The field is read until
// it holds what the row expects or has read the same for SETTLE_STABLE_MS, never past SETTLE_CAP_MS after the first
// read, SETTLE_POLL_MS apart; the same cell source on both lanes.
export const SETTLE_STABLE_MS = 500;
export const SETTLE_CAP_MS = 2_000;
const SETTLE_POLL_MS = 100;

// The loop as cell source. `find`: the field's index as an expression over `ax`; `done`: whether the value read so far
// (`__value`) is the expected one, as an expression. The clock is monotonic and starts when the first read completes; no
// read starts once the cap has passed, and one that returns after it is not taken (`__late`): the last value read inside
// the cap is the one left. A field missing from a read ends the cell {invalid}, or with `missing: 'unread'` ends the loop
// with `__missing` set and that read in the trail as {ms, value: null}, the row's own outcome then saying the final value
// was unread. Leaves `__value` (the last value read inside the cap, null when none), `__reads`, `__from` and `__last`
// (the first and last reads' times), `__late`, `__missing`, and `__trail` (each read taken: {ms after the first,
// value}; the value stays in the cell unless the row's own outcome says otherwise).
export const settleRead = ({find, done, missing = 'invalid'}) => `let __value = null, __from = null, __since = null, __last = null, __reads = 0, __late = false, __missing = false;
const __trail = [];
for (;;) {
  const ax = await observe();
  const __at = performance.now();
  // A read that returned after the cap is not taken: the last value read inside it is judged.
  if (__from !== null && __at - __from > ${SETTLE_CAP_MS}) { __late = true; break; }
  __last = __at; __from ??= __last; __reads++;
  const __index = ${find};
  if (__index === null) ${missing === 'unread' ? '{ __missing = true; __trail.push({ms: Math.round(__last - __from), value: null}); break; }' : 'return {invalid: "the field is not in the text"};'}
  const __now = plain(valueOfIndex(ax, __index) ?? "");
  __trail.push({ms: Math.round(__last - __from), value: __now});
  if (__now !== __value) { __value = __now; __since = __last; }
  if ((${done}) || __last - __since >= ${SETTLE_STABLE_MS} || __last - __from >= ${SETTLE_CAP_MS}) break;
  await new Promise(done => setTimeout(done, ${SETTLE_POLL_MS}));
  if (performance.now() - __from >= ${SETTLE_CAP_MS}) break;
}`;
