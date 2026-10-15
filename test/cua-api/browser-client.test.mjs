// cua's browser client (src/cua-api/browser-client.mjs, BrowserClientRuntime) at its transport seam: every scenario of
// ./browser-client-scenarios.mjs runs against a service double and checks what crossed `nodeRepl.rpc` and what the
// cell got back. Plain JavaScript: no kernel, no browser, no service.
import {test} from 'node:test';
import {setupBrowserRuntime} from '../../src/cua-api/browser-client.mjs';
import {runScenario} from './browser-client-harness.mjs';
import {SCENARIOS} from './browser-client-scenarios.mjs';

for (const scenario of SCENARIOS) {
  test(scenario.name, async () => {
    scenario.check(await runScenario(setupBrowserRuntime, scenario));
  });
}
