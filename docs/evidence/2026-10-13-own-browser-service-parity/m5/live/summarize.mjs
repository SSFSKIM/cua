#!/usr/bin/env node
// Condenses one live/session.mjs --network run directory into its readable verdict:
//   node m5/live/summarize.mjs <run dir>
// writes <run dir>/summary.txt (the process tree; every TCP/UDP connection and nettop process row of the tree; every
// Unix-socket peer outside the tree; the tree's open files under state/codex; the state/codex listing's changes and
// the browser/ verdict) and <run dir>/codex-diff.json (the changed entries and the browser/ digests), replacing the
// two full listings, which are removed.
import {readFileSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const dir = process.argv[2];
const read = name => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const meta = read('meta.json'), net = read('network-raw.json');
const lines = [];
const say = (text = '') => lines.push(text);
const tree = new Map(net.tree.map(p => [p.pid, p]));
const label = pid => { const p = tree.get(pid); return p ? `${pid} ${p.executable.split('/').pop()}` : String(pid); };
const role = p => !p ? 'unknown' : /bin\/cua\.mjs serve/.test(p.args) ? 'cua serve' : /anchor\.mjs/.test(p.args) ? 'anchor (src/mcp/anchor.mjs)'
  : /cua-repl\.mjs/.test(p.args) ? 'runtime (vendor cua-repl)' : /node_repl$/.test(p.args) ? 'node_repl supervisor'
  : /codex sandbox/.test(p.args) ? 'codex sandbox (seatbelt wrapper)' : /kernel\.js/.test(p.args) ? 'REPL kernel'
  : /trusted-worker\.js/.test(p.args) ? 'trusted worker (browser service)' : /app-server/.test(p.args) ? 'codex app-server' : p.executable.split('/').pop();

say(`Live network and disk observation, ${meta.started} to ${meta.finished} (UTC), mini parity clone at ${meta.commit}, profile ${meta.profile}.`);
say(`Selection: CUA_BROWSER_SERVICE removed; the launch resolved ${meta.resolution.service} (${meta.resolution.reason}, home route ${meta.resolution.route}); attested by the documentation marker "${meta.attestation.marker}".`);
say(`Cases (${meta.cases.length}, one serve): ${meta.cases.join(', ')}.`);
say(`Serve exit ${JSON.stringify(meta.serveExit)}; tree processes alive at the end: ${net.aliveAtEnd.length ? net.aliveAtEnd.join(', ') : 'none'}.`);
say(`Sampling: ${net.commands.ps}; ${net.commands.nettop}; ${net.commands.lsof} (runs: ps ${net.counts.psRuns}, nettop rows read ${net.counts.nettopRows}${net.counts.nettopSamples !== undefined ? ` in ${net.counts.nettopSamples} samples` : ''}, lsof ${net.counts.lsofRuns}).`);
if (net.coverage) {
  const n = net.coverage.nettop;
  say(`Coverage: ${net.coverage.ok ? 'held' : 'LOST: ' + net.coverage.problems.join('; ')} (nettop ready ${n.readyAt}, before the serve's pid at ${net.rootAt}; ${n.samples} samples, longest silence ${n.maxSilenceMs} ms, ${n.exit ? 'exited early ' + JSON.stringify(n.exit) : 'running until stopped'}).`);
} else say('Coverage: not recorded (this run predates the sampler\'s coverage checks; see the README\'s qualification).');
say();
say('Process tree (pid, parent, role):');
for (const p of net.tree) say(`  ${p.pid}  parent ${p.ppid}  ${role(p)}`);
const appServer = net.tree.filter(p => /app-server/.test(p.args));
say(`  codex app-server processes in the tree: ${appServer.length ? appServer.map(p => p.pid).join(', ') : 'none'}.`);
say();
say(`TCP/UDP connections of the tree (nettop rows): ${net.connections.length}`);
for (const c of net.connections) say(`  ${label(c.pid)} (parent ${tree.get(c.pid)?.ppid}): ${c.protocol} ${c.local} -> ${c.remote} on ${c.interface}, ${c.states.join('/')}, ${c.first} to ${c.last}, bytes in ${c.bytesIn} out ${c.bytesOut}`);
say(`Tree processes nettop listed at all (any TCP/UDP activity, brief flows included in their byte totals): ${net.nettopProcesses.length}`);
for (const p of net.nettopProcesses) say(`  ${label(p.pid)}: bytes in ${p.bytesIn} out ${p.bytesOut}, ${p.first} to ${p.last}`);
if (net.unresolved) {
  say(`Processes nettop listed during the session whose ancestry could not be read to launchd or a known outside process (possibly the tree's): ${net.unresolved.length}`);
  for (const u of net.unresolved) {
    say(`  ${u.pid} ${u.process}${u.reason ? ` (${u.reason})` : ''}: bytes in ${u.bytesIn ?? '?'} out ${u.bytesOut ?? '?'}, first ${u.first}`);
    for (const c of u.connections ?? []) say(`    ${c.protocol} ${c.local} -> ${c.remote} on ${c.interface}, ${c.states.join('/')}, bytes in ${c.bytesIn} out ${c.bytesOut}`);
  }
} else say('Processes nettop listed whose ancestry could not be read: not recorded (this run predates that check; a descendant born and gone between two 250 ms ps snapshots would not have been attributed).');
const inet = net.lsof.filter(e => e.kind === 'inet');
say(`Internet sockets of the tree seen by lsof: ${inet.length}`);
for (const e of inet) say(`  ${label(e.pid)}: ${e.type} ${e.name}`);
say();
const unix = net.lsof.filter(e => e.kind === 'unix');
const outside = unix.filter(e => e.peer && !tree.has(e.peer.pid));
const unmatched = unix.filter(e => !e.peer);
say(`Unix sockets of the tree: ${unix.length} (${unix.length - outside.length - unmatched.length} between tree processes, ${outside.length} to a process outside the tree, ${unmatched.length} with no peer named)`);
for (const e of outside) {
  const peer = net.peers.find(p => p.pid === e.peer.pid);
  say(`  ${label(e.pid)} -> ${e.peer.pid} ${peer ? `${peer.args.replace(/^\S+\/node /, 'node ')} (parent ${peer.ppid}${peer.parentExecutable ? ' ' + peer.parentExecutable.split('/').pop() : ''})` : e.peer.command}`);
}
for (const e of unmatched) say(`  ${label(e.pid)}: ${e.name} (no peer named)`);
say();
const codexOpen = net.lsof.filter(e => e.kind === 'codex-state');
say(`Files under state/codex the tree held open: ${codexOpen.length}`);
for (const e of codexOpen) say(`  ${label(e.pid)} (${role(tree.get(e.pid))}): ${e.name.replace(/^.*\/state\/codex\//, 'state/codex/')}`);

let diff;
if (existsSync(join(dir, 'codex-before.json'))) {
  const before = read('codex-before.json'), after = read('codex-after.json');
  const B = new Map(before.entries.map(e => [e[0], e])), A = new Map(after.entries.map(e => [e[0], e]));
  const changes = [...new Set([...B.keys(), ...A.keys()])].sort().filter(k => JSON.stringify(B.get(k)) !== JSON.stringify(A.get(k)))
    .map(k => ({path: k, before: B.get(k) ?? null, after: A.get(k) ?? null}));
  const digest = listing => createHash('sha256').update(JSON.stringify([listing.entries.filter(e => e[0] === 'browser' || e[0].startsWith('browser/')), Object.entries(listing.browser).sort()])).digest('hex');
  diff = {before: {at: before.at, entries: before.entries.length, browserFiles: Object.keys(before.browser).length, browserDigest: digest(before)},
    after: {at: after.at, entries: after.entries.length, browserFiles: Object.keys(after.browser).length, browserDigest: digest(after)}, changes};
  writeFileSync(join(dir, 'codex-diff.json'), JSON.stringify(diff, null, 2) + '\n');
  rmSync(join(dir, 'codex-before.json')); rmSync(join(dir, 'codex-after.json'));
} else diff = read('codex-diff.json');
say();
say(`$CUA_HOME/state/codex: ${diff.before.entries} entries before (${diff.before.at}), ${diff.after.entries} after (${diff.after.at}).`);
const browserChanged = diff.changes.filter(c => c.path === 'browser' || c.path.startsWith('browser/'));
say(`browser/ (the vendor's persisted grants): ${diff.before.browserFiles} files before and ${diff.after.browserFiles} after; listing and content digest ${diff.before.browserDigest === diff.after.browserDigest ? 'unchanged' : 'CHANGED'} (${diff.after.browserDigest.slice(0, 16)}); changed entries: ${browserChanged.length}.`);
say(`Every changed entry (path: before -> after as [type, size, mtime ms]):`);
for (const c of diff.changes) say(`  ${c.path}: ${c.before ? JSON.stringify(c.before.slice(1)) : 'absent'} -> ${c.after ? JSON.stringify(c.after.slice(1)) : 'absent'}`);
writeFileSync(join(dir, 'summary.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
