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
import {readFile} from 'node:fs/promises';

const DOCUMENTS = new URL('../../docs/cua-api/', import.meta.url);
// The vendor's document names (tinysky-alt-<name>.md) and the files that hold them here.
const FILES = {'core-cua-repl': 'core.md', confirmations: 'confirmations.md', 'other-browser-apis': 'other-browser-apis.md'};
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

export function create_documentation(read) {
  return {
    read,
    async read_core() {
      const core = await read('core-cua-repl');
      const policy = confirmationPolicyOverride(globalThis.nodeRepl?.requestMeta) ?? await read('confirmations');
      return policy === '' ? core : `${core}\n${policy}`;
    },
    exclude_browser_confirmations: true,
  };
}
