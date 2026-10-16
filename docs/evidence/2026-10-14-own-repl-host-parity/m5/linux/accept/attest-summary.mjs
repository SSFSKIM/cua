// M5 task 6 copy of ../../../m4/accept/attest-summary.mjs, judging ./attest-serve.mjs records. Added for the managed Node:
// each session must also carry exactly one `supervisor` record, and the Node that ran the supervisor must be the one
// launch predicted, at least 24, inside the prepared scratch home's `node/` subtree (the cua-installed Node of a fresh
// `cua install`), named by the fourth argument. On that home itself CUA_NODE must be unset (the own host found the
// managed Node by itself); on the H4 home, which has no managed Node, CUA_NODE names it.
// The M4 header follows.
// > M4 task 3: an unchanged copy of ../../m3/maws/attest-summary.mjs, judging ./attest-serve.mjs records.
// M3 task 4 copy of ../../m2/maws/attest-summary.mjs, extended: every session must also carry exactly one source
// record naming the expected commit, a clean tree and a resolved own-host Node and runtime release.
// Judges an attest-serve.mjs record: every `cua serve` session the MAWS probe ran answered initialize as cua's own host
// (`serverInfo` {name: 'cua-repl-host', version}) and every js/js_reset answer carried the own-host marker
// {host: 'cua', version} with that version; at least one real js answer per session. Prints the summary as JSON, exit 0
// only when it holds.
//   node attest-summary.mjs <attest.jsonl> <expected version> <expected commit>
import {readFileSync} from 'node:fs';

const [file, version, commit, managedHome] = process.argv.slice(2);
if (!file || !version || !commit || !managedHome) throw new Error('usage: attest-summary.mjs <attest.jsonl> <version> <commit> <managed home>');
const rows = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const sessions = [...new Set(rows.map(r => r.session))].sort((a, b) => a - b).map(session => {
  const mine = rows.filter(r => r.session === session);
  const initialize = mine.filter(r => r.kind === 'initialize').map(r => r.serverInfo);
  const host = mine.filter(r => r.kind === 'result' && ['js', 'js_reset'].includes(r.tool));
  const local = mine.filter(r => r.kind === 'result' && !['js', 'js_reset'].includes(r.tool)).map(r => r.tool);
  const markers = [...new Set(host.map(r => JSON.stringify(r.replHost)))];
  const sources = mine.filter(r => r.kind === 'source').map(r => r.facts);
  const source = sources.length === 1 ? sources[0] : null;
  const sourceOk = source !== null && source.commit === commit && source.dirty === false && typeof source.release === 'string'
    && typeof source.ownNode?.path === 'string' && /^v(\d+)\./.test(source.ownNode?.version ?? '') && Number(source.ownNode.version.slice(1).split('.')[0]) >= 24;
  const supervisors = mine.filter(r => r.kind === 'supervisor');
  const answering = supervisors.length === 1 ? supervisors[0].node : null;
  const managedOk = sourceOk && (source.home !== managedHome || source.cuaNodeSet === false) && answering !== null && answering.path === source.ownNode.path
    && answering.version === source.ownNode.version && answering.path.startsWith(`${managedHome}/node/`);
  const ok = sourceOk && managedOk && initialize.length > 0 && initialize.every(s => s?.name === 'cua-repl-host' && s?.version === version)
    && host.some(r => r.tool === 'js') && host.every(r => r.replHost?.host === 'cua' && r.replHost?.version === version);
  return {session, pid: mine[0].pid, source, answeringNode: answering, managedOk, initialize, hostResults: host.length, markers: markers.map(m => JSON.parse(m)), proxyLocalTools: local, ok};
});
const summary = {version, commit, sessions, ok: sessions.length > 0 && sessions.every(s => s.ok)};
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.ok ? 0 : 1;
