// Live native fixture for acceptance 5 (and, with a secret, the optional UI delivery of acceptance 6), run only by
// `node scripts/accept-native.mjs --live-textedit [--live-secrets [--secret-key KEY]]`. Its whole GUI footprint:
//   - it creates one empty temporary document in a directory it creates exclusively under $CUA_HOME and opens it in
//     TextEdit (`open -a TextEdit <file>`);
//   - through `cua serve` it binds TextEdit and, inside every cell that types or closes, first checks that TextEdit's
//     front window IS that document; if it is not, that cell does nothing and the fixture sends no further input;
//   - it types a benign marker (and, with a secret, the reference {{secret:<KEY>}}),
//     reads it back through CUA (accessibility text and a screenshot, recorded as metadata), and closes only that
//     window (super+w; TextEdit autosaves a file-backed document into the temporary file, never a user location),
//     counting the close as confirmed only when TextEdit then reports no window at all;
//   - it removes its own directory (and a store it created) in `finally`, and ends every server it started.
// It never touches another TextEdit window or document. At the end it quits TextEdit only when this run started it, by
// the identity it recorded right after its `open` (./fixture-app.mjs: the one pid absent before the run and launched
// after it began, with that launch time; none or more than one records none, and a TextEdit running before is left as
// it is), and only when its close step confirmed TextEdit then held no window at all, so no document of anyone else's
// can be in it (unconfirmed, that TextEdit is left running and the step is BLOCKED). It then hands the front back to the application that was frontmost before the run (#157).
// The engine (#117 M3.4; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, acceptance 8): the caller pins
// one (`engine`, accept-native's --engine, scripts/probe/pinned-engine.mjs), every server runs with CUA_NATIVE_ENGINE set
// to it, and every js result must attest it (`_meta['cua/nativeEngine']`, the engine's version and build as the launcher
// selects it): the first mismatch sends nothing more on any connection and fails the run.
// Either engine's policy asks before CUA first uses an app in a connection; the fixture accepts that elicitation only
// while one of its binds runs and only when it is exactly the policy's request for com.apple.TextEdit (any display
// name: scripts/probe/lib.mjs isAppApproval), for the session only (CUA_SHIM_PERSIST=session in this scratch home, never
// "always"), and declines every other request, the same approval outside a bind included. That auto-answer lives only
// in this test harness; `cua serve` forwards approvals to its client unchanged. Approvals are observed by behaviour, per
// bind (./engine-lane.mjs approvalLedger), never by a file the host keeps: connection A binds TextEdit twice, the second
// bind answered by the connection's memory, and connection B binds it again in a new connection, which must ask again.
// Anything that waits on a human (a macOS permission prompt) is never answered: the step times out and is BLOCKED with
// the action needed.
// With a secret, every server it starts reads a store outside the account's own (~/.config/claude-secrets is never
// read or written): it runs scripts/accept/serve-with-store.mjs with HOME set to a store home, which by default is a
// temporary $HOME this fixture creates, seeds with a generated value under a generated KEY through `cua secrets set` at
// a pty (scripts/accept/secret-seed.mjs) and removes in `finally`. Given a caller's key ({key, home}), it uses that
// home's store as it is, reads the expected value from the key's file in this process (never printed), and leaves
// both in place. That server (./serve-with-store.mjs) selects the pinned engine from the account's own engine.json and
// approved engine (./secret-seed.mjs accountEngine), so the secret is delivered on either engine.
import {execFile, execFileSync} from 'node:child_process';
import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {NATIVE_SOCKET} from '../../src/runtime/doctor.mjs';
import {settingsFrom} from '../../src/mcp/server.mjs';
import {fileStore, storeDir} from '../../src/secrets/store.mjs';
import {socketHolders} from '../probe/lib.mjs';
import {selectLane} from '../probe/pinned-engine.mjs';
import {fingerprintable, fingerprints, textLeaks, UNFINGERPRINTABLE} from '../probe/leak-scan.mjs';
import {TEXTEDIT_BUNDLE} from './lib.mjs';
import {approvalLedger, ATTEST_STEP, AttestationRefusal, attestReplies} from './engine-lane.mjs';
import {localFrontmost, sendToPausedSession} from './key-guard.mjs';
import {awaitLaunch, cleanUpFixtureApp} from './fixture-app.mjs';
import {awaitClose, readWindows} from './window-close.mjs';
import {openSession, resultText} from './mcp-session.mjs';
import {pauseGate, pausing} from '../mini-pause.mjs';
import {createStoreHome, generatedKey, isAccountHome, removeStoreHome, seedSecret} from './secret-seed.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
const SERVE_WITH_STORE = fileURLToPath(new URL('./serve-with-store.mjs', import.meta.url));
const TEXTEDIT_APP = '/System/Applications/TextEdit.app';
const PROMPT_ACTION = 'a macOS permission (Accessibility/Screen Recording) prompt may be waiting; the fixture never answers one: a human must decide it, then re-run';

// Every step a complete run records, so a caller can tell a step that never ran from one that passed.
export const STEP = {
  preconditions: 'preconditions',
  open: 'open the fixture document',
  bindA: 'connection A: bind TextEdit',
  rebindA: 'connection A: bind TextEdit again in the same connection',
  type: 'connection A: type and observe the marker',
  closeA: 'connection A: close',
  bindB: 'connection B: bind TextEdit',
  closeDoc: 'connection B: close only the fixture document',
  closeB: 'connection B: close',
  removeDoc: 'remove the fixture document',
  teardown: 'every server the fixture started has exited',
  quitApp: 'quit the TextEdit this run started, and only it',
  front: 'hand the front back to the application frontmost before the run',
  attest: ATTEST_STEP,
  secretCreate: 'secret: the value in a fixture store',
  secretType: 'secret: type the reference',
  secretReadback: 'secret: the document holds exactly the stored value (compared by hash inside the cell)',
  secretCleanup: 'secret: cleanup',
};
export const OWN_STEPS = [STEP.preconditions, STEP.open, STEP.bindA, STEP.rebindA, STEP.type, STEP.closeA, STEP.bindB, STEP.closeDoc, STEP.closeB, STEP.teardown, STEP.quitApp,
  STEP.removeDoc, STEP.front, STEP.attest];
export const SECRET_STEPS = [STEP.secretCreate, STEP.secretType, STEP.secretReadback, STEP.secretCleanup];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sh = (command, args) => { try { return execFileSync(command, args, {encoding: 'utf8'}); } catch (error) { return error.stdout ?? ''; } };
const textEditPids = () => sh('/usr/bin/pgrep', ['-x', 'TextEdit']).split('\n').filter(Boolean).map(Number);
const nativeHelpers = () => (existsSync(NATIVE_SOCKET) ? socketHolders(sh('/usr/sbin/lsof', ['-F', 'pc', NATIVE_SOCKET])) : [])
  .map(h => ({pid: h.pid, executable: sh('/bin/ps', ['-o', 'comm=', '-p', String(h.pid)]).trim()}));

// The cell's last JSON line ({...}), or what it said instead.
function cellJson(reply) {
  if (reply.timedOut) return {timedOut: true};
  const text = resultText(reply);
  const line = text.split('\n').reverse().find(l => l.startsWith('{"fixture"'));
  if (line && !reply.result?.isError) { try { return JSON.parse(line); } catch {} }
  return {error: text.split('\n').filter(Boolean).at(-1)?.slice(0, 200) ?? (reply.error?.message ?? 'no output'), isError: true};
}
const out = fields => `nodeRepl.write(JSON.stringify({fixture: true, ...${fields}}))`;
// A cell's own names in a block: a connection's cells share one top level, where a second `const` of the same name
// (a second bind, a readback after a bind) would be a redeclaration. Only `globalThis.app` is meant to outlive a cell.
const scoped = code => `{\n${code}\n}`;
// TextEdit's front window title and its text area's value, from its accessibility text (emit:false: nothing is
// displayed; the cell decides what to report). No cell reports another window's title.
const OBSERVE = `const __ax = await app.getAXState({emit: false, disableDiffing: true});
const __window = __ax.match(/^Window: "([^"]*)"/m)?.[1] ?? null;
const __value = __ax.match(/Value: (.*?), ID: First Text View/)?.[1] ?? "";`;
// An action cell: `action` runs only if the fixture's document is TextEdit's front window at that moment.
export const guarded = (docName, action) => scoped(`const __front = (await app.getAXState({emit: false, disableDiffing: true})).match(/^Window: "([^"]*)"/m)?.[1] ?? null;
if (__front !== ${JSON.stringify(docName)}) { ${out('{identityLost: true}')}; } else {
${action}
}`);
const ownWindow = docName => `__window === ${JSON.stringify(docName)}`;
// Bind TextEdit (`globalThis.app`, kept for the connection's later cells) and report whether its front window is
// `docName`.
export const bindCell = docName => `globalThis.app = await cua.getApp(${JSON.stringify(TEXTEDIT_BUNDLE)});\n${scoped(`${OBSERVE}\n${out(`{own: ${ownWindow(docName)}}`)}`)}`;
// Read the document back as a hash, never its text: the value crosses neither the MCP stream nor the report.
export const readbackCell = (docName, marker) => scoped(`${OBSERVE}\nconst {createHash: __hash} = await import('node:crypto');
${out(`{own: ${ownWindow(docName)}, hash: ${ownWindow(docName)} ? __hash('sha256').update(__value, 'utf8').digest('hex') : null, startsWithMarker: __value.startsWith(${JSON.stringify(marker)}), chars: [...__value].length}`)}`);

// `engine`: the pinned engine ({engine, pinnedBy}, scripts/probe/pinned-engine.mjs pinLane's `pin`), null when none is
// driven. `secret`: false, true (a generated key and value in a temporary $HOME), or {key, home} (the caller's stored
// key). `pauseFile` (CUA_PAUSE_FILE, scripts/mini-pause.mjs): every cell waits at its boundary while the mini's CI runner
// is busy, and never aborts, the owner standing by; each pause is in the observations.
export async function runTextEdit({home, engine = null, secret = false, forbid = () => {}, stepMs = 60_000, pauseFile = process.env.CUA_PAUSE_FILE, frontmost = localFrontmost}) {
  const callerKey = secret && typeof secret === 'object' ? secret : null;
  const steps = [];
  const record = (name, status, detail) => { steps.push({name, status, detail}); return status === 'PASS'; };
  const ledger = approvalLedger({app: TEXTEDIT_BUNDLE});
  const observations = {elicitations: [], connections: ledger.connections(), pauses: [],
    ...(engine ? {engine: {engine: engine.engine, pinnedBy: engine.pinnedBy, expected: null, attested: 0}} : {})};
  let expected = null;    // the attestation every js result must carry, once the preconditions read it
  // A lost watcher keeps the sitting paused (onLost 'wait'), never aborts it: the owner is standing by.
  const pause = pauseGate({file: pauseFile, record: p => observations.pauses.push(p), onLost: 'wait'});
  // Like the value below, one unbroken upper-case token: TextEdit's autocorrect otherwise offers to capitalize a
  // lower-case first word and applies it when typing continues, rewriting text that was already observed.
  const marker = `CUAMARKER${randomBytes(6).toString('hex').toUpperCase()}`;
  const label = callerKey ? callerKey.key : generatedKey('CUA_ACCEPT_UI');
  // One unbroken upper-case token (no separators, no words): the target's own text substitutions (autocorrect at a word
  // boundary, smart dashes for "--", capitalization) act on typed text in an ordinary text view. A caller's value is
  // read from its file once the preconditions hold.
  let value = secret && !callerKey ? `CUAUI${randomBytes(16).toString('hex').toUpperCase()}` : null;
  if (value) forbid(value);
  let prints = value ? fingerprints(value) : [];
  let storeHome = callerKey ? callerKey.home : null;  // created by this invocation only without a caller's key
  let storeCreated = false;
  const docName = `cua-accept-${randomUUID()}.txt`;
  const own = ownWindow(docName);
  let docDir = null;      // created exclusively by this invocation
  let docOpen = false;
  let soleWindowConfirmed = false;  // the close step saw TextEdit's processes hold no window at all once the fixture's closed
  let guiStopped = null;  // why no further input may be sent
  const sessions = [];

  const onServerRequest = name => msg => {
    const answer = ledger.answer(name, msg);
    observations.elicitations.push({connection: name, method: msg.method, app: msg.params?._meta?.tool_params?.app ?? null,
      message: String(msg.params?.message ?? '').slice(0, 120), answer: answer.action === 'accept' ? 'accept (session)' : 'decline'});
    return answer;
  };
  // The serve's environment: the pinned engine set explicitly, so the account's ~/.config/cua/engine.json never
  // chooses it (with the secret, the store's temporary $HOME too).
  const serveEnv = () => ({...process.env, CUA_HOME: home, CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: secret ? 'on' : 'off',
    ...(engine ? {CUA_NATIVE_ENGINE: engine.engine} : {}), ...(secret ? {HOME: storeHome} : {})});
  // The first result attesting another engine stops the run: that cell's caller gets an AttestationRefusal, and no
  // later cell on any connection is sent (each throws it again).
  let refused = null;
  const connect = async name => {
    if (refused) throw refused;
    ledger.entry(name);
    const session = pausing(openSession({
      args: secret ? [SERVE_WITH_STORE] : [CLI, 'serve'], clientName: 'cua-accept-textedit', onServerRequest: onServerRequest(name), env: serveEnv(),
    }), pause, `the TextEdit sitting's ${name} cell`);
    attestReplies(session, {expected, onAttested: () => observations.engine.attested++, onRefused: problem => {
      refused = new AttestationRefusal(problem);
      guiStopped = `${name}: ${refused.message}`;
      record(STEP.attest, 'FAIL', `${guiStopped}; nothing more was sent on any connection`);
    }});
    sessions.push({name, session});
    await session.initialize();
    const ready = await session.js('nodeRepl.write("ready")', 120_000);  // the first cell also loads the computer API
    if (ready.timedOut || ready.result?.isError) throw Object.assign(new Error(`${name}: the first cell failed`), {blocked: ready.timedOut});
    return session;
  };
  const closeSession = async (name, session, step) => {
    const exit = await session.close();
    record(step, exit.code === 0 && !exit.forced ? 'PASS' : 'FAIL', `exit ${exit.code ?? exit.signal}${exit.forced ? ' after a signal' : ''}`);
  };
  // A cell found another window in front: it did nothing, and the fixture sends no further input.
  const lost = (step, what) => {
    guiStopped = `TextEdit's front window was not the fixture's document when it was about to ${what}`;
    return record(step, 'BLOCKED', `${guiStopped}; that cell did nothing and the fixture sent no further input. Bring the fixture document to the front (or close it by hand) and re-run`);
  };
  // A cell that types or sends a key runs only while TextEdit is this Mac's frontmost application (#162,
  // ./key-guard.mjs); otherwise nothing is sent, the skip is recorded (observations.keySkipped) and the step fails, and
  // the fixture sends no further input. -> the cell's reply, or null when it was skipped.
  const keyCell = async (session, step, keys, code) => {
    // The pause wait (pausing()) comes first, then the check, then the cell with no pause between them.
    const sent = await sendToPausedSession({session, target: TEXTEDIT_BUNDLE, keys, frontmost, args: [code, stepMs]});
    if (sent.sent) return sent.result;
    (observations.keySkipped ??= []).push(sent.skipped);
    guiStopped = `${sent.skipped.event}: ${keys.join(', ')} not sent, the frontmost application is ${sent.skipped.frontmost}, not TextEdit (#162)`;
    record(step, 'FAIL', `${guiStopped}; nothing was sent and the fixture sent no further input`);
    return null;
  };
  // Bind TextEdit and prove its front window is the fixture's document. Only while this runs is the connection's
  // approval for TextEdit accepted, and counted to this bind (the ledger); acceptance 8 judges the counts.
  const bind = async (session, name, step) => {
    const counted = ledger.begin(name);
    let reply;
    try {
      reply = cellJson(await session.js(bindCell(docName), stepMs));
    } finally { ledger.end(); }
    const asked = `the policy asked for approval ${counted.asked} time(s) during this bind`;
    if (reply.timedOut || reply.isError) counted.error = true;
    if (reply.timedOut) return record(step, 'BLOCKED', `no answer within ${stepMs} ms; ${PROMPT_ACTION}`);
    if (reply.isError) return record(step, 'FAIL', `getApp failed: ${reply.error}; ${asked}`);
    if (!reply.own) return lost(step, 'bind it');
    ledger.entry(name).bound = true;
    return record(step, 'PASS', `front window is the fixture's own document; ${asked}`);
  };

  // What the cleanup needs (./fixture-app.mjs): when the run began, the TextEdit pids already running, the front app.
  const runStartedAt = Date.now();
  const textEditBefore = textEditPids();
  const frontBefore = (() => { try { return frontmost(); } catch { return null; } })();
  let opened = false;  // `open` was called: a TextEdit may have been started by this run
  let launched = null;  // captureLaunch's reading right after the `open`: the run's own TextEdit, if it started one
  const helpersBefore = nativeHelpers();
  observations.textEdit = {runningBefore: textEditBefore.length > 0};
  // Returns early when a step cannot continue; cleanup and the result follow in any case.
  async function main() {
    const runtime = resolveRuntime({home});
    if (process.platform !== 'darwin' || !existsSync(TEXTEDIT_APP)) return record(STEP.preconditions, 'BLOCKED', `needs macOS with ${TEXTEDIT_APP}`);
    if (callerKey && isAccountHome(storeHome))
      return record(STEP.preconditions, 'FAIL', 'refused: the caller\'s store home is this account\'s own home; store the key under a temporary $HOME');
    // The host and engine the launcher selects for the pinned engine, as cua serve's connection selects them; a selection
    // it refuses (cua's engine not installed, say) is refused here, before any document is opened. Predicted with the
    // account's HOME, whose engine.json and approved engine the secret's server selects from too (accountEngine).
    if (engine) {
      try {
        ({expected} = selectLane({pin: engine, serveEnv: {...serveEnv(), HOME: process.env.HOME}, home, runtime, surfaces: settingsFrom(process.env).surfaces}));
      } catch (error) {
        return record(STEP.preconditions, 'FAIL', `the launcher refuses the ${engine.engine} engine here: [${error.code ?? 'error'}] ${error.message}`);
      }
      observations.engine.expected = expected;
    }
    record(STEP.preconditions, 'PASS', `runtime ${runtime.release}; ${engine ? `the ${engine.engine} engine pinned (${engine.pinnedBy}), version ${expected.version} build ${expected.build}; ` : ''}TextEdit ${textEditBefore.length ? 'already running (left as it is)' : 'not running'}`);

    if (callerKey) {
      // The caller's value, read here only to compare the readback with; it is never printed or reported.
      try { value = await fileStore({dir: storeDir({HOME: storeHome})}).read(label); } catch (error) {
        return record(STEP.secretCreate, 'BLOCKED', `the caller's key could not be read from the store home given (${error.code ?? 'error'}: ${error.message})`);
      }
      // Checked before it becomes a leak fingerprint (fingerprintable).
      if (!fingerprintable(value)) {
        value = null;
        return record(STEP.secretCreate, 'BLOCKED', `the caller's value ${UNFINGERPRINTABLE}`);
      }
      forbid(value);
      prints = fingerprints(value);
      record(STEP.secretCreate, 'PASS', `the caller's key ${label}, stored before this run in the store home given (left in place)`);
    } else if (secret) {
      storeHome = createStoreHome('cua-accept-textedit-');
      storeCreated = true;  // cleanup runs even if the seed is only partly confirmed
      const seeded = await seedSecret({home: storeHome, key: label, value, timeoutMs: 15_000});
      if (seeded.echoed) record(STEP.secretCreate, 'FAIL', 'the value appeared in terminal output');
      else if (seeded.timedOut) record(STEP.secretCreate, 'FAIL', `cua secrets set did not finish within 15 s (${seeded.prompts} prompt(s) answered)`);
      else if (seeded.exit !== 0 || !seeded.stored) record(STEP.secretCreate, 'FAIL', `cua secrets set exited ${seeded.exit ?? seeded.signal}, key stored: ${seeded.stored}: ${seeded.said}`);
      else record(STEP.secretCreate, 'PASS', 'a generated value stored under a generated key by cua secrets set at a pty, in a temporary $HOME');
      if (steps.at(-1).status !== 'PASS') return;
    }

    docDir = mkdtempSync(join(home, 'accept-textedit-'));
    const doc = join(docDir, docName);
    writeFileSync(doc, '', {mode: 0o600, flag: 'wx'});
    opened = true;
    await new Promise((resolve, reject) => execFile('/usr/bin/open', ['-a', 'TextEdit', doc], error => error ? reject(error) : resolve()));
    docOpen = true;
    // The run's own TextEdit, if the open started one, is identified now (pid and launch time), never later: a bounded
    // poll for the new pid, timed; past the bound a miss is recorded, never guessed.
    launched = await awaitLaunch({pids: textEditPids, before: textEditBefore, startedAt: runStartedAt});
    observations.textEdit.launch = {captured: Boolean(launched.launch), candidates: launched.candidates.length, waitedMs: launched.waitedMs, missed: launched.missed};
    await sleep(1000);  // let the document window come to the front
    record(STEP.open, textEditPids().length ? 'PASS' : 'FAIL', `a new empty file in a directory created for this run under $CUA_HOME opened in TextEdit${launched.launch ? ` (started by the open: pid ${launched.launch.pid})`
      : launched.candidates.length > 1 ? ` (TextEdit pids ${launched.candidates.join(', ')} all started since the run began; which is this run's is ambiguous, so none is recorded as its own)`
        : textEditBefore.length ? ' (already running)' : launched.missed ? ` (no new TextEdit pid within ${launched.waitedMs} ms of the open: a miss, so none is recorded as its own)` : ''}`);

    // Connection A: bind TextEdit twice (the second bind is answered by the connection's memory), then type the marker
    // and observe it.
    const a = await connect('connection A');
    if (await bind(a, 'connection A', STEP.bindA) && await bind(a, 'connection A', STEP.rebindA)) {
      const typedReply = await keyCell(a, STEP.type, ['typeText'], guarded(docName, `await app.typeText(${JSON.stringify(marker)});\n${OBSERVE}
const __shot = await app.getScreenshot({emit: false});
const __format = __shot[0] === 0xff && __shot[1] === 0xd8 ? "jpeg" : __shot[0] === 0x89 && __shot[1] === 0x50 ? "png" : "unknown";
${out(`{own: ${own}, valueIsMarker: ${own} && __value === ${JSON.stringify(marker)}, screenshot: {bytes: __shot.length, format: __format}}`)}`));
      const typed = typedReply ? cellJson(typedReply) : null;
      if (typed) observations.screenshot = typed.screenshot ?? null;
      if (!typed) { /* skipped: recorded by keyCell */ } else if (typed.timedOut) record(STEP.type, 'BLOCKED', `no answer within ${stepMs} ms; ${PROMPT_ACTION}`);
      else if (typed.identityLost) lost(STEP.type, 'type the marker');
      else record(STEP.type, !typed.isError && typed.own && typed.valueIsMarker && typed.screenshot?.bytes > 0 ? 'PASS' : 'FAIL',
        typed.isError ? `failed: ${typed.error}` : `accessibility value ${typed.valueIsMarker ? 'is exactly the typed marker' : 'differs from the typed marker'}; screenshot ${typed.screenshot?.format} ${typed.screenshot?.bytes} bytes (metadata only)`);
    }
    await closeSession('connection A', a, STEP.closeA);
    if (guiStopped) return;

    // Connection B: a new session binds TextEdit again (is approval asked again?), optionally delivers the secret,
    // then closes the fixture document.
    const b = await connect('connection B');
    if (await bind(b, 'connection B', STEP.bindB)) {
      const deliveredReply = secret ? await keyCell(b, STEP.secretType, ['typeText'], guarded(docName, `await app.typeText(${JSON.stringify(`{{secret:${label}}}`)});\n${out('{done: true}')}`)) : null;
      if (deliveredReply) {
        const delivered = cellJson(deliveredReply);
        const leakedBefore = textLeaks(b.transcript.join('\n') + b.stderr, prints);
        if (delivered.timedOut) record(STEP.secretType, 'BLOCKED', `no answer within ${stepMs} ms; ${PROMPT_ACTION}`);
        else if (delivered.identityLost) lost(STEP.secretType, 'type the reference');
        else record(STEP.secretType, !delivered.isError && delivered.done && !leakedBefore ? 'PASS' : 'FAIL', delivered.isError
          ? `failed: ${String(delivered.error).split(value).join('<value>')}` : leakedBefore ? 'the value appeared in the MCP transport or stderr before any readback' : 'typeText({{secret:<KEY>}}) returned; nothing so far carried the value (MCP transport, server/runtime stderr)');
        if (!guiStopped && steps.at(-1).status === 'PASS') {
          // The readback never carries the value: the cell hashes the document's text and returns the hash and the
          // marker check, so the value crosses neither the MCP stream nor the report. The whole transcript is scanned
          // again afterwards.
          const expectedHash = createHash('sha256').update(marker + value, 'utf8').digest('hex');
          const readback = cellJson(await b.js(readbackCell(docName, marker), stepMs));
          const exact = readback.own && readback.hash === expectedHash;
          const leakedAfter = textLeaks(b.transcript.join('\n') + b.stderr, prints);
          if (readback.own === false) lost(STEP.secretReadback, 'read the document back');
          else record(STEP.secretReadback, exact && !leakedAfter ? 'PASS' : readback.timedOut ? 'BLOCKED' : 'FAIL',
            exact && !leakedAfter ? 'the document holds the marker followed by exactly the stored value (SHA-256 compared inside the cell); the value appears nowhere in the MCP transport or stderr'
              : readback.timedOut ? `no answer within ${stepMs} ms` : readback.isError ? `the readback failed (${String(readback.error).split(value).join('<value>')})`
                : leakedAfter ? 'the value appeared in the MCP transport or stderr'
                  : `the document holds something else (starts with the marker: ${readback.startsWithMarker}; ${readback.chars} characters, expected ${[...(marker + value)].length})`);
        }
      }
      if (!guiStopped) {
        // super+w only after confirming, in the same cell, that the fixture's window is in front. The close is judged
        // from TextEdit's windows by number before and after (./window-close.mjs), never by observing TextEdit again:
        // an observation of a TextEdit with no window would reopen it, and its Open panel can show the owner's
        // documents.
        const pids = textEditPids();
        const before = await readWindows(pids);
        const closedReply = await keyCell(b, STEP.closeDoc, ['super+w'], guarded(docName, `await app.pressKey("super+w");\n${out('{pressed: true}')}`));
        const closed = closedReply ? cellJson(closedReply) : null;
        if (!closed) { /* skipped: recorded by keyCell */ } else if (closed.timedOut) record(STEP.closeDoc, 'BLOCKED', `no answer within ${stepMs} ms; ${PROMPT_ACTION}`);
        else if (closed.identityLost) lost(STEP.closeDoc, 'close it');
        else if (closed.isError) record(STEP.closeDoc, 'FAIL', `the close cell failed: ${closed.error}`);
        else {
          const verdict = await awaitClose({before, read: () => readWindows(pids)});
          if (verdict.closed) docOpen = false;
          soleWindowConfirmed = verdict.alone;
          record(STEP.closeDoc, verdict.status, verdict.detail);
        }
      }
    }
    await closeSession('connection B', b, STEP.closeB);
  }

  try {
    await main();
  } catch (error) {
    // A refusal on the attestation is recorded where it happened (STEP.attest).
    if (!(error instanceof AttestationRefusal)) record('unexpected', error.blocked ? 'BLOCKED' : 'FAIL', `${error.message}${error.blocked ? `; ${PROMPT_ACTION}` : ''}`);
  } finally {
    // Every server this fixture started ends here, whatever happened: EOF, then SIGTERM, then SIGKILL, bounded.
    if (sessions.length) {
      const exits = await Promise.all(sessions.map(async ({name, session}) => ({name, exit: await session.terminate()})));
      const stuck = exits.filter(e => e.exit.stuck);
      record(STEP.teardown, stuck.length ? 'FAIL' : 'PASS', `${exits.map(e => `${e.name}: ${e.exit.stuck ? 'still alive after SIGTERM, killed' : `exit ${e.exit.code ?? e.exit.signal}${e.exit.forced ? ' after SIGTERM' : ''}`}`).join('; ')}`);
    }
    if (opened) {
      const app = await cleanUpFixtureApp({name: 'TextEdit', bundle: TEXTEDIT_BUNDLE, run: {before: textEditBefore, front: frontBefore, launch: launched?.launch ?? null},
        alone: soleWindowConfirmed && !guiStopped, frontmost});
      observations.textEdit.quitByFixture = app.quit.length > 0;
      observations.front = {before: app.front.previous, atCleanup: app.front.before, after: app.front.after, restored: app.front.restored};
      const kept = app.keptBefore.length ? `; pid ${app.keptBefore.join(', ')}, running before, left as it is` : '';
      const [quitStatus, quitDetail] = app.remaining.length ? ['FAIL', `TextEdit pid ${app.remaining.join(', ')}, started by this run, did not exit after SIGTERM; quit it by hand`]
        : app.quit.length ? ['PASS', `quit the TextEdit this run started (pid ${app.quit.join(', ')}, identified by its launch right after the open)${kept}`]
          : app.leftRunning ? ['BLOCKED', `the TextEdit this run started (pid ${app.leftRunning}) was left running because its windows could not be confirmed to be only the fixture's (${guiStopped ?? 'the close step did not see TextEdit hold no window at all'}); nothing was signalled. Quit it by hand once nothing of yours is open in it`]
            : app.launch ? ['PASS', `nothing to quit: pid ${app.launch.pid}, the TextEdit this run started, is no longer that process (it exited, or the pid now has another launch time)${kept}`]
              : launched?.candidates.length > 1 ? ['BLOCKED', `nothing quit: TextEdit pids ${launched.candidates.join(', ')} all started after the run began, so which one this run started is ambiguous and none was recorded as its own; check TextEdit by hand`]
                : textEditBefore.length ? ['PASS', `nothing to quit: TextEdit was running before the run (pid ${textEditBefore.join(', ')}) and is left as it is`]
                  : ['PASS', 'nothing to quit: no TextEdit started by the open was seen right after it'];
      record(STEP.quitApp, quitStatus, quitDetail);
      record(STEP.front, app.front.restored ? 'PASS' : frontBefore ? 'FAIL' : 'BLOCKED', app.front.restored
        ? `${app.front.previous} is frontmost${app.front.before === app.front.previous ? ' (it still was)' : ` again (it was ${app.front.before ?? 'unreadable'})`}`
        : frontBefore ? `${frontBefore} was frontmost before the run; now ${app.front.after ?? 'unreadable'}` : 'the frontmost application before the run could not be read, so there is nothing to hand back to');
    }
    if (docDir) {
      rmSync(docDir, {recursive: true, force: true});  // created exclusively by this invocation (mkdtemp)
      record(STEP.removeDoc, existsSync(docDir) ? 'FAIL' : 'PASS', docOpen ? 'the file and its directory are gone, but its window may still be open in TextEdit' : 'the temporary file and the directory created for it are gone');
    }
    if (storeCreated) {
      const removed = await removeStoreHome({home: storeHome, key: label});
      record(STEP.secretCleanup, removed.keyGone && removed.homeGone ? 'PASS' : 'FAIL', removed.keyGone && removed.homeGone
        ? 'the generated key file and its temporary $HOME were removed' : `CLEANUP FAILED: remove the temporary home ${storeHome} by hand`);
    } else if (callerKey && steps.some(s => s.name === STEP.secretCreate)) {
      record(STEP.secretCleanup, 'PASS', 'nothing to remove: the caller owns the key and its store home, left as they were');
    }
  }

  const helpersAfter = nativeHelpers();
  const runtimeRoot = (() => { try { return resolveRuntime({home}).root; } catch { return null; } })();
  const describe = h => ({pid: h.pid, executable: h.executable.replace(homedir(), '~'),
    origin: runtimeRoot && h.executable.startsWith(runtimeRoot + '/') ? 'pinned runtime' : 'another installation (reused, not started or stopped by cua)'});
  observations.nativeHelper = {before: helpersBefore.map(describe), after: helpersAfter.map(describe),
    reused: helpersBefore.length > 0 && helpersAfter.some(h => helpersBefore.some(b => b.pid === h.pid))};
  const textEditAfter = textEditPids();
  observations.textEdit.runningAfter = textEditAfter.length > 0;
  observations.textEdit.startedByFixture = Boolean(launched?.launch);
  observations.textEdit.quitByFixture ??= false;
  observations.guiInputStopped = guiStopped;
  // A refusal recorded this step already; otherwise every result that came back attested the pinned engine.
  if (steps.some(s => s.name === STEP.preconditions && s.status === 'PASS') && !steps.some(s => s.name === STEP.attest)) {
    const attested = observations.engine?.attested ?? 0;
    record(STEP.attest, engine && attested > 0 ? 'PASS' : 'BLOCKED', !engine ? 'no engine is pinned: the computer surface is off on this Mac (CUA_SHIM_SURFACES)'
      : attested > 0 ? `${attested} result(s), each attesting the ${engine.engine} engine, version ${expected.version} build ${expected.build}` : 'no result came back to attest');
  }
  observations.marker = 'a benign generated marker (CUAMARKER<hex>)';
  if (secret) observations.secretLabel = label;
  const status = steps.some(s => s.status === 'FAIL') ? 'FAIL' : steps.some(s => s.status === 'BLOCKED') || !steps.length ? 'BLOCKED' : 'PASS';
  return {scenario: secret ? 'live-textedit-with-secret' : 'live-textedit', status, steps, observations};
}
