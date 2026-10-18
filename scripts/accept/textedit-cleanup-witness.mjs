#!/usr/bin/env node
// A witness of the TextEdit fixture's launch and cleanup path (#157) without cua: the same `open -a TextEdit <file>`
// textedit.mjs makes, and the same cleanUpFixtureApp, on the Mac it runs on (the mini, through ssh, inside a hold).
// It types nothing, sends no key and binds no app; it only opens files in TextEdit and signals pids it proved its own:
// each TextEdit's identity (pid and launch time) is captured right after the `open` that started it, as textedit.mjs does.
//
//   node scripts/accept/textedit-cleanup-witness.mjs [--out <file.json>]
//
// It refuses to start while any TextEdit it did not start runs (the owner's would be in its way). Then:
//   1  a TextEdit runs before the run (the witness starts it with a plain `open -a TextEdit <file>` and hands the front
//      back): the run's document goes to it, the harness cleanup quits nothing, that TextEdit survives and the front is
//      handed back. Only then does the witness quit the TextEdit it started, as its own teardown;
//   2  no TextEdit runs before the run: the run starts it, and the cleanup quits that pid and hands the front back.
// At the end no TextEdit runs and the application frontmost at the start is frontmost again. Exit 0 only when every
// check holds. Only bundle ids, pids and counts are reported.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {captureLaunch, cleanUpFixtureApp, isSameLaunch, pidsOf, quitOwned, restoreFront} from './fixture-app.mjs';
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
const initialFront = localFrontmost();
const seen = [];  // every TextEdit launch ({pid, at}) the witness itself caused, captured right after its `open`
report.initialFront = initialFront;
try {
  if (textEdits().length) { check('no TextEdit runs at the start', false, `TextEdit pid ${textEdits().join(', ')} runs; the witness touches nothing`); throw new Error('stop'); }
  check('no TextEdit runs at the start', true, `front ${initialFront}`);

  // 1. A TextEdit runs before the run: the witness starts one itself (a plain `open -a TextEdit <file>`), so its pid is in
  // the run's before-set. The harness path opens its document in that same process; its cleanup must leave it running.
  const beforeAt = Date.now();
  open(file('before.txt'));
  await waitFor(() => textEdits().length > 0); await sleep(1500);
  const preexisting = textEdits();
  const pre = captureLaunch({pids: preexisting, before: [], startedAt: beforeAt}).launch;
  if (pre) seen.push(pre);
  await restoreFront(initialFront, {frontmost: localFrontmost, app: TEXTEDIT_BUNDLE});
  const b = {startedAt: Date.now(), before: textEdits(), front: localFrontmost()};
  open(file('run-1.txt'));
  await sleep(2000);
  b.launch = captureLaunch({pids: textEdits(), before: b.before, startedAt: b.startedAt}).launch;
  report.runningBefore = {preexisting, front: b.front, frontDuring: localFrontmost(), runningDuring: textEdits()};
  const cleanB = await cleanUpFixtureApp({name: 'TextEdit', bundle: TEXTEDIT_BUNDLE, run: b, frontmost: localFrontmost});
  report.runningBefore.cleanup = cleanB;
  check('running before: the run\'s document went to that TextEdit (no new pid)', preexisting.length === 1 && report.runningBefore.runningDuring.join() === preexisting.join(), `before ${preexisting.join(', ')}; during ${report.runningBefore.runningDuring.join(', ')}`);
  check('running before: the cleanup quit nothing and that TextEdit survives it', !cleanB.launch && !cleanB.quit.length && preexisting.every(pid => textEdits().includes(pid)), `launch recorded ${cleanB.launch?.pid ?? 'none'}; kept ${cleanB.keptBefore.join(', ')}; running ${textEdits().join(', ')}`);
  check('running before: the front is handed back', cleanB.front.restored && localFrontmost() === b.front, `before ${b.front}, at cleanup ${cleanB.front.before}, after ${localFrontmost()}`);
  // The witness's own teardown, apart from the harness cleanup: it quits the TextEdit it started for this case.
  report.runningBefore.witnessTeardown = await quitOwned(isSameLaunch(pre) ? [pre.pid] : []);
  await restoreFront(initialFront, {frontmost: localFrontmost, app: TEXTEDIT_BUNDLE});
  check('running before: the witness quit its own TextEdit afterwards', !textEdits().length, `quit ${report.runningBefore.witnessTeardown.quit.join(', ') || 'none'}; running ${textEdits().join(', ') || 'none'}`);
  if (textEdits().length) throw new Error('a TextEdit still runs; the second case needs none');

  // 2. No TextEdit before the run: the run starts it, and its cleanup quits that pid and hands the front back.
  const a = {startedAt: Date.now(), before: textEdits(), front: localFrontmost()};
  open(file('run-2.txt'));
  await waitFor(() => textEdits().length > 0); await sleep(1500);
  const started = textEdits();
  a.launch = captureLaunch({pids: started, before: a.before, startedAt: a.startedAt}).launch;
  if (a.launch) seen.push(a.launch);
  report.startedByRun = {front: a.front, frontDuring: localFrontmost(), started, envShownByPsE: started.map(envShown)};
  const cleanA = await cleanUpFixtureApp({name: 'TextEdit', bundle: TEXTEDIT_BUNDLE, run: a, frontmost: localFrontmost});
  report.startedByRun.cleanup = cleanA;
  check('started by the run: that TextEdit is the one owned', started.length === 1 && cleanA.launch?.pid === started[0], `started ${started.join(', ')}; launch recorded ${cleanA.launch?.pid ?? 'none'}`);
  check('started by the run: it quit', cleanA.quit.length === 1 && !cleanA.remaining.length && await waitFor(() => !textEdits().length, 3000), `quit ${cleanA.quit.join(', ')}; remaining ${cleanA.remaining.join(', ') || 'none'}; running now ${textEdits().join(', ') || 'none'}`);
  check('started by the run: the front is handed back', cleanA.front.restored && localFrontmost() === a.front, `before ${a.front}, at cleanup ${cleanA.front.before}, after ${localFrontmost()}`);
} catch (error) {
  if (error.message !== 'stop') check('the witness ran to the end', false, error.message.split('\n')[0]);
} finally {
  // The witness's own leftovers: only launches it captured, still the same process (a pid reused since is not its own).
  const own = seen.filter(launch => isSameLaunch(launch)).map(({pid}) => pid);
  if (checks[0]?.status === 'PASS' && own.length) report.teardown = await quitOwned(own);
  if (checks[0]?.status === 'PASS') {
    report.final = {front: await restoreFront(initialFront, {frontmost: localFrontmost, app: TEXTEDIT_BUNDLE}), running: textEdits()};
    check('end: no TextEdit of the witness is left', !seen.some(launch => isSameLaunch(launch)), `running ${textEdits().join(', ') || 'none'} (the witness's: ${seen.map(({pid}) => pid).join(', ') || 'none'})`);
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
