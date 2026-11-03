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

import { HOME_VARS, KEPT_VARS, launchEnvironment, runHome } from '../../scripts/linux-engine-diff/app-env.mjs';
import { Desktop } from '../../scripts/linux-engine-diff/scenes.mjs';

const HARNESS = join(import.meta.dirname, '../../scripts/linux-engine-diff');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The harness's own environment, as a harness started from the person's session has it. */
const PERSON = {
  PATH: '/usr/bin:/bin',
  HOME: '/home/person',
  DISPLAY: ':0',
  XAUTHORITY: '/home/person/.Xauthority',
  XDG_RUNTIME_DIR: '/run/user/501',
  DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/501/bus',
  AT_SPI_BUS_ADDRESS: 'unix:path=/run/user/501/at-spi/bus_0',
  XDG_CONFIG_HOME: '/home/person/.config',
  XDG_DATA_HOME: '/home/person/.local/share',
  SESSION_MANAGER: 'local/vm:@/tmp/.ICE-unix/1234,unix/vm:/tmp/.ICE-unix/1234',
  LANG: 'C.UTF-8',
};

test("on a display a person uses: the run's home and XDG directories, settings in memory, the display and the buses as the harness has them", () => {
  const scratch = '/tmp/cua171-diff-r-x';
  const env = launchEnvironment({ scratch, base: PERSON, privateDisplay: false });
  assert.deepEqual(Object.fromEntries(HOME_VARS.map((n) => [n, env[n]])), {
    HOME: '/tmp/cua171-diff-r-x/home',
    XDG_CONFIG_HOME: '/tmp/cua171-diff-r-x/home/.config',
    XDG_DATA_HOME: '/tmp/cua171-diff-r-x/home/.local/share',
    XDG_CACHE_HOME: '/tmp/cua171-diff-r-x/home/.cache',
    XDG_STATE_HOME: '/tmp/cua171-diff-r-x/home/.local/state',
  });
  assert.deepEqual(runHome(scratch), Object.fromEntries(HOME_VARS.map((n) => [n, env[n]])));
  for (const name of KEPT_VARS) assert.equal(env[name], PERSON[name], `${name} is handed on unchanged`);
  assert.equal(env.GSETTINGS_BACKEND, 'memory', "a GSettings write never reaches the person's dconf");
  assert.equal('SESSION_MANAGER' in env, false, "no application joins the person's session");
  assert.equal(env.PATH, PERSON.PATH);
  assert.equal(env.LANG, PERSON.LANG);
});

test("on a private display: the run's home, no settings backend imposed, the run's buses as its session set them", () => {
  const base = { ...PERSON, DISPLAY: ':88', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/tmp/cua171-diff-r-x/session/bus/x', AT_SPI_BUS_ADDRESS: 'unix:path=/run/user/501/at-spi/bus_88' };
  const env = launchEnvironment({ scratch: '/tmp/cua171-diff-r-x', base, privateDisplay: true });
  assert.equal(env.HOME, '/tmp/cua171-diff-r-x/home');
  assert.equal('GSETTINGS_BACKEND' in env, false);
  for (const name of KEPT_VARS) assert.equal(env[name], base[name], name);
  // a backend the harness itself was started with is the harness's to pass on
  assert.equal(launchEnvironment({ scratch: '/tmp/s', base: { ...base, GSETTINGS_BACKEND: 'keyfile' }, privateDisplay: true }).GSETTINGS_BACKEND, 'keyfile');
  // the run's own session bus, whose launcher keeps the run's accessibility switch, asks for memory explicitly
  assert.equal(launchEnvironment({ scratch: '/tmp/s', base, privateDisplay: true, settings: 'memory' }).GSETTINGS_BACKEND, 'memory');
  assert.throws(() => launchEnvironment({ scratch: '/tmp/s', base, settings: 'dconf' }), /unknown settings/);
});

test("XAUTHORITY is named where the person's HOME puts it when the harness has none, and absent variables stay absent", () => {
  const { XAUTHORITY, DBUS_SESSION_BUS_ADDRESS, AT_SPI_BUS_ADDRESS, ...bare } = PERSON;
  const env = launchEnvironment({ scratch: '/tmp/s', base: bare });
  assert.equal(env.XAUTHORITY, '/home/person/.Xauthority', "Xlib's default under the harness's HOME, not the run's");
  assert.equal('DBUS_SESSION_BUS_ADDRESS' in env, false, 'unchanged: still unset');
  assert.equal('AT_SPI_BUS_ADDRESS' in env, false, 'unchanged: still unset');
  // an unknown display counts as a person's
  assert.equal(env.GSETTINGS_BACKEND, 'memory');
});

test("an application's own variables apply last, but never place a file outside the scratch or change what is handed on", () => {
  const scratch = '/tmp/cua171-diff-r-x';
  const scene = join(scratch, 'cua171-diff-r-x-gnometexteditor-a');
  const env = launchEnvironment({ scratch, base: PERSON, extra: { XDG_DATA_HOME: join(scene, 'data'), GTK_OVERLAY_SCROLLING: '0', LANG: undefined } });
  assert.equal(env.XDG_DATA_HOME, join(scene, 'data'), "a directory of the scene's, inside the scratch");
  assert.equal(env.GTK_OVERLAY_SCROLLING, '0');
  assert.equal('LANG' in env, false);
  assert.throws(() => launchEnvironment({ scratch, base: PERSON, extra: { HOME: '/home/person' } }), /HOME lies under the run's scratch directory/);
  assert.throws(() => launchEnvironment({ scratch, base: PERSON, extra: { XDG_CONFIG_HOME: '/tmp/cua171-diff-r-x/../elsewhere' } }), /XDG_CONFIG_HOME lies under/);
  assert.throws(() => launchEnvironment({ scratch, base: PERSON, extra: { XDG_CACHE_HOME: scratch } }), /XDG_CACHE_HOME lies under/);
  assert.throws(() => launchEnvironment({ scratch, base: PERSON, extra: { XDG_STATE_HOME: undefined } }), /XDG_STATE_HOME lies under/);
  assert.throws(() => launchEnvironment({ scratch, base: PERSON, extra: { DISPLAY: ':1' } }), /DISPLAY is the harness's, handed on unchanged/);
  assert.throws(() => launchEnvironment({ scratch, base: PERSON, extra: { DBUS_SESSION_BUS_ADDRESS: 'unix:path=/x' } }), /handed on unchanged/);
  assert.throws(() => launchEnvironment({ scratch: 'relative', base: PERSON }), /absolute path/);
});

test("home 'xdg', for a family a separate HOME breaks: the harness's HOME kept, the XDG directories still the run's", () => {
  const env = launchEnvironment({ scratch: '/tmp/s', base: PERSON, home: 'xdg' });
  assert.equal(env.HOME, PERSON.HOME);
  assert.equal(env.XDG_CONFIG_HOME, '/tmp/s/home/.config');
  assert.equal(env.XDG_DATA_HOME, '/tmp/s/home/.local/share');
  assert.equal(env.XDG_CACHE_HOME, '/tmp/s/home/.cache');
  assert.equal(env.XDG_STATE_HOME, '/tmp/s/home/.local/state');
  assert.throws(() => launchEnvironment({ scratch: '/tmp/s', base: PERSON, home: 'none' }), /unknown home/);
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

const quietDesktop = (run) => new Desktop({ cua: 'unused', run, reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0, nonce: 'n0' });

for (const [display, isPrivate] of [["a person's display", false], ['a display not yet known', null], ['a private display', true]]) {
  test(`a scene application on ${display} starts in the run's launch environment, its home made in the run's scratch`, async () => {
    const apps = standIns(['gedit-standin']);
    const desktop = quietDesktop('appenv1');
    desktop.isPrivate = isPrivate;
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
      for (const name of KEPT_VARS.filter((n) => n !== 'XAUTHORITY')) assert.equal(env[name], process.env[name], name);
      assert.equal(env.XAUTHORITY, process.env.XAUTHORITY ?? join(apps.home, '.Xauthority'));
      assert.equal(env.GSETTINGS_BACKEND, isPrivate ? process.env.GSETTINGS_BACKEND : 'memory');
      assert.equal(env.GTK_OVERLAY_SCROLLING, '0', "the application's own variable");
      assert.deepEqual(readdirSync(apps.home), [], "nothing under the person's HOME");
    } finally {
      desktop.unhookStop();
      rmSync(desktop.dir, { recursive: true, force: true });
      apps.done();
    }
  });
}

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

/** Every JavaScript module of the harness, as `{file, text}`, comments blanked (lines kept). */
function harnessModules() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (['target', 'node_modules'].includes(name)) continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(mjs|js)$/.test(name)) out.push({ file: relative(HARNESS, path), text: readFileSync(path, 'utf8') });
    }
  };
  walk(HARNESS);
  out.push({ file: '../linux-engine-diff.mjs', text: readFileSync(join(HARNESS, '..', 'linux-engine-diff.mjs'), 'utf8') });
  const blank = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  return out.map(({ file, text }) => ({ file, text: blank(text) }));
}

/** The names a module calls child_process's process starts by: its imports (aliases too) and parameters defaulting to one. */
function processStarters(text) {
  const names = new Set();
  for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]node:child_process['"]/g)) {
    for (const part of m[1].split(',')) {
      const [orig, alias] = part.trim().split(/\s+as\s+/);
      if (['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork'].includes(orig)) names.add(alias ?? orig);
    }
  }
  for (const m of text.matchAll(/(\w+)\s*=\s*(\w+)\s*(?=[,)}])/g)) if (names.has(m[2])) names.add(m[1]);
  return names;
}

/** `text` with every string literal's contents blanked, lengths kept, so a search finds code only. */
const blankStrings = (text) => text.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, (s) => s[0] + ' '.repeat(s.length - 2) + s.at(-1));

/** A call's first argument: the text up to the first comma at its own depth. */
function firstArgument(text, open, code = blankStrings(text)) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = code[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      if (depth === 0) return text.slice(open, i).trim();
      depth--;
    } else if (c === ',' && depth === 0) return text.slice(open, i).trim();
  }
  return text.slice(open).trim();
}

/**
 * The commands the harness starts that are not applications: its X and bus tools, its own programs, the engines
 * (engines are not applications, task 45), the candidate's preparation commands, git.
 */
const TOOLS = new Set(["'xdotool'", "'xprop'", "'xwininfo'", "'xclip'", "'busctl'", "'dbus-monitor'", "'dbus-daemon'", "'xtrace'", "'Xvfb'", "'stress-ng'", "'git'", "'pgrep'", "'sleep'", 'XPROBE', 'xprobe', 'this.bin', 'values.engine', 'args.cua', 'command', 'cmd']);

test('no application start bypasses the launch environment: every process start is a tool, an engine, or one of the two application launchers', () => {
  const modules = harnessModules();
  assert.ok(['scenes.mjs', 'chrome.mjs', 'families.mjs', 'safety.mjs', 'xtools.mjs'].every((f) => modules.some(({ file }) => file === f)), 'the walk reaches the harness');
  const starts = [];
  for (const { file, text } of modules) {
    const names = processStarters(text);
    if (file === 'chrome.mjs') names.add('this.spawnProcess');
    // calls are found in the code, not in its strings ("it could not run (…)"); their arguments are read from the text
    const code = blankStrings(text);
    for (const name of names) {
      const pattern = new RegExp(`(?<![\\w.$])${name.replace(/[.$]/g, '\\$&')}\\s*\\(`, 'g');
      for (const m of code.matchAll(pattern)) {
        const line = text.slice(0, m.index).split('\n').length;
        starts.push({ file, line, name, command: firstArgument(text, m.index + m[0].length, code), at: m.index });
      }
    }
    // child_process reached without an import of its names
    for (const m of text.matchAll(/import\(\s*['"]node:child_process['"]\s*\)\)\s*\.\s*(\w+)\s*\(/g)) starts.push({ file, line: text.slice(0, m.index).split('\n').length, name: m[1], command: firstArgument(text, m.index + m[0].length), at: m.index });
  }
  const stray = starts.filter(({ command }) => !TOOLS.has(command) && command !== 'CHROME_COMMAND');
  assert.deepEqual(stray.map(({ file, line, command }) => `${file}:${line}: ${command}`), [], 'a process started with a command that is neither a tool nor an engine: an application must start through Desktop.spawnApp or the run\'s Chrome');
  // `cmd`, a command given by the caller, is the application launcher's alone, and so is Chrome's
  const generic = starts.filter(({ command }) => command === 'cmd' || command === 'CHROME_COMMAND');
  assert.deepEqual(generic.map(({ file, command }) => `${file} ${command}`).sort(), ['chrome.mjs CHROME_COMMAND', 'scenes.mjs cmd']);
  // each passes the environment the one place builds, and nothing else
  const scenes = modules.find(({ file }) => file === 'scenes.mjs').text;
  const spawnApp = scenes.slice(scenes.indexOf('  spawnApp(label, cmd, args'), scenes.indexOf('  /**', scenes.indexOf('  spawnApp(label, cmd, args')));
  assert.match(spawnApp, /const env = this\.appEnvironment\(extra, \{ home \}\);/);
  assert.match(spawnApp, /spawn\(cmd, args, \{ \.\.\.options, env, stdio:/, 'the start takes the built environment, after the caller\'s options');
  const chrome = modules.find(({ file }) => file === 'chrome.mjs').text;
  assert.match(chrome, /const env = this\.environment\(\);[\s\S]*this\.spawnProcess\(CHROME_COMMAND, args, \{ env, stdio: 'ignore', detached: true \}\)/);
  assert.match(scenes, /new ChromeInstance\(\{ scratch: this\.dir, environment: \(\) => this\.appEnvironment\(\) \}\)/, "the run's Chrome takes the run's environment");
  // the one place: only app-env.mjs sets the variables that place an application's files
  for (const { file, text } of modules.filter(({ file }) => file !== 'app-env.mjs')) {
    assert.ok(!/\b(HOME|XDG_CONFIG_HOME|XDG_CACHE_HOME|GSETTINGS_BACKEND)\s*:/.test(text), `${file} sets an application's home or settings backend itself`);
  }
});

test('the source check sees a bypass: an application started with its own spawn fails it', () => {
  const text = "import { spawn as start } from 'node:child_process';\nconst run = (x, spawnIt = start) => spawnIt('python3', ['-I', 'scene.py']);\nstart('gedit', ['--standalone']);\n";
  const names = processStarters(text);
  assert.deepEqual([...names].sort(), ['spawnIt', 'start']);
  const commands = [...names].flatMap((name) => [...text.matchAll(new RegExp(`(?<![\\w.$])${name}\\s*\\(`, 'g'))].map((m) => firstArgument(text, m.index + m[0].length)));
  assert.deepEqual(commands.filter((c) => !TOOLS.has(c)).sort(), ["'gedit'", "'python3'"]);
});
