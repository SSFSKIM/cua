// #117 H0 (#175): reading the runner's TCC databases, and the one function that writes them.
//
// Writing is allowed by the owner on GitHub-hosted runners only, never on any Mac of the owner's: the Decision Log entry
// "2026-11-23, the owner: TCC rows may be written by kits on GitHub-hosted runners only, never on any of the owner's
// Macs (O0; ruling 1111)" in docs/doperpowers/specs/2026-10-18-own-native-engine-design.md (branch docs/117-progress,
// db775127). Every write (insert, delete, a tccd restart) goes through tccWrite, whose guard exits the process before
// anything is written unless RUNNER_ENVIRONMENT=github-hosted and that entry is present in the fetched spec.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
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
// O0a (docs/117-progress ccb46e28, right after O0): replayd's screen-capture approval may be pre-recorded by kits on
// GitHub-hosted runners only, for cua's engine bundle and the vendor's helper, before their first capture, through
// this same writer. Never on any of the owner's Macs.
const DECISION_O0A = '(O0a; extends O0)';
// replayd's store of capture approvals (the "bypass the system private window picker" confirmation's answers).
export const REPLAYD_DIR = join(homedir(), 'Library/Group Containers/group.com.apple.replayd');
export const REPLAYD_APPROVALS = join(REPLAYD_DIR, 'ScreenCaptureApprovals.plist');
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

// The guard: before any write, and before any access to a store or its directory, this job must be on a GitHub-hosted
// macOS runner, and the owner's yes must be in the spec's Decision Log as fetched from docs/117-progress (or HEAD).
// Anything else exits the process non-zero. `deps` are the test's seams (scripts/probe-117-h0/tcc.test.mjs): env,
// platform, readSpec (the spec's text at a ref, or null), exit.
export function guard({env = process.env, platform = process.platform, readSpec = specAt, exit = code => process.exit(code), stderr = process.stderr, decisions = [DECISION]} = {}) {
  if (env.RUNNER_ENVIRONMENT !== 'github-hosted' || platform !== 'darwin') {
    stderr.write('probe-117-h0: refused: TCC rows are written only on a GitHub-hosted macOS runner (RUNNER_ENVIRONMENT=github-hosted; O0, ruling 1111)\n');
    return exit(3);
  }
  if (!['origin/docs/117-progress', 'HEAD'].some(ref => { const text = readSpec(ref); return typeof text === 'string' && decisions.every(d => text.includes(d)); })) {
    stderr.write(`probe-117-h0: refused: the owner's yes (${decisions.length > 1 ? 'O0 and O0a' : 'O0'}) is not in ${SPEC}'s Decision Log on docs/117-progress or HEAD\n`);
    return exit(3);
  }
  return true;
}
function specAt(ref) { try { return run('/usr/bin/git', ['show', `${ref}:${SPEC}`], {maxBuffer: 64 * 1024 * 1024}); } catch { return null; } }

// Every store access a write makes, in one place, so the test can replace it with a spy.
const STORE = {
  exists: path => existsSync(path),
  csreq: bundle => csreqHex(bundle).hex,
  sql: (db, statement) => sql(db, statement),
  restart: () => run('/usr/bin/sudo', ['-n', '/usr/bin/killall', 'tccd']),
  // replayd's store: its directory listing and the approvals as plutil prints them (dates included), or null.
  replaydRead: () => ({
    dir: existsSync(REPLAYD_DIR) ? run('/bin/ls', ['-la', REPLAYD_DIR]).trim().split('\n') : null,
    approvals: existsSync(REPLAYD_APPROVALS) ? run('/usr/bin/plutil', ['-p', REPLAYD_APPROVALS]).trim() : null,
  }),
  // The approvals merged into the store's current contents and imported through cfprefsd (defaults import), so
  // replayd's own reads see them. `entries`: [{key, xml}], each value the XML of its dict.
  replaydWrite: entries => {
    const current = existsSync(REPLAYD_APPROVALS) ? run('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', REPLAYD_APPROVALS]) : PLIST_EMPTY;
    const at = current.lastIndexOf('</dict>');
    if (at < 0) throw new Error('replayd\'s store is not a dictionary');
    const merged = current.slice(0, at) + entries.map(e => `\t<key>${xmlEscape(e.key)}</key>\n${e.xml}\n`).join('') + current.slice(at);
    const dir = mkdtempSync(join(tmpdir(), 'h0-replayd-'));
    try {
      writeFileSync(join(dir, 'merged.plist'), merged);
      run('/usr/bin/plutil', ['-lint', join(dir, 'merged.plist')]);
      return run('/usr/bin/defaults', ['import', REPLAYD_APPROVALS.replace(/\.plist$/, ''), join(dir, 'merged.plist')]);
    } finally { rmSync(dir, {recursive: true, force: true}); }
  },
  // replayd started afresh (launchd relaunches it on demand), so it reads the store again.
  replaydRestart: () => { try { return run('/usr/bin/killall', ['replayd']); } catch { return run('/usr/bin/sudo', ['-n', '/usr/bin/killall', 'replayd']); } },
};

// The one function that writes: the guard first, then the action against the store. Every public writer below is a
// call of it, so no path reaches the store unguarded.
function tccWrite(action, {store = STORE, ...deps} = {}) {
  guard(deps);
  return action(store);
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
const dbPath = db => (db === 'user' ? USER_DB : SYSTEM_DB);

// Grants `services` (keys of SERVICES) to the bundle id `client` in `db` ('system' | 'user'), with its csreq.
export function grantRows({client, bundle, services, db = 'system'}, deps = {}) {
  return tccWrite(store => {
    const path = dbPath(db);
    if (!store.exists(path)) throw new Error(`no TCC database at ${path}`);
    const hex = store.csreq(bundle);
    const now = Math.floor(Date.now() / 1000);
    return services.map(key => {
      store.sql(path, `insert or replace into access (service, client, client_type, auth_value, auth_reason, auth_version, csreq, flags, indirect_object_identifier, last_modified) values (${quote(SERVICES[key])}, ${quote(client)}, 0, 2, 4, 1, X'${hex}', 0, 'UNUSED', ${now});`);
      return {db, service: SERVICES[key], client};
    });
  }, deps);
}

// Removes every row for `client` of `services` in `db`.
export function revokeRows({client, services, db = 'system'}, deps = {}) {
  return tccWrite(store => {
    store.sql(dbPath(db), `delete from access where client = ${quote(client)} and service in (${services.map(key => quote(SERVICES[key])).join(',')});`);
    return {db, client, services};
  }, deps);
}

// Restarts tccd (system and user instances; launchd starts them again), so a cached decision is dropped.
export function restartTccd(deps = {}) {
  return tccWrite(store => {
    try { store.restart(); return {restarted: true}; } catch (error) { return {restarted: false, error: String(error.stderr || error.message).trim().slice(0, 300)}; }
  }, deps);
}

const PLIST_EMPTY = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n</dict>\n</plist>\n';
const xmlEscape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// replayd keys an approval by the app bundle's file URL (percent-encoded, with a trailing slash), as it records one
// itself (run 45161413076), and the runner image pre-records its own agent with both dates at 3024-01-01.
export const replaydKey = bundlePath => `file://${encodeURI(bundlePath.replace(/\/$/, ''))}/`;
const iso = date => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
const approvalXml = now => `\t<dict>
\t\t<key>kScreenCaptureAlertableUsageCount</key>\n\t\t<integer>1</integer>
\t\t<key>kScreenCaptureApprovalLastAlerted</key>\n\t\t<date>3024-01-01T00:00:00Z</date>
\t\t<key>kScreenCaptureApprovalLastUsed</key>\n\t\t<date>${iso(now)}</date>
\t\t<key>kScreenCapturePrivacyHintDate</key>\n\t\t<date>3024-01-01T00:00:00Z</date>
\t</dict>`;

// O0a: pre-records replayd's capture approval for each app bundle (cua's engine bundle, the vendor's helper app) before
// its first capture, in the image's own form, then restarts replayd. Guarded by O0 and O0a both. -> what the store held
// before, what was written, and what it holds after.
export function preRecordReplayd({bundles}, deps = {}) {
  return tccWrite(store => {
    const before = store.replaydRead();
    const now = new Date();
    const entries = bundles.map(b => ({key: replaydKey(b), xml: approvalXml(now)}));
    store.replaydWrite(entries);
    const written = entries.map(e => ({key: e.key, kScreenCaptureApprovalLastAlerted: '3024-01-01T00:00:00Z', kScreenCapturePrivacyHintDate: '3024-01-01T00:00:00Z', kScreenCaptureApprovalLastUsed: iso(now), kScreenCaptureAlertableUsageCount: 1}));
    let restarted;
    try { store.replaydRestart(); restarted = true; } catch (error) { restarted = String(error.stderr || error.message).trim().slice(0, 200); }
    return {store: REPLAYD_APPROVALS, before, written, restarted, after: store.replaydRead()};
  }, {...deps, decisions: [DECISION, DECISION_O0A]});
}

// replayd's store read under the same guard (it is a store access too).
export function readReplayd(deps = {}) {
  return tccWrite(store => store.replaydRead(), {...deps, decisions: [DECISION, DECISION_O0A]});
}
