// The Korean and Unicode matrix's plan (scripts/native-matrix/unicode-plan.mjs; the spec's Verification system part 6,
// Acceptance 4): its strings, its rows in run order under each condition, the cases' acts and keys, and the expected
// file's declarations applied to failed rows only, never silently.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyDeclarations, CONDITIONS, parseDeclarations, readDeclarations, UNICODE_FIELDS, UNICODE_STRINGS, UNICODE_USERS, unicodeCase, unicodeRowsOf, UNICODE_PLAN} from '../../scripts/native-matrix/unicode-plan.mjs';

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
});
