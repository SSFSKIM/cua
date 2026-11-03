// The run's temporary directory (#171 M4, task 51, item 2; the design session's ruling, sminos 336): every application
// the harness launches and every engine it drives writes its temporary files under the run's scratch (`<scratch>/tmp`,
// TMPDIR), never in the harness's own TMPDIR. Task 49 found Qt Creator's single-instance socket, lockfile and `qipc_*`
// files there (named for the application and the user, so on `:0` shared with a person's Qt Creator), LibreOffice's
// `lu*.tmp`, Firefox's and Chrome's temporary files and the vendor builds' screenshots, none ever removed. cua and both
// vendor builds get the same directory, so the comparison stays fair; an engine's other variables stay as they are.
// Display-free: the applications and the engine are stand-ins that write the environment they were started with.

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import test from 'node:test';

import { launchEnvironment, runTmp } from '../../scripts/linux-engine-diff/app-env.mjs';
import { Engine } from '../../scripts/linux-engine-diff/engine.mjs';
import { leftByVendor } from '../../scripts/linux-engine-diff/run.mjs';
import { Desktop } from '../../scripts/linux-engine-diff/scenes.mjs';
import { VendorJsEngine } from '../../scripts/linux-engine-diff/vendor-js.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RUN_BUS = 'unix:path=/tmp/cua171-run-x/session/bus/x';

test("an application's TMPDIR is the run's, on every display, and no family names its own", () => {
  const scratch = '/tmp/cua171-run-x';
  const base = { PATH: '/usr/bin', HOME: '/home/person', TMPDIR: '/tmp', DISPLAY: ':0' };
  for (const privateDisplay of [false, true]) {
    assert.equal(launchEnvironment({ scratch, base, privateDisplay, sessionBus: RUN_BUS }).TMPDIR, join(scratch, 'tmp'));
    assert.equal(launchEnvironment({ scratch, base: { ...base, TMPDIR: undefined }, privateDisplay, sessionBus: RUN_BUS }).TMPDIR, join(scratch, 'tmp'), 'set where the harness has none');
    for (const extra of [{ TMPDIR: '/tmp' }, { TMPDIR: join(scratch, 'tmp') }, { TMPDIR: undefined }]) {
      assert.throws(() => launchEnvironment({ scratch, base, privateDisplay, sessionBus: RUN_BUS, app: 'qtcreator', extra }), /^Error: refusing to start qtcreator: its own environment sets TMPDIR/);
    }
  }
  assert.equal(runTmp(scratch), join(scratch, 'tmp'));
});

/** Stand-ins on a PATH of the test's own: the X tools a run's start reads, an application and an engine. */
function standIns() {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-runtmp-tools-'));
  const tool = (name, body) => {
    writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(dir, name), 0o755);
  };
  tool('xwininfo', 'echo "xwininfo: Window id: 0x293 (the root window) (has no name)"');
  tool('xprop', 'echo "_NET_ACTIVE_WINDOW(WINDOW): window id # 0x0"');
  tool('xdotool', 'exit 0');
  // the application and the engine each write their TMPDIR and exit (the engine once its stdin closes)
  tool('qtcreator-standin', `printf '%s' "\${TMPDIR-unset}" > ${JSON.stringify(join(dir, 'app.tmpdir'))}`);
  const engine = join(dir, 'engine-standin');
  writeFileSync(engine, `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(join(dir, 'engine.'))} + process.pid, process.env.TMPDIR ?? 'unset');\nprocess.stdin.resume();\n`);
  chmodSync(engine, 0o755);
  const saved = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${saved}`;
  const read = async (file) => {
    for (let i = 0; i < 150 && !existsSync(file); i++) await sleep(20);
    return readFileSync(file, 'utf8');
  };
  return {
    engine,
    appTmpdir: () => read(join(dir, 'app.tmpdir')),
    engineTmpdir: (pid) => read(join(dir, `engine.${pid}`)),
    done() {
      process.env.PATH = saved;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const fakeTrace = () => () => ({ env: { ...process.env, DISPLAY: ':cua171-test-trace' }, stop: async () => '' });
const fakeRecord = async () => ({ pid: 1, stop: async () => [JSON.stringify({ kind: 'ready', ms: 1 }), JSON.stringify({ kind: 'end', ms: 2 })].join('\n') });
const fakeWatchdog = async () => ({ guard: () => {}, stop: async () => ({ state: 'ended', clean: true, stalled: false, reason: null, round_trips: 1, lines: [] }) });
const fakeSession = async () => ({ address: RUN_BUS, a11y: null, stop: async () => ({ terminated: true, killed: false }) });

for (const isPrivate of [true, false]) {
  test(`while a run is open its applications and every engine, cua's and the vendor builds' alike, share the run's TMPDIR, which goes with the scratch (${isPrivate ? 'a private display' : "a person's display"})`, async () => {
    const tools = standIns();
    const desktop = new Desktop({ cua: 'unused', run: 'runtmp', reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0, nonce: 'n0' });
    const harnessTmp = process.env.TMPDIR;
    const engines = [];
    try {
      await desktop.begin({ startTrace: fakeTrace(), startRecord: fakeRecord, existing: () => [], privateDisplay: () => isPrivate, startWatchdog: fakeWatchdog, startSession: fakeSession });
      const tmp = runTmp(desktop.dir);
      desktop.spawnApp(desktop.label('qtc'), 'qtcreator-standin', [], { app: 'qtcreator' });
      assert.equal(await tools.appTmpdir(), tmp, "an application's");
      // cua's and a vendor build's lanes, with and without variables of their own (run.mjs `makeEngine`, events.mjs)
      for (const env of [undefined, { ...process.env, XDG_DATA_HOME: '/tmp/cua171-events-x/data' }]) {
        const engine = new Engine({ label: 'pinned', bin: tools.engine, env }).start();
        engines.push(engine);
        assert.equal(await tools.engineTmpdir(engine.pid), tmp, "an engine's");
      }
      const vendor = new VendorJsEngine({ label: 'newest', bin: tools.engine, skyDir: '/nonexistent', env: { XDG_DATA_HOME: '/tmp/cua171-events-x/data' } }).start();
      try {
        const overrides = vendor.overrides();
        assert.equal(overrides.TMPDIR, tmp, "the vendor JavaScript client's engine's");
        assert.equal(overrides.XDG_DATA_HOME, '/tmp/cua171-events-x/data', "the lane's own variables kept");
      } finally {
        await vendor.close();
      }
      assert.ok(statSync(tmp).isDirectory(), "the run's TMPDIR exists once the run has begun");
      assert.equal(statSync(tmp).mode & 0o777, 0o700, "the run's alone");
      assert.equal(process.env.TMPDIR, harnessTmp, "the harness's own TMPDIR is unchanged");
      for (const engine of engines.splice(0)) await engine.close();
      await desktop.closeAll();
      assert.equal(existsSync(tmp), false, "the run's TMPDIR goes with its scratch");
      // after the run, an engine is the harness's own again
      const after = new Engine({ label: 'cua', bin: tools.engine }).start();
      engines.push(after);
      assert.equal(await tools.engineTmpdir(after.pid), harnessTmp ?? 'unset');
    } finally {
      for (const engine of engines) await engine.close();
      desktop.unhookStop();
      rmSync(desktop.dir, { recursive: true, force: true });
      tools.done();
    }
  });
}

test("a vendor build's screenshot, left in the run's TMPDIR, is the harness's to remove; cua-engine's, in its own private directory there, is not", () => {
  const scratch = mkdtempSync(join(tmpdir(), 'cua171-runtmp-shots-'));
  try {
    const tmp = runTmp(scratch);
    mkdirSync(join(tmp, 'cua-engine-AbC123'), { recursive: true });
    assert.equal(leftByVendor(join(tmp, '2979812_530665403.jpg'), scratch), true, 'sky_linux writes `$TMPDIR/<pid>_<ns>.jpg` and never removes it');
    assert.equal(leftByVendor(join(tmp, 'cua-engine-AbC123', 'shot-1.jpg'), scratch), false, "cua-engine's private directory is the engine's to remove");
    assert.equal(leftByVendor('/tmp/2979812_530665403.jpg', scratch), false, 'nothing outside the run');
    assert.equal(leftByVendor(join(tmp, '..', 'home', 'x.jpg'), scratch), false);
    // the link a vendor-JavaScript lane writes its copies beside is its own, removed with its directory
    const link = join(scratch, 'link');
    symlinkSync(tmp, link);
    assert.equal(leftByVendor(join(link, 'x.jpg'), scratch), false);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
