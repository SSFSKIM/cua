// Acceptance item 2 cites a recorded hosted sandbox-live download, never starts another download on the mini.
// The evidence's anchor must be the latest commit touching the acquisition paths in this checkout. ci-gate can test
// an auxiliary commit not ancestral to HEAD: require that it contains the anchor and has the same acquisition tree.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

export function downloadProofCheck({repo, evidence, pin}) {
  const name = 'download mode (official pinned URL)';
  const blocked = reason => ({name, status: 'BLOCKED', evidence: 'needs rerun',
    detail: `${reason}; run hosted macOS sandbox-live and record its verified download in ${evidence.doc} (no mini download)`});
  let proof;
  try { proof = JSON.parse(readFileSync(join(repo, evidence.doc), 'utf8')); }
  catch { return blocked('hosted download evidence is missing or unreadable'); }
  const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
  if (proof?.schema !== 1 || proof.gate !== 'sandbox-live' || proof.conclusion !== 'success'
    || typeof proof.runId !== 'string' || !/^[1-9][0-9]*$/.test(proof.runId) || !sha(proof.anchorCommit) || !sha(proof.testedCommit))
    return blocked('hosted download evidence does not name a successful sandbox-live run and full anchor/tested commits');
  const install = proof.install;
  if (pin.platform !== 'darwin' || install?.outcome !== 'PASS' || install.source !== 'download' || install.release !== pin.release
    || install.urlHost !== new URL(pin.archive.url).host || install.sha256 !== pin.archive.sha256
    || install.hashVerified !== true || install.archiveSize !== pin.archive.length)
    return blocked('hosted download evidence does not prove this macOS pin was downloaded and hash/length verified');
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  try {
    if (git('status', '--porcelain', '--untracked-files=all', '--', ...evidence.paths))
      return blocked('acquisition paths have uncommitted changes');
    const latest = git('log', '-1', '--format=%H', 'HEAD', '--', ...evidence.paths);
    if (latest !== proof.anchorCommit) return blocked('acquisition code changed since the recorded download anchor');
    git('merge-base', '--is-ancestor', proof.anchorCommit, proof.testedCommit);
    if (git('diff', '--name-only', proof.anchorCommit, proof.testedCommit, '--', ...evidence.paths))
      return blocked('the hosted commit tested different acquisition bytes');
  } catch { return blocked('the hosted tested commit or its ancestry cannot be verified from this checkout'); }
  return {name, status: 'PASS', evidence: 'cited', detail: `cited, not rerun: ${evidence.doc}; sandbox-live run ${proof.runId} tested ${proof.testedCommit}, with acquisition unchanged from ${proof.anchorCommit}; ${install.urlHost}, SHA-256 verified, ${install.archiveSize} bytes`};
}
