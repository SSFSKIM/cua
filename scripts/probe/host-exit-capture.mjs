#!/usr/bin/env node
// Issue #41: a read-only recorder for the next spontaneous exit of a "ChatGPT for Chrome" extension host. Spike #7
// found the host's only exit paths are Chrome-side (stdin EOF, stdout failure) but never saw one happen; this keeps the
// timeline that was missing then.
//
//   node scripts/probe/host-exit-capture.mjs [--out DIR] [--interval-seconds 5] [--samples 60] [--after-seconds 30]
//                                            [--log-window 10m] [--max-minutes 240]
//
// Every few seconds it samples the hosts (`pgrep -fl`, each one's parent pid and start time from `ps`, and the Unix
// sockets it holds from `lsof`, paths reduced to their basename). When a host it saw is gone, it keeps sampling for
// --after-seconds (does Chrome start a replacement?), then writes a timeline under $CUA_HOME/state/probe/ (or --out)
// with the last --samples samples, the exit time, whether the parent Chrome process outlived the host, and `log show`
// lines for the host around the exit, and stops. It never stops, signals or restarts any process, and reads nothing
// from Chrome's profile. Without an exit it stops quietly after --max-minutes.
import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {basename, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

const HOST_EXECUTABLE = /\/ChatGPT for Chrome(?= |$)/;
export const LOG_PREDICATE = 'process == "ChatGPT for Chrome" OR senderImagePath CONTAINS "extension-host"';

// `pgrep -fl "ChatGPT for Chrome"` text -> [{pid, command}]. Only processes whose executable is the host count, not a
// process that merely mentions the name in its arguments (a `log show` with this script's predicate, say).
export function parseHosts(pgrepText) {
  return pgrepText.split('\n').map(line => line.match(/^\s*(\d+)\s+(.*?)\s*$/)).filter(Boolean)
    .filter(([, , command]) => HOST_EXECUTABLE.test(command))
    .map(([, pid, command]) => ({pid: Number(pid), command}));
}

// `ps -o ppid=,lstart= -p <pid>` text (C locale) -> {ppid, start}, or null when the process is already gone.
export function parsePs(psText) {
  const match = psText.match(/^\s*(\d+)\s+(.*?)\s*$/m);
  return match ? {ppid: Number(match[1]), start: match[2].replace(/\s+/g, ' ')} : null;
}

// `lsof -n -a -p <pid> -U -F fdn` field output -> [{fd, device, name}], a path reduced to its basename; a peer address
// (`->0x...`) or an empty name is kept as it is. The listener and accepted clients share the socket path, so the
// device (the kernel socket address) is what tells them apart: fds with one device are one connection.
export function parseUnixSockets(lsofText) {
  const out = [];
  for (const line of lsofText.split('\n')) {
    if (line.startsWith('f')) out.push({fd: line.slice(1), device: '', name: ''});
    else if (line.startsWith('d') && out.length) out.at(-1).device = line.slice(1);
    else if (line.startsWith('n') && out.length) out.at(-1).name = line.slice(1).includes('/') ? basename(line.slice(1)) : line.slice(1);
  }
  return out;
}

// A host is its pid and start time together, so a reused pid is a new host.
export const hostKey = host => `${host.pid}@${host.start}`;

// Two samples -> the hosts that disappeared and the ones that appeared between them.
export function hostDelta(previous, current) {
  const before = new Set(previous.hosts.map(hostKey));
  const after = new Set(current.hosts.map(hostKey));
  return {gone: previous.hosts.filter(h => !after.has(hostKey(h))), started: current.hosts.filter(h => !before.has(hostKey(h)))};
}

export const redactHome = (text, home) => text.split(home).join('~');

export const OWNER_STEPS = `Owner steps this recorder cannot do (it only watches processes and reads logs):
  1. In the Chrome profile whose host you are watching, open chrome://extensions and turn on Developer mode (top right).
     Developer mode also makes the extension card collect an Errors list.
  2. On the OpenAI (ChatGPT) extension's card, click the "service worker" link beside "Inspect views". A DevTools window
     opens on the extension's background worker; leave it on the Console tab. (An open DevTools keeps that worker alive,
     so note in the timeline whether it was open when the host exited.)
  3. When this recorder reports an exit, paste into the timeline file it names, under the owner sections:
     - every console line about the native port, e.g. "Native host has exited.", "Error when communicating with the
       native messaging host.", a disconnect or reconnect message;
     - the entries of the extension card's Errors list on chrome://extensions;
     - what happened around then: Chrome closed or updated, the extension toggled or updated, the Mac slept, a cua or
       ChatGPT browser task running.`;

// The timeline file: what the recorder saw, and empty sections for what only the owner can copy.
export function renderTimeline({lastSeenAt, exitedAt, gone, parentsAlive, samples, after, intervalSeconds, logWindow, logText}) {
  const gaps = samples.slice(1).map((s, i) => [samples[i].at, s.at, (Date.parse(s.at) - Date.parse(samples[i].at)) / 1000])
    .filter(([, , seconds]) => seconds > intervalSeconds * 3);
  const json = value => '```json\n' + JSON.stringify(value, null, 2) + '\n```';
  return `# Chrome extension host exit, ${exitedAt}

Recorded by scripts/probe/host-exit-capture.mjs (issue #41). Last seen alive ${lastSeenAt}; first sample without it
${exitedAt} (sampled every ${intervalSeconds} s): the host exited between the two.

## Hosts that exited

${json(gone.map(h => ({...h, parentAliveAfterExit: parentsAlive[h.ppid] ?? null})))}

## Sampling gaps longer than ${intervalSeconds * 3} s (the Mac asleep, or the recorder stalled)

${gaps.length ? gaps.map(([from, to, seconds]) => `- ${from} -> ${to} (${seconds} s)`).join('\n') : 'none'}

## Owner: extension service-worker console (paste native-port lines here)

(was the worker's DevTools open at the exit? yes/no)

## Owner: chrome://extensions Errors list for the OpenAI extension

## Owner: what happened around the exit

## Samples before and including the exit

${json(samples)}

## Samples after the exit (a replacement host appearing means Chrome reconnected)

${json(after)}

## log show --last ${logWindow} --predicate '${LOG_PREDICATE}'

\`\`\`
${logText.trimEnd() || '(no lines)'}
\`\`\`
`;
}

function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, {encoding: 'utf8', env: {...process.env, LC_ALL: 'C'}, maxBuffer: 64 << 20, ...options});
  return {status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error};
}

function sample() {
  const hosts = [];
  for (const {pid, command} of parseHosts(run('/usr/bin/pgrep', ['-fl', 'ChatGPT for Chrome']).stdout)) {
    const ps = parsePs(run('/bin/ps', ['-o', 'ppid=,lstart=', '-p', String(pid)]).stdout);
    if (!ps) continue;                                              // exited between pgrep and ps
    const sockets = parseUnixSockets(run('/usr/sbin/lsof', ['-n', '-a', '-p', String(pid), '-U', '-F', 'fdn']).stdout);
    hosts.push({pid, ...ps, command: redactHome(command, homedir()), sockets});
  }
  return {at: new Date().toISOString(), hosts};
}

const alive = pid => run('/bin/ps', ['-o', 'pid=', '-p', String(pid)]).stdout.trim() !== '';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const {values: opts} = parseArgs({options: {
    out: {type: 'string'},
    'interval-seconds': {type: 'string', default: '5'},
    samples: {type: 'string', default: '60'},
    'after-seconds': {type: 'string', default: '30'},
    'log-window': {type: 'string', default: '10m'},
    'max-minutes': {type: 'string', default: '240'},
  }});
  const intervalSeconds = Number(opts['interval-seconds']);
  const keep = Number(opts.samples);
  const afterSeconds = Number(opts['after-seconds']);
  const maxMinutes = Number(opts['max-minutes']);
  for (const [name, value] of [['interval-seconds', intervalSeconds], ['samples', keep], ['after-seconds', afterSeconds], ['max-minutes', maxMinutes]])
    if (!(value >= 0) || (name !== 'after-seconds' && !value)) { process.stderr.write(`host-exit-capture: --${name} must be a positive number\n`); process.exit(2); }
  if (!/^\d+[smhd]$/.test(opts['log-window'])) { process.stderr.write('host-exit-capture: --log-window takes log show\'s form, e.g. 10m\n'); process.exit(2); }
  const cuaHome = process.env.CUA_HOME || join(homedir(), 'Library/Application Support/cua');
  const outDir = opts.out ?? join(cuaHome, 'state/probe');

  process.stdout.write(`${OWNER_STEPS}\n\nRecording every ${intervalSeconds} s for up to ${maxMinutes} min; the timeline goes to ${redactHome(outDir, homedir())}.\n`);
  const deadline = Date.now() + maxMinutes * 60_000;
  const recent = [];
  let previous = null;
  while (Date.now() < deadline) {
    const current = sample();
    recent.push(current);
    if (recent.length > keep) recent.shift();
    if (previous) {
      const {gone, started} = hostDelta(previous, current);
      for (const h of started) process.stdout.write(`${current.at} host started: pid ${h.pid}, parent ${h.ppid}\n`);
      if (gone.length) {
        process.stdout.write(`${current.at} host gone: ${gone.map(h => `pid ${h.pid}`).join(', ')}; sampling ${afterSeconds} s more before writing the timeline\n`);
        const parentsAlive = Object.fromEntries(gone.map(h => [h.ppid, alive(h.ppid)]));
        const after = [];
        for (let waited = 0; waited < afterSeconds; waited += intervalSeconds) { await pause(intervalSeconds * 1000); after.push(sample()); }
        const log = run('/usr/bin/log', ['show', '--info', '--last', opts['log-window'], '--predicate', LOG_PREDICATE], {timeout: 180_000});
        const logText = redactHome(log.stdout + (log.status === 0 ? '' : `\n(log show exited ${log.status ?? log.error?.code}: ${log.stderr.trim()})`), homedir());
        mkdirSync(outDir, {recursive: true});
        const file = join(outDir, `host-exit-${current.at.replace(/[:.]/g, '-')}.md`);
        writeFileSync(file, renderTimeline({lastSeenAt: previous.at, exitedAt: current.at, gone, parentsAlive, samples: [...recent], after,
          intervalSeconds, logWindow: opts['log-window'], logText}));
        process.stdout.write(`Timeline written: ${file}\nNow do step 3 above: paste the console and Errors lines into its owner sections.\n`);
        return;
      }
    } else {
      process.stdout.write(`${current.at} watching ${current.hosts.length} host(s): ${current.hosts.map(h => `pid ${h.pid} (parent ${h.ppid}, started ${h.start}, ${h.sockets.length} unix socket(s))`).join('; ') || 'none yet'}\n`);
    }
    previous = current;
    await pause(intervalSeconds * 1000);
  }
  process.stdout.write(`No host exited in ${maxMinutes} min; nothing written.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
