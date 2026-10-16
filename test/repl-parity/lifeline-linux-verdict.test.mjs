// The Linux live lifeline check's verdict (docs/evidence/2026-10-14-own-repl-host-parity/m5/linux/lifeline/device.mjs)
// passes the recorded cua-linux run and fails every run that could not prove the lifeline. The M4 mutations
// (test/repl-parity/lifeline-sandbox-verdict.test.mjs) carry over; the Linux additions are the managed-Node rule, the
// reparent rule outside the recorded tree, and the lifeline counted only on the named FIFO of a Node child.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readiness, verdict} from '../../docs/evidence/2026-10-14-own-repl-host-parity/m5/linux/lifeline/device.mjs';

const recorded = JSON.parse(readFileSync(new URL('../../docs/evidence/2026-10-14-own-repl-host-parity/m5/linux/lifeline/result.json', import.meta.url), 'utf8')).results;
const VERSION = recorded[0].facts.serverInfo.version;
const copy = () => structuredClone(recorded);
const failsWith = (results, pattern) => { const judged = verdict(results, VERSION); assert.equal(judged.ok, false); assert.ok(judged.problems.some(p => pattern.test(p)), judged.problems.join('; ')); };
const mutate = (change, pattern) => { const results = copy(); change(results); failsWith(results, pattern); };

test('the recorded cua-linux run passes: one Node kernel and one Node worker, each on its lifeline, under the sandbox layers', () => {
  assert.deepEqual(verdict(recorded, VERSION), {ok: true, problems: []});
  for (const r of recorded) {
    assert.deepEqual(readiness(r.facts, VERSION), []);
    for (const role of ['kernel', 'worker']) assert.deepEqual(r.facts.processes.filter(p => p.role === role).map(p => [p.exe, p.fifos]), [['node', 1]]);
  }
});

test('children that are missing, unidentified or off their lifeline fail', () => {
  mutate(r => { r[0].facts.processes = r[0].facts.processes.filter(p => p.role !== 'kernel'); }, /supervisor: no kernel was recorded/);
  mutate(r => { r[1].facts.processes.find(p => p.role === 'worker').fifos = 0; }, /everything-above: the worker \d+ does not hold its lifeline/);
  mutate(r => { r[0].facts.processes.find(p => p.role === 'kernel').pid = null; }, /supervisor: the kernel has no identity/);
});

test('a supervisor that did not run on the managed Node fails', () => {
  mutate(r => { r[0].facts.supervisorNode = ['/usr/local/bin/node']; }, /supervisor: the supervisor did not run on the managed Node/);
  mutate(r => { r[1].facts.supervisorNode = []; }, /everything-above: the supervisor did not run on the managed Node/);
  mutate(r => { r[0].facts.managedNode = null; }, /supervisor: the supervisor did not run on the managed Node/);
});

test('failed or unattested cells, unended or reparented children, missing kills and a missing scenario fail', () => {
  mutate(r => { r[0].facts.cells.spin = 'Trusted RPC service is not configured: spin'; }, /the worker did not answer its spin/);
  mutate(r => { r[0].facts.serverInfo = {name: 'rmcp', version: '1.5.0'}; }, /initialize did not attest/);
  mutate(r => { r[1].facts.cells.replHost = null; }, /kernel's result did not attest/);
  mutate(r => { r[0].facts.cells.outcomes.warm.isError = true; }, /the warm cell failed/);
  mutate(r => { r[0].childrenEndedMs = null; }, /did not end within the bound/);
  mutate(r => { r[1].reparented = [{pid: 9, ppid: 1}]; }, /reparented outside the tree/);
  mutate(r => { r[1].cleanup.recordedAlive = 1; }, /a recorded process was left/);
  mutate(r => { r[1].killed = r[1].killed.filter(k => k.role !== 'anchor'); }, /the anchor was not killed/);
  mutate(r => { r[0].notDisrupted = ['no kernel was recorded']; }, /not disrupted/);
  mutate(r => { r.pop(); }, /no everything-above scenario/);
});
