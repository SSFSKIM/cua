// Which native helpers (SkyComputerUseService) belong to one experiment.mjs run (#115 M0, M2). A helper is this run's
// only when it runs the installed release's own helper executable (read from the process, lsof's txt, never its argv)
// and the TMPDIR in its environment is one of this run's launches' session temps: buildLaunch gives every launch its
// own (<home>/run/<session>/tmp) and node_repl hands it to the helper through `open`. That witness is causal whatever
// CODEX_CLI_PATH names (since #115 M2 every macOS vendor-host session names the same compat executable). Only TMPDIR is
// extracted from a candidate's environment, only compared, never kept or reported. Any other helper (the owner's,
// another harness's, one started before or during the run) is recorded as foreign and never signalled. A helper whose
// ownership cannot be read while it is alive fails the run: an unreadable owner is not proof of "not ours".
import {execFileSync} from 'node:child_process';
import {realpathSync} from 'node:fs';
import {join} from 'node:path';
import {executableOf, hasRunTmpdir} from '../native-baseline/prepare.mjs';

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

// The executable inside the helper app `app` (its Info.plist's CFBundleExecutable), by real path.
export function helperExecutable(app) {
  const name = run('/usr/bin/plutil', ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', join(app, 'Contents', 'Info.plist')]).trim();
  return realpathSync(join(app, 'Contents', 'MacOS', name));
}

// The ownership rule: `executable` (the release's helper) and `sessionTmps()` (the run's session temps so far) -> pid
// -> true | false; throws when a candidate's executable or TMPDIR cannot be read while it lives.
export const ownedBySessionTmp = ({executable, sessionTmps, exec}) => pid => {
  const running = executableOf(pid, exec ? {exec} : {});
  if (running === null || running !== executable) return false;
  const tmps = sessionTmps();
  return hasRunTmpdir(pid, value => tmps.includes(value), exec ? {exec} : {});
};

// Whether the CODEX_CLI_PATH in `pid`'s environment is exactly `expected` (the file the helper runs `app-server` from).
// Only that name is extracted from the environment (ps -E after the process's own command), only compared.
export function helperLauncherIs(pid, expected, {exec = execFileSync} = {}) {
  const failed = () => new Error(`could not read CODEX_CLI_PATH of process ${pid}`);
  let command, withEnvironment;
  try {
    command = String(exec('/bin/ps', ['-ww', '-o', 'command=', '-p', String(pid)], {encoding: 'utf8'})).replace(/\n$/, '');
    withEnvironment = String(exec('/bin/ps', ['-E', '-ww', '-o', 'command=', '-p', String(pid)], {encoding: 'utf8'})).replace(/\n$/, '');
  } catch { throw failed(); }
  if (!command || !withEnvironment.startsWith(command)) throw failed();
  const values = withEnvironment.slice(command.length).split(' ').filter(word => word.startsWith('CODEX_CLI_PATH=')).map(word => word.slice('CODEX_CLI_PATH='.length));
  return typeof expected === 'string' && values.length === 1 && values[0] === expected;
}

// `kill(pid, signal)` and `sleep(ms)` are the process boundary, doubled in tests.
export function createHelperTracker({owns, list = helperPids, isAlive: alive = isAlive, kill = (pid, signal) => process.kill(pid, signal), sleep = ms => new Promise(r => setTimeout(r, ms))}) {
  const owned = new Set(), foreign = new Set();
  return {
    // Classifies every helper running now that has not been classified yet.
    observe() {
      for (const pid of list()) {
        if (owned.has(pid) || foreign.has(pid)) continue;
        let mine;
        try { mine = owns(pid); } catch (error) {
          if (!alive(pid)) continue;
          throw new Error(`cannot read the ownership of helper ${pid}: ${error.message}`);
        }
        if (mine) owned.add(pid);
        else if (alive(pid)) foreign.add(pid);
      }
    },
    owned: () => [...owned],
    foreignSeen: () => [...foreign],
    // Stops this run's helpers that are still running, by pid, and verifies they are gone: SIGTERM, a bounded wait
    // (`waitMs`), then for each one still alive its ownership read again, and SIGKILL only for a pid still proven this
    // run's, and a second bounded wait. Never signals any other pid. -> {started, quitByThemselves, quitByHarness (gone
    // after our signal), stillAlive (alive at the end), uncertain (alive, its ownership no longer proven: not escalated)}.
    async stopLeft({waitMs = 10_000, pollMs = 100} = {}) {
      const left = [...owned].filter(pid => alive(pid));
      const waitGone = async pids => {
        for (const end = Date.now() + waitMs; pids.some(pid => alive(pid)) && Date.now() < end;) await sleep(pollMs);
        return pids.filter(pid => alive(pid));
      };
      for (const pid of left) kill(pid, 'SIGTERM');
      let uncertain = 0;
      const escalate = [];
      for (const pid of await waitGone(left)) {
        let mine = false;
        try { mine = owns(pid) === true; } catch { mine = false; }
        if (mine) escalate.push(pid); else if (alive(pid)) uncertain++;
      }
      for (const pid of escalate) kill(pid, 'SIGKILL');
      await waitGone(escalate);
      const stillAlive = left.filter(pid => alive(pid)).length;
      return {started: owned.size, quitByThemselves: owned.size - left.length, quitByHarness: left.length - stillAlive, stillAlive, uncertain};
    },
  };
}
