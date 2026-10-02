#!/usr/bin/env node
// Probe-only `cua serve` for scripts/probe-secrets.mjs: the production server, broker, launcher and trusted sky
// service, except that the sky service delegates to a probe-generated fake target module instead of the vendor's
// @oai/sky/service. The target's directory is added to the trusted code paths for this connection only. Everything
// else (runtime, node_repl, trusted worker, nativePipe, Keychain helper broker) is the real thing.
//
//   node scripts/probe/serve-fake-sky-target.mjs <absolute fake target module>      (uses $CUA_HOME like the CLI)
import {dirname, isAbsolute} from 'node:path';
import {realpathSync} from 'node:fs';
import {serve} from '../../src/mcp/server.mjs';
import {defaultHome} from '../../src/runtime/layout.mjs';

const target = process.argv[2];
if (!target || !isAbsolute(target)) {
  process.stderr.write('serve-fake-sky-target: pass the absolute path of the fake target module\n');
  process.exit(2);
}
const real = realpathSync(target);
const code = await serve({
  home: defaultHome(),
  prepareLaunch: launch => ({
    ...launch,
    env: {
      ...launch.env,
      CUA_SKY_VENDOR_SERVICE: real,
      NODE_REPL_TRUSTED_CODE_PATHS: `${launch.env.NODE_REPL_TRUSTED_CODE_PATHS}:${dirname(real)}`,
    },
  }),
});
setTimeout(() => process.exit(code), 1000).unref();
