// #117 H0 (#175): reading the runner's TCC databases, and the one function that writes them.
//
// Writing is allowed by the owner on GitHub-hosted runners only, never on any Mac of the owner's: the Decision Log entry
// "2026-11-23, the owner: TCC rows may be written by kits on GitHub-hosted runners only, never on any of the owner's
// Macs (O0; ruling 1111)" in docs/doperpowers/specs/2026-10-18-own-native-engine-design.md (branch docs/117-progress,
// db775127). Every write (insert, delete, a tccd restart) goes through tccWrite, whose guard exits the process before
// anything is written unless RUNNER_ENVIRONMENT=github-hosted and that entry is present in the fetched spec.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {join} from 'node:path';

export const SYSTEM_DB = '/Library/Application Support/com.apple.TCC/TCC.db';
export const USER_DB = join(homedir(), 'Library/Application Support/com.apple.TCC/TCC.db');
export const SERVICES = Object.freeze({
  accessibility: 'kTCCServiceAccessibility',
  screenRecording: 'kTCCServiceScreenCapture',
  inputMonitoring: 'kTCCServiceListenEvent',
  postEvent: 'kTCCServicePostEvent',
});
const DECISION = '2026-11-23, the owner: TCC rows may be written by kits on GitHub-hosted runners only';
const SPEC = 'docs/doperpowers/specs/2026-10-18-own-native-engine-design.md';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000, ...opts});
const sql = (db, statement) => run('/usr/bin/sudo', ['-n', '/usr/bin/sqlite3', db, statement]);
const quote = value => `'${String(value).replace(/'/g, "''")}'`;

// The rows for the services the engines need, from both databases (read only).
export function readRows() {
  const out = {};
  for (const [name, db] of [['system', SYSTEM_DB], ['user', USER_DB]]) {
    try {
      const text = sql(db, `select service, client, client_type, auth_value, auth_reason, length(csreq) from access where service in (${Object.values(SERVICES).map(quote).join(',')}) order by service, client`);
      out[name] = text.trim().split('\n').filter(Boolean).map(line => {
        const [service, client, clientType, authValue, authReason, csreqBytes] = line.split('|');
        return {service, client, clientType: Number(clientType), authValue: Number(authValue), authReason: Number(authReason), csreqBytes: csreqBytes === '' ? null : Number(csreqBytes)};
      });
    } catch (error) { out[name] = {error: String(error.stderr || error.message).trim().slice(0, 300)}; }
  }
  return out;
}

// Step 6, read only: what protects the databases and whether this job looks able to write them. Nothing is written.
export function writability() {
  const facts = {};
  const tryRun = (key, cmd, args) => { try { facts[key] = run(cmd, args).trim(); } catch (error) { facts[key] = {error: String(error.stderr || error.message).trim().slice(0, 300), status: error.status ?? null}; } };
  tryRun('csrutil', '/usr/bin/csrutil', ['status']);
  tryRun('authenticatedRoot', '/usr/bin/csrutil', ['authenticated-root', 'status']);
  tryRun('systemDbFlags', '/bin/ls', ['-leO', SYSTEM_DB]);
  tryRun('userDbFlags', '/bin/ls', ['-leO', USER_DB]);
  tryRun('systemDirFlags', '/bin/ls', ['-ldeO', '/Library/Application Support/com.apple.TCC']);
  tryRun('sudo', '/usr/bin/sudo', ['-n', 'true']);
  for (const [name, db] of [['system', SYSTEM_DB], ['user', USER_DB]]) {
    // Who holds Full Disk Access (the TCC databases' own protection) and the schema a write would use.
    try { facts[`${name}AllFiles`] = sql(db, "select client, client_type, auth_value from access where service = 'kTCCServiceSystemPolicyAllFiles' order by client").trim().split('\n').filter(Boolean); }
    catch (error) { facts[`${name}AllFiles`] = {error: String(error.stderr || error.message).trim().slice(0, 300)}; }
    try { facts[`${name}Schema`] = sql(db, 'pragma table_info(access)').trim().split('\n'); }
    catch (error) { facts[`${name}Schema`] = {error: String(error.stderr || error.message).trim().slice(0, 300)}; }
    // A write attempt that cannot change anything: an immediate transaction rolled back. It tells whether the job can
    // take the database's write lock under the runner's grants. No row is inserted, updated or deleted.
    try { sql(db, 'begin immediate; rollback;'); facts[`${name}WriteLock`] = true; }
    catch (error) { facts[`${name}WriteLock`] = {error: String(error.stderr || error.message).trim().slice(0, 300)}; }
  }
  return facts;
}

// The guard: before any write, this job must be on a GitHub-hosted runner, and the owner's yes must be in the spec's
// Decision Log as fetched from docs/117-progress (or already merged). Anything else exits the process non-zero.
function guard() {
  if (process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || process.platform !== 'darwin') {
    process.stderr.write('probe-117-h0: refused: TCC rows are written only on a GitHub-hosted macOS runner (RUNNER_ENVIRONMENT=github-hosted; O0, ruling 1111)\n');
    process.exit(3);
  }
  let recorded = false;
  for (const ref of ['origin/docs/117-progress', 'HEAD']) {
    try { if (run('/usr/bin/git', ['show', `${ref}:${SPEC}`], {maxBuffer: 64 * 1024 * 1024}).includes(DECISION)) { recorded = true; break; } } catch {}
  }
  if (!recorded) {
    process.stderr.write(`probe-117-h0: refused: the owner's yes (O0) is not in ${SPEC}'s Decision Log on docs/117-progress or HEAD\n`);
    process.exit(3);
  }
}

// The one function that writes: a statement on one database, or a tccd restart. Guarded every call.
function tccWrite(action) {
  guard();
  if (action.kind === 'restart') return run('/usr/bin/sudo', ['-n', '/usr/bin/killall', 'tccd']);
  return sql(action.db, action.statement);
}

// The designated requirement of a signed bundle, compiled to the blob a row's csreq column holds, as hex.
export function csreqHex(bundle) {
  const shown = execFileSync('/bin/sh', ['-c', `/usr/bin/codesign -d -r- ${quoteShell(bundle)} 2>&1`], {encoding: 'utf8'});
  const requirement = /designated => (.*)$/m.exec(shown)?.[1];
  if (!requirement) throw new Error(`no designated requirement for ${bundle}`);
  const dir = mkdtempSync(join(tmpdir(), 'h0-csreq-'));
  try {
    execFileSync('/usr/bin/csreq', ['-r', `=${requirement}`, '-b', join(dir, 'req.bin')], {stdio: ['ignore', 'pipe', 'pipe']});
    return {requirement, hex: readFileSync(join(dir, 'req.bin')).toString('hex')};
  } finally { rmSync(dir, {recursive: true, force: true}); }
}
const quoteShell = value => `'${String(value).replace(/'/g, `'\\''`)}'`;

// Grants `services` (keys of SERVICES) to the bundle id `client` in `db` ('system' | 'user'), with its csreq.
export function grantRows({client, bundle, services, db = 'system'}) {
  const path = db === 'user' ? USER_DB : SYSTEM_DB;
  if (!existsSync(path)) throw new Error(`no TCC database at ${path}`);
  const {hex} = csreqHex(bundle);
  const now = Math.floor(Date.now() / 1000);
  const done = [];
  for (const key of services) {
    const service = SERVICES[key];
    tccWrite({db: path, statement: `insert or replace into access (service, client, client_type, auth_value, auth_reason, auth_version, csreq, flags, indirect_object_identifier, last_modified) values (${quote(service)}, ${quote(client)}, 0, 2, 4, 1, X'${hex}', 0, 'UNUSED', ${now});`});
    done.push({db, service, client});
  }
  return done;
}

// Removes every row for `client` of `services` in `db`.
export function revokeRows({client, services, db = 'system'}) {
  const path = db === 'user' ? USER_DB : SYSTEM_DB;
  tccWrite({db: path, statement: `delete from access where client = ${quote(client)} and service in (${services.map(key => quote(SERVICES[key])).join(',')});`});
  return {db, client, services};
}

// Restarts tccd (system and user instances; launchd starts them again), so a cached decision is dropped.
export function restartTccd() {
  try { tccWrite({kind: 'restart'}); return {restarted: true}; } catch (error) { return {restarted: false, error: String(error.stderr || error.message).trim().slice(0, 300)}; }
}
