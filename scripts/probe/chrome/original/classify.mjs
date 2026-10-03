// M9 outcome classes for vendor error text. The probe records a sanitized form of the vendor's message (no URLs,
// paths, UUIDs, emails or token-like runs) and its class; never tab data, profile names or auth material.
export const OUTCOMES = ['ok', 'identity-or-auth', 'policy', 'transport', 'other'];

const RULES = [
  // Identity first: the vendor's own null-identity error mentions "policy" but is an identity requirement.
  ['identity-or-auth', /caller identity|identity|user unavailable|auth(?:entication|orization)?\b.*(?:token|unavailable|required|failed)|codex auth|log ?in|sign(?:ed)? ?in|unauthori[sz]ed|\b401\b/i],
  ['policy', /polic(?:y|ies)|not allowed|blocked|requires agent request headers|security|permission|denied|declined|disabled/i],
  ['transport', /timed? ?out|ECONN|EPIPE|ENOENT|socket|pipe|connect|closed|transport|disconnect|no handler/i],
];

export function classifyError(text) {
  const s = String(text ?? '');
  for (const [cls, re] of RULES) if (re.test(s)) return cls;
  return 'other';
}

export function sanitizeVendorText(text, max = 300) {
  return String(text ?? '')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<url>')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/(?:~|\/)[^\s'"`,;)]*\/[^\s'"`,;)]*/g, '<path>')
    .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi, host => /\.(?:json|toml|mjs|js|sock)$/i.test(host) ? host : '<host>')
    .replace(/\b[A-Za-z0-9_\-]{32,}\b/g, '<token>')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}
