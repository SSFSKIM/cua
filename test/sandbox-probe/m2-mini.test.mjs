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
if [ -n "\${FAIL_SSH:-}" ] && printf '%s' "$cmd" | grep -Eq "$FAIL_SSH"; then exit 1; fi
exit 0
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
  for (const [name, body] of [['ssh', SSH], ['scp', SCP]]) { writeFileSync(join(bin, name), body); chmodSync(join(bin, name), 0o755); }
  const log = join(dir, 'log');
  writeFileSync(log, '');
  const run = spawnSync('sh', ['scripts/sandbox-probe/m2-mini.sh', ...args], {cwd: REPO, encoding: 'utf8',
    env: {PATH: `${bin}:/usr/bin:/bin`, LOG: log, M2_MINI_EVIDENCE: join(dir, 'evidence'), ...fail}});
  return {...run, log: readFileSync(log, 'utf8')};
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
