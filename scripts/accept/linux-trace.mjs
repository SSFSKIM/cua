// What a `strace -f` of a Linux fixture shows (#171 M6a, T6; the M6a pre-flight §5.2): the venue pilot's fourth
// question, whether the trace follows the sandbox helper's children, and later E1's traced cells, which need the kernel
// and the worker in the trace before its absence of `runtimes/` paths means anything.
//
// The trace is the one TRACE_ARGS writes: every process in one file, each line led by its pid, pids translated out of
// bubblewrap's PID namespace, strings long enough to hold a path. The reader keeps, per process, its parent (from the
// fork-family calls' return values), the programs it executed (successful execve and execveat only), and how many calls
// it made after its last exec, whether it ended (an exit or exit_group call, or strace's `+++ killed by`/`+++ exited`
// line: -qq prints no normal exit), and the paths it opened since its last exec. It never keeps a line: the summary
// carries pids, counts and booleans, each worker's and kernel's executable, the launches of the serve's tree (the
// helper, bubblewrap, the REPL host, an engine), and, for the paths a caller names to watch (E2's module entries), which
// of them each kernel opened.
//
// The count of the serve's tree's calls under runtimes/ is complete only when every path was resolved, no file call was
// left unfinished at the trace's end (its operands are still read: a pending open under runtimes/ counts as a call), and
// every process of the tree ended. Anything less is incomplete, never a clean zero (#171 task 152, fix wave 1).
//
//   node scripts/accept/linux-trace.mjs <trace> --helper <pinned helper path> --home <CUA_HOME>   JSON summary and verdict

import {createReadStream} from 'node:fs';
import {posix} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

/** strace's options for a fixture's traced run, before `-o <file> -- <command>`. */
// -y decodes each descriptor, AT_FDCWD included, to its path, so a relative path resolves against its base; fchdir,
// which takes a descriptor, is traced beside the file calls so the working directory is followed.
// --seccomp-bpf stops the tracee only at the traced calls (#171 M6b, T6): task 168 found a plain `-f`, which stops it at
// every call, slows a desktop's drags past their bar and unsettles an AT-SPI tree. The calls it shows are the same.
export const TRACE_ARGS = ['--seccomp-bpf', '-f', '-qq', '-y', '-s', '4096', '--pidns-translation', '-e', 'trace=%file,%process,fchdir'];

const LINE = /^(\d+)\s+(.*)$/;
const FORKS = /^(?:clone3?|fork|vfork)\(/;
const EXEC = /^execve(?:at)?\(/;
const RESUMED = /^<\.\.\. (\w+) resumed>/;
const RETURNED = /\)\s+=\s+(-?\d+)(?:\s|$)/;
// A call's return column, whatever follows it (a number, -y's decoding, `?`): a line without one was cut short (fix
// wave 2), and is read as no call at all.
const RETURN_COLUMN = /\)\s+=\s+\S/;
// The value a finished call returned, -y's decoding allowed after it; null when it returned none (`?`).
const returnValue = call => { const m = [...call.matchAll(/\)\s+=\s+(-?\d+)/g)].at(-1); return m ? Number(m[1]) : null; };
// --pidns-translation's note on a pid returned inside another PID namespace: `= 2 /* 1648650 in strace's PID NS */`.
const TRANSLATED = /\)\s+=\s+-?\d+\s+\/\* (\d+) in strace's PID NS \*\//;
const SERVE = /\/bin\/cua\.mjs", "serve"/;
const REPL_HOST = /src\/repl-host\/([\w-]+)\.mjs"/;
const WORKER = /src\/repl-host\/trusted-worker\.mjs"/;
const KERNEL = /src\/repl-host\/kernel\.mjs"/;

// The program an exec line names: its first quoted string (execveat's directory comes first, as a number).
const program = call => /"((?:[^"\\]|\\.)*)"/.exec(call)?.[1] ?? null;

const RETURN_FD = /\)\s+=\s+\d+<([^>]*)>/;
// The calls that open a file: one that returned a descriptor opened every path it names.
const OPENS = new Set(['open', 'openat', 'openat2', 'creat']);
// Whether the call's return column is a descriptor (`= 5`, or -y's `= 5</path>`), not an error.
const openedDescriptor = call => /^\d+(?:<|\s|$)/.test(call.slice(([...call.matchAll(/\)\s+= /g)].at(-1)?.index ?? call.length) + 1).replace(/^\s+=\s+/, ''));
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
// A call's arguments and where its return column starts (-1 when it has none): the last `)` followed by `=`, however
// strace padded it.
function callArgs(call) {
  const close = [...call.matchAll(/\)\s+= /g)].at(-1)?.index ?? -1;
  return {close, args: splitArgs((close < 0 ? call : call.slice(0, close)).slice(call.indexOf('(') + 1).replace(/\)\s*$/, ''))};
}

function callPaths(name, call, cwd) {
  const {close, args} = callArgs(call);
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

// The flags that make an open a write: it may create, truncate or change the file.
const WRITE_FLAGS = /O_WRONLY|O_RDWR|O_CREAT|O_TRUNC|O_APPEND|O_TMPFILE/;
// The calls that change what a path names or holds, beside an open for writing.
const WRITES = new Set(['mkdir', 'mkdirat', 'mknod', 'mknodat', 'symlink', 'symlinkat', 'link', 'linkat', 'chmod', 'fchmodat', 'fchmodat2', 'chown', 'chown32',
  'lchown', 'lchown32', 'fchownat', 'utime', 'utimes', 'utimensat', 'futimesat', 'truncate', 'truncate64', 'setxattr', 'lsetxattr', 'removexattr', 'lremovexattr', 'creat',
  'mount', 'umount', 'umount2', 'pivot_root', 'move_mount', 'open_tree', 'swapon', 'swapoff', 'acct', 'chroot', 'quotactl', 'name_to_handle_at', 'fanotify_mark', 'inotify_add_watch']);

/**
 * What a traced call did to the paths it names, by its name and its flags (#171 M6b, T6: the calls under runtimes/ an
 * install or a doctor run may make): `exec`; `lstat` (a stat that follows no link: lstat, or the at-forms and statx with
 * AT_SYMLINK_NOFOLLOW); `fstat` (a stat of an open descriptor, an at-form with an empty path and AT_EMPTY_PATH); `stat`
 * (one that follows); `opendir` (a read-only open of a directory); `open` (any other
 * read-only open); `write` (an open that may create, truncate or change, or a call that changes what a path names or
 * holds); `unlink`; `rename`; else the call's own name (access, readlink, chdir...).
 */
export function callKind(name, call) {
  const {args} = callArgs(call);
  if (EXEC.test(`${name}(`)) return 'exec';
  if (['lstat', 'lstat64', 'oldlstat'].includes(name)) return 'lstat';
  if (['stat', 'stat64', 'oldstat'].includes(name)) return 'stat';
  // The at-forms with an empty path and AT_EMPTY_PATH stat the open descriptor itself (Node's fstat): no path is looked up.
  if (['newfstatat', 'fstatat64', 'statx'].includes(name) && args[1] === '""' && /AT_EMPTY_PATH/.test(args[name === 'statx' ? 2 : 3] ?? '')) return 'fstat';
  if (['newfstatat', 'fstatat64'].includes(name)) return /AT_SYMLINK_NOFOLLOW/.test(args[3] ?? '') ? 'lstat' : 'stat';
  if (name === 'statx') return /AT_SYMLINK_NOFOLLOW/.test(args[2] ?? '') ? 'lstat' : 'stat';
  if (OPENS.has(name)) {
    const flags = name === 'creat' ? 'O_CREAT' : name === 'open' ? args[1] ?? '' : args[2] ?? '';
    return WRITE_FLAGS.test(flags) ? 'write' : /O_DIRECTORY/.test(flags) ? 'opendir' : 'open';
  }
  if (['unlink', 'unlinkat', 'rmdir'].includes(name)) return 'unlink';
  if (/^rename/.test(name)) return 'rename';
  if (WRITES.has(name)) return 'write';
  return name;
}

// The executable an exec call ran, resolved: execve's path, execveat's path against its descriptor or, with an empty
// path and AT_EMPTY_PATH, the descriptor itself; a relative path against `cwd`. Null when none can be read.
function execProgram(name, call, cwd) {
  const {paths, unresolved} = callPaths(name, call, cwd);
  return unresolved ? null : paths[0] ?? null;
}

// An exec call's argument vector, each string as strace printed it (execve's second argument, execveat's third), or
// null when strace did not print it whole.
export function execArgv(call) {
  const {args} = callArgs(call);
  const list = /^execveat\(/.test(call) ? args[2] : args[1];
  if (!/^\[.*\]$/.test(list ?? '')) return null;
  const items = splitArgs(list.slice(1, -1));
  const strings = items.map(pathArg);
  return strings.some(item => item === null) ? null : strings.map(item => item.replace(/\\(["\\])/g, '$1'));
}

/**
 * A streaming reader: `line(text)` for each line of the trace, then `summary()`. `home` is the CUA_HOME (or a list of
 * its spellings) whose `runtimes/` is counted; `cwd` is the first process's working directory, inherited by its
 * children at each fork. `watch`, absolute paths: each kernel's summary then names those it opened (an open-family call
 * that returned a descriptor, by the kernel or by a thread or child of it that never exec'd), in `watch`'s order.
 */
export function traceReader({helper, home, cwd = null, watch = null}) {
  const watched = watch ? new Set(watch) : null;
  const procs = new Map();
  // Every nonblank line is accounted for (#171 M6b, T6 fix wave 1): a line that is no `<pid> <call>`, a call whose form
  // is not read, or a resumption with no start is counted, and the whole trace is then not complete.
  const unread = {lines: 0, orphans: 0};
  const pending = new Map();
  const roots = [home].flat().map(h => `${h.replace(/\/$/, '')}/runtimes`);
  const inRuntimes = path => roots.some(root => path === root || path.startsWith(`${root}/`));
  const proc = pid => {
    if (!procs.has(pid)) procs.set(pid, {parent: null, forkedAt: null, execs: [], argv: [], execList: [], files: [], calls: 0, runtimesCalls: 0, unresolved: 0, opened: new Set(), ended: false, cwd: {path: procs.size === 0 ? cwd : null}});
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
        // Which program of the parent forked it: the number of execs the parent had made then.
        child.forkedAt = p.execs.length;
        // A thread ends with its thread group, which an exit_group of any member ends without a line of the thread's own.
        if (/CLONE_THREAD/.test(call)) child.leader = p.leader ?? pid;
        // CLONE_FS shares the working directory (threads); a fork copies it.
        if (child.cwd.path === null) child.cwd = /CLONE_FS/.test(call) ? p.cwd : {path: p.cwd.path};
      }
      return;
    }
    const decodedCwd = CWD_DECODED.exec(call)?.[1];
    if (decodedCwd) p.cwd.path = decodedCwd;
    const {paths, unresolved} = callPaths(name, call, p.cwd.path);
    if (paths.some(inRuntimes)) {
      p.runtimesCalls += 1;
      // ok only for a call that returned a value of zero or more: an open, a descriptor (fix wave 2).
      p.files.push({name, kind: callKind(name, call), paths: paths.filter(inRuntimes), ok: (returnValue(call) ?? -1) >= 0});
    } else if (unresolved) p.unresolved += 1;
    if (watched && OPENS.has(name) && openedDescriptor(call)) for (const path of paths) if (watched.has(path)) p.opened.add(path);
    if (value === 0 && name === 'chdir') p.cwd.path = paths[0] ?? null;
    if (value === 0 && name === 'fchdir') p.cwd.path = paths[0] ?? null;
    if (EXEC.test(`${name}(`)) {
      // What a process opened before an exec was the earlier program's, never the one that runs after it.
      if (value === 0) { p.execs.push(program(call)); p.argv.push(call); p.calls = 0; p.opened = new Set(); }
      // An exec of a program under runtimes/ that failed is still an attempt to launch it.
      else if (paths.some(inRuntimes)) (p.attempts ??= []).push(paths.find(inRuntimes));
      // Every exec, done or attempted (a lookup along PATH attempts each directory's), with its argument vector and the
      // executable it named, resolved as the kernel resolves it (execveat's descriptor, a relative path against the
      // working directory); null when that cannot be read.
      p.execList.push({program: execProgram(name, call, p.cwd.path), argv: execArgv(call), cwd: p.cwd.path, ok: value === 0});
      return;
    }
    // exit ends this thread alone; exit_group ends its whole thread group.
    if (name === 'exit' || name === 'exit_group') p.ended = true;
    if (name === 'exit_group') proc(p.leader ?? pid).groupEnded = true;
    p.calls += 1;
  };
  return {
    line(text) {
      const m = LINE.exec(text);
      if (!m) { if (text.trim()) unread.lines += 1; return; }
      const pid = Number(m[1]);
      let call = m[2];
      const p = proc(pid);
      if (call.startsWith('+++')) {
        if (/^\+\+\+ (exited|killed)/.test(call)) p.ended = true;
        // A kill by signal ends the whole thread group; an exit line is this thread's own.
        if (/^\+\+\+ killed/.test(call)) proc(p.leader ?? pid).groupEnded = true;
        return;
      }
      if (call.startsWith('---')) return;
      const resumed = RESUMED.exec(call);
      if (resumed) {
        const start = pending.get(pid);
        pending.delete(pid);
        // exit and exit_group were never kept pending (they end the thread), but strace may still print their end.
        if (!start) { if (!(/^exit(?:_group)?$/.test(resumed[1]) && p.ended)) unread.orphans += 1; return; }
        const whole = `${start}${call.slice(resumed[0].length)}`;
        if (!RETURN_COLUMN.test(whole)) { unread.lines += 1; return; }
        return finish(pid, resumed[1], whole);
      }
      if (call.endsWith('<unfinished ...>')) {
        const start = call.slice(0, -'<unfinished ...>'.length);
        // exit and exit_group never resume: the thread has ended, and with exit_group its whole group.
        if (/^exit(?:_group)?\(/.test(start)) {
          p.ended = true;
          if (/^exit_group\(/.test(start)) proc(p.leader ?? pid).groupEnded = true;
        } else pending.set(pid, start);
        return;
      }
      const name = /^(\w+)\(/.exec(call)?.[1];
      // A call with no return column was cut short: its operands and its outcome are unknown, so it is unread.
      if (name && RETURN_COLUMN.test(call)) finish(pid, name, call);
      else unread.lines += 1;
    },
    summary() {
      const up = pid => { const chain = []; for (let p = procs.get(pid)?.parent; p !== null && p !== undefined && !chain.includes(p); p = procs.get(p)?.parent) chain.push(p); return chain; };
      const pidsWhere = test => [...procs].filter(([, p]) => p.argv.some(test)).map(([pid]) => pid);
      // Node itself running `script`, not the helper or bubblewrap that carry it after their `--`.
      const nodeRunning = script => [...procs].filter(([, p]) => p.execs.length && /(^|\/)node[^/]*$/.test(p.execs.at(-1)) && script.test(p.argv.at(-1)));
      const helpers = [...procs].filter(([, p]) => p.execs.includes(helper)).map(([pid]) => pid);
      // Every Node a pid exec'd, in order: a wrong one is not hidden by a later right one.
      const nodeExes = p => p.execs.filter(e => /(^|\/)node[^/]*$/.test(e ?? ''));
      const serve = pidsWhere(argv => SERVE.test(argv))[0] ?? null;
      const inServe = pid => serve !== null && (pid === serve || up(pid).includes(serve));
      // The kernel's own opens since its exec: its own, and those of every thread or child it forked after that exec
      // which exec'd nothing itself, down any chain of such.
      const openedBy = pid => {
        const kernel = procs.get(pid);
        const opened = new Set(kernel.opened);
        for (const [other, q] of procs) {
          if (other === pid || q.execs.length) continue;
          const chain = [other, ...up(other)];
          const at = chain.indexOf(pid);
          if (at < 1) continue;
          const below = chain.slice(0, at);
          if (below.every(a => !procs.get(a)?.execs.length) && procs.get(below.at(-1)).forkedAt === kernel.execs.length) for (const path of q.opened) opened.add(path);
        }
        return watch.filter(path => opened.has(path));
      };
      const kernels = nodeRunning(KERNEL).map(([pid, p]) => ({
        pid,
        underHelper: p.execs.slice(0, -1).includes(helper) || up(pid).some(a => helpers.includes(a)),
        underServe: inServe(pid),
        callsAfterExec: p.calls,
        exe: p.execs.at(-1),
        nodeExes: nodeExes(p),
        ...(watched ? {opened: openedBy(pid)} : {}),
      }));
      // A file call left unfinished at the end: its operands are read as written, and it leaves the count incomplete.
      for (const [pid, start] of pending) {
        const name = /^(\w+)\(/.exec(start)?.[1];
        // An unfinished exec is read too: its program is a path it names (execve's first operand, execveat's pair).
        if (!name || NO_PATHS.has(name)) continue;
        const q = procs.get(pid);
        const {paths} = callPaths(name, `${start})`, q.cwd.path);
        if (paths.some(inRuntimes)) {
          q.runtimesCalls += 1;
          q.files.push({name, kind: callKind(name, `${start})`), paths: paths.filter(inRuntimes), ok: null});
        }
        q.pendingFile = (q.pendingFile ?? 0) + 1;
        // An unfinished exec is an attempt.
        if (EXEC.test(`${name}(`)) q.execList.push({program: execProgram(name, `${start})`, q.cwd.path), argv: execArgv(`${start})`), cwd: q.cwd.path, ok: null});
      }
      pending.clear();
      const servedPids = [...procs.keys()].filter(inServe);
      const served = servedPids.map(pid => procs.get(pid));
      const unresolved = served.reduce((n, p) => n + p.unresolved, 0);
      const pendingFile = served.reduce((n, p) => n + (p.pendingFile ?? 0), 0);
      // A thread has ended when it exited itself, or its group ended: by an exit_group or a kill, or when every thread
      // of the group, its leader's included, had exited one by one. A leader's own exit does not end its other threads.
      const groupDone = leader => {
        const head = procs.get(leader);
        if (!head) return false;
        if (head.groupEnded) return true;
        return head.ended && [...procs.values()].filter(q => q.leader === leader).every(q => q.ended);
      };
      const unendedOf = pids => pids.filter(pid => { const q = procs.get(pid); return !q.ended && !groupDone(q.leader ?? pid); }).length;
      const unended = unendedOf(servedPids);
      // The whole trace's, for a traced command with no serve in it (an install, a doctor run).
      const all = [...procs.values()];
      // A trace with no process, a line it could not read, or a resumption of no call is never complete.
      const whole = {processes: procs.size, unresolved: all.reduce((n, p) => n + p.unresolved, 0), pending: all.reduce((n, p) => n + (p.pendingFile ?? 0), 0),
        unended: unendedOf([...procs.keys()]), unreadLines: unread.lines, orphans: unread.orphans};
      whole.complete = whole.processes > 0 && whole.unresolved === 0 && whole.pending === 0 && whole.unended === 0 && whole.unreadLines === 0 && whole.orphans === 0;
      // The trace's root: the first process's first successful exec, the command the trace was taken of.
      const first = procs.keys().next().value;
      const rootExec = first === undefined ? null : procs.get(first).execList.find(e => e.ok) ?? null;
      // Every exec in the trace, and the process-path witness: each program a successful exec ran, by path, with its count.
      const execs = [...procs].flatMap(([pid, q]) => q.execList.map(e => ({pid, ...e, underServe: inServe(pid)})));
      const counts = new Map();
      for (const e of execs) if (e.ok) counts.set(e.program, (counts.get(e.program) ?? 0) + 1);
      const programs = [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([path, count]) => ({path, count}));
      // Every call of the whole trace that named a path under runtimes/, with its kind (callKind).
      const files = [...procs].flatMap(([pid, q]) => q.files.map(f => ({pid, ...f})));
      // What the serve's tree launched, exec by exec: the helper, bubblewrap, an engine, or Node running the REPL host.
      const launched = [];
      for (const pid of servedPids) {
        if (pid === serve) continue;
        const q = procs.get(pid);
        q.execs.forEach((exe, i) => {
          const role = /(^|\/)node[^/]*$/.test(exe) ? REPL_HOST.exec(q.argv[i])?.[1] : null;
          const kind = inRuntimes(exe) ? 'runtimes' : exe === helper ? 'helper' : /(^|\/)bwrap$/.test(exe) ? 'bwrap' : /(^|\/)cua-engine$/.test(exe) ? 'engine' : /(^|\/)sky_linux_[^/]*$/.test(exe) ? 'sky_linux' : role ?? null;
          if (kind) launched.push({pid, kind, program: exe});
        });
        for (const path of q.attempts ?? []) launched.push({pid, kind: 'runtimes', program: path, attempted: true});
      }
      return {
        processes: procs.size,
        serve,
        workers: nodeRunning(WORKER).map(([pid, p]) => ({pid, underServe: inServe(pid), exe: p.execs.at(-1), nodeExes: nodeExes(p)})),
        helpers,
        bwrap: [...procs].filter(([, p]) => p.execs.some(e => /(^|\/)bwrap$/.test(e))).map(([pid]) => pid),
        kernels,
        // Measured: the serve's tree's calls that name a path under runtimes/, and the calls whose relative path could
        // not be resolved; with any of those the count is incomplete, never a clean zero.
        runtimes: {calls: served.reduce((n, p) => n + p.runtimesCalls, 0), unresolved, pending: pendingFile, unended, complete: unresolved === 0 && pendingFile === 0 && unended === 0},
        launched,
        whole,
        root: rootExec && {program: rootExec.program, argv: rootExec.argv},
        execs,
        programs,
        files,
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
