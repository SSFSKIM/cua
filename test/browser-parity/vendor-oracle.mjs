// The parity harnesses' vendor oracle, test-only code: a production `cua serve` launch whose trusted browser service is
// the vendor's @oai/browser-desktop module from the pinned runtime (runtime.paths.browserVendorService) instead of cua's
// wrapper (src/services/browser.mjs). No production launch selects the vendor service since #79 removed it with the
// ChatGPT extension route; the browser-route benchmark and the parity lanes still compare cua's service against it.
//
// The harness keeps naming its two lanes CUA_BROWSER_SERVICE=vendor|cua, the name its committed evidence records
// (meta.environment), and its own serve entries read it (test/repl-parity/serve-production.mjs,
// test/browser-parity/serve-vendor-oracle.mjs); `cua serve` itself does not. The vendor service runs on the vendor REPL
// host only (its own node_repl's trusted worker), so the oracle refuses any other. It is registered directly, without
// cua's wrapper: the harness runs with secrets off and without MAWS backends, the two things the wrapper adds. The module
// lies inside the vendor module tree, which every launch already trusts; cua's own service directory, which the launch
// trusts with the browser surface, is taken out again so the oracle's trusted code is what the vendor route's was.
import {BROWSER_SERVICE, BROWSER_SERVICE_IMPL_DIR} from '../../src/runtime/launch.mjs';

export const ORACLE_SERVICES = ['vendor', 'cua'];

// `service` is the lane's CUA_BROWSER_SERVICE: `cua` leaves the production launch as it is.
export function oracleLaunch(launch, {runtime, service}) {
  if (!ORACLE_SERVICES.includes(service)) throw new Error('the parity lane\'s CUA_BROWSER_SERVICE must be vendor or cua');
  if (service === 'cua') return launch;
  if (launch.replHost?.host !== 'vendor') throw new Error('the vendor browser service runs only on the vendor REPL host: run its lane with CUA_REPL_HOST=vendor');
  const services = JSON.parse(launch.env.NODE_REPL_TRUSTED_SERVICES ?? 'null');
  if (services?.browser !== BROWSER_SERVICE) throw new Error('the oracle replaces the browser service of a launch with the browser surface');
  const paths = launch.env.NODE_REPL_TRUSTED_CODE_PATHS.split(':').filter(path => path !== BROWSER_SERVICE_IMPL_DIR);
  return {...launch, env: {...launch.env,
    NODE_REPL_TRUSTED_SERVICES: JSON.stringify({...services, browser: runtime.paths.browserVendorService}),
    NODE_REPL_TRUSTED_CODE_PATHS: paths.join(':')}};
}
