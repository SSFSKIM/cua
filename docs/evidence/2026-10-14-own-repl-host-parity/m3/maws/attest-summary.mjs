// M3 task 4 copy of ../../m2/maws/attest-summary.mjs, extended: every session must also carry exactly one source
// record naming the expected commit, a clean tree and a resolved own-host Node and runtime release.
// Judges an attest-serve.mjs record: every `cua serve` session the MAWS probe ran answered initialize as cua's own host
// (`serverInfo` {name: 'cua-repl-host', version}) and every js/js_reset answer carried the own-host marker
// {host: 'cua', version} with that version; at least one real js answer per session. Prints the summary as JSON, exit 0
// only when it holds.
//   node attest-summary.mjs <attest.jsonl> <expected version> <expected commit>
import {readFileSync} from 'node:fs';

const [file, version, commit] = process.argv.slice(2);
if (!file || !version || !commit) throw new Error('usage: attest-summary.mjs <attest.jsonl> <version> <commit>');
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
  const ok = sourceOk && initialize.length > 0 && initialize.every(s => s?.name === 'cua-repl-host' && s?.version === version)
    && host.some(r => r.tool === 'js') && host.every(r => r.replHost?.host === 'cua' && r.replHost?.version === version);
  return {session, pid: mine[0].pid, source, initialize, hostResults: host.length, markers: markers.map(m => JSON.parse(m)), proxyLocalTools: local, ok};
});
const summary = {version, commit, sessions, ok: sessions.length > 0 && sessions.every(s => s.ok)};
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.ok ? 0 : 1;
