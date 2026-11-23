// The connection's approval memory (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, "Policy and approvals";
// Interfaces, ApprovalMemory; Decision Log "M3.1, maws-3f's rulings" item 2). The vendor's Rust node_repl answered a
// repeat of a computer-use app approval (`connector_id: "computer-use"`, keyed by `tool_params.app`) from stored state
// rather than asking the client again, allowed and denied alike. cua answers it in its MCP connection
// (src/mcp/server.mjs), which every elicitation passes through and which lives exactly as long as the client's
// connection: the runtime under it may be replaced (the idle stop, issue #107) and the worker under that (a
// sandbox-policy change, a start timeout, its death), and an approval that vanished with either would ask again
// mid-session.
//
// Only an answer the runtime takes is an answer: the client's whole reply is checked with the rule cua's host applies to
// it (src/repl-host/elicitation.mjs elicitationOutcome: an error, even beside a result, fails; so does an unknown action,
// or content or _meta that is not an object), so nothing the asking request failed on is remembered. Of those, a decline
// is remembered; an accept only when it carries `_meta.persist` (`session`, or `always` from a client that sends its
// own, kept for the connection only), which the connection adds unless CUA_SHIM_PERSIST=none; a cancel asks again. A remembered answer carries
// `content.source: "computer-use-persisted-state"`, the vendor host's mark, which the vendor's policy reads as "no one
// was asked". Nothing persists beyond the connection. An accept the client sends with its own `_meta` and no `persist`
// stays unremembered and asks again on each bind: that is the client's contract (the design session, #216; MAWS's shim
// adds `persist` to every accepted app approval).
//
// Provenance (#216): the connection, not the client, says whether an approval was answered from this memory. A client's
// reply that carries the persisted-state mark in its content has it removed before the runtime sees it, and every
// computer-use answer the runtime gets, remembered or the client's, carries `_meta["cua/approval"]`: the connection's
// opaque id (a hash of its session id), the runtime generation it went to (an idle stop starts the next), the scope
// ("connection") and who answered ("memory" or "client"). Nothing else changes: which replies the runtime takes and
// which are remembered are decided before the stamp, and a reply whose content or `_meta` is malformed is passed on
// unchanged, so it still fails. Only cua's own REPL host gets the stamp (`stamped`): the vendor's node_repl, unmodified,
// gets every answer exactly as before #216 (a client's reply as sent, a remembered one as {action, content: {source}}),
// and the policy tells who answered there only where it can (src/services/engine/policy.mjs).
import {createHash} from 'node:crypto';
import {elicitationOutcome} from '../repl-host/elicitation.mjs';

export const COMPUTER_USE_CONNECTOR = 'computer-use';
export const PERSISTED_STATE_SOURCE = 'computer-use-persisted-state';
const REMEMBERED_PERSIST = ['session', 'always'];

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// The app an `elicitation/create` request's params ask approval for, when it is a computer-use app approval; else null.
export function approvalKey(params) {
  const meta = params?._meta;
  if (!isPlainObject(meta) || meta.connector_id !== COMPUTER_USE_CONNECTOR || !isPlainObject(meta.tool_params)) return null;
  const app = meta.tool_params.app;
  return typeof app === 'string' && app ? app : null;
}

export const APPROVAL_META = 'cua/approval';
// The connection's opaque id in `cua/approval`: not its session id, which the runtime's turn metadata carries.
export const approvalConnectionId = sessionId => createHash('sha256').update(`cua-approval:${sessionId}`).digest('hex').slice(0, 12);

// One connection's memory (`connection`: its approvalConnectionId; `stamped`: the runtime is cua's own host, whose
// answers carry the connection's provenance): recall(params, generation) -> the MCP result to
// answer a remembered app with, or null to ask the client; record(params, reply) takes the client's JSON-RPC reply
// ({result} or {error}) as it goes on to the runtime; fromClient(params, reply, generation) -> that reply as the runtime
// gets it, with the connection's provenance.
export function approvalMemory({connection = null, stamped = false} = {}) {
  const answers = new Map();   // app -> 'accept' | 'decline'
  const stamp = (generation, answeredBy) => ({connection, runtimeGeneration: generation, scope: 'connection', answeredBy});
  return {
    recall(params, generation = 0) {
      const action = answers.get(approvalKey(params));
      if (!action) return null;
      return {action, content: {source: PERSISTED_STATE_SOURCE}, ...(stamped ? {_meta: {[APPROVAL_META]: stamp(generation, 'memory')}} : {})};
    },
    record(params, reply) {
      const app = approvalKey(params);
      const outcome = elicitationOutcome(reply);
      if (app === null || !outcome.ok) return;
      if (outcome.action === 'decline') answers.set(app, 'decline');
      else if (outcome.action === 'accept' && REMEMBERED_PERSIST.includes(outcome._meta?.persist)) answers.set(app, 'accept');
    },
    fromClient(params, reply, generation = 0) {
      if (!stamped || approvalKey(params) === null || reply?.error !== undefined || !isPlainObject(reply?.result)) return reply;
      const result = {...reply.result};
      if (isPlainObject(result.content) && result.content.source === PERSISTED_STATE_SOURCE) {
        const {source, ...rest} = result.content;
        result.content = rest;
      }
      if (result._meta == null || isPlainObject(result._meta)) result._meta = {...(result._meta ?? {}), [APPROVAL_META]: stamp(generation, 'client')};
      return {...reply, result};
    },
  };
}
