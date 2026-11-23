// The hosted kit's one TCC writer (#117 M5, T10b′): the system-database rows that grant cua's engine
// (io.github.ssfskim.cua.engine) and the vendor's computer-use helper (com.openai.sky.CUAService) on a GitHub-hosted
// runner, so both engines run live there.
//
// Allowed by the owner on GitHub-hosted runners only, never on any Mac of the owner's: the design spec's Decision Log
// entry DECISION_LOG_ENTRY (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, recorded on docs/117-progress
// db775127; ruling 1111, O0), which amends "TCC is never edited by automation" for GitHub-hosted runners alone. Every
// write goes through tccWrite, whose guard throws before any access to a store or its directory unless
// RUNNER_ENVIRONMENT=github-hosted on macOS and that entry is in the spec's Decision Log as git holds it (docs/117-progress,
// else HEAD, else a shallow fetch of docs/117-progress; fail closed when none reads), as ruling 1137 asks and H0's kit did
// (proven by test/hosted-sittings/tcc.test.mjs with a spy store), and every write cites that entry in the log.
//
// What H0 found (#175; scripts/probe-117-h0/README.md on probe/117-h0 56c08949), and so what this writes: the system
// database's rows are honoured, at the client's next launch only (so the caller relaunches the engines after it,
// scripts/hosted-sittings/approve.mjs); the user database's are not, so it is never written; rows for Accessibility,
// Screen Recording, Input Monitoring and post events, each with the bundle's designated requirement as its csreq.
// replayd's capture approval is not a TCC row and nothing here touches its store (ruling 1141: no kit writes it).
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertGithubHosted} from './runner.mjs';

export const SYSTEM_DB = '/Library/Application Support/com.apple.TCC/TCC.db';
export const SERVICES = Object.freeze({
  accessibility: 'kTCCServiceAccessibility',
  screenRecording: 'kTCCServiceScreenCapture',
  inputMonitoring: 'kTCCServiceListenEvent',
  postEvent: 'kTCCServicePostEvent',
});
export const CLIENTS = Object.freeze({engine: 'io.github.ssfskim.cua.engine', vendor: 'com.openai.sky.CUAService'});
export const DECISION_LOG_ENTRY = 'Decision (2026-11-23, the owner: TCC rows may be written by kits on GitHub-hosted runners only, never on any of the owner\'s Macs (O0; ruling 1111)), docs/doperpowers/specs/2026-10-18-own-native-engine-design.md';

// The entry as the spec words it (whitespace aside: the spec wraps it), which must be in its Decision Log.
export const DECISION_MARKER = 'Decision (2026-11-23, the owner: TCC rows may be written by kits on GitHub-hosted runners only, never on any of the owner\'s Macs (O0; ruling 1111))';
export const DECISION_SPEC = 'docs/doperpowers/specs/2026-10-18-own-native-engine-design.md';
export const hasDecision = text => typeof text === 'string' && text.replace(/\s+/g, ' ').includes(DECISION_MARKER);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The spec's text holding the entry, from docs/117-progress (where the Decision Log is kept), this checkout's HEAD, or a
// shallow fetch of docs/117-progress (a ci-kit gate's checkout is one commit deep); null when none holds it.
export function readDecisionLog({cwd = REPO} = {}) {
  const git = args => { try { return execFileSync('/usr/bin/git', ['-C', cwd, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024, timeout: 60_000}); } catch { return null; } };
  for (const ref of ['origin/docs/117-progress', 'HEAD']) { const text = git(['show', `${ref}:${DECISION_SPEC}`]); if (hasDecision(text)) return text; }
  if (git(['fetch', '-q', '--depth', '1', 'origin', 'docs/117-progress']) === null) return null;
  const fetched = git(['show', `FETCH_HEAD:${DECISION_SPEC}`]);
  return hasDecision(fetched) ? fetched : null;
}

const run = (cmd, args) => execFileSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000});
const quote = value => `'${String(value).replace(/'/g, "''")}'`;

// The designated requirement of a signed bundle, compiled to the blob a row's csreq column holds, as hex (H0's).
export function csreqHex(bundle) {
  let shown;
  try { shown = execFileSync('/usr/bin/codesign', ['-d', '-r-', bundle], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}); } catch (error) { shown = `${error.stdout ?? ''}${error.stderr ?? ''}`; }
  const requirement = /designated => (.*)$/m.exec(shown)?.[1];
  if (!requirement) throw new Error(`no designated requirement for ${bundle}`);
  const dir = mkdtempSync(join(tmpdir(), 'cua-csreq-'));
  try {
    execFileSync('/usr/bin/csreq', ['-r', `=${requirement}`, '-b', join(dir, 'req.bin')], {stdio: ['ignore', 'pipe', 'pipe']});
    return readFileSync(join(dir, 'req.bin')).toString('hex');
  } finally { rmSync(dir, {recursive: true, force: true}); }
}

// Every store access a write makes, in one place, so the test can replace it with a spy.
const STORE = {
  exists: path => existsSync(path),
  csreq: bundle => csreqHex(bundle),
  sql: (db, statement) => run('/usr/bin/sudo', ['-n', '/usr/bin/sqlite3', db, statement]),
};

// The one function that writes: the guard first, then the action against the store.
function tccWrite(action, {env = process.env, platform = process.platform, decisionLog = readDecisionLog, store = STORE, log = line => process.stderr.write(`${line}\n`)} = {}) {
  assertGithubHosted(env, platform, 'the TCC writer');
  if (!hasDecision(decisionLog())) throw new Error(`the TCC writer: refused: the owner's yes (O0; ruling 1111) is not in ${DECISION_SPEC}'s Decision Log on docs/117-progress or HEAD`);
  log(`hosted-sittings: writing TCC rows on a GitHub-hosted runner under the design spec's Decision Log entry: ${DECISION_LOG_ENTRY}`);
  return action(store);
}

// Grants every service of SERVICES to each `{client, bundle}` (client one of CLIENTS, bundle the app whose designated
// requirement the rows carry) in the system database, then reads the rows back. `deps`: {env, platform, decisionLog
// (() -> the spec's text, or null), store, log, now}. -> {decision, rows: [{client, granted: [service key]}], missing: ['<client> <service key>']}.
export function grantRows(grants, {now = Date.now, ...deps} = {}) {
  if (!grants.length || grants.some(g => !Object.values(CLIENTS).includes(g.client) || typeof g.bundle !== 'string'))
    throw new Error('the TCC writer grants only cua\'s engine and the vendor\'s helper, each with its bundle');
  return tccWrite(store => {
    if (!store.exists(SYSTEM_DB)) throw new Error(`no TCC database at ${SYSTEM_DB}`);
    const at = Math.floor(now() / 1000);
    for (const {client, bundle} of grants) {
      const hex = store.csreq(bundle);
      if (!/^[0-9a-f]+$/.test(hex)) throw new Error(`the designated requirement of ${bundle} did not compile`);
      for (const service of Object.values(SERVICES))
        store.sql(SYSTEM_DB, `insert or replace into access (service, client, client_type, auth_value, auth_reason, auth_version, csreq, flags, indirect_object_identifier, last_modified) values (${quote(service)}, ${quote(client)}, 0, 2, 4, 1, X'${hex}', 0, 'UNUSED', ${at});`);
    }
    const clients = grants.map(g => g.client);
    const read = String(store.sql(SYSTEM_DB, `select service, client, auth_value from access where client in (${clients.map(quote).join(', ')}) and service in (${Object.values(SERVICES).map(quote).join(', ')})`) ?? '')
      .split('\n').filter(Boolean).map(line => line.split('|'));
    const allowed = (client, service) => read.some(([s, c, value]) => s === service && c === client && value === '2');
    const rows = clients.map(client => ({client, granted: Object.entries(SERVICES).filter(([, service]) => allowed(client, service)).map(([key]) => key)}));
    const missing = clients.flatMap(client => Object.entries(SERVICES).filter(([, service]) => !allowed(client, service)).map(([key]) => `${client} ${key}`));
    return {decision: DECISION_LOG_ENTRY, rows, missing};
  }, deps);
}
