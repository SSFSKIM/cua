// The engine as cua's service runs it (#171 M5, task 117; the design session's ruling 899's condition): inside cua's
// Linux worker sandbox, the pinned codex-linux-sandbox (src/sandbox/linux.mjs, checked against its pin before every
// launch), in its own PID namespace, with the trusted services' network so it reaches the X display and the
// accessibility bus (src/repl-host/supervisor.mjs, CUA_REPL_WORKER_NETWORK; cua doctor's worker row). There, no host
// process is visible to the engine, so its identification of a browser rests on what X and the bus say, as it does in
// service. `--engine-sandbox` puts every cua lane's engine there; a vendor build runs as before. The helper comes from
// the run's cua home (CUA_HOME, else ~/.local/share/cua): one that is missing or not the pinned one refuses the
// launch, never a run unsandboxed.

import { homedir } from 'node:os';
import { join } from 'node:path';

import { sandboxedLaunch } from '../../src/sandbox/index.mjs';
import { helperFor } from '../../src/sandbox/linux.mjs';

/** The cua home whose `cua install` placed the sandbox helper. */
export const sandboxHome = (env = process.env) => env.CUA_HOME ?? join(homedir(), '.local/share/cua');

/**
 * `bin args` (an engine's command line) as the sandbox's launch: `{command, args, env, cwd}`, `env` the engine's own
 * passed through the sandbox's rule (src/sandbox/env.mjs). Throws where the helper is missing or not the pinned one.
 */
export function sandboxedEngine(bin, args, env, { home = sandboxHome(env), launch = sandboxedLaunch, helper = helperFor } = {}) {
  const cwd = env.TMPDIR ?? '/tmp';
  return launch({ platform: 'linux', state: undefined, role: 'worker', command: [bin, ...args], env, cwd, network: 'enabled', helper: helper({ home, arch: process.arch }) });
}
