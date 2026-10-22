// #117 M4, acceptance 8: owner-first fresh onboarding, split from accept-native item 9 into item 14.
// No TCC operation is automated. The owner removes only cua Engine's three entries, then grants AX, SR (Later),
// and IM in stages. Model-facing errors and service relaunch are proved on one MCP connection BEFORE approveEngine.
// runTextEdit cannot be used for these stages: its monolithic scenario binds/captures before returning. The owner
// instead opens one blank TextEdit document, keeps it open, then quits without saving; the runner sends only two Xs.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {approveEngine, enginePaths, engineStatus, lineReader, stopEngine} from '../../src/runtime/engine.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {settingsFrom} from '../../src/mcp/server.mjs';
import {selectLane} from '../probe/pinned-engine.mjs';
import {approvalLedger, attestReplies} from './engine-lane.mjs';
import {openSession, resultText} from './mcp-session.mjs';
import {FRONT_WINDOW_SCRIPT, localFrontmost} from './key-guard.mjs';
import {setTimeout as sleep} from 'node:timers/promises';
import {rollup, TEXTEDIT_BUNDLE} from './lib.mjs';

const exec = promisify(execFile);
const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
const KEYS = ['accessibility', 'screenRecording', 'inputMonitoring'];
export const OWNER_WINDOW = '9 minutes continuously for item 14, inside the combined 12-minute owner window with the separate foreground trial: remove the three entries and open a blank TextEdit document (3); grant Accessibility (1); grant Screen Recording, choosing Later, and answer any capture confirmation (2); grant Input Monitoring (1); finish approval/checks and quit TextEdit without saving (2).';
const STAGES = ['preconditions', 'owner revocation', 'Accessibility error reaches the model', 'all three grants absent',
  'owner Accessibility grant', 'Screen Recording error reaches the model', 'owner Screen Recording grant',
  'service relaunch recovery', 'owner capture confirmation observation', 'intervention off', 'owner Input Monitoring grant', 'engine approval',
  'final grants and approved build', 'intervention on', 'owner TextEdit cleanup'];
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

export function permissionGuidance(reply, {pane, bundlePath}) {
  const text = resultText(reply);
  const printed = text.match(/\benter ["“]?(.+?\.app)["”]?, then\b/)?.[1];
  const permission = pane === 'Accessibility' ? 'accessibility' : 'screenRecording';
  return reply?.result?._meta?.['cua/permission'] === permission
    && reply?.result?.isError === true && /(?:-10014|permissionsPending)/.test(text)
    && text.includes('cua Engine') && text.includes('System Settings') && text.includes('Privacy & Security')
    && text.includes(pane) && /["“]?\+["”]?/.test(text) && printed === bundlePath
    && (pane !== 'Screen Recording' || /relaunch[^\n]*pending|pending[^\n]*relaunch/i.test(text));
}

async function textEditPids() {
  try { return (await exec('/usr/bin/pgrep', ['-x', 'TextEdit'])).stdout.trim().split(/\s+/).filter(Boolean).map(Number); }
  catch (error) { if (error.code === 1) return []; throw error; }
}
// TextEdit has internal off-screen layer-0 windows (M3 observed five even on its own fixture launch). Only the one
// visible window is the fixture. Keep the others' bounds as evidence, never their names or any action on them.
export function onboardingWindow(windows, pid) {
  const own = windows.filter(w => w.ownerPid === pid);
  const visible = own.filter(w => w.onScreen === true);
  if (visible.length !== 1) return null;
  const bounds = w => Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, w.bounds?.[key] ?? null]));
  return {pid, number: visible[0].number, offScreenBounds: own.filter(w => w.onScreen === false).map(bounds)};
}
async function fixtureWindow() {
  const pids = await textEditPids();
  if (pids.length !== 1) return null;
  const reading = JSON.parse((await exec('/usr/bin/swift', [FRONT_WINDOW_SCRIPT, 'windows', String(pids[0])], {timeout: 120_000})).stdout);
  return onboardingWindow(reading.windows, pids[0]);
}
async function focusTextEdit() {
  await exec('/usr/bin/open', ['-a', 'TextEdit'], {timeout: 15_000});
  for (let attempt = 0; attempt < 20; attempt++) {
    if (localFrontmost() === TEXTEDIT_BUNDLE) return true;
    await sleep(100);
  }
  return false;
}
const payload = reply => {
  if (reply?.result?.isError || reply?.error || reply?.timedOut) return null;
  const line = resultText(reply).split('\n').findLast(s => s.startsWith('{"onboarding":'));
  try { return JSON.parse(line); } catch { return null; }
};

// Boundary injection is for hermetic coverage of the actual sequence, not a second implementation of the flow.
export async function runFreshOnboarding({home, engine, requested = false}, deps = {}) {
  const checks = [], observations = {ownerWindow: OWNER_WINDOW, windows: []};
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
  const ledger = approvalLedger({app: TEXTEDIT_BUNDLE});
  const connect = deps.connect ?? (() => openSession({args: [CLI, 'serve'], env, clientName: 'cua-fresh-onboarding', onServerRequest: msg => ledger.answer('onboarding', msg)}));
  let session = null, ownedWindow = null, stage = 'preconditions';
  const require = (ok, detail, verdict = 'FAIL') => {
    if (!ok) throw Object.assign(new Error(detail), {verdict});
  };
  const ask = async (name, message, word) => {
    stage = name;
    const words = Array.isArray(word) ? word : [word];
    log(`OWNER ONLY: ${message} Type ${words.join(' / ')} here after the owner has done it (anything else stops).`);
    let timer;
    const answer = await Promise.race([operator.next(), new Promise(resolve => { timer = setTimeout(() => resolve(null), 15 * 60_000); })]);
    clearTimeout(timer);
    const confirmed = answer?.trim().toLowerCase();
    require(words.includes(confirmed), 'owner confirmation absent or declined; automation did not perform this step', 'BLOCKED');
    record(name, 'PASS', `owner confirmed at the terminal (${confirmed}); not performed by automation`);
    return confirmed;
  };
  const ensureWindow = async () => {
    const current = await window();
    require(current && current.pid === ownedWindow.pid && current.number === ownedWindow.number,
      'the owner-prepared TextEdit window is missing or changed; no further observation or input sent', 'BLOCKED');
    observations.windows.push({stage, pid: current.pid, number: current.number,
      offScreenCount: current.offScreenBounds?.length ?? 0, offScreenBounds: current.offScreenBounds ?? []});
  };
  const cell = async (code, {bind = false, input = false} = {}) => {
    await ensureWindow();
    if (input) {
      log('OWNER: keep hands off the keyboard while the verified blank TextEdit document comes forward for one harmless X.');
      require(await (deps.focus ?? focusTextEdit)(), 'TextEdit focus could not be verified; no input sent', 'BLOCKED');
      await ensureWindow();  // open -a must not have created an Untitled window or Open panel
      require(await (deps.frontmost ?? localFrontmost)() === TEXTEDIT_BUNDLE,
        'TextEdit lost focus during the window check; no input sent', 'BLOCKED');
    }
    if (bind) ledger.begin('onboarding');
    try {
      const reply = await session.js(code, 60_000);
      require(!reply.timedOut, 'cell timed out; the owner may need to answer a macOS prompt', 'BLOCKED');
      return reply;
    } finally { if (bind) ledger.end(); }
  };
  const close = async () => {
    const closing = session;
    session = null;
    const exit = await closing.close();
    require(exit?.code === 0 && !exit.forced && !exit.stuck, 'MCP connection did not close cleanly; approval is not attempted');
  };
  try {
    const {expected, bundlePath} = await prepare();
    const before = await status();
    require(before.approved === true && before.build === expected.build && before.approvedBuild === expected.build
      && before.bundlePath === bundlePath && before.signature?.identityMatches === true,
    'needs the approved engine at its fixed location, signed with the configured identity');
    require(!before.status || (before.status.bundlePath === bundlePath && before.status.build === expected.build),
      'the running engine is not the approved bundle/build; leave it alone');
    require(!before.status || before.status.connections === 0, 'another session uses the engine; leave it alone', 'BLOCKED');
    require(await textEditStopped(), 'TextEdit must be quit before this owner window; existing documents are left alone', 'BLOCKED');
    record(stage, 'PASS', 'approved engine verified; no live engine connection or TextEdit to disturb');
    log(OWNER_WINDOW);
    // Stop before the owner removes entries: the first model request must read fresh grants, not a cached process.
    await stop();
    await ask('owner revocation', 'In System Settings > Privacy & Security, remove ONLY "cua Engine" with the minus (–) button from Accessibility, Screen & System Audio Recording, and Input Monitoring. Do not touch the vendor service, Terminal or any other entry. Never enter a password for automation. Then open one new blank TextEdit document, with no other TextEdit windows; keep it open until the final step. Revocation is never automated.', 'revoked');
    ownedWindow = await window();
    require(ownedWindow, 'needs exactly one on-screen TextEdit window for the owner-prepared blank document', 'BLOCKED');
    const startSession = async () => {
      session = attestReplies(connect(), {expected, onAttested: () => { observations.attested = (observations.attested ?? 0) + 1; }});
      await session.initialize();
    };
    await startSession();
    stage = 'Accessibility error reaches the model';
    const axError = await cell(BIND, {bind: true});
    require(permissionGuidance(axError, {pane: 'Accessibility', bundlePath}), 'model reply lacks permissionsPending and exact Accessibility +/approved-path guidance');
    log(resultText(axError));
    record(stage, 'PASS', 'MCP js error names Accessibility, + and the exact approved bundle path');
    stage = 'all three grants absent';
    const revoked = await status();
    require(KEYS.every(key => revoked.status?.[key] === false), 'all three grants must read false on the freshly launched engine');
    record(stage, 'PASS', 'Accessibility, Screen Recording and Input Monitoring read false');
    await ask('owner Accessibility grant', 'Follow the Accessibility error just printed: add cua Engine with "+", enter its printed bundle path, then switch it on. Leave Screen Recording and Input Monitoring absent.', 'granted');
    stage = 'Screen Recording error reaches the model';
    const screenError = await cell(BIND, {bind: true});
    require(permissionGuidance(screenError, {pane: 'Screen Recording', bundlePath}), 'model reply lacks permissionsPending, exact Screen Recording +/approved-path guidance or relaunch-pending wording');
    log(resultText(screenError));
    const pending = await status();
    require(pending.status?.accessibility === true && pending.status.screenRecording === false && pending.status.inputMonitoring === false,
      'AX-only stage did not leave the other two grants absent');
    require(Number.isInteger(revoked.status?.pid) && pending.status.pid === revoked.status.pid,
      'engine PID changed during the Accessibility-only grant; no relaunch belongs to that stage');
    record(stage, 'PASS', 'MCP js error names Screen Recording, +, exact approved path and pending relaunch');
    await ask('owner Screen Recording grant', 'Follow the Screen Recording error just printed. Add ONLY cua Engine in Screen & System Audio Recording and switch it on. If macOS offers Quit & Reopen, choose Later. Leave Input Monitoring absent. Do not restart the engine yourself.', 'granted');
    stage = 'service relaunch recovery';
    const ready = await status();
    require(Number.isInteger(pending.status?.pid) && ready.status?.pid === pending.status.pid,
      'engine PID changed before our retry (perhaps Quit & Reopen); service relaunch is unproven', 'BLOCKED');
    require(ready.status.connections === 1, 'relaunch needs only this harness connection; another connection is present', 'BLOCKED');
    log('OWNER ONLY: the retry now captures. If a screen-capture confirmation appears, answer it yourself. Automation never answers it.');
    const recovered = await cell(CAPTURE, {bind: true});
    const after = await status();
    observations.relaunch = {before: ready.status.pid, after: after.status?.pid ?? null};
    require(payload(recovered)?.bytes > 0 && Number.isInteger(after.status?.pid) && after.status.pid !== ready.status.pid,
      'same-connection retry did not relaunch the engine and return nonempty screenshot bytes');
    record(stage, 'PASS', 'same MCP connection recovered; engine PID changed during retry and screenshot bytes were nonempty (not emitted)');
    observations.stage3CaptureConfirmation = {source: 'owner-observed', outcome: await ask('owner capture confirmation observation',
      'Did a capture confirmation appear during that retry? Answer it yourself if it did, then type answered. If none appeared, type none. Continue only when no capture prompt remains. This observation is separate from the later approve step’s log watch.', ['answered', 'none'])};
    stage = 'intervention off';
    const off = await cell(inputCell(''), {input: true});
    const doctor = await (deps.doctor ?? (async () => {
      // Doctor can exit 1 for unrelated informational account rows; this stage judges only its engine evidence.
      let result;
      try { result = await exec(process.execPath, [CLI, 'doctor', '--json'], {env, timeout: 60_000}); }
      catch (error) { if (error.code !== 1 || !error.stdout) throw error; result = error; }
      return JSON.parse(result.stdout);
    }))();
    require(payload(off)?.typed === true && off.result._meta?.['cua/intervention'] === 'off'
      && doctor.engine?.permissions?.inputMonitoring === false
      && /intervention detection off/.test(doctor.checks?.find(c => c.name === 'engine')?.detail ?? ''),
    'input must attest intervention off, and doctor must say detection is off while Input Monitoring is absent');
    record(stage, 'PASS', 'one X typed into the blank document; input meta says off and doctor says intervention detection off');
    await ask('owner Input Monitoring grant', `In System Settings > Privacy & Security > Input Monitoring, add ONLY cua Engine with "+", press ⌘⇧G and enter ${bundlePath}, then switch it on. Choose Later if offered a restart; the approve step will relaunch.`, 'granted');
    stage = 'engine approval';
    await close();
    log('OWNER ONLY: stay at the console for cua engine approve. Answer any capture confirmation yourself; confirm at this terminal when approve asks.');
    const approved = await (deps.approve ?? approveEngine)({operator, log});
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
    record(stage, 'PASS', 'second X typed; input route and posted-action interval present, intervention no longer off');
    await close();
    await ask('owner TextEdit cleanup', 'Quit TextEdit. The two Xs made the document dirty: choose Don’t Save. Leave no TextEdit running, as before this window.', 'closed');
    require(await textEditStopped(), 'TextEdit is still running; owner cleanup is not complete');
  } catch (error) {
    record(stage, error.verdict ?? 'FAIL', error.message);
    if (ownedWindow) log('Owner window stopped before completion. The owner must restore missing grants and quit the disposable TextEdit document without saving; no automated rollback is attempted.');
  } finally {
    if (session) {
      try { await close(); } catch (error) { record('connection cleanup', 'FAIL', error.message); }
    }
    if (!deps.operator) operator.close();
  }
  return finish();
}
