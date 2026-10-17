// Which browser service answered a live run (docs/doperpowers/specs/2026-10-13-own-browser-service-design.md, M4): the
// selected browser's documentation has the "# Selected Browser" header on both services, and cua's adds the marker
// `cua browser service <version>` (the parity harness's attestation, scripts/browser-parity/runner.mjs). The requested
// service is always cua's: since #79 every launch with the browser surface runs it, whatever the home or the
// environment, so documentation without the marker (the vendor service's) fails the attestation.
const MARKER = /cua browser service [0-9]+\.[0-9]+\.[0-9]+/;

// A js cell that writes the documentation of the browser it selects: the named extension instance, else the default.
export const DOCUMENTATION_CELL = instanceId => `const attested = await cua.getBrowser(${instanceId === undefined ? '' : JSON.stringify({extensionInstanceId: instanceId})});
  nodeRepl.write(await attested.documentation());`;

export function serviceAttestation(text) {
  const header = text.split('\n').some(line => /^# Selected Browser\b/.test(line));
  const marker = header ? text.match(MARKER)?.[0] ?? null : null;
  return {ok: Boolean(marker), detail: {requested: 'cua', served: header ? marker ?? 'vendor' : null}};
}
