#!/usr/bin/env node
// The device side of the coordinate group's first refusal (U2; the Decision Log's "Coordinate clicks" ruling): one
// coordinate click on a fresh connection to the engine, which holds no screenshot-bearing observation, so the engine
// must refuse it as noScreenshotForCoordinates before anything is posted. The spike service captures on every
// observation, so the facade cannot reach this refusal; this connection is the harness's own, beside the session's.
//   node scripts/spike/engine/measure/fresh-click.mjs <app path> <x> <y> [--engine <bundle>]
// One JSON line: engine-device.mjs rpc's envelope, {ok: true, result} | {ok: false, error} | {ok: false, unreachable}.
import {pathToFileURL} from 'node:url';
import {APPROVED_ENGINE, rpc} from './engine-device.mjs';
import {socketPathFor} from '../client.mjs';

export function freshClickParams(app, x, y, now = Date.now()) {
  if (typeof app !== 'string' || !app.startsWith('/')) throw new Error('fresh-click takes the app by absolute path');
  if (![x, y].every(Number.isFinite)) throw new Error('fresh-click takes finite coordinates');
  return {method: 'click', args: {app, x, y}, deadlineUnixMilliseconds: now + 30_000};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--engine');
  const engine = at === -1 ? APPROVED_ENGINE : args.splice(at, 2)[1];
  try {
    const [app, x, y] = args;
    process.stdout.write(JSON.stringify(await rpc(socketPathFor(engine), 'execute', freshClickParams(app, Number(x), Number(y)))) + '\n');
  } catch (error) { process.stdout.write(JSON.stringify({ok: false, error: {errorName: 'device', message: error.message}}) + '\n'); process.exitCode = 2; }
}
