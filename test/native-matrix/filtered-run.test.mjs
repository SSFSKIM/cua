// Ruling 1228 (E): a filtered rerun of the full matrix. A run job may take a list of cells (ids, or whole sections) and
// run only the units that hold them (a frontmost target's sequence, a background pairing, a Unicode field, a probe):
// every listed cell runs after what ran before it in the full run's unit, so none depends on a row that no longer runs
// before it; the unit's other rows run and are not recorded. The result is a 'filtered' run, which never counts on its
// own: the judge combines it with the full run's records of the same run number (./combine.mjs).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {manifestOf} from '../../scripts/native-matrix/manifest.mjs';
import {filteredPlan} from '../../scripts/native-matrix/run.mjs';
import {parseCommand} from '../../scripts/native-matrix.mjs';
import {runWith} from './run-doubles.mjs';

const NAME = 'savePanel/frontmost/typeText.name', POINT = 'electron/frontmost/click.point';

test('a filtered plan runs the units holding its cells, and its manifest is exactly those cells', () => {
  const plan = filteredPlan([NAME, POINT]);
  assert.equal(plan.id, 'filtered');
  assert.deepEqual([...plan.frontmost].sort(), ['electron', 'savePanel']);
  assert.deepEqual([plan.background, plan.concurrent, plan.sheet, plan.intervention, plan.unicode, plan.launch, plan.speed, plan.finding], [[], [], false, [], null, [], false, false]);
  assert.deepEqual(manifestOf({run: 2, samples: 1}, plan).map(r => `${r.section} ${r.id}`).sort(), [`method ${POINT}`, `method ${NAME}`].sort());
  // A section by name: every one of its cells; a background row: its pairing alone.
  const probes = filteredPlan(['intervention', 'chrome/background/drag.select@textedit']);
  assert.deepEqual([probes.intervention, probes.background.map(p => `${p.driven}@${p.user}`), probes.frontmost], [['fires', 'preAction'], ['chrome@textedit'], []]);
  // A Unicode row: its field.
  const korean = filteredPlan(['textedit/latin/typeText.latin']);
  assert.deepEqual(korean.unicode.fields, ['textedit']);
});

test('a filter names judged cells of the matrix only: not speed, not finding, nothing unknown', () => {
  assert.throws(() => filteredPlan(['textedit/getAXState']), /no judged cell of the matrix outside speed and finding/);
  assert.throws(() => filteredPlan(['speed']), /no judged cell/);
  assert.throws(() => filteredPlan(['nothing/here']), /no judged cell/);
  assert.throws(() => filteredPlan([]), /names no cell/);
});

test('a filtered run records only its cells, its filter on the meta, as a filtered plan', async () => {
  const {result} = await runWith({plan: filteredPlan([NAME, POINT])});
  assert.deepEqual(result.rows.map(r => `${r.section} ${r.id}`).sort(), [`method ${POINT}`, `method ${NAME}`].sort());
  assert.deepEqual([result.meta.planId, [...result.meta.filter].sort()], ['filtered', [`method ${POINT}`, `method ${NAME}`].sort()]);
});

test('the run command takes --only, a comma list of cells or sections', () => {
  const options = parseCommand(['run', '--device', 'd', '--host', 'cua', '--engine', 'cua', '--approved-runtime', '/H', '--approved-engine', '/E', '--sitting', 's', '--out', '/o', '--only', `${NAME},${POINT}`]);
  assert.deepEqual(options.only, [NAME, POINT]);
  assert.equal(parseCommand(['run', '--device', 'd', '--host', 'cua', '--engine', 'cua', '--approved-runtime', '/H', '--approved-engine', '/E', '--sitting', 's', '--out', '/o']).only, undefined);
});
