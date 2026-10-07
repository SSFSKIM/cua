#!/usr/bin/env node
// Probe-only `cua serve` for scripts/probe-secrets.mjs: the production server, launcher, secret store and trusted sky
// service, except that the sky service delegates to a probe-generated fake target module instead of the vendor's
// @oai/sky/service. The target's directory is added to the trusted code paths for this connection only. Everything
// else (runtime, node_repl, trusted worker, nativePipe, the store read) is the real thing.
//
//   HOME=<temporary store home> node scripts/probe/serve-fake-sky-target.mjs <absolute fake target module>
// (uses $CUA_HOME).
// As under scripts/accept/serve-with-store.mjs, the server resolves its secret store from that $HOME and the runtime's
// launch gets the account's real home back. CUA_SHIM_SECRETS=off serves with secrets turned off (secrets_disabled).
import {dirname, isAbsolute} from 'node:path';
import {realpathSync} from 'node:fs';
import {serve} from '../../src/mcp/server.mjs';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {withAccountHome} from '../accept/secret-seed.mjs';

const [target, ...rest] = process.argv.slice(2);
if (!target || !isAbsolute(target) || rest.length) {
  process.stderr.write('serve-fake-sky-target: pass the absolute path of the fake target module\n');
  process.exit(2);
}
const real = realpathSync(target);
const code = await serve({
  home: defaultHome(),
  prepareLaunch: launch => withAccountHome({
    ...launch,
    env: {
      ...launch.env,
      CUA_SKY_VENDOR_SERVICE: real,
      NODE_REPL_TRUSTED_CODE_PATHS: `${launch.env.NODE_REPL_TRUSTED_CODE_PATHS}:${dirname(real)}`,
    },
  }),
});
setTimeout(() => process.exit(code), 1000).unref();
