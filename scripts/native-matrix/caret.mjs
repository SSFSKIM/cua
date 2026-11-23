// The caret cells of #258 and #259 (T8e; the M4/M5 pre-flight's §6, "One cell each on a runner beside the vendor,
// reading the selection or the caret's offset back"): two frontmost cases on the Electron fixture's field
// (./plan.mjs CARET), each judged by where the field's caret or selection is after a click. The range is read on the
// device outside either engine, by the approved bundle's `--probe text-view` (AXSelectedTextRange of the scene's first
// text area: ./matrix-device.mjs text-range), once before the click, where it must read what the prepare made, and once
// after it (./steps.mjs caseRow). The judge compares the reading with the vendor's of the same run (./cell-verdict.mjs
// 'reading'): neither difference can be declared (./departures.mjs).
//   selection (#258)  the field holding a word selected, then an element click on it: a person's click (and the vendor's,
//                     as registered) places a caret, so the selection must collapse; cua's AXPress kept it
//   point (#259)      the caret at the value's end, then a coordinate click on a line: the caret must land on that line;
//                     cua's landed one line low once (2026-11-01) and on target since (2026-11-05)
// What leaves the device and the row: offsets, lengths, line and column numbers and booleans; never the field's text.

// A range {location, length} of non-negative integers, or null.
export const rangeOf = r => (r && Number.isSafeInteger(r.location) && Number.isSafeInteger(r.length) && r.location >= 0 && r.length >= 0
  ? {location: r.location, length: r.length} : null);
const words = r => `${r.location}+${r.length}`;
const reason = text => String(text ?? 'no answer').slice(0, 160);

// The device's reading of the field from the text-view probe's answer (TextViewProbe.swift): the first window's text
// area's selected range, and whether the app's focused element is that text area. -> {range, focused} | {error}.
export function fieldRange(answer) {
  if (!answer || answer.error) return {error: reason(answer?.error)};
  const windows = Array.isArray(answer.windows) ? answer.windows : [];
  const index = windows.findIndex(w => w?.textArea);
  if (index < 0) return {error: 'the process shows no text area'};
  return {range: rangeOf(windows[index].textArea.selectedRange), focused: answer.focused?.textAreaOfWindow === index};
}

// Where an offset sits in the value of `lines` joined by newlines, both 0-based (a line's end is on it), or null
// outside the value.
export function lineColumn(lines, offset) {
  let start = 0;
  if (!Number.isSafeInteger(offset) || offset < 0) return null;
  for (const [line, text] of lines.entries()) {
    if (offset <= start + text.length) return {line, column: offset - start};
    start += text.length + 1;
  }
  return null;
}

// Before the click: the device must read the range the prepare made (`spec.before`), or the row says nothing (its
// prepare is not proven by a reader outside the engine). -> null, or the reason.
export function caretPrepared(spec, reading) {
  const range = rangeOf(reading?.range);
  if (!range) return `the field's range could not be read before the click (${reason(reading?.error ?? 'no range')})`;
  if (range.location !== spec.before.location || range.length !== spec.before.length) return `the field's range read ${words(range)} where the prepare made ${words(spec.before)}`;
  return null;
}

// After the click: the reading as the row's outcome (the effect the judge compares with the vendor's), and whether it
// is the click's own expected effect. selection: the selection collapsed to a caret (`kept` whether it is still the
// prepared one); point: the caret on the aimed line (`onTarget`), whatever its column. -> {ok, outcome} | {invalid}.
export function caretOutcome(spec, reading) {
  const range = rangeOf(reading?.range);
  if (!range) return {invalid: `the field's range could not be read after the click (${reason(reading?.error ?? 'no range')})`};
  const at = lineColumn(spec.lines, range.location);
  if (!at) return {invalid: `the field's range ${words(range)} lies outside the field's value`};
  const collapsed = range.length === 0;
  if (spec.kind === 'selection') {
    const kept = range.location === spec.before.location && range.length === spec.before.length;
    return {ok: collapsed, outcome: {range, collapsed, kept, ...at}};
  }
  const onTarget = collapsed && at.line === spec.line;
  return {ok: onTarget, outcome: {range, collapsed, ...at, onTarget}};
}
