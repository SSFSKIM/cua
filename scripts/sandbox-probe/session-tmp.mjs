// #115 M2's helper check (docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, M2 "Decisions here"): the per-session
// TMPDIR reaches the native helper through node_repl's environment and `open`, and a helper can outlive the session
// that started it. If the helper writes under that TMPDIR, the vendor host's session temp moves to $CUA_HOME/tmp/<id>.
// experiment.mjs --watch-session-tmp observes it after each native call: the entries under the session temp other than
// node_repl's own script directories (a `.tmp*` directory holding kernel.js or trusted-worker.js), and the paths under
// it this run's own helper holds open (lsof). Names and paths only, never contents.
import {execFileSync} from 'node:child_process';
import {existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

const SCRIPTS = ['kernel.js', 'trusted-worker.js'];

// The relative paths under `dir` (sorted, at most `depth` levels), or null when it no longer exists.
export function sessionTmpEntries(dir, {depth = 6} = {}) {
  let top;
  try { top = readdirSync(dir, {withFileTypes: true}); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const out = [];
  const walk = (relative, level) => {
    for (const entry of readdirSync(join(dir, relative), {withFileTypes: true})) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      out.push(path);
      if (entry.isDirectory() && level < depth) walk(path, level + 1);
    }
  };
  for (const entry of top) {
    const isScripts = entry.isDirectory() && entry.name.startsWith('.tmp') && SCRIPTS.some(name => existsSync(join(dir, entry.name, name)));
    if (isScripts) continue;
    out.push(entry.name);
    if (entry.isDirectory()) walk(entry.name, 1);
  }
  return out.sort();
}

// The paths `pid` holds open at or under `root`; none once it is gone (lsof exits 1).
export function openUnder(pid, root, {exec = (cmd, args) => execFileSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']})} = {}) {
  let text;
  try { text = exec('/usr/sbin/lsof', ['-nP', '-p', String(pid), '-Fn']); } catch (error) { if (error.status === 1) return []; throw error; }
  return [...new Set(text.split('\n').filter(line => line.startsWith('n')).map(line => line.slice(1)).filter(path => path === root || path.startsWith(`${root}/`)))].sort();
}

// observations: [{label, entries, helperOpen}] -> {helperOpen, entries, writes, observations}. `writes` is null when
// nothing was observed.
export function sessionTmpVerdict(observations) {
  const union = key => [...new Set(observations.flatMap(o => o[key] ?? []))].sort();
  const helperOpen = union('helperOpen'), entries = union('entries');
  return {helperOpen, entries, writes: observations.length ? helperOpen.length > 0 || entries.length > 0 : null, observations: observations.length};
}
