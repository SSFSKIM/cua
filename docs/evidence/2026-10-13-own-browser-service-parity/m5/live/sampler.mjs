// The M5 live network observation's sampler (spec docs/doperpowers/specs/2026-10-13-own-browser-service-design.md,
// "Network and disk proof", acceptance 7). Runs on the mini beside one `cua serve` started by live/session.mjs, until
// its stdin ends:
//   node sampler.mjs <serve pid file>
// The serve process tree is the serve pid and every process whose ancestry reaches it, kept once seen even if later
// re-parented. Membership is learned two ways: `ps` every 250 ms, and, for every process nettop reports, its ancestry
// read at that moment, through the last ps row any table had for an exited one (so a descendant born after the last
// ps snapshot that does network I/O is still attributed). A process nettop reports that no ps table ever listed (born
// and gone between two snapshots, before nettop's row for it was read) is listed as unresolved, with its name and
// bytes: the one blind spot left, disclosed rather than dropped. One continuous `nettop -L 0 -s 1 -n -x` (logging mode, CSV, one
// sample a second, every process, no name resolution) supplies connection rows with endpoints and process rows, whose
// byte totals include flows too brief for a connection row; every second `lsof` lists the tree's sockets (a Unix
// socket's peer named from a machine-wide `lsof -U`) and its files under state/codex. Coverage is checked, not assumed:
// nettop must print its first sample before the serve pid is known, never exit or fall silent before the end, and
// ps and lsof must not fail; any lapse is a coverage problem and the observation does not count.
// It prints `{"ready": true}` on stdout once nettop's first sample arrives (start the serve after it), then, at the
// end, one JSON summary: coverage, the tree, the tree's connections and nettop process rows, the
// unresolved processes, the lsof entries and outside peers, and the tree processes still alive at the end.
// Test seams (live/observation.test.mjs): SAMPLER_NETTOP (a JSON argv replacing nettop's), SAMPLER_LSOF=off,
// SAMPLER_PS_MS (the ps period).
import {spawn, execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {existsSync, readFileSync} from 'node:fs';

const [pidFile] = process.argv.slice(2);
// nettop block-buffers into a pipe (lines arrived in bursts about 4 s apart on the mini), so it runs under `script`'s
// pseudo-terminal, which makes it print each sample as it is taken.
const NETTOP = process.env.SAMPLER_NETTOP ? JSON.parse(process.env.SAMPLER_NETTOP) : ['script', '-q', '/dev/null', 'nettop', '-L', '0', '-s', '1', '-n', '-x'];
const LSOF = process.env.SAMPLER_LSOF !== 'off';
const PS_MS = Number(process.env.SAMPLER_PS_MS) || 250;
const SILENCE_MS = 5000;           // nettop prints a header every second; a longer silence is lost coverage
const started = new Date().toISOString();
const tree = new Map();            // pid -> {pid, ppid, executable, args, first, last, via}
let root = null, rootAt = null, nettopRows = 0, nettopSamples = 0, lsofRuns = 0, psRuns = 0;
const flows = new Map();           // `${pid}|${endpoints}` -> flow
const processRows = new Map();     // pid -> nettop process row totals, every process (filtered at the end)
const seen = new Map();            // pid -> its ps row, for every process any ps table listed (the ancestry of the departed)
const outside = new Set();         // pids whose ancestry was read and does not reach the root
const unresolved = new Map();      // pid -> {pid, process, first}: reported by nettop after the root was known, ancestry unreadable
const lsofEntries = new Map();     // `${pid}|${type}|${name}` -> entry
const problems = [];
const problem = text => { if (!problems.includes(text)) problems.push(text); };
const nettopState = {ready: false, readyAt: null, lastOutput: null, exit: null, stderr: '', maxSilenceMs: 0};

const now = () => new Date().toISOString();
function psTable() {
  psRuns++;
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,comm='], {encoding: 'utf8'}).split('\n').map(line => line.trim()).filter(Boolean)
    .map(line => { const m = line.match(/^(\d+)\s+(\d+)\s+(.*)$/); return m && {pid: +m[1], ppid: +m[2], executable: m[3]}; }).filter(Boolean);
  for (const row of rows) seen.set(row.pid, row);
  return rows;
}
const argsOf = pid => { try { return execFileSync('ps', ['-o', 'args=', '-p', String(pid)], {encoding: 'utf8'}).trim().slice(0, 300); } catch { return ''; } };
function readRoot() {
  if (root !== null || !existsSync(pidFile)) return;
  const value = Number(readFileSync(pidFile, 'utf8').trim());
  if (!Number.isInteger(value) || value <= 0) return;
  root = value; rootAt = now();
  if (!nettopState.ready) problem('nettop had not printed its first sample when the serve started');
}
function admit(row, t, via) {
  tree.set(row.pid, {pid: row.pid, ppid: row.ppid, executable: row.executable, args: argsOf(row.pid), first: t, last: t, via});
}
function follow() {
  readRoot();
  const rows = psTable(), t = now();
  if (root === null) return;
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of rows) {
      const known = tree.get(row.pid);
      if (known) { known.last = t; continue; }
      if (row.pid === root || tree.has(row.ppid)) { admit(row, t, 'ps'); grew = true; }
    }
  }
}
let tableCache = null;
// A process nettop reports: in the tree already, known outside, or resolved now through its live ancestry.
function classify(pid, name, t) {
  readRoot();
  if (root === null || tree.has(pid) || outside.has(pid) || unresolved.has(pid)) return;
  let table;
  try {
    // One ps table serves a burst of new processes (each sample lists many); a pid missing from it gets a fresh one.
    if (!tableCache || Date.now() - tableCache.at > 200 || !tableCache.map.has(pid)) tableCache = {at: Date.now(), map: new Map(psTable().map(r => [r.pid, r]))};
    table = tableCache.map;
  } catch { problem('ps failed while resolving a nettop process'); return; }
  // A process that already exited is traced through the last ps row any table had for it.
  const lookup = p => table.get(p) ?? seen.get(p);
  const chain = [];
  for (let at = lookup(pid); at; at = lookup(at.ppid)) {
    chain.push(at);
    if (at.pid === root || tree.has(at.pid)) {
      for (const row of chain.reverse()) if (!tree.has(row.pid)) admit(row, t, table.has(row.pid) ? 'nettop' : 'nettop, exited');
      return;
    }
    if (at.ppid <= 1 || at.ppid === at.pid || chain.length > 64) break;
  }
  if (chain.length) outside.add(pid); else unresolved.set(pid, {pid, process: name, first: t});
}

// nettop CSV: a header `time,...` starts each sample; a process row `time,<name>.<pid>,...` precedes that process's
// connection rows `time,<proto> <local><-><remote>,<interface>,<state>,<bytes_in>,<bytes_out>,...`.
let currentPid = null, currentName = null, stopping = false;
// stdin must not be a pipe or socket (script refuses one: tcgetattr); at /dev/null script relays one EOF (^D) to the
// terminal, which nettop ignores, and the non-CSV line it echoes is skipped.
const nettop = spawn(NETTOP[0], NETTOP.slice(1), {stdio: ['ignore', 'pipe', 'pipe']});
nettop.on('error', e => { nettopState.exit = {error: e.message, at: now()}; problem(`nettop could not run: ${e.message}`); });
nettop.on('exit', (code, signal) => { if (!stopping) { nettopState.exit = {code, signal, at: now()}; problem(`nettop exited before the end (${code ?? signal})`); } });
nettop.stderr.on('data', d => { nettopState.stderr = (nettopState.stderr + d).slice(-2000); });
createInterface({input: nettop.stdout}).on('line', raw => {
  const line = raw.replace(/\r$/, '');
  const t = now(), ms = Date.now();
  if (nettopState.lastOutput !== null) nettopState.maxSilenceMs = Math.max(nettopState.maxSilenceMs, ms - nettopState.lastOutput);
  nettopState.lastOutput = ms;
  nettopRows++;
  const cells = line.split(',');
  if (cells[0] === 'time') {
    nettopSamples++;
    if (!nettopState.ready) { nettopState.ready = true; nettopState.readyAt = t; process.stdout.write(JSON.stringify({ready: true, at: t}) + '\n'); }
    return;
  }
  const label = cells[1] ?? '';
  const conn = label.match(/^(tcp4|tcp6|udp4|udp6)\s+(.+?)<->(.+)$/);
  if (!conn) {
    const m = label.match(/^(.*)\.(\d+)$/);
    currentPid = m ? +m[2] : null; currentName = m ? m[1] : null;
    if (currentPid !== null) {
      const p = processRows.get(currentPid) ?? {name: currentName, first: t, last: t, samples: 0, bytesIn: 0, bytesOut: 0};
      p.last = t; p.samples++;
      p.bytesIn = Math.max(p.bytesIn, Number(cells[4]) || 0); p.bytesOut = Math.max(p.bytesOut, Number(cells[5]) || 0);
      processRows.set(currentPid, p);
      classify(currentPid, currentName, t);
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
  if (!LSOF || !tree.size) return;
  lsofRuns++;
  const run = args => {
    try { return execFileSync('lsof', args, {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}); }
    catch (e) { if (e.status === 1 && typeof e.stdout === 'string') return e.stdout; problem(`lsof failed: ${e.message.split('\n')[0]}`); return ''; }
  };
  const out = run(['-nP', '-p', [...tree.keys()].join(',')]);
  // Every Unix socket's holders, so a tree socket's peer (`->0x<address>`) is named: another tree process, or the
  // process at the other end (the extension host's socket, say). A socket inherited by several processes (a parent's
  // stdio passed on to a child) has several holders; a tree holder is preferred, since a short-lived child holding the
  // tree's own stdio is not an outside peer.
  const all = run(['-nP', '-U']);
  const owners = new Map();
  for (const line of all.split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length >= 8 && cols[4] === 'unix') {
      const holders = owners.get(cols[5]) ?? [];
      holders.push({pid: +cols[1], command: cols[0], name: cols.slice(7).join(' ')});
      owners.set(cols[5], holders);
    }
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
    if (kind === 'unix' && name.startsWith('->') && !(entry.peer && tree.has(entry.peer.pid))) {
      const holders = owners.get(name.slice(2)) ?? [];
      const owner = holders.find(h => tree.has(h.pid)) ?? holders[0];
      if (owner) entry.peer = {pid: owner.pid, command: owner.command, name: owner.name};
    }
    entry.last = t; lsofEntries.set(key, entry);
  }
}

const psTimer = setInterval(() => { try { follow(); } catch (e) { problem(`ps failed: ${e.message.split('\n')[0]}`); } }, PS_MS);
const lsofTimer = setInterval(lsof, 1000);
const watchdog = setInterval(() => {
  if (nettopState.lastOutput !== null && Date.now() - nettopState.lastOutput > SILENCE_MS) problem(`nettop fell silent for more than ${SILENCE_MS} ms`);
}, 1000);
process.stdin.resume();
process.stdin.on('end', () => {
  clearInterval(psTimer); clearInterval(lsofTimer); clearInterval(watchdog);
  try { follow(); } catch (e) { problem(`ps failed: ${e.message.split('\n')[0]}`); }
  lsof();
  setTimeout(() => {
    // The final sample must have arrived recently and the collector must still be running.
    if (!nettopState.ready) problem('nettop never printed a sample');
    else if (Date.now() - nettopState.lastOutput > SILENCE_MS) problem(`nettop fell silent for more than ${SILENCE_MS} ms`);
    if (nettopState.exit) problem(`nettop exited before the end (${nettopState.exit.code ?? nettopState.exit.signal ?? nettopState.exit.error})`);
    if (root === null) problem('the serve pid never appeared');
    stopping = true;
    nettop.kill('SIGTERM');
    let table = [];
    try { table = psTable(); } catch (e) { problem(`ps failed: ${e.message.split('\n')[0]}`); }
    const alive = new Set(table.map(r => r.pid));
    const inTree = pid => tree.has(pid);
    // The processes outside the tree at the other end of a tree socket: pid, parent, executable and arguments.
    const peers = {};
    for (const entry of lsofEntries.values()) {
      const pid = entry.peer?.pid;
      if (!inTree(entry.pid) || pid === undefined || inTree(pid) || peers[pid]) continue;
      const row = table.find(r => r.pid === pid);
      const parent = table.find(r => r.pid === row?.ppid);
      peers[pid] = {pid, ppid: row?.ppid ?? null, parentExecutable: parent?.executable ?? null, executable: row?.executable ?? entry.peer.command, args: argsOf(pid)};
    }
    process.stdout.write(JSON.stringify({
      started, finished: now(), root, rootAt,
      coverage: {ok: problems.length === 0, problems, nettop: {ready: nettopState.ready, readyAt: nettopState.readyAt, samples: nettopSamples, maxSilenceMs: nettopState.maxSilenceMs, exit: nettopState.exit, stderr: nettopState.stderr || null}},
      commands: {ps: `ps -A -o pid=,ppid=,comm= (every ${PS_MS} ms, and at each new process nettop reports)`, nettop: `${NETTOP.join(' ')} (continuous, rows of tree processes kept)`, lsof: LSOF ? 'lsof -nP -p <tree pids> (every 1 s; inet, unix and state/codex entries kept)' : 'off'},
      counts: {psRuns, nettopRows, nettopSamples, lsofRuns},
      tree: [...tree.values()],
      nettopProcesses: [...processRows].filter(([pid]) => inTree(pid)).map(([pid, p]) => ({pid, ...p})),
      connections: [...flows.values()].filter(f => inTree(f.pid)),
      unresolved: [...unresolved.values()].map(u => ({...u, ...(processRows.get(u.pid) ? {bytesIn: processRows.get(u.pid).bytesIn, bytesOut: processRows.get(u.pid).bytesOut} : {})})),
      lsof: [...lsofEntries.values()].filter(e => inTree(e.pid)),
      peers: Object.values(peers),
      aliveAtEnd: [...tree.keys()].filter(pid => alive.has(pid)),
    }) + '\n');
    process.exit(0);
  }, 1500);
});
