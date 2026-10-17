// Which native helpers (SkyComputerUseService) belong to one experiment.mjs run (#115 M0). A helper is this run's only
// when its environment names this run's own CLI slot as CODEX_CLI_PATH: node_repl hands the helper its launch
// environment through `open`, and every run writes a slot at a path of its own. Any other helper (the owner's, another
// harness's, one started before or during the run) is recorded as foreign and never signalled. A helper whose
// environment cannot be read while it is alive fails the run: an unreadable owner is not proof of "not ours".
import {execFileSync} from 'node:child_process';

const run = (cmd, args) => execFileSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});

export function helperPids() {
  try { return run('/usr/bin/pgrep', ['-f', 'SkyComputerUseService']).split('\n').filter(Boolean).map(Number); } catch (error) {
    if (error.status === 1) return []; // pgrep: nothing matched
    throw new Error(`cannot list native helpers: ${error.message}`);
  }
}

export function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

// The CODEX_CLI_PATH in `pid`'s environment, null when it sets none or is gone; throws when it cannot be read.
export function cliPathOf(pid) {
  let text;
  try { text = run('/bin/ps', ['eww', '-o', 'command=', '-p', String(pid)]); } catch (error) {
    if (!isAlive(pid)) return null;
    throw error;
  }
  if (!text.trim()) { if (!isAlive(pid)) return null; throw new Error('ps printed nothing for a live process'); }
  return text.match(/\sCODEX_CLI_PATH=(\S*)/)?.[1] ?? null;
}

export function createHelperTracker({slot, list = helperPids, cliPathOf: cliOf = cliPathOf, isAlive: alive = isAlive, kill = pid => process.kill(pid, 'SIGTERM')}) {
  const owned = new Set(), foreign = new Set();
  return {
    // Classifies every helper running now that has not been classified yet.
    observe() {
      for (const pid of list()) {
        if (owned.has(pid) || foreign.has(pid)) continue;
        let cli;
        try { cli = cliOf(pid); } catch (error) { throw new Error(`cannot read the ownership of helper ${pid}: ${error.message}`); }
        if (cli === slot) owned.add(pid);
        else if (alive(pid)) foreign.add(pid);
      }
    },
    owned: () => [...owned],
    foreignSeen: () => [...foreign],
    // Stops this run's helpers that are still running (by pid, SIGTERM); never any other.
    stopLeft() {
      const left = [...owned].filter(pid => alive(pid));
      for (const pid of left) kill(pid);
      return {started: owned.size, quitByThemselves: owned.size - left.length, quitByHarness: left.length};
    },
  };
}
