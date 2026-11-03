// The environment every application the harness launches runs with (#171 M4, task 45; the design session's ruling,
// 2026-11-03: the harness never starts or attaches to an application instance or profile that belongs to the person).
// An application keeps its settings, recent files, caches and certificate stores under HOME and the XDG base
// directories, so with the person's it writes the person's: gedit's `~/.config/gedit` and `~/.local/share/gedit`, GTK's
// `recently-used.xbel`, kate's KConfig files, Firefox's `~/.mozilla` and `~/.config/mozilla`, the Chrome wrapper's
// `mimeapps.list` and Chrome's NSS database (`~/.pki`), whatever profile it is given (task 43's inventory). So:
// - every application, on every display, gets HOME and XDG_CONFIG_HOME, XDG_DATA_HOME, XDG_CACHE_HOME and
//   XDG_STATE_HOME under one home of the run's (`<scratch>/home`), which the run creates and removes with its scratch;
// - the display, its authority, the runtime directory and the two buses are handed on explicitly and unchanged:
//   DISPLAY, XDG_RUNTIME_DIR, DBUS_SESSION_BUS_ADDRESS and AT_SPI_BUS_ADDRESS exactly as the harness has them (task
//   43's handling: on a private display its session sets the two buses), and XAUTHORITY too, which Xlib would otherwise
//   look for under the new HOME, so it is named where the person's HOME puts it when the harness has none;
// - on a display a person uses, GSETTINGS_BACKEND=memory: a GSettings write there goes through the person's session
//   bus to their dconf service, which writes the person's database whatever HOME the application has; in memory, a
//   setting lives and dies with the application;
// - no SESSION_MANAGER: an application that registers with the person's session manager joins the person's session;
// - a family a separate HOME breaks may keep the harness's HOME and take the run's XDG directories alone (`home:
//   'xdg'`); what it still writes under that HOME is then its family's to state (families.mjs).
// Engines are not applications: they keep the harness's own environment (engine.mjs).

import { isAbsolute, join, relative, sep } from 'node:path';

/** The variables that place an application's own files: each under the run's home. */
export const HOME_VARS = ['HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME'];

/** The variables handed on unchanged, so an application reaches the display and the buses the harness reaches. */
export const KEPT_VARS = ['DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'AT_SPI_BUS_ADDRESS'];

/** The run's home under its scratch directory, and the XDG base directories inside it, as their defaults lie. */
export function runHome(scratch) {
  const home = join(scratch, 'home');
  return {
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    XDG_CACHE_HOME: join(home, '.cache'),
    XDG_STATE_HOME: join(home, '.local', 'state'),
  };
}

const inside = (dir, path) => {
  if (typeof path !== 'string' || !isAbsolute(path)) return false;
  const rel = relative(dir, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

/**
 * The environment an application of the run's starts with: `base` (the harness's own), its files placed under the run's
 * home in `scratch` (`home: 'run'`), or only its XDG directories there (`home: 'xdg'`), the display and the buses handed
 * on unchanged, and GSETTINGS_BACKEND=memory unless `privateDisplay` (a display the harness started and marked; anything
 * else counts as a person's), or as `settings` says (`'memory'`, or `'inherit'`: the harness's own backend). `extra`: the application's own variables (its toolkit's switches, a directory of its scene
 * inside the scratch), applied last. Throws when `extra` would place a file outside the scratch or change a variable
 * that is handed on.
 */
export function launchEnvironment({ scratch, base = process.env, privateDisplay = false, home = 'run', settings = privateDisplay ? 'inherit' : 'memory', extra = {} }) {
  if (!scratch || !isAbsolute(scratch)) throw new Error("an application's environment needs the run's scratch directory, as an absolute path");
  if (!['run', 'xdg'].includes(home)) throw new Error(`unknown home ${home}: 'run' or 'xdg'`);
  if (!['memory', 'inherit'].includes(settings)) throw new Error(`unknown settings ${settings}: 'memory' or 'inherit'`);
  const env = { ...base };
  const homes = runHome(scratch);
  for (const name of HOME_VARS) {
    if (name === 'HOME' && home === 'xdg') continue;
    env[name] = homes[name];
  }
  // Xlib's default is $HOME/.Xauthority: the harness's HOME, named, since the application's HOME is the run's
  if (env.XAUTHORITY === undefined && base.HOME) env.XAUTHORITY = join(base.HOME, '.Xauthority');
  if (settings === 'memory') env.GSETTINGS_BACKEND = 'memory';
  delete env.SESSION_MANAGER;
  for (const [name, value] of Object.entries(extra)) {
    if (KEPT_VARS.includes(name) && value !== env[name]) throw new Error(`an application's ${name} is the harness's, handed on unchanged: ${name}=${value} is refused`);
    if (value === undefined) delete env[name];
    else env[name] = String(value);
  }
  for (const name of HOME_VARS) {
    if (name === 'HOME' && home === 'xdg') continue;
    if (!inside(scratch, env[name])) throw new Error(`an application's ${name} lies under the run's scratch directory ${scratch}: ${env[name] ?? 'none'} is refused`);
  }
  return env;
}
