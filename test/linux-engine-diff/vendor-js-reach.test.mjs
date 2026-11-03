// The vendor-JavaScript engine lane behind the one spawner's display check (#171 M4, task 48; task 47's re-review): OpenAI's
// client starts the engine itself, with the process's environment, so `VendorJsEngine` installs the lane's variables
// into process.env and hands off to it. Before anything of the client is loaded, constructed or invoked, the
// environment the client would start the engine with (process.env with the lane's variables over it) is checked through
// xspawn.mjs's policy: a display the run did not create is refused, and nothing of the client runs.
//
// Display-free: the client is a tripwire of the test's own (an `@oai/sky` directory whose create_client.js logs when it
// is loaded, constructed and invoked, with the DISPLAY it saw, and starts nothing); no vendor runtime is read.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { TEST_DISPLAY } from '../../scripts/linux-engine-diff/hermetic.mjs';
import { VendorJsEngine } from '../../scripts/linux-engine-diff/vendor-js.mjs';
import { DisplayRefused } from '../../scripts/linux-engine-diff/xspawn.mjs';

const refused = (error) => error instanceof DisplayRefused;

/** A fresh `@oai/sky` tripwire (a new directory, so the module is loaded anew): `{skyDir, steps(), done()}`. */
function tripwireClient() {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-vjs-tripwire-'));
  const log = join(dir, 'steps.jsonl');
  writeFileSync(log, '');
  const target = join(dir, 'sky', 'dist/project/cua/sky_js/src/targets/linux');
  mkdirSync(target, { recursive: true });
  writeFileSync(
    join(target, 'create_client.js'),
    `import { appendFileSync } from 'node:fs';
const step = (name) => appendFileSync(${JSON.stringify(log)}, JSON.stringify({ step: name, display: process.env.DISPLAY ?? null }) + '\\n');
step('load');
export function create_client() {
  step('construct');
  return {
    list_windows: async () => (step('invoke list_windows'), []),
    get_window_state: async () => (step('invoke get_window_state'), { ax_tree: { id: 'n0', native_id: 'n0', children: [] } }),
  };
}
`,
  );
  return {
    skyDir: join(dir, 'sky'),
    steps: () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)),
    done: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/** The forms that reached the person's display before the spawner (task 41, task 45, xspawn.mjs). */
const PERSONS = [':0', ':0.0', 'unix:/tmp/.X11-unix/X0', '/tmp/.X11-unix/X0', 'localhost:0'];

test('the tripwire client answers through the lane on a display the run may reach, which shows the refusals below are the check', async () => {
  const client = tripwireClient();
  const engine = new VendorJsEngine({ label: 'cua', bin: '/bin/true', skyDir: client.skyDir, env: { DISPLAY: TEST_DISPLAY } }).start();
  try {
    const { response } = await engine.request('list_windows', {});
    assert.deepEqual(response, { id: null, ok: true, output: [] });
    assert.deepEqual(await engine.resolveElements({ id: 1 }, { root: 'n0' }), { root: 'n0' });
    assert.deepEqual(client.steps(), [
      { step: 'load', display: TEST_DISPLAY },
      { step: 'construct', display: TEST_DISPLAY },
      { step: 'invoke list_windows', display: TEST_DISPLAY },
      { step: 'invoke get_window_state', display: TEST_DISPLAY },
    ]);
  } finally {
    await engine.close();
    client.done();
  }
});

for (const display of PERSONS) {
  test(`a request on the lane whose environment names ${display} is refused before the client is loaded`, async () => {
    const client = tripwireClient();
    const engine = new VendorJsEngine({ label: 'cua', bin: '/bin/true', skyDir: client.skyDir, env: { DISPLAY: display } }).start();
    try {
      await assert.rejects(engine.request('list_windows', {}), (error) => {
        assert.ok(refused(error), error.message);
        assert.ok(error.message.includes(`on the X display ${display}:`), error.message);
        return true;
      });
      assert.deepEqual(client.steps(), [], 'nothing of the client was loaded, constructed or invoked');
    } finally {
      await engine.close();
      client.done();
    }
  });

  test(`resolving element ids on the lane whose environment names ${display} is refused before the client is loaded`, async () => {
    const client = tripwireClient();
    const engine = new VendorJsEngine({ label: 'cua', bin: '/bin/true', skyDir: client.skyDir, env: { DISPLAY: display } }).start();
    try {
      await assert.rejects(engine.resolveElements({ id: 1 }, { root: 'n0' }), refused);
      assert.deepEqual(client.steps(), []);
    } finally {
      await engine.close();
      client.done();
    }
  });
}

test("the check reads the environment the client would start the engine with: the process's own DISPLAY when the lane names none", async () => {
  const client = tripwireClient();
  const saved = process.env.DISPLAY;
  const engine = new VendorJsEngine({ label: 'cua', bin: '/bin/true', skyDir: client.skyDir }).start();
  try {
    process.env.DISPLAY = ':0';
    await assert.rejects(engine.request('list_windows', {}), refused);
    await assert.rejects(engine.resolveElements({ id: 1 }, {}), refused);
    delete process.env.DISPLAY;
    await assert.rejects(engine.request('list_windows', {}), /DISPLAY is unset/);
    assert.deepEqual(client.steps(), []);
  } finally {
    process.env.DISPLAY = saved;
    await engine.close();
    client.done();
  }
});

test('a client already made is not invoked once the environment names a display the run may not reach', async () => {
  const client = tripwireClient();
  const engine = new VendorJsEngine({ label: 'cua', bin: '/bin/true', skyDir: client.skyDir, env: { DISPLAY: TEST_DISPLAY } }).start();
  try {
    assert.equal((await engine.request('list_windows', {})).response.ok, true);
    engine.env = { DISPLAY: ':0' };
    await assert.rejects(engine.request('list_windows', {}), refused);
    await assert.rejects(engine.resolveElements({ id: 1 }, {}), refused);
    assert.deepEqual(client.steps().map((s) => s.step), ['load', 'construct', 'invoke list_windows'], 'no invocation after the first');
    assert.equal(process.env.DISPLAY, TEST_DISPLAY, "the process's environment is as it was");
  } finally {
    await engine.close();
    client.done();
  }
});
