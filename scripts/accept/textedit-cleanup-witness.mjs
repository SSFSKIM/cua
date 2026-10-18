#!/usr/bin/env node
// A witness of the TextEdit fixture's launch and cleanup path (#157) without cua: the same `open -a TextEdit <file>`
// textedit.mjs makes, and the same cleanUpFixtureApp, on the Mac it runs on (the mini, through ssh, inside a hold).
// It types nothing, sends no key and binds no app; it only opens files in TextEdit and signals pids it proved its own.
//
//   node scripts/accept/textedit-cleanup-witness.mjs [--out <file.json>]
//
// It refuses to start while any TextEdit runs (the owner's would be in its way). Then:
//   A  the run starts TextEdit: the cleanup quits that pid and hands the front back;
//   B  a TextEdit runs before the run (started here with a plain `open -a TextEdit <file>`, the front then handed back):
//      the run's document goes to it, the cleanup quits nothing and that TextEdit survives; the front is handed back.
//      The witness then quits the TextEdit it started for B (its own pid, launched after the witness began).
// At the end no TextEdit runs and the application frontmost at the start is frontmost again. Exit 0 only when every
// check holds. Only bundle ids, pids and counts are reported.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {cleanUpFixtureApp, launchOf, ownedLaunches, pidsOf, quitOwned, restoreFront} from './fixture-app.mjs';
import {localFrontmost} from './key-guard.mjs';
import {TEXTEDIT_BUNDLE} from './lib.mjs';

const {values} = parseArgs({options: {out: {type: 'string'}}});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const textEdits = () => pidsOf('TextEdit');
const checks = [];
const check = (name, ok, detail) => { checks.push({name, status: ok ? 'PASS' : 'FAIL', detail}); return ok; };
const dir = mkdtempSync(join(tmpdir(), 'cua-157-witness-'));
const file = name => { const path = join(dir, name); writeFileSync(path, '', {mode: 0o600, flag: 'wx'}); return path; };
const open = path => execFileSync('/usr/bin/open', ['-a', 'TextEdit', path]);
const waitFor = async (predicate, ms = 10_000) => { for (let t = 0; t < ms && !predicate(); t += 100) await sleep(100); return predicate(); };
// Whether ps -E shows any of a pid's environment (the coordinator's question: is the env a usable witness?).
const envShown = pid => { try { const c = execFileSync('/bin/ps', ['-ww', '-o', 'command=', '-p', String(pid)], {encoding: 'utf8'}).trim(), e = execFileSync('/bin/ps', ['-E', '-ww', '-o', 'command=', '-p', String(pid)], {encoding: 'utf8'}).trim(); return e.length > c.length; } catch { return null; } };

const report = {startedAt: new Date().toISOString(), host: execFileSync('/bin/hostname', {encoding: 'utf8'}).trim(), macos: execFileSync('/usr/bin/sw_vers', ['-productVersion'], {encoding: 'utf8'}).trim()};
const witnessStart = Date.now(), initialFront = localFrontmost();
report.initialFront = initialFront;
try {
  if (textEdits().length) { check('no TextEdit runs at the start', false, `TextEdit pid ${textEdits().join(', ')} runs; the witness touches nothing`); throw new Error('stop'); }
  check('no TextEdit runs at the start', true, `front ${initialFront}`);

  // A: the run starts TextEdit.
  const a = {startedAt: Date.now(), before: textEdits(), front: localFrontmost()};
  open(file('a.txt'));
  await waitFor(() => textEdits().length > 0); await sleep(1500);
  const started = textEdits();
  report.a = {front: a.front, frontDuring: localFrontmost(), started, envShownByPsE: started.map(envShown)};
  const cleanA = await cleanUpFixtureApp({name: 'TextEdit', bundle: TEXTEDIT_BUNDLE, run: a, frontmost: localFrontmost});
  report.a.cleanup = cleanA;
  check('A: the TextEdit the run started is the one owned', started.length === 1 && cleanA.owned.length === 1 && cleanA.owned[0] === started[0], `started ${started.join(', ')}; owned ${cleanA.owned.join(', ')}`);
  check('A: it quit', cleanA.quit.length === 1 && !cleanA.remaining.length && await waitFor(() => !textEdits().length, 3000), `quit ${cleanA.quit.join(', ')}; remaining ${cleanA.remaining.join(', ') || 'none'}; running now ${textEdits().join(', ') || 'none'}`);
  check('A: the front is handed back', cleanA.front.restored && localFrontmost() === a.front, `before ${a.front}, at cleanup ${cleanA.front.before}, after ${localFrontmost()}`);

  // B: a TextEdit runs before the run.
  open(file('before.txt'));
  await waitFor(() => textEdits().length > 0); await sleep(1500);
  const preexisting = textEdits();
  await restoreFront(initialFront, {frontmost: localFrontmost, app: TEXTEDIT_BUNDLE});
  const b = {startedAt: Date.now(), before: textEdits(), front: localFrontmost()};
  open(file('b.txt'));
  await sleep(2000);
  report.b = {preexisting, front: b.front, frontDuring: localFrontmost(), runningDuring: textEdits()};
  const cleanB = await cleanUpFixtureApp({name: 'TextEdit', bundle: TEXTEDIT_BUNDLE, run: b, frontmost: localFrontmost});
  report.b.cleanup = cleanB;
  check('B: the document went to the TextEdit already running (no new pid)', preexisting.length === 1 && report.b.runningDuring.join() === preexisting.join(), `before ${preexisting.join(', ')}; during ${report.b.runningDuring.join(', ')}`);
  check('B: nothing quit; the TextEdit running before survives', !cleanB.owned.length && !cleanB.quit.length && preexisting.every(pid => textEdits().includes(pid)), `owned ${cleanB.owned.join(', ') || 'none'}; kept ${cleanB.keptBefore.join(', ')}; running ${textEdits().join(', ')}`);
  check('B: the front is handed back', cleanB.front.restored && localFrontmost() === b.front, `before ${b.front}, at cleanup ${cleanB.front.before}, after ${localFrontmost()}`);
} catch (error) {
  if (error.message !== 'stop') check('the witness ran to the end', false, error.message.split('\n')[0]);
} finally {
  // The witness's own leftovers: any TextEdit launched since it began (it refused to start while one ran).
  const own = ownedLaunches({pids: textEdits(), before: [], startedAt: witnessStart, launchOf: pid => launchOf(pid)});
  if (checks[0]?.status === 'PASS' && own.length) report.teardown = await quitOwned(own);
  if (checks[0]?.status === 'PASS') {
    report.final = {front: await restoreFront(initialFront, {frontmost: localFrontmost, app: TEXTEDIT_BUNDLE}), running: textEdits()};
    check('end: no TextEdit of the witness is left', !textEdits().length, `running ${textEdits().join(', ') || 'none'}`);
    check('end: the front at the start is frontmost again', localFrontmost() === initialFront, `${localFrontmost()} (start ${initialFront})`);
  }
  rmSync(dir, {recursive: true, force: true});
}
report.finishedAt = new Date().toISOString();
report.checks = checks;
report.status = checks.length && checks.every(c => c.status === 'PASS') ? 'PASS' : 'FAIL';
const text = JSON.stringify(report, null, 2) + '\n';
if (values.out) writeFileSync(values.out, text);
process.stdout.write(text);
process.exitCode = report.status === 'PASS' ? 0 : 1;
