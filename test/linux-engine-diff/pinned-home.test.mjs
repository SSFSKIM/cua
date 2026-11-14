// #171 M5, T1's fix wave (the design session's ruling 708): on the pinned release a service the harness starts runs in a
// home of the run's with CUA_HOME the run home, and selects that home's installed engine itself; the engine an
// experiment runs is that installed file, never the check's copy. Display-free: the run home is made here, its engine a
// file of known bytes.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { CandidateRefused } from '../../scripts/linux-engine-diff/candidate.mjs';
import { serveEnv } from '../../scripts/linux-engine-diff/engine-stop.mjs';
import { withExperimentCandidate } from '../../scripts/linux-engine-diff/experiments.mjs';
import { cuaHomeOf, pinnedEngine, pinnedServeEnvironment, selectedEngine } from '../../scripts/linux-engine-diff/pinned-home.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'cua171-pinned-home-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const PERSON = { HOME: '/Users/new', XDG_CONFIG_HOME: '/Users/new/.config', CUA_HOME: '/Users/new/.local/share/cua', DISPLAY: ':7', CUA_LINUX_ENGINE_BIN: '/Users/new/build/cua-engine' };

/** A run home whose cua install placed an engine of `bytes`: `{home, engine}`. */
function runHome(bytes = Buffer.from('engine bytes')) {
  const home = join(scratch, `cua-${n++}`);
  mkdirSync(join(home, 'engine', 'linux'), { recursive: true });
  const engine = join(home, 'engine', 'linux', 'cua-engine');
  writeFileSync(engine, bytes);
  chmodSync(engine, 0o755);
  return { home: realpathSync(home), engine: realpathSync(engine) };
}

test("cua's own selection in the run home runs its installed engine; a home with none is refused", () => {
  const { home, engine } = runHome();
  assert.equal(cuaHomeOf(engine), home);
  assert.equal(realpathSync(selectedEngine(home)), engine);
  const empty = join(scratch, `cua-${n++}`);
  mkdirSync(empty);
  assert.throws(() => selectedEngine(empty), (e) => e instanceof CandidateRefused && /runs no installed engine/.test(e.message));
});

test('the pinned engine is the installed file itself, refused when its bytes changed after the check', () => {
  const bytes = Buffer.from('the pin');
  const { home, engine } = runHome(bytes);
  assert.deepEqual(pinnedEngine(engine, { sha256: sha(bytes) }), { cua: selectedEngine(home), cuaHome: home });
  assert.throws(() => pinnedEngine(engine, { sha256: sha(Buffer.from('another')) }), /changed after its check/);
});

test("a pinned serve's environment: a HOME of the run's with an empty secret store, CUA_HOME the run home, cua's engine, no override", () => {
  const { home } = runHome();
  const dir = join(scratch, `scratch-${n++}`);
  const env = pinnedServeEnvironment({ base: PERSON, cuaHome: home, scratch: dir });
  for (const key of ['HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME']) {
    assert.ok(env[key].startsWith(`${dir}/`), `${key}: ${env[key]}`);
    assert.ok(existsSync(env[key]), key);
  }
  assert.deepEqual(readdirSync(join(env.XDG_CONFIG_HOME, 'claude-secrets')), [], 'an empty secret store');
  assert.equal(env.CUA_HOME, home);
  assert.equal(env.CUA_NATIVE_ENGINE, 'cua');
  assert.equal('CUA_LINUX_ENGINE_BIN' in env, false, 'the serve selects the installed engine itself');
  assert.equal(env.DISPLAY, ':7', 'the display is the run\'s, handed on');
});

test("engine-stop's serve: on the pinned release the run home and no override; on a development or M4 run the engine named, as before", () => {
  const { home, engine } = runHome();
  const desktop = { dir: join(scratch, `desktop-${n++}`) };
  const pinned = serveEnv({ cua: engine, pinnedHome: home, desktop, sandbox: 'scoped' }, 'eof', {}, PERSON);
  assert.equal(pinned.CUA_HOME, home);
  assert.ok(pinned.HOME.startsWith(`${desktop.dir}/serve/`), pinned.HOME);
  assert.equal('CUA_LINUX_ENGINE_BIN' in pinned, false);
  assert.deepEqual([pinned.CUA_NATIVE_ENGINE, pinned.CUA_DESKTOP_MODE, pinned.CUA_SHIM_SECRETS], ['cua', 'dedicated', 'off']);
  const dev = serveEnv({ cua: '/tmp/build/cua-engine', pinnedHome: null, desktop, sandbox: 'scoped' }, 'eof', {}, PERSON);
  assert.equal(dev.CUA_LINUX_ENGINE_BIN, '/tmp/build/cua-engine');
  assert.equal(dev.HOME, '/Users/new', 'a development run keeps the machine\'s cua home, as M4 ran');
});

test('a pinned experiment runs the installed engine itself, its run home named; a release gate runs the checked copy', async () => {
  const bytes = Buffer.from('pinned bytes');
  const { home, engine } = runHome(bytes);
  const prepare = async ({ dir }) => {
    const path = join(dir, 'cua-engine');
    writeFileSync(path, bytes);
    return { path, record: { sha256: sha(bytes) } };
  };
  const seen = await withExperimentCandidate({ cua: engine, gate: 'pinned' }, async (args) => args, { prepare });
  assert.equal(realpathSync(seen.cua), engine, 'the installed file, not a copy');
  assert.equal(seen.pinnedHome, home);
  const gate = await withExperimentCandidate({ cua: engine, gate: true }, async (args) => args, { prepare });
  assert.notEqual(gate.cua, engine, 'a release gate runs its stored copy');
  assert.equal(gate.pinnedHome, undefined);
});
