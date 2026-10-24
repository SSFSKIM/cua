// #117 M4, acceptance 8: owner-first fresh onboarding, split from accept-native item 9 into item 14.
// The harness never operates TCC UI. Manual Settings/fixture steps may be performed by the owner or a separately
// authorized coordinator; terminal answers do not establish who acted. Only the owner answers system alerts.
// Model-facing errors and service relaunch are proved on one MCP connection BEFORE approveEngine. runTextEdit
// cannot be used here: it binds/captures before returning. One manually prepared blank document receives two Xs.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {approveEngine, ENGINE_GRANTS, enginePaths, engineStatus, grantSteps, lineReader, stopEngine} from '../../src/runtime/engine.mjs';
import {engineBuild} from '../../src/runtime/engine-bundle.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {settingsFrom} from '../../src/mcp/server.mjs';
import {selectLane} from '../probe/pinned-engine.mjs';
import {approvalLedger, attestReplies} from './engine-lane.mjs';
import {openSession, resultText} from './mcp-session.mjs';
import {localFrontmost} from './key-guard.mjs';
import {readWindows, windowInventory} from './window-close.mjs';
import {setTimeout as sleep} from 'node:timers/promises';
import {rollup, TEXTEDIT_BUNDLE} from './lib.mjs';

const exec = promisify(execFile);
const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
const KEYS = ['accessibility', 'screenRecording', 'inputMonitoring'];
export const DEFAULT_OWNER_WINDOW_MINUTES = 25;
const OWNER_OBSERVATION_MS = 5 * 60_000;
export function ownerWindowMinutes(value = DEFAULT_OWNER_WINDOW_MINUTES) {
  if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 120) {
    throw new Error('--owner-window-minutes must be a whole number from 1 to 120 (default 25)');
  }
  return Number(value);
}
const ownerWindow = minutes => `Reserve ${minutes} minutes continuously for item 14 (--owner-window-minutes, default 25): remove the three entries and open ONE blank TextEdit document (File > New); grant Accessibility and verify warm-process detection-off diagnostics; grant Screen Recording with Later and observe recovery alerts; check input against the fresh process’s listen capability and observe alerts; explicitly grant Input Monitoring; approve, check and close only the disposable document without saving. Each owner alert-observation question waits at most 5 minutes, clipped by the remaining overall budget; manual Settings/fixture and approval confirmations use the remaining overall budget. The overall clock starts just before stopping the engine for revocation and never resets. Expiry stops new stages; bounded in-flight operations and cleanup may finish afterward, not forcibly cancel OS calls. Settings and fixture steps are manual; only the owner answers system alerts. This does not authorize a coordinator to operate Settings. An absent Input Monitoring row does not establish listen capability after relaunch; capability and metadata consistency does not prove physical intervention delivery.`;
const STAGES = ['preconditions', 'manual revocation', 'Accessibility error reaches the model', 'all three grants absent',
  'manual Accessibility grant', 'Screen Recording error reaches the model', 'AX-only intervention diagnostic', 'manual Screen Recording grant',
  'service relaunch recovery', 'owner recovery prompt observation', 'post-recovery input', 'owner input prompt observation',
  'post-recovery input: capability stability', 'post-recovery input: input completion', 'post-recovery input: metadata', 'post-recovery input: doctor', 'manual Input Monitoring grant', 'engine approval',
  'final grants and approved build', 'intervention on', 'manual TextEdit cleanup'];
const BIND = `globalThis.app = await cua.getApp(${JSON.stringify(TEXTEDIT_BUNDLE)});`;
const CAPTURE = `${BIND}\nnodeRepl.write(JSON.stringify({onboarding: true, bytes: (await app.getScreenshot({emit:false})).length}));`;

// The value guard is inside the cell, immediately before input, as in the TextEdit fixture. A missing/changed text
// view is not a blank document. The window-server identity is also checked outside the cell before every operation.
export const inputCell = prior => `{
  const tree = await app.getAXState({emit:false, disableDiffing:true});
  const views = tree.split('\\n').filter(line => /^\\s*\\d+ /.test(line) && line.includes('First Text View'));
  const details = views.length === 1 ? views[0].match(/^\\s*\\d+ [^(]+ \\(settable\\) (.*)$/)?.[1] : null;
  if (details !== ${JSON.stringify(prior === '' ? 'First Text View' : `Value: ${prior}, ID: First Text View`)}) throw new Error('onboarding: the blank fixture document changed; no input sent');
  await app.typeText('X');
  nodeRepl.write(JSON.stringify({onboarding:true, typed:true}));
}`;

export function permissionGuidance(reply, {permission, bundlePath}) {
  const grant = ENGINE_GRANTS.find(grant => grant.key === permission);
  if (!grant) return false;
  const text = resultText(reply);
  const printed = text.match(/\benter ["“]?(.+?\.app)["”]?, then\b/)?.[1];
  return reply?.result?._meta?.['cua/permission'] === permission
    && reply?.result?.isError === true && /(?:-10014|permissionsPending)/.test(text)
    && text.includes('cua Engine') && text.includes('System Settings') && text.includes('Privacy & Security')
    && text.includes(grant.pane) && /["“]?\+["”]?/.test(text) && printed === bundlePath
    && (permission !== 'screenRecording' || /relaunch[^\n]*pending|pending[^\n]*relaunch/i.test(text));
}

async function textEditPids() {
  try { return (await exec('/usr/bin/pgrep', ['-x', 'TextEdit'])).stdout.trim().split(/\s+/).filter(Boolean).map(Number); }
  catch (error) { if (error.code === 1) return []; throw error; }
}
// TextEdit has internal off-screen layer-0 windows (M3 observed five even on its own fixture launch). Only the one
// visible window is the fixture. Keep the others' bounds as evidence, never their names or any action on them.
export function onboardingWindow(windows, pid) {
  const {visible, offScreenBounds} = windowInventory(windows.filter(w => w.ownerPid === pid));
  return visible.length === 1 ? {pid, number: visible[0].number, offScreenBounds} : null;
}
async function fixtureWindow() {
  const pids = await textEditPids();
  if (pids.length !== 1) return null;
  const windows = await readWindows(pids);
  return windows && onboardingWindow(windows, pids[0]);
}
async function focusTextEdit() {
  await exec('/usr/bin/open', ['-a', 'TextEdit'], {timeout: 15_000});
  for (let attempt = 0; attempt < 20; attempt++) {
    if (localFrontmost() === TEXTEDIT_BUNDLE) return true;
    await sleep(100);
  }
  return false;
}
const payloadData = reply => {
  const line = resultText(reply).split('\n').findLast(s => s.startsWith('{"onboarding":'));
  try { return JSON.parse(line); } catch { return null; }
};
const payload = reply => reply?.result?.isError || reply?.error || reply?.timedOut ? null : payloadData(reply);
const bool = value => typeof value === 'boolean' ? value : null;
const number = value => Number.isFinite(value) ? value : null;
const choice = (value, allowed) => value == null ? null : allowed.includes(value) ? value : 'unrecognized';
const permissions = value => Object.fromEntries(KEYS.map(key => [key, bool(value?.[key])]));

// Allowlist facts, never content, error text, screenshots, arbitrary metadata or signing identity. An error may
// carry a posted route/interval even when typeText never returned; keep that evidence without calling it success.
function replyFacts(reply) {
  const result = reply?.result, meta = result?._meta, data = payloadData(reply);
  return {
    completion: reply?.timedOut ? 'timeout' : reply?.error || result?.isError ? 'error' : result ? 'returned' : 'missing-result',
    resultPresent: Boolean(result), isError: bool(result?.isError), transportError: Boolean(reply?.error),
    typed: bool(data?.typed), screenshotBytes: Number.isSafeInteger(data?.bytes) && data.bytes >= 0 ? data.bytes : null,
    metadata: {
      interventionPresent: Object.hasOwn(meta ?? {}, 'cua/intervention'),
      intervention: choice(meta?.['cua/intervention'], ['off']),
      inputRoute: choice(meta?.['cua/inputRoute'], [1, "2'", 2, 3, 4, 'paste']),
      actionInterval: {startedAt: number(meta?.['cua/actionInterval']?.startedAt), endedAt: number(meta?.['cua/actionInterval']?.endedAt)},
      receivedAt: number(meta?.['cua/receivedAt']), hidIdleMs: number(meta?.['cua/hidIdleMs']), entered: number(meta?.['cua/entered']),
    },
  };
}
function doctorFacts(doctor) {
  const row = doctor?.checks?.find(c => c.name === 'engine');
  return {permissions: permissions(doctor?.engine?.permissions),
    engineRow: {present: Boolean(row), status: choice(row?.status, ['pass', 'warn', 'fail', 'skip']),
      interventionOff: typeof row?.detail === 'string' && /intervention detection off/.test(row.detail)}};
}
const PROMPT_RESPONSES = ['accessibility:allow', 'accessibility:deny', 'screen-recording:allow', 'screen-recording:deny',
  'screen-recording:later', 'capture:allow', 'capture:deny', 'other:answered'];
function promptAnswers(answer) {
  if (answer === 'none') return [];
  const tokens = answer?.split(/\s+/);
  return tokens?.length && tokens.every(token => PROMPT_RESPONSES.includes(token))
    ? tokens.map(token => { const [kind, response] = token.split(':'); return {kind, response}; }) : null;
}

// Boundary injection is for hermetic coverage of the actual sequence, not a second implementation of the flow.
export async function runFreshOnboarding({home, engine, requested = false, ownerWindowMinutes: minutes = DEFAULT_OWNER_WINDOW_MINUTES}, deps = {}) {
  minutes = ownerWindowMinutes(minutes); // reject before any engine, terminal or permission work
  const checks = [], observations = {ownerWindow: ownerWindow(minutes),
    ownerBudget: {minutes, observationLimitMs: OWNER_OBSERVATION_MS, startedAt: null, deadlineAt: null, expiredAt: null},
    ownerWaits: [], windows: [], cells: [], statuses: [], doctors: [], recoveryPrompts: []};
  const now = deps.now ?? Date.now;
  let ownerDeadline = null;
  const record = (name, status, detail) => checks.push({name, status, detail});
  const finish = () => {
    for (const name of STAGES) if (!checks.some(c => c.name === name)) record(name, 'BLOCKED', 'not reached; no pass inferred');
    return {status: rollup(checks.map(c => c.status)), checks, observations};
  };
  const platform = deps.platform ?? process.platform;
  if (!requested || platform !== 'darwin' || engine?.engine !== 'cua') {
    record('preconditions', 'BLOCKED', 'owner-run only: --items 14 --engine cua --fresh-onboarding on macOS, during the booked owner window');
    return finish();
  }
  if (!deps.operator && !process.stdin.isTTY) {
    record('preconditions', 'BLOCKED', 'needs an interactive terminal and the owner at the console; no grants or engine state were changed');
    return finish();
  }
  const log = deps.log ?? (message => console.error(`fresh-onboarding: ${message}`));
  const operator = deps.operator ?? lineReader();
  const status = deps.status ?? engineStatus;
  const stop = deps.stop ?? stopEngine;
  const window = deps.window ?? fixtureWindow;
  const textEditStopped = deps.textEditStopped ?? (async () => (await textEditPids()).length === 0);
  const env = {...process.env, CUA_HOME: home, CUA_NATIVE_ENGINE: 'cua', CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: 'off'};
  const prepare = deps.prepare ?? (async () => {
    const {expected} = selectLane({pin: engine, serveEnv: env, home, runtime: resolveRuntime({home}), surfaces: settingsFrom(env).surfaces});
    return {expected, bundlePath: enginePaths().bundle};
  });
  const readDoctor = deps.doctor ?? (async () => {
    // Doctor may exit 1 for the deliberately absent Screen Recording grant or unrelated informational account rows.
    // Each stage judges the required engine evidence, not the overall doctor verdict.
    let result;
    try { result = await exec(process.execPath, [CLI, 'doctor', '--json'], {env, timeout: 60_000}); }
    catch (error) { if (error.code !== 1 || !error.stdout) throw error; result = error; }
    return JSON.parse(result.stdout);
  });
  const doctorSaysInterventionOff = doctor => doctor.permissions.inputMonitoring === false && doctor.engineRow.interventionOff;
  const retainDoctor = async () => {
    const evidence = {stage, received: false};
    observations.doctors.push(evidence);
    const doctor = await readDoctor();
    Object.assign(evidence, {received: true}, doctorFacts(doctor));
    return evidence;
  };
  const retainStatus = async name => {
    const value = await status();
    observations.statuses.push({stage: name, pid: number(value.status?.pid), connections: number(value.status?.connections),
      ...permissions(value.status), canPostHid: bool(value.status?.canPostHid)});
    return value;
  };
  const ledger = approvalLedger({app: TEXTEDIT_BUNDLE});
  const connect = deps.connect ?? (() => openSession({args: [CLI, 'serve'], env, clientName: 'cua-fresh-onboarding', onServerRequest: msg => ledger.answer('onboarding', msg)}));
  let session = null, ownedWindow = null, stage = 'preconditions';
  const require = (ok, detail, verdict = 'FAIL') => {
    if (!ok) throw Object.assign(new Error(detail), {verdict, harnessDetail: true});
  };
  const stopAfterRecordedChecks = Symbol('stop after recorded checks');
  const failureDetail = error => error.harnessDetail ? error.message
    : 'external operation failed; raw error text omitted (see retained stage operands)';
  const checkOwnerBudget = (at = now()) => {
    if (ownerDeadline !== null && at >= ownerDeadline) {
      observations.ownerBudget.expiredAt ??= at;
      require(false, `overall ${minutes}-minute owner window expired; no later grant, approval or input stage may start`, 'BLOCKED');
    }
  };
  const answer = async ({signal, observation = false} = {}) => {
    const startedAt = now();
    checkOwnerBudget(startedAt);
    const deadlineAt = observation ? Math.min(startedAt + OWNER_OBSERVATION_MS, ownerDeadline) : ownerDeadline;
    const limit = deadlineAt === ownerDeadline ? 'overall' : 'observation';
    const evidence = {stage, startedAt, deadlineAt, waitMs: deadlineAt - startedAt, finishedAt: null, expiredBound: null, cancelled: false};
    observations.ownerWaits.push(evidence);
    log(`Terminal wait: at most ${Math.ceil(evidence.waitMs / 1000)} seconds (${limit} bound); the overall owner clock does not reset.`);
    const expired = Symbol('expired'), cancelled = Symbol('cancelled');
    let timer, abort;
    try {
      const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(expired), evidence.waitMs); });
      const cancellation = new Promise(resolve => {
        abort = () => resolve(cancelled);
        signal?.addEventListener('abort', abort, {once: true});
        if (signal?.aborted) abort();
      });
      const reply = await Promise.race([timeout, cancellation, operator.next()]);
      evidence.finishedAt = now();
      if (reply === cancelled) { evidence.cancelled = true; return null; }
      if (reply === expired || evidence.finishedAt >= deadlineAt) {
        evidence.expiredBound = limit;
        if (evidence.finishedAt >= ownerDeadline) observations.ownerBudget.expiredAt ??= evidence.finishedAt;
        require(false, limit === 'overall' ? `overall ${minutes}-minute owner window expired while awaiting confirmation`
          : '5-minute observation wait expired; no response inferred and no later stage may start', 'BLOCKED');
      }
      return typeof reply === 'string' ? reply.trim().toLowerCase() : null;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  };
  const ask = async (name, message, word) => {
    stage = name;
    checkOwnerBudget();
    log(`MANUAL STEP (owner or separately authorized coordinator): ${message} Type ${word} here after completion (anything else stops). A terminal answer does not identify the UI actor; this harness performs no Settings action.`);
    const confirmed = await answer();
    require(confirmed === word, 'manual confirmation absent or declined; the harness did not perform this UI step', 'BLOCKED');
    record(name, 'PASS', `terminal confirmed (${confirmed}); UI actor not inferred; harness did not perform the UI step`);
    return confirmed;
  };
  const observePrompts = async (name, interval) => {
    stage = name;
    const evidence = {stage: interval.stage, source: 'owner-observed', origin: 'unknown',
      startedAt: interval.startedAt, finishedAt: interval.finishedAt, reportedAt: null, confirmed: false, prompts: null};
    observations.recoveryPrompts.push(evidence);
    log('OWNER ONLY: report every system alert observed during the preceding action, not just capture alerts. Answer alerts yourself; stop on a password prompt and never enter a password for automation. Once none remains, type none, or space-separated kind:response tokens: ' + PROMPT_RESPONSES.join(', ') + '. The terminal may relay the owner’s observation; kind is the visible alert category, not proof of its origin. Do not type alert text.');
    let confirmed;
    try {
      confirmed = await answer({observation: true});
      if (confirmed !== null) evidence.reportedAt = now();
    } finally { evidence.observationEndedAt = now(); }
    evidence.prompts = promptAnswers(confirmed);
    evidence.confirmed = evidence.prompts !== null;
    require(evidence.confirmed, 'owner-observed prompt state absent or unrecognized; no further input or grant stage attempted', 'BLOCKED');
    record(name, 'PASS', 'terminal relayed owner-observed alert categories/responses for the timed action; prompt origin unknown');
  };
  const ensureWindow = async () => {
    const current = await window();
    require(current && current.pid === ownedWindow.pid && current.number === ownedWindow.number,
      'the manually prepared TextEdit window is missing or changed; no further observation or input sent', 'BLOCKED');
    observations.windows.push({stage, pid: current.pid, number: current.number,
      offScreenCount: current.offScreenBounds?.length ?? 0, offScreenBounds: current.offScreenBounds ?? []});
  };
  const cell = async (code, {bind = false, input = false, observe = null, allowTimeout = false} = {}) => {
    checkOwnerBudget();
    await ensureWindow();
    if (input) {
      checkOwnerBudget();
      log('OWNER: keep hands off the keyboard while the verified blank TextEdit document comes forward for one harmless X.');
      require(await (deps.focus ?? focusTextEdit)(), 'TextEdit focus could not be verified; no input sent', 'BLOCKED');
      await ensureWindow();  // open -a must not have created an Untitled window or Open panel
      require(await (deps.frontmost ?? localFrontmost)() === TEXTEDIT_BUNDLE,
        'TextEdit lost focus during the window check; no input sent', 'BLOCKED');
    }
    checkOwnerBudget();
    if (bind) ledger.begin('onboarding');
    if (observe) log('OWNER ONLY: observe and answer any system alert during the next action, including Accessibility-named alerts. Note its category and your response; the harness will ask immediately afterward. No alert is answered by the harness.');
    let reply;
    try { reply = await session.js(code, 60_000); }
    finally { if (bind) ledger.end(); }
    // Observation is prompted by the caller only after it has sampled and judged the action's operands.
    // An operator delay must neither become evidence of recovery nor discard already-returned input.
    require(allowTimeout || !reply?.timedOut, 'cell timed out; the owner may need to answer a macOS prompt', 'BLOCKED');
    return reply;
  };
  const close = async () => {
    const closing = session;
    session = null;
    const exit = await closing.close();
    require(exit?.code === 0 && !exit.forced && !exit.stuck, 'MCP connection did not close cleanly; approval is not attempted');
  };
  try {
    const {expected, bundlePath} = await prepare();
    const checkoutBuild = (deps.checkoutBuild ?? engineBuild)();
    require(expected.build === checkoutBuild, 'the selected approved engine build is not this checkout’s engineBuild; build and approve this checkout before the owner window');
    observations.checkoutBuild = checkoutBuild;
    const before = await status();
    require(before.approved === true && before.build === expected.build && before.approvedBuild === expected.build
      && before.bundlePath === bundlePath && before.signature?.identityMatches === true,
    'needs the approved engine at its fixed location, signed with the configured identity');
    require(!before.status || (before.status.bundlePath === bundlePath && before.status.build === expected.build),
      'the running engine is not the approved bundle/build; leave it alone');
    require(!before.status || before.status.connections === 0, 'another session uses the engine; leave it alone', 'BLOCKED');
    require(await textEditStopped(), 'TextEdit must be quit before this owner window; existing documents are left alone', 'BLOCKED');
    record(stage, 'PASS', 'approved engine verified; no live engine connection or TextEdit to disturb');
    log(observations.ownerWindow);
    observations.ownerBudget.startedAt = now();
    ownerDeadline = observations.ownerBudget.deadlineAt = observations.ownerBudget.startedAt + minutes * 60_000;
    // Stop before the owner removes entries: the first model request must read fresh grants, not a cached process.
    await stop();
    await ask('manual revocation', 'In System Settings > Privacy & Security, remove ONLY "cua Engine" with the minus (–) button from Accessibility, Screen & System Audio Recording, and Input Monitoring. Do not touch the vendor service, Terminal or any other entry. Never enter a password for automation. Then open ONE blank TextEdit document (File > New), with no other TextEdit windows; keep it open until the final step. The harness never performs revocation.', 'revoked');
    ownedWindow = await window();
    require(ownedWindow, 'needs exactly one on-screen TextEdit window for the manually prepared blank document', 'BLOCKED');
    const startSession = async () => {
      checkOwnerBudget();
      const raw = connect(), send = raw.js.bind(raw);
      raw.js = async (...args) => {
        const evidence = {stage, startedAt: now(), finishedAt: null, attestation: null, reply: null};
        observations.cells.push(evidence);
        try {
          const reply = await send(...args);
          evidence.reply = replyFacts(reply); // before attestReplies can refuse this result
          return reply;
        } finally { evidence.finishedAt = now(); }
      };
      session = attestReplies(raw, {expected,
        onAttested: () => {
          observations.cells.at(-1).attestation = 'matched';
          observations.attested = (observations.attested ?? 0) + 1;
        },
        onRefused: () => { observations.cells.at(-1).attestation = 'refused'; },
      });
      await session.initialize();
    };
    await startSession();
    stage = 'Accessibility error reaches the model';
    const axError = await cell(BIND, {bind: true});
    require(permissionGuidance(axError, {permission: 'accessibility', bundlePath}), 'model reply lacks permissionsPending and exact Accessibility +/approved-path guidance');
    log(grantSteps(ENGINE_GRANTS.find(grant => grant.key === 'accessibility'), bundlePath));
    record(stage, 'PASS', 'MCP js error names Accessibility, + and the exact approved bundle path');
    stage = 'all three grants absent';
    const revoked = await retainStatus('revoked');
    require(KEYS.every(key => revoked.status?.[key] === false), 'all three grants must read false on the freshly launched engine');
    record(stage, 'PASS', 'Accessibility, Screen Recording and Input Monitoring read false');
    await ask('manual Accessibility grant', 'Follow the verified Accessibility guidance just printed: add cua Engine with "+", enter its printed bundle path, then switch it on. Leave Screen Recording and Input Monitoring absent. Do not restart the engine; the harness verifies this same warm process before the Screen Recording stage.', 'granted');
    stage = 'Screen Recording error reaches the model';
    const screenError = await cell(BIND, {bind: true});
    require(permissionGuidance(screenError, {permission: 'screenRecording', bundlePath}), 'model reply lacks permissionsPending, exact Screen Recording +/approved-path guidance or relaunch-pending wording');
    log(grantSteps(ENGINE_GRANTS.find(grant => grant.key === 'screenRecording'), bundlePath) + '; the engine relaunch is pending until the retry.');
    const pending = await retainStatus('AX-only');
    require(pending.status?.accessibility === true && pending.status.screenRecording === false && pending.status.inputMonitoring === false,
      'AX-only stage did not leave the other two grants absent');
    require(Number.isInteger(revoked.status?.pid) && pending.status.pid === revoked.status.pid,
      'engine PID changed during the Accessibility-only grant; no relaunch belongs to that stage');
    record(stage, 'PASS', 'MCP js error names Screen Recording, +, exact approved path and pending relaunch');
    stage = 'AX-only intervention diagnostic';
    const axDoctor = await retainDoctor();
    const warm = await retainStatus('AX-only after doctor');
    require(warm.status?.pid === pending.status.pid && warm.status.accessibility === true
      && warm.status.screenRecording === false && warm.status.inputMonitoring === false && warm.status.canPostHid === false
      && pending.status.canPostHid === false,
    'warm AX-only detection-off proof requires the same PID before and after doctor, AX true and SR/listen/post false');
    require(axDoctor.permissions.accessibility === true && axDoctor.permissions.screenRecording === false
      && doctorSaysInterventionOff(axDoctor), 'AX-only doctor must report intervention detection off before Screen Recording is granted');
    record(stage, 'PASS', 'same-PID warm AX-only process reads listen/post false; doctor reports detection off; no pre-SR input attempted');
    await ask('manual Screen Recording grant', 'Follow the verified Screen Recording guidance just printed. Add ONLY cua Engine in Screen & System Audio Recording and switch it on. If macOS offers Quit & Reopen, choose Later. Leave the Input Monitoring row absent. Its absence does not predict the relaunched process’s listen capability; the harness reads that separately. Do not restart the engine yourself.', 'granted');
    stage = 'service relaunch recovery';
    const ready = await retainStatus('pre-relaunch');
    require(Number.isInteger(pending.status?.pid) && ready.status?.pid === pending.status.pid,
      'engine PID changed before our retry (perhaps Quit & Reopen); service relaunch is unproven', 'BLOCKED');
    require(ready.status.connections === 1, 'relaunch needs only this harness connection; another connection is present', 'BLOCKED');
    const recovered = await cell(CAPTURE, {bind: true, observe: true, allowTimeout: true});
    const after = await retainStatus('post-relaunch');
    observations.relaunch = {before: ready.status.pid, after: after.status?.pid ?? null};
    const recoveryVerdict = recovered?.timedOut ? 'BLOCKED'
      : payload(recovered)?.bytes > 0 && Number.isInteger(after.status?.pid) && after.status.pid !== ready.status.pid ? 'PASS' : 'FAIL';
    record(stage, recoveryVerdict, recovered?.timedOut ? 'capture retry timed out; retained status and owner observation do not prove recovery'
      : recoveryVerdict === 'PASS' ? 'same MCP connection recovered; engine PID changed during retry and screenshot bytes were nonempty (not emitted)'
        : 'same-connection retry did not relaunch the engine and return nonempty screenshot bytes');
    await observePrompts('owner recovery prompt observation', observations.cells.at(-1));
    if (recoveryVerdict !== 'PASS') throw stopAfterRecordedChecks;
    stage = 'post-recovery input';
    const inputBefore = await retainStatus('post-recovery input before');
    const listen = bool(inputBefore.status?.inputMonitoring);
    require(inputBefore.status?.pid === after.status.pid && listen !== null
      && listen === bool(after.status.inputMonitoring) && inputBefore.status.accessibility === true && inputBefore.status.screenRecording === true,
    'fresh-process capability sample changed or is unread after the owner observation; no input sent', 'BLOCKED');
    const inputReply = await cell(inputCell(''), {input: true, observe: true, allowTimeout: true});
    const inputEvidence = observations.cells.at(-1), input = inputEvidence.reply;
    // Collect all independent operands before judging any of them. A timed-out cell may still be running, so do not
    // start doctor in that case. Neither a posted interval nor an owner alert answer proves completed input.
    let doctor = null, inputAfter = null;
    if (!inputReply?.timedOut) {
      try { doctor = await retainDoctor(); } catch { /* received:false remains as the doctor operand */ }
      try { inputAfter = await retainStatus('post-recovery input after'); } catch { /* unavailable status fails stability */ }
    }
    const stable = inputAfter?.status?.pid === inputBefore.status.pid
      && inputAfter.status.accessibility === true && inputAfter.status.screenRecording === true && inputAfter.status.inputMonitoring === listen;
    const metadataMatches = input.metadata.interventionPresent && input.metadata.intervention === (listen ? null : 'off')
      && [1, "2'", 2, 3, 4, 'paste'].includes(input.metadata.inputRoute)
      && Number.isFinite(input.metadata.actionInterval.startedAt) && Number.isFinite(input.metadata.actionInterval.endedAt);
    const doctorMatches = doctor?.permissions.accessibility === true && doctor.permissions.screenRecording === true
      && doctor.permissions.inputMonitoring === listen && doctor.engineRow.present
      && ['pass', 'warn'].includes(doctor.engineRow.status) && doctor.engineRow.interventionOff === !listen;
    const verdicts = [
      ['capability stability', inputReply?.timedOut ? 'BLOCKED' : stable ? 'PASS' : 'FAIL',
        'the same recovered process must retain its AX/SR/listen capabilities across input and doctor'],
      ['input completion', input.completion === 'returned' && input.typed === true ? 'PASS' : inputReply?.timedOut ? 'BLOCKED' : 'FAIL',
        'typeText must return successfully and emit the typed marker; posted-action metadata alone is not completion'],
      ['metadata', inputReply?.timedOut ? 'BLOCKED' : metadataMatches ? 'PASS' : 'FAIL',
        'input metadata must match observed listen capability (false: off; true: explicit null), with route and action interval; physical intervention delivery is not proven'],
      ['doctor', inputReply?.timedOut ? 'BLOCKED' : doctorMatches ? 'PASS' : 'FAIL',
        'doctor permissions and its engine-row detection-off diagnostic must agree with the observed listen capability'],
    ];
    for (const [part, verdict, detail] of verdicts) record(`post-recovery input: ${part}`, verdict, detail);
    const interventionVerdict = rollup(verdicts.map(([, verdict]) => verdict));
    record(stage, interventionVerdict, interventionVerdict === 'PASS'
      ? 'input completed; metadata and doctor agree with the same fresh process’s observed listen capability; physical intervention delivery is not proven'
      : 'post-recovery operands did not all pass; see the separate capability, completion, metadata and doctor verdicts');
    await observePrompts('owner input prompt observation', inputEvidence);
    if (interventionVerdict !== 'PASS') throw stopAfterRecordedChecks;
    await ask('manual Input Monitoring grant', `In System Settings > Privacy & Security > Input Monitoring, add ONLY cua Engine with "+", press ⌘⇧G and enter ${bundlePath}, then explicitly switch it ON even if the listen preflight already read true. Do not perform an extra OFF trial. Choose Later if offered a restart; the approve step will relaunch.`, 'granted');
    stage = 'engine approval';
    await close();
    checkOwnerBudget();
    log('OWNER ONLY: stay at the console for cua engine approve. Answer any capture confirmation yourself; confirm at this terminal when approve asks.');
    // approveEngine can finish a grant poll without awaiting its terminal read. Cancel that unused read when
    // approval settles; on a timed-out read return its explicit abort word, never an implicit confirmation.
    const approvalReads = new AbortController();
    let approvalWaitError = null, approved;
    const approvalOperator = {next: async () => {
      try { return await answer({signal: approvalReads.signal}); }
      catch (error) { approvalWaitError ??= error; return 'n'; }
    }};
    try { approved = await (deps.approve ?? approveEngine)({operator: approvalOperator, log}); }
    finally { approvalReads.abort(); }
    if (approvalWaitError) throw approvalWaitError;
    checkOwnerBudget();
    require(approved.approved === true && approved.build === expected.build, 'approve did not approve the expected build');
    observations.approveCaptureConfirmation = approved.captureConfirmation ?? null;
    record(stage, 'PASS', 'approveEngine completed after the model-facing recovery; capture confirmation handled by the owner when requested');
    stage = 'final grants and approved build';
    const final = await status();
    require(final.approved === true && final.build === expected.build && final.approvedBuild === expected.build
      && final.bundlePath === bundlePath && final.signature?.identityMatches === true && KEYS.every(key => final.status?.[key] === true),
    'final engine/approved.json build, signature, location or three grants do not match');
    record(stage, 'PASS', 'all three grants true; engine and approved.json build match the same approved signed bundle');
    stage = 'intervention on';
    await startSession();
    const rebound = await cell(BIND, {bind: true});
    require(!rebound.result?.isError && !rebound.error && rebound.result, 'final bind failed');
    const on = await cell(inputCell('X'), {input: true});
    require(payload(on)?.typed === true && on.result._meta?.['cua/intervention'] === null
      && on.result._meta?.['cua/inputRoute'] != null && Number.isFinite(on.result._meta?.['cua/actionInterval']?.startedAt),
    'final input did not carry active intervention metadata');
    record(stage, 'PASS', 'second X typed after explicit grants and approval; route and posted-action interval present, intervention metadata no longer off; physical intervention delivery is not proven');
    await close();
    await ask('manual TextEdit cleanup', 'Close only the disposable fixture document containing the two Xs; choose Don’t Save only for that document. Quit TextEdit only if nothing else is open. If another/restored document or an unrelated save prompt appears, stop and report it for a per-case cleanup decision; enter anything other than closed here to record BLOCKED. Do not discard other documents to force TextEdit to exit.', 'closed');
    require(await textEditStopped(), 'TextEdit is still running; manual cleanup is not complete');
  } catch (error) {
    if (error !== stopAfterRecordedChecks) record(stage, error.verdict ?? 'FAIL', failureDetail(error));
    if (ownedWindow) log('Owner window stopped before completion. Manual recovery by the owner or a separately authorized coordinator is needed: restore missing grants and close only the disposable fixture TextEdit document without saving. Only the owner answers system alerts. If another/restored document or an unrelated save prompt appears, stop and report BLOCKED for a per-case cleanup decision; never discard it to force TextEdit to exit. No automated rollback is attempted.');
  } finally {
    if (session) {
      try { await close(); } catch (error) { record('connection cleanup', 'FAIL', failureDetail(error)); }
    }
    if (!deps.operator) operator.close();
  }
  return finish();
}
