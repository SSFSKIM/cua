// The mid-switch rows of results already recorded, judged again offline (docs/doperpowers/specs/2026-10-18-own-native-
// engine-design.md, Verification system part 6; the live rule in ./unicode-run.mjs midSwitchAttempt). Rows recorded
// before the run kept the engine's message were judged by an error name the REPL never carries (a cell sees a plain
// Error), so every stop read as `stopped: false`. A row that kept its message is judged by the live rule; one that did
// not is judged from the fields it kept, and says so (`basis`): it threw (an error name is set only on a throw), the
// engine reported an entered count short of the text, and the field held exactly that much of it. Nothing else of the
// row changes; a row invalid when recorded stays invalid.
//
//   node scripts/native-matrix/rejudge-midswitch.mjs <result.json>...   one JSON line per mid-switch row
import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {INPUT_SOURCE_CHANGED, MID_SWITCH} from './unicode-plan.mjs';

// -> {id, engine, sample, ok, stopped, basis, recordedOk} or {id, engine, sample, invalid}.
export function rejudgeMidSwitch(row) {
  const head = {id: row.id, engine: row.engine, sample: row.sample};
  if (row.invalid) return {...head, invalid: row.invalid};
  const o = row.outcome ?? {};
  const kept = typeof o.message === 'string';
  const stopped = kept ? INPUT_SOURCE_CHANGED.test(o.message)
    : o.errorName != null && Number.isInteger(o.entered) && o.entered < MID_SWITCH.text.length;
  return {...head, ok: stopped && o.exact === true, stopped, entered: o.entered ?? null, length: o.length ?? null, exact: o.exact === true,
    basis: kept ? 'the engine\'s message' : 'the recorded fields (no message kept): a throw, an entered count short of the text', recordedOk: row.ok === true};
}

export const midSwitchRows = result => (result.rows ?? []).filter(r => r.section === 'unicode' && r.condition === 'midSwitch');

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  for (const file of process.argv.slice(2)) {
    for (const row of midSwitchRows(JSON.parse(fs.readFileSync(file, 'utf8')))) process.stdout.write(`${JSON.stringify({file, ...rejudgeMidSwitch(row)})}\n`);
  }
}
