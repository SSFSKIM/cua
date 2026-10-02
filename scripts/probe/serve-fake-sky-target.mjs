#!/usr/bin/env node
// Probe-only `cua serve` for scripts/probe-secrets.mjs: the production server, broker, launcher and trusted sky
// service, except that the sky service delegates to a probe-generated fake target module instead of the vendor's
// @oai/sky/service. The target's directory is added to the trusted code paths for this connection only. Everything
// else (runtime, node_repl, trusted worker, nativePipe, Keychain helper broker) is the real thing.
//
//   node scripts/probe/serve-fake-sky-target.mjs <absolute fake target module> [--no-helper]   (uses $CUA_HOME)
// --no-helper serves as if the Keychain helper were not built, so the connection has no broker and secrets are
// unavailable (the fail-closed path for an unavailable broker).
import {dirname, isAbsolute} from 'node:path';
import {realpathSync} from 'node:fs';
import {serve} from '../../src/mcp/server.mjs';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {locateHelper} from '../../src/secrets/helper.mjs';

const [target, flag] = process.argv.slice(2);
if (!target || !isAbsolute(target) || (flag !== undefined && flag !== '--no-helper')) {
  process.stderr.write('serve-fake-sky-target: pass the absolute path of the fake target module, optionally --no-helper\n');
  process.exit(2);
}
const real = realpathSync(target);
const code = await serve({
  home: defaultHome(),
  keychainHelper: flag === '--no-helper' ? {...locateHelper(), built: false} : locateHelper(),
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
