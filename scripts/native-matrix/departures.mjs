// The native matrix's declared departures (R3 as ruled, 1108; the M4/M5 pre-flight's §7, "The judge's rule for a row
// that differs from the vendor's"): the one place a judged row of the matrix may differ from the vendor's and not fail.
// It holds one kind of entry only: cua refused, or answered unconfirmed, where the vendor answered ok. The judge
// (./summary.mjs) applies it; no run stamps it on a row, and a declaration carried on a full run's row excuses nothing.
// It replaced the Unicode matrix's expected file of named causes, so the matrix has one declaration mechanism. (Other
// cells keep their own harness's: the settle cell's from the native-mac suite's expected file, the residue cells'
// vendor defects. The oracle's owner-accepted families, `interference.declared`, are the owner's acceptances.)
//
// The file (DEPARTURES_FILE, `{about, departures: [Entry]}`). Entry:
//   section, id   the row: a judged row of the full matrix's manifest (./manifest.mjs), never a speed or finding row
//                 (measures, not answers), a method case that expects a refusal (the vendor's ok there is its refusal,
//                 so cua refusing otherwise is cua acting differently), a not-judged row (./not-judged.mjs), an
//                 acceptance row (absolute: Acceptance 4's text lands exactly whatever the vendor does, S L239) or the
//                 pressKey row (ruling 1119: it composes as the input method composes, and a row that composes
//                 otherwise fails), a caret row (#258, #259, ./caret.mjs: the pre-flight's §6, neither difference
//                 can be declared) or a pointerdown row (ruling 1168, #534: a press that reaches no pointer handler
//                 where the vendor's does is fixed)
//   vendor        {answer: 'ok'}: the vendor's answer
//   cua           {answer: 'refused' | 'unconfirmed', errorName, sentence}: cua's answer. `errorName` the engine's name
//                 for it, which must be one of that kind's (./answers.mjs REFUSAL_NAMES, UNCONFIRMED_NAMES: the kind is
//                 checked, never taken from the claim); `sentence` a regular expression's source that the answer's
//                 sentence matches, specific to the case (one that matches nothing in particular, `.*`, an alternation
//                 of short words, is refused)
//   decision      the Decision Log entry that made cua conservative there (date and title), listed beside the row under
//                 "What changes for a user"
//   capability    optional: what the vendor does there, in a few words ("made the selection"), the known capability
//                 difference the report states with what the runs measured (./summary.mjs departureMeasured)
// An entry of any other kind, or one that names no judged row, cites nothing or names no sentence, is itself a failure
// (departureProblems; the judge lists it as blocking) and applies to nothing.
//
// A cua sample is covered only with the observed pair (judged in ./cell-verdict.mjs, judgeCell): the vendor's sample of
// the same run has a verdict and answered ok (vendorAnsweredOk: its check passed and its act threw nothing), cua's act
// threw the declared error, recorded under its engine name (answeredAs; the harness records `outcome.errorName`), with
// the declared sentence, and the row's own effect check and
// interference reading held on both sides. A declaration never supplies an answer nobody observed: a cua sample that
// answered as declared beside no vendor sample with a verdict has none either (unpaired), and one beside a vendor sample
// that did not answer ok is judged as it read. The effect readings a covered sample needs (the harness's to record,
// T10b′): `outcome.unchanged` true, the case's watched state read unchanged (a refusal took no effect); for an
// unconfirmed answer, that or `outcome.effect` true, the case's own check read its intended effect though the act
// threw (an unconfirmed answer may have acted, but never otherwise than asked).
import * as fs from 'node:fs';
import {answerOf, conservativeEffect, kindOfName} from './answers.mjs';
import {cellsOf} from './manifest.mjs';
import {isCaretRow, isPointerdownRow} from './plan.mjs';
import {isAcceptanceRow, isPressKeyRow} from './unicode-plan.mjs';

export const DEPARTURES_FILE = new URL('./expected/departures.json', import.meta.url);
export const DEPARTURE_ANSWERS = Object.freeze(['refused', 'unconfirmed']);
const MEASURED = ['speed', 'finding'];

// The file's entries, unchecked (departureProblems checks them). -> [Entry].
export function readDepartures(file = DEPARTURES_FILE) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(json?.departures)) throw new Error(`${file.pathname ?? file}: no departures list`);
  return json.departures;
}

const rowName = entry => `${entry?.section} ${entry?.id}`;
const compiles = source => { try { new RegExp(source); return true; } catch { return false; } };
// The longest run of literal characters in a pattern's source (escapes, classes and operators breaking it).
const literalRun = source => Math.max(0, ...source.replace(/\\./g, '\0').replace(/\[(?:\\.|[^\]])*\]/g, '\0').replace(/[.*+?^${}()|]/g, '\0').split('\0').map(p => p.length));
export const SENTENCE_LITERAL = 10;
const tooBroad = source => new RegExp(source).test('') || literalRun(source) < SENTENCE_LITERAL;

const judgedCells = () => new Map(cellsOf().map(c => [`${c.section} ${c.id}`, c]));

// What is wrong with one entry. `judged`: the judged cells by key (`<section> <id>`). -> [sentence].
function entryProblems(entry, judged) {
  const name = rowName(entry), out = [];
  if (entry?.vendor?.answer !== 'ok' || !DEPARTURE_ANSWERS.includes(entry?.cua?.answer)) {
    out.push(`${name} is not the one declarable kind (R3): only cua refused or answered unconfirmed where the vendor answered ok may be declared (vendor ${entry?.vendor?.answer ?? 'unnamed'}, cua ${entry?.cua?.answer ?? 'unnamed'})`);
  }
  const errorName = entry?.cua?.errorName;
  if (DEPARTURE_ANSWERS.includes(entry?.cua?.answer)) {
    if (typeof errorName !== 'string' || !errorName) out.push(`${name} names no error name for cua's answer (the engine's, which decides its kind)`);
    else if (kindOfName(errorName) !== entry.cua.answer) out.push(`${name}: ${errorName} is not one of cua's ${entry.cua.answer} answers (./answers.mjs)`);
  }
  if (isAcceptanceRow(entry?.id)) out.push(`${name} is an acceptance row: it must pass on cua whatever the vendor does (S L239), so no departure covers it`);
  if (entry?.section === 'method' && isCaretRow(entry?.id)) out.push(`${name} cannot be declared: a caret row (#258, #259) differing from the vendor's is cua acting otherwise than the vendor, which is fixed, never declared (R3; the M4/M5 pre-flight's §6)`);
  if (entry?.section === 'method' && isPointerdownRow(entry?.id)) out.push(`${name} cannot be declared: the pointerdown cell (ruling 1168, #534) differing from the vendor's is a web control's pointer handler cua's press misses, which is fixed, never declared (R3)`);
  if (entry?.section === 'unicode' && isPressKeyRow(entry?.id)) out.push(`${name}: no pressKey row may be declared (ruling 1119): it composes as the active input method composes, and a row that composes otherwise fails`);
  else if (MEASURED.includes(entry?.section) || !judged.has(name)) out.push(`${name} names no judged row of the matrix (a method, launch, concurrent-use, intervention or judged Unicode row of the full manifest)`);
  else if (judged.get(name).expect === 'refusal') out.push(`${name} is a refusal case: the vendor's ok there is its refusal, and cua refusing otherwise is cua acting differently (R3)`);
  if (typeof entry?.cua?.sentence !== 'string' || !entry.cua.sentence) out.push(`${name} names no sentence for cua's answer`);
  else if (!compiles(entry.cua.sentence)) out.push(`${name}: its sentence is not a regular expression's source`);
  else if (tooBroad(entry.cua.sentence)) out.push(`${name}: its sentence is too broad: it must match the case's own answer, with at least ${SENTENCE_LITERAL} literal characters in a row and never the empty string`);
  if (typeof entry?.decision !== 'string' || !entry.decision.trim()) out.push(`${name} cites no Decision Log entry`);
  if (entry?.capability !== undefined && (typeof entry.capability !== 'string' || !entry.capability.trim())) out.push(`${name}: its capability, when given, says what the vendor does there in a few words`);
  return out;
}

// Every entry's problems, and an entry declared twice. -> [sentence]; empty when every entry is of the one kind.
export function departureProblems(list, judged = judgedCells()) {
  const out = list.flatMap(entry => entryProblems(entry, judged));
  const names = list.map(rowName);
  for (const name of new Set(names.filter((n, i) => names.indexOf(n) !== i))) out.push(`${name} is declared twice`);
  return out;
}

// The entries the judge applies: those with no problem of their own (a row declared twice applies neither). -> [Entry].
export function usableDepartures(list, judged = judgedCells()) {
  const names = list.map(rowName);
  return list.filter((entry, i) => entryProblems(entry, judged).length === 0 && names.indexOf(names[i]) === names.lastIndexOf(names[i]));
}

// Ruling 1240: an accepted speed miss, the owner's decision on a timing that missed the 10% beat (the file's
// `acceptedMisses`, beside the departures: {section: 'speed', id, ticket, ruling}). The op stays judged and shown with
// its numbers; a miss it covers reads `accepted-miss`, blocks nothing and is no owner's fork (./summary.mjs). An entry
// that names no speed row of the full manifest, cites no ticket (#n) or no ruling, or is given twice applies to nothing
// and is itself blocking (acceptedMissProblems). -> [Entry].
export function readAcceptedMisses(file = DEPARTURES_FILE) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (json.acceptedMisses !== undefined && !Array.isArray(json.acceptedMisses)) throw new Error(`${file.pathname ?? file}: acceptedMisses is not a list`);
  return json.acceptedMisses ?? [];
}
function acceptedMissOwn(entry, judged) {
  const name = rowName(entry), out = [];
  if (entry?.section !== 'speed' || !judged.has(name)) out.push(`${name} names no speed row of the matrix`);
  if (typeof entry?.ticket !== 'string' || !/^#\d+$/.test(entry.ticket)) out.push(`${name} cites no ticket (#n)`);
  if (typeof entry?.ruling !== 'string' || !/^\d+$/.test(entry.ruling)) out.push(`${name} cites no ruling`);
  if (entry?.bound !== undefined && !boundWellFormed(entry.bound)) out.push(`${name}'s bound names no ruling, evidence, n, or cua and vendor median and p95 above 0`);
  return out;
}
const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
const boundWellFormed = b => Boolean(b) && typeof b.ruling === 'string' && /^\d+$/.test(b.ruling) && typeof b.evidence === 'string' && b.evidence.length > 0
  && Number.isSafeInteger(b.n) && b.n > 0 && ['cua', 'vendor'].every(k => positive(b[k]?.median) && positive(b[k]?.p95));
// Ruling 1278: an accepted miss whose entry carries a `bound` (the re-measurement it was accepted at: {ruling, evidence,
// n, cua: {median, p95}, vendor: {median, p95}}) holds on a re-measurement only while that re-measurement is no worse
// than the bound: cua's median and p95 each, as a ratio to the vendor's of the same samples, at most the bound's ratio.
// The ratio, not cua's own milliseconds, since a sitting's vendor is slower or faster with its runner. A miss not
// re-measured is not held to the bound (its n = 3 says nothing against an n = 30). -> null when the acceptance holds,
// else {ratios: {median, p95}, bound: {median, p95}, evidence, ruling} saying where it is worse.
export function acceptanceExceeded(entry, s) {
  const b = entry?.bound;
  if (!b || !s?.remeasured || !s.cua || !s.vendor) return null;
  const ratio = (cua, vendor) => (positive(cua) && positive(vendor) ? cua / vendor : null);
  const ratios = {median: ratio(s.cua.median, s.vendor.median), p95: ratio(s.cua.p95, s.vendor.p95)};
  const bound = {median: b.cua.median / b.vendor.median, p95: b.cua.p95 / b.vendor.p95};
  const worse = ['median', 'p95'].filter(k => ratios[k] === null || ratios[k] > bound[k]);
  return worse.length ? {worse, ratios, bound, evidence: b.evidence, ruling: b.ruling} : null;
}
// -> [sentence].
export function acceptedMissProblems(list, judged = judgedCells()) {
  const out = list.flatMap(entry => acceptedMissOwn(entry, judged)), names = list.map(rowName);
  for (const name of new Set(names.filter((n, i) => names.indexOf(n) !== i))) out.push(`${name} is accepted twice`);
  return out;
}
// The entries the judge applies. -> [Entry].
export function usableAcceptedMisses(list, judged = judgedCells()) {
  const names = list.map(rowName);
  return list.filter((entry, i) => acceptedMissOwn(entry, judged).length === 0 && names.indexOf(names[i]) === names.lastIndexOf(names[i]));
}

// Whether the vendor's row answered ok: its own check passed and its act threw nothing (a row that passed by refusing,
// a refusal case's, did not answer ok).
export const vendorAnsweredOk = row => row.ok === true && row.expect !== 'refusal' && answerOf(row).kind === 'ok';

// Whether cua's row answered as the entry declares (its recorded error name the entry's, of the entry's kind, and its
// sentence matching), and whether its own effect check read what that answer allows. -> {answered, effect}.
export function answeredAs(entry, row) {
  const said = answerOf(row);
  const answered = said.kind === entry.cua.answer && said.name === entry.cua.errorName && typeof said.sentence === 'string' && new RegExp(entry.cua.sentence).test(said.sentence);
  return {answered, effect: conservativeEffect(entry.cua.answer, row)};
}
