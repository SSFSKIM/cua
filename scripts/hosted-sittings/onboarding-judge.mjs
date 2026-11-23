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
// - Screen Recording's refusal arms one relaunch, tied to the refusing engine's pid and made on the connection's next
//   observation (src/services/engine/client.mjs relaunchForPermissions: shutdown, launch, observe once on the fresh
//   engine): the recovery once granted. It is judged as accept-native item 14 judges it (scripts/accept/onboarding.mjs,
//   'service relaunch recovery'): the engine just before the retry is the one that refused, with only the test's
//   connection, and the engine after it is another. Accessibility's refusal arms none; on a runner its row is honoured
//   only at a launch (H0), so the driver relaunches by `cua engine stop` there.
// - doctor's engine row: fail while Accessibility or Screen Recording is not granted, Input Monitoring's absence a warn
//   naming "intervention detection off", its permissions the running engine's status (src/runtime/doctor-engine.mjs
//   GRANT_EFFECT, grantWords).
// - Every result attests the engine that answered (_meta['cua/nativeEngine'], service.mjs): the run's approved cua
//   build, classed as every hosted check classes it (../probe/lib.mjs classifyAttestation).
// - Rulings 1136 and 1141: a cell counts only when TextEdit took front and key before it and no system prompt was front
//   or key before or after it (the driver's `frontKey`, screenState's reading); else it is NO VERDICT.
//
// Verdicts, in ruling 1149's order (checks.mjs `record`): a result answered on another engine anywhere (the vendor's on
// the cua side, state 1, or another build) is NO VERDICT naming it, before anything else; then FAIL for a behaviour other
// than the expected one, each answered cell judged on its own; then NO VERDICT for any other missing proof: no record, a
// malformed or ambiguous one, fewer than every stage, a result with no attestation, a stage not set (its rows not read
// back or not honoured, its relaunch not shown, its session lost), a cell not sent, held with no answer, or around which
// TextEdit was not front and key, an unread status or doctor. PASS needs positive evidence for every stage. It never
// throws on a record: what it cannot read is NO VERDICT. -> [status, reason].
import {classifyAttestation} from '../probe/lib.mjs';

const OK = 'ok';
const ALL = ['accessibility', 'screenRecording', 'inputMonitoring', 'postEvent'];
export const EXPECTED = Object.freeze({
  none: {relaunch: 'engine stop', removes: ALL, grants: {accessibility: false, screenRecording: false}, calls: {accessibility: 'accessibility', screenRecording: 'accessibility'}, doctorRow: ['fail']},
  accessibility: {relaunch: 'engine stop', adds: ['accessibility'], grants: {accessibility: true, screenRecording: false}, calls: {accessibility: 'screenRecording', screenRecording: 'screenRecording'}, doctorRow: ['fail']},
  screenRecording: {relaunch: 'product', adds: ['screenRecording'], grants: {accessibility: true, screenRecording: true}, calls: {accessibility: OK, screenRecording: OK}, doctorRow: ['pass', 'warn'], recoveryAfter: 'accessibility'},
  full: {relaunch: 'engine stop', adds: ['inputMonitoring', 'postEvent'], grants: {accessibility: true, screenRecording: true, inputMonitoring: true, canPostHid: true}, calls: {accessibility: OK, screenRecording: OK}, doctorRow: ['pass', 'warn']},
});
// The stages in the order the driver runs them (./onboarding.mjs STAGES; its test holds the two equal).
const ORDER = Object.keys(EXPECTED);
const CALL_IDS = ['accessibility', 'screenRecording'];
const NAMES = {accessibility: 'Accessibility', screenRecording: 'Screen Recording'};
const short = build => String(build).slice(0, 12);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// What keeps a stage's record from being read. -> the problem, or null.
function malformed(stage, want) {
  if (!isObject(stage.relaunch) || stage.relaunch.method !== want.relaunch) return 'relaunch';
  if (!isObject(stage.rows)) return 'rows';
  if (!Array.isArray(stage.calls)) return 'calls';
  if (typeof stage.problem === 'string') return null;   // a stage not set holds what it read before it stopped
  if (stage.calls.length !== CALL_IDS.length || stage.calls.some((c, i) => !isObject(c) || c.id !== CALL_IDS[i])) return 'calls';
  for (const call of stage.calls) {
    for (const [field, ok] of [['sent', typeof call.sent === 'boolean'], ['resultPresent', typeof call.resultPresent === 'boolean'], ['completion', typeof call.completion === 'string'],
      ['metadata', isObject(call.metadata)], ['statusAfter', isObject(call.statusAfter)], ['frontKey', isObject(call.frontKey) || (call.sent === false && call.frontKey === null)]])
      if (!ok) return `${call.id} call's ${field}`;
  }
  if (!isObject(stage.status) || !(stage.doctor === null || isObject(stage.doctor))) return 'status or doctor';
  return null;
}

// Whether the stage's rows were read back as its own: every row removed (none), or every row it adds granted.
function readBack(stage, want) {
  if (want.removes) return want.removes.every(key => stage.rows.removed?.removed?.includes(key)) && Array.isArray(stage.rows.removed?.remaining) && stage.rows.removed.remaining.length === 0;
  const granted = stage.rows.granted?.rows?.[0]?.granted;
  return Array.isArray(granted) && want.adds.every(key => granted.includes(key)) && Array.isArray(stage.rows.granted.missing) && stage.rows.granted.missing.length === 0;
}

// Why a cell has no proof of the product's answer, or null when it has: not sent, a wait, no result, no attestation, or
// the screen around it (rulings 1136 and 1141).
function cellUnproved(call, attestation) {
  if (!call.sent) return call.skipped === 'activation' ? 'activation: TextEdit did not take front and key' : `not sent (${call.skipped ?? 'no reason recorded'})`;
  if (call.waited || call.completion === 'timeout') return `no answer within its bound (${call.waitedBy ?? 'a wait'}): the product waited, and nothing answered it`;
  if (call.transportError || !call.resultPresent || call.completion === 'missing-result') return `no result (${call.errorText ?? 'transport'})`;
  if (attestation.status !== 'ok') return attestation.problem;
  const fk = call.frontKey;
  if (!(fk.activate?.front === true && fk.activate?.key === true)) return 'activation: TextEdit did not take front and key';
  for (const when of ['before', 'after']) {
    if (fk[when]?.state === 'alert') return `alert: ${fk[when].front ?? 'a system prompt'} front or key ${when} the cell`;
    if (fk[when]?.state !== 'clear') return `unread: front and key ${when} the cell were not read`;
  }
  return null;
}

// One stage. `prior`: the stage before and whether it was set. -> {elsewhere: [why], fail: [why], missing: [why], summary}.
function judgeStage(stage, {attest, prior}) {
  const want = EXPECTED[stage.id];
  const out = {elsewhere: [], fail: [], missing: [], summary: null};
  const shape = malformed(stage, want);
  if (shape) return {...out, missing: [`malformed: ${shape}`]};
  if (stage.problem) return {...out, missing: [`not set: ${stage.problem}`]};
  if (!readBack(stage, want)) return {...out, missing: ['not set: the rows\' read-back is not recorded']};
  // Every answer classed first (ruling 1149): another engine's anywhere is NO VERDICT for the whole record.
  const attestations = stage.calls.map(c => (c.sent && !c.waited && c.resultPresent ? attest(c.nativeEngine) : {status: 'ok'}));
  stage.calls.forEach((c, i) => { if (!['ok', 'missing'].includes(attestations[i].status)) out.elsewhere.push(`${c.id} call: ${attestations[i].problem}`); });
  // Each cell's proof, judged apart: a cell without it is NO VERDICT for itself, its sibling still judged.
  const proven = stage.calls.map((c, i) => {
    if (!['ok', 'missing'].includes(attestations[i].status)) return false;
    const why = cellUnproved(c, attestations[i]);
    if (why) out.missing.push(`${c.id} call: ${why}`);
    return !why;
  });
  if (want.relaunch === 'engine stop' && !(stage.relaunch.stop?.ok === true && stage.relaunched === true)) { out.missing.push('not set: the relaunch is not shown'); return out; }
  const status = stage.status;
  if (want.recoveryAfter) {
    // The relaunch is owed to the engine that last refused Screen Recording on this connection (client.mjs).
    const last = prior?.set ? prior.stage.calls.filter(c => c.sent).at(-1) : null;
    const refusedBy = last && !last.waited && last.isError === true && last.metadata?.permission === 'screenRecording' ? last.statusAfter?.pid ?? null : null;
    const notSet = why => { out.missing.unshift(`not set: ${why}`); return out; };
    if (refusedBy === null || stage.relaunch.refusedBy !== refusedBy) return notSet(`the recovery follows a Screen Recording refusal in the ${want.recoveryAfter} stage, and none was observed`);
    const before = stage.relaunch.before ?? {};
    if (before.pid !== refusedBy) return notSet(`the engine before the retry (pid ${before.pid ?? 'unread'}) is not the one that refused Screen Recording (pid ${refusedBy})`);
    if (before.connections !== 1) return notSet(`${before.connections ?? 'unread'} connections at the engine before the retry, where only the test's may be`);
    const first = stage.calls[0];
    if (stage.relaunched === false && first.sent && !first.waited) return {...out, missing: [], fail: [`the product did not relaunch the engine for the Screen Recording grant (pid ${before.pid} throughout)`]};
    if (stage.relaunched !== true) out.missing.push('the relaunch was not read');
  }
  if (!status.read || !status.running) { out.missing.push(`capabilities unread (${status.problem ?? 'no engine running'})`); return out; }
  const unset = Object.entries(want.grants).filter(([key, value]) => status[key] !== value);
  if (unset.length) { out.missing.push(...unset.map(([key]) => `not set: ${key} reads ${status[key]} with the stage's rows`)); return out; }
  stage.calls.forEach((call, i) => {
    if (!proven[i]) return;
    const outcome = want.calls[call.id], where = `${call.id} call`;
    if (outcome === OK) {
      if (call.isError) out.fail.push(`${where}: refused (${call.metadata?.permission ?? call.errorName ?? 'an error'}) with the grants present: ${call.errorText ?? ''}`.trim());
      else if (call.id === 'accessibility' ? call.bound !== true : !(call.screenshotBytes > 0)) out.fail.push(`${where}: answered without its ${call.id === 'accessibility' ? 'bind' : 'screenshot'}`);
    } else if (!call.isError) out.fail.push(`${where}: answered where ${NAMES[outcome]} is missing`);
    else if (call.metadata?.permission !== outcome) out.fail.push(`${where}: cua/permission ${call.metadata?.permission ?? 'absent'}, expected ${outcome} (${call.errorText ?? ''})`);
    else if (call.guidance !== true) out.fail.push(`${where}: the refusal lacks the ${NAMES[outcome]} grant's steps or the approved bundle's path`);
  });
  const doctor = stage.doctor;
  if (!doctor?.received) out.missing.push(`doctor unread (${doctor?.problem ?? 'not run'})`);
  else {
    const differs = ['accessibility', 'screenRecording', 'inputMonitoring'].filter(key => doctor.permissions?.[key] !== status[key]);
    if (differs.length) out.fail.push(`doctor's permissions differ from the engine's status: ${differs.join(', ')}`);
    if (!doctor.engineRow?.present || !want.doctorRow.includes(doctor.engineRow.status)) out.fail.push(`doctor's engine row is ${doctor.engineRow?.status ?? 'absent'}, expected ${want.doctorRow.join(' or ')}`);
    if (doctor.engineRow?.interventionOff !== (status.inputMonitoring !== true)) out.fail.push(`doctor's engine row ${doctor.engineRow?.interventionOff ? 'says' : 'does not say'} intervention detection off with Input Monitoring ${status.inputMonitoring}`);
  }
  const refused = [...new Set(Object.values(want.calls).filter(o => o !== OK))].map(o => `refused ${NAMES[o]} with its steps`);
  out.summary = refused.length ? refused.join(', ') : want.recoveryAfter ? `recovered through the product's relaunch (pid ${stage.relaunch.before.pid} → ${stage.calls[0].statusAfter?.pid})`
    : `answered, intervention ${status.inputMonitoring ? 'on' : 'off'}`;
  return out;
}

// `path` and `exit`: where the record should be and how the driver ended, for the reason when there is none. `engine`:
// the side the step measures (plan.mjs's `engine`, cua's), which the record's expected attestation must be.
export function judgeOnboarding(record, {path = 'onboarding.json', exit = null, engine = 'cua'} = {}) {
  if (!record) return ['NO VERDICT', `no onboarding record at ${path} (exit ${exit})`];
  if (!isObject(record) || record.kind !== 'hosted-onboarding' || !Array.isArray(record.stages)) return ['NO VERDICT', `${path} is not an onboarding record`];
  if (record.hosted !== true) return ['NO VERDICT', 'not a hosted run'];
  const bad = record.stages.findIndex(s => !isObject(s));
  if (bad >= 0) return ['NO VERDICT', `malformed: stage ${bad + 1} is not a stage`];
  const ids = record.stages.map(s => s.id);
  if (ids.some((id, i) => id !== ORDER[i])) return ['NO VERDICT', `ambiguous: its stages are ${ids.join(', ')}, not ${ORDER.join(', ')} in that order`];
  const left = ORDER.length - record.stages.length;
  const notRun = left > 0 || !record.complete ? `incomplete: ${left} stage(s) not run${record.problem ? ` (${record.problem})` : ''}` : null;
  const expected = record.expected;
  if (!isObject(expected)) return ['NO VERDICT', notRun ?? 'the record names no expected engine attestation'];
  if (expected.engine !== engine || !expected.build) return ['NO VERDICT', `the record's engine is ${expected.engine}, not the ${engine} side the step measures`];
  const attest = attested => classifyAttestation(attested, expected);
  const elsewhere = [], fails = [], missing = [], summaries = [];
  try {
    let prior = null;
    for (const stage of record.stages) {
      const judged = judgeStage(stage, {attest, prior});
      elsewhere.push(...judged.elsewhere.map(why => `${stage.id}: ${why}`));
      fails.push(...judged.fail.map(why => `${stage.id}: ${why}`));
      missing.push(...judged.missing.map(why => `${stage.id}: ${why}`));
      if (judged.summary) summaries.push(`${stage.id}: ${judged.summary}`);
      prior = {stage, set: !judged.missing.some(why => why.startsWith('not set') || why.startsWith('malformed'))};
    }
  } catch (error) { return ['NO VERDICT', `malformed record: ${error.message}`]; }
  if (notRun) missing.push(notRun);
  if (elsewhere.length) return ['NO VERDICT', elsewhere.join('; ')];
  if (fails.length) return ['FAIL', fails.join('; ')];
  if (missing.length || summaries.length !== ORDER.length) return ['NO VERDICT', missing.join('; ') || 'a stage holds no evidence'];
  return ['PASS', `${summaries.join('; ')}; every result attested cua ${short(expected.build)}`];
}
