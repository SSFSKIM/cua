// The M5 live network observation's sampler (spec docs/doperpowers/specs/2026-10-13-own-browser-service-design.md,
// "Network and disk proof", acceptance 7). Runs on the mini beside one `cua serve` started by live/session.mjs, until
// its stdin ends:
//   node sampler.mjs <serve pid file>
// It follows the serve process tree (the serve pid, then every process whose parent is in the tree, kept once seen
// even if later re-parented) from `ps` every 250 ms, runs one continuous `nettop -L 0 -s 1 -n -x` (logging mode, CSV,
// one sample a second, every process's connections with no name resolution) and keeps only the rows of tree processes,
// and every second lists the tree's open sockets and its files under state/codex with `lsof`. It prints one JSON
// summary on stdout: the tree (pid, parent, executable, arguments), each connection nettop saw for a tree process
// (owning pid, protocol, local and remote endpoint, interface, states, first and last sample, bytes), each lsof
// socket or state/codex entry (a Unix socket's peer named from a machine-wide `lsof -U`), the processes outside the
// tree at the other end of a tree socket, and the tree processes still alive at the end. Nothing else is recorded.
import {spawn, execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {existsSync, readFileSync} from 'node:fs';

const [pidFile] = process.argv.slice(2);
const started = new Date().toISOString();
const tree = new Map();            // pid -> {pid, ppid, executable, args, first, last}
let root = null, nettopRows = 0, lsofRuns = 0, psRuns = 0;
const flows = new Map();           // `${pid}|${endpoints}` -> flow
const processRows = new Map();     // pid -> {name, first, last} for every nettop process row (filtered at the end)
const lsofEntries = new Map();     // `${pid}|${type}|${name}` -> entry

const now = () => new Date().toISOString();
function psTable() {
  psRuns++;
  return execFileSync('ps', ['-A', '-o', 'pid=,ppid=,comm='], {encoding: 'utf8'}).split('\n').map(line => line.trim()).filter(Boolean)
    .map(line => { const m = line.match(/^(\d+)\s+(\d+)\s+(.*)$/); return m && {pid: +m[1], ppid: +m[2], executable: m[3]}; }).filter(Boolean);
}
function follow() {
  if (root === null) {
    if (!existsSync(pidFile)) return;
    const value = Number(readFileSync(pidFile, 'utf8').trim());
    if (!Number.isInteger(value) || value <= 0) return;
    root = value;
  }
  const rows = psTable(), t = now();
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of rows) {
      const known = tree.get(row.pid);
      if (known) { known.last = t; continue; }
      if (row.pid === root || tree.has(row.ppid)) {
        let args = '';
        try { args = execFileSync('ps', ['-o', 'args=', '-p', String(row.pid)], {encoding: 'utf8'}).trim().slice(0, 300); } catch {}
        tree.set(row.pid, {pid: row.pid, ppid: row.ppid, executable: row.executable, args, first: t, last: t});
        grew = true;
      }
    }
  }
}

// nettop CSV: a process row `time,<name>.<pid>,...` precedes that process's connection rows
// `time,<proto> <local><-><remote>,<interface>,<state>,<bytes_in>,<bytes_out>,...`.
const nettop = spawn('nettop', ['-L', '0', '-s', '1', '-n', '-x'], {stdio: ['ignore', 'pipe', 'pipe']});
nettop.stderr.resume();
let currentPid = null, currentName = null;
createInterface({input: nettop.stdout}).on('line', line => {
  nettopRows++;
  const cells = line.split(',');
  if (cells[0] === 'time') return;
  const label = cells[1] ?? '';
  const conn = label.match(/^(tcp4|tcp6|udp4|udp6)\s+(.+?)<->(.+)$/);
  const t = now();
  if (!conn) {
    const m = label.match(/^(.*)\.(\d+)$/);
    currentPid = m ? +m[2] : null; currentName = m ? m[1] : null;
    if (currentPid !== null) {
      const p = processRows.get(currentPid) ?? {name: currentName, first: t, last: t, samples: 0, bytesIn: 0, bytesOut: 0};
      p.last = t; p.samples++;
      p.bytesIn = Math.max(p.bytesIn, Number(cells[4]) || 0); p.bytesOut = Math.max(p.bytesOut, Number(cells[5]) || 0);
      processRows.set(currentPid, p);
    }
    return;
  }
  if (currentPid === null) return;
  const key = `${currentPid}|${conn[1]} ${conn[2]}<->${conn[3]}`;
  const flow = flows.get(key) ?? {pid: currentPid, process: currentName, protocol: conn[1], local: conn[2], remote: conn[3], interface: cells[2] || null, states: [], first: t, last: t, bytesIn: 0, bytesOut: 0, samples: 0};
  flow.last = t; flow.samples++;
  if (cells[3] && !flow.states.includes(cells[3])) flow.states.push(cells[3]);
  flow.bytesIn = Math.max(flow.bytesIn, Number(cells[4]) || 0); flow.bytesOut = Math.max(flow.bytesOut, Number(cells[5]) || 0);
  flows.set(key, flow);
});

// lsof: the tree's internet and Unix sockets, and its files under state/codex (names only).
function lsof() {
  if (!tree.size) return;
  lsofRuns++;
  let out = '';
  try { out = execFileSync('lsof', ['-nP', '-p', [...tree.keys()].join(',')], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}); }
  catch (e) { out = e.stdout ?? ''; }
  // Every Unix socket's owner, so a tree socket's peer (`->0x<address>`) is named: another tree process, or the process
  // at the other end (the extension host's socket, say).
  let all = '';
  try { all = execFileSync('lsof', ['-nP', '-U'], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}); } catch (e) { all = e.stdout ?? ''; }
  const owners = new Map();
  for (const line of all.split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length >= 8 && cols[4] === 'unix') owners.set(cols[5], {pid: +cols[1], command: cols[0], name: cols.slice(7).join(' ')});
  }
  const t = now();
  for (const line of out.split('\n').slice(1)) {
    // COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME; a unix socket's row has no NODE column.
    const cols = line.trim().split(/\s+/);
    if (cols.length < 8) continue;
    const pid = +cols[1], type = cols[4], name = cols.slice(type === 'unix' ? 7 : 8).join(' ');
    const kind = /^IPv[46]$/.test(type) ? 'inet' : type === 'unix' ? 'unix' : name.includes('/state/codex') ? 'codex-state' : null;
    if (!kind) continue;
    const key = `${pid}|${type}|${name}`;
    const entry = lsofEntries.get(key) ?? {pid, command: cols[0], kind, type, fd: cols[3], name, first: t, last: t};
    if (kind === 'unix' && !entry.peer && name.startsWith('->')) {
      const owner = owners.get(name.slice(2));
      if (owner) entry.peer = {pid: owner.pid, command: owner.command, name: owner.name};
    }
    entry.last = t; lsofEntries.set(key, entry);
  }
}

const psTimer = setInterval(() => { try { follow(); } catch {} }, 250);
const lsofTimer = setInterval(lsof, 1000);
process.stdin.resume();
process.stdin.on('end', () => {
  clearInterval(psTimer); clearInterval(lsofTimer);
  try { follow(); } catch {}
  lsof();
  setTimeout(() => {
    nettop.kill('SIGTERM');
    const table = psTable(), alive = new Set(table.map(r => r.pid));
    const inTree = pid => tree.has(pid);
    // The processes outside the tree at the other end of a tree socket: pid, parent, executable and arguments.
    const peers = {};
    for (const entry of lsofEntries.values()) {
      const pid = entry.peer?.pid;
      if (!inTree(entry.pid) || pid === undefined || inTree(pid) || peers[pid]) continue;
      const row = table.find(r => r.pid === pid);
      let args = '';
      try { args = execFileSync('ps', ['-o', 'args=', '-p', String(pid)], {encoding: 'utf8'}).trim().slice(0, 300); } catch {}
      const parent = table.find(r => r.pid === row?.ppid);
      peers[pid] = {pid, ppid: row?.ppid ?? null, parentExecutable: parent?.executable ?? null, executable: row?.executable ?? entry.peer.command, args};
    }
    process.stdout.write(JSON.stringify({
      started, finished: now(), root,
      commands: {ps: 'ps -A -o pid=,ppid=,comm= (every 250 ms)', nettop: 'nettop -L 0 -s 1 -n -x (continuous, rows of tree processes kept)', lsof: 'lsof -nP -p <tree pids> (every 1 s; inet, unix and state/codex entries kept)'},
      counts: {psRuns, nettopRows, lsofRuns},
      tree: [...tree.values()],
      nettopProcesses: [...processRows].filter(([pid]) => inTree(pid)).map(([pid, p]) => ({pid, ...p})),
      connections: [...flows.values()].filter(f => inTree(f.pid)),
      lsof: [...lsofEntries.values()].filter(e => inTree(e.pid)),
      peers: Object.values(peers),
      aliveAtEnd: [...tree.keys()].filter(pid => alive.has(pid)),
    }) + '\n');
    process.exit(0);
  }, 1500);
});
