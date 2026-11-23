// The staged onboarding's judge (#117 M5, T3b): reads ./onboarding.mjs's record, stage by stage, against what M4's
// product does with the grants the stage's rows give. checks.mjs `onboarding` is its step check in sitting D.
//
// M4's behaviour, as the code has it:
// - An observation checks Accessibility before anything else (native/engine/Sources/Engine/Skyshot.swift getAppState:
//   requireAccessibility first) and captures under Screen Recording (Screenshot.swift capture: requireScreenRecording);
//   every observation captures, a text one too (src/services/engine/service.mjs, the header's Observation; M4's ruling
//   of 2026-10-22). So a bind needs both grants, and a missing Accessibility grant is the one named first.
// - The refusal is permissionsPending (-10014) with the grant's by-hand steps and the approved bundle's path
//   (Permissions.swift, word for word src/runtime/engine.mjs grantSteps), Screen Recording's saying that a relaunch is
//   pending; its meta.permission rides as _meta['cua/permission'] (service.mjs `call`). scripts/accept/onboarding.mjs
//   permissionGuidance is the check, recorded by the driver as `guidance`.
// - Screen Recording's refusal arms one relaunch, made on the connection's next observation (src/services/engine/
//   client.mjs relaunchForPermissions: shutdown, launch, observe once on the fresh engine): the recovery once granted.
//   Accessibility's arms none; on a runner its row is honoured only at a launch (H0), so the driver relaunches by
//   `cua engine stop` there.
// - doctor's engine row: fail while Accessibility or Screen Recording is not granted, Input Monitoring's absence a warn
//   naming "intervention detection off", its permissions the running engine's status (src/runtime/doctor-engine.mjs
//   GRANT_EFFECT, grantWords).
// - Every result attests the engine that answered (_meta['cua/nativeEngine'], service.mjs): the run's approved cua
//   build, classed as every hosted check classes it (../probe/lib.mjs classifyAttestation).
//
// Verdicts, in ruling 1149's order (checks.mjs `record`): a result answered on another engine anywhere (the vendor's on
// the cua side, state 1, or another build) is NO VERDICT naming it, before anything else; then FAIL for a behaviour other
// than the expected one; then NO VERDICT for any other missing proof (no record or an ambiguous one, a result with no
// attestation, a stage not set: its rows not written or not honoured, its relaunch or session not made, a call the
// product held with no answer, an unread status or doctor). Never a pass without proof. -> [status, reason].
import {classifyAttestation} from '../probe/lib.mjs';

const OK = 'ok';
export const EXPECTED = Object.freeze({
  none: {grants: {accessibility: false, screenRecording: false}, calls: {accessibility: 'accessibility', screenRecording: 'accessibility'}, doctorRow: ['fail']},
  accessibility: {grants: {accessibility: true, screenRecording: false}, calls: {accessibility: 'screenRecording', screenRecording: 'screenRecording'}, doctorRow: ['fail']},
  screenRecording: {grants: {accessibility: true, screenRecording: true}, calls: {accessibility: OK, screenRecording: OK}, doctorRow: ['pass', 'warn'], recoveryAfter: 'accessibility'},
  full: {grants: {accessibility: true, screenRecording: true, inputMonitoring: true, canPostHid: true}, calls: {accessibility: OK, screenRecording: OK}, doctorRow: ['pass', 'warn']},
});
// The stages in the order the driver runs them (./onboarding.mjs STAGES; its test holds the two equal).
const ORDER = Object.keys(EXPECTED);
const NAMES = {accessibility: 'Accessibility', screenRecording: 'Screen Recording'};
const short = build => String(build).slice(0, 12);

// One stage, its calls' attestations first.
// -> {elsewhere: [why], fail: [why], missing: [why], summary}.
function judgeStage(stage, {attest, prior}) {
  const want = EXPECTED[stage.id];
  const fail = [], missing = [];
  if (stage.problem) return {elsewhere: [], fail, missing: [`not set: ${stage.problem}`]};
  // Every answer the product gave must be the run's cua engine's before anything in the stage counts (ruling 1149).
  const classed = stage.calls.filter(c => c.resultPresent).map(c => [c.id, attest(c.nativeEngine)]).filter(([, c]) => c.status !== 'ok');
  const elsewhere = classed.filter(([, c]) => c.status !== 'missing').map(([id, c]) => `${id} call: ${c.problem}`);
  if (classed.length) return {elsewhere, fail, missing: classed.filter(([, c]) => c.status === 'missing').map(([id, c]) => `${id} call: ${c.problem}`)};
  // The product's own relaunch first: without it the old process cannot have taken the grant, so what it reads is its.
  const product = stage.relaunch?.method === 'product';
  if (want.recoveryAfter) {
    // The relaunch is owed only once this connection saw Screen Recording refused (client.mjs), in a stage that was set.
    const refused = prior?.set && prior.stage.calls.some(c => c.isError && c.metadata?.permission === 'screenRecording');
    if (!refused) return {elsewhere: [], fail, missing: [`not set: the recovery follows a Screen Recording refusal in the ${want.recoveryAfter} stage, and none was observed`]};
    if (stage.relaunch?.before?.connections !== 1) return {elsewhere: [], fail, missing: [`another connection was open at the relaunch (${stage.relaunch?.before?.connections ?? 'unread'}), which the engine refuses`]};
  }
  const status = stage.status;
  if (product && stage.relaunched === false && stage.calls.every(c => !c.waited)) {
    fail.push(`the product did not relaunch the engine for the Screen Recording grant (pid ${stage.relaunch.before.pid} throughout)`);
    return {elsewhere: [], fail, missing};
  }
  if (!status?.read || !status.running) return {elsewhere: [], fail, missing: [`capabilities unread (${status?.problem ?? 'no engine running'})`]};
  const unset = Object.entries(want.grants).filter(([key, value]) => status[key] !== value);
  if (unset.length) return {elsewhere: [], fail, missing: unset.map(([key]) => `not set: ${key} reads ${status[key]} with the stage's rows`)};
  for (const [id, outcome] of Object.entries(want.calls)) {
    const call = stage.calls.find(c => c.id === id);
    const where = `${id} call`;
    if (!call) { missing.push(`${where}: not made`); continue; }
    if (call.waited || call.completion === 'timeout') { missing.push(`${where}: no answer within its bound: the product waited, and nothing answered it`); continue; }
    if (call.transportError || call.completion === 'missing-result') { missing.push(`${where}: no result (${call.errorText ?? 'transport'})`); continue; }
    if (outcome === OK) {
      if (call.isError) fail.push(`${where}: refused (${call.metadata?.permission ?? call.errorName ?? 'an error'}) with the grants present: ${call.errorText ?? ''}`.trim());
      else if (id === 'accessibility' ? call.bound !== true : !(call.screenshotBytes > 0)) fail.push(`${where}: answered without its ${id === 'accessibility' ? 'bind' : 'screenshot'}`);
    } else if (!call.isError) fail.push(`${where}: answered where ${NAMES[outcome]} is missing`);
    else if (call.metadata?.permission !== outcome) fail.push(`${where}: cua/permission ${call.metadata?.permission ?? 'absent'}, expected ${outcome} (${call.errorText ?? ''})`);
    else if (call.guidance !== true) fail.push(`${where}: the refusal lacks the ${NAMES[outcome]} grant's steps or the approved bundle's path`);
  }
  if (want.recoveryAfter && stage.relaunched !== true && !fail.length && !missing.length) missing.push('the relaunch was not read');
  const doctor = stage.doctor;
  if (!doctor?.received) missing.push(`doctor unread (${doctor?.problem ?? 'not run'})`);
  else {
    const differs = ['accessibility', 'screenRecording', 'inputMonitoring'].filter(key => doctor.permissions?.[key] !== status[key]);
    if (differs.length) fail.push(`doctor's permissions differ from the engine's status: ${differs.join(', ')}`);
    if (!doctor.engineRow?.present || !want.doctorRow.includes(doctor.engineRow.status)) fail.push(`doctor's engine row is ${doctor.engineRow?.status ?? 'absent'}, expected ${want.doctorRow.join(' or ')}`);
    if (doctor.engineRow?.interventionOff !== (status.inputMonitoring !== true)) fail.push(`doctor's engine row ${doctor.engineRow?.interventionOff ? 'says' : 'does not say'} intervention detection off with Input Monitoring ${status.inputMonitoring}`);
  }
  const refused = [...new Set(Object.values(want.calls).filter(o => o !== OK))].map(o => `refused ${NAMES[o]} with its steps`);
  const summary = refused.length ? refused.join(', ') : want.recoveryAfter ? `recovered through the product's relaunch (pid ${stage.relaunch.before.pid} → ${stage.calls[0].statusAfter?.pid})`
    : `answered, intervention ${status.inputMonitoring ? 'on' : 'off'}`;
  return {elsewhere: [], fail, missing, summary};
}

// `path` and `exit`: where the record should be and how the driver ended, for the reason when there is none.
// `engine`: the side the step measures (plan.mjs's `engine`, cua's), which the record's expected attestation must be.
export function judgeOnboarding(record, {path = 'onboarding.json', exit = null, engine = 'cua'} = {}) {
  if (!record) return ['NO VERDICT', `no onboarding record at ${path} (exit ${exit})`];
  if (record.kind !== 'hosted-onboarding' || !Array.isArray(record.stages)) return ['NO VERDICT', `${path} is not an onboarding record`];
  if (record.hosted !== true) return ['NO VERDICT', 'not a hosted run'];
  const ids = record.stages.map(s => s?.id);
  if (ids.some((id, i) => id !== ORDER[i])) return ['NO VERDICT', `ambiguous: its stages are ${ids.join(', ')}, not ${ORDER.join(', ')} in that order`];
  const expected = record.expected;
  const notRun = `incomplete: ${record.problem ?? 'no reason recorded'}; ${ORDER.length - record.stages.length} stage(s) not run`;
  if (!expected) return ['NO VERDICT', record.complete ? 'the record names no expected engine attestation' : notRun];
  if (expected.engine !== engine || !expected.build) return ['NO VERDICT', `the record's engine is ${expected.engine}, not the ${engine} side the step measures`];
  const attest = attested => classifyAttestation(attested, expected);
  const elsewhere = [], fails = [], missing = [], summaries = [];
  let prior = null;
  for (const stage of record.stages) {
    const judged = judgeStage(stage, {attest, prior});
    elsewhere.push(...judged.elsewhere.map(why => `${stage.id}: ${why}`));
    fails.push(...judged.fail.map(why => `${stage.id}: ${why}`));
    missing.push(...judged.missing.map(why => `${stage.id}: ${why}`));
    if (judged.summary) summaries.push(`${stage.id}: ${judged.summary}`);
    prior = {stage, set: !judged.missing.some(why => why.startsWith('not set'))};
  }
  if (!record.complete) missing.push(notRun);
  if (elsewhere.length) return ['NO VERDICT', elsewhere.join('; ')];
  if (fails.length) return ['FAIL', fails.join('; ')];
  if (missing.length) return ['NO VERDICT', missing.join('; ')];
  return ['PASS', `${summaries.join('; ')}; every result attested cua ${short(expected.build)}`];
}
