// The project a working directory belongs to, for the secret store's project tier (src/secrets/store.mjs): the main
// worktree root of the git repository around it, so that every worktree of a repository shares the main checkout's
// secrets, else the directory itself. The mod (hooks/mods/secrets.tsx) resolves it the same way, so `/secret KEY` in a
// session and `cua serve` started by that session name the same directory.
//
// The main worktree root is the parent of git's common directory (`.git` of the main checkout, for a linked worktree
// too). Where the common directory is not a `.git` folder (a submodule's lives under the superproject's
// .git/modules/), the repository's own top level stands in. Kept apart from store.mjs, which the trusted worker
// imports and which runs no process.
import {execFileSync} from 'node:child_process';
import {basename, dirname} from 'node:path';

// The project root from `git rev-parse --path-format=absolute --git-common-dir --show-toplevel`'s two lines.
export function rootFromGit(commonDir, topLevel) {
  return basename(commonDir) === '.git' ? dirname(commonDir) : topLevel;
}

export function projectRoot(cwd = process.cwd()) {
  let lines;
  try {
    lines = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel'],
      {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000}).trim().split('\n');
  } catch { return cwd; }
  const [commonDir, topLevel] = lines;
  return commonDir && topLevel ? rootFromGit(commonDir, topLevel) : cwd;
}
