// The Korean and Unicode matrix's plan (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification
// system part 6, Acceptance 4; run by ./unicode-run.mjs as the `unicode` section of a matrix run, `cell korean`).
//
// typeText and paste of each string into TextEdit's document, the Chrome page's textarea and the Electron fixture's
// field, under five conditions, in this order:
//   latin       the Latin source (ABC) selected, the field's scene in front
//   midSwitch   the Latin source, then `--probe input-source <Korean> --at` switching it during a long keyed typeText,
//               which must stop with inputSourceChanged and an entered count equal to the field's length, the field
//               holding exactly that much of the text
//   korean      the Korean source (2-Set) selected, the field's scene in front
//   composing   the Korean source, a Hangul composition in progress in the user window (the probe's ANSI r into another
//               scene's field, in front), the field's scene behind it; the user's field must keep its value through
//               every row (the focus probe's hash)
//   perContext  the per-context preference on, the driven scene holding the Korean source in its context (selected while
//               it was in front) and the user window in front under the Latin source: the case the Text rule routes to
//               paste; valid only when the readings show it held
// and one pressKey row, `r k`, under the Latin and the Korean source, which must enter `rk` under both. Every row is read
// back inside its cell and compared by SHA-256 with the expected string. A failed row with a named cause is declared in
// the expected file (EXPECTED_FILE), per row id and engine, never silently absorbed: a declaration no failed row needed
// is itself named (applyDeclarations' `unused`).
import * as fs from 'node:fs';
import {ABC, KOREAN_2SET} from './live-checks.mjs';
import {emptyField, fieldCheck} from './probe-plan.mjs';
import {TYPED} from './plan.mjs';

const j = JSON.stringify;
export {ABC, KOREAN_2SET};
export const UNICODE_STRINGS = Object.freeze([
  {id: 'latin', text: TYPED}, {id: 'hangul', text: '한글 테스트'}, {id: 'jamo', text: 'ㄱㄴㄷ'}, {id: 'mixed', text: '가나다 abc 123'},
  {id: 'emoji', text: '😀 이모지'}, {id: 'combining', text: 'é'}, {id: 'kanji', text: '日本語'}, {id: 'lines', text: '줄1\n줄2'},
  // Acceptance 4's string, read back in TextEdit's document under both sources.
  {id: 'acceptance4', text: '한글 테스트 😀'},
].map(Object.freeze));
export const UNICODE_FIELDS = Object.freeze(['textedit', 'chrome', 'electron']);
export const UNICODE_METHODS = Object.freeze(['typeText', 'paste']);
// The pressKey row: r then k, which Korean 2-Set would compose to 가 through the input method; a key name is a key.
export const PRESS_KEY = Object.freeze({id: 'rk', text: 'rk', keys: 'r k'});
// The mid-switch row's long keyed text, so the switch lands inside it.
export const MID_SWITCH = Object.freeze({id: 'long', text: Array.from({length: 24}, () => TYPED).join(' ')});
// The background conditions' user window per field: another scene's text field (TextEdit's own with Electron's).
export const UNICODE_USERS = Object.freeze({textedit: 'electron', chrome: 'textedit', electron: 'textedit'});
// The composition: the ANSI key r under Korean 2-Set, which the input method holds as ㄱ until committed.
export const COMPOSITION = Object.freeze({key: 'r', composed: 'ㄱ'});
export const CONDITIONS = Object.freeze(['latin', 'midSwitch', 'korean', 'composing', 'perContext']);
export const UNICODE_PLAN = Object.freeze({fields: UNICODE_FIELDS, conditions: CONDITIONS});
export const EXPECTED_FILE = new URL('./expected/unicode.json', import.meta.url);

// A row's id: `<field>/<condition>[@<user>]/<method>.<string>`.
export const unicodeRowId = ({field, condition, user = null, method, string}) => `${field}/${condition}${user ? `@${user}` : ''}/${method}.${string.id}`;

// A row's case (./matrix-cells.mjs caseCells): the field emptied and focused, one facade call sent under the key guard,
// the field read back by hash.
export function unicodeCase({field, method, string}) {
  const act = method === 'pressKey' ? `await __app.pressKey(${j(string.keys)});` : `await __app.${method}(${j(string.text)});`;
  return {method, case: string.id, expect: 'outcome', keys: method === 'pressKey' ? string.keys.split(' ') : [method],
    prepare: emptyField(field), act, check: fieldCheck(field, string.text)};
}

// Every row of `plan` ({fields, conditions}) in run order. -> [{condition, field, user, regime, method, string, id}].
export function unicodeRowsOf(plan) {
  const out = [];
  const add = (condition, field, method, string) => {
    const user = ['composing', 'perContext'].includes(condition) ? UNICODE_USERS[field] : null;
    out.push({condition, field, user, regime: user ? 'background' : 'frontmost', method, string, id: unicodeRowId({field, condition, user, method, string})});
  };
  for (const condition of CONDITIONS.filter(c => plan.conditions.includes(c))) {
    for (const field of UNICODE_FIELDS.filter(f => plan.fields.includes(f))) {
      if (condition === 'midSwitch') { add(condition, field, 'typeText', MID_SWITCH); continue; }
      for (const string of UNICODE_STRINGS) for (const method of UNICODE_METHODS) add(condition, field, method, string);
      if (condition === 'latin' || condition === 'korean') add(condition, field, 'pressKey', PRESS_KEY);
    }
  }
  return out;
}

// ---- the expected file --------------------------------------------------------------------------------------------------

// The declarations, each checked. -> [{id, engine, kind, cause}].
export function parseDeclarations(json) {
  const list = Array.isArray(json?.declarations) ? json.declarations : [];
  const seen = new Set();
  for (const d of list) {
    if (!(typeof d?.id === 'string' && ['vendor', 'cua'].includes(d.engine) && typeof d.kind === 'string' && d.kind && typeof d.cause === 'string' && d.cause)) {
      throw new Error(`${EXPECTED_FILE.pathname}: a declaration needs an id, an engine, a kind and a cause (${JSON.stringify(d).slice(0, 120)})`);
    }
    const key = `${d.id}\0${d.engine}`;
    if (seen.has(key)) throw new Error(`${EXPECTED_FILE.pathname}: ${d.id} on ${d.engine} is declared twice`);
    seen.add(key);
  }
  return list.map(({id, engine, kind, cause}) => ({id, engine, kind, cause}));
}
export const readDeclarations = (file = EXPECTED_FILE) => parseDeclarations(JSON.parse(fs.readFileSync(file, 'utf8')));

// The declarations applied to the Unicode rows, in place: a valid row that is not ok gets its engine's declaration.
// -> {unused: the declarations no row needed}.
export function applyDeclarations(rows, declarations) {
  const used = new Set();
  for (const row of rows) {
    if (row.section !== 'unicode' || row.invalid || row.ok) continue;
    const d = declarations.find(x => x.id === row.id && x.engine === row.engine);
    if (!d) continue;
    row.declared = {kind: d.kind, cause: d.cause};
    used.add(d);
  }
  return {unused: declarations.filter(d => !used.has(d))};
}
