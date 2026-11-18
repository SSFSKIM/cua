import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCES,CELLS,PLAIN,CONTROLS,LONG_SIDE,CANARY,REWRITE_CHAR,materialize,plan,landed} from './cells.mjs';
import {outcomeOf,routeOf,readbackConfirmed,scan,score,summarize,gates,percentile} from './check.mjs';
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
  assert.deepEqual(outcomeOf({native: {error: {errorName: 'pasteUnconfirmed', meta: pasteMeta({paste: {stage: 'returnEffect', openingReturn: {settle: 'timeout'}}})}}, skyError: {}, guarded: true}),
    {outcome: 'pasteUnconfirmed', reason: 'paste:returnEffect:return-timeout'});
  assert.deepEqual(outcomeOf({native: {error: {errorName: 'typeUnconfirmed', meta: pasteMeta({typeReadback: {confirmed: false, reason: 'valueMismatch'}})}}, skyError: {}, guarded: true}),
    {outcome: 'typeUnconfirmed', reason: 'readback:valueMismatch'});
  assert.equal(outcomeOf({native: {error: {errorName: 'weird'}}, guarded: true}).outcome, 'native-other');
  assert.equal(outcomeOf({guarded: false}).outcome, 'request-shape');
  assert.equal(routeOf({result: {meta: {inputRoute: 'paste'}}}), 'paste');
  assert.equal(routeOf({error: {meta: {inputRoute: '2\''}}}), 'other');
  assert.ok(readbackConfirmed({result: {meta: {typeReadback: {confirmed: true}}}}, {'cua/typeReadback': {confirmed: true}}));
  assert.ok(!readbackConfirmed({result: {meta: {typeReadback: {confirmed: true}}}}, {}));
});

const fixture = () => {
  const m = materialize('rewrite', 'ko');
  return {m, ctx: {setupText: 'mnbvcxqwerty', clipText: 'q361clipkjhgfdsapoiuytre', initial: m.initial, text: m.text, expected: m.expected, control: m.control, canaries: m.canaries}};
};
test('privacy: other fields, the clipboard, unbounded excerpts and content off a mismatch are flagged', () => {
  const {m, ctx} = fixture();
  const clean = {native: {result: {meta: pasteMeta({entered: 6})}}, forwarded: {'cua/paste': pasteMeta().paste}, content: [], console: [], engineOutput: []};
  assert.deepEqual(scan(clean, {...ctx, mismatch: false}), []);
  assert.deepEqual(scan({...clean, engineOutput: ['log vcxqwer']}, {...ctx, mismatch: false}), ['other-field']);
  assert.deepEqual(scan({...clean, forwarded: {x: 'zzq361clipkjhgfdsap'}}, {...ctx, mismatch: false}), ['clipboard']);
  // A bounded excerpt on a mismatch, in the message only: allowed.
  const first = LONG_SIDE, excerpt = (v) => v.slice(first - 100, first + 100);
  const message = `The text could not be confirmed. From character ${first - 99}, expected "${excerpt(m.expected)}"; the field reads "${excerpt(m.control)}".`;
  const mismatch = {...clean, native: {error: {errorName: 'typeUnconfirmed', message, meta: pasteMeta({typeReadback: {reason: 'valueMismatch'}})}}, skyError: {message, meta: {}}};
  assert.deepEqual(scan(mismatch, {...ctx, mismatch: true}), []);
  assert.deepEqual(scan(mismatch, {...ctx, mismatch: false}), ['content-without-mismatch']);
  // The whole field in the message reaches the far ends: unbounded.
  const whole = {...mismatch, skyError: {message: `the field reads "${m.control}"`}};
  assert.ok(scan(whole, {...ctx, mismatch: true}).includes('excerpt-unbounded'));
  // Content in a meta field, even on a mismatch: outside the message.
  const inMeta = {...mismatch, forwarded: {'cua/typeReadback': {actual: m.text.slice(0, 4)}}};
  assert.ok(scan(inMeta, {...ctx, mismatch: true}).includes('content-outside-message'));
  // English words in a message never read as field content.
  assert.deepEqual(scan({...clean, skyError: {message: 'the field may hold the text abc'}}, {...ctx, text: 'abc가나', mismatch: false}), []);
});

const row = (over) => ({source: 'ko', cell: 'empty-cjk', head: 'fix', attested: true, route: 'paste', privacy: [], serviceMs: 10, presentationHeld: true,
  ...score({cell: over.cell ?? 'empty-cjk', head: over.head ?? 'fix', attested: true, route: 'paste', outcome: 'success', reason: 'readback:confirmed',
    domExact: true, confirmed: true, clip: {stringEqual: true, typesEqual: true}, ...over}), ...over});
test('scores and gates', () => {
  const wrong = score({cell: 'add', head: 'main', attested: true, route: 'paste', outcome: 'success', domExact: false, controlExact: true, hit: true, clip: {stringEqual: true, typesEqual: true}});
  assert.equal(wrong.valid, true); assert.equal(wrong.wrongSuccess, true); assert.equal(wrong.clipboardRestored, true);
  assert.equal(score({cell: 'add', attested: true, route: 'paste', outcome: 'success', domExact: false, controlExact: false, hit: true}).invalid, 'control-not-realized');
  assert.equal(score({cell: 'empty-cjk', attested: true, route: '2\'', outcome: 'success', domExact: true}).invalid, 'route-not-paste');
  assert.equal(score({cell: 'empty-cjk', attested: false, route: null, outcome: 'missing'}).invalid, 'setup');
  const good = [row({head: 'main', confirmed: false, reason: 'paste:effect:reading'}), row({}),
    row({cell: 'stale', outcome: 'typeUnconfirmed', domExact: false, controlExact: true, hit: true, confirmed: false}),
    row({cell: 'stale', head: 'main', outcome: 'success', domExact: false, controlExact: true, hit: true, confirmed: false})];
  const g = gates(good);
  assert.ok(Object.values(g).every(x => x.pass), JSON.stringify(g));
  assert.equal(g.wrongSuccess.main, 1);
  const bad = gates([...good, row({cell: 'add', outcome: 'success', domExact: false, controlExact: true, hit: true, confirmed: true})]);
  assert.equal(bad.controlsUnconfirmed.pass, false); assert.equal(bad.wrongSuccess.pass, false);
  assert.equal(gates([...good, row({clip: {stringEqual: false, typesEqual: true}})]).clipboard.pass, false);
  assert.equal(gates([...good, row({confirmed: false})]).exactConfirmed.pass, false);
  assert.equal(gates([...good, {...row({}), route: 'other'}]).route.pass, false);
  assert.equal(gates([...good, row({privacy: ['other-field']})]).privacy.pass, false);
  const s = summarize(good);
  assert.equal(s.find(x => x.head === 'main' && x.cell === 'stale').wrongSuccess, 1);
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
