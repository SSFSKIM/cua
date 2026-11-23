// What a judged sample's act answered, and whether two failed samples failed the same way: read by the declared
// departures (./departures.mjs, R3) and by the cell's verdict (./cell-verdict.mjs: ruling 1144's shared failures on the
// fixed-string rows, and two frontmost failures called equal only when they are the same failure).
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

// Whether two samples of a fixed-string row read the same (ruling 1144): the same read-back (`outcome.hash`), and the
// user's own value (`outcome.userKept`, the rows behind a user window) kept on both: a changed user value on either
// side is never the same failure. No read-back recorded is no proof.
export function sameReadBack(v, c) {
  const a = v?.outcome ?? {}, b = c?.outcome ?? {};
  return typeof a.hash === 'string' && a.hash === b.hash && a.userKept !== false && b.userKept !== false;
}

// Whether two samples of a frontmost method row read the same effect: every effect field the case's check recorded (its
// outcome, the answer's keys apart) equal on both, numbers and names as well as booleans (Finder selecting no row is
// not Finder selecting two). Nothing recorded is no proof.
export function sameEffect(v, c) {
  const effect = row => Object.fromEntries(Object.entries(row?.outcome ?? {}).filter(([k]) => !ANSWER_KEYS.has(k)));
  const a = effect(v), b = effect(c);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.length > 0 && keys.every(k => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

// Whether two failed samples failed the same way: the same answer, and the same read-back on a fixed-string row
// (`readBack`, ruling 1144) or else the same recorded effect. -> boolean.
export const sameFailure = (v, c, {readBack = false} = {}) => sameAnswer(answerOf(v), answerOf(c)) && (readBack ? sameReadBack(v, c) : sameEffect(v, c));

// Whether a sample's recorded effect allows the conservative answer it gave, never the answer's name alone: refused, the
// case's watched state read unchanged (`outcome.unchanged`) and not its intended effect; unconfirmed, either the state
// unchanged or the intended effect (`outcome.effect`: the act may have acted, never otherwise than asked). The harness
// records both (T10b′). -> boolean.
export function conservativeEffect(kind, row) {
  const unchanged = row?.outcome?.unchanged === true, intended = row?.outcome?.effect === true;
  return kind === 'refused' ? unchanged && !intended : kind === 'unconfirmed' ? unchanged || intended : false;
}
