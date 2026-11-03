// #171 task 41: the harness's startRunWatchdog with the real xprobe on a private Xvfb (DISPLAY is that display,
// never :0): ready, a guarded process, the server stopped (SIGSTOP), the stall, the guarded process and the run
// stand-in killed. argv[2]: the out file.
import { spawn } from 'node:child_process';

const { startRunWatchdog } = await import('/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff/xtools.mjs');
if (!/^:9\d$/.test(process.env.DISPLAY ?? '')) throw new Error(`a private display only, not ${process.env.DISPLAY}`);
const guarded = spawn('sleep', ['60']);
const run = spawn('sleep', ['60']);
const watchdog = await startRunWatchdog({ file: process.argv[2], stopPid: run.pid, intervalMs: 500, boundMs: 2000, graceMs: 1000 });
console.log('ready');
watchdog.guard(guarded.pid);
await new Promise((r) => setTimeout(r, 1200));
process.kill(Number(process.env.XVFB_PID), 'SIGSTOP');
const ends = (child) => new Promise((r) => child.once('exit', (code, signal) => r(signal)));
const [g, s] = await Promise.all([ends(guarded), ends(run)]);
const result = await watchdog.stop();
process.kill(Number(process.env.XVFB_PID), 'SIGCONT');
console.log(JSON.stringify({ guarded: g, run: s, stalled: result.stalled, last: result.lines.at(-1) }));
