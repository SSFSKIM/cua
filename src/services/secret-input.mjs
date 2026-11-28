// What the trusted sky and browser services share about substituting a `{{secret:<label>}}` reference: the error they
// raise, the fixed sentences for every failure before input, and how the launch names the store or says that secrets
// are unavailable.
// Every error here is built fresh from a fixed sentence, a code and at most a label (labels are not secret); none
// carries a cause, a vendor payload or anything derived from a value. The trusted worker returns a rejection's message
// to model code, so nothing here logs either.
import {isAbsolute} from 'node:path';
import {SecretStoreError, STORE_ENV, fileStore, tieredStore} from '../secrets/store.mjs';
import {LABEL_RULE, RESERVED_PREFIX, isReserved} from '../secrets/label.mjs';
import {EFFECT_PHRASES} from './engine/interruption.mjs';

export const NOTHING_ENTERED = 'nothing was entered';
const LAUNCH_CODE = /^[a-z][a-z_]{0,63}$/;

// Store refusals -> what the caller is told. Codes absent here (an unreadable store) mean secrets are unavailable.
const STORE_OUTCOMES = {
  not_found: 'secret_not_found',
  not_regular_file: 'secret_not_regular_file',
  wrong_owner: 'secret_wrong_owner',
  insecure_mode: 'secret_insecure_mode',
  too_large: 'secret_too_large',
  unsupported_value: 'secret_unsupported_value',
  empty: 'secret_empty',
  unreadable: 'secret_unreadable',
};

export class SecretInputError extends Error {
  constructor(code, sentence) {
    super(`cua: ${sentence} [${code}]`);
    this.name = 'SecretInputError';
    this.code = code;
  }
}

export const isPlainObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

// The property key a vendor service would look a name up by: lookups by request field coerce (["paste"] reaches
// paste), so eligibility is judged on the same key and the pinned shape then demands a plain string. Requests arrive
// decoded from the runtime's transport, so coercion runs no foreign code; anything uncoercible is ineligible.
export function propertyKey(value) {
  if (typeof value === 'string') return value;
  try { return String(value); } catch { return null; }
}

// Exactly these keys, each of its pinned primitive type; an `optional` key may be absent or undefined.
export function matchesShape(object, fields, optional = []) {
  const keys = Object.keys(fields);
  return isPlainObject(object)
    && Object.keys(object).every(key => keys.includes(key))
    && keys.every(key => Object.hasOwn(object, key) && object[key] !== undefined ? fields[key](object[key]) : optional.includes(key));
}

export const invalidLabel = () => new SecretInputError('invalid_secret_label', `a {{secret:…}} reference must name a key: ${LABEL_RULE}; ${NOTHING_ENTERED}`);

// A reference is refused before anything is read when its label breaks the key rule, or when the key is reserved for a
// device credential (label.mjs), which the model never enters anywhere.
export function refuseUnusable(reference) {
  if (reference.invalid) throw invalidLabel();
  if (isReserved(reference.label)) throw new SecretInputError('secret_reserved', `keys starting ${RESERVED_PREFIX} are device credentials, which are never entered; ${NOTHING_ENTERED}`);
}

export function unavailable(reason) {
  if (reason === 'secrets_disabled') return new SecretInputError('secrets_disabled', `secrets are turned off for this server (CUA_SHIM_SECRETS=off); ${NOTHING_ENTERED}`);
  return new SecretInputError('secrets_unavailable', `secrets are unavailable on this connection (${reason}); ${NOTHING_ENTERED}`);
}

// The store's own sentence names at most the key and its file, never a value.
export function readFailure(error, label) {
  if (!(error instanceof SecretStoreError)) return unavailable('error');
  if (error.code === 'invalid_label') return invalidLabel();
  if (error.code === 'not_found') return new SecretInputError('secret_not_found', `no secret named "${label}" (secrets_list shows the stored keys); ${NOTHING_ENTERED}`);
  const code = STORE_OUTCOMES[error.code];
  return code ? new SecretInputError(code, `${error.message}; ${NOTHING_ENTERED}`) : unavailable(error.code);
}

// Ruling 1247 (d): once any key of a secret may have posted, some of it may have gone in where it can be seen, so no
// sentence after that advises observing the app: neither a screenshot nor the accessibility state, by name or otherwise.
// Which warning, read from the read-back record's reason alone, compared with literals, never from or with the
// runtime's text, and given only when something may have been entered:
// - 'passwordField' (#414): the secret went into a password field that stopped being one meanwhile (a show-password
//   toggle), noLongerSecure, or one the engine could not classify again (`secure` true with fieldUnreadable or
//   roleUnreadable: the reviews of 4a005a8c..a1939d2f, P1-4, and a1939d2f..e8e2702e, 4), so the field may show it;
// - 'unplaced' (#587): the keys posted and their text was not confirmed where it went (notTextField, noFocusedElement,
//   fieldChanged, or any other reason the read-back answers after posting); and every other failure after a key may
//   have put part of it anywhere, so the caller warns the same way without a record.
const PASSWORD_REASONS = new Set(['fieldUnreadable', 'roleUnreadable']);
export const secretMayShow = meta => {
  if (!isPlainObject(meta) || !isPlainObject(meta.typeReadback)) return null;
  const {reason, secure, confirmed} = meta.typeReadback;
  if (typeof reason !== 'string') return null;
  if (reason === 'noLongerSecure' || (PASSWORD_REASONS.has(reason) && secure === true)) return 'passwordField';
  if (confirmed !== true && reason !== 'selectionChanged') return 'unplaced';
  return null;
};
const MAY_SHOW = {
  passwordField: 'The password field may have stopped being one while the secret was typed, and may now show it: do not capture the screen or read the app\'s accessibility state; put it right with setValue. ',
  unplaced: 'It may show where it went: do not capture the screen or read the app\'s accessibility state; ask the person to check, and do not enter it again. ',
};

// Rulings 1260 and 1268 (#602): nothing was entered only on cua's macOS engine's positive record that the request
// stopped before any of its input went out (its input meta's `beforeInput: true`: no key, no ⌘V or Return, no value
// write), and, when the meta carries #212's interruption account, only if its phase is one the engine sends and every
// effect it names is a preparation step that never carries the value. The sky service reads it only from cua's engine
// as the selected backend (sky.mjs). Anything else (no record, `startedAt` null alone, a meta or an account that is not
// a plain object, an unknown phase or effect, effects not an array) answers "may have been entered"; an input or value
// effect always does.
const INTERRUPTION_PHASES = ['beforeAction', 'inFlight'];
// The engine's `InputEffect`s other than `value` and `input` (native/engine/Sources/Engine/Intervention.swift,
// feat/117-m5): the scroll into view, the background activation, its click, the focus write, the focus fallback click,
// and a held activation's end.
const PREPARATION_EFFECTS = ['scroll', 'activation', 'activationClick', 'focus', 'focusClick', 'activationRelease'];
export const secretUnentered = meta => {
  if (!isPlainObject(meta) || meta.beforeInput !== true) return false;
  if (!Object.hasOwn(meta, 'interruption')) return true;
  const account = meta.interruption;
  return isPlainObject(account) && INTERRUPTION_PHASES.includes(account.phase) && Array.isArray(account.effects)
    && account.effects.every(effect => PREPARATION_EFFECTS.includes(effect));
};

// After the value was read and handed to the vendor: a fixed classification of what went wrong, never its text, and
// the warning `mayShow` names, if any (the sky service names one for every failure that may have entered part of it).
export const inputFailed = (what, label, kind, mayShow = null) => new SecretInputError('secret_input_failed', `${what} with secret "${label}" failed (${kind}) after the secret was read; it may have been partly entered. ${MAY_SHOW[mayShow] ?? ''}The runtime's error is withheld because it can contain the secret`);
// The same failure when the runtime records that nothing was posted (secretUnentered).
export const inputFailedUnentered = (what, label, kind) => new SecretInputError('secret_input_failed', `${what} with secret "${label}" failed (${kind}) after the secret was read, and ${NOTHING_ENTERED}. The runtime's error is withheld because it can contain the secret`);

// userIntervened (−10016) carries one of two sentences that ask the model for different things (the vendor's, which cua's
// engine keeps): wait and retry while the user is still at the app, or re-query its state after the user changed it.
// The wrapper withholds the runtime's text, so it repeats which one with a fixed sentence of its own, and either sentence
// was entered in part unless the runtime records that nothing was posted (`unentered`, secretUnentered: cua's engine's
// refusal before the action, or a stop before the first key, which is "changed" as a stop between keys is; ruling 1268:
// not the sentence, nor the vendor, whose meta says nothing either way). Once it may be entered, neither waiting and
// retrying nor the re-query is the instruction: the user's check is (ruling 1247, d). Never a count of what was entered,
// which would tell the secret's length.
const INTERVENED = {
  stillInteracting: 'the user is still interacting with the app; wait 5 seconds and retry',
  userChanged: 'the user changed the app; re-query its state (getAXState) before sending more actions',
};
const INTERVENED_ENTERED = {
  stillInteracting: 'the user is interacting with the app, and the secret may have gone in; ask the user to check where it went and to clear it if it shows',
  userChanged: 'the user changed the app while the secret was being entered; ask the user to check where it went and to clear it if it shows',
};
// A password field that may now show the secret: the one instruction is the user's (the review of f35a42b8..cbce12e2, P1).
const INTERVENED_MAY_SHOW = {
  stillInteracting: 'the user is interacting with the app; ask the user to hide or clear the password field, before any setValue',
  userChanged: 'the user changed the app; ask the user to hide or clear the password field, before any setValue',
};
// Which of the two a runtime's message is, read from the sentence's fixed opening only; null for anything else.
export function interventionKind(message) {
  if (typeof message !== 'string') return null;
  if (message.includes('The user is still interacting with \'')) return 'stillInteracting';
  if (message.includes('The user changed \'')) return 'userChanged';
  return null;
}
// #212: with cua's engine's account of the request (`interruption`, ./engine/interruption.mjs readInterruption), the
// answer also says where the intervention stopped it and what may have taken effect, in the engine's fixed phrases: a
// refusal before the action took none of the input's steps (not "did nothing": the request's prologue may have re-enabled
// a Chromium app's accessibility); otherwise the account's phase and each step it names. The account only describes:
// whether anything was entered is `unentered` alone (ruling 1268), never the phase or the effects.
function interruptionAccount({phase, effects}) {
  const opening = phase === 'beforeAction' ? 'it was refused before its first step' : 'it was stopped part-way';
  if (phase === 'beforeAction' && effects.length === 0) return opening;
  const reached = effects.length ? `what may have taken effect: ${effects.map(effect => EFFECT_PHRASES[effect]).join('; ')}` : 'any step it had begun may have taken effect';
  return `${opening}, and ${reached}; nothing was undone`;
}
// Whether the secret was entered is the runtime's record alone (`unentered`, secretUnentered); the instruction and the
// password field's warning follow `mayShow`, the placement (secretMayShow), only once it may have been entered, so no
// answer that may follow a key advises observing the app (ruling 1247, d). `interruption` (#212) adds its account.
export function userIntervened(what, label, kind, unentered, mayShow = 'unplaced', interruption = null) {
  const entered = !unentered;
  const password = entered && mayShow === 'passwordField';
  const instruction = (!entered ? INTERVENED : password ? INTERVENED_MAY_SHOW : INTERVENED_ENTERED)[kind];
  const account = interruption ? `; ${interruptionAccount(interruption)}` : '';
  return new SecretInputError('secret_input_failed', `${what} with secret "${label}" failed (userIntervened) after the secret was read: ${instruction}; ${entered ? 'it may have been partly entered' : NOTHING_ENTERED}${account}. ${password ? MAY_SHOW.passwordField : ''}The runtime's error is withheld because it can contain the secret`);
}

// cua's native engine refused a concealed request before entering anything (its concealedInputUnavailable, with the
// record that nothing was posted; without it the sky service gives the failure's diagnostic instead): a secret is
// never pasted, so a concealed paste is refused whatever the input source, and a concealed type_text is keyed only under
// an input source whose reading the engine trusts and only when the app takes every character of it (ruling 1128: a
// Chromium or Electron app drops a character above U+FFFF, so such a secret is refused rather than typed partly). A
// fixed sentence per method and cause, not the engine's, as every diagnostic after the value was read is. The cause is
// the engine's meta `concealedRefusal`; an engine without it (before ruling 1128) refused a type_text only for the input
// source, and a cause this wrapper does not know names none, so a refusal never blames the source when it is not the cause.
const CONCEALED_SET_VALUE = 'Use setValue on a settable field, which needs no keystrokes or clipboard';
const CONCEALED_REASON = {
  paste: 'a secret is never pasted. Use typeText, which keys it, or setValue on a settable field, which needs no keystrokes or clipboard',
  inputSource: `a secret is never pasted, and the active input source cannot type it reliably (a non-Latin source, or the app's own source while it is in the background). ${CONCEALED_SET_VALUE}, or switch to a Latin input source`,
  droppedCharacter: `it holds a character this app drops when typed, such as an emoji, and cua never types a secret partly or pastes it. ${CONCEALED_SET_VALUE}`,
  unknown: `cua's engine cannot type it whole here, and a secret is never pasted. ${CONCEALED_SET_VALUE}`,
};
const concealedReason = (what, cause) => {
  if (what === 'paste') return CONCEALED_REASON.paste;
  if (cause === undefined || cause === null || cause === 'inputSource') return CONCEALED_REASON.inputSource;
  return cause === 'droppedCharacter' ? CONCEALED_REASON.droppedCharacter : CONCEALED_REASON.unknown;
};
export const concealedInputUnavailable = (what, label, cause = null) => new SecretInputError('concealed_input_unavailable', `${what} with secret "${label}" was refused and ${NOTHING_ENTERED}: ${concealedReason(what, cause)}`);

// The store reader and the launch's reason there is none, as the trusted worker's environment configures them. With a
// project directory too, a key is read from the project's store first and from the global one when the project has none.
export function secretsFromEnv(env) {
  const dir = env[STORE_ENV.dir];
  const projectDir = env[STORE_ENV.projectDir];
  const reason = env[STORE_ENV.unavailable];
  if (typeof dir === 'string' && isAbsolute(dir) && !reason) {
    const global = fileStore({dir});
    const secrets = typeof projectDir === 'string' && isAbsolute(projectDir) ? tieredStore({project: fileStore({dir: projectDir}), global}) : global;
    return {secrets, secretsUnavailable: null};
  }
  const unconfigured = async () => { throw new SecretStoreError('not_configured'); };
  return {
    secrets: {read: unconfigured, list: unconfigured},
    secretsUnavailable: LAUNCH_CODE.test(reason ?? '') ? reason : 'secrets_not_configured',
  };
}
