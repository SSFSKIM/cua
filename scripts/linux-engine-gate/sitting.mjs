#!/usr/bin/env node
// A `:0` step's sitting launcher (#171 M5, T4's second round; review finding 3, the design session's ruling 730 (b)).
// gate.mjs prints every :0 step under it, outside run71.sh's guarded sitting: it refuses while hold-sittings exists, runs
// the start check (leftovers.mjs) before anything starts, runs the sitting, and once the sitting has ended, however it
// ended (an unsuccessful end, a SIGKILL, the harness's cleanup deadline), makes the end check and the sitting's
// all-clear, writes them into the step's directory (all-clear.json, all-clear.txt) and exits with the sitting's own
// status.
//
// The all-clear is drawn by who can see it (ruling 730). Anything left that the person can see or feel on :0 fails it,
// and then hold-sittings is written with the reason, so every later :0 launch refuses (run71.sh and this launcher) until
// the controller or the design session clears it and removes the file. Each kind, by the guard that sees it:
//   - a window of the run's left on :0: a read after the sitting, by the harness's title prefix (xdotool, no title read);
//   - a key or a button still held: :0's keymap and pointer mask after the sitting (xprobe keys-down, buttons-down);
//   - a grab: X ends a grab with its client, so one can outlive the sitting only in a process of the run's still alive:
//     wrap71.py's leftovers (no grab is ever taken on :0 to test for one);
//   - the pointer not put back: run71.sh's restore line (pointer.txt);
//   - a request changing a window the harness did not open: the harness's own audit, its end row's failures;
//   - the person's side changed, or the run reached into the person's session: owner-watch.sh (owner-changed) and
//     wrap71.py's flags and decoy connections.
// A record missing, or a read that fails, fails it too: what is not shown is not clear. What the run left only on its own
// side (its end row's `unclean`, the scratch the step left) is listed as unclean, and fails nothing (ruling 730 (a)).
//
//   node scripts/linux-engine-gate/sitting.mjs --dir <step dir> --hold <hold-sittings> -- <command...>

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants } from 'node:os';

import { scratchDirs, startCheck, startRefusalText } from '../linux-engine-diff/leftovers.mjs';
import { endCheckUnclean, stepEndCheck } from './gate.mjs';

const XPROBE = fileURLToPath(new URL('../linux-engine-diff/xprobe/target/release/xprobe', import.meta.url));
/** The harness's window titles all begin so (scenes.mjs `label`): a match, never a title read. */
const HARNESS_TITLE = '^cua171-diff-';

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};
const readText = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

/** :0's reads after a sitting, read only: the keys and buttons held, and how many windows carry the harness's title. */
export function liveReads({ display = ':0', xauthority = join(userInfo().homedir, '.Xauthority') } = {}) {
  const env = { ...process.env, DISPLAY: display, XAUTHORITY: xauthority };
  const list = (args) => JSON.parse(execFileSync(XPROBE, args, { env, encoding: 'utf8', timeout: 10000 }).trim());
  return {
    keysDown: () => list(['keys-down']),
    buttonsDown: () => list(['buttons-down']),
    windowsLeft: () => {
      try {
        return execFileSync('xdotool', ['search', '--name', HARNESS_TITLE], { env, encoding: 'utf8', timeout: 10000 }).split('\n').filter(Boolean).length;
      } catch (error) {
        // xdotool's 1 with nothing on stdout: no window matched
        if (error.status === 1 && !String(error.stdout ?? '').trim()) return 0;
        throw error;
      }
    },
  };
}

/**
 * A sitting's all-clear from its directory's records and :0's reads (`reads`: `keysDown`, `buttonsDown`, `windowsLeft`):
 * `{clear, person, run}`, `person` what the person can see or feel (each fails it), `run` what the run left on its own side.
 */
export function judgeSitting(dir, reads) {
  const person = [];
  const read = (what, f) => {
    try {
      return f();
    } catch (error) {
      person.push(`the ${what} could not be read: ${String(error.message).split('\n')[0]}`);
      return null;
    }
  };
  const windows = read('windows of the run on :0', reads.windowsLeft);
  if (windows) person.push(`${windows} window${windows === 1 ? '' : 's'} of the run's are still on :0`);
  const keys = read('held keys', reads.keysDown);
  if (keys?.length) person.push(`keys still held on :0: ${keys.join(', ')}`);
  const buttons = read('held buttons', reads.buttonsDown);
  if (buttons?.length) person.push(`buttons still held on :0: ${buttons.join(', ')}`);
  const wrap = readJson(join(dir, 'wrap-summary.json'));
  if (!wrap) person.push("wrap71's summary is missing, so the person's session went unguarded as far as the record shows");
  else {
    if (wrap.flags?.length || wrap.decoy_connections?.length) person.push(`wrap71 flagged ${wrap.flags?.length ?? 0} reach${wrap.flags?.length === 1 ? '' : 'es'} into the person's session and ${wrap.decoy_connections?.length ?? 0} decoy connection${wrap.decoy_connections?.length === 1 ? '' : 's'}`);
    if (wrap.leftovers?.length) person.push(`processes of the run still alive after it, which can hold a grab or a window on :0: ${wrap.leftovers.map((p) => `${p.pid} ${p.comm}`).join(', ')}`);
  }
  if (existsSync(join(dir, 'owner-changed'))) person.push("owner-watch saw the person's side change during the sitting");
  const pointer = readText(join(dir, 'pointer.txt')) ?? '';
  const restored = /pointer restored to (\d+) (\d+), reads (\S*) (\S*)/.exec(pointer);
  if (!restored) person.push("the pointer's restore was not recorded");
  else if (restored[3] !== restored[1] || restored[4] !== restored[2]) person.push(`the pointer was not put back: it reads ${restored[3]} ${restored[4]}, not ${restored[1]} ${restored[2]}`);
  const rows = (readText(join(dir, 'run', 'results.jsonl')) ?? '').split('\n').filter(Boolean).flatMap((l) => {
    try {
      return [JSON.parse(l)];
    } catch {
      return [];
    }
  });
  const end = rows.findLast((r) => r.kind === 'end');
  if (!end) person.push("the harness's end row is missing, so its audit of the windows it did not open is unshown");
  else for (const f of end.failed ?? []) if (/^a window the harness did not open was changed: (the harness|the run's record):/.test(f)) person.push(f);
  const run = end?.desktop?.unclean ?? [];
  return { clear: person.length === 0, person, run };
}

/**
 * The sitting: refused (5) while `hold` exists, refused (2) when the start check refuses; else `command` run to its end,
 * then the end check and the all-clear written in `dir`, `hold` written when it is not clear. Answers the command's
 * own status (128 + a signal's number when a signal ended it).
 */
export async function runSitting({ dir, hold, command, reads = liveReads(), leftovers = {}, spawnChild = spawn, out = process.stdout }) {
  if (existsSync(hold)) {
    out.write(`sitting refused: ${hold} exists (${(readText(hold) ?? '').trim().split('\n').at(-1)}): no :0 work until it is cleared and reported\n`);
    return 5;
  }
  const start = startCheck({ ...leftovers });
  if (start.refused.length) {
    out.write(`sitting refused: ${startRefusalText(start.refused)}\n`);
    return 2;
  }
  const before = new Set(scratchDirs(leftovers.roots).map((d) => d.dir));
  const child = spawnChild(command[0], command.slice(1), { stdio: 'inherit' });
  const forward = (signal) => child.kill(signal);
  process.on('SIGTERM', forward);
  process.on('SIGINT', forward);
  const { code, signal } = await new Promise((done) => {
    child.once('error', (error) => done({ code: 127, signal: null, error }));
    child.once('exit', (c, s) => done({ code: c, signal: s }));
  });
  process.off('SIGTERM', forward);
  process.off('SIGINT', forward);
  const exit = code ?? 128 + (constants.signals[signal] ?? 0);
  const endCheck = stepEndCheck(before, leftovers);
  const judged = judgeSitting(dir, reads);
  const own = endCheckUnclean(endCheck);
  const record = { finished: new Date().toISOString(), exit, ...(signal ? { signal } : {}), ...judged, run: [...judged.run, ...own], end_check: endCheck, ...(start.cleared.length ? { cleared: start.cleared } : {}) };
  writeFileSync(join(dir, 'all-clear.json'), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(join(dir, 'all-clear.txt'), [
    `all-clear: ${record.clear ? 'clear' : 'NOT CLEAR (hold-sittings written; no :0 work until it is cleared and reported)'}`,
    ...record.person.map((p) => `- the person's side: ${p}`),
    ...(record.run.length ? record.run.map((r) => `- unclean, the run's own side (not a failure): ${r}`) : ["- the run's own side: clean"]),
    `- the sitting's exit: ${exit}${signal ? ` (${signal})` : ''}`,
    '',
  ].join('\n'));
  if (!record.clear) appendFileSync(hold, `${record.finished} the :0 sitting ${dir} is not all-clear: ${record.person.join('; ')}\n`);
  out.write(`all-clear: ${record.clear ? 'clear' : `NOT CLEAR: ${record.person.join('; ')}`}${record.run.length ? `; unclean (the run's own side): ${record.run.join('; ')}` : ''}\n`);
  return exit;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--');
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 && i < at ? argv[i + 1] : null;
  };
  const dir = flag('--dir');
  const hold = flag('--hold');
  if (at < 0 || !dir || !hold || at === argv.length - 1) {
    process.stderr.write('usage: sitting.mjs --dir <step dir> --hold <hold-sittings> -- <command...>\n');
    process.exit(2);
  }
  process.exit(await runSitting({ dir, hold, command: argv.slice(at + 1) }));
}
