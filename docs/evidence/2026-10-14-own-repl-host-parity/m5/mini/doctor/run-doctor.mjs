// Runs `cua doctor --json` on the mini in the prepared session environment (the repl-parity preparation's scratch home,
// CUA_NODE unset), for each CUA_REPL_HOST override (unset, cua, vendor, invalid), with CUA_BROWSER_SERVICE as production
// serve sets it (cua) and unset (route from the scratch home's registration). Keeps only the repl.host row and ok.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const [journal] = process.argv.slice(2);
const p = JSON.parse(readFileSync(journal, 'utf8'));
const q = s => "'" + String(s).replaceAll("'", "'\\''") + "'";
const base = Object.entries(p.environment).filter(([k]) => k !== 'CUA_PARITY_NODE_MODE').map(([k, v]) => `${k}=${q(v)}`).join(' ');
const rows = [];
for (const service of ['cua', 'unset']) for (const override of ['unset', 'cua', 'vendor', 'invalid']) {
  const extra = [...(service === 'cua' ? ['CUA_BROWSER_SERVICE=cua'] : []), ...(override === 'unset' ? [] : [`CUA_REPL_HOST=${override === 'invalid' ? 'bogus' : override}`])].join(' ');
  const script = `cd ${q(p.checkout)} && env -i ${base} CUA_SHIM_SURFACES=browser CUA_SHIM_SECRETS=off ${extra} node bin/cua.mjs doctor --json; echo "exit=$?" >&2`;
  let stdout = '', stderr = '';
  try { stdout = execFileSync('ssh', ['-o', 'BatchMode=yes', 'mini', script], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000}); }
  catch (e) { stdout = e.stdout ?? ''; stderr = e.stderr ?? ''; }
  const report = JSON.parse(stdout);
  const checks = report.checks ?? report.rows ?? [];
  const row = (Array.isArray(checks) ? checks : Object.entries(checks).map(([id, v]) => ({id, ...v}))).find(c => (c.id ?? c.name ?? c.key) === 'repl.host');
  rows.push({browserService: service, override, ok: report.ok, replHost: row ?? null});
}
console.log(JSON.stringify({commit: p.commit, home: p.home, ownNodeAtPrepare: p.ownNode, rows}, null, 2));
