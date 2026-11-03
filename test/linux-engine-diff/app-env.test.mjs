// The environment every application the harness launches runs with (#171 M4, task 45; app-env.mjs): a home of the
// run's under its scratch directory, on every display, the display and the buses handed on unchanged, settings in
// memory on a display a person uses; one place builds it (`Desktop.appEnvironment`), and every application start goes
// through it. Display-free: the applications are stand-ins on a PATH of the test's own that write the environment they
// were started with and exit, and HOME is a temporary one.

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, relative } from 'node:path';
import test from 'node:test';

import { HOME_VARS, launchEnvironment, runHome } from '../../scripts/linux-engine-diff/app-env.mjs';
import * as chromeModule from '../../scripts/linux-engine-diff/chrome.mjs';
import { FAMILIES } from '../../scripts/linux-engine-diff/families.mjs';
import { Desktop } from '../../scripts/linux-engine-diff/scenes.mjs';
import { harnessModules, harnessStarts, processStarts } from './source-scan.mjs';


/** What an application gets exactly as the harness has it: the display, its authority, the runtime directory. */
const HANDED_ON = ['DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR'];

/** The run's own session bus: every application's, on every display (the design session's ruling B2, task 47). */
const RUN_BUS = 'unix:path=/tmp/cua171-diff-r-x/session/bus/x';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The harness's own environment, as a harness started from the person's session has it. */
const PERSON = {
  PATH: '/usr/bin:/bin',
  HOME: '/home/person',
  DISPLAY: ':0',
  XAUTHORITY: '/home/person/.Xauthority',
  XDG_RUNTIME_DIR: '/run/user/501',
  DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/501/bus',
  DBUS_STARTER_ADDRESS: 'unix:path=/run/user/501/bus',
  DBUS_STARTER_BUS_TYPE: 'session',
  AT_SPI_BUS_ADDRESS: 'unix:path=/run/user/501/at-spi/bus_0',
  XDG_CONFIG_HOME: '/home/person/.config',
  XDG_DATA_HOME: '/home/person/.local/share',
  SESSION_MANAGER: 'local/vm:@/tmp/.ICE-unix/1234,unix/vm:/tmp/.ICE-unix/1234',
  LANG: 'C.UTF-8',
};

test("on a display a person uses: the run's home and XDG directories, settings in memory, the display as the harness has it, the run's session bus", () => {
  const scratch = '/tmp/cua171-diff-r-x';
  const env = launchEnvironment({ scratch, base: PERSON, privateDisplay: false, sessionBus: RUN_BUS });
  assert.deepEqual(Object.fromEntries(HOME_VARS.map((n) => [n, env[n]])), {
    HOME: '/tmp/cua171-diff-r-x/home',
    XDG_CONFIG_HOME: '/tmp/cua171-diff-r-x/home/.config',
    XDG_DATA_HOME: '/tmp/cua171-diff-r-x/home/.local/share',
    XDG_CACHE_HOME: '/tmp/cua171-diff-r-x/home/.cache',
    XDG_STATE_HOME: '/tmp/cua171-diff-r-x/home/.local/state',
  });
  assert.deepEqual(runHome(scratch), Object.fromEntries(HOME_VARS.map((n) => [n, env[n]])));
  for (const name of HANDED_ON) assert.equal(env[name], PERSON[name], `${name} is handed on unchanged`);
  assert.equal('AT_SPI_BUS_ADDRESS' in env, false, "an inherited accessibility bus never reaches an application: the display's AT_SPI_BUS names its own");
  assert.equal(env.GSETTINGS_BACKEND, 'memory', "a GSettings write never reaches the person's dconf");
  assert.equal('SESSION_MANAGER' in env, false, "no application joins the person's session");
  // B2: on the person's display too an application is on a session bus of the run's, which can activate nothing, never
  // on the person's (kate on a shared display D-Bus-activated the person's kactivitymanagerd and kglobalaccel)
  assert.equal(env.DBUS_SESSION_BUS_ADDRESS, RUN_BUS, "the run's session bus, never the person's");
  assert.equal('DBUS_STARTER_ADDRESS' in env, false);
  assert.equal('DBUS_STARTER_BUS_TYPE' in env, false);
  assert.equal(env.PATH, PERSON.PATH);
  assert.equal(env.LANG, PERSON.LANG);
});

test("on a private display: the run's home, no settings backend imposed, the run's buses as its session set them", () => {
  const base = { ...PERSON, DISPLAY: ':88', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/tmp/cua171-diff-r-x/session/bus/x', AT_SPI_BUS_ADDRESS: 'unix:path=/run/user/501/at-spi/bus_88' };
  const env = launchEnvironment({ scratch: '/tmp/cua171-diff-r-x', base, privateDisplay: true, sessionBus: RUN_BUS });
  assert.equal(env.HOME, '/tmp/cua171-diff-r-x/home');
  assert.equal(env.DBUS_SESSION_BUS_ADDRESS, RUN_BUS);
  assert.equal('GSETTINGS_BACKEND' in env, false);
  for (const name of HANDED_ON) assert.equal(env[name], base[name], name);
  // the run's own accessibility bus is not named either (Qt 6 registers no tree with the variable set, task 46): the
  // display's AT_SPI_BUS and the run's session bus both name it
  assert.equal('AT_SPI_BUS_ADDRESS' in env, false);
  // a backend the harness itself was started with is the harness's to pass on
  assert.equal(launchEnvironment({ scratch: '/tmp/s', base: { ...base, GSETTINGS_BACKEND: 'keyfile' }, privateDisplay: true, sessionBus: RUN_BUS }).GSETTINGS_BACKEND, 'keyfile');
  // the run's own session bus, whose launcher keeps the run's accessibility switch, asks for memory explicitly
  assert.equal(launchEnvironment({ scratch: '/tmp/s', base, privateDisplay: true, settings: 'memory', sessionBus: RUN_BUS }).GSETTINGS_BACKEND, 'memory');
  assert.throws(() => launchEnvironment({ scratch: '/tmp/s', base, settings: 'dconf', sessionBus: RUN_BUS }), /unknown settings/);
});

test("an application never starts without the run's own session bus: before the run has one, it is refused, on every display", () => {
  for (const privateDisplay of [false, true]) {
    assert.throws(() => launchEnvironment({ scratch: '/tmp/s', base: PERSON, privateDisplay, app: 'gedit' }), /refusing to start gedit: the run has no session bus of its own yet/);
    assert.throws(() => launchEnvironment({ scratch: '/tmp/s', base: PERSON, privateDisplay, app: 'gedit', sessionBus: '' }), /no session bus of its own yet/);
  }
  // the run's own bus daemon alone starts with none: it is the bus
  const daemon = launchEnvironment({ scratch: '/tmp/s', base: PERSON, sessionBus: false, app: "the run's session bus" });
  assert.equal('DBUS_SESSION_BUS_ADDRESS' in daemon, false);
  assert.equal('DBUS_STARTER_ADDRESS' in daemon, false);
});

test("XAUTHORITY is named where the person's HOME puts it when the harness has none, and absent variables stay absent", () => {
  const { XAUTHORITY, DBUS_SESSION_BUS_ADDRESS, AT_SPI_BUS_ADDRESS, ...bare } = PERSON;
  const env = launchEnvironment({ scratch: '/tmp/s', base: bare, sessionBus: RUN_BUS });
  assert.equal(env.XAUTHORITY, '/home/person/.Xauthority', "Xlib's default under the harness's HOME, not the run's");
  assert.equal('AT_SPI_BUS_ADDRESS' in env, false, 'unchanged: still unset');
  // an unknown display counts as a person's
  assert.equal(env.GSETTINGS_BACKEND, 'memory');
  // a private display's server keeps no authority (task 51's review): never the person's file by default, in either
  // home, but a path of the run's home, which holds none
  for (const home of ['run', 'xdg']) {
    const own = launchEnvironment({ scratch: '/tmp/s', base: bare, privateDisplay: true, home, sessionBus: RUN_BUS });
    assert.equal(own.XAUTHORITY, join(runHome('/tmp/s').HOME, '.Xauthority'), `home ${home}`);
  }
});

test("an application's own variables apply last, but never place a file outside the scratch or change what is handed on", () => {
  const scratch = '/tmp/cua171-diff-r-x';
  const scene = join(scratch, 'cua171-diff-r-x-gnometexteditor-a');
  const env = launchEnvironment({ scratch, base: PERSON, sessionBus: RUN_BUS, extra: { XDG_DATA_HOME: join(scene, 'data'), GTK_OVERLAY_SCROLLING: '0', LANG: undefined } });
  assert.equal(env.XDG_DATA_HOME, join(scene, 'data'), "a directory of the scene's, inside the scratch");
  assert.equal(env.GTK_OVERLAY_SCROLLING, '0');
  assert.equal('LANG' in env, false);
  assert.throws(() => launchEnvironment({ scratch, base: PERSON, sessionBus: RUN_BUS, extra: { HOME: '/home/person' } }), /HOME lies under the run's scratch directory/);
  assert.throws(() => launchEnvironment({ scratch, base: PERSON, sessionBus: RUN_BUS, extra: { XDG_CONFIG_HOME: '/tmp/cua171-diff-r-x/../elsewhere' } }), /XDG_CONFIG_HOME lies under/);
  assert.throws(() => launchEnvironment({ scratch, base: PERSON, sessionBus: RUN_BUS, extra: { XDG_CACHE_HOME: scratch } }), /XDG_CACHE_HOME lies under/);
  assert.throws(() => launchEnvironment({ scratch, base: PERSON, sessionBus: RUN_BUS, extra: { XDG_STATE_HOME: undefined } }), /XDG_STATE_HOME lies under/);
  assert.throws(() => launchEnvironment({ scratch: 'relative', base: PERSON, sessionBus: RUN_BUS }), /absolute path/);
});

// Task 45's review: a family's own variables were applied after the isolation and unrestricted, so an extra could hand an
// application the person's accessibility bus or session manager back, or GSettings' dconf on the person's display. The
// design session's ruling: such an extra fails the launch, naming the family and the variable.
const PROTECTED = {
  AT_SPI_BUS_ADDRESS: 'unix:path=/run/user/501/at-spi/bus_0',
  SESSION_MANAGER: PERSON.SESSION_MANAGER,
  GSETTINGS_BACKEND: 'dconf',
  DBUS_SESSION_BUS_ADDRESS: PERSON.DBUS_SESSION_BUS_ADDRESS,
  DBUS_STARTER_ADDRESS: PERSON.DBUS_SESSION_BUS_ADDRESS,
  DISPLAY: ':1',
  XAUTHORITY: '/home/person/.Xauthority',
  XDG_RUNTIME_DIR: '/run/user/501',
};

for (const privateDisplay of [false, true]) {
  test(`a family's own variable that sets what the run decides for every application is refused, naming the family and the variable (${privateDisplay ? 'a private display' : "a person's display"})`, () => {
    const scratch = '/tmp/cua171-diff-r-x';
    for (const [name, value] of Object.entries(PROTECTED)) {
      for (const extra of [{ [name]: value }, { [name]: undefined }]) {
        assert.throws(
          () => launchEnvironment({ scratch, base: PERSON, privateDisplay, sessionBus: RUN_BUS, app: 'kate', extra }),
          (error) => error.message.startsWith(`refusing to start kate: its own environment sets ${name}`),
          `${name}${extra[name] === undefined ? ' removed' : `=${value}`} is refused`,
        );
      }
    }
    // the same value as the run's counts too: a family never names what the run decides
    assert.throws(() => launchEnvironment({ scratch, base: PERSON, privateDisplay, sessionBus: RUN_BUS, app: 'gedit', extra: { DISPLAY: PERSON.DISPLAY } }), /refusing to start gedit: its own environment sets DISPLAY/);
    // a home inside the scratch stays the family's to choose (gnome-text-editor's per-scene data and state)
    assert.equal(launchEnvironment({ scratch, base: PERSON, privateDisplay, sessionBus: RUN_BUS, app: 'gnome-text-editor', extra: { XDG_STATE_HOME: join(scratch, 'scene', 'state') } }).XDG_STATE_HOME, join(scratch, 'scene', 'state'));
  });
}

test('a scene application whose family names a protected variable is never started, and the refusal names the family', async () => {
  const apps = standIns(['kate-standin']);
  const desktop = quietDesktop('appenv3');
  try {
    assert.throws(() => desktop.spawnApp(desktop.label('a'), 'kate-standin', [], { app: 'kate', env: { AT_SPI_BUS_ADDRESS: 'unix:path=/run/user/501/at-spi/bus_0' } }), /refusing to start kate: its own environment sets AT_SPI_BUS_ADDRESS/);
    assert.throws(() => desktop.spawnApp(desktop.label('b'), 'kate-standin', [], { env: { SESSION_MANAGER: PERSON.SESSION_MANAGER } }), /refusing to start cua171-diff-appenv3-n0-b: its own environment sets SESSION_MANAGER/);
    await sleep(300);
    assert.equal(existsSync(join(process.env.PATH.split(delimiter)[0], 'kate-standin.env')), false, 'nothing started');
  } finally {
    desktop.unhookStop();
    rmSync(desktop.dir, { recursive: true, force: true });
    apps.done();
  }
});

test("home 'xdg', for a family a separate HOME breaks: the harness's HOME kept, the XDG directories still the run's", () => {
  const env = launchEnvironment({ scratch: '/tmp/s', base: PERSON, home: 'xdg', sessionBus: RUN_BUS });
  assert.equal(env.HOME, PERSON.HOME);
  assert.equal(env.XDG_CONFIG_HOME, '/tmp/s/home/.config');
  assert.equal(env.XDG_DATA_HOME, '/tmp/s/home/.local/share');
  assert.equal(env.XDG_CACHE_HOME, '/tmp/s/home/.cache');
  assert.equal(env.XDG_STATE_HOME, '/tmp/s/home/.local/state');
  assert.throws(() => launchEnvironment({ scratch: '/tmp/s', base: PERSON, home: 'none', sessionBus: RUN_BUS }), /unknown home/);
});

/** A PATH of the test's own holding `names`, each a stand-in that writes its environment to `<dir>/<name>.env` and exits. */
function standIns(names) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-appenv-path-'));
  for (const name of names) {
    writeFileSync(join(dir, name), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(join(dir, `${name}.env`))}, JSON.stringify(process.env));\n`);
    chmodSync(join(dir, name), 0o755);
  }
  const saved = { PATH: process.env.PATH, HOME: process.env.HOME };
  const home = mkdtempSync(join(tmpdir(), 'cua171-appenv-home-'));
  process.env.PATH = `${dir}${delimiter}${saved.PATH}`;
  process.env.HOME = home;
  return {
    home,
    async envOf(name) {
      const file = join(dir, `${name}.env`);
      for (let i = 0; i < 250 && !existsSync(file); i++) await sleep(20);
      return JSON.parse(readFileSync(file, 'utf8'));
    },
    done() {
      process.env.PATH = saved.PATH;
      process.env.HOME = saved.HOME;
      rmSync(dir, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    },
  };
}

/** A Desktop whose run has begun as far as its applications are concerned: its own session bus (`RUN_BUS`). */
const quietDesktop = (run) => {
  const desktop = new Desktop({ cua: 'unused', run, reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0, nonce: 'n0' });
  desktop.session = { address: RUN_BUS, stop: async () => ({}) };
  return desktop;
};

for (const [display, isPrivate] of [["a person's display", false], ['a display not yet known', null], ['a private display', true]]) {
  test(`a scene application on ${display} starts in the run's launch environment, its home made in the run's scratch`, async () => {
    const apps = standIns(['gedit-standin']);
    const desktop = quietDesktop('appenv1');
    desktop.isPrivate = isPrivate;
    // an accessibility bus the harness inherited, a foreign one
    const savedA11y = process.env.AT_SPI_BUS_ADDRESS;
    process.env.AT_SPI_BUS_ADDRESS = 'unix:path=/run/user/501/at-spi/bus_0,guid=foreign';
    try {
      desktop.spawnApp(desktop.label('a'), 'gedit-standin', [], { env: { GTK_OVERLAY_SCROLLING: '0' } });
      const env = await apps.envOf('gedit-standin');
      const homes = runHome(desktop.dir);
      for (const name of HOME_VARS) {
        assert.equal(env[name], homes[name], name);
        assert.ok(statSync(homes[name]).isDirectory(), `${name} exists before the application starts`);
        assert.equal(relative(desktop.dir, homes[name]).startsWith('..'), false);
      }
      assert.equal(statSync(homes.HOME).mode & 0o777, 0o700, "the run's home is the run's alone");
      for (const name of HANDED_ON.filter((n) => n !== 'XAUTHORITY')) assert.equal(env[name], process.env[name], name);
      assert.equal(env.DBUS_SESSION_BUS_ADDRESS, RUN_BUS, "the run's session bus");
      assert.equal(env.AT_SPI_BUS_ADDRESS, undefined, `the inherited ${process.env.AT_SPI_BUS_ADDRESS} never reaches the application`);
      assert.equal(env.XAUTHORITY, process.env.XAUTHORITY ?? (isPrivate ? join(homes.HOME, '.Xauthority') : join(apps.home, '.Xauthority')));
      assert.equal(env.GSETTINGS_BACKEND, isPrivate ? process.env.GSETTINGS_BACKEND : 'memory');
      assert.equal(env.GTK_OVERLAY_SCROLLING, '0', "the application's own variable");
      assert.deepEqual(readdirSync(apps.home), [], "nothing under the person's HOME");
    } finally {
      if (savedA11y === undefined) delete process.env.AT_SPI_BUS_ADDRESS;
      else process.env.AT_SPI_BUS_ADDRESS = savedA11y;
      desktop.unhookStop();
      rmSync(desktop.dir, { recursive: true, force: true });
      apps.done();
    }
  });
}

test('a scene application before the run has a session bus of its own is never started', async () => {
  const apps = standIns(['gedit-standin']);
  const desktop = quietDesktop('appenv4');
  desktop.session = null;
  try {
    assert.throws(() => desktop.spawnApp(desktop.label('a'), 'gedit-standin', [], { app: 'gedit' }), /refusing to start gedit: the run has no session bus of its own yet/);
    await sleep(300);
    assert.equal(existsSync(join(process.env.PATH.split(delimiter)[0], 'gedit-standin.env')), false, 'nothing started');
  } finally {
    desktop.unhookStop();
    rmSync(desktop.dir, { recursive: true, force: true });
    apps.done();
  }
});

// What a toolkit decides accessibility by when its session bus is the run's, which has no org.a11y.Status (task 47,
// B2): Firefox reads GNOME_ACCESSIBILITY first (accessible/atk/Platform.cpp `ShouldA11yBeEnabled`), Chromium
// ACCESSIBILITY_ENABLED (atk_util_auralinux.cc `ShouldEnableAccessibility`); both then find the bus through the display's
// AT_SPI_BUS, as GTK's atk-bridge does whatever the switches say
test("Firefox, Electron and the run's Chrome are told accessibility is on, since the run's session bus cannot say so", () => {
  const ctx = { label: 'cua171-diff-r-n0-firefox-a', dir: mkdtempSync(join(tmpdir(), 'cua171-appenv-ctx-')), geometry: null };
  try {
    assert.equal(FAMILIES.firefox.launch(ctx).env?.GNOME_ACCESSIBILITY, '1');
    assert.equal(FAMILIES.electron.launch(ctx).env?.ACCESSIBILITY_ENABLED, '1');
    assert.equal(FAMILIES.electron.launch({ ...ctx, page: 'input.html' }).env?.ACCESSIBILITY_ENABLED, '1');
    assert.deepEqual(chromeModule.CHROME_ENV, { ACCESSIBILITY_ENABLED: '1' });
  } finally {
    rmSync(ctx.dir, { recursive: true, force: true });
  }
});

test('an application whose own variables the environment refuses is never started', async () => {
  const apps = standIns(['kate-standin']);
  const desktop = quietDesktop('appenv2');
  try {
    assert.throws(() => desktop.spawnApp(desktop.label('a'), 'kate-standin', [], { env: { XDG_CONFIG_HOME: join(apps.home, '.config') } }), /XDG_CONFIG_HOME lies under the run's scratch directory/);
    await sleep(300);
    assert.equal(existsSync(join(process.env.PATH.split(delimiter)[0], 'kate-standin.env')), false, 'nothing started');
  } finally {
    desktop.unhookStop();
    rmSync(desktop.dir, { recursive: true, force: true });
    apps.done();
  }
});

// ---------------------------------------------------------------------------------------------------------------
// the source: one place builds the environment, and no application start bypasses it

/**
 * The commands the harness starts that are not applications: its X and bus tools, its own programs, the engines
 * (engines are not applications, task 45), the candidate's preparation commands, git, and node as the run's
 * org.a11y.Bus stand-in (a11y-stub.mjs; xspawn.test.mjs holds `process.execPath` to that one start).
 */
const TOOLS = new Set(["'xdotool'", "'xprop'", "'xwininfo'", "'xclip'", "'busctl'", "'dbus-monitor'", "'dbus-daemon'", "'xtrace'", "'Xvfb'", "'stress-ng'", "'git'", "'pgrep'", "'sleep'", 'XPROBE', 'xprobe', 'this.bin', 'values.engine', 'args.cua', 'command', 'cmd', 'process.execPath']);

test('no application start bypasses the launch environment: every process start is a tool, an engine, or one of the two application launchers', () => {
  const modules = harnessModules();
  assert.ok(['scenes.mjs', 'chrome.mjs', 'families.mjs', 'safety.mjs', 'xtools.mjs'].every((f) => modules.some(({ file }) => file === f)), 'the walk reaches the harness');
  // calls are found in the code, not in its strings ("it could not run (…)"); their arguments are read from the text
  const starts = harnessStarts(modules);
  const stray = starts.filter(({ command }) => !TOOLS.has(command) && command !== 'CHROME_COMMAND');
  assert.deepEqual(stray.map(({ file, line, command }) => `${file}:${line}: ${command}`), [], 'a process started with a command that is neither a tool nor an engine: an application must start through Desktop.spawnApp or the run\'s Chrome');
  // `cmd`, a command given by the caller, is the application launcher's alone, and so is Chrome's
  const generic = starts.filter(({ command }) => command === 'cmd' || command === 'CHROME_COMMAND');
  assert.deepEqual(generic.map(({ file, command }) => `${file} ${command}`).sort(), ['chrome.mjs CHROME_COMMAND', 'scenes.mjs cmd']);
  // each passes the environment the one place builds, and nothing else
  const scenes = modules.find(({ file }) => file === 'scenes.mjs').text;
  const spawnApp = scenes.slice(scenes.indexOf('  spawnApp(label, cmd, args'), scenes.indexOf('  /**', scenes.indexOf('  spawnApp(label, cmd, args')));
  assert.match(spawnApp, /const env = this\.appEnvironment\(extra, \{ home, app \}\);/);
  assert.match(spawnApp, /xSpawn\(cmd, args, \{ \.\.\.options, env, stdio:/, 'the start takes the built environment, after the caller\'s options');
  const chrome = modules.find(({ file }) => file === 'chrome.mjs').text;
  assert.match(chrome, /const env = this\.environment\(\);[\s\S]*guard\(this\.spawnProcess\)\(CHROME_COMMAND, args, \{ env, stdio: 'ignore', detached: true \}\)/);
  assert.match(scenes, /new ChromeInstance\(\{ scratch: this\.dir, environment: \(\) => this\.appEnvironment\(CHROME_ENV, \{ app: 'chrome' \}\) \}\)/, "the run's Chrome takes the run's environment");
  // the one place: only app-env.mjs sets the variables that place an application's files
  for (const { file, text } of modules.filter(({ file }) => file !== 'app-env.mjs')) {
    assert.ok(!/\b(HOME|XDG_CONFIG_HOME|XDG_CACHE_HOME|GSETTINGS_BACKEND)\s*:/.test(text), `${file} sets an application's home or settings backend itself`);
  }
});

test('the source check sees a bypass: an application started with its own spawn fails it', () => {
  const text = "import { spawn as start } from 'node:child_process';\nconst run = (x, spawnIt = start) => spawnIt('python3', ['-I', 'scene.py']);\nstart('gedit', ['--standalone']);\n";
  const commands = processStarts({ file: 'bypass.mjs', text }).map(({ command }) => command);
  assert.deepEqual(commands.filter((c) => !TOOLS.has(c)).sort(), ["'gedit'", "'python3'"]);
});
