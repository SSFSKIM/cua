#!/usr/bin/env node
// #384 diagnosis only (branch diag/384-cdp-latency, never merged): every 2 s, the runner's CPU and memory by process
// role, appended to <dir>/ps.jsonl until SIGTERM. A process's command line is read only to name its role and is never
// written: a row holds role names, counts and numbers.
//   node scripts/repl-parity/hosted/diag384-sample.mjs <dir>
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {join} from 'node:path';

const dir = process.argv[2];
const out = join(dir, 'ps.jsonl');
const ROLES = [
  ['burner', a => /^(\S*\/)?yes$/.test(a)],
  ['chrome-ext', a => /--type=renderer/.test(a) && /--extension-process/.test(a)],
  ['chrome-renderer', a => /--type=renderer/.test(a)],
  ['chrome-gpu', a => /--type=gpu-process/.test(a)],
  ['chrome-network', a => /--utility-sub-type=network/.test(a)],
  ['chrome-helper', a => /Chrome for Testing Helper/.test(a)],
  ['chrome-browser', a => /Google Chrome for Testing/.test(a)],
  ['cua-supervisor', a => /repl-host\/supervisor\.mjs/.test(a)],
  ['worker', a => /trusted-worker/.test(a)],
  ['kernel', a => /kernel/.test(a) && /node/.test(a)],
  ['vendor-supervisor', a => /node_repl/.test(a)],
  ['vendor-launcher', a => /cua-repl/.test(a)],
  ['native-host', a => /chrome\/host\.mjs|host-launcher|io\.github\.ssfskim\.cua/.test(a)],
  ['serve', a => /serve-production\.mjs|cua\.mjs serve/.test(a)],
  ['harness', a => /repl-parity\.mjs/.test(a)],
  ['sandbox-exec', a => /sandbox-exec/.test(a)],
  ['node-other', a => /\bnode\b/.test(a)],
  ['WindowServer', a => /WindowServer/.test(a)],
];
const roleOf = args => ROLES.find(([, test]) => test(args))?.[0] ?? 'other';
const run = (cmd, args) => { try { return execFileSync(cmd, args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore']}); } catch { return ''; } };

function sample() {
  const roles = {};
  for (const line of run('ps', ['-A', '-ww', '-o', 'pcpu=,rss=,args=']).split('\n')) {
    const m = /^\s*([\d.]+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const role = roleOf(m[3]);
    const r = roles[role] ??= {cpu: 0, rssMB: 0, n: 0, top: 0};
    r.cpu = Math.round((r.cpu + Number(m[1])) * 10) / 10;
    r.top = Math.max(r.top, Number(m[1]));
    r.rssMB += Math.round(Number(m[2]) / 1024);
    r.n++;
  }
  const load = run('sysctl', ['-n', 'vm.loadavg']).match(/[\d.]+/g)?.map(Number) ?? [];
  const swap = /used = ([\d.]+)M/.exec(run('sysctl', ['-n', 'vm.swapusage']))?.[1];
  const vm = run('vm_stat', []);
  const pages = name => Number(new RegExp(`${name}:\\s+(\\d+)`).exec(vm)?.[1] ?? NaN);
  const row = {k: 'ps', t: Date.now(), load1: load[0], swapUsedMB: swap === undefined ? null : Number(swap),
    freePages: pages('Pages free'), compressedPages: pages('Pages occupied by compressor'), swapins: pages('Swapins'), swapouts: pages('Swapouts'),
    pageins: pages('Pageins'), roles};
  try { appendFileSync(out, `${JSON.stringify(row)}\n`); } catch {}
}
process.on('SIGTERM', () => process.exit(0));
sample();
setInterval(sample, 2000);
