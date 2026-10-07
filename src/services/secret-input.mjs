// What the trusted sky and browser services share about substituting a `{{secret:<label>}}` reference: the error they
// raise, the fixed sentences for every failure before input, and how the launch names the store or says that secrets
// are unavailable.
// Every error here is built fresh from a fixed sentence, a code and at most a label (labels are not secret); none
// carries a cause, a vendor payload or anything derived from a value. The trusted worker returns a rejection's message
// to model code, so nothing here logs either.
import {isAbsolute} from 'node:path';
import {SecretStoreError, STORE_ENV, fileStore} from '../secrets/store.mjs';
import {LABEL_RULE} from '../secrets/label.mjs';

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

// After the value was read and handed to the vendor: a fixed classification of what went wrong, never its text.
export const inputFailed = (what, label, kind) => new SecretInputError('secret_input_failed', `${what} with secret "${label}" failed (${kind}) after the secret was read; it may have been partly entered. The runtime's error is withheld because it can contain the secret`);

// The store reader and the launch's reason there is none, as the trusted worker's environment configures them.
export function secretsFromEnv(env) {
  const dir = env[STORE_ENV.dir];
  const reason = env[STORE_ENV.unavailable];
  if (typeof dir === 'string' && isAbsolute(dir) && !reason) return {secrets: fileStore({dir}), secretsUnavailable: null};
  const unconfigured = async () => { throw new SecretStoreError('not_configured'); };
  return {
    secrets: {read: unconfigured, list: unconfigured},
    secretsUnavailable: LAUNCH_CODE.test(reason ?? '') ? reason : 'secrets_not_configured',
  };
}
