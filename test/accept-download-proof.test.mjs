import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import * as proofModule from '../scripts/accept/download-proof.mjs';

const pin = {release: 'fixture-darwin-arm64', platform: 'darwin', archive: {url: 'https://persistent.oaistatic.com/fixture.zip', sha256: 'a'.repeat(64), length: 12345}};
function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(), 'accept-download-'));
  t.after(() => rmSync(repo, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  git('init', '-q');
  const commit = (path, text) => {
    mkdirSync(dirname(join(repo, path)), {recursive: true}); writeFileSync(join(repo, path), text);
    git('add', path); git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', '-c', 'commit.gpgsign=false', 'commit', '-qm', path);
    return git('rev-parse', 'HEAD');
  };
  const anchorCommit = commit('src/runtime/install.mjs', 'acquisition v1');
  const testedCommit = commit('unrelated', 'hosted run');
  const evidence = {doc: 'download-proof.json', paths: ['src/runtime/install.mjs', 'src/runtime/checks.mjs', 'src/runtime/manifest.mjs', 'src/runtime/layout.mjs', 'runtime/releases']};
  const proof = {schema: 1, gate: 'sandbox-live', conclusion: 'success', runId: '123456789', anchorCommit, testedCommit,
    install: {outcome: 'PASS', source: 'download', release: pin.release, urlHost: 'persistent.oaistatic.com', sha256: pin.archive.sha256, hashVerified: true, archiveSize: pin.archive.length}};
  const write = value => writeFileSync(join(repo, evidence.doc), JSON.stringify(value));
  const check = () => proofModule.downloadProofCheck({repo, evidence, pin});
  return {repo, git, commit, evidence, proof, write, check};
}

test('hosted proof at or after the latest acquisition commit can be cited without downloading again', t => {
  const f = fixture(t); f.write(f.proof);
  let answer = f.check();
  assert.equal(answer.status, 'PASS', answer.detail);
  assert.equal(answer.evidence, 'cited');
  assert.match(answer.detail, /sandbox-live.*123456789/);
  f.commit('unrelated', 'later documentation');
  answer = f.check();
  assert.equal(answer.status, 'PASS', answer.detail);
});

test('ci-gate auxiliary commits need not be ancestors of HEAD when their acquisition tree matches', t => {
  const f = fixture(t);
  const auxiliary = f.commit('unrelated', 'ci metadata');
  f.git('checkout', '--detach', '-q', f.proof.testedCommit);
  f.write({...f.proof, testedCommit: auxiliary});
  const answer = f.check();
  assert.equal(answer.status, 'PASS', answer.detail);
});

test('missing, malformed, unverified, local-archive or wrong-pin evidence is BLOCKED, not PASS', t => {
  const f = fixture(t);
  assert.equal(f.check().status, 'BLOCKED');
  writeFileSync(join(f.repo, f.evidence.doc), 'not JSON');
  assert.equal(f.check().status, 'BLOCKED');
  for (const patch of [{schema: 2}, {runId: ''}, {gate: 'test'}, {conclusion: 'failure'}, {testedCommit: 'f'.repeat(40)}, {anchorCommit: 'f'.repeat(40)}]) {
    f.write({...f.proof, ...patch}); assert.equal(f.check().status, 'BLOCKED', JSON.stringify(patch));
  }
  for (const patch of [{outcome: 'FAIL'}, {source: 'archive'}, {release: 'other'}, {urlHost: 'other.example'}, {sha256: 'b'.repeat(64)}, {hashVerified: false}, {archiveSize: 12}]) {
    f.write({...f.proof, install: {...f.proof.install, ...patch}});
    assert.equal(f.check().status, 'BLOCKED', JSON.stringify(patch));
  }
});

test('new acquisition commits invalidate the evidence until that exact anchor is tested', t => {
  const f = fixture(t); f.write(f.proof);
  const newer = f.commit('src/runtime/install.mjs', 'acquisition v2');
  assert.equal(f.check().status, 'BLOCKED', 'old anchor cannot cover a later acquisition change');
  f.write({...f.proof, anchorCommit: newer});
  assert.equal(f.check().status, 'BLOCKED', 'a run before the anchor cannot cover it');
  f.write({...f.proof, anchorCommit: newer, testedCommit: newer});
  assert.equal(f.check().status, 'PASS');
  writeFileSync(join(f.repo, 'src/runtime/install.mjs'), 'uncommitted acquisition');
  assert.equal(f.check().status, 'BLOCKED', 'dirty acquisition cannot cite a committed proof');
});

test('a tested commit with different acquisition bytes cannot prove the current anchor', t => {
  const f = fixture(t);
  const moved = f.commit('src/runtime/install.mjs', 'different run-only acquisition');
  f.git('checkout', '--detach', '-q', f.proof.testedCommit);
  f.write({...f.proof, testedCommit: moved});
  assert.equal(f.check().status, 'BLOCKED');
});
