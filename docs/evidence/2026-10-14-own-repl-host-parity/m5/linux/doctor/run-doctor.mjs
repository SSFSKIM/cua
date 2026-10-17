// M5 task 6: runs `cua doctor --json` on cua-linux in the prepared session environment (the repl-parity preparation's
// fresh `cua install` scratch home and private HOME, CUA_NODE unset, inside the X session), for each CUA_REPL_HOST
// override (unset, cua, vendor, invalid). A copy of ../../mini/doctor/run-doctor.mjs adapted to Linux: the X session
// environment comes from scripts/repl-parity/topology.mjs linuxSession, and the surfaces vary, because on Linux the
// computer surface also selects cua's host (reason `linux`): computer alone, browser alone and computer,browser, each
// browser surface with CUA_BROWSER_SERVICE as production serve sets it (cua) and unset (route from the scratch home's
// registration). Keeps only the repl.host row and ok.
//   node run-doctor.mjs <.doperpowers/sde/repl-parity/cua-linux.json>
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {linuxSession, quote as q, remoteCommand} from '../../../../../../scripts/repl-parity/topology.mjs';

const [journal] = process.argv.slice(2);
const p = JSON.parse(readFileSync(journal, 'utf8'));
if (p.device !== 'cua-linux' || p.nodeMode !== 'managed' || p.nodeOverride) throw new Error('needs the managed cua-linux preparation');
// The prepared environment without the harness's own node-mode marker and without the X-session keys, which
// linuxSession exports from the live session.
const SESSION = ['DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR', 'XDG_DATA_DIRS'];
const base = Object.entries(p.environment).filter(([k]) => k !== 'CUA_PARITY_NODE_MODE' && !SESSION.includes(k)).map(([k, v]) => `${k}=${q(v)}`).join(' ');
const rows = [];
for (const surfaces of ['computer', 'browser', 'computer,browser'])
  for (const service of surfaces.includes('browser') ? ['cua', 'unset'] : ['unset'])
    for (const override of ['unset', 'cua', 'vendor', 'invalid']) {
      const extra = [...(service === 'cua' ? ['CUA_BROWSER_SERVICE=cua'] : []), ...(override === 'unset' ? [] : [`CUA_REPL_HOST=${override === 'invalid' ? 'bogus' : override}`])].join(' ');
      const session = SESSION.map(k => `${k}="$${k}"`).join(' ');
      const script = `${linuxSession}\ncd ${q(p.checkout)} && env -i ${base} ${session} CUA_SHIM_SURFACES=${surfaces} CUA_SHIM_SECRETS=off ${extra} node bin/cua.mjs doctor --json`;
      const {command, args} = remoteCommand('cua-linux', script);
      let stdout = '';
      try { stdout = execFileSync(command, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000}); }
      catch (e) { stdout = e.stdout ?? ''; }
      const report = JSON.parse(stdout);
      const checks = report.checks ?? report.rows ?? [];
      const row = (Array.isArray(checks) ? checks : Object.entries(checks).map(([id, v]) => ({id, ...v}))).find(c => (c.id ?? c.name ?? c.key) === 'repl.host');
      rows.push({surfaces, browserService: service, override, ok: report.ok, replHost: row ?? null});
    }
console.log(JSON.stringify({commit: p.commit, home: p.home, ownNodeAtPrepare: p.ownNode, rows}, null, 2));
