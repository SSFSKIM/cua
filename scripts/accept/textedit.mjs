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
// It never touches another TextEdit window or document and never quits TextEdit (whether it was running before or
// was started by the `open`). The vendor asks before CUA first uses an app; the fixture accepts that elicitation only
// when it is exactly the pinned request for com.apple.TextEdit (scripts/accept/lib.mjs isTextEditApproval), for the
// session only (CUA_SHIM_PERSIST=session in this scratch home, never "always"), and declines every other request.
// That auto-answer lives only in this test harness; `cua serve` forwards approvals to its client unchanged. Two
// connections bind TextEdit in turn, so per-connection approval and the session files it leaves are observed.
// Anything that waits on a human (a macOS permission prompt) is never answered: the step times out and is BLOCKED with
// the action needed.
// With a secret, every server it starts reads a store outside the account's own (~/.config/claude-secrets is never
// read or written): it runs scripts/accept/serve-with-store.mjs with HOME set to a store home, which by default is a
// temporary $HOME this fixture creates, seeds with a generated value under a generated KEY through `cua secrets set` at
// a pty (scripts/accept/secret-seed.mjs) and removes in `finally`. Given a caller's key ({key, home}), it uses that
// home's store as it is, reads the expected value from the key's file in this process (never printed), and leaves
// both in place.
import {execFile, execFileSync} from 'node:child_process';
import {randomBytes, randomUUID} from 'node:crypto';
import {existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {NATIVE_SOCKET} from '../../src/runtime/doctor.mjs';
import {fileStore, storeDir} from '../../src/secrets/store.mjs';
import {socketHolders} from '../probe/lib.mjs';
import {fingerprints, textLeaks} from '../probe/leak-scan.mjs';
import {isTextEditApproval, TEXTEDIT_BUNDLE} from './lib.mjs';
import {openSession, resultText} from './mcp-session.mjs';
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
  type: 'connection A: type and observe the marker',
  closeA: 'connection A: close',
  bindB: 'connection B: bind TextEdit',
  closeDoc: 'connection B: close only the fixture document',
  closeB: 'connection B: close',
  removeDoc: 'remove the fixture document',
  teardown: 'every server the fixture started has exited',
  secretCreate: 'secret: the value in a fixture store',
  secretType: 'secret: type the reference',
  secretReadback: 'secret: target observation (plaintext readback, not confidentiality evidence)',
  secretCleanup: 'secret: cleanup',
};
export const OWN_STEPS = [STEP.preconditions, STEP.open, STEP.bindA, STEP.type, STEP.closeA, STEP.bindB, STEP.closeDoc, STEP.closeB, STEP.removeDoc, STEP.teardown];
export const SECRET_STEPS = [STEP.secretCreate, STEP.secretType, STEP.secretReadback, STEP.secretCleanup];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sh = (command, args) => { try { return execFileSync(command, args, {encoding: 'utf8'}); } catch (error) { return error.stdout ?? ''; } };
const textEditPids = () => sh('/usr/bin/pgrep', ['-x', 'TextEdit']).split('\n').filter(Boolean).map(Number);
const nativeHelpers = () => (existsSync(NATIVE_SOCKET) ? socketHolders(sh('/usr/sbin/lsof', ['-F', 'pc', NATIVE_SOCKET])) : [])
  .map(h => ({pid: h.pid, executable: sh('/bin/ps', ['-o', 'comm=', '-p', String(h.pid)]).trim()}));
const sessionFiles = home => { try { return readdirSync(join(home, 'state', 'codex', 'computer-use', 'sessions')).sort(); } catch { return []; } };

// The cell's last JSON line ({...}), or what it said instead.
function cellJson(reply) {
  if (reply.timedOut) return {timedOut: true};
  const text = resultText(reply);
  const line = text.split('\n').reverse().find(l => l.startsWith('{"fixture"'));
  if (line && !reply.result?.isError) { try { return JSON.parse(line); } catch {} }
  return {error: text.split('\n').filter(Boolean).at(-1)?.slice(0, 200) ?? (reply.error?.message ?? 'no output'), isError: true};
}
const out = fields => `nodeRepl.write(JSON.stringify({fixture: true, ...${fields}}))`;
// TextEdit's front window title and its text area's value, from its accessibility text (emit:false: nothing is
// displayed; the cell decides what to report). No cell reports another window's title.
const OBSERVE = `const __ax = await app.getAXState({emit: false, disableDiffing: true});
const __window = __ax.match(/^Window: "([^"]*)"/m)?.[1] ?? null;
const __value = __ax.match(/Value: (.*?), ID: First Text View/)?.[1] ?? "";`;
// An action cell: `action` runs only if the fixture's document is TextEdit's front window at that moment.
const guarded = (docName, action) => `const __front = (await app.getAXState({emit: false, disableDiffing: true})).match(/^Window: "([^"]*)"/m)?.[1] ?? null;
if (__front !== ${JSON.stringify(docName)}) { ${out('{identityLost: true}')}; } else {
${action}
}`;

// `secret`: false, true (a generated key and value in a temporary $HOME), or {key, home} (the caller's stored key).
export async function runTextEdit({home, secret = false, forbid = () => {}, stepMs = 60_000}) {
  const callerKey = secret && typeof secret === 'object' ? secret : null;
  const steps = [];
  const record = (name, status, detail) => { steps.push({name, status, detail}); return status === 'PASS'; };
  const observations = {elicitations: [], connections: []};
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
  const own = `__window === ${JSON.stringify(docName)}`;
  let docDir = null;      // created exclusively by this invocation
  let docOpen = false;
  let guiStopped = null;  // why no further input may be sent
  const sessions = [];

  const sessionIds = {};  // connection -> its runtime session ID, as the vendor's elicitation metadata names it
  const sessionFile = id => join(home, 'state', 'codex', 'computer-use', 'sessions', `${id}.toml`);
  const connection = name => {
    let entry = observations.connections.find(c => c.name === name);
    if (!entry) observations.connections.push(entry = {name, bound: false, approvalRequests: 0, approvalsAccepted: 0, sessionFileWhileOpen: false, sessionFileAfterClose: null});
    return entry;
  };
  const onServerRequest = name => msg => {
    const accepted = isTextEditApproval(msg);
    const id = msg.params?._meta?.['x-codex-turn-metadata']?.session_id;
    if (typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)) sessionIds[name] = id;
    observations.elicitations.push({connection: name, method: msg.method, app: msg.params?._meta?.tool_params?.app ?? null,
      message: String(msg.params?.message ?? '').slice(0, 120), answer: accepted ? 'accept (session)' : 'decline'});
    if (msg.method === 'elicitation/create') {
      connection(name).approvalRequests++;
      if (accepted) connection(name).approvalsAccepted++;
    }
    return accepted ? {action: 'accept', content: {}} : {action: 'decline'};
  };
  const connect = async name => {
    connection(name);
    const session = openSession({
      args: secret ? [SERVE_WITH_STORE] : [CLI, 'serve'], clientName: 'cua-accept-textedit', onServerRequest: onServerRequest(name),
      env: {...process.env, CUA_HOME: home, CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: secret ? 'on' : 'off', ...(secret ? {HOME: storeHome} : {})},
    });
    sessions.push({name, session});
    await session.initialize();
    const ready = await session.js('nodeRepl.write("ready")', 120_000);  // the first cell also loads the vendor API
    if (ready.timedOut || ready.result?.isError) throw Object.assign(new Error(`${name}: the first cell failed`), {blocked: ready.timedOut});
    return session;
  };
  const closeSession = async (name, session, step) => {
    const exit = await session.close();
    record(step, exit.code === 0 && !exit.forced ? 'PASS' : 'FAIL', `exit ${exit.code ?? exit.signal}${exit.forced ? ' after a signal' : ''}`);
    connection(name).sessionFileAfterClose = Boolean(sessionIds[name]) && existsSync(sessionFile(sessionIds[name]));
  };
  // A cell found another window in front: it did nothing, and the fixture sends no further input.
  const lost = (step, what) => {
    guiStopped = `TextEdit's front window was not the fixture's document when it was about to ${what}`;
    return record(step, 'BLOCKED', `${guiStopped}; that cell did nothing and the fixture sent no further input. Bring the fixture document to the front (or close it by hand) and re-run`);
  };
  // Bind TextEdit and prove its front window is the fixture's document.
  const bind = async (session, name, step) => {
    const reply = cellJson(await session.js(`globalThis.app = await cua.getApp(${JSON.stringify(TEXTEDIT_BUNDLE)});\n${OBSERVE}\n${out(`{own: ${own}}`)}`, stepMs));
    const entry = connection(name);
    entry.sessionFileWhileOpen = Boolean(sessionIds[name]) && existsSync(sessionFile(sessionIds[name]));
    if (reply.timedOut) return record(step, 'BLOCKED', `no answer within ${stepMs} ms; ${PROMPT_ACTION}`);
    if (reply.isError) return record(step, 'FAIL', `getApp failed: ${reply.error}`);
    if (!reply.own) return lost(step, 'bind it');
    entry.bound = true;
    return record(step, 'PASS', `front window is the fixture's own document; the vendor asked for approval ${entry.approvalRequests} time(s) on this connection`);
  };

  const textEditBefore = textEditPids();
  const helpersBefore = nativeHelpers();
  const sessionsBefore = sessionFiles(home);
  observations.textEdit = {runningBefore: textEditBefore.length > 0};
  // Returns early when a step cannot continue; cleanup and the result follow in any case.
  async function main() {
    const runtime = resolveRuntime({home});
    if (process.platform !== 'darwin' || !existsSync(TEXTEDIT_APP)) return record(STEP.preconditions, 'BLOCKED', `needs macOS with ${TEXTEDIT_APP}`);
    if (callerKey && isAccountHome(storeHome))
      return record(STEP.preconditions, 'FAIL', 'refused: the caller\'s store home is this account\'s own home; store the key under a temporary $HOME');
    record(STEP.preconditions, 'PASS', `runtime ${runtime.release}; TextEdit ${textEditBefore.length ? 'already running (left as it is)' : 'not running'}`);

    if (callerKey) {
      // The caller's value, read here only to compare the readback with; it is never printed or reported.
      try { value = await fileStore({dir: storeDir({HOME: storeHome})}).read(label); } catch (error) {
        return record(STEP.secretCreate, 'BLOCKED', `the caller's key could not be read from the store home given (${error.code ?? 'error'}: ${error.message})`);
      }
      // Checked before it becomes a leak fingerprint: a very short value's base64 fingerprints are empty and would match
      // every text, so nothing could be reported.
      if (value.length < 8 || /[\u0000-\u001f\u007f]/.test(value)) {
        value = null;
        return record(STEP.secretCreate, 'BLOCKED', 'the caller\'s value is shorter than 8 characters or holds a control character; store a longer one-line value');
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
    await new Promise((resolve, reject) => execFile('/usr/bin/open', ['-a', 'TextEdit', doc], error => error ? reject(error) : resolve()));
    docOpen = true;
    for (let i = 0; i < 50 && !textEditPids().length; i++) await sleep(100);
    await sleep(1000);  // let the document window come to the front
    record(STEP.open, textEditPids().length ? 'PASS' : 'FAIL', `a new empty file in a directory created for this run under $CUA_HOME opened in TextEdit${textEditBefore.length ? ' (already running)' : ' (started by the open)'}`);

    // Connection A: type the marker and observe it.
    const a = await connect('connection A');
    if (await bind(a, 'connection A', STEP.bindA)) {
      const typed = cellJson(await a.js(guarded(docName, `await app.typeText(${JSON.stringify(marker)});\n${OBSERVE}
const __shot = await app.getScreenshot({emit: false});
const __format = __shot[0] === 0xff && __shot[1] === 0xd8 ? "jpeg" : __shot[0] === 0x89 && __shot[1] === 0x50 ? "png" : "unknown";
${out(`{own: ${own}, valueIsMarker: ${own} && __value === ${JSON.stringify(marker)}, screenshot: {bytes: __shot.length, format: __format}}`)}`), stepMs));
      observations.screenshot = typed.screenshot ?? null;
      if (typed.timedOut) record(STEP.type, 'BLOCKED', `no answer within ${stepMs} ms; ${PROMPT_ACTION}`);
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
      if (secret) {
        const delivered = cellJson(await b.js(guarded(docName, `await app.typeText(${JSON.stringify(`{{secret:${label}}}`)});\n${out('{done: true}')}`), stepMs));
        const leakedBefore = textLeaks(b.transcript.join('\n') + b.stderr, prints);
        if (delivered.timedOut) record(STEP.secretType, 'BLOCKED', `no answer within ${stepMs} ms; ${PROMPT_ACTION}`);
        else if (delivered.identityLost) lost(STEP.secretType, 'type the reference');
        else record(STEP.secretType, !delivered.isError && delivered.done && !leakedBefore ? 'PASS' : 'FAIL', delivered.isError
          ? `failed: ${String(delivered.error).split(value).join('<value>')}` : leakedBefore ? 'the value appeared in the MCP transport or stderr before any readback' : 'typeText({{secret:<KEY>}}) returned; nothing so far carried the value (MCP transport, server/runtime stderr)');
        if (!guiStopped && steps.at(-1).status === 'PASS') {
          // Intentional plaintext readback from the target: target observation, not confidentiality evidence.
          const readback = cellJson(await b.js(`${OBSERVE}\n${out(`{own: ${own}, value: ${own} ? __value : null}`)}`, stepMs));
          const got = typeof readback.value === 'string' ? readback.value : '';
          if (readback.own === false) lost(STEP.secretReadback, 'read the document back');
          else record(STEP.secretReadback, readback.own && got === marker + value ? 'PASS' : readback.timedOut ? 'BLOCKED' : 'FAIL',
            readback.own && got === marker + value ? 'the document reads back the marker followed by exactly the stored value'
              : readback.timedOut ? `no answer within ${stepMs} ms` : readback.isError ? `the readback failed (${readback.error})`
                : `the document reads back something else (starts with the marker: ${got.startsWith(marker)}; ${got.length} characters, expected ${marker.length + value.length}; contains the value: ${got.includes(value)})`);
        }
      }
      if (!guiStopped) {
        // super+w only after confirming, in the same cell, that the fixture's window is in front. Right after it closes
        // TextEdit can briefly report no front window, so the observation is retried; the close counts as confirmed
        // only when TextEdit reports no window at all.
        const closed = cellJson(await b.js(guarded(docName, `await app.pressKey("super+w");
let __after = null, __error = null;
for (let attempt = 0; attempt < 6 && __after === null && __error === null; attempt++) {
  if (attempt) await new Promise(resolve => setTimeout(resolve, 500));
  try { __after = (await app.getAXState({emit: false, disableDiffing: true})).match(/^Window: "([^"]*)"/m)?.[1] ?? null; } catch (error) { __error = String(error?.message ?? error); }
}
${out(`{ownStillFront: __after === ${JSON.stringify(docName)}, otherFront: __after !== null && __after !== ${JSON.stringify(docName)}, noWindows: /noWindowsAvailable/.test(__error ?? ""), error: __error && !/noWindowsAvailable/.test(__error) ? __error.slice(0, 160) : undefined}`)}`), stepMs));
        if (closed.timedOut) record(STEP.closeDoc, 'BLOCKED', `no answer within ${stepMs} ms; ${PROMPT_ACTION}`);
        else if (closed.identityLost) lost(STEP.closeDoc, 'close it');
        else if (closed.isError) record(STEP.closeDoc, 'FAIL', `the close cell failed: ${closed.error}`);
        else if (closed.noWindows) { docOpen = false; record(STEP.closeDoc, 'PASS', 'super+w closed the verified fixture window; TextEdit then reported no window at all'); }
        else if (closed.ownStillFront) record(STEP.closeDoc, 'FAIL', 'the fixture document is still in front after super+w; close it by hand without saving elsewhere');
        else record(STEP.closeDoc, 'BLOCKED', closed.otherFront
          ? 'super+w went to the verified fixture window, but another TextEdit window (perhaps its Open panel) is now in front, so the document\'s absence cannot be confirmed; that window was not touched'
          : `the result of super+w could not be observed (${closed.error ?? 'no window reported'}); check TextEdit by hand`);
      }
    }
    await closeSession('connection B', b, STEP.closeB);
  }

  try {
    await main();
  } catch (error) {
    record('unexpected', error.blocked ? 'BLOCKED' : 'FAIL', `${error.message}${error.blocked ? `; ${PROMPT_ACTION}` : ''}`);
  } finally {
    // Every server this fixture started ends here, whatever happened: EOF, then SIGTERM, then SIGKILL, bounded.
    if (sessions.length) {
      const exits = await Promise.all(sessions.map(async ({name, session}) => ({name, exit: await session.terminate()})));
      const stuck = exits.filter(e => e.exit.stuck);
      record(STEP.teardown, stuck.length ? 'FAIL' : 'PASS', `${exits.map(e => `${e.name}: ${e.exit.stuck ? 'still alive after SIGTERM, killed' : `exit ${e.exit.code ?? e.exit.signal}${e.exit.forced ? ' after SIGTERM' : ''}`}`).join('; ')}`);
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
  observations.textEdit.startedByFixture = !textEditBefore.length && textEditAfter.length > 0;
  observations.textEdit.quitByFixture = false;
  observations.guiInputStopped = guiStopped;
  const after = sessionFiles(home);
  observations.sessionFiles = {before: sessionsBefore.length, after: after.length, addedByThisRun: after.filter(f => !sessionsBefore.includes(f)).length};
  observations.marker = 'a benign generated marker (CUAMARKER<hex>)';
  if (secret) observations.secretLabel = label;
  const status = steps.some(s => s.status === 'FAIL') ? 'FAIL' : steps.some(s => s.status === 'BLOCKED') || !steps.length ? 'BLOCKED' : 'PASS';
  return {scenario: secret ? 'live-textedit-with-secret' : 'live-textedit', status, steps, observations};
}
