// What a judged sample's act answered, and whether two failed samples failed the same way: read by the declared
// departures (./departures.mjs, R3) and by the cell's verdict (./cell-verdict.mjs: ruling 1144's shared failures, and
// two frontmost failures called equal only when they are the same failure).
//
// The answer, from the row's outcome as its cell recorded it (./matrix-cells.mjs, ./probe-plan.mjs):
//   kind   'ok' (the act threw nothing), 'refused' or 'unconfirmed' (the act threw an error whose recorded name is one of
//          cua's engine names of that kind, below), else 'error' (any other error, a timeout among them)
//   name   the recorded error name (`outcome.errorName`), or null
//   sentence   the error's sentence without the server's `Computer Use server error -N: ` prefix, or null
// The kind is decided by the recorded name alone, never by a sentence and never by a declaration: a sample whose cell
// recorded no engine name (the facade's plain `Error`) has kind 'error'. The harness (T10b′) records the engine's own
// name as `outcome.errorName` for a departure, or a shared refusal, to be shown.

// cua's engine errors that refuse before acting (nothing sent), and those that answer an act sent but not confirmed
// (native/engine/Sources/Engine: EngineError names).
export const REFUSAL_NAMES = Object.freeze(['backgroundClickRefused', 'concealedInputUnavailable', 'screenChangedSinceScreenshot', 'appWindowOverPoint',
  'windowOnAnotherSpace', 'desktopGateClosed', 'elementAmbiguousBeforeRefetch', 'elementAmbiguousAfterRefetch', 'cannotClickOffscreenElement']);
export const UNCONFIRMED_NAMES = Object.freeze(['clickUnconfirmed', 'typeUnconfirmed', 'valueUnconfirmed', 'pasteUnconfirmed', 'scrollUnconfirmed', 'menuUnconfirmed']);
export const kindOfName = name => (REFUSAL_NAMES.includes(name) ? 'refused' : UNCONFIRMED_NAMES.includes(name) ? 'unconfirmed' : null);

const PREFIX = /^Computer Use server error -?\d+: /;
// The keys of an outcome that record the answer rather than the effect.
const ANSWER_KEYS = new Set(['threw', 'errorName', 'message', 'refused', 'expected', 'stopped', 'sentenceAgrees', 'sentenceEntered', 'entered', 'retries']);

// -> {kind, name, sentence}.
export function answerOf(row) {
  const o = row?.outcome ?? {};
  const said = o.threw ?? (o.refused === true || o.stopped === true ? o.message : null) ?? null;
  const name = typeof o.errorName === 'string' && o.errorName ? o.errorName : null;
  const threw = (typeof said === 'string' && said.length > 0) || o.refused === true || o.stopped === true;
  if (!threw) return {kind: 'ok', name: null, sentence: null};
  return {kind: kindOfName(name) ?? 'error', name, sentence: typeof said === 'string' ? said.replace(PREFIX, '') : null};
}

// Whether two answers are the same: the same kind and name, and for any other error the same sentence.
export function sameAnswer(a, b) {
  return a.kind === b.kind && a.name === b.name && (a.kind !== 'error' || (a.sentence !== null && a.sentence === b.sentence));
}

// Whether two samples read the same effect: the same read-back (`outcome.hash`) where either records one; else the same
// value of every boolean effect reading either records (the answer's keys apart). Nothing to compare is no proof.
export function sameEffect(v, c, {readBack = false} = {}) {
  const a = v?.outcome ?? {}, b = c?.outcome ?? {};
  if (readBack || a.hash !== undefined || b.hash !== undefined) return typeof a.hash === 'string' && a.hash === b.hash;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => !ANSWER_KEYS.has(k) && (typeof a[k] === 'boolean' || typeof b[k] === 'boolean'));
  return keys.length > 0 && keys.every(k => a[k] === b[k]);
}

// Whether two failed samples failed the same way (ruling 1144): the same answer and the same effect; `readBack` when the
// row is judged by an absolute expected string, whose read-back must then be the same. -> boolean.
export const sameFailure = (v, c, options) => sameAnswer(answerOf(v), answerOf(c)) && sameEffect(v, c, options);
