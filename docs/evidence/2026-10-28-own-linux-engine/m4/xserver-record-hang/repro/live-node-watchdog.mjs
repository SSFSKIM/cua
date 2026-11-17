// #171 task 41: the harness's startRunWatchdog with the real xprobe on a private Xvfb (DISPLAY is that display, one
// live-node-watchdog.sh started and marked; never :0): ready, a guarded process, the server stopped (SIGSTOP), the
// stall, the guarded process and the run stand-in killed. argv[2]: the out file.
import { spawn } from 'node:child_process';

const { isPrivateDisplay, startRunWatchdog } = await import(new URL('../../../../../../scripts/linux-engine-diff/xtools.mjs', import.meta.url).href);
// task 44: a display marked private only, never the one a shell happens to name
if (!isPrivateDisplay()) throw new Error(`a private display only, and ${process.env.DISPLAY} is not marked private`);
const guarded = spawn('sleep', ['60']);
const run = spawn('sleep', ['60']);
const watchdog = await startRunWatchdog({ file: process.argv[2], stopPid: run.pid, intervalMs: 500, boundMs: 2000, graceMs: 1000, onLost: (reason) => console.log(`lost: ${reason}`) });
console.log('ready');
watchdog.guard(guarded.pid);
await new Promise((r) => setTimeout(r, 1200));
process.kill(Number(process.env.XVFB_PID), 'SIGSTOP');
const ends = (child) => new Promise((r) => child.once('exit', (code, signal) => r(signal)));
const [g, s] = await Promise.all([ends(guarded), ends(run)]);
const result = await watchdog.stop();
process.kill(Number(process.env.XVFB_PID), 'SIGCONT');
console.log(JSON.stringify({ guarded: g, run: s, state: result.state, stalled: result.stalled, last: result.lines.at(-1) }));
