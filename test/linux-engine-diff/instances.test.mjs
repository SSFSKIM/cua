// Every application the harness launches starts as an instance of the run's own (#171 M4, task 43): none hands its
// window to a person's running instance, over the session bus (a GApplication, KDE's unique-instance service, a
// terminal server) or through a profile or its lock (Firefox, LibreOffice's user installation pipe, Chrome). Each family
// is classified by how its launch keeps to itself, so a family added without that thought fails here. Display-free:
// the launches are only built, and the terminal's start script runs against stand-ins.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { FAMILIES, TERMINAL_SERVER, terminalAppId, terminalClient, vteLaunch } from '../../scripts/linux-engine-diff/families.mjs';

const inside = (dir, path) => typeof path === 'string' && path.startsWith(`${dir}/`);

/** How each family's launch keeps to an instance of its own: a check of its command line, given the scene's directory. */
const ISOLATION = {
  gedit: (l) => l.cmd === 'gedit' && l.args.includes('--standalone'),
  'gnome-text-editor': (l, dir) => l.cmd === 'gnome-text-editor' && l.args.includes('--standalone') && inside(dir, l.env.XDG_DATA_HOME) && inside(dir, l.env.XDG_STATE_HOME),
  kate: (l) => l.cmd === 'kate' && l.args.includes('-n'),
  qtcreator: (l, dir) => l.cmd === 'qtcreator' && inside(dir, l.args[l.args.indexOf('-settingspath') + 1]) && !l.args.some((a) => ['-client', '-block', '-pid'].includes(a)),
  firefox: (l, dir) => l.cmd === 'firefox' && l.args.includes('--no-remote') && l.args.includes('--new-instance') && inside(dir, l.args[l.args.indexOf('--profile') + 1]),
  writer: (l, dir) => l.cmd === 'soffice' && l.args.includes(`-env:UserInstallation=${pathToFileURL(join(dir, 'lo')).href}`),
  'writer-gen': (l, dir) => l.cmd === 'soffice' && l.args.includes(`-env:UserInstallation=${pathToFileURL(join(dir, 'lo')).href}`),
  calc: (l, dir) => l.cmd === 'soffice' && l.args.includes(`-env:UserInstallation=${pathToFileURL(join(dir, 'lo')).href}`),
  electron: (l, dir) => l.args.some((a) => a === `--cua-fixture-user-data=${join(dir, 'electron')}` || a === `--cua-user-data=${join(dir, 'electron')}`),
  'gnome-terminal': (l, dir, label) => l.cmd === 'sh' && l.args.includes(terminalAppId(label)) && l.args.includes(TERMINAL_SERVER),
  // plain processes: no single-instance mechanism at all
  xterm: (l) => l.cmd === 'xterm',
  'xterm-allow': (l) => l.cmd === 'xterm',
  'gtk4-button': (l) => l.cmd === 'python3' && l.args[0] === '-I',
  'gtk4-input': (l) => l.cmd === 'python3' && l.args[0] === '-I',
  'qt5-input': (l) => l.cmd === 'python3' && l.args[0] === '-I',
  'qt6-input': (l) => l.cmd === 'python3' && l.args[0] === '-I',
  'qt5-breeze': (l) => l.cmd === 'python3' && l.args[0] === '-I',
  'qt5-fusion': (l) => l.cmd === 'python3' && l.args[0] === '-I',
  'gtk-scale': (l) => l.cmd === 'python3' && l.args[0] === '-I',
  'gtk-table': (l) => l.cmd === 'python3' && l.args[0] === '-I',
  'atspi-gtk4': (l) => l.cmd === 'python3' && l.args[0] === '-I',
  'atspi-qt5': (l) => l.cmd === 'python3' && l.args[0] === '-I',
  'atspi-qt6': (l) => l.cmd === 'python3' && l.args[0] === '-I',
  'settle-gtk3': (l) => l.cmd === 'python3' && l.args[0] === '-I',
  'settle-qt5': (l) => l.cmd === 'python3' && l.args[0] === '-I',
  'settle-qt6': (l) => l.cmd === 'python3' && l.args[0] === '-I',
};

test('every family launches an instance of its own, and every family is classified', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-instances-'));
  try {
    const label = 'cua171-diff-r-n0-family-r';
    for (const [name, family] of Object.entries(FAMILIES)) {
      if (family.chrome) {
        // the run's own Chrome instance (chrome.mjs, chrome.test.mjs)
        assert.equal(family.launch, undefined, `${name} opens through the run's Chrome only`);
        continue;
      }
      const check = ISOLATION[name];
      assert.ok(check, `${name} is not classified: say how its launch keeps to an instance of its own`);
      for (const ctx of [{ label, dir }, { label, dir, page: 'drag.html' }, { label, dir, doc: 'a document\n' }]) {
        const launch = family.launch(ctx);
        assert.ok(check({ env: {}, ...launch }, dir, label), `${name} (${JSON.stringify(Object.keys(ctx))}): ${launch.cmd} ${launch.args.join(' ')}`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a scene terminal's server name is unique to its scene and a valid application id", () => {
  const ids = ['cua171-diff-t4c-full-8b3c502d-gnometerminal-cua', 'cua171-diff-t4c-full-8b3c502d-gnometerminal-pinned', 'cua171-diff-a.b-n0-gnometerminal-r'].map(terminalAppId);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.ok(id.length <= 255);
    assert.match(id, /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_-]*)+$/, id);
  }
  assert.equal(terminalClient(() => true), '/usr/bin/gnome-terminal.real', "Ubuntu's client itself, not its wrapper, which starts a server of its own for --app-id");
  assert.equal(terminalClient(() => false), 'gnome-terminal');
});

test("the terminal's start: the scene's server under its name, then the client asking that server, the arguments as given", () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-terminal-'));
  try {
    const log = join(dir, 'log');
    writeFileSync(log, '');
    const stand = (name, body) => {
      writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
      chmodSync(join(dir, name), 0o755);
      return join(dir, name);
    };
    const record = (who) => `printf '%s' "${who}" >> ${JSON.stringify(log)}; for a in "$@"; do printf ' [%s]' "$a" >> ${JSON.stringify(log)}; done; echo >> ${JSON.stringify(log)}`;
    const server = stand('server', record('server'));
    const client = stand('client', record('client'));
    // the name appears once the server is up, as on a bus
    stand('gdbus', `for i in $(seq 100); do grep -q '^server' ${JSON.stringify(log)} && break; sleep 0.05; done; ${record('gdbus')}`);
    const label = 'cua171-diff-r-n0-gnometerminal-r';
    const launch = vteLaunch({ label, dir }, { client });
    const args = launch.args.map((a) => (a === TERMINAL_SERVER ? server : a));
    const ran = spawnSync(launch.cmd, args, { encoding: 'utf8', env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}` }, timeout: 10000 });
    assert.equal(ran.status, 0, ran.stderr);
    const lines = readFileSync(log, 'utf8').trim().split('\n').sort();
    const id = terminalAppId(label);
    assert.deepEqual(lines.map((l) => l.split(' ')[0]), ['client', 'gdbus', 'server']);
    assert.equal(lines.find((l) => l.startsWith('server')), `server [--app-id] [${id}]`);
    assert.equal(lines.find((l) => l.startsWith('gdbus')), `gdbus [wait] [--session] [--timeout] [20] [${id}]`);
    const clientLine = lines.find((l) => l.startsWith('client'));
    assert.ok(clientLine.startsWith(`client [--app-id] [${id}] [--wait] [--title] [${label}] [--] [sh] [-c]`), clientLine);
    assert.ok(clientLine.endsWith(`[${join(dir, `${label}.pid`)}] [${label}]`), clientLine);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a terminal whose server never takes its name gets no client: nothing asks the session for a window', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-terminal-'));
  try {
    const log = join(dir, 'log');
    writeFileSync(log, '');
    for (const [name, body] of [['server', 'exit 0'], ['client', `echo client >> ${JSON.stringify(log)}`], ['gdbus', 'exit 1']]) {
      writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
      chmodSync(join(dir, name), 0o755);
    }
    const launch = vteLaunch({ label: 'cua171-diff-r-n0-gnometerminal-r', dir }, { client: join(dir, 'client') });
    const args = launch.args.map((a) => (a === TERMINAL_SERVER ? join(dir, 'server') : a));
    const ran = spawnSync(launch.cmd, args, { encoding: 'utf8', env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH}` }, timeout: 10000 });
    assert.equal(ran.status, 1);
    assert.equal(readFileSync(log, 'utf8'), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
