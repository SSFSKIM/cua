#!/usr/bin/env node
// Runs a command while sampling the process table every 50 ms (M3's release/accept-watch.mjs, made generic and leaving
// the environment as it is): the most sky_linux processes seen at once, and every cua-engine process seen, with its
// executable and its parent's command line. The command's stdout goes to <report>; the samples to <watch.json>.
// usage: node watch.mjs <report> <watch.json> -- <command> [args...]
import {spawn, execFileSync} from 'node:child_process';
import {openSync, readFileSync, readlinkSync, writeFileSync} from 'node:fs';

const split = process.argv.indexOf('--');
const [report, out] = process.argv.slice(2, split);
const [command, ...args] = process.argv.slice(split + 1);
let maxSky = 0, samples = 0;
const engines = new Map();
const pids = (args, name) => { try { return execFileSync('pgrep', [...args, name], {encoding: 'utf8'}).trim().split('\n').filter(Boolean); } catch { return []; } };
const sample = () => {
  samples += 1;
  maxSky = Math.max(maxSky, pids(['-f'], 'sky_linux').length);
  for (const pid of pids(['-x'], 'cua-engine')) {
    if (engines.has(pid)) continue;
    try {
      const exe = readlinkSync(`/proc/${pid}/exe`);
      const ppid = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[1];
      const parent = readFileSync(`/proc/${ppid}/cmdline`, 'utf8').split('\0').filter(Boolean).slice(0, 3).join(' ');
      engines.set(pid, {exe, ppid, parent});
    } catch { /* exited between pgrep and the read */ }
  }
};
const timer = setInterval(sample, 50);
const child = spawn(command, args, {stdio: ['ignore', openSync(report, 'w'), 'inherit']});
const exit = await new Promise(done => child.once('exit', (code, signal) => done({code, signal})));
clearInterval(timer);
writeFileSync(out, JSON.stringify({exit, samples, maxSkyLinux: maxSky, engines: [...engines].map(([pid, e]) => ({pid: Number(pid), ...e}))}, null, 1) + '\n');
console.error(`watch: exit ${exit.code ?? exit.signal}, ${samples} samples, sky_linux at most ${maxSky}, ${engines.size} cua-engine process(es)`);
process.exit(exit.code ?? 1);
