// M5 copy of ../../../m3/maws/attest-summary.mjs, adapted only for M5's managed-Node and scratch-home rules; it judges
// the records of this directory's attest-serve.mjs. Every M3 requirement stays: each `cua serve` session the MAWS probe
// ran answered initialize as `cua-repl-host` <version>, every js/js_reset answer carried {host: 'cua', version}, at least
// one real js answer, and exactly one source record naming <commit> with a clean tree, a runtime release and a Node 24 or
// later. M5 adds, per session:
// - the source record names <home> as the session's CUA_HOME, with CUA_NODE unset;
// - exactly one answering witness: the supervisor that actually answered runs the Node the source record resolved, that
//   Node reports v24 and lies under <home>/node/ (checked on the device by real path and here by prefix).
// And, once per run, MAWS's Electron quit cleanly: spawned once, sent SIGTERM and never SIGKILL, exited with code 0 and
// no signal. Prints the summary as JSON; exit 0 only when everything holds.
//   node attest-summary.mjs <attest.jsonl> <expected version> <expected commit> <expected CUA_HOME>
import {readFileSync} from 'node:fs';

const [file, version, commit, home] = process.argv.slice(2);
if (!file || !version || !commit || !home) throw new Error('usage: attest-summary.mjs <attest.jsonl> <version> <commit> <CUA_HOME>');
const rows = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const major = v => /^v(\d+)\./.exec(v ?? '')?.[1];
const managedRoot = `${home.replace(/\/+$/, '')}/node/`;
const serveRows = rows.filter(r => r.kind !== 'maws');
const sessions = [...new Set(serveRows.map(r => r.session))].sort((a, b) => a - b).map(session => {
  const mine = serveRows.filter(r => r.session === session);
  const initialize = mine.filter(r => r.kind === 'initialize').map(r => r.serverInfo);
  const host = mine.filter(r => r.kind === 'result' && ['js', 'js_reset'].includes(r.tool));
  const local = mine.filter(r => r.kind === 'result' && !['js', 'js_reset'].includes(r.tool)).map(r => r.tool);
  const markers = [...new Set(host.map(r => JSON.stringify(r.replHost)))];
  const sources = mine.filter(r => r.kind === 'source').map(r => r.facts);
  const source = sources.length === 1 ? sources[0] : null;
  const witnesses = mine.filter(r => r.kind === 'answering').map(r => r.witness);
  const witness = witnesses.length === 1 ? witnesses[0] : null;
  const sourceOk = source !== null && source.commit === commit && source.dirty === false && typeof source.release === 'string'
    && typeof source.ownNode?.path === 'string' && Number(major(source.ownNode?.version)) >= 24
    && source.home === home && source.cuaNodeSet === false;
  const managedNodeOk = witness !== null && typeof witness.pid === 'number' && witness.path === source?.ownNode?.path
    && witness.version === source?.ownNode?.version && major(witness.version) === '24'
    && witness.underHomeNode === true && witness.path.startsWith(managedRoot);
  const ok = sourceOk && managedNodeOk && initialize.length > 0 && initialize.every(s => s?.name === 'cua-repl-host' && s?.version === version)
    && host.some(r => r.tool === 'js') && host.every(r => r.replHost?.host === 'cua' && r.replHost?.version === version);
  return {session, pid: mine[0].pid, source, answering: witness, initialize, hostResults: host.length, markers: markers.map(m => JSON.parse(m)), proxyLocalTools: local, sourceOk, managedNodeOk, ok};
});
const maws = rows.filter(r => r.kind === 'maws');
const spawns = maws.filter(r => r.event === 'spawn');
const signals = maws.filter(r => r.event === 'signal').map(r => r.signal);
const exits = maws.filter(r => r.event === 'exit');
const mawsQuit = {spawns: spawns.length, signals, exit: exits[0] ?? null,
  ok: spawns.length === 1 && exits.length === 1 && signals.includes('SIGTERM') && !signals.includes('SIGKILL') && exits[0].code === 0 && exits[0].signal === null};
const attestationOk = sessions.length > 0 && sessions.every(s => s.ok);
const summary = {version, commit, home, sessions, attestationOk, mawsQuit, ok: attestationOk && mawsQuit.ok};
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.ok ? 0 : 1;
