#!/usr/bin/env node
// The fallback homes' probe (#171 M5; the pre-flight's §3, "The fallback homes get their own probe"; F5 and F5a): a cua
// home where the default must keep the vendor's engine, because none of cua's is installed (`none`), the installed one
// is older than this cua needs (`previous`, 0.4.2; `released`, 0.4.0; `older`, 0.3.0), or its install.json does not
// match its file (`unrecorded`: a newer record beside an older engine). With nothing selecting an engine (the default
// mode's inputs: no CUA_NATIVE_ENGINE, no "engine" in engine.json), it requires
//   - cua doctor --json to say the vendor's engine is selected, for that home's reason, its engine row a warning naming
//     the reason and `cua install --engine` (./linux-selection.mjs fallbackSelectionProblem);
//   - one observation the vendor's build supports, over `cua serve` on stdio: list the apps, bind a harness gedit window
//     by X11 window id, read its tree. Nothing is sent to it: no input, no text;
//   - the engine that answered to be the pinned vendor's sky_linux of this home's runtime, the trusted worker's child,
//     behind the vendor's service, and no cua-engine at all, judged from the serve's process tree sampled every 50 ms
//     (scripts/repl-parity/engine-answered.mjs, the facade suites' own judge of an engine lane).
// The full acceptance checks (R3, R4) and the zero-sky_linux assertion stay with a home that holds the current engine.
// Approvals: only the harness window's app is accepted, once. Its whole GUI footprint: one standalone gedit process on an
// empty file in a directory it creates under /tmp, ended and removed in `finally`.
// Run in the X session's environment, in the home to probe (CUA_HOME, HOME and the XDG directories the run's):
//   node scripts/accept/linux-fallback.mjs --home none|previous|released|older|unrecorded   JSON report; exit 0 when every step passes
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {basename, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {findTool} from '../../src/runtime/tools.mjs';
import {engineAnsweredProblem, engineProcesses, expectedEngine, mergeObservations} from '../repl-parity/engine-answered.mjs';
import {pinnedApprovals} from './lib.mjs';
import {FALLBACK_HOMES, fallbackSelectionProblem, selectionSteps} from './linux-selection.mjs';
import {openSession, resultText} from './mcp-session.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
const at = process.argv.indexOf('--home');
const kind = at < 0 ? null : process.argv[at + 1];
const home = process.env.CUA_HOME ?? defaultHome();
const steps = [];
const step = (name, ok, detail) => { steps.push({name, status: ok ? 'PASS' : 'FAIL', ...(detail === undefined ? {} : {detail})}); return ok; };
const report = {home, kind, reason: FALLBACK_HOMES[kind] ?? null, steps};
const dir = mkdtempSync('/tmp/cua-linux-fallback-');
const file = join(dir, `fallback-${randomBytes(3).toString('hex')}.txt`);
let gedit = null;
let session = null;
let sampler = null;
const pinned = new Set();
const asked = [];
const observations = [];
let sampleError = null;
try {
  const gEditPath = findTool('gedit', process.env.PATH);
  if (!step('preconditions', process.platform === 'linux' && !!process.env.DISPLAY && !!gEditPath && kind in FALLBACK_HOMES,
    {platform: process.platform, display: process.env.DISPLAY ?? null, gedit: gEditPath ?? null, home: kind})) throw new Error('preconditions');
  selectionSteps({mode: 'default', env: process.env, cli: CLI, step, report, judge: doctor => fallbackSelectionProblem(doctor, kind),
    judged: `the default keeps the vendor's engine for ${FALLBACK_HOMES[kind]}, warning and naming cua install --engine (cua doctor --json)`});
  const expected = expectedEngine({engine: 'vendor', home});
  if (!step('the pinned vendor sky_linux of this home\'s runtime', !!expected.expected, expected)) throw new Error('no vendor engine');
  report.expected = expected.expected;

  writeFileSync(file, '');
  gedit = spawn(gEditPath, ['--standalone', file], {detached: true, stdio: 'ignore'});
  session = openSession({args: [CLI, 'serve'], env: {...process.env, CUA_SHIM_PERSIST: 'session'}, clientName: 'cua-linux-fallback', onServerRequest: pinnedApprovals(() => pinned, asked)});
  const sample = () => { try { observations.push(engineProcesses(session.pid)); } catch (error) { sampleError ??= error.message; } };
  sampler = setInterval(sample, 50);
  await session.initialize();

  // The observation: the apps, then the harness window found by its title (which asks nothing), bound by id, its tree read.
  const find = await session.js(`const apps = await cua.listApps({emit: false}); const deadline = Date.now() + 20000; let win;
    while (!win && Date.now() < deadline) { win = (await cua.listWindows({emit: false})).find(w => (w.title ?? '').includes(${JSON.stringify(basename(file))})); if (!win) await new Promise(r => setTimeout(r, 500)); }
    if (!win) throw new Error('the harness window did not appear');
    globalThis.probeWindow = win; nodeRepl.write(JSON.stringify({apps: apps.length, windowId: win.id, app: win.app, title: win.title}));`, 90_000);
  const found = /\{"apps".*\}$/m.exec(resultText(find))?.[0];
  const window = found ? JSON.parse(found) : null;
  if (typeof window?.app === 'string' && window.app) pinned.add(window.app);
  const read = window && await session.js(`const app = await cua.getApp({windowId: probeWindow.id}); const tree = await app.getAXState({emit: false, disableDiffing: true});
    nodeRepl.write(JSON.stringify({source: /Accessibility source: (\\S+)/.exec(tree)?.[1] ?? null, lines: tree.split('\\n').length, titled: tree.includes(${JSON.stringify(basename(file))})}));`, 90_000);
  const tree = read ? JSON.parse(/\{"source".*\}$/m.exec(resultText(read))?.[0] ?? 'null') : null;
  step('list the apps, bind the harness window by X11 id and read its tree; nothing sent to it',
    !find.result?.isError && window?.apps > 0 && !read?.result?.isError && tree?.lines > 1 && tree?.titled === true,
    {window, tree, ...(tree ? {} : {result: resultText(read ?? find).slice(0, 600)})});

  const ended = await session.call('end_task');
  step('end_task', ended.result?.structuredContent?.status === 'ended', ended.result?.structuredContent);
  clearInterval(sampler);
  sampler = null;
  const observed = mergeObservations(...observations);
  const problem = engineAnsweredProblem({requested: 'vendor', expected: expected.expected, observed, ...(sampleError ? {sampleError} : {})}, 'the probe\'s session');
  step('the engine that answered: the pinned vendor sky_linux, the trusted worker\'s child behind the vendor\'s service; no cua-engine',
    problem === null, {samples: observations.length, observed, ...(problem ? {problem} : {})});
  const approvals = asked.filter(a => a.method === 'elicitation/create');
  step('approvals: the harness window\'s app asked once and accepted, nothing else asked', approvals.length === 1 && approvals[0].app === window?.app && approvals[0].action === 'accept',
    {asked: approvals, otherRequests: asked.length - approvals.length});
  const exit = await session.terminate();
  session = null;
  step('cua serve exited cleanly', exit.code === 0 && !exit.forced, exit);
} catch (error) {
  if (!steps.some(s => s.status === 'FAIL')) step('probe', false, error.message);
} finally {
  if (sampler) clearInterval(sampler);
  if (session) await session.terminate();
  if (gedit?.pid) try { process.kill(gedit.pid, 'SIGTERM'); } catch {}
  rmSync(dir, {recursive: true, force: true});
}
report.status = steps.length && steps.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL';
console.log(JSON.stringify(report, null, 1));
process.exitCode = report.status === 'PASS' ? 0 : 1;
