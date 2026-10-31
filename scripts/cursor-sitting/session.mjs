// One driven session of the agent cursor's sitting: a `cua serve` over stdio (scripts/accept/mcp-session.mjs) with the
// engine pinned (CUA_NATIVE_ENGINE), approvals remembered for the connection only (CUA_SHIM_PERSIST=session), and the
// cursor's environment the step gives it (CUA_CURSOR, CUA_CURSOR_LABEL, CUA_CURSOR_COLOR, CLAUDE_CODE_SESSION_ID). It
// accepts exactly the approval of a scene's app (#117's matcher, scripts/native-matrix/goldens.mjs isSceneApproval) and
// declines every other request; every js result must attest the pinned engine (`_meta['cua/nativeEngine']`), and the
// first that does not stops the session. Before a cell acts on a scene, the scene is checked to be the run's own
// (./target-guard.mjs); a cell that sends keys runs only while the scene's run window is on top of the frontmost
// application (#162's key guard, scripts/accept/key-guard.mjs).
import {fileURLToPath} from 'node:url';
import {FIRST, MARKER, parseCell} from '../native-baseline/cells.mjs';
import {isSceneApproval} from '../native-matrix/goldens.mjs';
import {sendIfFrontmost} from '../accept/key-guard.mjs';
import {openSession, resultText} from '../accept/mcp-session.mjs';
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {BIND} from './cells.mjs';
import {scenesOf} from './target-guard.mjs';

const CLI = fileURLToPath(new URL('../../bin/cua.mjs', import.meta.url));
export const SCENE_BUNDLE_IDS = Object.freeze(Object.values(SCENES).map(s => s.bundleId));
export const CELL_MS = 120_000;

// The serve's environment: the caller's, the engine pinned, approvals per connection, and the step's cursor variables
// (a key given as null is removed, so a session can drop the operator's own session id or project directory).
export function serveEnv({engine, env = {}, base = process.env}) {
  const out = {...base, CUA_NATIVE_ENGINE: engine, CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: 'off'};
  for (const [key, value] of Object.entries(env)) { if (value === null) delete out[key]; else out[key] = value; }
  return out;
}

// A code of several cells (BIND: the goldens' bind, then the size cell) writes one marker each, on one line, since a
// cell writes no newline. -> the first failed cell's answer, else the last one's; null when none wrote a marker.
export function parseCells(text) {
  const answers = String(text).split(MARKER).slice(1).map(part => parseCell(MARKER + part.split('\n')[0]));
  return answers.find(a => a && !a.ok) ?? answers.at(-1) ?? null;
}

// The last call's timing meta a reply keeps (src/services/engine/service.mjs, src/services/sky.mjs): the engine's round
// trip and the wrapper's time, route 3's guard and activation click, the action interval and the engine's receipt.
const TIMING_META = ['engineMs', 'serviceMs', 'activationGuardMs', 'activationClick', 'actionInterval', 'receivedAt'];

// What the sitting keeps of a js reply: the cell's answer, the route the engine reported for the last call, the
// attested engine, that call's timing meta (TIMING_META, the keys it carried), and the images it emitted (base64, SHOT
// only). -> {ok, value?, error?, inCellMs?, route, engine, meta, images}.
export function readReply(reply) {
  if (reply.timedOut) return {ok: false, error: 'no answer within the cell\'s bound', route: null, engine: null, meta: {}, images: []};
  const meta = reply.result?._meta ?? {};
  const parsed = parseCells(resultText(reply));
  const images = (reply.result?.content ?? []).filter(c => c.type === 'image').map(c => ({mimeType: c.mimeType, data: c.data}));
  const timing = Object.fromEntries(TIMING_META.filter(key => meta[`cua/${key}`] != null).map(key => [key, meta[`cua/${key}`]]));
  const base = {route: meta['cua/inputRoute'] ?? null, engine: meta['cua/nativeEngine']?.engine ?? null, meta: timing, images};
  if (!parsed) return {ok: false, error: (reply.error?.message ?? resultText(reply).split('\n').filter(Boolean).at(-1) ?? 'no output').slice(0, 300), ...base};
  return {...parsed, ...base};
}

// The session's dispatch: every scene a cell acts on checked by `guard` right before it goes (a key cell, its window on
// top of the frontmost application too), the reply's engine attested; the first refusal or wrong engine stops every
// later cell. `send(code)` answers the raw js reply. -> run(code, {keys}).
export function gate({name, engine, scenes, guard, send}) {
  let stopped = null;
  const records = Object.fromEntries(scenes.map(s => [s.id, s]));
  const stop = message => { stopped = new Error(`${name}: ${message}; nothing more is sent on this session`); throw stopped; };
  return async (code, {keys = null} = {}) => {
    if (stopped) throw stopped;
    for (const id of [...scenesOf(code), ...(keys ? [keys] : [])]) {
      if (!records[id]) stop(`refused, nothing sent: the cell acts on the ${id} scene, which this session did not bind`);
      const problem = guard.problem(records[id]);
      if (problem) stop(`refused, nothing sent: ${problem}`);
    }
    const dispatch = async () => readReply(await send(code));
    let answer;
    if (keys) {
      const record = records[keys];
      const sent = await sendIfFrontmost({target: {pid: record.pid, bundleId: SCENES[keys].bundleId, window: record.window.number}, keys: ['keys'], frontmost: guard.frontmost, send: dispatch});
      if (!sent.sent) stop(`refused, nothing sent: keys for ${keys} need its run window on top of the frontmost application (#162's key guard): ${JSON.stringify(sent.skipped.frontmost)}`);
      answer = sent.result;
    } else answer = await dispatch();
    if (answer.engine && answer.engine !== engine) stop(`the ${answer.engine} engine answered, not the pinned ${engine}`);
    return answer;
  };
}

// Opens a session, binds `scenes` (records from the run's scene state: {id, app, pid, at, window}) and returns
// {run(code, {keys}), endTask(), close(), asked}. `keys`: a scene id whose process must be frontmost for the cell to go.
// `guard` (./target-guard.mjs liveTargetGuard): `problem(record)` before every scene cell, `frontmost()` for keys; a
// changed target is refused and stops the session. `device`: a registered device's name, switched to with devices_use
// before the first cell (Acceptance 8's loopback).
export async function openDriven({name, engine, env, scenes, guard, device = null}) {
  const asked = [];
  const session = openSession({args: [CLI, 'serve'], clientName: `cua-cursor-sitting-${name}`, env: serveEnv({engine, env}),
    onServerRequest: msg => {
      const accepted = isSceneApproval(msg, SCENE_BUNDLE_IDS);
      asked.push({app: msg?.params?._meta?.tool_params?.app ?? null, answer: accepted ? 'accept (session)' : 'decline'});
      return accepted ? {action: 'accept', content: {}} : {action: 'decline'};
    }});
  const run = gate({name, engine, scenes, guard, send: code => session.js(code, CELL_MS)});
  // A session that cannot start is ended here: the runner only closes the sessions it was handed.
  try {
    await session.initialize();
    if (device) {
      const switched = await session.call('devices_use', {device}, 120_000);
      if (switched.timedOut || switched.error || switched.result?.isError) throw new Error(`${name}: devices_use ${device} failed: ${switched.timedOut ? 'no answer' : resultText(switched) || switched.error?.message}`);
    }
    const first = await run(FIRST);  // the first cell also loads the computer API
    if (!first.ok) throw new Error(`${name}: the first cell failed: ${first.error}`);
    // A local session's first result must attest the pinned engine; a device's attests the device's own.
    if (!device && first.engine !== engine) throw new Error(`${name}: the first result attests ${first.engine ?? 'no engine'}, not the pinned ${engine}`);
    for (const scene of scenes) {
      const bound = await run(BIND(scene.id, scene.app));
      if (!bound.ok) throw new Error(`${name}: binding ${scene.id} failed: ${bound.error}`);
    }
  } catch (error) {
    await session.terminate();
    throw error;
  }
  return {
    name, asked, run,
    endTask: () => session.call('end_task', {}, 30_000),
    close: () => session.close(),
  };
}
