// One driven session of the agent cursor's sitting: a `cua serve` over stdio (scripts/accept/mcp-session.mjs) with the
// engine pinned (CUA_NATIVE_ENGINE), approvals remembered for the connection only (CUA_SHIM_PERSIST=session), and the
// cursor's environment the step gives it (CUA_CURSOR, CUA_CURSOR_LABEL, CUA_CURSOR_COLOR, CLAUDE_CODE_SESSION_ID). It
// accepts exactly the approval of a scene's app (#117's matcher, scripts/native-matrix/goldens.mjs isSceneApproval) and
// declines every other request; every js result must attest the pinned engine (`_meta['cua/nativeEngine']`), and the
// first that does not stops the session. A cell that sends keys runs only while the scene's process is the frontmost
// application (#162's key guard, scripts/accept/key-guard.mjs).
import {fileURLToPath} from 'node:url';
import {FIRST, parseCell} from '../native-baseline/cells.mjs';
import {isSceneApproval} from '../native-matrix/goldens.mjs';
import {sendIfFrontmost} from '../accept/key-guard.mjs';
import {openSession, resultText} from '../accept/mcp-session.mjs';
import {frontmostProcess} from '../repl-parity/scenes-mac-device.mjs';
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {BIND} from './cells.mjs';

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

// What the sitting keeps of a js reply: the cell's answer, the route the engine reported for the last call, the
// attested engine, and the images it emitted (base64, SHOT only). -> {ok, value?, error?, inCellMs?, route, engine, images}.
export function readReply(reply) {
  if (reply.timedOut) return {ok: false, error: 'no answer within the cell\'s bound', route: null, engine: null, images: []};
  const meta = reply.result?._meta ?? {};
  const parsed = parseCell(resultText(reply));
  const images = (reply.result?.content ?? []).filter(c => c.type === 'image').map(c => ({mimeType: c.mimeType, data: c.data}));
  const base = {route: meta['cua/inputRoute'] ?? null, engine: meta['cua/nativeEngine']?.engine ?? null, images};
  if (!parsed) return {ok: false, error: (reply.error?.message ?? resultText(reply).split('\n').filter(Boolean).at(-1) ?? 'no output').slice(0, 300), ...base};
  return {...parsed, ...base};
}

// Opens a session, binds `scenes` (records from the run's scene state: {id, app}) and returns
// {run(code, {keys}), endTask(), close(), asked}. `keys`: a scene id whose process must be frontmost for the cell to go.
// `device`: a registered device's name, switched to with devices_use before the first cell (Acceptance 8's loopback).
export async function openDriven({name, engine, env, scenes, device = null}) {
  const asked = [];
  const session = openSession({args: [CLI, 'serve'], clientName: `cua-cursor-sitting-${name}`, env: serveEnv({engine, env}),
    onServerRequest: msg => {
      const accepted = isSceneApproval(msg, SCENE_BUNDLE_IDS);
      asked.push({app: msg?.params?._meta?.tool_params?.app ?? null, answer: accepted ? 'accept (session)' : 'decline'});
      return accepted ? {action: 'accept', content: {}} : {action: 'decline'};
    }});
  let stopped = null;
  const pids = Object.fromEntries(scenes.map(s => [s.id, s.pid]));
  const run = async (code, {keys = null} = {}) => {
    if (stopped) throw stopped;
    const send = async () => readReply(await session.js(code, CELL_MS));
    let answer;
    if (keys) {
      const sent = await sendIfFrontmost({target: {pid: pids[keys], bundleId: SCENES[keys].bundleId}, keys: ['keys'], frontmost: () => frontmostProcess(), send});
      if (!sent.sent) return {ok: false, error: `not sent: ${keys}'s process is not the frontmost application (#162's key guard; bring it to the front)`, skipped: sent.skipped, route: null, engine: null, images: []};
      answer = sent.result;
    } else answer = await send();
    if (answer.engine && answer.engine !== engine) {
      stopped = new Error(`${name}: the ${answer.engine} engine answered, not the pinned ${engine}; nothing more is sent on this session`);
      throw stopped;
    }
    return answer;
  };
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
