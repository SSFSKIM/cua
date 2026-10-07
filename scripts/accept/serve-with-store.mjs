#!/usr/bin/env node
// `cua serve` for the live secret fixtures (scripts/accept/textedit.mjs, scripts/probe-secrets.mjs,
// scripts/accept-chrome.mjs), started with HOME set to a fixture's temporary home (scripts/accept/secret-seed.mjs).
// The server resolves its secret store from that $HOME exactly as `cua serve` does (src/secrets/store.mjs
// connectionSecrets): secrets_list and the trusted services' CUA_SECRETS_DIR both name the temporary store, so the
// account's own store is never read. Everything else sees the account's real home, as under `cua serve` in a
// terminal: the runtime's launch environment (the vendor services find the native computer-use socket and Chrome's
// hosts under os.homedir(), which follows HOME) and, for the browser surface, the Chrome facts and the readiness
// listing behind profiles_list. The rest is the production server.
//
//   HOME=<temporary home> CUA_HOME=<scratch home> node scripts/accept/serve-with-store.mjs
import {serve, settingsFrom} from '../../src/mcp/server.mjs';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {chromeFacts} from '../../src/profiles/chrome.mjs';
import {listLiveBackends} from '../../src/profiles/inventory.mjs';
import {accountHome, isAccountHome, withAccountHome} from './secret-seed.mjs';

if (!process.env.CUA_HOME || isAccountHome(process.env.HOME)) {
  process.stderr.write('serve-with-store: run it with CUA_HOME set and HOME set to a temporary store home, not this account\'s\n');
  process.exit(2);
}
process.stderr.on('error', () => {});
const home = defaultHome();
const account = {...process.env, HOME: accountHome()};
const code = await serve({
  home,
  prepareLaunch: withAccountHome,
  chrome: chromeFacts({env: account, userHome: account.HOME}),
  listBackends: () => listLiveBackends({home, runtime: resolveRuntime({home}), ambient: account, tabCounts: false, sandbox: settingsFrom(process.env).sandbox}),
});
setTimeout(() => process.exit(code), 1000).unref();
