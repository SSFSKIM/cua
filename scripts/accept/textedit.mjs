// Live native fixture for acceptance 5 (and, with a secret, the optional UI delivery of acceptance 6), run only by
// `node scripts/accept-native.mjs --live-textedit [--live-keychain]`. Its whole GUI footprint:
//   - it creates one empty temporary document under $CUA_HOME and opens it in TextEdit (`open -a TextEdit <file>`);
//   - through `cua serve` it binds TextEdit, checks that TextEdit's front window IS that document before any input,
//     types a benign marker (and, with a secret, the reference {{secret:<label>}} of a disposable generated value),
//     reads it back through CUA (accessibility text and a screenshot, recorded as metadata), and closes only that
//     window (super+w; TextEdit autosaves a file-backed document into the temporary file, never a user location);
//   - it deletes the temporary file, and the disposable Keychain item in `finally`.
// It never touches another TextEdit window or document and never quits TextEdit (whether it was running before or
// was started by the `open`). The vendor asks before CUA first uses an app; the fixture accepts that elicitation only
// when it is exactly the pinned request for com.apple.TextEdit (scripts/accept/lib.mjs isTextEditApproval), for the
// session only (CUA_SHIM_PERSIST=session in this scratch home, never "always"), and declines every other request.
// That auto-answer lives only in this test harness; `cua serve` forwards approvals to its client unchanged. Two
// connections bind TextEdit in turn, so per-connection approval and the session files it leaves are observed.
// Anything that waits on a human (a macOS permission or Keychain prompt) is never answered: the step times out and is
// BLOCKED with the action needed.
import {execFile, execFileSync} from 'node:child_process';
import {randomBytes, randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {NATIVE_SOCKET} from '../../src/runtime/doctor.mjs';
import {HELPER_PATH, locateHelper} from '../../src/secrets/helper.mjs';
import {runCaptured} from '../../src/secrets/commands.mjs';
import {PTY_DRIVER, setThroughTerminal} from '../../native/keychain/fixtures/seed.mjs';
import {socketHolders} from '../probe/lib.mjs';
import {fingerprints, textLeaks} from '../probe/leak-scan.mjs';
import {isTextEditApproval, TEXTEDIT_BUNDLE} from './lib.mjs';
import {openSession, resultText} from './mcp-session.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
const TEXTEDIT_APP = '/System/Applications/TextEdit.app';
const PROMPT_ACTION = 'a macOS permission (Accessibility/Screen Recording) or Keychain prompt may be waiting; the fixture never answers one: a human must decide it, then re-run';
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
// The front window's title, and the text area's value, from TextEdit's accessibility text (emit:false: nothing is
// displayed; the cell decides what to report).
const OBSERVE = `const __ax = await app.getAXState({emit: false, disableDiffing: true});
const __window = __ax.match(/^Window: "([^"]*)"/m)?.[1] ?? null;
const __value = __ax.match(/Value: (.*?), ID: First Text View/)?.[1] ?? "";`;

export async function runTextEdit({home, secret = false, forbid = () => {}, stepMs = 60_000}) {
  const steps = [];
  const record = (name, status, detail) => { steps.push({name, status, detail}); return status === 'PASS'; };
  const observations = {elicitations: [], connections: []};
  const marker = `cua-accept-marker-${randomBytes(6).toString('hex')}`;
  const label = `cua-accept-ui-${randomUUID()}`;
  const value = secret ? `cua-accept-ui-${randomBytes(18).toString('base64url')}` : null;
  if (value) forbid(value);
  const prints = value ? fingerprints(value) : [];
  const docDir = join(home, 'accept-textedit');
  const docName = `cua-accept-${randomUUID()}.txt`;
  const doc = join(docDir, docName);
  let created = false;
  let docOpen = false;
  const sessions = [];

  const sessionIds = {};  // connection -> its runtime session ID, as the vendor's elicitation metadata names it
  const sessionFile = id => join(home, 'state', 'codex', 'computer-use', 'sessions', `${id}.toml`);
  const onServerRequest = connection => msg => {
    const accepted = isTextEditApproval(msg);
    const id = msg.params?._meta?.['x-codex-turn-metadata']?.session_id;
    if (typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)) sessionIds[connection] = id;
    observations.elicitations.push({connection, method: msg.method, app: msg.params?._meta?.tool_params?.app ?? null,
      message: String(msg.params?.message ?? '').slice(0, 120), answer: accepted ? 'accept (session)' : 'decline'});
    return accepted ? {action: 'accept', content: {}} : {action: 'decline'};
  };
  const noteSessionFileAfterClose = name => {
    const connection = observations.connections.find(c => c.name === name);
    if (connection) connection.sessionFileAfterClose = Boolean(sessionIds[name]) && existsSync(sessionFile(sessionIds[name]));
  };
  const connect = async name => {
    const session = openSession({
      args: [CLI, 'serve'], clientName: 'cua-accept-textedit', onServerRequest: onServerRequest(name),
      env: {...process.env, CUA_HOME: home, CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: secret ? 'on' : 'off'},
    });
    sessions.push(session);
    await session.initialize();
    const ready = await session.js('nodeRepl.write("ready")', 120_000);  // the first cell also loads the vendor API
    if (ready.timedOut || ready.result?.isError) throw Object.assign(new Error(`${name}: the first cell failed`), {blocked: ready.timedOut});
    return session;
  };
  // Bind TextEdit and prove its front window is the fixture's document before anything is typed.
  const bind = async (session, name) => {
    const before = observations.elicitations.length;
    const reply = cellJson(await session.js(`globalThis.app = await cua.getApp(${JSON.stringify(TEXTEDIT_BUNDLE)});\n${OBSERVE}\n${out('{window: __window, empty: __value === ""}')}`, stepMs));
    const asked = observations.elicitations.slice(before).filter(e => e.method === 'elicitation/create').length;
    observations.connections.push({name, approvalRequests: asked, sessionFileWhileOpen: Boolean(sessionIds[name]) && existsSync(sessionFile(sessionIds[name]))});
    if (reply.timedOut) return record(`${name}: bind TextEdit`, 'BLOCKED', `no answer within ${stepMs} ms; ${PROMPT_ACTION}`);
    if (reply.isError) return record(`${name}: bind TextEdit`, 'FAIL', `getApp failed: ${reply.error}`);
    if (reply.window !== docName) return record(`${name}: bind TextEdit`, 'BLOCKED', 'TextEdit\'s front window is not the fixture\'s document (another window is in front); nothing was typed. Bring the fixture document to the front or close nothing and re-run');
    return record(`${name}: bind TextEdit`, 'PASS', `front window is the fixture's own document; the vendor asked for approval ${asked} time(s) on this connection`);
  };

  const textEditBefore = textEditPids();
  const helpersBefore = nativeHelpers();
  const sessionsBefore = sessionFiles(home);
  observations.textEdit = {runningBefore: textEditBefore.length > 0};
  observations.sessionFilesBefore = sessionsBefore.length;
  let itemCreated = false;
  // Returns early when a step cannot continue; cleanup and the result follow in any case.
  async function main() {
    const runtime = resolveRuntime({home});
    if (process.platform !== 'darwin' || !existsSync(TEXTEDIT_APP)) return record('preconditions', 'BLOCKED', `needs macOS with ${TEXTEDIT_APP}`);
    if (secret && (!locateHelper().built || !locateHelper({path: PTY_DRIVER}).built))
      return record('preconditions', 'BLOCKED', 'build the helper (npm run build:helper) and its test products (npm run test:helper) first');
    record('preconditions', 'PASS', `runtime ${runtime.release}; TextEdit ${textEditBefore.length ? 'already running (left as it is)' : 'not running'}`);

    if (secret) {
      itemCreated = true;  // cleanup runs even if creation is only partly confirmed
      const seeded = await setThroughTerminal({helper: HELPER_PATH, label, value, timeoutMs: 15_000});
      if (seeded.echoed) record('secret: create disposable item', 'FAIL', 'the value appeared in terminal output');
      else if (seeded.timedOut) record('secret: create disposable item', 'BLOCKED', `set did not finish within 15 s; ${PROMPT_ACTION}`);
      else if (seeded.exit !== 0 || !seeded.terminalRestored) record('secret: create disposable item', 'FAIL', `set exited ${seeded.exit ?? seeded.signal}`);
      else record('secret: create disposable item', 'PASS', 'a generated value stored under a unique label through the test-owned pty fixture');
      if (steps.at(-1).status !== 'PASS') return;
    }

    mkdirSync(docDir, {recursive: true, mode: 0o700});
    writeFileSync(doc, '', {mode: 0o600});
    created = true;
    await new Promise((resolve, reject) => execFile('/usr/bin/open', ['-a', 'TextEdit', doc], error => error ? reject(error) : resolve()));
    docOpen = true;
    for (let i = 0; i < 50 && !textEditPids().length; i++) await sleep(100);
    await sleep(1000);  // let the document window come to the front
    record('open the fixture document', textEditPids().length ? 'PASS' : 'FAIL', `a new empty file under $CUA_HOME/accept-textedit opened in TextEdit${textEditBefore.length ? ' (already running)' : ' (started by the open)'}`);

    // Connection A: type the marker and observe it.
    const a = await connect('connection A');
    if (await bind(a, 'connection A')) {
      const typed = cellJson(await a.js(`await app.typeText(${JSON.stringify(marker)});\n${OBSERVE}
const __shot = await app.getScreenshot({emit: false});
const __format = __shot[0] === 0xff && __shot[1] === 0xd8 ? "jpeg" : __shot[0] === 0x89 && __shot[1] === 0x50 ? "png" : "unknown";
${out(`{window: __window, valueIsMarker: __value === ${JSON.stringify(marker)}, screenshot: {bytes: __shot.length, format: __format}}`)}`, stepMs));
      observations.screenshot = typed.screenshot ?? null;
      if (typed.timedOut) record('connection A: type and observe the marker', 'BLOCKED', `no answer within ${stepMs} ms; ${PROMPT_ACTION}`);
      else record('connection A: type and observe the marker', !typed.isError && typed.window === docName && typed.valueIsMarker && typed.screenshot?.bytes > 0 ? 'PASS' : 'FAIL',
        typed.isError ? `failed: ${typed.error}` : `accessibility value ${typed.valueIsMarker ? 'is exactly the typed marker' : 'differs from the typed marker'}; screenshot ${typed.screenshot?.format} ${typed.screenshot?.bytes} bytes (metadata only)`);
    }
    const exitA = await a.close();
    record('connection A: close', exitA.code === 0 ? 'PASS' : 'FAIL', `exit ${exitA.code ?? exitA.signal}`);
    noteSessionFileAfterClose('connection A');

    // Connection B: a new session binds TextEdit again (is approval asked again?), optionally delivers the secret,
    // then closes the fixture document.
    const b = await connect('connection B');
    if (await bind(b, 'connection B')) {
      if (secret) {
        const delivered = cellJson(await b.js(`await app.typeText(${JSON.stringify(`{{secret:${label}}}`)});\n${out('{done: true}')}`, stepMs));
        const leakedBefore = textLeaks(b.transcript.join('\n') + b.stderr, prints);
        if (delivered.timedOut) record('secret: type the reference', 'BLOCKED', `no answer within ${stepMs} ms; ${PROMPT_ACTION}`);
        else record('secret: type the reference', !delivered.isError && !leakedBefore ? 'PASS' : 'FAIL', delivered.isError
          ? `failed: ${String(delivered.error).replace(value, '<value>')}` : leakedBefore ? 'the value appeared in the MCP transport or stderr before any readback' : 'typeText({{secret:<label>}}) returned; nothing so far carried the value (MCP transport, server/runtime stderr)');
        // Intentional plaintext readback from the target: this is target observation, not confidentiality evidence.
        const readback = cellJson(await b.js(`${OBSERVE}\n${out('{window: __window, value: __value}')}`, stepMs));
        const exact = readback.window === docName && readback.value === marker + value;
        record('secret: target observation (plaintext readback, not confidentiality evidence)', exact ? 'PASS' : 'FAIL',
          exact ? 'the document reads back the marker followed by exactly the stored value' : `the document reads back ${readback.isError ? `an error (${readback.error})` : 'something else'}`);
      }
      const closed = cellJson(await b.js(`await app.pressKey("super+w");
let __after = null, __error = null;
try { __after = (await app.getAXState({emit: false})).match(/^Window: "([^"]*)"/m)?.[1] ?? null; } catch (error) { __error = String(error?.message ?? error); }
${out('{frontAfter: __after, noWindows: /noWindowsAvailable/.test(__error ?? "")}')}`, stepMs));
      docOpen = !(closed.noWindows || (typeof closed.frontAfter === 'string' && closed.frontAfter !== docName));
      record('connection B: close only the fixture document', docOpen ? 'FAIL' : 'PASS', docOpen
        ? `the document still looks open (${closed.error ?? closed.frontAfter}); close it by hand without saving elsewhere`
        : closed.noWindows ? 'super+w closed it; TextEdit has no windows left' : 'super+w closed it; another TextEdit window is now in front and was not touched');
    }
    const exitB = await b.close();
    record('connection B: close', exitB.code === 0 ? 'PASS' : 'FAIL', `exit ${exitB.code ?? exitB.signal}`);
    noteSessionFileAfterClose('connection B');
  }

  try {
    await main();
  } catch (error) {
    record('unexpected', error.blocked ? 'BLOCKED' : 'FAIL', `${error.message}${error.blocked ? `; ${PROMPT_ACTION}` : ''}`);
  } finally {
    for (const session of sessions) await Promise.race([session.exited, sleep(100)]);
    if (created) {
      rmSync(docDir, {recursive: true, force: true});
      record('delete the fixture document', existsSync(doc) ? 'FAIL' : 'PASS', docOpen ? 'file deleted, but its window may still be open in TextEdit' : 'the temporary file and its directory are gone');
    }
    if (itemCreated) {
      const removed = await runCaptured(HELPER_PATH, ['remove', label, '--yes']);
      const after = await runCaptured(HELPER_PATH, ['list']);
      let gone = false;
      try { gone = !JSON.parse(after.stdout).labels.includes(label); } catch {}
      record('secret: cleanup', gone && (removed.code === 0 || /\[not_found\]/.test(removed.stderr)) ? 'PASS' : 'FAIL',
        gone ? 'the disposable item was removed' : `CLEANUP FAILED: remove it with node bin/cua.mjs secrets remove ${label}`);
    }
  }
  return finish();

  function finish() {
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
    const after = sessionFiles(home);
    observations.sessionFiles = {before: sessionsBefore.length, after: after.length, addedByThisRun: after.filter(f => !sessionsBefore.includes(f)).length};
    observations.marker = 'a benign generated marker (cua-accept-marker-<hex>)';
    if (secret) observations.secretLabel = label;
    const status = steps.some(s => s.status === 'FAIL') ? 'FAIL' : steps.some(s => s.status === 'BLOCKED') || !steps.length ? 'BLOCKED' : 'PASS';
    return {scenario: secret ? 'live-textedit-with-secret' : 'live-textedit', status, steps, observations};
  }
}
