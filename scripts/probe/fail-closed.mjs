// The fail-closed phase of scripts/probe-secrets.mjs: the names of the steps it records and the step a refused launch
// records, shared with the acceptance inventory (scripts/accept/lib.mjs PROBE_SECRETS_PHASES), so the two cannot
// drift apart.
//   - SECRETS_OFF: a connection served with secrets off; each substitution method fails closed (secrets_disabled),
//     then the connection closes.
//   - STORE_UNREADABLE: a connection whose store this user cannot enter. Since #115 M1 a confined connection cannot
//     establish the store's tiers there, so its launch is refused before the handshake (sandbox_state_invalid).
export const SECRETS_OFF = 'secrets off';
export const STORE_UNREADABLE = 'store unreadable';
export const FAIL_CLOSED_METHODS = ['type_text', 'paste', 'set_value'];
export const failClosedStep = (tag, method) => `${tag}: ${method} reference fails closed`;
export const closeStep = tag => `${tag}: close`;
export const failClosedSteps = tag => [...FAIL_CLOSED_METHODS.map(method => failClosedStep(tag, method)), closeStep(tag)];
export const refusedLaunchStep = tag => `${tag}: the launch is refused`;

// The step a refused connection records, from what was observed: `answered` (initialize got a result), `exit`
// ({code} or null for a timeout), `stderr`, `delivered` (calls the target received), the `expected` code and the
// strings the refusal must `name`. -> {name, status, detail}.
export function refusedLaunchResult(tag, {answered, exit, stderr, delivered, expected, names = []}) {
  const ok = !answered && exit !== null && exit.code !== 0 && stderr.includes(`[${expected}]`) && names.every(name => stderr.includes(name)) && delivered === 0;
  return {name: refusedLaunchStep(tag), status: ok ? 'PASS' : 'FAIL', detail: ok
    ? `refused before the handshake with ${expected}, naming ${names.length ? names.join(', ') : 'the cause'}; the target received nothing`
    : `initialize ${answered ? 'answered' : 'unanswered'}; exit ${exit?.code ?? 'timeout'}; stderr ${stderr.replace(/^cua: /, '').slice(0, 200)}; target calls ${delivered}`};
}
