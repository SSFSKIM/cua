// The Korean and Unicode matrix's plan (scripts/native-matrix/unicode-plan.mjs; the spec's Verification system part 6,
// Acceptance 4): its strings, its rows in run order under each condition and the cases' acts and keys. It declares
// nothing: R3's declared-departures file (scripts/native-matrix/departures.mjs) is the matrix's one place.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sha256Hex} from '../../scripts/native-matrix/matrix-text.mjs';
import * as unicodePlan from '../../scripts/native-matrix/unicode-plan.mjs';
import {CONDITIONS, isPressKeyRow, NOT_JUDGED, UNICODE_FIELDS, UNICODE_STRINGS, UNICODE_USERS, unicodeCase, unicodeRowsOf, UNICODE_PLAN} from '../../scripts/native-matrix/unicode-plan.mjs';

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
  // The acceptance rows are named, not told by the string: Acceptance 4 is TextEdit's typeText under each source.
  assert.deepEqual(rows.filter(r => unicodePlan.isAcceptanceRow(r.id)).map(r => r.id), ['textedit/latin/typeText.acceptance4', 'textedit/korean/typeText.acceptance4']);
  for (const id of ['chrome/korean/typeText.acceptance4', 'textedit/korean/paste.acceptance4', 'textedit/composing@electron/typeText.acceptance4']) assert.ok(!unicodePlan.isAcceptanceRow(id), id);
  // Ruling 1144 is the fixed-string rows': the mid-switch row is judged by its measured prefix.
  assert.deepEqual(rows.filter(r => unicodePlan.isMidSwitchRow(r.id)).map(r => r.id), rows.filter(r => r.condition === 'midSwitch').map(r => r.id));
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

test('the Unicode plan declares nothing: its expected file is retired for R3\'s departures file, and pressKey stays undeclarable there', () => {
  for (const name of ['readDeclarations', 'parseDeclarations', 'applyDeclarations', 'EXPECTED_FILE']) assert.equal(unicodePlan[name], undefined, name);
  assert.ok(isPressKeyRow('chrome/korean/pressKey.rk') && isPressKeyRow('textedit/latin/pressKey.rk'));
  assert.ok(!isPressKeyRow('chrome/korean/typeText.hangul'));
});

// #185, ruling 1119: the per-context rows run and report, out of every verdict, with the ruling's cause.
test('the per-context rows still run, out of the judged matrix with ruling 1119\'s cause', () => {
  assert.deepEqual(Object.keys(NOT_JUDGED), ['perContext']);
  assert.match(NOT_JUDGED.perContext, /ruling 1119.*stored per-context preference does not show live behaviour.*focusing each window, which non-interference forbids/);
  assert.equal(unicodeRowsOf(UNICODE_PLAN).filter(r => r.condition === 'perContext').length, 3 * 9 * 2, 'they stay in the plan');
});
