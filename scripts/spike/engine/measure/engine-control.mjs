// measure.mjs's engine steps on the controller (the own native engine spec, Interfaces: EngineInstall.approveEngine and
// stopEngine; "Install, signing and permissions", the approved engine; Verification system: every live run begins and
// ends with the stop discipline, the `shutdown` request and never a signal, and refuses unless the checkout's build
// equals the approved one). The device operations (`ops`) run engine-device.mjs on the device (./device.mjs
// engineOps); the tests pass a fake engine.
//
// ops: rpc(method) -> {ok, result} | {ok: false, error} | {ok: false, unreachable}; bundle(); approved(); writeApproved(r);
//      launch({plain}); checkoutBuild().

export class EngineRefusal extends Error {
  constructor(message, details = {}) { super(message); this.name = 'EngineRefusal'; Object.assign(this, details); }
}

const others = n => `${n} other connection${n === 1 ? '' : 's'}`;
const sleepFor = ms => new Promise(resolve => setTimeout(resolve, ms));

// Polls `probe()` until it returns a value, every `intervalMs` for at most `timeoutMs`; -> the value or null.
async function poll(probe, {timeoutMs, intervalMs = 200, sleep = sleepFor, now = Date.now}) {
  for (const t0 = now(); ;) {
    const value = probe();
    if (value) return value;
    if (now() - t0 >= timeoutMs) return null;
    await sleep(intervalMs);
  }
}

const statusOf = ops => {
  const answer = ops.rpc('status');
  if (answer.unreachable) return null;
  if (!answer.ok) throw new EngineRefusal(`the engine's status failed: ${answer.error?.message ?? 'no answer'}`);
  return answer.result;
};
const waitGone = (ops, timing) => poll(() => (ops.rpc('status').unreachable ? true : null), {timeoutMs: 10_000, ...timing});
const waitUp = (ops, {notPid = null, ...timing}) => poll(() => { const s = statusOf(ops); return s && s.pid !== notPid ? s : null; }, {timeoutMs: 15_000, ...timing});

// Sends shutdown to a running engine. Refuses while another connection is open (status first, then shutdown's own busy
// answer) and names the count; never signals. -> {wasRunning: false} | {wasRunning: true, pid} | {dryRun, ...}.
export async function stopEngine(ops, {dryRun = false, ...timing} = {}) {
  const status = statusOf(ops);
  if (!status) return {wasRunning: false};
  if (status.connections > 0) throw new EngineRefusal(`the engine (pid ${status.pid}) has ${others(status.connections)} open; not stopping it`, {connections: status.connections});
  if (dryRun) return {dryRun: true, wasRunning: true, pid: status.pid, would: 'send shutdown'};
  const answer = ops.rpc('shutdown');
  if (!answer.ok) {
    if (answer.error?.errorName === 'busy') throw new EngineRefusal(`the engine (pid ${status.pid}) answered busy: ${others(answer.error.connections)} open; not stopping it`, {connections: answer.error.connections});
    if (!answer.unreachable) throw new EngineRefusal(`shutdown failed: ${answer.error?.message ?? 'no answer'}`);
  }
  if (!await waitGone(ops, timing)) throw new EngineRefusal(`the engine (pid ${status.pid}) accepted shutdown but still answers after 10 s`);
  return {wasRunning: true, pid: status.pid};
}

// Whether the running engine is the bundle's own program: the socket beside the bundle could still be served by an
// engine started from another copy or an older build.
function assertSameEngine(status, bundle) {
  if (status.bundlePath !== bundle.bundle) throw new EngineRefusal(`the engine answering beside ${bundle.bundle} runs from another copy (${status.bundlePath}); stop it first`);
  if (status.build !== bundle.build) throw new EngineRefusal(`the running engine's build ${String(status.build).slice(0, 12)} is not the bundle's ${String(bundle.build).slice(0, 12)}; stop it first`);
}

// The approve loop (EngineInstall.approveEngine): refuses while another connection is open; approve (the grant prompts,
// answered by the owner at the console); the operator's console confirmation that both were granted (approve's answer
// is advisory: a running process may not see its own Screen Recording grant, probe (f)); shutdown; `open -n -g -a`;
// status until it answers; approve again, whose one discarded capture raises the per-bundle confirmation; on captured
// writes approved.json {build, identity, approvedAt}. `dryRun` reads status and the bundle and sends nothing else.
export async function approveEngine(ops, {confirm, log = () => {}, dryRun = false, now = Date.now, ...timing}) {
  const bundle = ops.bundle();
  if (!bundle.exists) throw new EngineRefusal(`no engine bundle at ${bundle.bundle}`);
  let status = statusOf(ops);
  if (dryRun) {
    if (status) assertSameEngine(status, bundle);
    return {dryRun: true, running: Boolean(status), status, bundle, approved: ops.approved(),
      would: [...(status ? [] : ['launch with open -n -g -a']), ...(status?.connections > 0 ? [] : ['approve', 'wait for the console confirmation', 'shutdown', 'relaunch with open -n -g -a', 'approve (capture)', 'write approved.json'])],
      ...(status?.connections > 0 ? {refusal: `${others(status.connections)} open`} : {})};
  }
  if (!status) {
    log('the engine is not running: launching it with open -n -g -a');
    ops.launch();
    status = await waitUp(ops, {now, ...timing});
    if (!status) throw new EngineRefusal('the launched engine did not answer status within 15 s');
  }
  assertSameEngine(status, bundle);
  if (status.connections > 0) throw new EngineRefusal(`the engine (pid ${status.pid}) has ${others(status.connections)} open; approve runs with no other client`, {connections: status.connections});

  const first = ops.rpc('approve');
  if (!first.ok) throw new EngineRefusal(`approve failed: ${first.error?.message ?? first.unreachable}`);
  log(`approve: accessibility ${first.result.accessibility}, screenRecording ${first.result.screenRecording}, captured ${first.result.captured}`);
  if (!await confirm('The owner, at the console: grant cua Engine Accessibility and Screen Recording in the prompts (System Settings > Privacy & Security). Press Enter once both are granted (n to abort): '))
    return {approved: false, reason: 'no console confirmation that both grants were given', first: first.result};
  // Probe (f)'s first question, read on the way: does the running process see its own Screen Recording grant?
  const observedBeforeRelaunch = statusOf(ops);

  const stopped = await stopEngine(ops, {now, ...timing});
  ops.launch();
  const relaunched = await waitUp(ops, {notPid: stopped.pid ?? null, now, ...timing});
  if (!relaunched) throw new EngineRefusal('the relaunched engine did not answer status within 15 s');
  assertSameEngine(relaunched, bundle);
  log('approve after the relaunch: the capture confirmation appears on the console now; the owner answers it');
  const second = ops.rpc('approve');
  if (!second.ok) throw new EngineRefusal(`approve after the relaunch failed: ${second.error?.message ?? second.unreachable}`);
  const result = {first: first.result, observedBeforeRelaunch: observedBeforeRelaunch && {accessibility: observedBeforeRelaunch.accessibility, screenRecording: observedBeforeRelaunch.screenRecording},
    second: second.result, relaunchedPid: relaunched.pid};
  if (second.result.captured !== true) return {approved: false, reason: 'the approve after the relaunch did not report captured: true', ...result};
  const record = {build: bundle.build, identity: bundle.identity, approvedAt: new Date(now()).toISOString()};
  ops.writeApproved(record);
  return {approved: true, record, ...result};
}

// Why a run may not use this engine: the checkout, the bundle and approved.json must name one build, and the bundle's
// signing identity must be the approved one. -> [] when all hold.
export function buildProblems({bundle, approved, checkout}) {
  const short = value => String(value ?? 'none').slice(0, 12);
  if (!bundle?.exists) return [`no engine bundle at ${bundle?.bundle ?? 'the approved location'}`];
  if (!approved) return ['no approved.json beside the bundle: run measure.mjs approve with the owner at the console'];
  const problems = [];
  if (checkout?.build !== approved.build) problems.push(`the checkout's build ${short(checkout?.build)} is not the approved build ${short(approved.build)}`);
  if (bundle.build !== approved.build) problems.push(`the bundle's build ${short(bundle.build)} is pending: approved.json names ${short(approved.build)}`);
  if (bundle.identity !== approved.identity) problems.push(`the bundle's signing identity ${short(bundle.identity)} is not the approved ${short(approved.identity)}`);
  return problems;
}
export async function assertApprovedBuild(ops) {
  const bundle = ops.bundle(), approved = ops.approved(), checkout = ops.checkoutBuild();
  const problems = buildProblems({bundle, approved, checkout});
  if (problems.length) throw new EngineRefusal(`refusing the run: ${problems.join('; ')}`, {problems});
  return {build: approved.build, identity: approved.identity, approvedAt: approved.approvedAt, engineVersion: bundle.engineVersion};
}

// Launches the bundle (`open -n -g -a`, or `open -a` with `plain`, probe (c)'s activation check) and waits for its
// status; refuses when nothing answers or the answer is another copy's. -> the status.
export async function launchEngine(ops, {plain = false, ...timing} = {}) {
  const bundle = ops.bundle();
  if (!bundle.exists) throw new EngineRefusal(`no engine bundle at ${bundle.bundle}`);
  ops.launch({plain});
  const status = await waitUp(ops, timing);
  if (!status) throw new EngineRefusal(`the engine at ${bundle.bundle} did not answer status within 15 s of its launch`);
  assertSameEngine(status, bundle);
  return status;
}

// The engine's status answer with the bundle and approved.json beside it (EngineInstall.engineStatus).
export async function engineStatus(ops) {
  const status = statusOf(ops), bundle = ops.bundle(), approved = ops.approved();
  return {running: Boolean(status), status, bundle, approved,
    installed: Boolean(bundle.exists && approved && bundle.build === approved.build && bundle.identity === approved.identity)};
}
