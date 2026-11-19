import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCES,CELLS,PLAIN,CONTROLS,LONG_SIDE,CANARY,REWRITE_CHAR,materialize,plan,landed} from './cells.mjs';
import {CODES,outcomeOf,routeOf,readbackConfirmed,scan,score,summarize,coverage,gates,percentile} from './check.mjs';
import {page,LABELS} from './page.mjs';
import {patchInput,SEAM,PATCHED} from './patch-ax.mjs';

test('every cell materializes its expected content and, for a control, the one perturbed content', () => {
  for (const source of Object.keys(SOURCES)) for (const cell of CELLS) {
    const m = materialize(cell, source);
    assert.ok(!m.text.includes('z') && !m.text.includes(REWRITE_CHAR), 'generated text never holds a control character');
    assert.ok(/[぀-ヿ一-鿿가-힣]/.test(m.text), 'every text holds CJK');
    assert.equal(m.expected, m.initial.slice(0, m.start) + landed(m.field, m.text) + m.initial.slice(m.end));
    if (!CONTROLS.includes(cell)) { assert.equal(m.control, null); continue; }
    assert.notEqual(m.control, m.expected);
    if (cell === 'rewrite') {
      assert.equal(m.control.length, m.expected.length);
      // The first difference is at the caret; the canaries lie beyond #354's 100-unit excerpt radius on both sides.
      assert.equal([...m.expected].findIndex((c, i) => c !== m.control[i]), LONG_SIDE);
      assert.equal(m.canaries.length, 2);
      assert.ok(CANARY <= LONG_SIDE - 100 && m.expected.length - CANARY > LONG_SIDE + 100);
      assert.ok(m.expected.startsWith(m.canaries[0]) && m.expected.endsWith(m.canaries[1]));
    }
    if (cell === 'add') assert.equal(m.control, m.expected + 'z');
    if (cell === 'stale') { assert.equal(m.staleTo, 0); assert.equal(m.control, m.text + m.initial); }
  }
});

test('a single-line field takes no newline; a multi-line one takes each', () => {
  const single = materialize('newline-single', 'ko'), multi = materialize('multiline', 'ja-romaji');
  assert.equal(single.field, 'single'); assert.ok(single.text.includes('\n') && !single.expected.includes('\n'));
  assert.equal(multi.field, 'multi'); assert.equal(multi.expected.split('\n').length, 3); assert.equal(multi.lines, 3);
  const sel = materialize('selection', 'zh');
  assert.equal(sel.expected.length, sel.initial.length - (sel.end - sel.start) + sel.text.length);
});

test('plans: ten per cell to measure, twenty per head interleaved to qualify', () => {
  assert.equal(plan({mode: 'measure', heads: ['main']}).length, 10 * CELLS.length);
  const q = plan({mode: 'qualify', heads: ['main', 'fix']});
  assert.equal(q.length, 2 * 20 * CELLS.length);
  for (const head of ['main', 'fix']) for (const cell of CELLS) assert.equal(q.filter(r => r.head === head && r.cell === cell).length, 20);
  assert.ok(q.filter((r, i) => i % 2 === 0 && r.head === 'fix').length > 50, 'fix goes first in about half of the pairs');
  assert.deepEqual(plan({mode: 'smoke', heads: ['main']}).map(r => r.cell), CELLS);
});


const pasteMeta = (extra = {}) => ({inputRoute: 'paste', startedAt: 1, endedAt: 2, paste: {stage: 'effect', effectWait: 'reading', restore: 'restored', lines: 1}, ...extra});
test('outcomes: main by its paste stage, the fix by its read-back', () => {
  assert.deepEqual(outcomeOf({native: {result: {meta: pasteMeta()}}, guarded: true}), {outcome: 'success', reason: 'paste:effect:reading'});
  // The opening Return's settle rides in the last perLine record, as the pinned engine wires it.
  const returnTimeout = pasteMeta({paste: {stage: 'returnEffect', perLine: [{line: 1, stage: 'effect'}, {line: 2, stage: 'returnEffect', openingReturn: {settle: 'timeout'}}]}});
  assert.deepEqual(outcomeOf({native: {error: {errorName: 'pasteUnconfirmed', meta: returnTimeout}}, skyError: {}, guarded: true}),
    {outcome: 'pasteUnconfirmed', reason: 'paste:returnEffect:return-timeout'});
  assert.deepEqual(outcomeOf({native: {error: {errorName: 'clipboardReadTimedOut', meta: pasteMeta({paste: {stage: 'read', readWait: 'timeout'}})}}, skyError: {}, guarded: true}),
    {outcome: 'clipboardReadTimedOut', reason: 'paste:read:read-timeout'});
  assert.deepEqual(outcomeOf({native: {error: {errorName: 'typeUnconfirmed', meta: pasteMeta({typeReadback: {confirmed: false, reason: 'valueMismatch'}})}}, skyError: {}, guarded: true}),
    {outcome: 'typeUnconfirmed', reason: 'readback:valueMismatch'});
  // A diagnostic outside the closed vocabulary is never republished.
  assert.equal(outcomeOf({native: {result: {meta: pasteMeta({paste: {stage: 'Q361CLIPBCDF', effectWait: 'reading'}})}}, guarded: true}).reason, 'paste:other:reading');
  assert.equal(CODES.restore('Q361CLIPBCDF'), 'other');
  assert.equal(outcomeOf({native: {error: {errorName: 'weird'}}, guarded: true}).outcome, 'native-other');
  assert.equal(outcomeOf({guarded: false}).outcome, 'request-shape');
  assert.equal(routeOf({result: {meta: {inputRoute: 'paste'}}}), 'paste');
  assert.equal(routeOf({error: {meta: {inputRoute: '2\''}}}), 'keyed');
  assert.ok(readbackConfirmed({result: {meta: {typeReadback: {confirmed: true}}}}, {'cua/typeReadback': {confirmed: true}}));
  assert.ok(!readbackConfirmed({result: {meta: {typeReadback: {confirmed: true}}}}, {}));
});

const fixture = () => {
  const m = materialize('rewrite', 'ko');
  return {m, ctx: {setupText: 'MNBVCXQWRTYP', clipText: 'Q361CLIPKJHGFDSXPLKJHGFD', initial: m.initial, text: m.text, expected: m.expected, control: m.control, canaries: m.canaries, realized: true}};
};
test('privacy: other fields, the clipboard, unbounded excerpts and content off a mismatch are flagged', () => {
  const {m, ctx} = fixture();
  const clean = {native: {result: {meta: pasteMeta({entered: 6})}}, forwarded: {'cua/paste': pasteMeta().paste}, content: [], console: [], engineOutput: []};
  assert.deepEqual(scan(clean, {...ctx, mismatch: false}), []);
  assert.deepEqual(scan({...clean, engineOutput: ['log VCXQWR']}, {...ctx, mismatch: false}), ['other-field']);
  assert.deepEqual(scan({...clean, forwarded: {x: 'zzQ361CLIPKJHG'}}, {...ctx, mismatch: false}), ['clipboard']);
  // A bounded excerpt on a mismatch, in the message only: allowed.
  const first = LONG_SIDE, cut = (v, a = first - 100, b = first + 100) => v.slice(a, b);
  const say = (e, a) => `The text could not be confirmed. From character ${first - 99}, expected ${JSON.stringify(e)}; the field reads ${JSON.stringify(a)}.`;
  const mismatchOf = message => ({...clean, native: {error: {errorName: 'typeUnconfirmed', message, meta: pasteMeta({typeReadback: {reason: 'valueMismatch'}})}}, skyError: {message, meta: {}}});
  const mismatch = mismatchOf(say(cut(m.expected), cut(m.control)));
  assert.deepEqual(scan(mismatch, {...ctx, mismatch: true}), []);
  assert.deepEqual(scan(mismatch, {...ctx, mismatch: false}), ['content-without-mismatch']);
  // One unit beyond the radius on either side: unbounded.
  assert.deepEqual(scan(mismatchOf(say(cut(m.expected, first - 101), cut(m.control))), {...ctx, mismatch: true}), ['excerpt-unbounded']);
  // A legal-length excerpt shifted one unit before the radius: unbounded when the first difference is known, not otherwise.
  const shifted = mismatchOf(say(cut(m.expected), cut(m.control)).replace(`From character ${first - 99}`, `From character ${first - 100}`));
  assert.deepEqual(scan(shifted, {...ctx, mismatch: true}), ['excerpt-unbounded']);
  assert.deepEqual(scan(shifted, {...ctx, mismatch: true, realized: false}), []);
  // A second sentence echoing the pasted text beside a legal excerpt: outside the excerpt.
  const echo = mismatchOf(say(cut(m.expected), cut(m.control)) + ` You typed ${m.text}.`);
  assert.deepEqual(scan(echo, {...ctx, mismatch: true}), ['content-outside-excerpt']);
  // The whole field reaches the far ends: unbounded.
  assert.ok(scan({...mismatch, skyError: {message: `the field reads "${m.control}"`}}, {...ctx, mismatch: true}).includes('excerpt-unbounded'));
  // Content in a meta field or an emitted content item, even on a mismatch: outside the message.
  assert.ok(scan({...mismatch, forwarded: {'cua/typeReadback': {actual: m.text.slice(0, 4)}}}, {...ctx, mismatch: true}).includes('content-outside-message'));
  assert.ok(scan({...mismatch, content: [{type: 'data', data: {actual: m.text}}]}, {...ctx, mismatch: true}).includes('content-outside-message'));
  // Protocol words and English sentences never read as field content or canaries.
  assert.deepEqual(scan({...clean, forwarded: {confirmed: true, 'cua/typeReadback': {confirmed: false}}, skyError: {message: 'the field may hold the text abc'}},
    {...ctx, text: 'abc가나', mismatch: false}), []);
});

const row = (over) => ({source: 'ko', cell: 'empty-cjk', head: 'fix', rep: 0, attested: true, route: 'paste', privacy: [], serviceMs: 10, presentationHeld: true,
  ...score({cell: over.cell ?? 'empty-cjk', attested: true, route: 'paste', outcome: 'success', reason: 'readback:confirmed',
    domExact: true, confirmed: true, clip: {stringEqual: true, typesEqual: true}, ...over}), ...over});
test('scores and gates', () => {
  const wrong = score({cell: 'add', attested: true, route: 'paste', outcome: 'success', domExact: false, controlExact: true, hit: true, clip: {stringEqual: true, typesEqual: true}});
  assert.equal(wrong.valid, true); assert.equal(wrong.wrongSuccess, true); assert.equal(wrong.clipboardRestored, true);
  assert.equal(score({cell: 'add', attested: true, route: 'paste', outcome: 'success', domExact: false, controlExact: false, hit: true}).invalid, 'control-not-realized');
  const keyed = score({cell: 'empty-cjk', attested: true, route: 'keyed', outcome: 'success', domExact: false});
  assert.equal(keyed.invalid, 'route-not-paste'); assert.equal(keyed.wrongSuccess, false, 'a keyed row is no paste wrong success');
  assert.equal(score({cell: 'empty-cjk', attested: false, route: null, outcome: 'missing'}).invalid, 'setup');
  const good = [row({head: 'main', confirmed: false, reason: 'paste:effect:reading'}), row({}),
    row({cell: 'stale', outcome: 'typeUnconfirmed', domExact: false, controlExact: true, hit: true, confirmed: false}),
    row({cell: 'stale', head: 'main', outcome: 'success', domExact: false, controlExact: true, hit: true, confirmed: false})];
  const cov = {complete: true, covered: true, allValid: true};
  const g = gates(good, {coverage: cov});
  assert.ok(Object.entries(g).every(([k, x]) => k === 'perCell' || x.pass), JSON.stringify(g));
  assert.equal(g.wrongSuccess.main, 1);
  assert.equal(gates(good, {coverage: {complete: false}}).coverage.pass, false);
  const bad = gates([...good, row({cell: 'add', outcome: 'success', domExact: false, controlExact: true, hit: true, confirmed: true})], {coverage: cov});
  assert.equal(bad.controlsUnconfirmed.pass, false); assert.equal(bad.wrongSuccess.pass, false);
  // A realized control refused by another error is not the ticket's typeUnconfirmed.
  assert.equal(gates([...good, row({cell: 'add', outcome: 'pasteUnconfirmed', domExact: false, controlExact: true, hit: true, confirmed: false})], {coverage: cov}).controlsUnconfirmed.pass, false);
  // The baseline delivered exactly and the fix lost the delivery: the exact gate fails.
  const lost = gates([...good, row({head: 'main', rep: 1, confirmed: false}), row({rep: 1, outcome: 'pasteUnconfirmed', domExact: false, confirmed: false})], {coverage: cov});
  assert.equal(lost.exactConfirmed.pass, false); assert.equal(lost.exactConfirmed.lostDelivery, 1);
  assert.equal(gates([...good, row({clip: {stringEqual: false, typesEqual: true}})], {coverage: cov}).clipboard.pass, false);
  assert.equal(gates([...good, row({confirmed: false})], {coverage: cov}).exactConfirmed.pass, false);
  assert.equal(gates([...good, {...row({}), route: 'keyed'}], {coverage: cov}).route.pass, false);
  assert.equal(gates([...good, row({privacy: ['other-field']})], {coverage: cov}).privacy.pass, false);
  const leak = gates([...good, row({privacy: ['clipboard']}), row({head: 'main', privacy: ['late-clipboard']})], {coverage: cov});
  assert.equal(leak.clipboardContent.pass, false); assert.equal(leak.clipboardContent.fix, 1); assert.equal(leak.clipboardContent.main, 1);
  // Delivery: an unconfirmed but exact fix row is delivered; a lost one, or an unrealized control main realized, is not.
  const exactUnconfirmed = gates([...good, row({head: 'main', rep: 2, confirmed: false}), row({rep: 2, outcome: 'typeUnconfirmed', confirmed: false})], {coverage: cov});
  assert.equal(exactUnconfirmed.delivery.pass, true); assert.equal(exactUnconfirmed.exactConfirmed.pass, false);
  assert.equal(lost.delivery.pass, false); assert.equal(lost.delivery.lost, 1);
  const unrealizedGate = gates([...good, row({cell: 'add', head: 'main', rep: 3, outcome: 'success', domExact: false, controlExact: true, hit: true, confirmed: false}),
    row({cell: 'add', rep: 3, outcome: 'typeUnconfirmed', domExact: false, controlExact: false, hit: true, confirmed: false})], {coverage: cov});
  assert.equal(unrealizedGate.delivery.pass, false); assert.deepEqual(unrealizedGate.delivery.lostCells, {add: 1});
  const s = summarize(good);
  assert.equal(s.find(x => x.head === 'main' && x.cell === 'stale').wrongSuccess, 1);
  const c = coverage(good, {planned: {'ko/fix/empty-cjk': 1, 'ko/fix/stale': 1, 'ko/main/empty-cjk': 1, 'ko/main/stale': 1}, sources: ['ko'], heads: ['main', 'fix'], cells: ['empty-cjk', 'stale']});
  assert.equal(c.complete, true); assert.equal(c.covered, true);
  // Attempted but never valid (an unrealized control) is no coverage.
  const unrealized = [row({cell: 'rewrite', outcome: 'typeUnconfirmed', domExact: false, controlExact: false, hit: false})];
  const u = coverage(unrealized, {planned: {'ko/fix/rewrite': 1}, sources: ['ko'], heads: ['fix'], cells: ['rewrite']});
  assert.equal(u.complete, true); assert.equal(u.covered, false); assert.deepEqual(u.uncovered, ['ko/fix/rewrite']);
  assert.equal(coverage(good.slice(1), {planned: {'ko/main/empty-cjk': 1}, sources: ['ko'], heads: ['main'], cells: ['empty-cjk']}).complete, false);
  assert.equal(coverage([], {planned: {}, sources: [], heads: ['main'], cells: ['empty-cjk']}).complete, false);
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3); assert.equal(percentile([], 95), null);
});


test('the page script parses and labels its fields', () => {
  const html = page(), script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new Function(script));
  for (const label of Object.values(LABELS)) assert.ok(html.includes(`aria-label="${label}"`));
});

test('the AX patch applies at its one seam or fails closed', () => {
  const source = `switch route {\n${SEAM}text, target)\n}`;
  assert.ok(patchInput(source).includes(PATCHED));
  assert.throws(() => patchInput('nothing here'));
  assert.throws(() => patchInput(source + source));
});

test('disclosure finds #354\'s excerpt and lengths, and nothing in a bare refusal', async () => {
  const {disclosure} = await import('./check.mjs');
  const msg = 'The text could not be confirmed. From character 3, expected "ab"; the field reads "ax". The expected text is 9 characters long, the field\'s 9.';
  assert.deepEqual(disclosure({native: {error: {message: msg, meta: {typeReadback: {reason: 'valueMismatch'}}}}}), {excerpt: true, lengths: true});
  assert.deepEqual(disclosure({forwarded: {'cua/typeReadback': {expectedLength: 9}}}), {excerpt: false, lengths: true});
  assert.deepEqual(disclosure({native: {error: {message: 'The text could not be confirmed: the field does not match what was typed.'}}}), {excerpt: false, lengths: false});
});
