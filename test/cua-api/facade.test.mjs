// The cua facade's modules (src/cua-api) at their seams, scenario by scenario (./facade-scenarios.mjs): the decorated
// Tab, the macOS and Linux App binders, the Linux accessibility tree, inventory settlement, the bootstrap emitter's
// named output and rewrite suppression, the confirmations-policy composition and the browser facade's selection,
// tab creation and binding. Doubles only; the vendor differential is ./facade-vendor.test.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownFacade, runScenario} from './facade-harness.mjs';
import {scenarios} from './facade-scenarios.mjs';

const facade = await ownFacade();
for (const scenario of scenarios) {
  test(scenario.name, async () => {
    const record = await runScenario(facade, scenario);
    assert.equal(record.error, undefined, `scenario failed: ${JSON.stringify(record.error)}`);
    scenario.check(record, assert);
  });
}
