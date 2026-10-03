// What the trusted sky and browser services share about substituting a `{{secret:<label>}}` reference: the error they
// raise, the fixed sentences for every failure before input, and how the launch says that secrets are unavailable.
// Every error here is built fresh from a fixed sentence, a code and at most a label (labels are not secret); none
// carries a cause, a vendor payload or anything derived from a value. The trusted worker returns a rejection's message
// to model code, so nothing here logs either.
import {BROKER_ENV, BrokerError, brokerClientFromEnv} from '../secrets/client.mjs';

export const NOTHING_ENTERED = 'nothing was entered';
const LAUNCH_CODE = /^[a-z][a-z_]{0,63}$/;

// Broker client codes -> what the caller is told. Codes absent here (transport and protocol failures) mean secrets
// are unavailable on this connection.
const BROKER_OUTCOMES = {
  not_found: 'secret_not_found',
  denied: 'secret_denied',
  locked: 'secret_locked',
  unsupported_value: 'secret_unsupported_value',
  invalid_label: 'invalid_secret_label',
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

export const invalidLabel = () => new SecretInputError('invalid_secret_label', `a {{secret:…}} reference must name a label of 1-128 letters, digits, '.', '_' or '-', starting with a letter or digit; ${NOTHING_ENTERED}`);

export function unavailable(reason) {
  if (reason === 'secrets_disabled') return new SecretInputError('secrets_disabled', `secrets are turned off for this server (CUA_SHIM_SECRETS=off); ${NOTHING_ENTERED}`);
  return new SecretInputError('secrets_unavailable', `secrets are unavailable on this connection (${reason}); ${NOTHING_ENTERED}`);
}

export function readFailure(error, label) {
  const code = error instanceof BrokerError ? error.code : 'error';
  switch (BROKER_OUTCOMES[code]) {
    case 'secret_not_found': return new SecretInputError('secret_not_found', `no secret named "${label}" (secrets_list shows the stored labels); ${NOTHING_ENTERED}`);
    case 'secret_denied': return new SecretInputError('secret_denied', `Keychain access to secret "${label}" was denied; ${NOTHING_ENTERED}`);
    case 'secret_locked': return new SecretInputError('secret_locked', `the Keychain is locked, so secret "${label}" could not be read; ${NOTHING_ENTERED}`);
    case 'secret_unsupported_value': return new SecretInputError('secret_unsupported_value', `secret "${label}" is not valid UTF-8 text; ${NOTHING_ENTERED}`);
    case 'invalid_secret_label': return invalidLabel();
    default: return unavailable(code);
  }
}

// After the value was read and handed to the vendor: a fixed classification of what went wrong, never its text.
export const inputFailed = (what, label, kind) => new SecretInputError('secret_input_failed', `${what} with secret "${label}" failed (${kind}) after the secret was read; it may have been partly entered. The runtime's error is withheld because it can contain the secret`);

// The broker client and the launch's reason there is none, as the trusted worker's environment configures them.
export function secretsFromEnv(env) {
  const configured = env[BROKER_ENV.endpoint] && env[BROKER_ENV.token];
  const reason = env[BROKER_ENV.unavailable];
  return {
    secrets: brokerClientFromEnv({env}),
    secretsUnavailable: configured ? null : (LAUNCH_CODE.test(reason ?? '') ? reason : 'secrets_not_configured'),
  };
}
