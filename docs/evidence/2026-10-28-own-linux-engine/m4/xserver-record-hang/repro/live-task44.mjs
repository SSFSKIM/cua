// #171 task 44: the watchdog's fixes live, through the real xprobe, on X servers this script starts itself only
// (`Xvfb -displayfd`; never :0, never a display it was handed). Each case prints one line.
// 1. a display already hung (its Xvfb SIGSTOPped before the watchdog): startRunWatchdog fails, the run not signalled;
// 2. the same through Desktop.begin: it fails before any X tool of the harness's runs;
// 3. a healthy server through startPrivateServer: watched before it is marked, its own ready line, a clean stop;
// 4. a watchdog killed mid-run: the run is stopped (SIGTERM) and the verdict is `lost`;
// 5. a stall mid-run: the stall line is out before the grace, and the run's stop does not cut the escalation short.
// argv[2]: an out directory.
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const harness = new URL('../../../../../../scripts/linux-engine-diff/', import.meta.url);
const { startPrivateServer, startRunWatchdog } = await import(new URL('xtools.mjs', harness).href);
const { Desktop } = await import(new URL('scenes.mjs', harness).href);
const say = (line) => console.log(line);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const servers = [];

/** An Xvfb of this script's own; its display as it named it. */
async function ownServer() {
  const child = spawn('Xvfb', ['-displayfd', '3', '-noreset', '-nolisten', 'tcp', '-screen', '0', '640x480x24'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });
  servers.push(child);
  const display = await new Promise((resolve, reject) => {
    let text = '';
    child.stdio[3].on('data', (d) => {
      text += d;
      if (/^\d+\n/.test(text)) resolve(`:${text.trim()}`);
    });
    child.once('exit', (code) => reject(new Error(`Xvfb exited ${code}`)));
  });
  return { child, display };
}
const sleeper = () => spawn('sleep', ['60']);
const signalOf = (child, ms) => Promise.race([new Promise((r) => child.once('exit', (code, signal) => r(signal ?? `exit ${code}`))), sleep(ms).then(() => 'alive')]);

try {
  // 1.
  {
    const { child, display } = await ownServer();
    process.kill(child.pid, 'SIGSTOP');
    const run = sleeper();
    const started = Date.now();
    const error = await startRunWatchdog({ display, file: join(out, '1-watchdog.jsonl'), stopPid: run.pid }).then(() => null, (e) => e);
    say(`1. hung ${display}: ${error ? `start failed after ${Date.now() - started} ms: ${error.message}` : 'STARTED (wrong)'}; the run ${await signalOf(run, 300)}`);
    run.kill('SIGKILL');
    process.kill(child.pid, 'SIGCONT');
    child.kill('SIGKILL');
  }
  // 2.
  {
    const { child, display } = await ownServer();
    process.kill(child.pid, 'SIGSTOP');
    const shims = mkdtempSync(join(tmpdir(), 'cua171-task44-shims-'));
    const log = join(shims, 'log');
    writeFileSync(log, '');
    for (const tool of ['xprop', 'xwininfo', 'xdotool', 'xtrace']) {
      writeFileSync(join(shims, tool), `#!/bin/sh\necho "${tool} $*" >> ${JSON.stringify(log)}\nexec /usr/bin/${tool} "$@"\n`);
      chmodSync(join(shims, tool), 0o755);
    }
    const saved = { PATH: process.env.PATH, DISPLAY: process.env.DISPLAY };
    process.env.PATH = `${shims}${delimiter}${saved.PATH}`;
    process.env.DISPLAY = display;
    const desktop = new Desktop({ cua: '/nonexistent/cua-engine', run: 'live44', logs: out });
    const started = Date.now();
    const error = await desktop.begin().then(() => null, (e) => e);
    process.env.PATH = saved.PATH;
    if (saved.DISPLAY === undefined) delete process.env.DISPLAY;
    else process.env.DISPLAY = saved.DISPLAY;
    desktop.unhookStop();
    const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
    say(`2. Desktop.begin on hung ${display}: ${error ? `failed after ${Date.now() - started} ms (${error.message})` : 'BEGAN (wrong)'}; X tools run: ${calls.length ? calls.join('; ') : 'none'}`);
    process.kill(child.pid, 'SIGCONT');
    child.kill('SIGKILL');
  }
  // 3.
  {
    const order = [];
    const server = await startPrivateServer({
      out,
      startWatchdog: async (options) => {
        order.push(`watchdog on ${options.display}, mark ${execFileSync('xprop', ['-root', 'CUA171_PRIVATE_DISPLAY'], { env: { ...process.env, DISPLAY: options.display }, encoding: 'utf8' }).trim()}`);
        return startRunWatchdog({ ...options, intervalMs: 200, boundMs: 2000 });
      },
    });
    const mark = execFileSync('xprop', ['-root', 'CUA171_PRIVATE_DISPLAY'], { env: { ...process.env, DISPLAY: server.display }, encoding: 'utf8' }).trim();
    await sleep(700);
    const verdict = await server.stop();
    const ready = verdict.lines.find((l) => l.kind === 'ready');
    await sleep(100);
    say(`3. startPrivateServer ${server.display}: ${order[0]}; then ${mark}; ready line pid ${ready?.pid}; stop: ${verdict.state} clean ${verdict.clean}, ${verdict.round_trips} round trips; the server ${alive(server.pid) ? 'ALIVE (wrong)' : 'ended after its watchdog'}`);
  }
  // 4.
  {
    const { child, display } = await ownServer();
    const run = sleeper();
    const watchdog = await startRunWatchdog({ display, file: join(out, '4-watchdog.jsonl'), stopPid: run.pid });
    const ready = JSON.parse(readFileSync(join(out, '4-watchdog.jsonl'), 'utf8').trim().split('\n').at(-1));
    process.kill(ready.pid, 'SIGKILL');
    const signal = await signalOf(run, 3000);
    const verdict = await watchdog.stop();
    say(`4. watchdog ${ready.pid} killed mid-run on ${display}: the run got ${signal}; verdict ${verdict.state}: ${verdict.reason}`);
    child.kill('SIGKILL');
  }
  // 5.
  {
    const { child, display } = await ownServer();
    // a run stand-in that ignores SIGTERM, so the escalation has to wait out its grace and SIGKILL it
    const run = spawn('sh', ['-c', "trap '' TERM; sleep 60"]);
    const file = join(out, '5-watchdog.jsonl');
    const watchdog = await startRunWatchdog({ display, file, stopPid: run.pid, intervalMs: 300, boundMs: 1000, graceMs: 4000, onLost: (reason) => say(`5. LOST (wrong): ${reason}`) });
    const stoppedAt = Date.now();
    process.kill(child.pid, 'SIGSTOP');
    let stallAt = null;
    while (stallAt === null && Date.now() - stoppedAt < 5000) {
      if (readFileSync(file, 'utf8').includes('"kind":"stall"')) stallAt = Date.now();
      else await sleep(20);
    }
    // the run's own stop, as its SIGTERM cleanup makes it, while the escalation waits out the grace
    const verdict = await watchdog.stop();
    const stopAnswered = Date.now();
    const signal = await signalOf(run, 8000);
    const killedAt = Date.now();
    say(`5. stall on ${display}: stall line ${stallAt - stoppedAt} ms after the server stopped; the run's stop answered ${verdict.state} ${stopAnswered - stallAt} ms after it; the run ended by ${signal} ${killedAt - stallAt} ms after the stall line (grace 4000 ms)`);
    process.kill(child.pid, 'SIGCONT');
    child.kill('SIGKILL');
  }
} finally {
  for (const s of servers) {
    try {
      process.kill(s.pid, 'SIGCONT');
      s.kill('SIGKILL');
    } catch {
      // ended
    }
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
