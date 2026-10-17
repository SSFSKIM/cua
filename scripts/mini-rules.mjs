#!/usr/bin/env node
// The mini's run rules and #115 M0's mini items (docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, Decision Log
// "native runs on the mini"; docs/evidence/2026-10-17-own-sandbox/m0/mini-rules/README.md). Run from this checkout on the
// controller:
//
//   node scripts/mini-rules.mjs <item>...      items: vendor, browser, tz, tz-real-home, accept (in the order given)
//
// Before each item, the gate: two readings about 45 s apart, each with every observation present (a request that fails
// or an answer that does not parse stops the sequence; nothing missing is ever read as idle):
//   - the frontmost application on the mini is Terminal; anything else (a dialog above all) stops at once, no retry;
//   - the mac lane's runner `ci-kit-mac-mini` (SSFSKIM/MAWS) is not busy, no Runner.Worker runs on the mini, no MAWS job
//     waits for a macOS runner, and the mini's 1-minute load is under 2; any of these is contention, which waits a
//     minute and looks again (at most `maxWaits` times, then stops).
// After each item, and before stopping for any reason, the frontmost application is read again; a non-Terminal one stops.
// A failed item stops the sequence. A run directory is skipped only when it holds a complete run of this sitting whose
// preparation was cleaned up; anything else already there stops. Evidence is archived only from a directory the item
// created for itself, only after the copy is verified (parsed, complete, newer than the item's start), and the remote
// copy is removed only after that. Every check and decision is appended to the sitting log.
import {execFileSync, spawnSync} from 'node:child_process';
import {appendFileSync, existsSync, mkdirSync, readFileSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const EVIDENCE = join(ROOT, 'docs/evidence/2026-10-17-own-sandbox/m0');
export const APPROVED = '/Users/new/cua-115/home';
export const RELEASE = '26.928.40906-darwin-arm64';
export const TERMINAL = 'com.apple.Terminal';
export const EXPERIMENT = '115-m0';
const REPO = 'repos/SSFSKIM/MAWS/actions';
const MAC_LABELS = ['macOS', 'ci-kit-mac'];
const WAITING = ['queued', 'waiting', 'pending'];

export class Stop extends Error {}
const missing = (what, detail) => new Stop(`missing observation: ${what}${detail ? ` (${detail})` : ''}`);

// Runs `cmd args` and returns its stdout; throws on a nonzero exit (the live boundary; tests pass a double).
export const liveExec = (cmd, args, options = {}) => execFileSync(cmd, args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options});
const json = (text, what) => { try { return JSON.parse(text); } catch { throw missing(what, 'not JSON'); } };
const call = (exec, what, cmd, args) => { try { return exec(cmd, args); } catch (error) { throw missing(what, error.message.split('\n')[0]); } };

// The frontmost application's bundle id on the mini.
export function frontmost({exec}) {
  const text = call(exec, 'frontmost application', 'ssh', ['-o', 'BatchMode=yes', 'mini', 'lsappinfo info -only bundleid "$(lsappinfo front)"']);
  const id = /bundleID="([^"]+)"/.exec(text)?.[1];
  if (!id) throw missing('frontmost application', 'no bundle id');
  return id;
}

export const WORKER_PROBE = 'p=$(pgrep -f actions-runner-maws/bin/Runner.Worker); s=$?; echo "pgrep_status=$s"; echo "workers=$(printf "%s" "$p" | grep -c .)"; uptime';
const PAGE = 100;
// Every record of a paginated GitHub list (`key` holds the records, `total_count` their number): pages are read until the
// total is reached; a page that is short of it, a missing total or a total that changes is a failed observation.
function pages(exec, what, path, key) {
  const records = [];
  for (let page = 1; ; page++) {
    const body = json(call(exec, what, 'gh', ['api', `${path}${path.includes('?') ? '&' : '?'}per_page=${PAGE}&page=${page}`]), what);
    const list = body?.[key], total = body?.total_count;
    if (!Array.isArray(list) || !Number.isInteger(total)) throw missing(what, `no ${key} or total_count`);
    records.push(...list);
    if (records.length >= total) {
      if (records.length !== total) throw missing(what, `${records.length} records for a total of ${total}`);
      return records;
    }
    if (list.length < PAGE) throw missing(what, `truncated: ${records.length} of ${total}`);
  }
}

// One reading of everything the gate needs; throws Stop when any part is missing.
export function observe({exec}) {
  const front = frontmost({exec});
  const busy = call(exec, 'runner state', 'gh', ['api', `${REPO}/runners`, '--jq', '[.runners[] | select(.name == "ci-kit-mac-mini") | .busy] | first']).trim();
  if (busy !== 'true' && busy !== 'false') throw missing('runner state', `got ${JSON.stringify(busy)}`);
  let queued = 0;
  for (const status of ['queued', 'in_progress']) {
    for (const {id} of pages(exec, `${status} workflow runs`, `${REPO}/runs?status=${status}`, 'workflow_runs')) {
      queued += pages(exec, `jobs of run ${id}`, `${REPO}/runs/${id}/jobs`, 'jobs')
        .filter(job => WAITING.includes(job.status) && job.labels?.some(label => MAC_LABELS.includes(label))).length;
    }
  }
  // pgrep's own status is kept: 0 found, 1 none; anything else is a failed observation, never zero workers.
  const remote = call(exec, 'mini workers and load', 'ssh', ['-o', 'BatchMode=yes', 'mini', WORKER_PROBE]);
  const status = /pgrep_status=(\d+)/.exec(remote)?.[1], found = /workers=(\d+)/.exec(remote)?.[1], load = /load averages?: ([0-9.]+)/.exec(remote)?.[1];
  if (status === undefined || found === undefined) throw missing('mini workers', 'no pgrep result');
  if (status !== '0' && status !== '1') throw missing('mini workers', `pgrep exited ${status}`);
  if ((status === '1') !== (found === '0')) throw missing('mini workers', 'pgrep status and count disagree');
  const workers = found;
  if (load === undefined) throw missing('mini load', 'no uptime');
  return {front, busy: busy === 'true', workers: Number(workers), queued, load: Number(load)};
}

// stop (never retried), contention (wait and look again) or idle.
export function classify(o) {
  if (o.front !== TERMINAL) return {state: 'stop', reason: `the frontmost application is ${o.front}, not Terminal`};
  const contention = [o.busy && 'runner busy', o.workers > 0 && `${o.workers} Runner.Worker`, o.queued > 0 && `${o.queued} queued macOS job(s)`, !(o.load < 2) && `load ${o.load}`].filter(Boolean);
  return contention.length ? {state: 'contention', reason: contention.join(', ')} : {state: 'idle', reason: 'idle'};
}

export async function gate(what, {exec, sleep, log, maxWaits = 240, apartMs = 45_000, retryMs = 60_000}) {
  for (let attempt = 0; attempt <= maxWaits; attempt++) {
    const readings = [];
    for (const n of [0, 1]) {
      if (n) await sleep(apartMs);
      const o = observe({exec}), c = classify(o);
      log(`${what}: reading ${n + 1}: front=${o.front} busy=${o.busy} workers=${o.workers} queued=${o.queued} load=${o.load} -> ${c.state}${c.state === 'idle' ? '' : ` (${c.reason})`}`);
      if (c.state === 'stop') throw new Stop(`before ${what}: ${c.reason}`);
      readings.push(c);
      if (c.state === 'contention') break;
    }
    if (readings.length === 2 && readings.every(c => c.state === 'idle')) { log(`idle before ${what}`); return; }
    if (attempt < maxWaits) { log(`waiting before ${what}`); await sleep(retryMs); }
  }
  throw new Stop(`the mini did not become idle before ${what}`);
}

// After an item (and before stopping for any reason): Terminal must be frontmost again.
export function frontAfter(what, {exec, log}) {
  const front = frontmost({exec});
  log(`front after ${what}: ${front}`);
  if (front !== TERMINAL) throw new Stop(`after ${what}: the frontmost application is ${front}, not Terminal`);
}

// A run directory: complete (skip), absent (run), anything else (stop).
export function runState(dir) {
  if (!existsSync(dir)) return 'absent';
  let meta;
  try { meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')); } catch { return 'incomplete'; }
  return meta.complete === true && meta.measurement?.experiment === EXPERIMENT && meta.preparationCleanup?.removed === true ? 'complete' : 'incomplete';
}

const BASELINES = {
  vendor: {dir: 'mini-vendor-computer', args: ['--host', 'vendor', '--approved-runtime', APPROVED]},
  browser: {dir: 'mini-cua-browser', args: ['--host', 'cua', '--surfaces', 'browser']},
};
async function baseline(item, ctx) {
  const {exec, run, log, evidence} = ctx, {dir, args} = BASELINES[item];
  for (const n of [1, 2, 3]) {
    const out = join(evidence, dir, `run-${n}`), state = runState(out);
    if (state === 'complete') { log(`${item} run-${n}: already complete, skipped`); continue; }
    if (state === 'incomplete') throw new Stop(`${out} holds an incomplete or foreign run; inspect it before running again`);
    await gate(`${item} run-${n}`, ctx);
    const code = run(process.execPath, ['scripts/native-baseline.mjs', 'run', '--device', 'mini', '--experiment', EXPERIMENT, ...args, '--out', out]);
    log(`${item} run-${n}: exit ${code}`);
    frontAfter(`${item} run-${n}`, {exec, log});
    if (code !== 0) throw new Stop(`${item} run-${n} failed (exit ${code})`);
    if (runState(out) !== 'complete') throw new Stop(`${item} run-${n} exited 0 but its meta.json is not a complete, cleaned-up run`);
  }
}

// The time-zone baseline (scripts/sandbox-probe/tz-probe.mjs) on the mini, per role, with a scratch HOME (`tz`) or the
// account's (`tz-real-home`).
async function tz(item, ctx) {
  const {exec, log, evidence, now} = ctx, realHome = item === 'tz-real-home';
  const target = join(evidence, 'tz-probe', realHome ? 'real-home' : 'scratch-home');
  for (const role of ['kernel', 'worker']) {
    const local = join(target, `${role}.json`);
    if (existsSync(local)) throw new Stop(`${local} already exists; move it aside before measuring again`);
    await gate(`${item} ${role}`, ctx);
    const started = now();
    const script = `set -u; S=$(mktemp -d /tmp/cua-115-tz.XXXXXX) || exit 90; cd ~/Developer/GitHub/cua-parity || exit 91; `
      + `env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=${realHome ? '"$HOME"' : '"$S/home"'} LANG=C.UTF-8 CUA_HOME=${APPROVED} ${APPROVED}/node/24.22.0/bin/node scripts/sandbox-probe/tz-probe.mjs `
      + `--launcher codex --role ${role} --runs 80 --bound-ms 15000 --codex ${APPROVED}/runtimes/${RELEASE}/CodexCLI.app/Contents/MacOS/codex `
      + `--node ${APPROVED}/node/24.22.0/bin/node --out "$S/${role}.json" >"$S/${role}.log" 2>&1; echo "TZ $? $S"`;
    let text;
    try { text = exec('ssh', ['-o', 'BatchMode=yes', 'mini', script]); } catch (error) { frontAfter(`${item} ${role}`, {exec, log}); throw new Stop(`${item} ${role}: the remote probe did not report (${error.message.split('\n')[0]})`); }
    const [, code, remoteDir] = /TZ (\d+) (\/tmp\/cua-115-tz\.\w+)/.exec(text) ?? [];
    frontAfter(`${item} ${role}`, {exec, log});
    if (!remoteDir) throw new Stop(`${item} ${role}: the remote probe printed no result line`);
    if (code !== '0') throw new Stop(`${item} ${role}: tz-probe exited ${code}; its output stays on the mini in ${remoteDir}`);
    mkdirSync(target, {recursive: true});
    try {
      exec('scp', ['-q', `mini:${remoteDir}/${role}.json`, `mini:${remoteDir}/${role}.log`, `${target}/`]);
      verifyTz(local, {role, startedAt: started});
    } catch (error) {
      rmSync(local, {force: true}); rmSync(join(target, `${role}.log`), {force: true});
      throw new Stop(`${item} ${role}: the copy did not verify (${error.message}); the result stays on the mini in ${remoteDir}`);
    }
    exec('ssh', ['-o', 'BatchMode=yes', 'mini', `rm -rf ${remoteDir}`]);
    log(`${item} ${role}: archived ${local}`);
  }
}
// A copied tz result: parses, is this role's 80-run acceptance probe, accounts for every run, and began after the item.
export function verifyTz(file, {role, startedAt}) {
  const r = JSON.parse(readFileSync(file, 'utf8'));
  const counts = r.counts ?? {};
  if (r.role !== role || r.runs !== 80 || r.boundMs !== 15000) throw new Error('not this role\'s 80-run probe');
  if ((counts.completed ?? 0) + (counts.hung ?? 0) + (counts.launcherFailure ?? 0) !== 80 || r.results?.length !== 80) throw new Error('the counts do not account for 80 runs');
  if (!(Date.parse(r.started) >= startedAt - 5000)) throw new Error('the result predates this item');
  return r;
}

// accept-native on main at 94366c1, in a scratch clone, serving the approved runtime (prepare.mjs's approved-runtime
// preparation and cleanup from the harness clone). accept-native runs with the preparation's own TMPDIR and
// XDG_CONFIG_HOME (the TMPDIR is the witness cleanup uses to recognise the helper the acceptance run opened); a
// preparation result without either stops before acceptance. Each run writes into a fresh directory; acceptance and
// cleanup report their own exit status.
export const ACCEPT_REMOTE = `set -u
C=$HOME/cua-115-accept-main
test -d "$C/.git" || git clone -q https://github.com/SSFSKIM/cua "$C" || exit 80
cd "$C" && git fetch -q origin main && git checkout -q --detach 94366c1 && test -z "$(git status --porcelain)" && npm ci --silent --no-audit --no-fund || exit 81
OUT=$(mktemp -d /tmp/cua-115-accept.XXXXXX) || exit 82
cd "$HOME/Developer/GitHub/cua-parity" || exit 83
P=$(node scripts/native-baseline/prepare.mjs prepare '{"device":"mini","approvedHome":"${APPROVED}"}') || exit 84
CONFIG=$(node -e 'const p = JSON.parse(process.argv[1]); if (!p.configHome) process.exit(1); console.log(p.configHome)' "$P") || exit 85
RUN_TMP=$(node -e 'const p = JSON.parse(process.argv[1]); if (!p.tmpdir) process.exit(1); console.log(p.tmpdir)' "$P") || exit 86
cd "$C"
env -i PATH="$PATH" HOME="$HOME" USER="$USER" LOGNAME="$LOGNAME" TMPDIR="$RUN_TMP" LANG=C.UTF-8 XDG_CONFIG_HOME="$CONFIG" CUA_HOME=${APPROVED} \\
  node scripts/accept-native.mjs --live-secrets --live-textedit --report "$OUT/acceptance.json"
ACCEPT=$?
cd "$HOME/Developer/GitHub/cua-parity" && node scripts/native-baseline/prepare.mjs cleanup "$P"
CLEANUP=$?
echo "ACCEPT $ACCEPT CLEANUP $CLEANUP OUT $OUT"`;
async function accept(_item, ctx) {
  const {exec, log, evidence, now} = ctx, target = join(evidence, 'accept-native-main');
  if (existsSync(join(target, 'acceptance.json'))) throw new Stop(`${target}/acceptance.json already exists; move it aside before running again`);
  await gate('accept-native on main', ctx);
  const started = now();
  let text;
  try { text = exec('ssh', ['-o', 'BatchMode=yes', 'mini', 'bash -s'], {input: ACCEPT_REMOTE}); } catch (error) { text = String(error.stdout ?? ''); }
  const [, acceptCode, cleanupCode, out] = /ACCEPT (\d+) CLEANUP (\d+) OUT (\/tmp\/cua-115-accept\.\w+)/.exec(text) ?? [];
  frontAfter('accept-native on main', {exec, log});
  if (!out) throw new Stop('accept-native: the remote run printed no result line (it stopped before acceptance)');
  log(`accept-native: exit ${acceptCode} (0 PASS, 1 FAIL, 3 BLOCKED), cleanup exit ${cleanupCode}, report in mini:${out}`);
  mkdirSync(target, {recursive: true});
  try {
    exec('scp', ['-q', `mini:${out}/acceptance.json`, `${target}/acceptance.json`]);
    verifyAcceptance(JSON.parse(readFileSync(join(target, 'acceptance.json'), 'utf8')), {startedAt: started, finishedBy: now(), exitCode: acceptCode});
  } catch (error) {
    rmSync(join(target, 'acceptance.json'), {force: true});
    throw new Stop(`accept-native: the report did not copy and verify (${error.message}); it stays on the mini in ${out}`);
  }
  exec('ssh', ['-o', 'BatchMode=yes', 'mini', `rm -rf ${out}`]);
  if (cleanupCode !== '0') throw new Stop(`accept-native: the approved home's cleanup failed (exit ${cleanupCode}); see prepare.mjs's recovery message on the mini`);
  if (!['0', '3'].includes(acceptCode)) throw new Stop(`accept-native exited ${acceptCode}`);
}

// accept-native's report (scripts/accept-native.mjs on main: scenario, status, startedAt, finishedAt, summary, items):
// its own times fall inside this item (a minute's clock skew between the controller and the mini allowed), its status
// is the one its exit code reports, and it carries a non-empty item inventory, each item with an id and a status.
const STATUS_OF_EXIT = {0: 'PASS', 1: 'FAIL', 3: 'BLOCKED'};
export function verifyAcceptance(report, {startedAt, finishedBy, exitCode, skewMs = 60_000}) {
  if (!report || typeof report !== 'object' || report.scenario !== 'accept-native') throw new Error('not an accept-native report');
  if (!['PASS', 'FAIL', 'BLOCKED'].includes(report.status)) throw new Error('no status');
  if (STATUS_OF_EXIT[exitCode] !== report.status) throw new Error(`status ${report.status} does not match exit ${exitCode}`);
  const begun = Date.parse(report.startedAt), ended = Date.parse(report.finishedAt);
  if (!Number.isFinite(begun) || !Number.isFinite(ended) || ended < begun) throw new Error('no valid startedAt/finishedAt');
  if (begun < startedAt - skewMs || ended > finishedBy + skewMs) throw new Error('its startedAt/finishedAt fall outside this run');
  if (!Array.isArray(report.items) || !report.items.length || report.items.some(i => !Number.isInteger(i?.id) || typeof i.status !== 'string')) throw new Error('no item inventory');
  if (!report.summary || typeof report.summary !== 'object' || Object.keys(report.summary).length !== report.items.length) throw new Error('the summary does not match the items');
  return report;
}

const ITEMS = {vendor: baseline, browser: baseline, tz, 'tz-real-home': tz, accept};
export async function sequence(items, ctx) {
  for (const item of items) if (!ITEMS[item]) throw new Error(`unknown item ${item}; items: ${Object.keys(ITEMS).join(', ')}`);
  try {
    for (const item of items) await ITEMS[item](item, ctx);
    ctx.log(`sequence done: ${items.join(' ')}`);
  } catch (error) {
    if (error instanceof Stop && !/frontmost application is/.test(error.message)) {
      try { ctx.log(`front at the stop: ${frontmost(ctx)}`); } catch (frontError) { ctx.log(`front at the stop: unreadable (${frontError.message})`); }
    }
    ctx.log(`STOP: ${error.message}`);
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const logFile = join(EVIDENCE, 'mini-rules', 'sitting-log.txt');
  const log = line => { const text = `${new Date().toISOString()} ${line}`; console.log(text); appendFileSync(logFile, text + '\n'); };
  const ctx = {exec: liveExec, log, evidence: EVIDENCE, now: Date.now, sleep: ms => new Promise(r => setTimeout(r, ms)),
    run: (cmd, args) => spawnSync(cmd, args, {cwd: ROOT, stdio: 'inherit'}).status ?? 1};
  sequence(process.argv.slice(2), ctx).then(() => { process.exitCode = 0; }, error => { console.error(error.message); process.exitCode = error instanceof Stop ? 4 : 1; });
}
