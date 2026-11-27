#!/usr/bin/env node
// The fallback homes' probe (#171 M5's pre-flight §3, F5 and F5a; its new form #171 M6a, F3): a cua home with no usable
// engine of cua's, because none is installed (`none`), the installed one is older than this cua needs (`previous`,
// 0.4.3; `released`, 0.4.0; `older`, 0.3.0), or its install.json does not match its file (`unrecorded`: a newer record
// beside an older engine). M5's default kept the vendor's engine in such a home; since M6a it refuses every computer
// session there, for the home's own reason, naming this cua's own installer with --engine by its absolute path
// (manifest.mjs ownInstaller, ruling 1110) as the one remedy, offering no vendor engine, local build or second command
// (ruling 1212, #171 M6b). With nothing selecting an engine (the default mode's inputs: no
// CUA_NATIVE_ENGINE, no "engine" in engine.json), the probe requires
//   - cua doctor --json to say the default prefers cua's engine and refuses it for that reason, its engine row a failure
//     naming the reason and the installer (./linux-selection.mjs refusedSelectionProblem);
//   - `cua serve`, asked for a session over stdio, to refuse the open: it exits 1 without answering the client, its
//     refusal naming the reason and the installer, and no engine runs below it, judged from its process tree sampled
//     every 50 ms (./linux-selection.mjs refusalSample, which reports a process below the serve it cannot read, and
//     refusedOpenProblem, which then fails, as it fails with no sample taken or the answer unread).
// No session opens, so nothing is asked of a person and no window is touched: the probe starts no application.
// Run in the home to probe (CUA_HOME, HOME and the XDG directories the run's), in the X session's environment as the
// gate's other parts are:
//   node scripts/accept/linux-fallback.mjs --home none|previous|released|older|unrecorded   JSON report; exit 0 when every step passes
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {ownInstaller} from '../../src/runtime/installer.mjs';
import {FALLBACK_HOMES, refusalSample, refusedOpenProblem, refusedSelectionProblem, selectionSteps} from './linux-selection.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
// How long the serve has to refuse the open; the refusal comes before it reads its input, in well under a second.
const REFUSAL_WAIT_MS = 60_000;
const at = process.argv.indexOf('--home');
const kind = at < 0 ? null : process.argv[at + 1];
const home = process.env.CUA_HOME ?? defaultHome();
const remedy = `${ownInstaller().command} --engine`;
const steps = [];
const step = (name, ok, detail) => { steps.push({name, status: ok ? 'PASS' : 'FAIL', ...(detail === undefined ? {} : {detail})}); return ok; };
const report = {home, kind, reason: FALLBACK_HOMES[kind] ?? null, remedy, steps};
let serve = null;
let sampler = null;
const samples = [];
let sampleError = null;
try {
  if (!step('preconditions', process.platform === 'linux' && kind in FALLBACK_HOMES, {platform: process.platform, home: kind})) throw new Error('preconditions');
  selectionSteps({mode: 'default', env: process.env, cli: CLI, step, report, judge: doctor => refusedSelectionProblem(doctor, kind, {remedy}),
    judged: `the default refuses cua's engine for ${FALLBACK_HOMES[kind]}, its engine row a failure naming the reason and ${remedy} (cua doctor --json)`});

  // The open: a client asks `cua serve` for a session over stdio, as Claude Code does, and the serve must refuse it.
  serve = spawn(process.execPath, [CLI, 'serve'], {stdio: ['pipe', 'pipe', 'pipe'], env: process.env});
  let stdout = '', stderr = '';
  serve.stdout.on('data', data => { stdout += data; });
  serve.stderr.on('data', data => { stderr += data; });
  serve.stdin.on('error', () => {});   // EPIPE once the serve has refused and gone
  const exited = new Promise(resolve => serve.once('close', (code, signal) => resolve({code, signal})));
  const sample = () => { try { samples.push(refusalSample(serve.pid)); } catch (error) { sampleError ??= error.message; } };
  sampler = setInterval(sample, 50);
  sample();
  serve.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {elicitation: {}}, clientInfo: {name: 'cua-linux-fallback', version: '0'}}})}\n`);
  let timer;
  const exit = await Promise.race([exited, new Promise(resolve => { timer = setTimeout(() => resolve(null), REFUSAL_WAIT_MS); })]);
  clearTimeout(timer);
  clearInterval(sampler);
  sampler = null;
  if (exit) serve = null;
  // Any line the serve wrote that answers the request, a result or an error, is a session the client could read.
  const answered = stdout.split('\n').some(line => { try { const message = JSON.parse(line); return message.id !== undefined && message.method === undefined && ('result' in message || 'error' in message); } catch { return false; } });
  // each engine and each unreadable process once, by pid and what was read
  const once = list => [...new Map(list.map(item => [JSON.stringify(item), item])).values()];
  const observed = once(samples.flatMap(s => s.engines)), uninspectable = once(samples.flatMap(s => s.uninspectable));
  const open = {exit, stderr, answered, samples: samples.length, observed, uninspectable, ...(sampleError ? {sampleError} : {})};
  const problem = refusedOpenProblem(open, kind, {remedy});
  step(`cua serve refuses the open for ${FALLBACK_HOMES[kind]}: it exits 1 unanswered, naming the reason and ${remedy}, with no engine below it`, problem === null,
    {exit, answered, samples: samples.length, observed, uninspectable, stderr: stderr.slice(0, 1200), ...(problem ? {problem} : {})});
} catch (error) {
  if (!steps.some(s => s.status === 'FAIL')) step('probe', false, error.message);
} finally {
  if (sampler) clearInterval(sampler);
  // A serve that did not refuse is this probe's own child: ended, then killed if it outlives a bounded wait.
  if (serve && serve.exitCode === null && serve.signalCode === null) {
    const gone = new Promise(resolve => serve.once('close', resolve));
    serve.kill('SIGTERM');
    let timer;
    const ended = await Promise.race([gone.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 10_000); })]);
    clearTimeout(timer);
    if (!ended) { serve.kill('SIGKILL'); await gone; }
  }
}
report.status = steps.length && steps.every(s => s.status === 'PASS') ? 'PASS' : 'FAIL';
console.log(JSON.stringify(report, null, 1));
process.exitCode = report.status === 'PASS' ? 0 : 1;
