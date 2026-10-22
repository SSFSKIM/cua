// The route A/B's launch hook (scripts/native-baseline/spike-route.mjs): the only way CUA_ENGINE_SPIKE_ROUTE reaches
// the trusted worker, from the harness serve's own environment, for a launch of cua's engine.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withSpikeRoute} from '../../scripts/native-baseline/spike-route.mjs';

const cuaLaunch = () => ({command: '/n', args: [], env: {HOME: '/u', CUA_ENGINE_APP: '/A/cua Engine.app'}});
const vendorLaunch = () => ({command: '/n', args: [], env: {HOME: '/u', SKY_CUA_SERVICE_PATH: '/S.app'}});

test('the hook adds CUA_ENGINE_SPIKE_ROUTE=1 to a launch of cua\'s engine only when the serve\'s environment sets it to 1', () => {
  const launch = cuaLaunch();
  const forced = withSpikeRoute(launch, {CUA_ENGINE_SPIKE_ROUTE: '1'});
  assert.deepEqual(forced.env, {...launch.env, CUA_ENGINE_SPIKE_ROUTE: '1'});
  assert.deepEqual(launch, cuaLaunch(), 'the given record is not changed');
  for (const value of [undefined, '0', 'true', ' 1']) {
    const env = value === undefined ? {} : {CUA_ENGINE_SPIKE_ROUTE: value};
    assert.equal(withSpikeRoute(cuaLaunch(), env).env.CUA_ENGINE_SPIKE_ROUTE, undefined, String(value));
  }
  assert.equal(withSpikeRoute(vendorLaunch(), {CUA_ENGINE_SPIKE_ROUTE: '1'}).env.CUA_ENGINE_SPIKE_ROUTE, undefined, 'never for the vendor engine');
});
