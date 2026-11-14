// #171 M5, T1: the facade fixtures' sampler judged (scripts/linux-engine-gate/engine-watch.mjs). Acceptance 1 passes only
// when no sky_linux was seen at any sample, and the engine that answered is the run home's installed cua-engine, a child
// of cua's trusted worker; the launcher shim under the supervisor is the same binary and allowed beside it.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { watchVerdict } from '../../scripts/linux-engine-gate/engine-watch.mjs';

const ENGINE = '/runs/m5/accept/cua/engine/linux/cua-engine';
const WORKER = '/runs/m5/accept/cua/node/24.22.0/bin/node --experimental-vm-modules /checkout/src/repl-host/trusted-worker.mjs';
const SUPERVISOR = '/runs/m5/accept/cua/node/24.22.0/bin/node --disable-sigusr1 /checkout/src/repl-host/supervisor.mjs';
/** The 50 ms sampler's record (m4/facade/scripts/watch.mjs) of a passing Acceptance 1, as M4's release check saw it. */
const watch = (over = {}) => ({
  exit: { code: 0, signal: null },
  samples: 3355,
  maxSkyLinux: 0,
  engines: [
    { pid: 1, exe: ENGINE, ppid: '10', parent: SUPERVISOR },
    { pid: 2, exe: ENGINE, ppid: '11', parent: WORKER },
  ],
  ...over,
});

test("the sampler passes when only the home's installed engine ran, one of them a child of the trusted worker, and no sky_linux", () => {
  assert.deepEqual(watchVerdict(watch(), { engine: ENGINE }), { pass: true, problems: [] });
});

test('the sampler fails any sky_linux, an engine that is not the installed one, or no engine under the trusted worker', () => {
  const fails = (record, pattern) => {
    const verdict = watchVerdict(record, { engine: ENGINE });
    assert.equal(verdict.pass, false);
    assert.match(verdict.problems.join('; '), pattern);
  };
  fails(watch({ maxSkyLinux: 1 }), /sky_linux was seen \(1 at once at most\)/);
  fails(watch({ engines: [{ pid: 2, exe: '/checkout/native/linux-engine/target/release/cua-engine', ppid: '11', parent: WORKER }] }), /ran \/checkout\/.*target\/release\/cua-engine, not the run home's installed engine/);
  fails(watch({ engines: [{ pid: 1, exe: ENGINE, ppid: '10', parent: SUPERVISOR }] }), /no cua-engine under the trusted worker/);
  fails(watch({ engines: [] }), /no cua-engine under the trusted worker/);
  fails(watch({ samples: 0 }), /no samples/);
  // an engine replaced while it ran reads as deleted: not the installed file
  fails(watch({ engines: [{ pid: 2, exe: `${ENGINE} (deleted)`, ppid: '11', parent: WORKER }] }), /not the run home's installed engine/);
});
