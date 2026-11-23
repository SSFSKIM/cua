// The homes and the variables of M6a's live Linux runs (#171 M6a, T6), which linux-runtime-env.sh evaluates before it
// starts the run's display and bus:
//   - nothing of the caller's display, session bus, accessibility bus or session manager passes in: the harness's own
//     lists (scripts/linux-engine-diff/app-env.mjs: BUS_VARS and DROPPED_VARS, AT_SPI_BUS_ADDRESS and SESSION_MANAGER
//     among them) and the display's (DISPLAY, XAUTHORITY, WAYLAND_DISPLAY) are unset;
//   - the user HOME is fresh, `<run>/user`, never a reused directory: the secret store is HOME's
//     (src/secrets/store.mjs `storeDir`), so a reused HOME could hold a store; the XDG directories lie in it and
//     XDG_RUNTIME_DIR is `<run>/xdg-runtime`, fresh too, mode 0700;
//   - CUA_HOME is the run's: the caller's when it names one inside the run that does not exist yet, else under the new
//     HOME; one outside the run, or one that exists, is refused;
//   - CUA_SHIM_SANDBOX set at all is refused: these runs are scoped.
//
//   node scripts/accept/linux-runtime-env.mjs <run dir>   prepares the run's homes and prints the shell lines that set
//                                                         them (unset, then export); exit 2 with the reason otherwise

import {existsSync, mkdirSync} from 'node:fs';
import {isAbsolute, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BUS_VARS, DROPPED_VARS} from '../linux-engine-diff/app-env.mjs';

const DISPLAY_VARS = ['DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY'];
const inside = (dir, path) => { const rel = relative(dir, path); return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };

/** The run's variables for `run` (absolute) and the caller's `env`: `{set, unset}`, or a thrown refusal. */
export function runEnvironment({run, env, exists = existsSync}) {
  if (env.CUA_SHIM_SANDBOX !== undefined) throw new Error(`CUA_SHIM_SANDBOX is set (${JSON.stringify(env.CUA_SHIM_SANDBOX)}): these runs are scoped, so it must be unset`);
  const home = join(run, 'user');
  const runtimeDir = join(run, 'xdg-runtime');
  for (const [dir, what] of [[home, 'HOME'], [runtimeDir, 'XDG_RUNTIME_DIR']]) {
    if (exists(dir)) throw new Error(`${dir} already exists: the run's ${what} must be fresh, never a reused directory`);
  }
  let cuaHome = join(home, '.local', 'share', 'cua');
  if (env.CUA_HOME !== undefined) {
    const named = resolve(env.CUA_HOME);
    if (!isAbsolute(env.CUA_HOME) || !inside(run, named)) throw new Error(`CUA_HOME ${env.CUA_HOME} is not inside the run ${run}: the run's CUA_HOME is its own`);
    if (exists(named)) throw new Error(`CUA_HOME ${named} already exists: the run's CUA_HOME must be fresh, never a reused directory`);
    cuaHome = named;
  }
  return {
    set: {
      HOME: home, XDG_CONFIG_HOME: join(home, '.config'), XDG_DATA_HOME: join(home, '.local', 'share'), XDG_STATE_HOME: join(home, '.local', 'state'),
      XDG_CACHE_HOME: join(home, '.cache'), XDG_RUNTIME_DIR: runtimeDir, CUA_HOME: cuaHome,
    },
    unset: [...new Set([...DISPLAY_VARS, ...BUS_VARS, ...DROPPED_VARS])],
  };
}

/** Creates the run's fresh homes (the store and the runtime directory 0700); CUA_HOME is left for the install. */
export function prepareRun({run, env}) {
  const result = runEnvironment({run: resolve(run), env});
  const {set} = result;
  for (const dir of [set.XDG_CONFIG_HOME, set.XDG_DATA_HOME, set.XDG_STATE_HOME, set.XDG_CACHE_HOME]) mkdirSync(dir, {recursive: true});
  mkdirSync(join(set.HOME, '.config', 'claude-secrets'), {mode: 0o700});
  mkdirSync(set.XDG_RUNTIME_DIR, {mode: 0o700});
  return result;
}

const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

/** The shell lines that apply `{set, unset}`: every unset first, then every export, each value quoted. */
export const shellLines = ({set, unset}) => `${unset.map(name => `unset ${name}\n`).join('')}${Object.entries(set).map(([name, value]) => `export ${name}=${quote(value)}\n`).join('')}`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [run] = process.argv.slice(2);
  try {
    if (!run) throw new Error('usage: linux-runtime-env.mjs <run dir>');
    mkdirSync(run, {recursive: true});
    process.stdout.write(shellLines(prepareRun({run, env: process.env})));
  } catch (error) {
    process.stderr.write(`linux-runtime-env: ${error.message}\n`);
    process.exit(2);
  }
}
