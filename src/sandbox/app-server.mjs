// The compat executable's `app-server --listen stdio://` (docs/doperpowers/specs/2026-10-17-own-sandbox-design.md,
// Design "The compat executable"). The macOS native helper runs `$CODEX_CLI_PATH app-server` once per helper and asks
// for its policy: `initialize`, `configRequirements/read` and `config/read`, and nothing else (#115 M0's capture and
// replay). They are answered with what the signed Codex CLI answered under cua's CODEX_HOME, audited and recorded in
// ./app-server-responses.json, with ${CODEX_HOME} and ${CUA_HOME} (CODEX_HOME's grandparent, <home>/state/codex) filled
// from the environment.
//
// Newline-delimited JSON-RPC 2.0 on the input and output, one answer per request, in order. The helper's requests carry
// no `jsonrpc` member (M0's capture), so an answer carries one only when its request did. Notifications (no `id`) are
// ignored; any method not recorded gets -32601 with a sentence, a line that is not JSON -32700. Resolves on EOF.
import {readFileSync} from 'node:fs';
import {dirname, isAbsolute} from 'node:path';
import {createInterface} from 'node:readline';

export const RECORDED_RESPONSES = JSON.parse(readFileSync(new URL('./app-server-responses.json', import.meta.url), 'utf8')).responses;

// The recorded responses for `env`'s CODEX_HOME; throws when it is missing or relative.
export function recordedResponses(env) {
  const codexHome = env.CODEX_HOME;
  if (typeof codexHome !== 'string' || !isAbsolute(codexHome)) throw new Error('cua-codex-compat app-server: CODEX_HOME must be an absolute path (cua sets it for the vendor host), so the recorded answers cannot be rendered');
  const values = {CODEX_HOME: codexHome, CUA_HOME: dirname(dirname(codexHome))};
  const fill = node => (typeof node === 'string' ? node.replace(/\$\{(CODEX_HOME|CUA_HOME)\}/g, (_, name) => values[name])
    : Array.isArray(node) ? node.map(fill)
      : node && typeof node === 'object' ? Object.fromEntries(Object.entries(node).map(([key, value]) => [key, fill(value)])) : node);
  return fill(RECORDED_RESPONSES);
}

// The answer to one input line, or null for a notification.
function answer(line, responses) {
  let message;
  try { message = JSON.parse(line); } catch { return {id: null, error: {code: -32700, message: 'cua-codex-compat app-server: the line is not JSON'}}; }
  if (message === null || typeof message !== 'object' || message.id === undefined) return null;
  const envelope = {...(Object.hasOwn(message, 'jsonrpc') ? {jsonrpc: '2.0'} : {}), id: message.id};
  if (typeof message.method === 'string' && Object.hasOwn(responses, message.method)) return {...envelope, result: responses[message.method]};
  return {...envelope, error: {code: -32601, message: `cua-codex-compat app-server: ${JSON.stringify(message.method)} is not a method it answers; it answers only ${Object.keys(responses).join(', ')}`}};
}

export function serveAppServer({input, output, responses}) {
  return new Promise((resolve, reject) => {
    const lines = createInterface({input, crlfDelay: Infinity});
    lines.on('line', line => {
      if (!line.trim()) return;
      const reply = answer(line, responses);
      if (reply) output.write(`${JSON.stringify(reply)}\n`);
    });
    lines.on('close', resolve);
    input.on('error', reject);
  });
}
