// scripts/sandbox-probe/m2-mini.sh with doubles for ssh and scp (no mini, no network): every step runs and its
// evidence is collected even after a failure, and the item exits 1 naming each failed step.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {REPO} from '../fixtures/runtime-fixture.mjs';

const SSH = `#!/bin/sh
cmd=$4; echo "ssh $cmd" >> "$LOG"
if [ "$cmd" = 'bash -s' ]; then cat > "$LOG.remote"; echo "\${REMOTE_RESULT:-ACCEPT 3 CLEANUP 0 OUT /tmp/cua-115-accept-m2.Ab12Cd}"; exit 0; fi
if [ -n "\${FAIL_SSH:-}" ] && printf '%s' "$cmd" | grep -Eq "$FAIL_SSH"; then exit 1; fi
exit 0
`;
// The parity harness double: run writes a complete run, diff prints the comparison DIFF names (an empty one by default).
const NODE = `#!/bin/sh
if [ "$1" = scripts/repl-parity.mjs ]; then
  echo "node $*" >> "$LOG"
  if [ "$2" = run ]; then out=; prev=; for a in "$@"; do [ "$prev" = --out ] && out=$a; prev=$a; done; mkdir -p "$out"; echo '{"complete":true}' > "$out/meta.json"; fi
  if [ "$2" = diff ]; then d=\${DIFF:-}; [ -n "$d" ] || d='{"ok":true,"differences":[]}'; echo "$d"; fi
  exit 0
fi
exec "$REAL_NODE" "$@"
`;
const WATCH = `#!/bin/sh
while [ $# -gt 0 ]; do [ "$1" = --file ] && f=$2; shift; done
printf '{"generation":0}' > "$f.alive"; echo "watch $f" >> "$LOG"
exec sleep 600
`;
const SCP = `#!/bin/sh
echo "scp $*" >> "$LOG"
exit 0
`;

function wrapper(t, args, fail = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cua-m2-mini-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const bin = join(dir, 'bin');
  spawnSync('mkdir', ['-p', bin, join(dir, 'evidence')]);
  spawnSync('mkdir', ['-p', join(dir, 'scratch')]);
  for (const [name, body] of [['ssh', SSH], ['scp', SCP], ['node', NODE], ['pausewatch', WATCH]]) { writeFileSync(join(bin, name), body); chmodSync(join(bin, name), 0o755); }
  const log = join(dir, 'log');
  writeFileSync(log, '');
  const run = spawnSync('sh', ['scripts/sandbox-probe/m2-mini.sh', ...args], {cwd: REPO, encoding: 'utf8',
    env: {PATH: `${bin}:/usr/bin:/bin`, LOG: log, REAL_NODE: process.execPath, M2_MINI_EVIDENCE: join(dir, 'evidence'), M2_MINI_SCRATCH: join(dir, 'scratch'), M2_MINI_PAUSE_WATCH: join(bin, 'pausewatch'), ...fail}});
  let remote = null;
  try { remote = readFileSync(`${log}.remote`, 'utf8'); } catch { /* no remote script */ }
  return {...run, log: readFileSync(log, 'utf8'), remote, dir};
}

test('env-probe: the checkout, one vendor-host probe per mode against the approved home\'s CLI, then the evidence', t => {
  const run = wrapper(t, ['env-probe', 'abc1234']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.log, /git checkout -q --detach abc1234/);
  for (const mode of ['scoped', 'default', 'disabled'])
    assert.match(run.log, new RegExp(`experiment\\.mjs --env-probe --home ~/cua-115/home --user-home ~/cua-115/userhome .*--host vendor --mode ${mode} --cli ~/cua-115/home/runtimes/26\\.928\\.40906-darwin-arm64/CodexCLI\\.app/Contents/MacOS/codex .*--out ~/cua-115/m2-env-probe/env-${mode}\\.json`));
  assert.match(run.log, /scp -q mini:~\/cua-115\/m2-env-probe\/\*\.json /);
});

test('env-probe: a failing mode is named, the others still run and the evidence is collected; exit 1', t => {
  const run = wrapper(t, ['env-probe', 'abc1234'], {FAIL_SSH: 'mode default'});
  assert.equal(run.status, 1);
  assert.match(run.stderr, /FAILED: env probe, default/);
  assert.match(run.log, /--mode disabled/);
  assert.match(run.log, /^scp /m);
});

test('a revision that is not a commit id is refused before anything reaches the mini', t => {
  const run = wrapper(t, ['env-probe', 'main;rm']);
  assert.equal(run.status, 2);
  assert.equal(run.log, '');
});

test('helper-tmp: one native vendor-host session under the real HOME and a scratch config home, watching the session temp', t => {
  const run = wrapper(t, ['helper-tmp', 'abc1234']);
  assert.match(run.log, /experiment\.mjs --native --watch-session-tmp --home ~\/cua-115\/home --user-home "\$HOME" --config-home ~\/cua-115\/userhome\/\.config .*--host vendor --mode scoped .*--out ~\/cua-115\/m2-helper-tmp\/helper-tmp\.json/);
  assert.match(run.log, /scp -q mini:~\/cua-115\/m2-helper-tmp\/helper-tmp\.json /);
  assert.equal(run.status, 0, 'no evidence came back from the double, so no verdict step ran');
});

test('headless: both own-sandbox hosts on the approved home, doctor, and the compat on the vendor\'s Node, then the evidence', t => {
  const run = wrapper(t, ['headless', 'abc1234']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.log, /own-sandbox\.mjs --home ~\/cua-115\/home --host vendor --out/);
  assert.match(run.log, /own-sandbox\.mjs --home ~\/cua-115\/home --host cua --out/);
  assert.match(run.log, /bin\/cua\.mjs doctor --json/);
  assert.match(run.log, /cua_node\/bin\/node --test test\/sandbox\/codex-compat\.test\.mjs/);
  assert.match(run.log, /process\.execve/);
  assert.match(run.log, /^scp -q mini:~\/cua-115\/m2-headless\/\* /m);
});

test('parity: prepared once, both hosts run with the pause file, the diff judged, cleaned up; an unexpected difference fails', t => {
  const run = wrapper(t, ['parity', 'abc1234', 'Harness']);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.log, /node scripts\/repl-parity\.mjs prepare --device mini --commit abc1234 --profile Harness/);
  for (const host of ['vendor', 'cua']) assert.match(run.log, new RegExp(`run --device mini --host ${host} --suite all --out \\S+/parity/mini-${host} --pause-file \\S+cua115-m2-parity-pause\\.json`));
  assert.match(run.log, /diff \S+mini-vendor \S+mini-cua --expected test\/repl-parity\/expected-differences\.json/);
  assert.match(run.log, /cleanup-prepared --device mini/);
  const differs = wrapper(t, ['parity', 'abc1234', 'Harness'], {DIFF: '{"ok":false,"differences":[{"case":"x"}]}'});
  assert.equal(differs.status, 1);
  assert.match(differs.stderr, /FAILED: vendor host against cua's own host/);
});

test('accept: the remote sitting at the SHA with the mirrored pause file, the report collected; BLOCKED passes, FAIL or a failed cleanup fails', t => {
  const run = wrapper(t, ['accept', 'abc1234'], {CUA_PAUSE_FILE: '/tmp/cua115-pause-mirror.json'});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.remote, /git checkout -q --detach abc1234 /);
  assert.match(run.remote, /CUA_PAUSE_FILE="\/tmp\/cua115-pause-mirror\.json"/);
  assert.match(run.remote, /accept-native\.mjs --live-secrets --live-textedit --report/);
  assert.match(run.remote, /cd "\$HOME\/Developer\/GitHub\/cua-parity" \|\| exit 83\nP=\$\(node scripts\/native-baseline\/prepare\.mjs prepare /, 'prepare runs from the prepared parity clone');
  assert.match(run.remote, /cd "\$HOME\/Developer\/GitHub\/cua-parity" && node scripts\/native-baseline\/prepare\.mjs cleanup "\$P"/, 'and so does cleanup');
  assert.doesNotMatch(run.remote, /cua-115\/repo/, 'never the scratch tree');
  assert.doesNotMatch(run.remote, /@SHA@|@PAUSE@/);
  assert.match(run.log, /scp -q mini:\/tmp\/cua-115-accept-m2\.Ab12Cd\/acceptance\.json /);
  assert.equal(wrapper(t, ['accept', 'abc1234'], {REMOTE_RESULT: 'ACCEPT 1 CLEANUP 0 OUT /tmp/cua-115-accept-m2.Ab12Cd'}).status, 1);
  assert.equal(wrapper(t, ['accept', 'abc1234'], {REMOTE_RESULT: 'ACCEPT 0 CLEANUP 2 OUT /tmp/cua-115-accept-m2.Ab12Cd'}).status, 1);
  assert.equal(wrapper(t, ['accept', 'abc1234'], {REMOTE_RESULT: 'nothing'}).status, 1);
  assert.equal(wrapper(t, ['accept', 'abc1234'], {CUA_PAUSE_FILE: '/tmp/a b; rm'}).status, 2, 'a pause path that is not plain is refused');
});
