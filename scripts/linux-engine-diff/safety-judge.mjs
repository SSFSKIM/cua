// The paste safety cases' judges (M2; safety.mjs runs the cases): pure functions of what a case observed, each the
// property its case exists to show, judged on cua alone, never against a vendor build.

import { landed, occurrences } from './text.mjs';

export const CHANGED = 'requested field or selection changed before dispatch; nothing was sent';
export const UNCONFIRMED = 'Paste was sent once and could not be confirmed; read the field before retrying';
/** Any refusal before dispatch: where two checks race (a focus change and a takeover), which one answers is not fixed. */
export const NOTHING_SENT = /; nothing was sent$/;
/** How soon the request after a bounded paste must answer: the queue is free again. */
const QUEUE_FREE_MS = 1000;

const matches = (sentence, error) => (sentence instanceof RegExp ? sentence.test(String(error)) : error === sentence);

/**
 * A refusal before dispatch: the answer is the expected refusal, no field changed, and the clipboard holds what the case
 * expects (the prior owner's text, or the text of an owner that took CLIPBOARD meanwhile).
 */
export function judgeRefusal({ answer, sentence, fields, clipboard, expectClipboard }) {
  const reasons = [];
  if (answer?.ok !== false || !matches(sentence, answer.error)) reasons.push(`answered ${JSON.stringify(answer)}, not the refusal ${sentence}`);
  fields.forEach((f, i) => {
    if (f.after !== f.before) reasons.push(`field ${i} changed`);
  });
  if (clipboard?.ok !== true || clipboard.text !== expectClipboard) reasons.push(`the clipboard holds ${JSON.stringify(clipboard)}, not ${JSON.stringify(expectClipboard)}`);
  return { pass: reasons.length === 0, reasons };
}

/**
 * An unconfirmed paste: the unconfirmed sentence (never one that says nothing was sent, which would invite a retry),
 * answered within its bound, the field as the case expects it, and the next request answered at once.
 */
export function judgeUnconfirmed({ answer, ms, boundMs, field, expectField, next = null, clipboard, expectClipboard }) {
  const reasons = [];
  if (answer?.ok !== false || answer.error !== UNCONFIRMED) reasons.push(`answered ${JSON.stringify(answer)}, not the unconfirmed sentence`);
  if (!(ms <= boundMs)) reasons.push(`answered after ${Math.round(ms)} ms, past its ${boundMs} ms bound`);
  if (field.after !== expectField) reasons.push(`the field holds ${JSON.stringify(String(field.after).slice(-80))}, not the expected text`);
  if (next && !(next.ok && next.ms < QUEUE_FREE_MS)) reasons.push(`the next request answered ${next.ok ? `after ${Math.round(next.ms)} ms` : 'with an error'}`);
  if (expectClipboard !== undefined && (clipboard?.ok !== true || clipboard.text !== expectClipboard)) reasons.push(`the clipboard holds ${JSON.stringify(clipboard)}`);
  return { pass: reasons.length === 0, reasons };
}

/**
 * A conversion the target made after the 500 ms start bound: the paste answers unconfirmed, and the late request is
 * served the paste itself (still being served before the cleanup) or refused, never the snapshot of the prior clipboard;
 * after the cleanup (`mustRefuse`) it is refused.
 */
export function judgeLateConvert({ answer, received, paste, prior, mustRefuse }) {
  const reasons = [];
  if (answer?.ok !== false || answer.error !== UNCONFIRMED) reasons.push(`answered ${JSON.stringify(answer)}, not the unconfirmed sentence`);
  if (received.length === 0) reasons.push('the late conversion was never answered');
  for (const r of received) {
    if (r.received === 'refused') continue;
    if (r.text === prior) reasons.push('the late conversion was served the prior clipboard as the paste');
    else if (r.text !== paste) reasons.push(`the late conversion was served ${JSON.stringify(String(r.text).slice(0, 40))}`);
    else if (mustRefuse) reasons.push('the late conversion was served after the cleanup');
  }
  return { pass: reasons.length === 0, reasons };
}

/**
 * Concurrent pastes: each answered success and landed once at its own field's caret (`before`: the field's `{text, caret,
 * selection}`), nothing of the other's, the prior clipboard kept.
 */
export function judgeConcurrent({ answers, fields, clipboard, prior }) {
  const reasons = [];
  answers.forEach((a, i) => {
    if (a?.ok !== true) reasons.push(`paste ${i} answered ${JSON.stringify(a)}`);
  });
  fields.forEach((f, i) => {
    if (landed(f.before, { text: f.after }, f.marker) !== true) reasons.push(`field ${i} holds ${JSON.stringify(String(f.after).slice(-60))}, not its marker once at its caret`);
    for (const other of fields.filter((g) => g !== f)) if (occurrences(String(f.after), other.marker) > 0) reasons.push(`field ${i} received another session's marker`);
  });
  if (clipboard?.ok !== true || clipboard.text !== prior) reasons.push(`the clipboard holds ${JSON.stringify(clipboard)}, not the prior text`);
  return { pass: reasons.length === 0, reasons };
}

/** Lock contention: every paste answered success, each field gained exactly its own markers in order, the clipboard kept. */
export function judgeContention({ answers, fields, clipboard, prior }) {
  const reasons = [];
  const failed = answers.filter((a) => a?.ok !== true);
  if (failed.length) reasons.push(`${failed.length} pastes failed: ${[...new Set(failed.map((a) => a?.error))].join('; ')}`);
  fields.forEach((f, i) => {
    if (landed(f.before, { text: f.after }, f.markers.join('')) !== true) reasons.push(`field ${i} does not hold exactly its own markers in order at its caret`);
  });
  if (clipboard?.ok !== true || clipboard.text !== prior) reasons.push(`the clipboard holds ${JSON.stringify(clipboard)}, not the prior text`);
  return { pass: reasons.length === 0, reasons };
}
