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
import {basename, dirname, isAbsolute} from 'node:path';
import {defaultHome} from '../runtime/layout.mjs';
import {executableOutsideVendorTree} from '../runtime/vendor-tree.mjs';

// The project root from `git rev-parse --path-format=absolute --git-common-dir --show-toplevel`'s two lines.
export function rootFromGit(commonDir, topLevel) {
  return basename(commonDir) === '.git' ? dirname(commonDir) : topLevel;
}

// The project for `cwd` from that command's output. A git older than 2.31 echoes `--path-format=absolute` back as a line
// of its own, so only two absolute paths are an answer; anything else leaves the directory itself.
export function rootFromRevParse(stdout, cwd) {
  const lines = stdout.trim().split('\n');
  const [commonDir, topLevel] = lines;
  return lines.length === 2 && isAbsolute(commonDir) && isAbsolute(topLevel) ? rootFromGit(commonDir, topLevel) : cwd;
}

// On Linux, git is looked up on `env`'s PATH with every entry that is, or leads, into the vendor's tree of the cua home
// `home` skipped (src/runtime/vendor-tree.mjs; #171 M6a, the pre-flight's §3.5: `cua serve` runs this first, and a PATH
// through the vendor's bin must not make it run anything there), and run by the path that lookup checked. No git found
// there leaves the directory itself. macOS runs `git` from PATH, as before.
export function projectRoot(cwd = process.cwd(), {env = process.env, platform = process.platform, home = defaultHome(env, {platform})} = {}) {
  const git = platform === 'linux' ? executableOutsideVendorTree('git', env.PATH, home) : 'git';
  if (!git) return cwd;
  let stdout;
  try {
    stdout = execFileSync(git, ['rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel'],
      {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000});
  } catch { return cwd; }
  return rootFromRevParse(stdout, cwd);
}
