#!/usr/bin/env node
// Probe-only `cua serve` for scripts/probe-engine-lane.mjs: the production server and launcher as they build the
// connection (#117's selection, from the environment the probe gives it), plus one probe-only trusted service,
// scripts/probe/engine-lane-reporter.mjs, registered beside cua's sky wrapper. The launch's selection facts (its host,
// engine attestation and the computer surface's settings) are written to <facts file> before it starts.
//
//   node scripts/probe/serve-engine-lane.mjs <facts file>        (uses $CUA_HOME and the caller's environment)
import {writeFileSync} from 'node:fs';
import {dirname, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {serve} from '../../src/mcp/server.mjs';

const REPORTER = fileURLToPath(new URL('./engine-lane-reporter.mjs', import.meta.url));
const [facts] = process.argv.slice(2);
if (!facts || !isAbsolute(facts) || !process.env.CUA_HOME) {
  process.stderr.write('serve-engine-lane: pass the absolute path of the facts file, with CUA_HOME set\n');
  process.exit(2);
}
const code = await serve({home: process.env.CUA_HOME, prepareLaunch: launch => {
  writeFileSync(facts, JSON.stringify({replHost: launch.replHost, nativeEngine: launch.nativeEngine, cwd: launch.cwd,
    env: Object.fromEntries(['CUA_SKY_SERVICE', 'CUA_ENGINE_APP', 'CUA_ENGINE_SCREENSHOTS', 'SKY_CUA_SERVICE_PATH'].map(name => [name, launch.env[name] ?? null]))}) + '\n', {mode: 0o600});
  const services = {...JSON.parse(launch.env.NODE_REPL_TRUSTED_SERVICES), engineLaneReporter: REPORTER};
  return {...launch, env: {...launch.env, NODE_REPL_TRUSTED_SERVICES: JSON.stringify(services), NODE_REPL_TRUSTED_CODE_PATHS: `${launch.env.NODE_REPL_TRUSTED_CODE_PATHS}:${dirname(REPORTER)}`}};
}}).catch(error => {
  process.stderr.write(`cua: ${error.message} [${error.code ?? 'error'}]\n`);
  return 1;
});
process.exitCode = code;
setTimeout(() => process.exit(code), 1000).unref();
