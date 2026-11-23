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
//                 so cua refusing otherwise is cua acting differently), a not-judged row (./not-judged.mjs) or the
//                 pressKey row (ruling 1119: it composes as the input method composes, and a row that composes
//                 otherwise fails)
//   vendor        {answer: 'ok'}: the vendor's answer
//   cua           {answer: 'refused' | 'unconfirmed', sentence}: cua's answer, `sentence` a regular expression's source
//                 that cua's answer (the act's error, as the row keeps it) matches
//   decision      the Decision Log entry that made cua conservative there (date and title), listed beside the row under
//                 "What changes for a user"
// An entry of any other kind, or one that names no judged row, cites nothing or names no sentence, is itself a failure
// (departureProblems; the judge lists it as blocking) and applies to nothing.
//
// A cua sample is covered only with the observed pair (judged in ./cell-verdict.mjs, judgeCell): the vendor's sample of
// the same run has a verdict and answered ok (vendorAnsweredOk: its check passed and its act threw nothing), cua's
// answered as declared (answeredAs), and the row's own effect check and
// interference reading held on both sides. A declaration never supplies an answer nobody observed: a cua sample that
// answered as declared beside no vendor sample with a verdict has none either (unpaired), and one beside a vendor sample
// that did not answer ok is judged as it read. The effect readings a covered sample needs (the harness's to record,
// T10b′): `outcome.unchanged` true, the case's watched state read unchanged (a refusal took no effect); for an
// unconfirmed answer, that or `outcome.effect` true, the case's own check read its intended effect though the act
// threw (an unconfirmed answer may have acted, but never otherwise than asked).
import * as fs from 'node:fs';
import {cellsOf} from './manifest.mjs';
import {isPressKeyRow} from './unicode-plan.mjs';

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

const judgedCells = () => new Map(cellsOf().map(c => [`${c.section} ${c.id}`, c]));

// What is wrong with one entry. `judged`: the judged cells by key (`<section> <id>`). -> [sentence].
function entryProblems(entry, judged) {
  const name = rowName(entry), out = [];
  if (entry?.vendor?.answer !== 'ok' || !DEPARTURE_ANSWERS.includes(entry?.cua?.answer)) {
    out.push(`${name} is not the one declarable kind (R3): only cua refused or answered unconfirmed where the vendor answered ok may be declared (vendor ${entry?.vendor?.answer ?? 'unnamed'}, cua ${entry?.cua?.answer ?? 'unnamed'})`);
  }
  if (entry?.section === 'unicode' && isPressKeyRow(entry?.id)) out.push(`${name}: no pressKey row may be declared (ruling 1119): it composes as the active input method composes, and a row that composes otherwise fails`);
  else if (MEASURED.includes(entry?.section) || !judged.has(name)) out.push(`${name} names no judged row of the matrix (a method, launch, concurrent-use, intervention or judged Unicode row of the full manifest)`);
  else if (judged.get(name).expect === 'refusal') out.push(`${name} is a refusal case: the vendor's ok there is its refusal, and cua refusing otherwise is cua acting differently (R3)`);
  if (typeof entry?.cua?.sentence !== 'string' || !entry.cua.sentence) out.push(`${name} names no sentence for cua's answer`);
  else if (!compiles(entry.cua.sentence)) out.push(`${name}: its sentence is not a regular expression's source`);
  if (typeof entry?.decision !== 'string' || !entry.decision.trim()) out.push(`${name} cites no Decision Log entry`);
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

// What a row's act answered when it threw: the sentence its cell kept, or null.
const saidOf = row => row.outcome?.threw ?? row.outcome?.message ?? row.error ?? null;

// Whether the vendor's row answered ok: its own check passed and its act threw nothing (a row that passed by refusing,
// a refusal case's, did not answer ok).
export const vendorAnsweredOk = row => row.ok === true && row.expect !== 'refusal' && row.outcome?.refused !== true && !saidOf(row);

// Whether cua's row answered as the entry declares, and whether its own effect check read what that answer allows.
// -> {answered, effect}.
export function answeredAs(entry, row) {
  const said = saidOf(row);
  const answered = typeof said === 'string' && new RegExp(entry.cua.sentence).test(said);
  const unchanged = row.outcome?.unchanged === true, intended = row.outcome?.effect === true;
  const effect = entry.cua.answer === 'refused' ? unchanged && !intended : unchanged || intended;
  return {answered, effect};
}
