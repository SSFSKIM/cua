// Judges an attest-serve.mjs record: every `cua serve` session the MAWS probe ran answered initialize as cua's own host
// (`serverInfo` {name: 'cua-repl-host', version}) and every js/js_reset answer carried the own-host marker
// {host: 'cua', version} with that version; at least one real js answer per session. Prints the summary as JSON, exit 0
// only when it holds.
//   node attest-summary.mjs <attest.jsonl> <expected version>
import {readFileSync} from 'node:fs';

const [file, version] = process.argv.slice(2);
if (!file || !version) throw new Error('usage: attest-summary.mjs <attest.jsonl> <version>');
const rows = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const sessions = [...new Set(rows.map(r => r.session))].sort((a, b) => a - b).map(session => {
  const mine = rows.filter(r => r.session === session);
  const initialize = mine.filter(r => r.kind === 'initialize').map(r => r.serverInfo);
  const host = mine.filter(r => r.kind === 'result' && ['js', 'js_reset'].includes(r.tool));
  const local = mine.filter(r => r.kind === 'result' && !['js', 'js_reset'].includes(r.tool)).map(r => r.tool);
  const markers = [...new Set(host.map(r => JSON.stringify(r.replHost)))];
  const ok = initialize.length > 0 && initialize.every(s => s?.name === 'cua-repl-host' && s?.version === version)
    && host.some(r => r.tool === 'js') && host.every(r => r.replHost?.host === 'cua' && r.replHost?.version === version);
  return {session, pid: mine[0].pid, initialize, hostResults: host.length, markers: markers.map(m => JSON.parse(m)), proxyLocalTools: local, ok};
});
const summary = {version, sessions, ok: sessions.length > 0 && sessions.every(s => s.ok)};
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.ok ? 0 : 1;
