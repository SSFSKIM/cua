// The O0 source, pinned at preparation (#117 M5, T10b′; ruling 1137): the workflow's setup step fetches the design spec
// at one full commit (O0_COMMIT, where the owner's entry was recorded on docs/117-progress, unless the workflow names a
// later commit) and writes it to a run-owned file. The TCC writer (./tcc.mjs) then reads only that file, named by
// CUA_HOSTED_DECISION_FILE with its commit in CUA_HOSTED_DECISION_SHA, and never runs git itself. Refuses off a
// GitHub-hosted runner, before any fetch.
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertGithubHosted} from './runner.mjs';
import {DECISION_SPEC, O0_COMMIT} from './tcc.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const gitIn = cwd => args => execFileSync('/usr/bin/git', ['-C', cwd, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: 120_000});

// deps: {env, platform, commit (a full SHA; O0_COMMIT by default), git(args) -> stdout, write(path, text)}.
// -> {sha, file, env: the two variables the writer reads}.
export function pinDecision({env = process.env, platform = process.platform, commit = O0_COMMIT, git = gitIn(REPO),
  write = (path, text) => { mkdirSync(dirname(path), {recursive: true}); writeFileSync(path, text); }} = {}) {
  assertGithubHosted(env, platform, 'pinning the O0 source');
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`the O0 source is pinned to a full commit, not ${commit}`);
  const present = () => { try { git(['cat-file', '-e', `${commit}^{commit}`]); return true; } catch { return false; } };
  if (!present()) {
    git(['fetch', '-q', '--depth', '1', 'origin', commit]);
    const fetched = git(['rev-parse', 'FETCH_HEAD']).trim();
    if (fetched !== commit) throw new Error(`the O0 source: fetched ${fetched}, not ${commit}`);
    if (!present()) throw new Error(`the O0 source: ${commit} is not in this checkout after the fetch`);
  }
  const file = join(env.RUNNER_TEMP, 'hosted-sittings-decision', `design-${commit}.md`);
  write(file, git(['show', `${commit}:${DECISION_SPEC}`]));
  return {sha: commit, file, env: {CUA_HOSTED_DECISION_FILE: file, CUA_HOSTED_DECISION_SHA: commit}};
}
