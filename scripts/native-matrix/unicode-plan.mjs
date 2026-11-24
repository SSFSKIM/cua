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
//               paste; valid only when the readings show it held. Its rows run and are reported, out of every verdict
//               (NOT_JUDGED, ruling 1119)
// and one pressKey row, `r k`, under the Latin and the Korean source, which must enter `rk` under Latin and compose 가
// under Korean 2-Set engaged (PRESS_KEY, ruling 1119). Every row is read back inside its cell and compared by SHA-256
// with the expected string; a mismatch is a failed row. Nothing here declares a row: the matrix's one declaration
// mechanism is R3's declared-departures file (./departures.mjs), which may name a Unicode row only where cua refused or
// answered unconfirmed and the vendor answered ok, and never the pressKey row.
import {ABC, KOREAN_2SET} from './live-checks.mjs';
import {NOT_JUDGED} from './not-judged.mjs';
import {emptyField, fieldCheck} from './probe-plan.mjs';
import {sha256Hex} from './matrix-text.mjs';
import {TEXT_FIELDS, TYPED} from './plan.mjs';

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
// The pressKey row: r then k. pressKey sends physical keys, which the active input method composes (ruling 1119, #189):
// under the Latin source they enter rk, under Korean 2-Set engaged (its source and layout read after the refocus,
// ./unicode-run.mjs koreanIn) they compose 가. One row id under both; the text read back is the condition's. typeText
// keeps its exact-text contract: its rows expect the string sent under either source.
export const PRESS_KEY = Object.freeze({id: 'rk', keys: 'r k', expected: Object.freeze({latin: 'rk', korean: '가'})});
const pressKeyString = condition => Object.freeze({id: PRESS_KEY.id, keys: PRESS_KEY.keys, text: PRESS_KEY.expected[condition]});
// Whether a Unicode row id is the pressKey row's, which no departure may name (ruling 1119).
export const isPressKeyRow = id => typeof id === 'string' && id.endsWith(`/pressKey.${PRESS_KEY.id}`);
// Whether a Unicode row is the mid-switch's, judged by the prefix it measured (./unicode-run.mjs judgeMidSwitch), not
// by an absolute expected string: ruling 1144's shared failures are not its.
export const isMidSwitchRow = id => typeof id === 'string' && id.split('/')[1] === 'midSwitch';
// The conditions whose rows run and are reported but are out of every verdict (./not-judged.mjs).
export {NOT_JUDGED};
// The mid-switch row's long keyed text, so the switch lands inside it.
export const MID_SWITCH = Object.freeze({id: 'long', text: Array.from({length: 24}, () => TYPED).join(' ')});
// The engine's inputSourceChanged sentence (native/engine/Sources/Engine/Input.swift checkInputSource). The cell sees a
// plain Error (the REPL's boundary), so the stop is told by this sentence in its message, never by an error name.
export const INPUT_SOURCE_CHANGED = /The input source changed after (\d+) of (\d+) characters/;
// The background conditions' user window per field: another scene's text field (TextEdit's own with Electron's).
export const UNICODE_USERS = Object.freeze({textedit: 'electron', chrome: 'textedit', electron: 'textedit'});
// The composition: the ANSI key r under Korean 2-Set, which the input method holds as ㄱ until committed.
export const COMPOSITION = Object.freeze({key: 'r', composed: 'ㄱ'});
export const CONDITIONS = Object.freeze(['latin', 'midSwitch', 'korean', 'composing', 'perContext']);
export const UNICODE_PLAN = Object.freeze({fields: UNICODE_FIELDS, conditions: CONDITIONS});

// A row's id: `<field>/<condition>[@<user>]/<method>.<string>`.
export const unicodeRowId = ({field, condition, user = null, method, string}) => `${field}/${condition}${user ? `@${user}` : ''}/${method}.${string.id}`;

// The rows an acceptance item names, absolute: they land exactly on cua whatever the vendor does (S L239), so neither a
// declared departure nor a shared limit satisfies them. Acceptance 4: typeText of its string into TextEdit's document,
// under the Latin and the Korean source (the string's other rows, other fields and methods, are the matrix's own).
const ACCEPTANCE_4 = UNICODE_STRINGS.find(s => s.id === 'acceptance4');
export const ACCEPTANCE_ROWS = Object.freeze(['latin', 'korean'].map(condition => unicodeRowId({field: 'textedit', condition, method: 'typeText', string: ACCEPTANCE_4})));
export const isAcceptanceRow = id => ACCEPTANCE_ROWS.includes(id);

// A row's case (./matrix-cells.mjs caseCells): the field emptied and focused, one facade call sent under the key guard,
// the field read back by hash; the pressKey row's once it settles (settledFieldCheck).
export function unicodeCase({field, method, string}) {
  const act = method === 'pressKey' ? `await __app.pressKey(${j(string.keys)});` : `await __app.${method}(${j(string.text)});`;
  return {method, case: string.id, expect: 'outcome', keys: method === 'pressKey' ? string.keys.split(' ') : [method],
    prepare: emptyField(field), act, check: method === 'pressKey' ? settledFieldCheck(field, string.text) : fieldCheck(field, string.text)};
}

// The pressKey row's read-back (ruling 1197): a field's accessibility value can trail the input method composing its
// keys (pilot C-2's vendor read ㄱ for r k in Chrome and Electron, 가 in TextEdit), so the field is read until it holds the
// expected text or has read the same for SETTLE_STABLE_MS, never past SETTLE_CAP_MS after the first read, SETTLE_POLL_MS
// apart; the same cell on both lanes. The last reading is judged as ./probe-plan.mjs fieldCheck's one is, and the outcome
// adds how many reads it took (`reads`) and how long after the first the last was taken (`settleMs`).
export const SETTLE_STABLE_MS = 500;
export const SETTLE_CAP_MS = 2_000;
const SETTLE_POLL_MS = 100;
// The clock is monotonic and starts when the first read completes; no read starts once the cap has passed, and one that
// returns after it is not taken (`late`): the last value read inside the cap is judged.
const settledFieldCheck = (scene, expected) => `const __want = ${j(sha256Hex(expected))};
let __value = null, __from = null, __since = null, __last = null, __reads = 0, __late = false;
for (;;) {
  const ax = await observe();
  const __at = performance.now();
  // A read that returned after the cap is not taken: the last value read inside it is judged.
  if (__from !== null && __at - __from > ${SETTLE_CAP_MS}) { __late = true; break; }
  __last = __at; __from ??= __last; __reads++;
  const __index = ${TEXT_FIELDS[scene]};
  if (__index === null) return {invalid: "the field is not in the text"};
  const __now = plain(valueOfIndex(ax, __index) ?? "");
  if (__now !== __value) { __value = __now; __since = __last; }
  if (sha256Hex(__value) === __want || __last - __since >= ${SETTLE_STABLE_MS} || __last - __from >= ${SETTLE_CAP_MS}) break;
  await new Promise(done => setTimeout(done, ${SETTLE_POLL_MS}));
  if (performance.now() - __from >= ${SETTLE_CAP_MS}) break;
}
const __hash = sha256Hex(__value);
const exact = __hash === __want;
return {ok: exact, outcome: {exact, nfcEqual: __value.normalize("NFC") === ${j(expected.normalize('NFC'))}, length: __value.length, expectedLength: ${expected.length}, hash: __hash, reads: __reads, settleMs: Math.round(__last - __from), ...(__late ? {late: true} : {})}};`;

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
      if (condition === 'latin' || condition === 'korean') add(condition, field, 'pressKey', pressKeyString(condition));
    }
  }
  return out;
}
