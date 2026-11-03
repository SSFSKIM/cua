// The environment every application the harness launches runs with (#171 M4, task 45; the design session's ruling,
// 2026-11-03: the harness never starts or attaches to an application instance or profile that belongs to the person).
// An application keeps its settings, recent files, caches and certificate stores under HOME and the XDG base
// directories, so with the person's it writes the person's: gedit's `~/.config/gedit` and `~/.local/share/gedit`, GTK's
// `recently-used.xbel`, kate's KConfig files, Firefox's `~/.mozilla` and `~/.config/mozilla`, the Chrome wrapper's
// `mimeapps.list` and Chrome's NSS database (`~/.pki`), whatever profile it is given (task 43's inventory). So:
// - every application, on every display, gets HOME and XDG_CONFIG_HOME, XDG_DATA_HOME, XDG_CACHE_HOME and
//   XDG_STATE_HOME under one home of the run's (`<scratch>/home`), which the run creates and removes with its scratch;
// - the display, its authority and the runtime directory are handed on explicitly and unchanged: DISPLAY and
//   XDG_RUNTIME_DIR exactly as the harness has them, and XAUTHORITY too, which Xlib would otherwise look for under the
//   new HOME, so it is named where the person's HOME puts it when the harness has none;
// - the session bus is the run's own, on every display (the design session's ruling B2, task 47): on a private display
//   the run's session (session-bus.mjs `startPrivateSession`), on a display a person uses a bus of the run's that can
//   activate nothing (`startAppSession`), since on the person's session bus an application D-Bus-activates the person's
//   services (kate started their kactivitymanagerd and kglobalaccel, a GTK application their gvfs metadata daemon);
//   an application never starts before the run has one (`sessionBus`), and no starter variable of the person's bus
//   reaches it;
// - no AT_SPI_BUS_ADDRESS (task 46's live check): an application finds its accessibility bus through the display's
//   `AT_SPI_BUS` and the session bus's launcher, which on a private display both name the run's own, so an inherited
//   value, the person's, can never reach it; and with the variable set Qt 6 (6.4) registers no tree at all, where with
//   it unset qt6-input and qtcreator registered on the run's bus;
// - on a display a person uses, GSETTINGS_BACKEND=memory: a GSettings write there goes through the person's session
//   bus to their dconf service, which writes the person's database whatever HOME the application has; in memory, a
//   setting lives and dies with the application;
// - no SESSION_MANAGER: an application that registers with the person's session manager joins the person's session;
// - a family a separate HOME breaks may keep the harness's HOME and take the run's XDG directories alone (`home:
//   'xdg'`); what it still writes under that HOME is then its family's to state (families.mjs);
// - a family's own variables never name what the run decides (`PROTECTED_VARS`): such a family is refused at its launch,
//   by name, rather than quietly overridden, so a family that would need one shows (task 45's review).
// Engines are not applications: they keep the harness's own environment (engine.mjs).

import { isAbsolute, join, relative, sep } from 'node:path';

/** The variables that place an application's own files: each under the run's home. */
export const HOME_VARS = ['HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME'];

/** The variables handed on unchanged, so an application reaches the display the harness reaches. */
export const KEPT_VARS = ['DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR'];

/** A session bus's variables: an application gets the run's own bus and none of the harness's. */
export const BUS_VARS = ['DBUS_SESSION_BUS_ADDRESS', 'DBUS_STARTER_ADDRESS', 'DBUS_STARTER_BUS_TYPE', 'DBUS_SESSION_BUS_PID', 'DBUS_SESSION_BUS_WINDOWID'];

/**
 * The variables no application inherits: an accessibility bus named outright (the display and the session bus name the
 * right one), and the person's session manager.
 */
export const DROPPED_VARS = ['AT_SPI_BUS_ADDRESS', 'SESSION_MANAGER'];

/**
 * What the run decides for every application, and why: a family's own variables (`extra`) never name one, not even with
 * the run's own value, or an extra could undo the isolation (task 45's review: an AT_SPI_BUS_ADDRESS, a SESSION_MANAGER or
 * GSETTINGS_BACKEND=dconf in a family's `env` would have reached the person's accessibility bus, session or settings).
 * The homes are not here: a family may place them, inside the scratch, and the check after the merge holds them there.
 */
export const PROTECTED_VARS = {
  DISPLAY: 'the display the harness reaches, handed on unchanged',
  XAUTHORITY: "the display's authority, handed on unchanged",
  XDG_RUNTIME_DIR: 'the runtime directory, handed on unchanged',
  DBUS_SESSION_BUS_ADDRESS: "the run's own session bus",
  DBUS_STARTER_ADDRESS: "never named: the run's own session bus is the application's",
  DBUS_STARTER_BUS_TYPE: "never named: the run's own session bus is the application's",
  DBUS_SESSION_BUS_PID: "never named: the run's own session bus is the application's",
  DBUS_SESSION_BUS_WINDOWID: "never named: the run's own session bus is the application's",
  AT_SPI_BUS_ADDRESS: "never named: the display's AT_SPI_BUS names the run's accessibility bus",
  SESSION_MANAGER: "never named: an application that registers with it joins the person's session",
  GSETTINGS_BACKEND: "the run's choice: in memory on a display a person uses",
};

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
 * home in `scratch` (`home: 'run'`), or only its XDG directories there (`home: 'xdg'`), the display handed on unchanged,
 * the run's own session bus `sessionBus` (its address; `false` only for the run's bus daemon itself, which is the bus;
 * anything else, a missing one, is refused), no accessibility bus or session manager named (`DROPPED_VARS`), and
 * GSETTINGS_BACKEND=memory unless `privateDisplay` (a display the harness started and marked; anything
 * else counts as a person's), or as `settings` says (`'memory'`, or `'inherit'`: the harness's own backend). `extra`: the application's own variables (its toolkit's switches, a directory of its scene
 * inside the scratch), applied last. Throws, naming `app` (the family or the scene) and the variable, when `extra` names
 * a variable the run decides (`PROTECTED_VARS`), set or removed, or would place a file outside the scratch.
 */
export function launchEnvironment({ scratch, base = process.env, privateDisplay = false, home = 'run', settings = privateDisplay ? 'inherit' : 'memory', sessionBus, app = 'an application', extra = {} }) {
  if (!scratch || !isAbsolute(scratch)) throw new Error("an application's environment needs the run's scratch directory, as an absolute path");
  if (sessionBus !== false && (typeof sessionBus !== 'string' || !sessionBus)) throw new Error(`refusing to start ${app}: the run has no session bus of its own yet, and an application is never put on the person's (it starts once the run has begun)`);
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
  for (const name of DROPPED_VARS) delete env[name];
  for (const name of BUS_VARS) delete env[name];
  if (sessionBus) env.DBUS_SESSION_BUS_ADDRESS = sessionBus;
  for (const [name, value] of Object.entries(extra)) {
    if (Object.hasOwn(PROTECTED_VARS, name)) throw new Error(`refusing to start ${app}: its own environment sets ${name}${value === undefined ? ' (removing it)' : `=${value}`}, which the run decides for every application (${PROTECTED_VARS[name]}), so no family can undo it`);
    if (value === undefined) delete env[name];
    else env[name] = String(value);
  }
  for (const name of HOME_VARS) {
    if (name === 'HOME' && home === 'xdg') continue;
    if (!inside(scratch, env[name])) throw new Error(`an application's ${name} lies under the run's scratch directory ${scratch}: ${env[name] ?? 'none'} is refused`);
  }
  return env;
}
