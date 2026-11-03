import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  caretArrived,
  matrixOutcome,
  classifyFamily,
  clickPoints,
  counterArrived,
  keyArrived,
  parseBusctl,
  renderMatrix,
  splitNodeId,
  summarizeFamily,
  terminalClickArrived,
  typedArrived,
} from '../../scripts/linux-engine-diff/matrix-judge.mjs';

test('a native node id splits into its bus name and object path', () => {
  assert.deepEqual(splitNodeId(':1.3590:/org/gnome/TextEditor/a11y/013be04a'), { bus: ':1.3590', path: '/org/gnome/TextEditor/a11y/013be04a' });
  assert.deepEqual(splitNodeId(':1.2:/org/a11y/atspi/accessible/73'), { bus: ':1.2', path: '/org/a11y/atspi/accessible/73' });
  assert.equal(splitNodeId('x11:0x1600006'), null);
});

test('busctl JSON answers are unwrapped, variants included', () => {
  assert.deepEqual(parseBusctl('{"type":"s","data":["cua171 Ωé🙂\\nline"]}'), ['cua171 Ωé🙂\nline']);
  assert.deepEqual(parseBusctl('{"type":"v","data":[{"type":"i","data":5}]}'), [5]);
  assert.deepEqual(parseBusctl('{"type":"iiii","data":[1,262,640,480]}'), [1, 262, 640, 480]);
  assert.deepEqual(parseBusctl('{"type":"v","data":[{"type":"s","data":"GTK"}]}'), ['GTK']);
});

test('a key arrived when the field grew by the key, or shrank by one for BackSpace', () => {
  assert.equal(keyArrived('x', 'abc', 'xabc'), true);
  assert.equal(keyArrived('x', 'abc', 'abc'), false);
  assert.equal(keyArrived('x', 'abc', 'abxc'), true);
  assert.equal(keyArrived('BackSpace', 'xabc', 'abc'), true);
  assert.equal(keyArrived('BackSpace', 'abc', 'abc'), false);
  assert.equal(keyArrived('x', null, 'x'), null);
  // two characters is not one key
  assert.equal(keyArrived('x', 'abc', 'xxabc'), false);
});

test('a terminal key arrived when the recorded input ends with it', () => {
  assert.equal(keyArrived('x', 'ab', 'abx', { append: true }), true);
  assert.equal(keyArrived('x', 'ab', 'xab', { append: true }), false);
  assert.equal(keyArrived('BackSpace', 'ab', 'ab\x7f', { append: true }), true);
  assert.equal(keyArrived('BackSpace', 'ab', 'ab\b', { append: true }), true);
});

test('typed text arrived once when its marker occurs exactly once more than before', () => {
  assert.equal(typedArrived('cua171 Ωé🙂 p0', 'doc', 'cua171 Ωé🙂 p0doc'), true);
  assert.equal(typedArrived('cua171 Ωé🙂 p0', 'doc', 'doc'), false);
  assert.equal(typedArrived('cua171 Ωé🙂 p0', 'doc', 'cua171 Ωé🙂 p0cua171 Ωé🙂 p0doc'), false);
  assert.equal(typedArrived('m', null, 'm'), null);
});

test('a click arrived in an editor when the caret moved to where the click points', () => {
  // the document's lines: the end click lands at or after the last line's start, the start click near offset 0
  const doc = 'line one\nline two\n';
  assert.equal(caretArrived('end', { caret: 0, text: doc }, { caret: doc.length, text: doc }), true);
  assert.equal(caretArrived('end', { caret: 0, text: doc }, { caret: 0, text: doc }), false);
  assert.equal(caretArrived('start', { caret: doc.length, text: doc }, { caret: 1, text: doc }), true);
  assert.equal(caretArrived('start', { caret: doc.length, text: doc }, { caret: doc.length, text: doc }), false);
  // a click to where the caret already is shows nothing
  assert.equal(caretArrived('start', { caret: 0, text: doc }, { caret: 0, text: doc }), false);
  assert.equal(caretArrived('end', { caret: null, text: doc }, { caret: 3, text: doc }), null);
  // paragraph documents: the caret is (paragraph, offset) and the end click lands in the last paragraph
  assert.equal(caretArrived('end', { paragraph: 0, of: 3, caret: 0 }, { paragraph: 2, of: 3, caret: 0 }), true);
  assert.equal(caretArrived('start', { paragraph: 2, of: 3, caret: 0 }, { paragraph: 0, of: 3, caret: 2 }), true);
  assert.equal(caretArrived('start', { paragraph: 2, of: 3, caret: 0 }, { paragraph: 2, of: 3, caret: 0 }), false);
});

test('click points: the end click is low in the text area, the start click at its first character', () => {
  const area = { x: 10, y: 100, w: 800, h: 500 };
  const { start, end } = clickPoints(area, { x: 0, y: 40 });
  assert.deepEqual(start, { x: 10 + 60, y: 100 + 8 - 40 });
  assert.equal(end.x, 10 + 400);
  assert.ok(end.y > 100 + 400 - 40 && end.y < 100 + 500 - 40);
});

test('a counter click arrived when the counter rose by one; a terminal click when a mouse report was recorded', () => {
  assert.equal(counterArrived(3, 4), true);
  assert.equal(counterArrived(3, 3), false);
  assert.equal(counterArrived(3, 5), false);
  assert.equal(counterArrived(null, 1), null);
  assert.equal(terminalClickArrived('ab', 'ab\x1b[M !!\x1b[M#!!'), true);
  assert.equal(terminalClickArrived('ab', 'ab'), false);
});

const row = (engine, op, effect, witness = true, ok = true) => ({ kind: 'matrix-sample', family: 'f', engine, op, effect, witness, ok });

test('a family summary counts effects, clean witnesses and answers per engine and operation', () => {
  const rows = [row('pinned', 'key', true), row('pinned', 'key', false), row('cua', 'key', true, false), row('cua', 'click', null)];
  const s = summarizeFamily(rows);
  assert.deepEqual(s.key.pinned, { n: 2, ok: 2, refused: 0, effect: 1, effect_known: 2, witness_clean: 2 });
  assert.deepEqual(s.key.cua, { n: 1, ok: 1, refused: 0, effect: 1, effect_known: 1, witness_clean: 0 });
  assert.deepEqual(s.click.cua, { n: 1, ok: 1, refused: 0, effect: 0, effect_known: 0, witness_clean: 1 });
});

test('a family that takes no background click or key on any engine ignores background input', () => {
  const ignored = summarizeFamily([row('pinned', 'key', false), row('newest', 'key', false), row('cua', 'key', false), row('pinned', 'click', false), row('cua', 'click', false)]);
  assert.equal(classifyFamily(ignored).background, 'ignores');
  const takes = summarizeFamily([row('pinned', 'key', true), row('cua', 'key', true), row('pinned', 'click', true), row('cua', 'click', true)]);
  assert.equal(classifyFamily(takes).background, 'takes');
  const partial = summarizeFamily([row('pinned', 'key', true), row('cua', 'key', true), row('pinned', 'click', false), row('cua', 'click', false)]);
  assert.equal(classifyFamily(partial).background, 'partial');
  assert.deepEqual(classifyFamily(partial).ignored_ops, ['click']);
  // an operation whose effect could not be read is unknown, not ignored
  const unknown = summarizeFamily([row('cua', 'key', null), row('cua', 'click', null)]);
  assert.equal(classifyFamily(unknown).background, 'unknown');
  // the witness must be clean for the background route to count as taken
  const dirty = summarizeFamily([row('cua', 'key', true, false), row('cua', 'click', true, false)]);
  assert.equal(classifyFamily(dirty).witness, 'dirty');
});

test('the matrix renders one row per family with its identity and each operation per engine', () => {
  const families = [
    {
      family: 'gedit',
      title: 'GTK3 gedit',
      identity: { toolkit: 'GAIL', toolkit_version: '3.24.41', wm_class: 'gedit / Gedit', source: 'at_spi', nodes: 480 },
      summary: summarizeFamily([row('pinned', 'key', true), row('cua', 'key', true), row('pinned', 'type_text', false, true, false)]),
      run: 'matrix-x',
    },
  ];
  const md = renderMatrix(families, { engines: ['pinned', 'newest', 'cua'] }).join('\n');
  assert.match(md, /\| GTK3 gedit \| GAIL 3\.24\.41 \| gedit \/ Gedit \| at_spi \(480\) \|/);
  assert.match(md, /1\/1/);
  assert.match(md, /0\/1 \(1 failed\)/);
  assert.match(md, /matrix-x/);
});

test('key pacing: a window needs no pacing when every burst arrives at 0 ms with the 100 ms teardown; the lowest safe teardown', async () => {
  const { paceVerdict } = await import('../../scripts/linux-engine-diff/experiments.mjs');
  const r = (pace, teardown, ok) => ({ key_pace_ms: pace, teardown_ms: teardown, ok });
  const chromeLike = [r(33, 100, true), r(0, 100, true), r(0, 50, true), r(0, 33, false), r(0, 20, false), r(0, 0, false)];
  assert.deepEqual(paceVerdict(chromeLike), { pace0_with_teardown100: true, lowest_teardown_ms: 50, failed_at_pace0_teardown100: 0, failed_at_pace33_teardown100: 0 });
  const fast = [r(0, 100, true), r(0, 50, true), r(0, 0, true)];
  assert.equal(paceVerdict(fast).lowest_teardown_ms, 0);
  // a window that drops keys even at 0 ms pacing with the full teardown needs pacing back
  const slow = [r(33, 100, true), r(0, 100, false), r(0, 100, true), r(0, 50, true)];
  assert.deepEqual(paceVerdict(slow), { pace0_with_teardown100: false, lowest_teardown_ms: null, failed_at_pace0_teardown100: 1, failed_at_pace33_teardown100: 0 });
});

test('capture readiness: the slowest real contents against the 40 ms wait, flagged past 30 ms', async () => {
  const { captureMargin } = await import('../../scripts/linux-engine-diff/experiments.mjs');
  assert.deepEqual(captureMargin([6.6, 26.8, 12]), { max_ms: 26.8, margin_ms: 13.2, over_line: false });
  assert.deepEqual(captureMargin([31.2, 3]), { max_ms: 31.2, margin_ms: 8.8, over_line: true });
});

test("typed text is found through Firefox's U+FEFF after a character beyond the BMP", () => {
  assert.equal(typedArrived('cua171 Ωé🙂 newest0', '', 'cua171 Ωé🙂\uFEFF newest0'), true);
});

test('a family whose clicks could not be read while its keys were taken is partial, not takes', () => {
  const s = summarizeFamily([row('cua', 'key', true), row('pinned', 'key', true), row('cua', 'click', null), row('pinned', 'click', null)]);
  const c = classifyFamily(s);
  assert.equal(c.background, 'partial');
  assert.deepEqual(c.unknown_ops, ['click']);
  assert.equal(c.description, 'takes keys; clicks unknown');
  const md = renderMatrix([{ family: 'f', title: 'F', identity: {}, summary: s, run: 'r' }]).join('\n');
  assert.match(md, /takes keys; clicks unknown/);
  // every readable kind decided, mixed, keeps the plain words
  assert.equal(classifyFamily(summarizeFamily([row('cua', 'key', false), row('cua', 'click', true)])).description, 'takes clicks; ignores keys');
  assert.equal(classifyFamily(summarizeFamily([row('cua', 'key', true), row('cua', 'click', true)])).description, 'takes');
});

test('a matrix run is incomplete when a family failed structurally; refusals and ignored input are outcomes', () => {
  const identity = (family, targets = { field: true }, kindOf = 'editor') => ({ kind: 'matrix-identity', family, kindOf, targets });
  const refused = { kind: 'matrix-sample', family: 'gte', op: 'type_text', ok: false, effect: false };
  const ignored = { kind: 'matrix-sample', family: 'gte', op: 'key', ok: true, effect: false };
  assert.deepEqual(matrixOutcome([identity('gte'), refused, ignored], ['gte']), { complete: true, failed: [] });
  // an exception while opening, reading or requesting
  const error = { kind: 'matrix-error', family: 'qtcreator', error: 'Error: did not settle\n  at settle' };
  assert.deepEqual(matrixOutcome([identity('gte'), error], ['gte', 'qtcreator']), { complete: false, failed: ['qtcreator: Error: did not settle'] });
  // a family asked for that produced nothing
  assert.deepEqual(matrixOutcome([identity('gte')], ['gte', 'kate']), { complete: false, failed: ['kate: no identity recorded'] });
  // a family whose effect target was not found cannot judge its effects
  assert.deepEqual(matrixOutcome([identity('firefox', { field: false, button: true }, 'page')], ['firefox']), { complete: false, failed: ['firefox: its field was not found'] });
  // kinds read without accessibility objects (a terminal, pixels) need none
  assert.deepEqual(matrixOutcome([identity('xterm', {}, 'terminal'), identity('writer-gen', { document: false }, 'pixels')], ['xterm', 'writer-gen']), { complete: true, failed: [] });
});

test('partial cover: whether the click point is under the front window, and how much of the window stays visible', async () => {
  const { coverage } = await import('../../scripts/linux-engine-diff/clicks.mjs');
  const firefox = { x: 0, y: 19, width: 1280, height: 781 };
  const point = { x: 640, y: 220 };
  assert.deepEqual(coverage([2, 40, 1276, 797], firefox, point), { point_covered: true, visible_fraction: 0.03 });
  assert.deepEqual(coverage([542, 220, 196, 108], firefox, point), { point_covered: true, visible_fraction: 0.979 });
  assert.deepEqual(coverage([2, 490, 1276, 342], firefox, point), { point_covered: false, visible_fraction: 0.604 });
  assert.deepEqual(coverage([1300, 0, 100, 100], firefox, point), { point_covered: false, visible_fraction: 1 });
});

test('partial cover at another size: the sweep leaves each chosen fraction of the window visible, bottom and left', async () => {
  const { SWEEP, coverage, coversFor } = await import('../../scripts/linux-engine-diff/clicks.mjs');
  const window = { x: 1, y: 22, width: 800, height: 600 };
  const point = { x: 400, y: 220 };
  const covers = coversFor(window);
  assert.equal(covers.length, 2 + 2 * SWEEP.length);
  for (const v of SWEEP) {
    const bottom = covers.find((c) => c.name === `over the bottom ${Math.round((1 - v) * 100)}%`);
    const left = covers.find((c) => c.name === `over the left ${Math.round((1 - v) * 100)}%`);
    assert.ok(Math.abs(coverage(bottom.front, window, point).visible_fraction - v) < 0.01, `bottom ${v}`);
    assert.ok(Math.abs(coverage(left.front, window, point).visible_fraction - v) < 0.01, `left ${v}`);
    assert.equal(coverage(bottom.front, window, point).point_covered, false);
  }
  assert.equal(coverage(covers[0].front, window, point).visible_fraction, 0);
  assert.equal(coverage(covers.at(-1).front, window, point).visible_fraction, 1);
});

test("Acceptance 5 per family: cua's witness clean wherever a vendor build's is, and its audit clean wherever a vendor build's witness or audit is", async () => {
  const { backgroundAlone } = await import('../../scripts/linux-engine-diff/matrix-judge.mjs');
  const sample = (engine, witness, op = 'key') => ({ kind: 'matrix-sample', family: 'f', engine, op, ok: true, witness });
  const audit = (engine, clean, ok = true) => ({ kind: 'matrix-audit', family: 'f', engine, ok, clean, traced: true });
  const clean = [sample('pinned', true), sample('newest', true), sample('cua', true), sample('cua', true, 'click')];
  const audits = [audit('pinned', true), audit('newest', true), audit('cua', true)];
  assert.equal(backgroundAlone([...clean, ...audits], 'f').pass, true);
  // one cua sample whose witness changed
  const dirty = backgroundAlone([...clean, sample('cua', false, 'click'), ...audits], 'f');
  assert.equal(dirty.pass, false);
  assert.match(dirty.reasons.join(), /witness/);
  // cua's audit found a forbidden request, or did not run
  assert.match(backgroundAlone([...clean, audit('pinned', true), audit('newest', true), audit('cua', false)], 'f').reasons.join(), /audit/);
  assert.equal(backgroundAlone([...clean, audit('pinned', true), audit('newest', true)], 'f').pass, false);
  // a clean trace from an audit pass whose requests failed early exercised nothing (M1a branch review)
  const early = backgroundAlone([...clean, audit('pinned', true), audit('newest', true), audit('cua', true, false)], 'f');
  assert.equal(early.pass, false);
  assert.match(early.reasons.join(), /did not exercise/);
  // no vendor build kept either: nothing is required of cua
  const vendorsDirty = [sample('pinned', false), sample('newest', false), sample('cua', false), audit('pinned', false), audit('newest', false), audit('cua', false)];
  assert.equal(backgroundAlone(vendorsDirty, 'f').pass, true);
  // the redirect-less lane is exploration, not the shipped engine
  assert.equal(backgroundAlone([...clean, sample('cua:none', false), ...audits], 'f').pass, true);
  // a family with no cua sample at all cannot pass
  assert.equal(backgroundAlone([sample('pinned', true), ...audits], 'f').pass, false);
});

// task 53 (the design session's ruling, sminos 338; task 49's finding 6): the matrix judges a shared-mode refusal as a
// refusal, not as an audited request that failed: a refused request must send nothing, and then it exercised the
// audit. And a family of a kind the matrix has no reader for (the table scenes, the one-node Qt input scenes, the GTK 4
// and scale scenes, all the kinds experiment's) has no effect it was meant to read.
const REFUSAL = 'org.gnome.TextEditor does not accept background input; use a dedicated desktop or activate the window first';

test('a cua audit pass whose requests were refused in shared mode, and sent nothing, exercised the audit', async () => {
  const { backgroundAlone } = await import('../../scripts/linux-engine-diff/matrix-judge.mjs');
  const sample = (engine, op = 'key', extra = {}) => ({ kind: 'matrix-sample', family: 'gte', engine, op, ok: true, witness: true, ...extra });
  const audit = (engine, extra) => ({ kind: 'matrix-audit', family: 'gte', engine, ok: true, clean: true, traced: true, ...extra });
  const samples = [sample('pinned'), sample('newest'), sample('cua', 'key', { ok: false, error: REFUSAL }), sample('cua', 'click', { ok: false, error: REFUSAL })];
  const refusals = Array.from({ length: 4 }, () => ({ ok: false, error: REFUSAL, refused: true }));
  const refused = audit('cua', { ok: false, exercised: true, answers: refusals });
  assert.equal(backgroundAlone([...samples, audit('pinned'), audit('newest'), refused], 'gte').pass, true);
  // a refusal whose span sent something is not clean, and fails as a forbidden request
  const sent = backgroundAlone([...samples, audit('pinned'), audit('newest'), { ...refused, clean: false }], 'gte');
  assert.match(sent.reasons.join(), /forbidden/);
  // any other failure still exercised nothing
  const other = backgroundAlone([...samples, audit('pinned'), audit('newest'), audit('cua', { ok: false, exercised: false })], 'gte');
  assert.match(other.reasons.join(), /did not exercise/);
});

test("an audit pass's trace judged per answer: a refusal's span sends nothing at all, an answered request's nothing forbidden", async () => {
  const { auditAnswered, parseXtrace } = await import('../../scripts/linux-engine-diff/audit.mjs');
  const key = '000:<:0005: 44: Request(25): SendEvent propagate=false(0x00) destination=0x00600007 event-mask=0 KeyPress(2) keycode=0x35';
  const focus = '000:<:0006: 12: Request(42): SetInputFocus revert-to=PointerRoot(0x01) focus=0x00600007 time=CurrentTime(0x00000000)';
  const read = '000:<:0004:  4: Request(43): GetInputFocus ';
  const trace = parseXtrace([read, key, focus].join('\n'));
  const [r, k, f] = trace.requests.map((x) => x.at);
  const marks = (spans) => spans.flatMap(([from, to], i) => [{ tag: `request:${i}`, at: from }, { tag: `answered:${i}`, at: to }]);
  const end = f + 1000;
  // one request answered, its synthetic key in its span: clean; the same span answered by a refusal sent something
  assert.equal(auditAnswered(parseXtrace([read, key].join('\n')), marks([[r, end]]), [{ ok: true }]).clean, true);
  const refusedKey = auditAnswered(parseXtrace([read, key].join('\n')), marks([[r, end]]), [{ ok: false, refused: true }]);
  assert.equal(refusedKey.clean, false);
  assert.match(refusedKey.forbidden[0].what, /SendEvent with request 0's refusal/);
  // a refusal span with only reads is clean; a forbidden request is forbidden in any span, or outside every span
  assert.equal(auditAnswered(trace, marks([[r, k]]), [{ ok: false, refused: true }]).clean, false, 'the key outside the spans is judged as background input is, the focus request is forbidden');
  assert.deepEqual(auditAnswered(parseXtrace(read), marks([[r, end]]), [{ ok: false, refused: true }]).forbidden, []);
  assert.deepEqual(auditAnswered(trace, marks([[r, k], [k, end]]), [{ ok: false, refused: true }, { ok: true }]).forbidden.map((x) => x.what), ['SetInputFocus']);
  // missing marks, or none traced, are not clean
  assert.equal(auditAnswered(trace, [], [{ ok: true }]).clean, false);
  assert.equal(auditAnswered(parseXtrace(''), marks([[0, 1]]), [{ ok: true }]).clean, false);
});

test('a family of a kind the matrix reads no effect for is complete without its effects; a missing target still is not', () => {
  const identity = (family, kindOf, targets = {}) => ({ kind: 'matrix-identity', family, kindOf, targets });
  const unread = (family, op) => ({ kind: 'matrix-sample', family, engine: 'cua', op, ok: true, effect: null });
  assert.deepEqual(matrixOutcome([identity('gtk-table', 'table'), unread('gtk-table', 'key'), unread('gtk-table', 'click'), unread('gtk-table', 'type_text')], ['gtk-table']), { complete: true, failed: [] });
  assert.deepEqual(matrixOutcome([identity('qt5-input', 'qt-input'), unread('qt5-input', 'key')], ['qt5-input']), { complete: true, failed: [] });
  // a kind the matrix reads, its target missing (an editor read as one X11 node): incomplete, as before
  const missing = matrixOutcome([identity('qtcreator', 'editor', { field: false }), unread('qtcreator', 'key')], ['qtcreator']);
  assert.equal(missing.complete, false);
  assert.match(missing.failed.join(), /field was not found/);
  // the pixel reader reads keys only, as before
  assert.equal(matrixOutcome([identity('writer-gen', 'pixels'), unread('writer-gen', 'key')], ['writer-gen']).complete, false);
});

test('the matrix table counts refusals apart from failures', () => {
  const refused = { kind: 'matrix-sample', family: 'f', engine: 'cua', op: 'key', ok: false, error: REFUSAL, effect: null, witness: true };
  const failed = { kind: 'matrix-sample', family: 'f', engine: 'cua', op: 'key', ok: false, error: 'Window 5 is unavailable.', effect: null, witness: true };
  const s = summarizeFamily([refused, refused, failed]);
  assert.equal(s.key.cua.refused, 2);
  const md = renderMatrix([{ family: 'f', title: 'F', identity: {}, summary: s, run: 'r' }], { engines: ['cua'] }).join('\n');
  assert.match(md, /\?\/3 \(2 refused, 1 failed\)/);
});

test("the matrix's audit pass marks each request in its trace and judges it by its answer", async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../../scripts/linux-engine-diff/matrix.mjs', import.meta.url), 'utf8');
  const pass = source.slice(source.indexOf('async function auditPass'), source.indexOf('const targetsOf'));
  assert.match(pass, /await proxy\.mark\(`request:\$\{i\}`\);\n\s*const \{ response \} = await engine\.request\(command, input\);\n\s*await proxy\.mark\(`answered:\$\{i\}`\);/);
  assert.match(pass, /auditAnswered\(parseXtrace\(await proxy\.stop\(\)\), proxy\.marks, answers\)/);
  assert.match(pass, /exercised,/);
});
