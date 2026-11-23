// sandbox-live's capture replay (scripts/sandbox-probe/hosted-gate.sh `port_vs_capture`) resolves M0's recorded scratch
// root inside its own step: captures whose provenance is missing or inconsistent fail that replay alone, and the steps
// after it still run and are reported. The gate's own `quiet`, `step` and `port_vs_capture` are taken from the script
// and run under sh with `scratch` and `publish` stubbed, so nothing is installed or launched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const GATE = readFileSync(join(REPO, 'scripts/sandbox-probe/hosted-gate.sh'), 'utf8');
const fn = name => {
  const found = new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}$`, 'm').exec(GATE);
  assert.ok(found, `hosted-gate.sh defines ${name}()`);
  return found[0];
};
const capture = root => ({input: {env: {HOME: `${root}/userhome`}, cwd: `${root}/home/run/s`, cli: `${root}/home/runtimes/r/codex`}});

function replay(t, captures) {
  const work = mkdtempSync(join(tmpdir(), 'hosted-gate-replay-'));
  t.after(() => rmSync(work, {recursive: true, force: true}));
  const m0 = join(work, 'm0');
  mkdirSync(join(m0, 'argv-capture'), {recursive: true});
  for (const [mode, body] of Object.entries(captures)) writeFileSync(join(m0, 'argv-capture', `capture-signed-${mode}.json`), body);
  for (const dir of ['stderr', 'reports/oracles', 'out/oracles']) mkdirSync(join(work, dir), {recursive: true});
  const script = [
    'set -eu',
    `M0='${m0}' S='${work}' RAW='${work}/reports' ERR='${work}/stderr' OUT='${work}/out'`,
    `scratch() { printf '%s\\n' "$*" >> '${work}/scratch-calls'; }`,
    'publish() { return 0; }',
    fn('quiet'), fn('step'), fn('port_vs_capture'),
    "failed=0 results=''",
    'step "replay scoped" port_vs_capture scoped',
    'step "the next step" true',
    'printf "%s" "$results"',
  ].join('\n');
  const run = spawnSync('sh', ['-c', script], {cwd: REPO, encoding: 'utf8'});
  let calls = '';
  try { calls = readFileSync(join(work, 'scratch-calls'), 'utf8'); } catch {}
  return {...run, calls, work};
}

test('consistent captures: the replay relocates from their recorded root and passes', t => {
  const good = JSON.stringify(capture('/Users/fixture/cua-115'));
  const r = replay(t, {scoped: good, default: good});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^PASS replay scoped/m);
  assert.match(r.stdout, /^PASS the next step/m);
  assert.match(r.calls, new RegExp(`--relocate /Users/fixture/cua-115=${r.work}/m0 `));
});

test('missing, malformed or disagreeing captures fail the replay step only, the next step still runs, nothing is replayed', t => {
  const cases = {
    'a capture missing': {scoped: JSON.stringify(capture('/Users/fixture/cua-115'))},
    'a capture malformed': {scoped: 'not JSON', default: JSON.stringify(capture('/Users/fixture/cua-115'))},
    'roots that disagree': {scoped: JSON.stringify(capture('/Users/fixture/a')), default: JSON.stringify(capture('/Users/fixture/b'))},
  };
  for (const [name, captures] of Object.entries(cases)) {
    const r = replay(t, captures);
    assert.equal(r.status, 0, `${name}: the gate goes on (${r.stderr})`);
    assert.match(r.stdout, /^FAIL replay scoped/m, name);
    assert.match(r.stdout, /^PASS the next step/m, name);
    assert.equal(r.calls, '', `${name}: no replay ran`);
    assert.match(r.stderr, /^recorded-root: captures have no consistent shared scratch root$/m, name);
  }
});
