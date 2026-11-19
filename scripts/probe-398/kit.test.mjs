import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {UNITS,PLACEHOLDER_CELLS,STALE_CELLS,TARGET_LABEL,TWIN,SOLO,unitKey,plan,materialize} from './cells.mjs';
import {outcomeOf,whyOf,axChangedOf,score,gates,coverage,findTargets,placeholderShape} from './check.mjs';
import {page,LABELS,PLACEHOLDERS} from './page.mjs';
import {patchLineage,MATCHES_SEAM,COMMIT_SEAM,PLACEHOLDER_SEAM} from './patch-census.mjs';
import {site} from './census.mjs';
import {PAGES,SCENES} from './sites.mjs';

test('the census patch applies exactly once to this checkout\'s Lineage.swift and leaves the default match unchanged', () => {
  const src = readFileSync(new URL('../../native/engine/Sources/Engine/Lineage.swift', import.meta.url), 'utf8');
  const patched = patchLineage(src);
  assert.ok(patched.includes('ignoringPlaceholder: Bool = false'));
  assert.ok(patched.includes('(ignoringPlaceholder || placeholder == other.placeholder)'));
  assert.ok(patched.includes('probe398Census(next, number: revision)'));
  for (const seam of [MATCHES_SEAM, COMMIT_SEAM, PLACEHOLDER_SEAM]) assert.ok(src.includes(seam));
  assert.throws(() => patchLineage(patched), /exactly once/);
});


test('plans: ten per unit to measure, twenty per head interleaved to qualify', () => {
  assert.equal(UNITS.length, PLACEHOLDER_CELLS.length * 2 + STALE_CELLS.length);
  assert.ok(UNITS.some(u => u.cell === 'solo-renamed' && u.seq === 'set'));
  assert.equal(plan({mode: 'measure', heads: ['main']}).length, 10 * UNITS.length);
  const q = plan({mode: 'qualify', heads: ['main', 'fix']});
  assert.equal(q.length, 2 * 20 * UNITS.length);
  const firsts = new Set(q.filter((_, i) => i % 2 === 0).map(r => r.head));
  assert.deepEqual([...firsts].sort(), ['fix', 'main']);
  const m = materialize(UNITS[0]);
  assert.match(m.value, /^Q398[B-Y]{10}$/);
});

test('the page and the AppKit fixture name the fields the harness looks for', () => {
  const html = page(), swift = readFileSync(new URL('./fixture.swift', import.meta.url), 'utf8');
  for (const cell of PLACEHOLDER_CELLS) {
    assert.equal(LABELS[cell], TARGET_LABEL[cell]);
    assert.ok(html.includes(`aria-label="${TARGET_LABEL[cell]}"`));
    assert.ok(swift.includes('"Probe398 \\(k)"'));
  }
  assert.equal(LABELS.twin, TWIN.label);
  assert.equal(PLACEHOLDERS.twinA, TWIN.a); assert.equal(PLACEHOLDERS.twinB, TWIN.b);
  assert.equal(LABELS.solo, SOLO.label); assert.equal(TARGET_LABEL['solo-renamed'], SOLO.label);
  assert.equal(PLACEHOLDERS.solo, SOLO.placeholder); assert.equal(PLACEHOLDERS.soloRenamed, SOLO.renamed);
  for (const s of [TWIN.a, TWIN.b, TWIN.label, SOLO.label, SOLO.placeholder, SOLO.renamed]) assert.ok(swift.includes(`"${s}"`));
  assert.ok(html.includes("'solo-renamed'") && swift.includes('"solo-renamed"'));
});

test('targets are found by label, twins by their placeholder, and nothing ambiguous is accepted', () => {
  const nodes = [{token: 't1', description: 'Probe398 focus', placeholder: 'x'}, {token: 't2', description: TWIN.label, placeholder: TWIN.a},
    {token: 't3', description: TWIN.label, placeholder: TWIN.b}, {token: 't5', description: SOLO.label, placeholder: SOLO.placeholder}];
  assert.equal(findTargets(nodes, 'focus').target.token, 't1');
  assert.equal(findTargets(nodes, 'solo-renamed').target.token, 't5');
  assert.deepEqual([findTargets(nodes, 'twin-renamed').target.token, findTargets(nodes, 'twin-renamed').twin.token], ['t2', 't3']);
  assert.equal(findTargets([...nodes, {token: 't4', title: 'Probe398 focus'}], 'focus'), null);
  assert.equal(findTargets(nodes, 'rotate'), null);
  assert.equal(placeholderShape({placeholder: ' '}), 'empty');
  assert.equal(placeholderShape({}), 'absent');
  assert.equal(axChangedOf({placeholder: 'a'}, {placeholder: ''}, true), true);
  assert.equal(axChangedOf({placeholder: 'a'}, {placeholder: 'a'}, true), false);
  assert.equal(axChangedOf({placeholder: 'a'}, {}, true), true);
  assert.equal(axChangedOf({placeholder: 'a'}, null, true), true);
  assert.equal(axChangedOf({placeholder: 'a'}, {placeholder: ''}, null), null);
});

const read = (o = {}) => ({target: 'focus', present: true, sameNode: true, exact: true, othersWritten: [], placeholderChanges: 1,
  focusesSinceMark: {focus: 1, static: 0}, ...o});
const base = {cell: 'focus', attested: true, click: 'success', first: read(), axChanged: true};
test('verdicts: exact success, a correlated refusal, no answer, wrong adoption and wrong success', () => {
  assert.equal(score({...base, act: 'success', read: read()}).verdict, 'success-exact');
  const refused = score({...base, act: 'valueUnconfirmed', actWhy: 'refetch', read: read()});
  assert.equal(refused.verdict, 'refused-delivered'); assert.equal(refused.placeholderCorrelated, true); assert.equal(refused.exercised, true);
  // A late click's drift is not the re-fetch: never correlated with the placeholder.
  assert.equal(score({...base, act: 'valueUnconfirmed', actWhy: 'drift', read: read()}).placeholderCorrelated, false);
  // Not exercised: no change at the first read, or none the engine's own re-observation saw.
  const settledOnly = score({...base, first: read({placeholderChanges: 0}), act: 'elementNoLongerValid', read: read({placeholderChanges: 3})});
  assert.equal(settledOnly.placeholderCorrelated, false); assert.equal(settledOnly.exercised, false);
  assert.equal(score({...base, axChanged: false, act: 'elementNoLongerValid', read: read()}).placeholderCorrelated, false);
  assert.equal(score({...base, act: 'success', read: read({exact: false})}).verdict, 'wrong-success');
  assert.equal(score({...base, act: 'missing', read: read({exact: false})}).verdict, 'no-answer');
  assert.equal(score({...base, click: 'missing', act: 'skipped', read: read({exact: false})}).verdict, 'no-answer');
  assert.equal(score({...base, click: 'elementNoLongerValid', act: 'skipped', read: read({exact: false})}).verdict, 'click-refused');
  // A write into the setup field's canary is a wrong-field write.
  assert.equal(score({...base, act: 'elementNoLongerValid', read: read({exact: false, othersWritten: ['setup']})}).verdict, 'wrong-adoption');
  const twin = read({target: 'twinA', exact: false, othersWritten: ['twinB'], focusesSinceMark: {twinA: 0, twinB: 1}});
  assert.equal(score({cell: 'twin-removed', attested: true, click: 'success', act: 'success', read: twin}).verdict, 'wrong-adoption');
  assert.equal(score({cell: 'twin-removed', attested: true, click: 'elementNoLongerValid', act: 'elementNoLongerValid',
    read: read({target: 'twinA', present: false, exact: false, focusesSinceMark: {}})}).verdict, 'refused');
  assert.equal(score({cell: 'solo-renamed', attested: true, click: 'success', act: 'success',
    read: read({target: 'solo', sameNode: true, focusesSinceMark: {solo: 1}})}).verdict, 'success-exact');
  assert.equal(score({cell: 'focus', attested: true, observeFailed: true, click: null, act: null, read: null}).verdict, 'observe-failed');
  assert.equal(score({cell: 'focus', attested: false, click: null, act: null, read: null}).verdict, 'invalid');
  assert.equal(outcomeOf({error: {errorName: 'elementNoLongerValid'}}), 'elementNoLongerValid');
  assert.equal(outcomeOf({error: {errorName: 'has spaces'}}), 'other');
  assert.equal(outcomeOf({result: {}}), 'success');
  assert.equal(outcomeOf(null), 'missing');
  assert.equal(outcomeOf('skipped'), 'skipped');
  assert.equal(whyOf({error: {message: 'The value was sent to X and accepted, but the field could not be found again to confirm it.'}}), 'refetch');
  assert.equal(whyOf({error: {message: 'accepted, but the field read another value just after, as when'}}), 'drift');
  assert.equal(whyOf({error: {message: 'accepted without a click to focus the field'}}), 'unfocused');
  assert.equal(whyOf({result: {}}), null);
});

// Synthetic qualification rows: `verdictFor` names each row's verdict; the rest follows it.
function rows(verdictFor, extra = () => ({})) {
  return plan({mode: 'qualify', heads: ['main', 'fix']}).map(r => {
    const v = verdictFor(r);
    const changing = PLACEHOLDER_CELLS.includes(r.cell) && r.cell !== 'static';
    return {...r, valid: true, click: v === 'success-exact' ? 'success' : 'elementNoLongerValid',
      act: v === 'success-exact' ? 'success' : 'elementNoLongerValid', verdict: v, exact: v === 'success-exact',
      refused: ['refused', 'refused-delivered', 'click-refused'].includes(v), exercised: changing ? true : r.cell === 'static' ? null : true,
      placeholderCorrelated: r.head === 'main' && changing && v === 'refused', presentationHeld: true, ...extra(r)};
  });
}
const good = r => r.cell === 'twin-removed' || r.cell === 'twin-renamed' ? 'refused' :
  r.head === 'main' && !['static', 'twin-recreate'].includes(r.cell) ? 'refused' : 'success-exact';
const planned = list => list.reduce((o, r) => (o[`${r.head}/${unitKey(r)}`] = (o[`${r.head}/${unitKey(r)}`] ?? 0) + 1, o), {});
test('gates pass a fix that succeeds where main refused, and fail each way a fix can be wrong or untested', () => {
  const ok = rows(good), cov = coverage(ok, {planned: planned(ok), heads: ['main', 'fix']});
  const g = gates(ok, {coverage: cov});
  assert.ok(Object.values(g).every(x => x.pass), JSON.stringify(g));
  const adopted = rows(r => r.head === 'fix' && r.cell === 'twin-removed' && r.rep === 3 ? 'wrong-adoption' : good(r));
  const ga = gates(adopted, {coverage: cov});
  assert.equal(ga.noWrongAdoption.pass, false); assert.equal(ga.twinRemovedRefused.pass, false);
  // A removed twin with no answer is no refusal.
  const silent = rows(good, r => r.head === 'fix' && r.cell === 'twin-removed' && r.rep === 2 ? {click: 'missing', act: 'missing'} : {});
  assert.equal(gates(silent, {coverage: cov}).twinRemovedRefused.pass, false);
  const regressed = rows(r => r.head === 'fix' && r.cell === 'static' && r.rep === 0 ? 'refused' : good(r));
  const gr = gates(regressed, {coverage: cov});
  assert.equal(gr.noRegression.pass, false); assert.equal(gr.placeholderFixed.pass, false);
  // Successes on rows whose placeholder never changed prove nothing.
  const untested = rows(good, r => r.head === 'fix' && r.cell === 'focus' && r.seq === 'set' && r.rep < 11 ? {exercised: false} : {});
  const gu = gates(untested, {coverage: cov});
  assert.equal(gu.placeholderFixed.pass, false); assert.deepEqual(gu.placeholderFixed.underExercised, ['focus/set']);
  const strictWalk = rows(r => r.head === 'fix' && r.cell === 'solo-renamed' ? 'refused' : good(r));
  assert.equal(gates(strictWalk, {coverage: cov}).soloAdopted.pass, false);
  const foreground = rows(good, r => r.head === 'fix' && r.cell === 'rotate' && r.seq === 'type' && r.rep === 4 ? {presentationHeld: false} : {});
  const gp = gates(foreground, {coverage: cov});
  assert.equal(gp.presentation.pass, false); assert.deepEqual(gp.presentation.worse, ['rotate/type']);
  const short = ok.slice(0, -1);
  assert.equal(coverage(short, {planned: planned(ok), heads: ['main', 'fix']}).complete, false);
});

test('the census sample is 30 to 50 public pages and a few built-in apps, each named once', () => {
  assert.ok(PAGES.length >= 30 && PAGES.length <= 50);
  assert.equal(new Set(PAGES.map(p => p.url)).size, PAGES.length);
  for (const p of PAGES) assert.equal(new URL(p.url).protocol, 'https:');
  assert.equal(new Set(SCENES.map(s => s.id)).size, SCENES.length);
  assert.ok(!SCENES.some(s => s.bundle === 'com.apple.keychainaccess'));
  assert.equal(site('www.google.com'), 'google.com'); assert.equal(site('consent.google.com'), 'google.com');
});
