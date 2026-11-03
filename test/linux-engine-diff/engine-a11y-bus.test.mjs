// #171 M4, task 43's re-review: on a private display every engine the harness drives, however it starts it, reads the
// run's own accessibility bus, even when the harness was started with the person's AT_SPI_BUS_ADDRESS (and the
// person's session bus) in its environment. The run's start names its own buses (scenes.mjs `useSession`); the engines
// read the display's AT_SPI_BUS first (behaviour §19), which the run's launcher set (session-bus.mjs
// `wireAccessibility`).
//
// Live, on an X server the test starts itself (xtools.mjs `startPrivateServer`, marked private), never another: the
// buses are Unix sockets of the test's own that record who connects and answer nothing, the display's AT_SPI_BUS names
// the run's, and the one window is xprobe's own. No application is started. Each engine is reached the ways the
// harness reaches it: over the wire (`Engine`, run.mjs's lanes), through OpenAI's JavaScript client (`VendorJsEngine`,
// `--via vendor-js`), and behind each service (services.mjs: the vendor's @oai/sky service and cua's own). A lane
// whose engine or vendor JavaScript is not on this machine (the vendor builds live only on the #171 VM) is skipped.

import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Engine } from '../../scripts/linux-engine-diff/engine.mjs';
import { Desktop } from '../../scripts/linux-engine-diff/scenes.mjs';
import { VendorJsEngine } from '../../scripts/linux-engine-diff/vendor-js.mjs';
import { XPROBE, startPrivateServer } from '../../scripts/linux-engine-diff/xtools.mjs';
import { NO_AUTHORITY } from '../../scripts/linux-engine-diff/xspawn.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARCH = process.arch;
const found = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the engines of the spec's Concrete Steps (`BUILT`, `VENDOR`, `NEWEST`) and the pinned @oai/sky (`SKY`)
const SKY = join(homedir(), `.local/share/cua/runtimes/26.928.40906-linux-${ARCH}/cua_node/lib/node_modules/@oai/sky`);
const ENGINES = {
  cua: join(ROOT, 'native/linux-engine/target/release/cua-engine'),
  pinned: join(SKY, `bin/linux/sky_linux_${ARCH}`),
  newest: join(homedir(), `.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_${ARCH}`),
};
const VENDOR_SERVICE = join(SKY, 'dist/project/cua/sky_js/src/service.js');

const LIVE = process.platform === 'linux' && found('Xvfb') && found('xprop') && existsSync(XPROBE);

/** A Unix socket that records each connection and closes it at once: a bus that answers nothing. */
async function listener(path) {
  const server = createServer((socket) => {
    server.connections += 1;
    socket.destroy();
  });
  server.connections = 0;
  await new Promise((resolve, reject) => server.listen(path, resolve).once('error', reject));
  return server;
}

/** Every process whose command line names `path` (a lane's own link to its engine), ended. */
async function endByPath(path) {
  const running = () => {
    try {
      return execFileSync('pgrep', ['-f', '--', path], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(Number);
    } catch {
      return [];
    }
  };
  for (const pid of running()) process.kill(pid, 'SIGTERM');
  for (let i = 0; i < 100 && running().length; i++) await sleep(20);
  for (const pid of running()) process.kill(pid, 'SIGKILL');
}

test('on a private display every engine, however the harness starts it, reads the run\'s accessibility bus, never an inherited AT_SPI_BUS_ADDRESS', { skip: !LIVE && 'needs Linux, Xvfb, xprop and a built xprobe' }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-a11y-engines-'));
  const saved = Object.fromEntries(['DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS', 'AT_SPI_BUS_ADDRESS', 'OAI_SKY_LINUX_BIN'].map((n) => [n, process.env[n]]));
  const buses = {};
  let server = null;
  let window = null;
  let desktop = null;
  try {
    for (const name of ['run-a11y', 'run-session', 'person-a11y', 'person-session']) buses[name] = await listener(join(dir, `${name}.sock`));
    const address = (name) => `unix:path=${join(dir, `${name}.sock`)}`;
    server = await startPrivateServer({ out: dir });
    // the harness as the person's session starts it: their session bus and their accessibility bus inherited
    process.env.DISPLAY = server.display;
    // the server keeps no authority: this test's own clients (its xprop and xprobe, the vendor service's engine) name
    // the run's path that does not exist, as the spawner gives the harness's, never the person's ~/.Xauthority
    process.env.XAUTHORITY = NO_AUTHORITY;
    process.env.DBUS_SESSION_BUS_ADDRESS = address('person-session');
    process.env.AT_SPI_BUS_ADDRESS = address('person-a11y');
    // what the run's launcher sets on the display (session-bus.mjs `wireAccessibility` checks it)
    execFileSync('xprop', ['-root', '-f', 'AT_SPI_BUS', '8s', '-set', 'AT_SPI_BUS', address('run-a11y')], { timeout: 15000 });

    // the run's start on the private display, its session bus a stand-in that names the run's two buses
    desktop = new Desktop({ cua: ENGINES.cua, run: 'a11y-engines', startActive: 0 });
    await desktop.begin({
      startWatchdog: async () => ({ guard: () => {}, stop: async () => ({ state: 'ended', clean: true }) }),
      startSession: async () => ({ address: address('run-session'), a11y: address('run-a11y'), pid: 0, stop: async () => ({ terminated: true, killed: false }) }),
      startRecord: async () => ({ stop: async () => '' }),
      startTrace: () => ({ env: { ...process.env }, stop: async () => '' }),
    });
    assert.equal(desktop.session?.a11y, address('run-a11y'), 'the run began on the private display, under its own session');
    assert.equal(process.env.AT_SPI_BUS_ADDRESS, address('run-a11y'));

    // one window of xprobe's own, with a pid, as association reads it
    const probe = spawn(XPROBE, ['overlay', '0', '0', '320', '240'], { stdio: ['pipe', 'pipe', 'ignore'] });
    window = probe;
    const id = await new Promise((resolve, reject) => {
      createInterface({ input: probe.stdout }).once('line', (line) => resolve(JSON.parse(line).overlay));
      probe.once('exit', (code) => reject(new Error(`xprobe overlay exited (${code})`)));
    });
    execFileSync('xprop', ['-id', String(id), '-f', '_NET_WM_PID', '32c', '-set', '_NET_WM_PID', String(probe.pid)], { timeout: 15000 });
    const read = { window: { id }, include_screenshot: false };

    /** One lane: `drive` makes the engine read the window; it must have dialled the run's bus and no other. */
    const lane = (name, needs, drive) => t.test(name, { skip: needs.find((path) => !existsSync(path)) && `not on this machine: ${needs.find((path) => !existsSync(path))}` }, async () => {
      const before = Object.fromEntries(Object.entries(buses).map(([bus, s]) => [bus, s.connections]));
      await drive();
      const dialled = Object.fromEntries(Object.entries(buses).map(([bus, s]) => [bus, s.connections - before[bus]]));
      assert.ok(dialled['run-a11y'] >= 1, `it read the run's accessibility bus (${JSON.stringify(dialled)})`);
      assert.equal(dialled['person-a11y'], 0, "never the person's accessibility bus");
      assert.equal(dialled['person-session'], 0, "never the person's session bus");
    });

    for (const engine of ['cua', 'pinned', 'newest']) {
      await lane(`${engine} over the wire`, [ENGINES[engine]], async () => {
        const wire = new Engine({ label: engine, bin: ENGINES[engine] }).start();
        try {
          await wire.request('get_window_state', read, { timeoutMs: 30000 });
        } finally {
          await wire.close();
        }
      });
      await lane(`${engine} through OpenAI's JavaScript client`, [ENGINES[engine], SKY], async () => {
        const client = new VendorJsEngine({ label: engine, bin: ENGINES[engine], skyDir: SKY }).start();
        try {
          await client.request('get_window_state', read);
        } finally {
          await client.close();
        }
      });
    }
    // services.mjs: each service on its own path to cua-engine, ended by that path
    const services = {
      vendor: async (link) => {
        process.env.OAI_SKY_LINUX_BIN = link;
        return import(pathToFileURL(VENDOR_SERVICE).href);
      },
      cua: async (link) => (await import('../../src/services/engine/linux/service.mjs')).createService({ env: { CUA_ENGINE_BIN: link, CUA_DESKTOP_MODE: 'shared' } }),
    };
    for (const [name, make] of Object.entries(services)) {
      await lane(`cua behind the ${name} service`, [ENGINES.cua, ...(name === 'vendor' ? [VENDOR_SERVICE] : [])], async () => {
        const link = join(mkdtempSync(join(dir, `${name}-service-`)), 'cua-engine');
        symlinkSync(ENGINES.cua, link);
        try {
          const service = await make(link);
          await service.handleRpc({ type: 'setup' });
          await service.handleRpc({ type: 'execute', method: 'get_window_state', args: [read] }).catch(() => {});
        } finally {
          await endByPath(link);
        }
      });
    }
  } finally {
    window?.stdin.end();
    await desktop?.closeAll();
    desktop?.unhookStop();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await server?.stop();
    for (const bus of Object.values(buses)) bus.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
