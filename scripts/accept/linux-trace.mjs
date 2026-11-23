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

const RETURN_FD = /\)\s+=\s+\d+<([^>]*)>/;
const CWD_DECODED = /AT_FDCWD<([^>]*)>/;

// Where each traced call (`-e trace=%file,%process,fchdir`) keeps its pathnames, by argument position: a bare number is
// a path against the working directory, `[d, p]` a path `p` against the descriptor `d`, `{fd: d}` a descriptor that is
// itself the operand. A symlink's target (symlink's 0, symlinkat's 0) is its content, not a path it touches. A call
// listed nowhere here leaves the count incomplete.
const OPERANDS = {
  access: [0], acct: [0], chdir: [0], chmod: [0], chown: [0], chown32: [0], chroot: [0], creat: [0], execve: [0],
  getxattr: [0], lgetxattr: [0], lchown: [0], lchown32: [0], listxattr: [0], llistxattr: [0], removexattr: [0],
  lremovexattr: [0], setxattr: [0], lsetxattr: [0], stat: [0], stat64: [0], lstat: [0], lstat64: [0], oldstat: [0],
  oldlstat: [0], mkdir: [0], mknod: [0], open: [0], readlink: [0], rmdir: [0], statfs: [0], statfs64: [0], swapon: [0],
  swapoff: [0], truncate: [0], truncate64: [0], unlink: [0], uselib: [0], utime: [0], utimes: [0], umount: [0],
  umount2: [0], inotify_add_watch: [1], quotactl: [1],
  rename: [0, 1], link: [0, 1], pivot_root: [0, 1], mount: [0, 1], symlink: [1],
  openat: [[0, 1]], openat2: [[0, 1]], mkdirat: [[0, 1]], mknodat: [[0, 1]], fchownat: [[0, 1]], futimesat: [[0, 1]],
  newfstatat: [[0, 1]], fstatat64: [[0, 1]], unlinkat: [[0, 1]], faccessat: [[0, 1]], faccessat2: [[0, 1]],
  fchmodat: [[0, 1]], fchmodat2: [[0, 1]], readlinkat: [[0, 1]], utimensat: [[0, 1]], statx: [[0, 1]],
  name_to_handle_at: [[0, 1]], open_tree: [[0, 1]], execveat: [[0, 1]], fspick: [[0, 1]],
  renameat: [[0, 1], [2, 3]], renameat2: [[0, 1], [2, 3]], linkat: [[0, 1], [2, 3]], move_mount: [[0, 1], [2, 3]],
  symlinkat: [[1, 2]], fanotify_mark: [[3, 4]],
  fchdir: [{fd: 0}],
  // getcwd's only string is its output buffer.
  getcwd: [],
};
// The process calls, which name no path.
const NO_PATHS = new Set(['clone', 'clone3', 'fork', 'vfork', 'exit', 'exit_group', 'wait4', 'waitid', 'kill', 'tkill',
  'tgkill', 'rt_sigqueueinfo', 'rt_tgsigqueueinfo', 'pidfd_open', 'pidfd_send_signal', 'pidfd_getfd', 'unshare', 'setns']);

/** A call's top-level arguments: commas inside strings, brackets, braces and -y's `<…>` decodes do not split. */
export function splitArgs(text) {
  const args = [];
  let depth = 0, start = 0, quoted = false, decoded = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '\\') i++; else if (ch === '"') quoted = false; continue; }
    if (decoded) { if (ch === '>') decoded = false; continue; }
    if (ch === '"') quoted = true;
    else if (ch === '<' && /[0-9D]$/.test(text.slice(start, i))) decoded = true;
    else if ('[{('.includes(ch)) depth++;
    else if (']})'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) { args.push(text.slice(start, i).trim()); start = i + 1; }
  }
  const last = text.slice(start).trim();
  if (last || args.length) args.push(last);
  return args;
}

// A path argument: the string, or null when it is not one strace printed whole (an address, NULL, a truncated "…"...).
const pathArg = arg => (/^"((?:[^"\\]|\\.)*)"$/.exec(arg ?? '')?.[1] ?? null);
// A descriptor argument: `AT_FDCWD`, `3`, `AT_FDCWD</cwd>` or `3</a/b>`; its decoding, when -y gave one. A decoding
// that is not a path (`pipe:[…]`, `socket:[…]`, `anon_inode:[…]`) is kept, and resolves nothing.
const fdArg = arg => { const m = /^(AT_FDCWD|-?\d+)(?:<(.*)>)?$/.exec(arg ?? ''); return m ? {cwd: m[1] === 'AT_FDCWD', decoded: m[2]} : null; };

/**
 * The paths a call names, each resolved: `{paths, unresolved}`, operands in OPERANDS' order and then the path of the
 * descriptor it returned. An absolute path stands alone; a relative one resolves against its descriptor's decoding, or
 * for AT_FDCWD and the non-at forms the working directory. What cannot be resolved or read, and a call whose form is not
 * known, is unresolved.
 */
function callPaths(name, call, cwd) {
  // The return column: the last `)` followed by `=`, however strace padded it.
  const close = [...call.matchAll(/\)\s+= /g)].at(-1)?.index ?? -1;
  const args = splitArgs((close < 0 ? call : call.slice(0, close)).slice(call.indexOf('(') + 1).replace(/\)\s*$/, ''));
  const paths = [];
  let unresolved = 0;
  const take = (path, base) => {
    if (path.startsWith('/')) paths.push(posix.resolve(path));
    else if (typeof base === 'string' && base.startsWith('/')) paths.push(posix.resolve(base, path));
    else unresolved += 1;
  };
  const operands = OPERANDS[name];
  if (!operands) { if (!NO_PATHS.has(name)) unresolved += 1; }
  else {
    for (const operand of operands) {
      if (typeof operand === 'number') {
        const path = pathArg(args[operand]);
        // A NULL operand (mount's source) names nothing.
        if (args[operand] === 'NULL') continue;
        if (path === null) unresolved += 1; else take(path, cwd);
      } else if (Array.isArray(operand)) {
        const fd = fdArg(args[operand[0]]);
        const raw = args[operand[1]];
        const path = pathArg(raw);
        // A NULL or empty path (AT_EMPTY_PATH) names the descriptor itself: its decoded path, or nothing when it is no
        // file; AT_FDCWD's is the working directory.
        if ((raw === 'NULL' || path === '') && fd) {
          const self = fd.cwd ? fd.decoded ?? cwd : fd.decoded;
          if (self === undefined || self === null) unresolved += 1;
          else if (self.startsWith('/')) take(self, undefined);
        } else if (path === null || !fd) unresolved += 1;
        else take(path, fd.decoded ?? (fd.cwd ? cwd : undefined));
      } else {
        const fd = fdArg(args[operand.fd]);
        if (fd?.decoded === undefined) unresolved += 1;
        else if (fd.decoded.startsWith('/')) take(fd.decoded, undefined);
      }
    }
  }
  const returned = close < 0 ? null : RETURN_FD.exec(call.slice(close));
  if (returned && returned[1].startsWith('/')) take(returned[1], undefined);
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
    const {paths, unresolved} = callPaths(name, call, p.cwd.path);
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
