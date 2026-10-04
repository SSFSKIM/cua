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

// One cell's outcome: ok, or the class and sanitized text of the vendor's error.
export function cellOutcome(cell) {
  const raw = cell.probeError ?? cell.result?.error ?? (cell.result ? null : cell.unmarked ?? 'no result marker');
  if (raw == null && !cell.isError) return {class: 'ok'};
  const text = String(raw ?? 'isError without message');
  return {class: cell.probeError ? (/timed out/.test(text) ? 'transport' : classifyError(text)) : classifyError(text), text: sanitizeVendorText(text)};
}

// Last line of defence before a live or fixture report is written: findings name the kind of leak, never the value.
// Clean reports carry counts, booleans, shapes, sanitized vendor text and hex digests only.
export function reportLeaks(text, forbidden = []) {
  const findings = [];
  forbidden.forEach((value, i) => { if (value && text.includes(value)) findings.push(`forbidden value #${i}`); });
  if (/\b[a-z][a-z0-9+.-]*:\/\//i.test(text)) findings.push('a URL');
  if (/(?:^|[\s"'(=])(?:~|\/(?:Users|private|tmp|var|Volumes|Applications|Library))\//.test(text)) findings.push('an absolute path');
  for (const run of text.match(/[A-Za-z0-9_-]{40,}/g) ?? []) if (!/^[0-9a-f]+$/.test(run) && /[0-9]/.test(run) && /[A-Za-z]/.test(run)) { findings.push('a token-like run'); break; }
  return findings;
}
