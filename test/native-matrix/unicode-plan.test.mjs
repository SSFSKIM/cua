// The Korean and Unicode matrix's plan (scripts/native-matrix/unicode-plan.mjs; the spec's Verification system part 6,
// Acceptance 4): its strings, its rows in run order under each condition, the cases' acts and keys, and the expected
// file's declarations applied to failed rows only, never silently.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sha256Hex} from '../../scripts/native-matrix/matrix-text.mjs';
import {applyDeclarations, CONDITIONS, NOT_JUDGED, parseDeclarations, readDeclarations, UNICODE_FIELDS, UNICODE_STRINGS, UNICODE_USERS, unicodeCase, unicodeRowsOf, UNICODE_PLAN} from '../../scripts/native-matrix/unicode-plan.mjs';

test('the strings are part 6\'s eight and Acceptance 4\'s, the combining one as e plus U+0301 and the lines one with a real newline', () => {
  assert.deepEqual(UNICODE_STRINGS.map(s => s.text), ['The quick brown fox jumps over the lazy dog.', '한글 테스트', 'ㄱㄴㄷ', '가나다 abc 123', '😀 이모지', 'é', '日本語',
    '줄1\n줄2', '한글 테스트 😀']);
  assert.equal(new Set(UNICODE_STRINGS.map(s => s.id)).size, UNICODE_STRINGS.length);
  assert.deepEqual(UNICODE_FIELDS, ['textedit', 'chrome', 'electron']);
  // The user window of each field's background conditions is another scene's text field, never the field's own process.
  for (const field of UNICODE_FIELDS) assert.ok(UNICODE_FIELDS.includes(UNICODE_USERS[field]) && UNICODE_USERS[field] !== field);
});

test('the rows in run order: Latin, the mid-switch, Korean, a composition in the user window, the per-context preference', () => {
  const rows = unicodeRowsOf(UNICODE_PLAN);
  assert.deepEqual([...new Set(rows.map(r => r.condition))], CONDITIONS);
  const per = condition => rows.filter(r => r.condition === condition).length;
  assert.equal(per('latin'), 3 * (9 * 2 + 1), 'typeText and paste of every string, and the pressKey row, per field');
  assert.equal(per('korean'), 3 * (9 * 2 + 1));
  assert.equal(per('midSwitch'), 3);
  assert.equal(per('composing'), 3 * 9 * 2);
  assert.equal(per('perContext'), 3 * 9 * 2);
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length, 'ids are unique');
  assert.ok(rows.some(r => r.id === 'textedit/latin/typeText.acceptance4') && rows.some(r => r.id === 'textedit/korean/typeText.acceptance4'), 'Acceptance 4\'s two rows');
  assert.ok(rows.some(r => r.id === 'chrome/composing@textedit/paste.hangul'));
  assert.ok(rows.some(r => r.id === 'electron/korean/pressKey.rk'));
  assert.ok(rows.some(r => r.id === 'textedit/midSwitch/typeText.long'));
  assert.ok(rows.filter(r => ['composing', 'perContext'].includes(r.condition)).every(r => r.regime === 'background' && r.user === UNICODE_USERS[r.field]));
  assert.ok(rows.filter(r => ['latin', 'korean', 'midSwitch'].includes(r.condition)).every(r => r.regime === 'frontmost' && !r.user));
  // --scene narrows to one field.
  const one = unicodeRowsOf({...UNICODE_PLAN, fields: ['textedit']});
  assert.equal(one.length, 19 + 1 + 19 + 18 + 18);
  assert.ok(one.every(r => r.field === 'textedit'));
});

test('a row\'s case: one facade call under the key guard, its read-back by hash against the expected string', () => {
  const hangul = unicodeCase({field: 'chrome', method: 'typeText', string: UNICODE_STRINGS[1]});
  assert.deepEqual([hangul.method, hangul.case, hangul.expect, hangul.keys], ['typeText', 'hangul', 'outcome', ['typeText']]);
  assert.equal(hangul.act, 'await __app.typeText("한글 테스트");');
  assert.match(hangul.check, /sha256Hex/);
  assert.match(hangul.prepare, /Scene notes/);
  const paste = unicodeCase({field: 'electron', method: 'paste', string: UNICODE_STRINGS[7]});
  assert.equal(paste.act, 'await __app.paste("줄1\\n줄2");');
  assert.deepEqual(paste.keys, ['paste']);
  const keys = unicodeCase({field: 'textedit', method: 'pressKey', string: {id: 'rk', text: 'rk', keys: 'r k'}});
  assert.equal(keys.act, 'await __app.pressKey("r k");');
  assert.deepEqual(keys.keys, ['r', 'k']);
});

// #189, ruling 1119: pressKey sends physical keys, which the active input method composes; typeText keeps its exact text.
test('the pressKey row r k expects rk under the Latin source and 가 under engaged Korean 2-Set, in all three fields', () => {
  const rows = unicodeRowsOf(UNICODE_PLAN);
  const keyed = rows.filter(r => r.method === 'pressKey');
  assert.deepEqual(keyed.map(r => [r.id, r.string.text]), [...UNICODE_FIELDS.map(f => [`${f}/latin/pressKey.rk`, 'rk']), ...UNICODE_FIELDS.map(f => [`${f}/korean/pressKey.rk`, '가'])]);
  for (const r of keyed) {
    const c = unicodeCase(r);
    assert.equal(c.act, 'await __app.pressKey("r k");', r.id);
    assert.ok(c.check.includes(JSON.stringify(sha256Hex(r.string.text))), `${r.id} reads back ${r.string.text}`);
  }
  // typeText and paste send the same exact text under either source.
  for (const condition of ['latin', 'korean']) {
    assert.deepEqual(rows.filter(r => r.condition === condition && r.method !== 'pressKey' && r.field === 'chrome').map(r => r.string.text),
      UNICODE_STRINGS.flatMap(s => [s.text, s.text]), condition);
  }
});

test('the expected file: a declaration excuses a failed valid row of its engine only, and one nothing needed is named', () => {
  const declarations = [{id: 'chrome/latin/typeText.combining', engine: 'cua', kind: 'normalization', cause: 'the page composes e and U+0301 into é'},
    {id: 'textedit/latin/typeText.latin', engine: 'vendor', kind: 'x', cause: 'not needed'}];
  const rows = [
    {section: 'unicode', id: 'chrome/latin/typeText.combining', engine: 'cua', ok: false},
    {section: 'unicode', id: 'chrome/latin/typeText.combining', engine: 'vendor', ok: false},
    {section: 'unicode', id: 'textedit/latin/typeText.latin', engine: 'vendor', ok: true},
    {section: 'unicode', id: 'chrome/latin/typeText.combining', engine: 'cua', ok: false, invalid: 'not prepared', sample: 2},
  ];
  const {unused} = applyDeclarations(rows, declarations);
  assert.deepEqual(rows[0].declared, {kind: 'normalization', cause: 'the page composes e and U+0301 into é'});
  assert.equal(rows[1].declared, undefined, 'another engine\'s row');
  assert.equal(rows[2].declared, undefined, 'a passing row needs none');
  assert.equal(rows[3].declared, undefined, 'an invalid row is never declared');
  assert.deepEqual(unused.map(d => d.id), ['textedit/latin/typeText.latin']);
  for (const d of readDeclarations()) assert.ok(d.id && ['vendor', 'cua'].includes(d.engine) && d.kind && d.cause, JSON.stringify(d));
  assert.throws(() => parseDeclarations({declarations: [{id: 'x'}]}), /needs an id, an engine, a kind and a cause/);
  assert.throws(() => parseDeclarations({declarations: [declarations[0], declarations[0]]}), /twice/);
  // A pressKey row that composes otherwise fails and cannot be declared (ruling 1119), on either engine.
  for (const engine of ['vendor', 'cua']) {
    assert.throws(() => parseDeclarations({declarations: [{id: 'chrome/korean/pressKey.rk', engine, kind: 'composition', cause: 'composes otherwise'}]}),
      /chrome\/korean\/pressKey\.rk cannot be declared: .*ruling 1119/);
  }
});

// #185, ruling 1119: the per-context rows run and report, out of every verdict, with the ruling's cause.
test('the per-context rows still run, out of the judged matrix with ruling 1119\'s cause, and are never declared', () => {
  assert.deepEqual(Object.keys(NOT_JUDGED), ['perContext']);
  assert.match(NOT_JUDGED.perContext, /ruling 1119.*stored per-context preference does not show live behaviour.*focusing each window, which non-interference forbids/);
  assert.equal(unicodeRowsOf(UNICODE_PLAN).filter(r => r.condition === 'perContext').length, 3 * 9 * 2, 'they stay in the plan');
  const id = 'chrome/perContext@textedit/typeText.hangul';
  const rows = [{section: 'unicode', id, engine: 'cua', ok: false, excluded: NOT_JUDGED.perContext}];
  const {unused} = applyDeclarations(rows, [{id, engine: 'cua', kind: 'x', cause: 'y'}]);
  assert.equal(rows[0].declared, undefined);
  assert.deepEqual(unused.map(d => d.id), [id]);
});
