// Runs scripts/accept/linux-native.mjs with CUA_NATIVE_ENGINE=cua while sampling the process table every 50 ms:
// the most sky_linux processes seen at once, and every cua-engine process seen with its executable and parent.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, readlinkSync, writeFileSync } from 'node:fs';

const [repo, out] = process.argv.slice(2);
const env = { ...process.env, CUA_NATIVE_ENGINE: 'cua', DISPLAY: ':0', XAUTHORITY: `${process.env.HOME}/.Xauthority` };
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
const child = spawn(process.execPath, [`${repo}/scripts/accept/linux-native.mjs`], { cwd: repo, env, stdio: ['ignore', 'pipe', 'inherit'] });
let report = '';
child.stdout.on('data', (d) => { report += d; });
child.on('exit', (code) => {
  clearInterval(timer);
  sample();
  const parsed = JSON.parse(report);
  const summary = { exit: code, status: parsed.status, steps: parsed.steps.map((s) => `${s.status} ${s.name}`), samples, maxSkyLinux: maxSky, cuaEngines: [...engines.entries()].map(([pid, v]) => ({ pid, ...v })) };
  writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ exit: code, status: parsed.status, samples, maxSkyLinux: maxSky, cuaEngines: summary.cuaEngines }));
});
