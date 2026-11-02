// Runs scripts/accept/linux-device-mode.mjs with CUA_NATIVE_ENGINE=cua (no CUA_LINUX_ENGINE_BIN, so the pinned install)
// while sampling the process table every 50 ms, as accept-watch.mjs does: the most sky_linux processes seen at once and
// every cua-engine process seen with its executable and parent. Writes the fixture's own JSON report to <report> as it
// came out, and the sampler's record to <engines>.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, readlinkSync, writeFileSync } from 'node:fs';

const [repo, reportOut, enginesOut] = process.argv.slice(2);
const env = { ...process.env, CUA_NATIVE_ENGINE: 'cua', DISPLAY: ':0', XAUTHORITY: `${process.env.HOME}/.Xauthority` };
delete env.CUA_LINUX_ENGINE_BIN;
let maxSky = 0;
let samples = 0;
const engines = new Map();
const sample = () => {
  samples += 1;
  let sky = 0;
  try { sky = Number(execFileSync('pgrep', ['-fc', 'sky_linux'], { encoding: 'utf8' }).trim()); } catch { sky = 0; }
  maxSky = Math.max(maxSky, sky);
  let pids = [];
  try { pids = execFileSync('pgrep', ['-x', 'cua-engine'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean); } catch { pids = []; }
  for (const pid of pids) {
    if (engines.has(pid)) continue;
    try {
      const exe = readlinkSync(`/proc/${pid}/exe`);
      const ppid = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[1];
      const parent = readFileSync(`/proc/${ppid}/cmdline`, 'utf8').split('\0').filter(Boolean).slice(0, 3).join(' ');
      engines.set(pid, { exe, ppid, parent });
    } catch { /* exited between pgrep and read */ }
  }
};
const timer = setInterval(sample, 50);
const child = spawn(process.execPath, [`${repo}/scripts/accept/linux-device-mode.mjs`], { cwd: repo, env, stdio: ['ignore', 'pipe', 'inherit'] });
let report = '';
child.stdout.on('data', (d) => { report += d; });
child.on('exit', (code) => {
  clearInterval(timer);
  sample();
  writeFileSync(reportOut, report.endsWith('\n') ? report : `${report}\n`);
  let parsed = {};
  try { parsed = JSON.parse(report); } catch { /* recorded as it came out */ }
  const steps = parsed.steps ?? [];
  const summary = { exit: code, steps: steps.length, passed: steps.filter((s) => s.status === 'PASS').length, failed: steps.filter((s) => s.status !== 'PASS').map((s) => s.name), samples, maxSkyLinux: maxSky, cuaEngines: [...engines.entries()].map(([pid, v]) => ({ pid, ...v })) };
  writeFileSync(enginesOut, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary));
});
