// The live lifeline check's verdict (docs/evidence/2026-10-14-own-repl-host-parity/m4/lifeline-sandbox-check/device.mjs)
// passes the recorded mini run and fails every run that could not prove the lifeline: no kernel or worker at all,
// failed or unattested cells, a child without its lifeline, children that outlived the bound, a missing scenario.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readiness, verdict} from '../../docs/evidence/2026-10-14-own-repl-host-parity/m4/lifeline-sandbox-check/device.mjs';

const recorded = JSON.parse(readFileSync(new URL('../../docs/evidence/2026-10-14-own-repl-host-parity/m4/lifeline-sandbox-check/result.json', import.meta.url), 'utf8')).results;
const VERSION = recorded[0].facts.serverInfo.version;
const copy = () => structuredClone(recorded);
const failsWith = (results, pattern) => { const judged = verdict(results, VERSION); assert.equal(judged.ok, false); assert.ok(judged.problems.some(p => pattern.test(p)), judged.problems.join('; ')); };

test('the recorded mini run passes, both children identified and attested before each disruption', () => {
  assert.deepEqual(verdict(recorded, VERSION), {ok: true, problems: []});
  for (const r of recorded) assert.deepEqual(readiness(r.facts, VERSION), []);
});

test('a run with no kernel or worker, or children without identity or lifeline, fails', () => {
  let results = copy();
  results[0].facts.processes = results[0].facts.processes.filter(p => !['kernel', 'worker'].includes(p.role));
  failsWith(results, /supervisor: no kernel was recorded/);
  failsWith(results, /supervisor: no worker was recorded/);
  results = copy();
  for (const r of results) r.facts.processes = [];
  failsWith(results, /everything-above: no kernel was recorded/);
  results = copy();
  results[1].facts.processes.find(p => p.role === 'worker').fifos = 0;
  failsWith(results, /everything-above: the worker \d+ does not hold its lifeline/);
  results = copy();
  results[0].facts.processes.find(p => p.role === 'kernel').pid = null;
  failsWith(results, /supervisor: the kernel has no identity/);
});

test('failed or unattested cells fail, as do unended children, leftovers and a missing scenario', () => {
  const mutate = (change, pattern) => { const results = copy(); change(results); failsWith(results, pattern); };
  mutate(r => { r[0].facts.cells.spin = 'Trusted RPC service is not configured: spin'; }, /the worker did not answer its spin/);
  mutate(r => { r[0].facts.cells.kernel = undefined; }, /the kernel did not answer its busy cell/);
  mutate(r => { r[0].facts.serverInfo = {name: 'rmcp', version: '1.5.0'}; }, /initialize did not attest/);
  mutate(r => { r[1].facts.cells.replHost = null; }, /kernel's result did not attest/);
  mutate(r => { r[0].facts.cells.outcomes = {warm: {isError: true}, spin: {isError: false}, kernel: {isError: false}}; }, /the warm cell failed/);
  mutate(r => { r[0].childrenEndedMs = null; }, /did not end within the bound/);
  mutate(r => { r[1].reparentedToLaunchd = [{pid: 9, ppid: 1}]; }, /reparented to launchd/);
  mutate(r => { r[1].killed = r[1].killed.filter(k => k.role !== 'anchor'); }, /the anchor was not killed/);
  mutate(r => { r[0].notDisrupted = ['no kernel was recorded']; }, /not disrupted/);
  mutate(r => { r.pop(); }, /no everything-above scenario/);
});
