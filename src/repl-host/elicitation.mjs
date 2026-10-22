// The supervisor's half of the trusted worker's `nodeRepl.createElicitation` (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md,
// Design "Trusted services and privileged APIs"; the worker's half, which checks the request's own shape, is
// NR:privileged-node-repl.js:65-129, ported in ./privileged-node-repl.mjs). The worker sends `elicit {id, exec_id,
// message, requested_schema, meta}`; the supervisor checks the schema, asks the MCP client with `elicitation/create`
// (through cua's proxy, which adds its accepted-response persistence) and answers the worker `elicitation_result {id,
// ok, action, content, _meta}` or `{id, ok: false, error}`. Nothing is granted on a path that is not the client's own
// accept: a client without form elicitation, an invalid schema, an error reply and a malformed reply all fail. The
// request names form mode, as the vendor host's does (its computer-use and browser approvals reach the client with
// `mode: "form"`, which the acceptance harness's matcher pins: scripts/accept/lib.mjs isTextEditApproval).
// Sentences the vendor's supervisor uses are recovered ones (docs/doperpowers/research/2026-10-14-own-repl-host/node-repl-embedded-INDEX.md
// "Gaps" 7); the schema details after them are cua's.
//
// The approval memory is not here: cua's MCP connection keeps it (src/mcp/approval-memory.mjs), since it outlives this
// host's runtime (the idle stop) as well as its workers.
export const FORM_UNSUPPORTED_SENTENCE = 'nodeRepl.createElicitation is unavailable because the MCP client does not support form elicitation';
export const INVALID_SCHEMA_PREFIX = 'nodeRepl.createElicitation requested_schema is invalid: ';
export const UNEXPECTED_RESPONSE_SENTENCE = 'MCP elicitation request returned an unexpected response';
export const ELICITATION_CANCELLED_SENTENCE = 'MCP elicitation request was cancelled because the client closed the connection';
const ACTIONS = ['accept', 'decline', 'cancel'];
const PRIMITIVE_TYPES = ['string', 'number', 'integer', 'boolean'];

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Whether the client's initialize `capabilities` include form elicitation: `elicitation: {}` (the 2025-06-18 shape,
// form implied) or one naming `form` (2025-11-25), but not one offering only `url`.
export function formElicitationSupported(capabilities) {
  const elicitation = capabilities?.elicitation;
  return isPlainObject(elicitation) && (Object.hasOwn(elicitation, 'form') || !Object.hasOwn(elicitation, 'url'));
}

// The reason `schema` is not an elicitation form schema (an object schema whose properties are primitive-typed
// schemas, with an optional array of required names), or null.
export function schemaProblem(schema) {
  if (!isPlainObject(schema)) return 'expected an object schema';
  if (schema.type !== 'object') return 'expected type "object"';
  if (!isPlainObject(schema.properties)) return 'expected properties to be an object';
  for (const [name, property] of Object.entries(schema.properties)) {
    if (!isPlainObject(property) || !PRIMITIVE_TYPES.includes(property.type)) return `property ${JSON.stringify(name)} must be a string, number, integer or boolean schema`;
  }
  if (schema.required !== undefined && (!Array.isArray(schema.required) || !schema.required.every(name => typeof name === 'string')))
    return 'expected required to be an array of property names';
  return null;
}

// An `elicit` message -> {params} for the MCP `elicitation/create` request, or {error} to answer the worker with.
export function elicitationParams(message, {formSupported}) {
  if (!formSupported) return {error: FORM_UNSUPPORTED_SENTENCE};
  if (typeof message.message !== 'string' || !message.message.trim()) return {error: 'nodeRepl.createElicitation expected a non-empty message'};
  const problem = schemaProblem(message.requested_schema);
  if (problem) return {error: `${INVALID_SCHEMA_PREFIX}${problem}`};
  return {params: {message: message.message, requestedSchema: message.requested_schema, mode: 'form', ...(isPlainObject(message.meta) ? {_meta: message.meta} : {})}};
}

// The client's JSON-RPC reply to `elicitation/create` -> the worker's answer fields ({ok: true, action, content,
// _meta} or {ok: false, error}).
export function elicitationOutcome(reply) {
  if (reply?.error !== undefined) {
    const message = typeof reply.error?.message === 'string' && reply.error.message ? reply.error.message : UNEXPECTED_RESPONSE_SENTENCE;
    return {ok: false, error: message};
  }
  const result = reply?.result;
  if (!isPlainObject(result) || !ACTIONS.includes(result.action)) return {ok: false, error: UNEXPECTED_RESPONSE_SENTENCE};
  if (result.content != null && !isPlainObject(result.content)) return {ok: false, error: UNEXPECTED_RESPONSE_SENTENCE};
  if (result._meta != null && !isPlainObject(result._meta)) return {ok: false, error: UNEXPECTED_RESPONSE_SENTENCE};
  return {ok: true, action: result.action, content: result.content ?? null, _meta: result._meta ?? null};
}
