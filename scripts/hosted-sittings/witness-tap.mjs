// R3's witness tap, readied for sitting C's matrix runs (ruling 1225; ../native-matrix/witness.mjs): before the first
// run, the key-route tap app built and ad-hoc signed (../native-matrix/key-route-device.mjs buildTapApp) and Input
// Monitoring granted to it alone through the hosted kit's one TCC writer under O0 (./tcc.mjs grantDiagnosticListen,
// ruling 1198's path widened from the key-route step); neither engine gets a grant, and the engines' rows are read
// before and after. On a GitHub-hosted runner only, refused before anything is read, built or granted.
// The record (`out`): {ruling, tap: {app, bundleId, grant} | {error}, tcc: {engines}, cleanup: {ok, failures}}. A tap not
// built or granted is recorded and the matrix still runs: its witness then never starts, and its R3 cells stay NO
// VERDICT. Exit 1 only when the engines' rows changed or could not be read; unread before, nothing is built or granted.
import {buildTapApp} from '../native-matrix/key-route-device.mjs';
import {assertGithubHosted} from './runner.mjs';
import {engineRows, grantDiagnosticListen, rowsChanged} from './tcc.mjs';

const message = error => String(error?.message ?? error).split('\n')[0].slice(0, 300);

// options: {out}. io: {env, platform, engineRows(), buildTap(), grantTap(app), write(path, text)}. -> exit code.
export function runWitnessTap({out}, io) {
  assertGithubHosted(io.env, io.platform, 'R3\'s witness tap');
  const report = {ruling: 1225, tap: null, tcc: {engines: null}, cleanup: null};
  const failures = [];
  let before = null;
  try { before = io.engineRows(); } catch (error) { failures.push(`the engines' TCC rows could not be read before the grant (${message(error)}): unchanged is unproven`); }
  // No grant whose effect on the engines' rows could not be shown (fix wave M5).
  if (!before) report.tap = {error: 'not granted: the engines\' TCC rows could not be read before it'};
  else {
    try {
      report.tap = io.buildTap();
      report.tap.grant = io.grantTap(report.tap.app);
    } catch (error) { report.tap = {...(report.tap ?? {}), error: message(error)}; }
  }
  if (before) {
    try {
      const changed = rowsChanged(before, io.engineRows()), grant = changed?.grant;
      report.tcc.engines = {unchanged: !grant, rows: before.rows.length, bookkeepingColumns: before.bookkeeping, ...(grant ?? {}),
        ...(changed?.bookkeeping ? {bookkeeping: changed.bookkeeping} : {})};
      if (grant) {
        failures.push(`the engines' TCC rows changed around the witness tap's grant: ${[grant.added.length && `added ${grant.added.join(', ')}`, grant.removed.length && `removed ${grant.removed.join(', ')}`,
          grant.columns && `the access table's columns ${grant.columns.before.join(', ')} became ${grant.columns.after.join(', ')}`].filter(Boolean).join('; ')}`);
      }
    } catch (error) { failures.push(`the engines' TCC rows could not be read after the grant (${message(error)}): unchanged is unproven`); }
  }
  report.cleanup = {ok: failures.length === 0, failures};
  io.write(out, `${JSON.stringify(report, null, 2)}\n`);
  return failures.length ? 1 : 0;
}

// What the sitting's check says of the record: INFO, the tap ready or why not. -> string.
export function witnessTapSummary(report) {
  const why = report?.tap?.error ?? (report?.tap?.grant?.granted === true ? null : 'its Input Monitoring grant not read back');
  return why === null ? 'R3\'s witness tap built and granted Input Monitoring (ruling 1225)' : `R3's witness tap not ready (${why}): its cells stay NO VERDICT (ruling 1225)`;
}

// The default io: this runner's TCC store, the tap built here.
export const witnessTapIo = ({write}) => ({env: process.env, platform: process.platform, engineRows: () => engineRows(), buildTap: () => buildTapApp(),
  grantTap: app => grantDiagnosticListen({bundle: app}), write});
