// The harness's own Chrome (#171 M4, task 43): every Chrome window of a run belongs to one Chrome instance the run
// starts on a profile under its scratch directory and stops at its end, by the pids it spawned, each only while its
// command line carries the run's profile. A Chrome started without a profile of the run's hands its window to the
// person's Chrome, or starts on and takes over the person's profile (2026-11-02, 18:46). Display-free: no Chrome runs;
// the launcher's spawn is the test's own, or a script standing in for `google-chrome`, and HOME is a temporary one.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, join, relative } from 'node:path';
import test from 'node:test';

import { CHROME_COMMAND, CHROME_FLAGS, ChromeInstance, assertOwnChrome, isChromeCommand, procCmdline, profileSwitches } from '../../scripts/linux-engine-diff/chrome.mjs';
import { Desktop } from '../../scripts/linux-engine-diff/scenes.mjs';

const HARNESS = join(import.meta.dirname, '../../scripts/linux-engine-diff');
const HAS_PROC = existsSync('/proc/self/cmdline');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A scratch directory standing for a run's, and another standing for anything outside it. */
function dirs() {
  const scratch = mkdtempSync(join(tmpdir(), 'cua171-chrome-scratch-'));
  const outside = mkdtempSync(join(tmpdir(), 'cua171-chrome-outside-'));
  return { scratch, outside, done: () => [scratch, outside].forEach((d) => rmSync(d, { recursive: true, force: true })) };
}

/** A spawn that starts nothing and records what it was asked. */
function fakeSpawn(pids = [4101, 4102, 4103]) {
  const calls = [];
  const spawnFake = (cmd, args, options) => {
    calls.push({ cmd, args, options });
    return { pid: pids[calls.length - 1], on() {}, unref() {} };
  };
  return { spawnFake, calls };
}

test('an open runs google-chrome on the run\'s profile, a directory it makes inside the scratch directory, with the fresh-profile flags', () => {
  const d = dirs();
  try {
    const { spawnFake, calls } = fakeSpawn();
    const chrome = new ChromeInstance({ scratch: d.scratch, spawn: spawnFake });
    chrome.open('file:///page-1.html#one');
    chrome.open('file:///page-2.html#two');
    const profile = join(d.scratch, 'chrome-profile');
    assert.equal(chrome.profile, profile);
    assert.ok(statSync(profile).isDirectory());
    assert.equal(statSync(profile).mode & 0o777, 0o700, 'the profile is the run\'s alone');
    assert.deepEqual(calls.map((c) => c.cmd), [CHROME_COMMAND, CHROME_COMMAND]);
    assert.deepEqual(calls[0].args, [...CHROME_FLAGS, `--user-data-dir=${profile}`, '--new-window', 'file:///page-1.html#one']);
    // every open names the same profile, so a later one hands its window to the run's browser, never the person's
    assert.deepEqual(calls[1].args, [...CHROME_FLAGS, `--user-data-dir=${profile}`, '--new-window', 'file:///page-2.html#two']);
    for (const flag of ['--no-first-run', '--no-default-browser-check', '--password-store=basic', '--force-renderer-accessibility']) assert.ok(CHROME_FLAGS.includes(flag), flag);
    assert.equal(calls[0].options.detached, true);
    assert.deepEqual(chrome.spawned, [4101, 4102]);
  } finally {
    d.done();
  }
});

test('the guard knows every Chrome and Chromium command by its file name, and only those', () => {
  for (const cmd of ['google-chrome', 'google-chrome-stable', 'google-chrome-beta', 'google-chrome-unstable', 'chrome', '/opt/google/chrome/chrome', 'chromium', 'chromium-browser', '/usr/bin/chromium-browser']) assert.equal(isChromeCommand(cmd), true, cmd);
  for (const cmd of ['gedit', 'firefox', 'chrome-sandbox', 'xdotool', 'sh', 'python3', 'Google-chrome']) assert.equal(isChromeCommand(cmd), false, cmd);
});

test('the guard refuses a Chrome command line whose profile is not a directory of the run\'s', () => {
  const d = dirs();
  try {
    const inside = join(d.scratch, 'chrome-profile');
    mkdirSync(inside);
    const link = join(d.scratch, 'linked-profile');
    symlinkSync(d.outside, link);
    mkdirSync(join(d.outside, 'nested'));
    const throughLink = join(link, 'nested');
    const file = join(d.scratch, 'a-file');
    writeFileSync(file, '');
    const refused = {
      'no profile': ['--new-window', 'file:///x'],
      'the switch with no value': ['--user-data-dir', '--new-window', 'file:///x'],
      'the value as the next argument': ['--user-data-dir', inside, 'file:///x'],
      'an empty value': ['--user-data-dir=', 'file:///x'],
      'two profiles': [`--user-data-dir=${inside}`, `--user-data-dir=${d.outside}`],
      'a profile outside the scratch directory': [`--user-data-dir=${d.outside}`],
      'one dash, outside': [`-user-data-dir=${d.outside}`],
      'the scratch directory itself': [`--user-data-dir=${d.scratch}`],
      'a relative profile': ['--user-data-dir=chrome-profile'],
      'a symbolic link inside to a directory outside': [`--user-data-dir=${link}`],
      'a path through a link inside to a directory outside': [`--user-data-dir=${throughLink}`],
      'a file': [`--user-data-dir=${file}`],
      'a directory that does not exist': [`--user-data-dir=${join(d.scratch, 'missing')}`],
      'a profile only after --, where Chrome reads no switch': ['--', `--user-data-dir=${inside}`],
      'a parent step out of the scratch directory': [`--user-data-dir=${d.scratch}/../${basename(d.outside)}`],
    };
    for (const [why, args] of Object.entries(refused)) {
      for (const cmd of ['google-chrome', '/opt/google/chrome/chrome', 'chromium-browser']) assert.throws(() => assertOwnChrome(cmd, args, d.scratch), /refusing to start/, `${cmd}: ${why}`);
    }
    assert.throws(() => assertOwnChrome('google-chrome', [`--user-data-dir=${inside}`], null), /no scratch directory/);
    // the run's own profile passes, with one dash or two; and the guard is only Chrome's
    assert.doesNotThrow(() => assertOwnChrome('google-chrome', [`--user-data-dir=${inside}`, '--new-window', 'file:///x'], d.scratch));
    assert.doesNotThrow(() => assertOwnChrome('chromium', [`-user-data-dir=${inside}`], d.scratch));
    assert.doesNotThrow(() => assertOwnChrome('gedit', ['--standalone', 'x.txt'], d.scratch));
    assert.deepEqual(profileSwitches(['--a', '--user-data-dir', `--user-data-dir=${inside}`, '--', '--user-data-dir=/x']), [undefined, inside]);
  } finally {
    d.done();
  }
});

test('an open whose profile path is a link out of the scratch directory is refused before anything is started', () => {
  const d = dirs();
  try {
    symlinkSync(d.outside, join(d.scratch, 'chrome-profile'));
    const { spawnFake, calls } = fakeSpawn();
    const chrome = new ChromeInstance({ scratch: d.scratch, spawn: spawnFake });
    assert.throws(() => chrome.open('file:///x'), /refusing to start google-chrome: its --user-data-dir .* is a symbolic link/);
    assert.deepEqual(calls, [], 'nothing was spawned');
  } finally {
    d.done();
  }
});

test("the run's end stops only the pids it spawned whose command line carries the run's profile and no child type", async () => {
  const d = dirs();
  try {
    const { spawnFake } = fakeSpawn([201, 202, 203, 204, 205]);
    const kills = [];
    const alive = new Set([201, 203, 204, 205]);
    const profile = join(d.scratch, 'chrome-profile');
    const cmdlines = {
      // the browser: the first open
      201: ['/usr/bin/google-chrome', ...CHROME_FLAGS, `--user-data-dir=${profile}`, '--new-window', 'file:///a'],
      // a later open, which handed its window over and exited
      202: null,
      // its pid since taken by a process of another's (a person's Chrome on their own profile)
      203: ['/opt/google/chrome/chrome', '--new-window'],
      // a renderer of the run's Chrome on a reused pid: it carries the profile, and ends with the browser
      204: ['/opt/google/chrome/chrome', '--type=renderer', `--user-data-dir=${profile}`],
      // a Chrome on another run's profile
      205: ['/opt/google/chrome/chrome', `--user-data-dir=${join(d.outside, 'chrome-profile')}`],
    };
    const chrome = new ChromeInstance({
      scratch: d.scratch,
      spawn: spawnFake,
      cmdline: (pid) => (alive.has(pid) ? cmdlines[pid] : null),
      kill: (pid, signal) => {
        kills.push([pid, signal]);
        if (signal === 'SIGTERM') alive.delete(pid);
      },
    });
    for (let i = 0; i < 5; i++) chrome.open(`file:///page-${i}`);
    assert.ok(existsSync(profile));
    const record = await chrome.stop({ graceMs: 500 });
    assert.deepEqual(kills, [[201, 'SIGTERM']], 'no name, no other Chrome, no renderer: only the browser it spawned');
    assert.deepEqual(record, { profile, spawned: [201, 202, 203, 204, 205], terminated: [201], killed: [], left: [] });
    assert.equal(existsSync(profile), false, 'the profile is removed after');
    assert.throws(() => chrome.open('file:///late'), /stopped/);
    assert.equal(await chrome.stop(), record, 'a second stop is the first');
  } finally {
    d.done();
  }
});

test('a browser that outlives SIGTERM is killed, checked again just before, and one that changed hands is left alone', async () => {
  const d = dirs();
  try {
    const profile = join(d.scratch, 'chrome-profile');
    const ours = ['/usr/bin/google-chrome', `--user-data-dir=${profile}`];
    const kills = [];
    // 301 ignores SIGTERM; 302 ignores it too, and its pid goes to another process before the kill
    const cmdlines = { 301: ours, 302: ours };
    let checks = 0;
    const chrome = new ChromeInstance({
      scratch: d.scratch,
      spawn: fakeSpawn([301, 302]).spawnFake,
      cmdline: (pid) => {
        if (pid === 302 && ++checks > 2) return ['/usr/lib/firefox/firefox'];
        return cmdlines[pid];
      },
      kill: (pid, signal) => {
        kills.push([pid, signal]);
        if (signal === 'SIGKILL') delete cmdlines[pid];
      },
    });
    chrome.open('file:///a');
    chrome.open('file:///b');
    const record = await chrome.stop({ graceMs: 300, killMs: 300 });
    assert.deepEqual(kills, [[301, 'SIGTERM'], [302, 'SIGTERM'], [301, 'SIGKILL']]);
    assert.deepEqual(record.killed, [301]);
    assert.deepEqual(record.left, []);
  } finally {
    d.done();
  }
});

test('real processes: the stop reads /proc, ends the process carrying the run\'s profile and never one carrying another', { skip: !HAS_PROC && 'no /proc here' }, async () => {
  const d = dirs();
  // a program that only waits, standing in for Chrome: its command line is what it was given
  const standIn = join(d.outside, 'stand-in.js');
  writeFileSync(standIn, 'setInterval(() => {}, 1000);\n');
  // a stand-in for a person's Chrome: the same program, another profile, never spawned by the run's instance
  const decoy = spawn(process.execPath, [standIn, `--user-data-dir=${join(d.outside, 'chrome-profile')}`], { stdio: 'ignore' });
  // ended in the cleanup whatever happened, the instance's stand-in too: a test that fails before the instance's stop
  // must not leave it running (it waits forever, and its command line names a run's profile)
  let child = null;
  try {
    // the run's instance runs the stand-in in place of google-chrome, with exactly the arguments the launcher gives
    const asStandIn = (cmd, args, options) => spawn(process.execPath, [standIn, ...args], { ...options, stdio: 'ignore' });
    const chrome = new ChromeInstance({ scratch: d.scratch, spawn: asStandIn });
    child = chrome.open('file:///a');
    const exited = new Promise((r) => child.once('exit', (code, signal) => r(signal)));
    // the decoy's pid among the spawned ones, as a reused pid would be
    chrome.spawned.push(decoy.pid);
    for (let i = 0; i < 50 && !chrome.owns(child.pid); i++) await sleep(20);
    assert.ok(chrome.owns(child.pid), "the instance's process carries the run's profile");
    assert.equal(chrome.owns(decoy.pid), false, 'the decoy carries another profile');
    assert.ok(procCmdline(child.pid).includes(`--user-data-dir=${chrome.profile}`));
    const record = await chrome.stop();
    assert.equal(await exited, 'SIGTERM');
    assert.deepEqual(record.terminated, [child.pid]);
    assert.deepEqual(record.left, []);
    assert.equal(decoy.exitCode, null, 'the decoy runs on');
    assert.equal(decoy.signalCode, null);
    assert.equal(existsSync(chrome.profile), false);
  } finally {
    decoy.kill('SIGKILL');
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    d.done();
  }
});

/**
 * A `google-chrome` stand-in on a fresh PATH: it logs its arguments and the variables that place its files; as Chrome
 * does whatever its profile, it opens its NSS database under HOME (`~/.pki/nssdb`, made here); the first one with a
 * profile stays up as the browser (a marker in the profile says so), each later one with that profile exits at once, as
 * a handoff does.
 */
function fakeChromeOnPath() {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-chrome-path-'));
  const log = join(dir, 'argv.log');
  const envLog = join(dir, 'env.log');
  writeFileSync(log, '');
  writeFileSync(envLog, '');
  writeFileSync(
    join(dir, 'google-chrome'),
    `#!${process.execPath}
const { appendFileSync, existsSync, mkdirSync, writeFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
const names = ${JSON.stringify(['HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'GSETTINGS_BACKEND', 'DISPLAY', 'XAUTHORITY', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'AT_SPI_BUS_ADDRESS'])};
appendFileSync(${JSON.stringify(envLog)}, JSON.stringify(Object.fromEntries(names.map((n) => [n, process.env[n] ?? null]))) + '\\n');
mkdirSync(process.env.HOME + '/.pki/nssdb', { recursive: true });
const profile = args.find((a) => a.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);
if (!profile || existsSync(profile + '/browser')) process.exit(0);
writeFileSync(profile + '/browser', String(process.pid));
setTimeout(() => process.exit(0), 20000);
`,
  );
  chmodSync(join(dir, 'google-chrome'), 0o755);
  const lines = (file) => readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { dir, calls: () => lines(log), envs: () => lines(envLog) };
}

test("a run's Chrome windows: one instance on the run's profile and the run's home, stopped and both removed at the run's end, the person's HOME untouched", { skip: !HAS_PROC && 'no /proc here' }, async () => {
  const fake = fakeChromeOnPath();
  // the person's HOME, as the harness inherits it
  const home = mkdtempSync(join(tmpdir(), 'cua171-chrome-home-'));
  const saved = { PATH: process.env.PATH, HOME: process.env.HOME };
  process.env.PATH = `${fake.dir}${delimiter}${saved.PATH}`;
  process.env.HOME = home;
  const titles = new Map();
  let id = 700;
  const reader = {
    async request(command) {
      if (command !== 'list_windows') return { response: { ok: false, error: 'not in this test' } };
      // a window per open, once its process was asked
      return { response: { ok: true, output: [...titles].map(([title, wid]) => ({ id: wid, title, app: 'Google-chrome' })) } };
    },
    async close() {},
  };
  const desktop = new Desktop({ cua: 'unused', run: 'chrome1', reader, startActive: 0, nonce: 'n0' });
  desktop.place = () => {};
  desktop.waitForTree = async () => {};
  const closed = [];
  desktop.closeWindow = (wid) => closed.push(wid);
  desktop.windowTitle = (wid) => [...titles].find(([, w]) => w === wid)?.[0] ?? null;
  const open = (role) => {
    const opening = desktop.openChrome(role, 'scene.html');
    titles.set(`${desktop.label('scene', role)} - Google Chrome`, ++id);
    return opening;
  };
  // ended in the cleanup whatever happened: the stand-in browser waits 20 s, naming the run's profile
  let browser = null;
  try {
    const a = await open('a');
    const b = await open('b');
    const calls = fake.calls();
    const profile = join(desktop.dir, 'chrome-profile');
    assert.equal(calls.length, 2, 'one google-chrome per window');
    for (const args of calls) {
      assert.deepEqual(profileSwitches(args), [profile], 'every open names the run\'s profile, and only it');
      assert.ok(args.includes('--new-window'));
    }
    browser = Number(readFileSync(join(profile, 'browser'), 'utf8'));
    assert.ok(procCmdline(browser).includes(`--user-data-dir=${profile}`), 'the first open is the browser');
    // every open runs in the run's launch environment (app-env.mjs): its home the run's, its settings in memory on a
    // display a person uses (the run's display is not marked private here), the display and the buses the harness's
    const runHomeDir = join(desktop.dir, 'home');
    for (const env of fake.envs()) {
      assert.equal(env.HOME, runHomeDir, "Chrome's HOME is the run's, so its NSS database is the run's");
      assert.equal(env.XDG_CONFIG_HOME, join(runHomeDir, '.config'));
      assert.equal(env.XDG_DATA_HOME, join(runHomeDir, '.local', 'share'));
      assert.equal(env.XDG_CACHE_HOME, join(runHomeDir, '.cache'));
      assert.equal(env.XDG_STATE_HOME, join(runHomeDir, '.local', 'state'));
      assert.equal(env.GSETTINGS_BACKEND, 'memory');
      assert.equal(env.DISPLAY, process.env.DISPLAY ?? null);
      assert.equal(env.XDG_RUNTIME_DIR, process.env.XDG_RUNTIME_DIR ?? null);
      assert.equal(env.DBUS_SESSION_BUS_ADDRESS, process.env.DBUS_SESSION_BUS_ADDRESS ?? null);
      assert.equal(env.XAUTHORITY, process.env.XAUTHORITY ?? join(home, '.Xauthority'), "the display's authority where the person's HOME puts it");
    }
    assert.ok(existsSync(join(runHomeDir, '.pki', 'nssdb')), "Chrome's NSS database is made in the run's home");
    assert.deepEqual(readdirSync(home), [], "nothing is made under the person's HOME while Chrome runs");
    await desktop.closeAll();
    assert.deepEqual(closed.sort(), [a.id, b.id].sort(), 'each window closed as Chrome closes one');
    // gone, or an exited child not yet reaped (an empty command line)
    assert.equal((procCmdline(browser) ?? []).length, 0, "the run's end stopped the browser");
    assert.deepEqual(desktop.chromeEnding.terminated, [browser]);
    assert.equal(existsSync(profile), false, 'the profile is gone with the scratch directory');
    assert.equal(existsSync(runHomeDir), false, "the run's home is gone with it");
    assert.deepEqual(readdirSync(home), [], 'nothing was made under HOME');
  } finally {
    process.env.PATH = saved.PATH;
    process.env.HOME = saved.HOME;
    desktop.unhookStop();
    if (browser && (procCmdline(browser) ?? []).length) process.kill(browser, 'SIGKILL');
    rmSync(desktop.dir, { recursive: true, force: true });
    rmSync(fake.dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('a scene application is never Chrome: spawnApp refuses it, with or without a profile', () => {
  const desktop = new Desktop({ cua: 'unused', run: 'chrome2', reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0, nonce: 'n0' });
  try {
    const profile = join(desktop.dir, 'chrome-profile');
    mkdirSync(profile);
    for (const cmd of ['google-chrome', '/opt/google/chrome/chrome', 'chromium-browser']) {
      assert.throws(() => desktop.spawnApp('x', cmd, ['--new-window', 'file:///x']), /refusing to start .* as a scene application/);
      assert.throws(() => desktop.spawnApp('x', cmd, [`--user-data-dir=${profile}`, '--new-window', 'file:///x']), /only as the run's own instance/);
    }
  } finally {
    desktop.unhookStop();
    rmSync(desktop.dir, { recursive: true, force: true });
  }
});

/** Every source file of the harness, but the launcher, as `{file, text}`: its modules, the Python and shell scenes, xprobe's sources. */
function harnessSources() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (['target', 'node_modules'].includes(name)) continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(mjs|js|py|sh|rs)$/.test(name)) out.push({ file: relative(HARNESS, path), text: readFileSync(path, 'utf8') });
    }
  };
  walk(HARNESS);
  out.push({ file: '../linux-engine-diff.mjs', text: readFileSync(join(HARNESS, '..', 'linux-engine-diff.mjs'), 'utf8') });
  return out.filter(({ file }) => file !== 'chrome.mjs');
}

test('no Chrome start bypasses the launcher: no Chrome command named, and none run, anywhere in the harness but chrome.mjs', () => {
  const sources = harnessSources();
  assert.ok(sources.some(({ file }) => file === 'scenes.mjs') && sources.some(({ file }) => file === 'families.mjs') && sources.some(({ file }) => file.startsWith('xprobe/src/')), 'the walk reaches the harness');
  const named = [];
  const run = [];
  for (const { file, text } of sources) {
    text.split('\n').forEach((line, i) => {
      // a Chrome executable's name, in code or in a comment: only the launcher has one
      if (/\b(google-chrome[\w-]*|chromium(-browser)?)\b|\/opt\/google\/chrome\b|\bCHROME_COMMAND\b/.test(line)) named.push(`${file}:${i + 1}: ${line.trim()}`);
      // a process started with the bare `chrome` (the family's name elsewhere) as its command
      if (/\b(spawn|spawnSync|execFile|execFileSync|exec|execSync|fork|spawnApp|spawnXprobe|Command::new|Popen|subprocess\.\w+)\s*\((?:[^,()]+,\s*)?['"`]chrome['"`]|\bcmd:\s*['"`]chrome['"`]/.test(line)) run.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(named, [], 'a Chrome executable named outside chrome.mjs');
  assert.deepEqual(run, [], 'a process started as chrome outside chrome.mjs');
});

test("the launcher's one process start comes after its guard", () => {
  const text = readFileSync(join(HARNESS, 'chrome.mjs'), 'utf8');
  const starts = [...text.matchAll(/this\.spawnProcess\(/g)];
  assert.equal(starts.length, 1, 'one place starts Chrome');
  const open = text.slice(text.indexOf('  open(url) {'), starts[0].index);
  assert.match(open, /assertOwnChrome\(CHROME_COMMAND, args, this\.scratch\);\n\s*const child = $/, "the guard checks the very command line the start runs");
  assert.doesNotMatch(text.replace(/^\s*(\/\/|\*).*$/gm, ''), /(?<![.\w])(execFile|execFileSync|spawnSync|exec|execSync|fork)\(/, 'no other process API');
});
