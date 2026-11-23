// --engine-sandbox (task 117; ruling 899's condition): a cua lane's engine launched inside cua's worker sandbox, as the
// service runs it: the worker's role, the trusted services' network (the X display and the accessibility bus), the
// helper of the run's cua home, the engine's command line whole.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sandboxHome, sandboxedEngine } from '../../scripts/linux-engine-diff/engine-sandbox.mjs';

test("a sandboxed engine is the worker's launch of its own command line, with the trusted services' network", () => {
  const seen = [];
  const launch = (request) => {
    seen.push(request);
    return { command: '/h/codex-linux-sandbox', args: ['--', ...request.command], env: request.env, cwd: request.cwd };
  };
  const helper = ({ home, arch }) => ({ path: `${home}/sandbox/codex-linux-sandbox`, sha256: 'x', arch });
  const env = { DISPLAY: ':1', TMPDIR: '/run/t', CUA_HOME: '/home/r' };
  const out = sandboxedEngine('/c/cua-engine', ['server', '--stats'], env, { launch, helper });
  assert.deepEqual(out, { command: '/h/codex-linux-sandbox', args: ['--', '/c/cua-engine', 'server', '--stats'], env, cwd: '/run/t' });
  assert.equal(seen[0].role, 'worker');
  assert.equal(seen[0].network, 'enabled');
  assert.equal(seen[0].platform, 'linux');
  assert.equal(seen[0].helper.path, '/home/r/sandbox/codex-linux-sandbox', "the run home's helper");
  assert.equal(sandboxHome({}).endsWith('/.local/share/cua'), true, 'else the default cua home');
  // a helper that is missing or not the pinned one refuses the launch: never a run unsandboxed
  assert.throws(() => sandboxedEngine('/c/cua-engine', ['server'], env, { launch, helper: () => { throw new Error('sandbox_unavailable'); } }), /sandbox_unavailable/);
});
