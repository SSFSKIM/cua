// The --fixtures layer end to end: the real anchor, test page, session, cells and policy against the fake runtime.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runFixturesLayer} from '../fixtures-layer.mjs';
import {reportLeaks} from '../classify.mjs';

test('every M10 fixture case passes and the whole fixture report is leak-free', async () => {
  const layer = await runFixturesLayer();
  for (const s of layer.scenarios) assert.equal(s.status, 'PASS', `${s.id}: ${JSON.stringify(s.detail)}`);
  assert.equal(layer.chromeAttached, false);
  const {forbidden, ...report} = layer;
  assert.deepEqual(reportLeaks(JSON.stringify(report), forbidden), []);
});
