// The route A/B cell (scripts/native-matrix/route-ab.mjs, `cell route-ab`): the Electron fixture's button pressed
// behind the user window, alternating route 1 forced through the engine's spike-only argument with the engine's own
// choice, each forced sample after a natural one preceded by a release of the natural sample's hold, verified from the
// fixture's counters. Run against the lane's doubles (./run-doubles.mjs).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {listCells, resolveCell} from '../../scripts/native-matrix/registry.mjs';
import {effectVerdict, releaseOf, ROUTE_AB_SAMPLES, VARIANTS} from '../../scripts/native-matrix/route-ab.mjs';
import {planOf} from '../../scripts/native-matrix/run.mjs';
import {args, matrixSteps, runWith} from './run-doubles.mjs';

const zero = {appDidBecomeActive: 0, appDidResignActive: 0};
const counted = (become, resign) => ({seq: become + resign, at: 1, counts: {...zero, appDidBecomeActive: become, appDidResignActive: resign}});

// The fixture as the engine change drives it: a natural press holds a fake activation (become +1) until a request aimed
// at the user's app releases it (resign +1); a forced route-1 press activates nothing. `honours`: the engine takes the
// forced route (false: the service drops spikeRoute, every press is route 3).
function fixture({honours = true, releases = true, effect = true, activation = null} = {}) {
  let become = 3, resign = 3, held = false;
  const cell = code => {
    if (code.includes('cua-matrix:route-ab:act')) {
      const forced = code.includes('spikeRoute');
      const route = forced && honours ? 1 : 3;
      const activated = route === 3 && !held;
      if (activated) { become += 1; held = true; }
      return {actMs: forced ? 4 : 9, at: [100, 104], threw: false, _meta: {'cua/inputRoute': route,
        ...(activation && activated ? {'cua/activationClick': activation, 'cua/activationGuardMs': 12} : {})}};
    }
    if (code.includes('cua-matrix:route-ab:effect')) return effect ? {ok: true, outcome: {pressedOnce: true, effectMs: 140, polls: 2, firstMs: 60, pressed: 1}}
      : {ok: false, outcome: {pressedOnce: false, effectMs: null, polls: 9, firstMs: 60, pressed: 0}};
    if (code.includes('cua-matrix:route-ab:release')) { if (held && releases) { resign += 1; held = false; } return {observed: true}; }
    return null;
  };
  const ops = {matrix: (base, a) => { const answer = base(a); return a[0] === 'electron-counters' ? {...answer, answer: counted(become, resign)} : answer; }};
  return {cell, ops};
}
const run = (over = {}, plan = planOf('route-ab')) => {
  const {cell, ops} = fixture(over);
  const calls = [];
  return runWith({plan, cellName: 'route-ab', cell, ops, calls}).then(out => ({...out, calls}));
};

test('the cell is registered, narrows to the Electron fixture behind one user window, and lists as a narrowed cell', async () => {
  assert.deepEqual(await resolveCell('route-ab'), {kind: 'matrix', section: 'route-ab', plan: 'route-ab', describe: (await resolveCell('route-ab')).describe});
  assert.ok((await listCells()).some(c => c.name === 'route-ab' && c.section === 'route-ab'));
  assert.deepEqual(planOf('route-ab').routeAb, {driven: 'electron', user: 'finder'});
  assert.equal(planOf('route-ab').id, 'route-ab');
  assert.deepEqual(planOf('route-ab', {scene: 'electron', user: 'textedit'}).routeAb, {driven: 'electron', user: 'textedit'});
  assert.throws(() => planOf('route-ab', {scene: 'textedit'}), /nothing to run/);
  assert.throws(() => planOf('route-ab', {user: 'electron'}), /nothing to run/);
  assert.equal(planOf('matrix').routeAb, undefined, 'the whole matrix does not run it');
  assert.deepEqual(VARIANTS, ['forced1', 'natural', 'forced1', 'natural', 'forced1', 'natural']);
  assert.equal(ROUTE_AB_SAMPLES, 6);
});

test('six samples alternate forced route 1 and the natural route, each with its route, timings, focus, counters and the oracle', async () => {
  const {code, result, calls, steps} = await run();
  assert.equal(code, 0);
  assert.deepEqual(validateCellResult(result), []);
  assert.equal(result.cell, 'route-ab');
  assert.equal(result.meta.planId, 'route-ab');
  const rows = result.rows;
  assert.deepEqual(rows.map(r => [r.section, r.id, r.variant, r.sample]), VARIANTS.map((v, i) => ['route-ab', 'electron/background/click.button', v, i + 1]));
  assert.deepEqual(rows.map(r => r.inputRoute), [1, 3, 1, 3, 1, 3]);
  for (const row of rows) {
    assert.equal(row.invalid, undefined, `sample ${row.sample}: ${row.invalid}`);
    assert.equal(row.ok, true);
    assert.equal(row.pressedOnce, true);
    assert.equal(row.effectMs, 140);
    assert.equal(row.inCellMs, row.variant === 'forced1' ? 4 : 9);
    assert.equal(row.focus?.named, true, 'the focus probe before the sample');
    assert.ok(row.countersBefore?.counts && row.countersAfter?.counts);
    assert.equal(row.interference?.ok, true, 'the oracle judged the row');
    assert.equal(row.user, 'finder');
  }
  // The release precedes every forced sample after the first, and only those, and is shown each time.
  assert.deepEqual(rows.map(r => r.released), [undefined, undefined, true, undefined, true, undefined]);
  const kinds = calls.map(c => (c.code.match(/cua-matrix:route-ab:(\w+)/)?.[1] ?? null)).filter(Boolean);
  assert.deepEqual(kinds.filter(k => k === 'release').length, 2);
  assert.equal(kinds.indexOf('release'), kinds.indexOf('act', kinds.indexOf('act') + 1) + 2, 'the first release follows the first natural act and its effect poll');
  // The forced act goes straight to the service with spikeRoute "1" and the prepared index; the natural one is the facade's click.
  const acts = calls.filter(c => c.code.includes('cua-matrix:route-ab:act')).map(c => c.code);
  assert.ok(acts.filter((_, i) => i % 2 === 0).every(c => /nodeRepl\.rpc\("sky", \{type: "execute", method: "click", args: \[\{app: "[^"]+", element_index: __m\.index, spikeRoute: "1"\}\]\}\)/.test(c)));
  assert.ok(acts.filter((_, i) => i % 2 === 1).every(c => c.includes('await __app.click(__m.index);') && !c.includes('spikeRoute')));
  // The release is one observation of the user window's app.
  const release = calls.find(c => c.code.includes('cua-matrix:route-ab:release')).code;
  assert.ok(release.includes('globalThis.__apps?.["finder"]') && release.includes('await observe();'));
  // The effect is judged from the act's end on the device clock, bounded at 2 s.
  const effect = calls.find(c => c.code.includes('cua-matrix:route-ab:effect')).code;
  assert.ok(effect.includes('const __actEnd = 104;') && effect.includes('2000'));
  // The counters were read on the device, before and after each sample.
  assert.ok(matrixSteps(steps, 'electron-counters').length >= 13);
  // Every row's oracle read names the user window for the focus probe.
  assert.ok(matrixSteps(steps, 'read').filter(a => a.includes('--focus')).length >= 12);
});

test('a hold the release does not show released leaves that forced sample invalid, with nothing sent', async () => {
  const {result, calls} = await run({releases: false});
  assert.deepEqual(validateCellResult(result), []);
  const [, , third, , fifth] = result.rows;
  for (const row of [third, fifth]) {
    assert.equal(row.released, false);
    assert.match(row.invalid, /release/);
  }
  assert.equal(calls.filter(c => c.code.includes('cua-matrix:route-ab:act')).length, 4, 'the invalid samples sent no press');
});

test('a forced sample the engine routed otherwise is invalid: spikeRoute did not reach it', async () => {
  const {result} = await run({honours: false});
  const forced = result.rows.filter(r => r.variant === 'forced1');
  assert.ok(forced.every(r => r.inputRoute === 3 && /route 1/.test(r.invalid ?? '')));
  assert.ok(result.rows.filter(r => r.variant === 'natural').every(r => r.invalid === undefined));
});

test('a press with no effect within the bound fails its row with effectMs null', async () => {
  const {result} = await run({effect: false});
  assert.ok(result.rows.every(r => r.ok === false && r.pressedOnce === false && r.effectMs === null && r.invalid === undefined));
  assert.equal(result.verdict, 'fail');
});

test('the release is shown by the resignation after the natural sample and by no more activations than resignations since the cell began', () => {
  const start = counted(3, 3);
  const natural = {before: counted(3, 3), after: counted(4, 3)};
  assert.deepEqual(releaseOf({start, natural, now: counted(4, 4)}), {released: true, held: true, resignAdvanced: true, balanced: true});
  assert.equal(releaseOf({start, natural, now: counted(4, 3)}).released, false, 'still held');
  assert.equal(releaseOf({start, natural, now: counted(5, 4)}).released, false, 'activated again');
  // A natural sample that activated nothing left nothing held: balanced is enough.
  assert.equal(releaseOf({start, natural: {before: counted(3, 3), after: counted(3, 3)}, now: counted(3, 3)}).released, true);
  assert.equal(releaseOf({start, natural, now: null}).released, false, 'counters unread');
});

test('the device reads the fixture\'s counters from the Electron scene\'s user-data directory', async () => {
  const {main} = await import('../../scripts/native-matrix/matrix-device.mjs');
  const {writeState} = await import('../../scripts/repl-parity/scenes-mac.mjs');
  const {FIXTURE_COUNTERS_FILE} = await import('../../scripts/native-matrix/fixtures/electron-fixture.mjs');
  const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'route-ab-')));
  try {
    const userDataDir = join(dir, 'electron-user-data');
    fs.mkdirSync(userDataDir);
    fs.writeFileSync(join(userDataDir, FIXTURE_COUNTERS_FILE), `${JSON.stringify(counted(2, 1))}\n`);
    writeState(dir, {scenes: {electron: {pid: 12, userDataDir}}});
    const out = await main(['electron-counters', '--run', dir]);
    assert.deepEqual(out.answer, counted(2, 1));
    assert.equal(out.at.length, 2);
    writeState(dir, {scenes: {}});
    assert.equal((await main(['electron-counters', '--run', dir])).answer, null, 'the scene is down');
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
});

test('a dry run of the cell walks every step', async () => {
  const {result} = await runWith({plan: planOf('route-ab'), cellName: 'route-ab'});
  assert.deepEqual(validateCellResult(result), []);
  assert.equal(result.rows.length, 6);
});

test('only the route A/B lane\'s serve may forward a forced route (CUA_ENGINE_SPIKE_ROUTE); every other run\'s may not', async () => {
  const serves = steps => steps.filter(step => step.startsWith('serve ')).map(args);
  const ab = serves((await run()).steps);
  assert.ok(ab.length > 0 && ab.every(spec => spec.spikeRoute === true), JSON.stringify(ab));
  const other = serves((await runWith()).steps);
  assert.ok(other.length > 0 && other.every(spec => spec.spikeRoute === false), JSON.stringify(other));
});

test('an effect first seen after the bound is recorded as late and never passes', () => {
  assert.deepEqual(effectVerdict(5, 4, 1200, 2000), {ok: true, pressedOnce: true, late: false});
  assert.deepEqual(effectVerdict(5, 4, 2000, 2000), {ok: true, pressedOnce: true, late: false});
  assert.deepEqual(effectVerdict(5, 4, 2400, 2000), {ok: false, pressedOnce: true, late: true});
  assert.deepEqual(effectVerdict(4, 4, null, 2000), {ok: false, pressedOnce: false, late: false});
  assert.deepEqual(effectVerdict(6, 4, null, 2000), {ok: false, pressedOnce: false, late: false});
});

test('--natural-only narrows the cell to six natural samples; it belongs to the route A/B cell alone', async () => {
  const plan = planOf('route-ab', {naturalOnly: true});
  assert.deepEqual(plan.routeAb, {driven: 'electron', user: 'finder', naturalOnly: true});
  assert.equal(plan.id, 'route-ab-natural-only');
  assert.throws(() => planOf('method', {naturalOnly: true}), /--natural-only/);
  const {parseCommand} = await import('../../scripts/native-matrix.mjs');
  assert.equal(parseCommand(['cell', 'route-ab', '--device', 'mini', '--natural-only', '--dry-run']).naturalOnly, true);
  assert.equal(parseCommand(['cell', 'route-ab', '--device', 'mini', '--dry-run']).naturalOnly, false);
});

test('natural only: every sample after the first begins with the previous hold released, and none is forced', async () => {
  const {code, result, calls} = await run({activation: 'posted'}, planOf('route-ab', {naturalOnly: true}));
  assert.equal(code, 0);
  assert.deepEqual(validateCellResult(result), []);
  assert.deepEqual(result.rows.map(r => [r.variant, r.sample]), [1, 2, 3, 4, 5, 6].map(n => ['natural', n]));
  assert.ok(result.rows.every(r => r.invalid === undefined && r.ok && r.inputRoute === 3));
  assert.deepEqual(result.rows.map(r => r.released), [undefined, true, true, true, true, true]);
  assert.equal(calls.filter(c => c.code.includes('cua-matrix:route-ab:release')).length, 5);
  assert.ok(calls.every(c => !c.code.includes('spikeRoute')), 'no forced press');
  const serves = (await run({}, planOf('route-ab', {naturalOnly: true}))).steps.filter(step => step.startsWith('serve ')).map(args);
  assert.ok(serves.length > 0 && serves.every(spec => spec.spikeRoute === false), 'natural only needs no forced route: its serve does not set the variable');
  // Each press began un-held, so each ran the activation, whose click the engine reported.
  assert.ok(result.rows.every(r => r.countersAfter.counts.appDidBecomeActive === r.countersBefore.counts.appDidBecomeActive + 1));
  assert.ok(result.rows.every(r => r.activation?.click === 'posted' && r.activation.posted === true && r.activation.guardMs === 12));
  assert.equal(result.meta.planId, 'route-ab-natural-only');
});

test('the activation click\'s meta is recorded when the engine reports it: posted, or why it was skipped; absent, null', async () => {
  const skipped = await run({activation: 'control'}, planOf('route-ab', {naturalOnly: true}));
  assert.ok(skipped.result.rows.every(r => r.activation?.posted === false && r.activation.click === 'control'));
  const plain = await run();
  assert.ok(plain.result.rows.every(r => r.activation === null), 'null: the act reported none');
});
