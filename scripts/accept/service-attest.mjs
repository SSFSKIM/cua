// Which browser service answered a live run (docs/doperpowers/specs/2026-10-13-own-browser-service-design.md, M4): the
// selected browser's documentation has the "# Selected Browser" header on both services, and cua's adds the marker
// `cua browser service <version>` (the parity harness's attestation, scripts/browser-parity/runner.mjs). The requested
// service is the wrapper's own reading of CUA_BROWSER_SERVICE, so an unset variable means whatever the default is.
import {serviceSelection} from '../../src/services/browser.mjs';

const MARKER = /cua browser service [0-9]+\.[0-9]+\.[0-9]+/;

// A js cell that writes the documentation of the browser it selects: the named extension instance, else the default.
export const DOCUMENTATION_CELL = instanceId => `const attested = await cua.getBrowser(${instanceId === undefined ? '' : JSON.stringify({extensionInstanceId: instanceId})});
  nodeRepl.write(await attested.documentation());`;

export function serviceAttestation(text, env = process.env) {
  const requested = serviceSelection(env).name;
  const header = text.split('\n').some(line => /^# Selected Browser\b/.test(line));
  const marker = header ? text.match(MARKER)?.[0] ?? null : null;
  return {ok: header && (requested === 'cua') === Boolean(marker), detail: {requested, served: header ? marker ?? 'vendor' : null}};
}
