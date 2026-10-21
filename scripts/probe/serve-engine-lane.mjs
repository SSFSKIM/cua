#!/usr/bin/env node
// Probe-only `cua serve` for scripts/probe-engine-lane.mjs: the production server and launcher as they build the
// connection (#117's selection, from the environment the probe gives it), plus one probe-only trusted service,
// scripts/probe/engine-lane-reporter.mjs, registered beside cua's sky wrapper the way the selected host takes it
// (CUA_REPL_TRUSTED_SERVICES and CUA_REPL_TRUSTED_CODE_PATHS for cua's own host, which checks it as it checks every
// service, src/runtime/sandbox.mjs assertTrustedServicesContained; NODE_REPL_* for the vendor's). The launch's selection
// facts (its host, engine attestation and the computer surface's settings) are written to <facts file> before it starts.
//
//   node scripts/probe/serve-engine-lane.mjs <facts file>        (uses $CUA_HOME and the caller's environment)
import {writeFileSync} from 'node:fs';
import {dirname, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {serve} from '../../src/mcp/server.mjs';
import {assertTrustedServicesContained} from '../../src/runtime/sandbox.mjs';

const REPORTER = fileURLToPath(new URL('./engine-lane-reporter.mjs', import.meta.url));
const [facts] = process.argv.slice(2);
if (!facts || !isAbsolute(facts) || !process.env.CUA_HOME) {
  process.stderr.write('serve-engine-lane: pass the absolute path of the facts file, with CUA_HOME set\n');
  process.exit(2);
}
const code = await serve({home: process.env.CUA_HOME, prepareLaunch: launch => {
  writeFileSync(facts, JSON.stringify({replHost: launch.replHost, nativeEngine: launch.nativeEngine, cwd: launch.cwd,
    env: Object.fromEntries(['CUA_SKY_SERVICE', 'CUA_ENGINE_APP', 'CUA_ENGINE_SCREENSHOTS', 'SKY_CUA_SERVICE_PATH'].map(name => [name, launch.env[name] ?? null]))}) + '\n', {mode: 0o600});
  const own = launch.replHost.host === 'cua';
  const [services, codePaths] = own ? ['CUA_REPL_TRUSTED_SERVICES', 'CUA_REPL_TRUSTED_CODE_PATHS'] : ['NODE_REPL_TRUSTED_SERVICES', 'NODE_REPL_TRUSTED_CODE_PATHS'];
  const registered = {...JSON.parse(launch.env[services]), engineLaneReporter: REPORTER};
  const probed = {...launch, env: {...launch.env, [services]: JSON.stringify(registered), [codePaths]: `${launch.env[codePaths]}:${dirname(REPORTER)}`}};
  if (own) assertTrustedServicesContained(probed);
  return probed;
}}).catch(error => {
  process.stderr.write(`cua: ${error.message} [${error.code ?? 'error'}]\n`);
  return 1;
});
process.exitCode = code;
setTimeout(() => process.exit(code), 1000).unref();
