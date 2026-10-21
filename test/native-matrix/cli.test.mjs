// The native matrix's command line (scripts/native-matrix.mjs parseCommand): a lane's options, among them the run number a
// hold split by run starts from and the hold id every lane of one hold names.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCommand, USAGE} from '../../scripts/native-matrix.mjs';

const LANE = ['--device', 'mini', '--host', 'cua', '--engine', 'cua', '--approved-runtime', '/h', '--approved-engine', '/e', '--sitting', 'hold-2b', '--out', '/tmp/o'];

test('run --run-number n runs exactly run n unless --runs says more; the hold id is --sitting', () => {
  const third = parseCommand(['run', ...LANE, '--run-number', '3']);
  assert.deepEqual([third.runNumber, third.runs, third.sitting], [3, undefined, 'hold-2b']);
  assert.equal(parseCommand(['run', ...LANE]).runNumber, undefined);
  assert.equal(parseCommand(['cell', 'korean', ...LANE, '--run-number', '2', '--runs', '2']).runNumber, 2);
  assert.throws(() => parseCommand(['run', ...LANE, '--run-number', '0']), /--run-number needs a positive integer/);
  assert.match(USAGE, /--run-number n/);
  assert.match(USAGE, /--sitting <hold id>/);
});
