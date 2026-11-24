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
// the entry and the pinned commit in the log and in its report. It grants rows (the setup's and the approval's), it
// removes cua's engine's own rows for named services (the hosted staged onboarding's, T3b), and it grants Input
// Monitoring to sitting C's key-route diagnostic's tap app alone (ruling 1198, grantDiagnosticListen), all through the
// same guard; engineRows reads the engines' rows, hosted only, so that step can show it left them as they were.
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
// of the bullet in code (a fenced block, or a line indented as code) is none.
// Fences are placed conservatively, never by a full CommonMark parser (fenceScan): a document with a fence the scan
// cannot place unambiguously is refused as such.
// -> null when it holds one, else the problem.
// The document's lines with every fenced line (its fences included) as null, or `ambiguous`: why a fence cannot be placed
// without a full CommonMark parser. Placed: a fence that opens at column 0 on ``` or ~~~ (three or more) and closes on
// the same character, at least as long, indented at most three spaces, with nothing after it (CommonMark's closer).
// Ambiguous: a fence marker opening on a list marker or indented outside a fence (a list item's fence, tracked in
// CommonMark by the item's content indent, or indented code), a closer indented four or more (literal content in
// CommonMark, which leaves the rest fenced), and a fence never closed. -> {lines, ambiguous: null | reason}.
export function fenceScan(text) {
  let fence = null;
  const lines = [];
  for (const [i, line] of String(text ?? '').split('\n').entries()) {
    const ambiguous = why => ({lines, ambiguous: `${why} at line ${i + 1}`});
    const marker = /^(\s*)(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const closes = marker && marker[2][0] === fence[0] && marker[2].length >= fence.length && !line.trim().slice(marker[2].length).trim();
      if (closes && marker[1].length >= 4) return ambiguous('a fence closer indented four or more');
      if (closes) fence = null;
      lines.push(null);
      continue;
    }
    if (/^\s*([-*+]|\d{1,9}[.)])\s+(`{3,}|~{3,})/.test(line)) return ambiguous('a fence opening on a list marker');
    if (marker && marker[1].length > 0) return ambiguous('an indented fence (a list item\'s, or indented code)');
    if (marker) { fence = marker[2]; lines.push(null); continue; }
    lines.push(line);
  }
  return fence ? {lines, ambiguous: 'a fence never closed'} : {lines, ambiguous: null};
}

export function decisionEntryProblem(text) {
  // Fences first, over the whole document, so neither a section's heading nor an entry is read inside one.
  const {lines, ambiguous} = fenceScan(text);
  if (ambiguous) return `the pinned spec's fences are ambiguous (${ambiguous})`;
  const start = lines.findIndex(line => line !== null && /^## Decision Log\s*$/.test(line));
  if (start < 0) return 'the pinned spec has no "## Decision Log" section';
  const end = lines.findIndex((line, i) => i > start && line !== null && /^## /.test(line));
  const entries = [];
  for (const line of lines.slice(start + 1, end < 0 ? undefined : end)) {
    if (line === null) { if (entries.at(-1) !== null) entries.push(null); continue; }
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
  try { shown = execFileSync('/usr/bin/codesign', ['-d', '-r-', bundle], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000}); } catch (error) { shown = `${error.stdout ?? ''}${error.stderr ?? ''}`; }
  const requirement = /designated => (.*)$/m.exec(shown)?.[1];
  if (!requirement) throw new Error(`no designated requirement for ${bundle}`);
  const dir = mkdtempSync(join(tmpdir(), 'cua-csreq-'));
  try {
    execFileSync('/usr/bin/csreq', ['-r', `=${requirement}`, '-b', join(dir, 'req.bin')], {stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000});
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

// Whether `services` names a non-empty list of SERVICES' keys.
const knownServices = services => Array.isArray(services) && services.length > 0 && services.every(key => Object.hasOwn(SERVICES, key));
// The rows of `clients` for `services` (keys) as the system database reads them: [[service, client, auth_value]].
const readRows = (store, clients, services) => String(store.sql(SYSTEM_DB, `select service, client, auth_value from access where client in (${clients.map(quote).join(', ')}) and service in (${services.map(key => quote(SERVICES[key])).join(', ')})`) ?? '')
  .split('\n').filter(Boolean).map(line => line.split('|'));

// Grants each `{client, bundle, services?}` (client one of CLIENTS, bundle the app whose designated requirement the
// rows carry, services the keys of SERVICES to grant, every one by default) in the system database, then reads the rows
// back. `deps`: {env, platform, decisionLog (() -> {sha, text} | null, the pinned spec), store, log, now}. `decision`:
// the entry and the pinned commit. -> {decision, rows: [{client, granted: [service key]}], missing: ['<client> <service key>']}.
export function grantRows(grants, {now = Date.now, ...deps} = {}) {
  if (!grants.length || grants.some(g => !Object.values(CLIENTS).includes(g.client) || typeof g.bundle !== 'string'))
    throw new Error('the TCC writer grants only cua\'s engine and the vendor\'s helper, each with its bundle');
  if (grants.some(g => g.services !== undefined && !knownServices(g.services)))
    throw new Error(`the TCC writer: a grant names services of ${Object.keys(SERVICES).join(', ')}, at least one`);
  const named = grants.map(g => ({...g, services: g.services ?? Object.keys(SERVICES)}));
  return tccWrite((store, decision) => {
    if (!store.exists(SYSTEM_DB)) throw new Error(`no TCC database at ${SYSTEM_DB}`);
    const at = Math.floor(now() / 1000);
    for (const {client, bundle, services} of named) {
      const hex = store.csreq(bundle);
      if (!/^[0-9a-f]+$/.test(hex)) throw new Error(`the designated requirement of ${bundle} did not compile`);
      for (const key of services)
        store.sql(SYSTEM_DB, `insert or replace into access (service, client, client_type, auth_value, auth_reason, auth_version, csreq, flags, indirect_object_identifier, last_modified) values (${quote(SERVICES[key])}, ${quote(client)}, 0, 2, 4, 1, X'${hex}', 0, 'UNUSED', ${at});`);
    }
    const read = readRows(store, named.map(g => g.client), [...new Set(named.flatMap(g => g.services))]);
    const allowed = (client, key) => read.some(([s, c, value]) => s === SERVICES[key] && c === client && value === '2');
    const rows = named.map(({client, services}) => ({client, granted: services.filter(key => allowed(client, key))}));
    const missing = named.flatMap(({client, services}) => services.filter(key => !allowed(client, key)).map(key => `${client} ${key}`));
    return {decision, rows, missing};
  }, deps);
}

// Removes cua's engine's rows for `services` (keys of SERVICES) from the system database, then reads them back (the
// hosted staged onboarding's, T3b: ./onboarding.mjs). Only cua's engine's bundle id: the vendor's helper's rows and any
// other app's are never removed. `deps`: grantRows'. -> {decision, client, removed: [service key], remaining: [service key]}.
export function revokeRows({client, services} = {}, deps = {}) {
  if (client !== CLIENTS.engine || !knownServices(services))
    throw new Error(`the TCC writer removes only cua's engine's rows (${CLIENTS.engine}), for services of ${Object.keys(SERVICES).join(', ')}`);
  return tccWrite((store, decision) => {
    if (!store.exists(SYSTEM_DB)) throw new Error(`no TCC database at ${SYSTEM_DB}`);
    store.sql(SYSTEM_DB, `delete from access where client = ${quote(client)} and service in (${services.map(key => quote(SERVICES[key])).join(', ')});`);
    const read = readRows(store, [client], services);
    const present = key => read.some(([s, c]) => s === SERVICES[key] && c === client);
    return {decision, client, removed: services.filter(key => !present(key)), remaining: services.filter(present)};
  }, deps);
}

// The key-route diagnostic's tap app (ruling 1198; ../native-matrix/key-route-tap.swift, built by
// ../native-matrix/key-route-device.mjs buildTapApp): the one identity besides the two engines this writer grants, and
// only Input Monitoring, which its listen-only taps need. Neither engine under test gets a row from it.
export const DIAGNOSTIC_CLIENT = 'io.github.ssfskim.cua.key-route-tap';

// Grants Input Monitoring to the diagnostic's tap app (`bundle`, whose designated requirement the row carries) in the
// system database, through the same guard as every write (hosted, under O0), then reads the row back. `deps`:
// grantRows'. -> {decision, client, service, granted}.
export function grantDiagnosticListen({bundle} = {}, {now = Date.now, ...deps} = {}) {
  if (typeof bundle !== 'string' || !bundle) throw new Error('the TCC writer grants the key-route diagnostic its tap app\'s bundle only');
  const service = SERVICES.inputMonitoring;
  return tccWrite((store, decision) => {
    if (!store.exists(SYSTEM_DB)) throw new Error(`no TCC database at ${SYSTEM_DB}`);
    const hex = store.csreq(bundle);
    if (!/^[0-9a-f]+$/.test(hex)) throw new Error(`the designated requirement of ${bundle} did not compile`);
    store.sql(SYSTEM_DB, `insert or replace into access (service, client, client_type, auth_value, auth_reason, auth_version, csreq, flags, indirect_object_identifier, last_modified) values (${quote(service)}, ${quote(DIAGNOSTIC_CLIENT)}, 0, 2, 4, 1, X'${hex}', 0, 'UNUSED', ${Math.floor(now() / 1000)});`);
    const granted = readRows(store, [DIAGNOSTIC_CLIENT], ['inputMonitoring']).some(([s, c, value]) => s === service && c === DIAGNOSTIC_CLIENT && value === '2');
    return {decision, client: DIAGNOSTIC_CLIENT, service, granted};
  }, deps);
}

// The two engines' rows as the system database holds them, losslessly: every column the access table has (read from
// the table itself, so no column a narrower select would omit escapes the compare), each row one SQL tuple of its
// values as quote() spells them, carried hex-encoded so no value can split a line, sorted. Read before and after a step
// that must leave them as they were (the key-route diagnostic). A read only, still hosted only (the system database is
// read through sudo). -> {columns: [name], rows: [tuple]}.
export function engineRows({env = process.env, platform = process.platform, store = STORE} = {}) {
  assertGithubHosted(env, platform, 'the TCC reader');
  const columns = String(store.sql(SYSTEM_DB, 'select name from pragma_table_info(\'access\') order by cid;') ?? '').split('\n').filter(Boolean);
  if (!columns.length || !columns.every(name => /^\w+$/.test(name))) throw new Error('the access table\'s columns could not be read');
  const clients = Object.values(CLIENTS).map(quote).join(', ');
  const tuple = columns.map(name => `quote("${name}")`).join(' || \', \' || ');
  const rows = String(store.sql(SYSTEM_DB, `select hex('(' || ${tuple} || ')') from access where client in (${clients});`) ?? '')
    .split('\n').filter(Boolean).map(line => Buffer.from(line, 'hex').toString('utf8')).sort();
  return {columns, rows};
}
// What changed between two readings of engineRows: the rows compared as multisets (a duplicate gained or lost counts),
// and the table's columns. -> null when nothing did, else {added, removed, columns?: {before, after}}.
export function rowsChanged(before, after) {
  const minus = (rows, taken) => {
    const left = new Map();
    for (const row of taken) left.set(row, (left.get(row) ?? 0) + 1);
    return rows.filter(row => { const n = left.get(row) ?? 0; if (n) left.set(row, n - 1); return n === 0; });
  };
  const added = minus(after.rows, before.rows), removed = minus(before.rows, after.rows);
  const columnsChanged = before.columns.join('\n') !== after.columns.join('\n');
  return added.length || removed.length || columnsChanged ? {added, removed, ...(columnsChanged ? {columns: {before: before.columns, after: after.columns}} : {})} : null;
}
