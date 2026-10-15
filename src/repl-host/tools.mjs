// The MCP contract cua's own REPL host answers with (interface HostMcp of docs/doperpowers/specs/2026-10-14-own-repl-host-design.md):
// the initialize result, the base tools js, js_reset and turn_ended, and their argument checks with the vendor's
// error sentences. The tool definitions and the server instructions are the vendor's compiled base values, recovered in
// docs/doperpowers/research/2026-10-14-own-repl-host/node-repl-embedded-INDEX.md ("Compiled MCP tool definitions") and
// confirmed byte for byte against the pinned node_repl's live tools/list (M0's no-services lane records the effective
// contract cua's proxy shows, docs/evidence/2026-10-14-own-repl-host-parity/m0/vendor-1/tools.json). The own host
// leaves out the vendor's hidden js_add_node_module_dir tool (not a cua surface; cua's proxy refuses it either way)
// but keeps every sentence of the base text, which cua's proxy layers its own rules above (src/mcp/surface.mjs).
// Argument errors are JSON-RPC invalid-params errors worded as the vendor's serde deserializer words them (observed on
// the pinned runtime, 2026-10-14); an unknown tool is a tool result, as the vendor's is.
import {REPL_HOST_NAME, REPL_HOST_VERSION} from './identity.mjs';

// The protocol versions the vendor's rmcp 1.5.0 knows: a client asking for one of them gets it, any other gets the latest.
export const PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'];
export const SANDBOX_CAPABILITY = 'codex/sandbox-state-meta';
export const SERVER_INSTRUCTIONS = 'Use `js` for `node_repl` execution with persistent, redeclarable top-level bindings, `js_reset` to clear bindings, and `js_add_node_module_dir` to add package directories.';
export const DEFAULT_TIMEOUT_MS = 30_000;

const JS_DESCRIPTION = 'Execute JavaScript in a persistent `node_repl` with top-level await. Top-level bindings persist until `js_reset` and can be redeclared. Use `const` for stable values and `let` for changing values. Use dynamic imports such as `await import("playwright")`; top-level static imports and `node:process` are unavailable. Use `nodeRepl.write(value)` for output and `await nodeRepl.emitImage(image)` for images. Execution context is available through `nodeRepl.cwd`, `nodeRepl.homeDir`, `nodeRepl.tmpDir`, and `nodeRepl.requestMeta`. The default timeout is 30000 ms (30 seconds); increase `timeout_ms` for longer operations. Use `js_add_node_module_dir` when an additional package directory is required.';
const SANDBOXED_ANNOTATIONS = {readOnlyHint: true, destructiveHint: false, openWorldHint: false};

// The tools in the vendor's order. `js` carries its annotations only when the host can sandbox (the vendor's
// Option<SandboxConfig>); js_reset's are unconditional.
export function toolsFor({sandboxed}) {
  return [
    {
      name: 'js',
      description: JS_DESCRIPTION,
      inputSchema: {
        additionalProperties: false,
        properties: {
          code: {description: 'JavaScript code to execute with top-level await.', type: 'string'},
          timeout_ms: {description: 'Optional execution timeout in milliseconds. Defaults to 30000 (30 seconds) when omitted.', minimum: 1, type: 'integer'},
          title: {description: 'Short user-facing description of what the code does.', maxLength: 80, minLength: 1, type: 'string'},
        },
        required: ['code'],
        type: 'object',
      },
      ...(sandboxed ? {annotations: {...SANDBOXED_ANNOTATIONS}} : {}),
    },
    {
      name: 'js_reset',
      description: 'Reset the JavaScript kernel and clear all bindings.',
      inputSchema: {additionalProperties: false, properties: {}, type: 'object'},
      annotations: {...SANDBOXED_ANNOTATIONS},
    },
    {
      name: 'turn_ended',
      description: 'Notify trusted libraries that a Codex turn ended. Repeated notifications for the same session and turn are ignored.',
      inputSchema: {
        additionalProperties: false,
        properties: {hook_event_name: {minLength: 1, type: 'string'}, session_id: {minLength: 1, type: 'string'}, turn_id: {minLength: 1, type: 'string'}},
        required: ['hook_event_name', 'session_id', 'turn_id'],
        type: 'object',
      },
      annotations: {idempotentHint: true},
      _meta: {ui: {visibility: []}},
    },
  ];
}

export function initializeResult({protocolVersion, sandboxed}) {
  return {
    protocolVersion: PROTOCOL_VERSIONS.includes(protocolVersion) ? protocolVersion : PROTOCOL_VERSIONS.at(-1),
    capabilities: {...(sandboxed ? {experimental: {[SANDBOX_CAPABILITY]: {}}} : {}), tools: {listChanged: true}},
    serverInfo: {name: REPL_HOST_NAME, version: REPL_HOST_VERSION},
    instructions: SERVER_INSTRUCTIONS,
  };
}

// An invalid-params error, thrown by the argument checks below.
export class InvalidParams extends Error {}

// A JSON value as serde names it in "invalid type" errors.
export function serdeUnexpected(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return `string ${JSON.stringify(value)}`;
  if (typeof value === 'boolean') return `boolean \`${value}\``;
  if (typeof value === 'number') return Number.isInteger(value) ? `integer \`${value}\`` : `floating point \`${value}\``;
  return Array.isArray(value) ? 'sequence' : 'map';
}

const expectString = (tool, value) => {
  if (typeof value !== 'string') throw new InvalidParams(`${tool}: invalid type: ${serdeUnexpected(value)}, expected a string`);
  return value;
};
const optionalString = (tool, value) => (value === null ? undefined : expectString(tool, value));
function optionalNonzeroU64(tool, value) {
  if (value === null) return undefined;
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value < 1) throw new InvalidParams(`${tool}: invalid value: integer \`${value}\`, expected a nonzero u64`);
    return value;
  }
  throw new InvalidParams(`${tool}: invalid type: ${serdeUnexpected(value)}, expected a nonzero u64`);
}

// serde's struct deserialization: fields visited in the order the client sent them, an unknown one refused naming the
// struct's fields in declaration order, then the first missing required field in that order.
function fields(tool, args, declared) {
  const names = Object.keys(declared);
  if (args === undefined || args === null) args = {};
  if (typeof args !== 'object' || Array.isArray(args)) throw new InvalidParams(`${tool}: invalid type: ${serdeUnexpected(args)}, expected a map`);
  const out = {};
  for (const [key, value] of Object.entries(args)) {
    if (!Object.hasOwn(declared, key)) {
      const expected = names.length ? `expected one of ${names.map(n => `\`${n}\``).join(', ')}` : 'there are no fields';
      throw new InvalidParams(`${tool}: unknown field \`${key}\`, ${expected}`);
    }
    out[key] = declared[key].parse(tool, value);
  }
  for (const name of names) if (declared[name].required && out[name] === undefined) throw new InvalidParams(`${tool}: missing field \`${name}\``);
  return out;
}

// -> {code, timeoutMs, title?}. The schema's title length limits are advertised, not enforced, as by the vendor; an
// empty title is refused after the struct is read.
export function jsArguments(args) {
  const out = fields('js', args, {
    title: {parse: optionalString},
    code: {parse: expectString, required: true},
    timeout_ms: {parse: optionalNonzeroU64},
  });
  if (out.title === '') throw new InvalidParams('js: title must be non-empty');
  return {code: out.code, timeoutMs: out.timeout_ms ?? DEFAULT_TIMEOUT_MS, ...(out.title !== undefined ? {title: out.title} : {})};
}

export function resetArguments(args) {
  fields('js_reset', args, {});
}

// -> {hookEventName, sessionId, turnId}.
export function turnEndedArguments(args) {
  const out = fields('turn_ended', args, {
    hook_event_name: {parse: expectString, required: true},
    session_id: {parse: expectString, required: true},
    turn_id: {parse: expectString, required: true},
  });
  if (!out.hook_event_name || !out.session_id || !out.turn_id) throw new InvalidParams('turn_ended requires non-empty event, session, and turn IDs');
  return {hookEventName: out.hook_event_name, sessionId: out.session_id, turnId: out.turn_id};
}
