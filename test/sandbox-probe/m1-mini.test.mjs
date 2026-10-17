// scripts/sandbox-probe/m1-mini.sh with doubles for ssh, scp and the parity harness (no mini, no network): every step
// runs and its evidence is collected even after a failure, and the item exits 1 naming each failed step.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {REPO} from '../fixtures/runtime-fixture.mjs';

// Each double logs its arguments and exits 1 when they match its FAIL_* pattern (grep -E), else 0.
const SSH = `#!/bin/sh
cmd=$4; echo "ssh $cmd" >> "$LOG"
if [ -n "\${FAIL_SSH:-}" ] && printf '%s' "$cmd" | grep -Eq "$FAIL_SSH"; then exit 1; fi
exit 0
`;
const SCP = `#!/bin/sh
eval dest=\\\${$#}; echo "scp $*" >> "$LOG"
if [ -n "\${FAIL_SCP:-}" ] && printf '%s' "$*" | grep -Eq "$FAIL_SCP"; then exit 1; fi
case "$dest" in *.ndjson) : > "$dest" ;; esac
exit 0
`;
// The parity harness double: run writes a complete run (or none, when it fails), diff prints an empty comparison;
// every other script runs on the real node (the judge, the denial reduction).
const NODE = `#!/bin/sh
if [ "$1" = scripts/repl-parity.mjs ]; then
  echo "node $*" >> "$LOG"
  if [ -n "\${FAIL_PARITY:-}" ] && printf '%s' "$*" | grep -Eq "$FAIL_PARITY"; then exit 1; fi
  if [ "$2" = run ]; then
    out=; prev=; for a in "$@"; do [ "$prev" = --out ] && out=$a; prev=$a; done
    mkdir -p "$out"; echo '{"complete":true}' > "$out/meta.json"; : > "$out/results.jsonl"
  fi
  if [ "$2" = diff ]; then echo '{"ok":true,"differences":[]}'; fi
  exit 0
fi
exec "$REAL_NODE" "$@"
`;

// The pause watcher double: it beats (the heartbeat the item waits for) and stays until the item ends it.
const WATCH = `#!/bin/sh
while [ $# -gt 0 ]; do [ "$1" = --file ] && f=$2; shift; done
printf '{"generation":0}' > "$f.alive"; echo "watch $f" >> "$LOG"
exec sleep 600
`;

function wrapper(t, args, fail = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cua-m1-mini-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const bin = join(dir, 'bin');
  spawnSync('mkdir', ['-p', bin, join(dir, 'evidence'), join(dir, 'scratch')]);
  for (const [name, body] of [['ssh', SSH], ['scp', SCP], ['node', NODE], ['pausewatch', WATCH]]) { writeFileSync(join(bin, name), body); chmodSync(join(bin, name), 0o755); }
  const log = join(dir, 'log');
  writeFileSync(log, '');
  const run = spawnSync('sh', ['scripts/sandbox-probe/m1-mini.sh', ...args], {cwd: REPO, encoding: 'utf8',
    env: {PATH: `${bin}:/usr/bin:/bin`, LOG: log, REAL_NODE: process.execPath, M1_MINI_EVIDENCE: join(dir, 'evidence'), M1_MINI_SCRATCH: join(dir, 'scratch'), M1_MINI_PAUSE_WATCH: join(bin, 'pausewatch'), ...fail}});
  return {...run, log: readFileSync(log, 'utf8'), dir};
}
const failures = stderr => stderr.split('\n').filter(line => line.includes(': FAILED: '));

test('oracles: every step passing exits 0', t => {
  const run = wrapper(t, ['oracles', 'abc123']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stderr, /every step passed/);
  assert.equal((run.log.match(/oracle\.mjs fingerprint/g) ?? []).length, 4);
  assert.equal((run.log.match(/compare-fingerprints .*--expect (golden-kernel\/cua-kernel|signed\/cua-worker)/g) ?? []).length, 4, 'every comparison is judged');
});

test('oracles: failing pins, comparisons and the port each count, and the evidence is still collected; exit 1', t => {
  const run = wrapper(t, ['oracles', 'abc123'], {FAIL_SSH: 'fingerprint .*--role kernel|compare-fingerprints .*signed|port-vs-capture'});
  assert.equal(run.status, 1);
  assert.equal(failures(run.stderr).length, 6, run.stderr);
  assert.match(run.stderr, /6 step\(s\) failed/);
  assert.match(run.log, /scp -q mini:~\/cua-115\/m1-oracles\/\*\.json/, 'evidence collected after the failures');
  assert.match(run.log, /fingerprint .*--mode default --launcher cua --role worker/, 'later steps still ran');
});

test('own-sandbox: a failing check still collects its report and exits 1', t => {
  const run = wrapper(t, ['own-sandbox', 'abc123'], {FAIL_SSH: 'own-sandbox\\.mjs'});
  assert.equal(run.status, 1);
  assert.deepEqual(failures(run.stderr).map(line => line.replace(/.*FAILED: /, '')), ['own-sandbox check (exit 1)']);
  assert.match(run.log, /scp -q mini:~\/cua-115\/m1-own-sandbox\.json/);
});

test('cfprefs: complete runs judged equal exit 0; a failed run, a failed prepare or an unequal pair exits 1 after everything ran', t => {
  const ok = wrapper(t, ['cfprefs', 'aaa', 'bbb', 'harness']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal((ok.log.match(/run --device mini --host cua --suite \w+ --out \S+ --pause-file \S+cua115-cfprefs-pause\.json/g) ?? []).length, 4, 'every GUI-bound suite run honours the pause file');
  assert.match(ok.log, /^watch \S+cua115-cfprefs-pause\.json$/m, 'the item ran its watcher');
  assert.deepEqual(readdirSync(join(ok.dir, 'scratch')).filter(n => n.startsWith('cua115-cfprefs-pause')), [], 'and removed the pause files once the group was done');
  const broken = wrapper(t, ['cfprefs', 'aaa', 'bbb', 'harness'], {FAIL_PARITY: 'run .*--suite services .*after-services'});
  assert.equal(broken.status, 1);
  assert.deepEqual(failures(broken.stderr).map(line => line.replace(/.*FAILED: /, '')), ['after services run (exit 1)', 'before vs after, services: a side has no run']);
  assert.equal((broken.log.match(/cleanup-prepared/g) ?? []).length, 2, 'both sides cleaned up');
  const unprepared = wrapper(t, ['cfprefs', 'aaa', 'bbb', 'harness'], {FAIL_PARITY: 'prepare .*--commit bbb'});
  assert.equal(unprepared.status, 1);
  assert.ok(failures(unprepared.stderr).some(line => /after: prepare at bbb/.test(line)), unprepared.stderr);
  const lost = wrapper(t, ['cfprefs', 'aaa', 'bbb', 'harness'], {FAIL_SCP: 'denials-before'});
  assert.equal(lost.status, 1);
  assert.ok(failures(lost.stderr).some(line => /denial log is missing/.test(line)), lost.stderr);
});
