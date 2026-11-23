// What a `strace -f` of a Linux fixture shows (#171 M6a, T6; the M6a pre-flight §5.2): the venue pilot's fourth
// question, whether the trace follows the sandbox helper's children, and later E1's traced cells, which need the kernel
// and the worker in the trace before its absence of `runtimes/` paths means anything.
//
// The trace is the one TRACE_ARGS writes: every process in one file, each line led by its pid, pids translated out of
// bubblewrap's PID namespace, strings long enough to hold a path. The reader keeps, per process, its parent (from the
// fork-family calls' return values), the programs it executed (successful execve and execveat only), and how many calls
// it made after its last exec. It never keeps a line: the summary carries pids, counts and booleans.
//
//   node scripts/accept/linux-trace.mjs <trace> --helper <pinned helper path> --home <CUA_HOME>   JSON summary and verdict

import {createReadStream} from 'node:fs';
import {posix} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

/** strace's options for a fixture's traced run, before `-o <file> -- <command>`. */
// -y decodes each descriptor, AT_FDCWD included, to its path, so a relative path resolves against its base; fchdir,
// which takes a descriptor, is traced beside the file calls so the working directory is followed.
export const TRACE_ARGS = ['-f', '-qq', '-y', '-s', '4096', '--pidns-translation', '-e', 'trace=%file,%process,fchdir'];

const LINE = /^(\d+)\s+(.*)$/;
const FORKS = /^(?:clone3?|fork|vfork)\(/;
const EXEC = /^execve(?:at)?\(/;
const RESUMED = /^<\.\.\. (\w+) resumed>/;
const RETURNED = /\)\s+=\s+(-?\d+)(?:\s|$)/;
// --pidns-translation's note on a pid returned inside another PID namespace: `= 2 /* 1648650 in strace's PID NS */`.
const TRANSLATED = /\)\s+=\s+-?\d+\s+\/\* (\d+) in strace's PID NS \*\//;
const SERVE = /\/bin\/cua\.mjs", "serve"/;
const WORKER = /src\/repl-host\/trusted-worker\.mjs"/;
const KERNEL = /src\/repl-host\/kernel\.mjs"/;

// The program an exec line names: its first quoted string (execveat's directory comes first, as a number).
const program = call => /"((?:[^"\\]|\\.)*)"/.exec(call)?.[1] ?? null;

// -y's decoding: a descriptor (or AT_FDCWD) followed by the path it stands for, `3</usr/lib>`.
const STRING = '"((?:[^"\\\\]|\\\\.)*)"';
const DIRFD_PATH = new RegExp(`(AT_FDCWD|\\d+)(?:<([^>]*)>)?, ${STRING}`, 'g');
const OPERAND_FD = /(?:^|[(\s])(\d+)<([^>]*)>(?!, ")/g;
const FIRST_STRING = new RegExp(`^${STRING}`);
const RETURN_FD = /\)\s+=\s+\d+<([^>]*)>/;
const CWD_DECODED = /AT_FDCWD<([^>]*)>/;

/**
 * The paths a call names, each resolved: `{paths, unresolved}`. Its operands are its first argument when that is a
 * string (open, stat, access, chdir, execve: never argv, never an output buffer), each string after a descriptor or
 * AT_FDCWD (resolved against the path -y decoded for it), each decoded descriptor that is itself an operand (fchdir,
 * an AT_EMPTY_PATH stat), and the path of the descriptor it returned. A relative path whose base is unknown is
 * unresolved.
 */
function callPaths(call, cwd) {
  const close = call.lastIndexOf(') = ');
  const args = (close < 0 ? call : call.slice(0, close)).slice(call.indexOf('(') + 1);
  const paths = [];
  let unresolved = 0;
  const take = (path, base) => {
    if (path.startsWith('/')) paths.push(posix.resolve(path));
    else if (typeof base === 'string' && base.startsWith('/')) paths.push(posix.resolve(base, path));
    else unresolved += 1;
  };
  // -y decodes a descriptor that is not a file to its kind (`pipe:[…]`, `socket:[…]`, `anon_inode:[…]`): no path.
  const isPath = decoded => decoded.startsWith('/');
  const first = FIRST_STRING.exec(args);
  if (first) take(first[1], cwd);
  for (const [, fd, decoded, path] of args.matchAll(DIRFD_PATH)) {
    if (decoded === undefined) take(path, fd === 'AT_FDCWD' ? cwd : undefined);
    else if (isPath(decoded)) take(path, decoded);
  }
  for (const [, , decoded] of args.matchAll(OPERAND_FD)) if (isPath(decoded)) take(decoded, undefined);
  const returned = close < 0 ? null : RETURN_FD.exec(call.slice(close));
  if (returned && isPath(returned[1])) take(returned[1], undefined);
  return {paths, unresolved};
}

/**
 * A streaming reader: `line(text)` for each line of the trace, then `summary()`. `home` is the CUA_HOME (or a list of
 * its spellings) whose `runtimes/` is counted; `cwd` is the first process's working directory, inherited by its
 * children at each fork.
 */
export function traceReader({helper, home, cwd = null}) {
  const procs = new Map();
  const pending = new Map();
  const roots = [home].flat().map(h => `${h.replace(/\/$/, '')}/runtimes`);
  const inRuntimes = path => roots.some(root => path === root || path.startsWith(`${root}/`));
  const proc = pid => {
    if (!procs.has(pid)) procs.set(pid, {parent: null, execs: [], argv: [], calls: 0, runtimesCalls: 0, unresolved: 0, cwd: {path: procs.size === 0 ? cwd : null}});
    return procs.get(pid);
  };
  const finish = (pid, name, call) => {
    const p = proc(pid);
    const returned = TRANSLATED.exec(call) ?? RETURNED.exec(call);
    const value = returned ? Number(returned[1]) : null;
    if (FORKS.test(`${name}(`)) {
      if (value > 0) {
        const child = proc(value);
        child.parent = pid;
        // CLONE_FS shares the working directory (threads); a fork copies it.
        if (child.cwd.path === null) child.cwd = /CLONE_FS/.test(call) ? p.cwd : {path: p.cwd.path};
      }
      return;
    }
    const decodedCwd = CWD_DECODED.exec(call)?.[1];
    if (decodedCwd) p.cwd.path = decodedCwd;
    const {paths, unresolved} = callPaths(call, p.cwd.path);
    if (paths.some(inRuntimes)) p.runtimesCalls += 1;
    else if (unresolved) p.unresolved += 1;
    if (value === 0 && name === 'chdir') p.cwd.path = paths[0] ?? null;
    if (value === 0 && name === 'fchdir') p.cwd.path = paths[0] ?? null;
    if (EXEC.test(`${name}(`)) {
      if (value === 0) { p.execs.push(program(call)); p.argv.push(call); p.calls = 0; }
      return;
    }
    p.calls += 1;
  };
  return {
    line(text) {
      const m = LINE.exec(text);
      if (!m) return;
      const pid = Number(m[1]);
      let call = m[2];
      proc(pid);
      if (call.startsWith('+++') || call.startsWith('---')) return;
      const resumed = RESUMED.exec(call);
      if (resumed) {
        const start = pending.get(pid);
        pending.delete(pid);
        if (!start) return;
        return finish(pid, resumed[1], `${start}${call.slice(resumed[0].length)}`);
      }
      if (call.endsWith('<unfinished ...>')) { pending.set(pid, call.slice(0, -'<unfinished ...>'.length)); return; }
      const name = /^(\w+)\(/.exec(call)?.[1];
      if (name) finish(pid, name, call);
    },
    summary() {
      const up = pid => { const chain = []; for (let p = procs.get(pid)?.parent; p !== null && p !== undefined && !chain.includes(p); p = procs.get(p)?.parent) chain.push(p); return chain; };
      const pidsWhere = test => [...procs].filter(([, p]) => p.argv.some(test)).map(([pid]) => pid);
      // Node itself running `script`, not the helper or bubblewrap that carry it after their `--`.
      const nodeRunning = script => [...procs].filter(([, p]) => p.execs.length && /(^|\/)node[^/]*$/.test(p.execs.at(-1)) && script.test(p.argv.at(-1)));
      const helpers = [...procs].filter(([, p]) => p.execs.includes(helper)).map(([pid]) => pid);
      const serve = pidsWhere(argv => SERVE.test(argv))[0] ?? null;
      const inServe = pid => serve !== null && (pid === serve || up(pid).includes(serve));
      const kernels = nodeRunning(KERNEL).map(([pid, p]) => ({
        pid,
        underHelper: p.execs.slice(0, -1).includes(helper) || up(pid).some(a => helpers.includes(a)),
        underServe: inServe(pid),
        callsAfterExec: p.calls,
      }));
      const served = [...procs].filter(([pid]) => inServe(pid)).map(([, p]) => p);
      const unresolved = served.reduce((n, p) => n + p.unresolved, 0);
      return {
        processes: procs.size,
        serve,
        workers: nodeRunning(WORKER).map(([pid]) => ({pid, underServe: inServe(pid)})),
        helpers,
        bwrap: [...procs].filter(([, p]) => p.execs.some(e => /(^|\/)bwrap$/.test(e))).map(([pid]) => pid),
        kernels,
        // Measured: the serve's tree's calls that name a path under runtimes/, and the calls whose relative path could
        // not be resolved; with any of those the count is incomplete, never a clean zero.
        runtimes: {calls: served.reduce((n, p) => n + p.runtimesCalls, 0), unresolved, complete: unresolved === 0},
      };
    },
  };
}

/** The summary of a whole trace's `text`. */
export function summarizeTrace(text, options) {
  const reader = traceReader(options);
  for (const line of text.split('\n')) reader.line(line);
  return reader.summary();
}

/** The summary of the trace in `file`, read line by line. */
export async function summarizeTraceFile(file, options) {
  const reader = traceReader(options);
  for await (const line of createInterface({input: createReadStream(file), crlfDelay: Infinity})) reader.line(line);
  return reader.summary();
}

/** Whether the trace followed the helper's children into the kernel: `{pass, problems}`. */
export function traceVerdict(summary) {
  const problems = [];
  if (summary.serve === null) problems.push('the trace holds no cua serve exec');
  if (!summary.workers.some(w => w.underServe)) problems.push('the trace holds no trusted worker under the serve');
  if (!summary.kernels.length) problems.push('the trace holds no kernel exec: strace did not follow the helper\'s children');
  else {
    const served = summary.kernels.filter(k => k.underServe);
    const helped = served.filter(k => k.underHelper);
    if (!served.length) problems.push('the trace holds no kernel under the serve');
    else if (!helped.length) problems.push('no kernel ran under the pinned helper in the trace');
    else if (!helped.some(k => k.callsAfterExec > 0)) problems.push(`the kernel (${helped.map(k => k.pid).join(', ')}) made no call after its exec: the trace saw it start and nothing it did`);
  }
  return {pass: problems.length === 0, problems};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file] = process.argv.slice(2);
  const option = name => process.argv[process.argv.indexOf(name) + 1];
  if (!file || !process.argv.includes('--helper') || !process.argv.includes('--home')) {
    process.stderr.write('usage: linux-trace.mjs <trace> --helper <pinned helper path> --home <CUA_HOME>\n');
    process.exit(2);
  }
  const summary = await summarizeTraceFile(file, {helper: option('--helper'), home: option('--home')});
  const verdict = traceVerdict(summary);
  process.stdout.write(`${JSON.stringify({summary, verdict}, null, 1)}\n`);
  process.exit(verdict.pass ? 0 : 1);
}
