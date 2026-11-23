// The hosted kit's one TCC writer (#117 M5, T10b′): the system-database rows that grant cua's engine
// (io.github.ssfskim.cua.engine) and the vendor's computer-use helper (com.openai.sky.CUAService) on a GitHub-hosted
// runner, so both engines run live there.
//
// Allowed by the owner on GitHub-hosted runners only, never on any Mac of the owner's: the design spec's Decision Log
// entry DECISION_LOG_ENTRY (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, recorded on docs/117-progress
// db775127; ruling 1111, O0), which amends "TCC is never edited by automation" for GitHub-hosted runners alone. Every
// write goes through tccWrite, whose guard throws before any access to a store or its directory unless
// RUNNER_ENVIRONMENT=github-hosted on macOS (checked first, before anything is read), and then unless that entry is an
// entry of its own in the Decision Log section of the design spec pinned at preparation: the workflow's setup step (not
// this writer) fetches the spec at a full commit (O0_COMMIT by default, where the entry was recorded on docs/117-progress;
// the workflow may name a later one) and writes it to a run-owned file, named with its commit by
// CUA_HOSTED_DECISION_FILE and CUA_HOSTED_DECISION_SHA. The writer runs no git and fetches nothing; a missing or
// unreadable file refuses (ruling 1137; proven by test/hosted-sittings/tcc.test.mjs with a spy store). Every write cites
// the entry and the pinned commit in the log and in its report.
//
// What H0 found (#175; scripts/probe-117-h0/README.md on probe/117-h0 56c08949), and so what this writes: the system
// database's rows are honoured, at the client's next launch only (so the caller relaunches the engines after it,
// scripts/hosted-sittings/approve.mjs); the user database's are not, so it is never written; rows for Accessibility,
// Screen Recording, Input Monitoring and post events, each with the bundle's designated requirement as its csreq.
// replayd's capture approval is not a TCC row and nothing here touches its store (ruling 1141: no kit writes it).
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
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

// The entry as the spec words it (whitespace aside: the spec wraps it): an entry of the Decision Log begins with it.
export const DECISION_MARKER = 'Decision (2026-11-23, the owner: TCC rows may be written by kits on GitHub-hosted runners only, never on any of the owner\'s Macs (O0; ruling 1111))';
export const DECISION_SPEC = 'docs/doperpowers/specs/2026-10-18-own-native-engine-design.md';
// The docs/117-progress commit that recorded the entry: the pin by default.
export const O0_COMMIT = 'db775127652ebae5e0c7d90b5f5e2785f8e5711e';

// Why `text` (the pinned spec) holds no O0 entry: its "## Decision Log" section, up to the next "## " heading, must hold
// an entry of its own (a line starting "- ", with its indented continuation lines) whose text, whitespace-normalised,
// begins with DECISION_MARKER. A quotation inside another entry, the marker anywhere outside the section, or an example
// of the bullet in code (a fenced block, ``` or ~~~ at any indent, or a line indented as code) is none.
// -> null when it holds one, else the problem.
export function decisionEntryProblem(text) {
  const lines = String(text ?? '').split('\n');
  const start = lines.findIndex(line => /^## Decision Log\s*$/.test(line));
  if (start < 0) return 'the pinned spec has no "## Decision Log" section';
  const end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  const entries = [];
  let fence = null;
  for (const line of lines.slice(start + 1, end < 0 ? undefined : end)) {
    // A fence opens on ``` or ~~~ (three or more) and closes on the same character, at least as long; inside it is code.
    const mark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) { if (mark && mark[0] === fence[0] && mark.length >= fence.length && !line.trim().slice(mark.length).trim()) fence = null; continue; }
    if (mark) { fence = mark; entries.push(null); continue; }
    if (line.startsWith('- ')) entries.push(line.slice(2));
    else if (/^\s+\S/.test(line) && typeof entries.at(-1) === 'string') entries[entries.length - 1] += ` ${line}`;
    else if (!line.trim() || !/^\s/.test(line)) entries.push(null);
  }
  const found = entries.some(entry => entry !== null && entry.replace(/\s+/g, ' ').trim().startsWith(DECISION_MARKER));
  return found ? null : 'the owner\'s yes (O0; ruling 1111) has no entry of its own in its Decision Log';
}

// The spec the setup step pinned: CUA_HOSTED_DECISION_FILE (a run-owned file holding the spec at the pinned commit) and
// CUA_HOSTED_DECISION_SHA (that commit). -> {sha, text, file}, or null when the file is unnamed or cannot be read.
export function pinnedDecisionLog(env = process.env) {
  const file = env.CUA_HOSTED_DECISION_FILE;
  if (!file) return null;
  try { return {sha: env.CUA_HOSTED_DECISION_SHA ?? null, text: readFileSync(file, 'utf8'), file}; } catch { return null; }
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
// `decisionLog()`: the pinned spec, {sha, text} (pinnedDecisionLog), read only once the host is known to be a runner.
function tccWrite(action, {env = process.env, platform = process.platform, decisionLog = () => pinnedDecisionLog(env), store = STORE, log = line => process.stderr.write(`${line}\n`)} = {}) {
  assertGithubHosted(env, platform, 'the TCC writer');
  const refuse = why => { throw new Error(`the TCC writer: refused: ${why}`); };
  const pinned = decisionLog();
  if (!pinned || typeof pinned.text !== 'string') refuse(`no pinned design spec (CUA_HOSTED_DECISION_FILE, written by the setup step from ${DECISION_SPEC} at a pinned commit) could be read`);
  if (!/^[0-9a-f]{40}$/.test(pinned.sha ?? '')) refuse(`the pin ${pinned.sha ?? '(none)'} is not a full commit (CUA_HOSTED_DECISION_SHA)`);
  const problem = decisionEntryProblem(pinned.text);
  if (problem) refuse(`${problem} (${DECISION_SPEC} at ${pinned.sha})`);
  log(`hosted-sittings: writing TCC rows on a GitHub-hosted runner under the design spec's Decision Log at ${pinned.sha}, entry: ${DECISION_LOG_ENTRY}`);
  return action(store, {entry: DECISION_LOG_ENTRY, commit: pinned.sha});
}

// Grants every service of SERVICES to each `{client, bundle}` (client one of CLIENTS, bundle the app whose designated
// requirement the rows carry) in the system database, then reads the rows back. `deps`: {env, platform, decisionLog
// (() -> {sha, text} | null, the pinned spec), store, log, now}. `decision`: the entry and the pinned commit. -> {decision, rows: [{client, granted: [service key]}], missing: ['<client> <service key>']}.
export function grantRows(grants, {now = Date.now, ...deps} = {}) {
  if (!grants.length || grants.some(g => !Object.values(CLIENTS).includes(g.client) || typeof g.bundle !== 'string'))
    throw new Error('the TCC writer grants only cua\'s engine and the vendor\'s helper, each with its bundle');
  return tccWrite((store, decision) => {
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
    return {decision, rows, missing};
  }, deps);
}
