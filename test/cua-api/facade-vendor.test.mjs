// The vendor differential for the cua facade: every scenario of ./facade-scenarios.mjs runs against the port
// (src/cua-api) and against the vendor's readable facade (chatgpt-26.928.40906 @oai/cua tinysky_alt, get_state,
// get_apps and Sky's Linux accessibility tree) through the same doubles. The records must be equal, except where a
// scenario declares a deliberate difference (the surface inventory's Table 2 row), whose records must differ. The
// readable tree is outside the repository, so this runs only when CUA_VENDOR_CUA names its cua_node/@oai/cua directory
// (e.g. ~/codex-app-src/readable/chatgpt-26.928.40906/cua_node/@oai/cua) and skips visibly otherwise.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownFacade, runScenario, vendorFacade} from './facade-harness.mjs';
import {scenarios} from './facade-scenarios.mjs';

const root = process.env.CUA_VENDOR_CUA;
const skip = root ? false : 'set CUA_VENDOR_CUA to the readable @oai/cua directory to compare with the vendor facade';
const [own, vendor] = root ? await Promise.all([ownFacade(), vendorFacade(root)]) : [];
for (const scenario of scenarios) {
  test(`vendor differential: ${scenario.name}`, {skip}, async () => {
    const mine = await runScenario(own, scenario);
    const theirs = await runScenario(vendor, scenario);
    if (scenario.differs) assert.notDeepEqual(mine, theirs, `declared difference (${scenario.differs}) did not appear`);
    else assert.deepEqual(mine, theirs);
  });
}
