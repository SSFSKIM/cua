// Ported from readable chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/create_documentation.js:3-50
// and read_documentation.js:4-17 (how the facade reads its first-call documents and composes the core with one
// confirmations policy), for docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (M3, CoreDocumentation).
// #120's clean-room rewrite replaces this port before distribution.
//
// The documents are docs/cua-api/ (its PROVENANCE.md names their vendor sources and edits), read as they are. The core
// is core.md followed by one policy: the request's valid `openai/confirmation_policies`.computer_use override (a
// nonblank string of at most 12,000 UTF-8 bytes), otherwise the bundled confirmations.md. Dropped, per the surface
// inventory's Tables 2 and 3: the TINYSKY_ALT_INITIALIZE_DOCS selection of the dormant core-node-repl document (the core
// here is always core-cua-repl's, so browser confirmations are always excluded as a duplicate) and the training/Orbit
// CUA_REPL_BROWSER_ENV branch that suppressed the policy. The protocol key `openai/confirmation_policies` is the
// client's, not a product name, and stays.
// One addition of cua's own, not the vendor's (the surface inventory's Table 3 addition of 2026-10-30, #235): with
// `agentCursor()` true, agent-cursor.md (what the person sees while the agent acts: cua's agent cursor; and, since #282,
// the engine's refusal of a background click into a Chromium or, since #315, Firefox web page and its
// `clickUnconfirmed`) follows the core,
// before the policy. The facade answers it from the computer surface's target: on macOS this host serves only cua's
// own engine (src/runtime/launch.mjs refuses cua's host with the vendor engine, whose helper takes only the vendor
// host as a peer), so a macOS computer surface here is always one cua's agent cursor draws for.
// And its Linux counterpart (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, Decision Log, M5
// pre-flight, F4): with `linuxEngine()` true, linux-engine.md (the device mode and its refusal, `minimized: true` in
// listWindows(), the answers that say nothing was sent or that a paste or a context menu could not be confirmed, a
// pending drag, duplicate windows, the truncation line) takes the same place. The facade answers it from the computer
// surface's target: every Linux computer surface, under either engine, since each paragraph names an answer and what
// to do on meeting it, and the vendor's engine gives none of them. core.md stays the vendor's text.
// #503 gives agent-cursor.md #494's treatment: an MCP client shows the first cell inline only under its limit (Claude
// Code saves a result of more than 50,000 characters to a file), and the first getBrowser() cell carries this core with
// the browser's first-use document. agent-cursor.md keeps the cursor paragraph and the rules a first action acts on,
// then one pointer per lookup (AGENT_CURSOR_LOOKUPS, docs/cua-api/macos/), each stating its rule. The lookups are
// read through `agent.documentation.get(name)`, answered here (serve_lookups) ahead of the browser service, so they
// exist exactly where the pointers do: with `lookups()` true, which the facade answers from the browser surface (its
// `agent`). Without it the core carries the cursor paragraph (agent-cursor.md's first) and every lookup's text in
// their place, the document as it read before #503.
import {readFile} from 'node:fs/promises';

const DOCUMENTS = new URL('../../docs/cua-api/', import.meta.url);
// The agent cursor's lookups, in the order the document without them reads their text.
export const AGENT_CURSOR_LOOKUPS = ['macos/background-web-pages', 'macos/click-checks', 'macos/action-answers', 'macos/accessibility-tree', 'macos/typing'];
// The vendor's document names (tinysky-alt-<name>.md) and the files that hold them here, and cua's own.
const FILES = {'core-cua-repl': 'core.md', confirmations: 'confirmations.md', 'other-browser-apis': 'other-browser-apis.md', 'agent-cursor': 'agent-cursor.md',
  'linux-engine': 'linux-engine.md', ...Object.fromEntries(AGENT_CURSOR_LOOKUPS.map(name => [name, `${name}.md`]))};
const POLICY_MAX_BYTES = 12_000;

export function read_documentation(name) {
  return readFile(new URL(FILES[name], DOCUMENTS), 'utf8');
}

// The request metadata's confirmations-policy override for Computer Use, or undefined.
function confirmationPolicyOverride(requestMeta) {
  const policies = requestMeta == null ? undefined : requestMeta['openai/confirmation_policies'];
  const valid = typeof policies != 'object' || policies === null || Array.isArray(policies) ? undefined : policies;
  const policy = valid == null ? undefined : valid.computer_use;
  if (typeof policy == 'string' && policy.trim() !== '' && new TextEncoder().encode(policy).byteLength <= POLICY_MAX_BYTES) return policy;
  return undefined;
}

export function create_documentation(read, {agentCursor = () => false, linuxEngine = () => false, lookups = () => false} = {}) {
  async function agentCursorDocument() {
    const document = await read('agent-cursor');
    if (lookups()) return document;
    const sections = await Promise.all(AGENT_CURSOR_LOOKUPS.map(name => read(name)));
    return [document.slice(0, document.indexOf('\n\n') + 1), ...sections].join('\n');
  }
  return {
    read,
    async read_core() {
      const base = await read('core-cua-repl');
      const platform = agentCursor() ? await agentCursorDocument() : linuxEngine() ? await read('linux-engine') : null;
      const core = platform ? `${base}\n${platform}` : base;
      const policy = confirmationPolicyOverride(globalThis.nodeRepl?.requestMeta) ?? await read('confirmations');
      return policy === '' ? core : `${core}\n${policy}`;
    },
    // -> the text of a lookup the core points to, or undefined for every other name.
    async lookup(name) {
      return agentCursor() && lookups() && AGENT_CURSOR_LOOKUPS.includes(name) ? await read(name) : undefined;
    },
    exclude_browser_confirmations: true,
  };
}

// `agent.documentation.get(name)` answers the core's lookups itself and passes every other name to the browser
// service. The client's agent is a view that caches its methods by name, so its documentation object is replaced, by
// one that, as the client's, has no own enumerable member.
export function serve_lookups(agent, documentation) {
  agent.documentation = new LookupDocumentation(documentation, agent.documentation);
}

class LookupDocumentation {
  #documentation;
  #service;
  constructor(documentation, service) {
    this.#documentation = documentation;
    this.#service = service;
  }
  async get(name) {
    return (await this.#documentation.lookup(name)) ?? await this.#service.get(name);
  }
}
