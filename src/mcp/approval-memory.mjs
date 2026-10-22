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
// was asked". Nothing persists beyond the connection.
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

// One connection's memory: recall(params) -> the MCP result to answer a remembered app with, or null to ask the client;
// record(params, reply) takes the client's JSON-RPC reply ({result} or {error}) as it goes on to the runtime.
export function approvalMemory() {
  const answers = new Map();   // app -> 'accept' | 'decline'
  return {
    recall(params) {
      const action = answers.get(approvalKey(params));
      return action ? {action, content: {source: PERSISTED_STATE_SOURCE}} : null;
    },
    record(params, reply) {
      const app = approvalKey(params);
      const outcome = elicitationOutcome(reply);
      if (app === null || !outcome.ok) return;
      if (outcome.action === 'decline') answers.set(app, 'decline');
      else if (outcome.action === 'accept' && REMEMBERED_PERSIST.includes(outcome._meta?.persist)) answers.set(app, 'accept');
    },
  };
}
