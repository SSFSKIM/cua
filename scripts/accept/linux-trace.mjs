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
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';

/** strace's options for a fixture's traced run, before `-o <file> -- <command>`. */
export const TRACE_ARGS = ['-f', '-qq', '-s', '4096', '--pidns-translation', '-e', 'trace=%file,%process'];

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

/** A streaming reader: `line(text)` for each line of the trace, then `summary()`. */
export function traceReader({helper, home}) {
  const procs = new Map();
  const pending = new Map();
  const runtimes = `${home.replace(/\/$/, '')}/runtimes/`;
  const proc = pid => { if (!procs.has(pid)) procs.set(pid, {parent: null, execs: [], argv: [], calls: 0, runtimesCalls: 0}); return procs.get(pid); };
  const finish = (pid, name, call) => {
    const p = proc(pid);
    const returned = TRANSLATED.exec(call) ?? RETURNED.exec(call);
    const value = returned ? Number(returned[1]) : null;
    if (FORKS.test(`${name}(`) && value > 0) { proc(value).parent = pid; return; }
    if (EXEC.test(`${name}(`)) {
      if (value === 0) { p.execs.push(program(call)); p.argv.push(call); p.calls = 0; }
      return;
    }
    p.calls += 1;
    if (call.includes(runtimes)) p.runtimesCalls += 1;
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
      return {
        processes: procs.size,
        serve,
        workers: nodeRunning(WORKER).map(([pid]) => pid),
        helpers,
        bwrap: [...procs].filter(([, p]) => p.execs.some(e => /(^|\/)bwrap$/.test(e))).map(([pid]) => pid),
        kernels,
        runtimesCalls: [...procs].filter(([pid]) => inServe(pid)).reduce((n, [, p]) => n + p.runtimesCalls, 0),
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
  if (!summary.workers.length) problems.push('the trace holds no trusted worker exec');
  if (!summary.kernels.length) problems.push('the trace holds no kernel exec: strace did not follow the helper\'s children');
  else {
    const helped = summary.kernels.filter(k => k.underHelper);
    if (!helped.length) problems.push('no kernel ran under the pinned helper in the trace');
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
