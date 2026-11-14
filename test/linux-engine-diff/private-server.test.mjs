// #171 M4, task 44: every live display the harness starts runs under the watchdog from its first client on, before
// anything probes or drives it, and the watchdog ends before the server does (or it would take the server's end for a
// stall). The events experiment's private Xvfb was the one display lifecycle outside a Desktop, and it ran unwatched.
// Display-free: Xvfb and xprop are fakes on PATH, the watchdog a stand-in.

import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PRIVATE_MARK, startPrivateServer } from '../../scripts/linux-engine-diff/xtools.mjs';

const HARNESS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'linux-engine-diff');

/** A fake Xvfb that reports display `number` on its -displayfd and lives until signalled, and an xprop that logs. */
function fakeServer(number = 42) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-private-server-'));
  const log = join(dir, 'log');
  writeFileSync(log, '');
  const tool = (name, body) => {
    writeFileSync(join(dir, name), `#!/bin/sh\necho "${name} $*" >> ${JSON.stringify(log)}\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  };
  tool('Xvfb', `echo $$ > ${JSON.stringify(join(dir, 'pid'))}\necho ${number} >&3\nexec sleep 30`);
  tool('xprop', 'exit 0');
  const saved = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${saved}`;
  return {
    dir,
    pid: () => Number(readFileSync(join(dir, 'pid'), 'utf8')),
    calls: () => readFileSync(log, 'utf8').split('\n').filter(Boolean),
    done: () => {
      process.env.PATH = saved;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('a private server is watched before anything probes it, guarded by its watchdog, and outlives the watchdog', async () => {
  const server = fakeServer(42);
  const order = [];
  try {
    const started = await startPrivateServer({
      out: server.dir,
      startWatchdog: async (options) => {
        order.push(`watchdog ${options.display}, after ${server.calls().filter((c) => c.startsWith('xprop')).length} probes`);
        return {
          guard: (pid) => order.push(`guard ${pid === server.pid() ? 'the server' : pid}`),
          stop: async () => {
            order.push(`watchdog stopped, the server ${alive(started.pid) ? 'alive' : 'gone'}`);
            return { state: 'ended', clean: true };
          },
        };
      },
    });
    assert.equal(started.display, ':42');
    assert.equal(order[0], 'watchdog :42, after 0 probes', 'the watchdog first, before the mark is set');
    assert.ok(server.calls().some((c) => c === `xprop -root -f ${PRIVATE_MARK} 8s -set ${PRIVATE_MARK} 1`), 'then the display is marked private');
    assert.deepEqual(order.filter((o) => o.startsWith('guard')), ['guard the server'], 'the server itself is guarded: a stall kills it first');
    assert.equal(started.pid, server.pid());
    const verdict = await started.stop();
    assert.deepEqual(verdict, { state: 'ended', clean: true });
    assert.equal(order.at(-1), 'watchdog stopped, the server alive', 'the watchdog ends before the server it watches');
    for (let i = 0; i < 50 && alive(started.pid); i++) await sleep(20);
    assert.equal(alive(started.pid), false, 'and the server is ended');
  } finally {
    server.done();
  }
});

test('a private server whose watchdog does not answer is ended, and nothing probes it', async () => {
  const server = fakeServer(43);
  let pid = null;
  try {
    await assert.rejects(
      startPrivateServer({
        out: server.dir,
        startWatchdog: async () => {
          pid = server.pid();
          throw new Error("the run's display :43 did not answer the watchdog's first round trip in 15000 ms, so nothing is run on it");
        },
      }),
      /nothing is run on it/,
    );
    assert.deepEqual(server.calls().filter((c) => c.startsWith('xprop')), [], 'never probed');
    assert.ok(pid > 0, 'the fake server was found');
    for (let i = 0; i < 50 && alive(pid); i++) await sleep(20);
    assert.equal(alive(pid), false, 'the server is ended');
  } finally {
    server.done();
  }
});

test('a server that fails to start fails at once, and nothing is watched or probed', async () => {
  const server = fakeServer();
  writeFileSync(join(server.dir, 'Xvfb'), '#!/bin/sh\nexit 1\n');
  try {
    await assert.rejects(startPrivateServer({ out: server.dir, startWatchdog: () => assert.fail('no watchdog for a server that never started') }), /Xvfb exited/);
    assert.deepEqual(server.calls(), []);
  } finally {
    server.done();
  }
});

test("the harness starts an X server only through startPrivateServer: no other module spawns Xvfb", () => {
  const spawning = readdirSync(HARNESS)
    .filter((name) => name.endsWith('.mjs'))
    .filter((name) => /(?:\bspawn|\bxSpawn)(?:Sync)?\(\s*['"]Xvfb['"]|[eE]xecFile(?:Sync)?\(\s*['"]Xvfb['"]|xvfb-run/.test(readFileSync(join(HARNESS, name), 'utf8')));
  assert.deepEqual(spawning, ['xtools.mjs']);
  const events = readFileSync(join(HARNESS, 'events.mjs'), 'utf8');
  assert.match(events, /startPrivateServer\(/, "the events experiment's display is the watched one");
});
