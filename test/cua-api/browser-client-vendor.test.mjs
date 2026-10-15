// cua's browser client against the vendor's (readable chatgpt-26.928.40906
// R/cua_node/@oai/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js, named by
// CUA_VENDOR_BROWSER_CLIENT): every scenario of ./browser-client-scenarios.mjs runs against both through the same
// service double, and the records (requests as sent, displayed values, images, decorated tabs, the cell's result or
// error) must be equal, except in a scenario that names its deliberate difference, where they must differ. This is the
// local proof that the port, its renaming and the vendored Zod behave as the vendor's bundle does; it is not live
// evidence (the M3 oracle is). The vendor's source is outside the repository, so without it the test skips visibly.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {setupBrowserRuntime} from '../../src/cua-api/browser-client.mjs';
import {runScenario} from './browser-client-harness.mjs';
import {SCENARIOS} from './browser-client-scenarios.mjs';

const VENDOR = process.env.CUA_VENDOR_BROWSER_CLIENT;
const skip = VENDOR && existsSync(VENDOR) ? false : 'set CUA_VENDOR_BROWSER_CLIENT to the vendor\'s readable browser-client.js to compare';

for (const scenario of SCENARIOS) {
  test(`same as the vendor's client: ${scenario.name}`, {skip}, async () => {
    const vendor = await import(pathToFileURL(VENDOR).href);
    const ours = await runScenario(setupBrowserRuntime, scenario);
    const theirs = await runScenario(vendor.setupBrowserRuntime, scenario);
    if (scenario.vendorDiffers) assert.notDeepEqual(ours, theirs, scenario.vendorDiffers);
    else assert.deepEqual(ours, theirs);
  });
}
