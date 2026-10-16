// The native baseline on Linux: gedit on a declared Linux device’s recorded X session, driven by the vendor's sky_linux helper.
// What differs from macOS (./macos.mjs) is the target and its window: the run opens its own standalone gedit on a new
// empty file in a new /tmp directory, finds that window by the file name and binds it by X11 window id, so every
// observation and action is on the run's own window; it types with pressKey (./linux-cells.mjs says why) and clears the
// text after each task instead of closing a document; and it records what typeText, paste and the Linux binder's
// explicit refusals do, as method cases. Linux asks no per-app approval: any elicitation is declined and recorded.
//
// Ownership: a gedit the run opened is an entry {pid, dir, file, role}. A script ends a process only while its command
// line names the entry's file (so a reused pid is never someone else's process) and removes only the entry's own
// directory. The run refuses to start while any gedit runs, so every gedit window it sees during the run is its own.
import {basename} from 'node:path';
import {quote} from '../browser-parity/topology.mjs';
import * as cells from './cells.mjs';
import * as linux from './linux-cells.mjs';
import {assertDisplay, servePattern} from './remote.mjs';
import {sessionEnvironment} from '../repl-parity/devices.mjs';

const ROLES = ['scratch', 'victim'];
const DIR = /^\/tmp\/cua-native-baseline-[A-Za-z0-9]{6}$/;
const BIND_MS = 120_000;

// -> the entry, when it names a run-owned scratch process; throws otherwise. Every script that touches a process or a
// directory takes its entries through here.
export function ownedEntry(entry) {
  const {pid, dir, file, role} = entry ?? {};
  const ok = Number.isSafeInteger(pid) && pid > 1 && typeof dir === 'string' && DIR.test(dir) && ROLES.includes(role)
    && typeof file === 'string' && file.startsWith(`${dir}/`) && new RegExp(`^${role}-[0-9a-f]{6}\\.txt$`).test(file.slice(dir.length + 1));
  if (!ok) throw new Error(`not a run-owned scratch process: ${JSON.stringify(entry)}`);
  return {pid, dir, file, role};
}
const node = source => `node --input-type=module -e ${quote(source)}`;
// Whether `pid` is still the process that opened `file` (its command line names the file), in the scripts below.
const OURS = `const ours = (pid, file) => { try { return execFileSync('ps', ['-o', 'args=', '-p', String(pid)], {encoding: 'utf8'}).includes(file); } catch { return false; } };`;

// Opens a standalone gedit (its own process, not a window of a running instance) on a new empty file in a new run
// directory, detached from the ssh session, in the X session. Prints {pid, dir, file}.
export function spawnGeditScript({display, role, xSession, userHome}) {
  assertDisplay(display);
  if (!ROLES.includes(role)) throw new Error('role must be scratch or victim');
  return node(`import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
const dir = mkdtempSync("/tmp/cua-native-baseline-");
const file = join(dir, ${JSON.stringify(role)} + "-" + randomBytes(3).toString("hex") + ".txt");
writeFileSync(file, "");
const child = spawn("gedit", ["--standalone", file], {detached: true, stdio: "ignore", env: ${xSession === undefined ? `{...process.env, DISPLAY: ${JSON.stringify(display)}, XAUTHORITY: join(homedir(), ".Xauthority")}` : `{...Object.fromEntries(['PATH','LANG','LC_ALL','LC_CTYPE'].filter(k => process.env[k] !== undefined).map(k => [k,process.env[k]])), ...${JSON.stringify(sessionEnvironment(xSession))}, HOME: ${JSON.stringify(userHome ?? null)} ?? homedir()}`} });
child.once("error", e => { console.error(e.message); process.exitCode = 1; });
if (child.pid) { child.unref(); console.log(JSON.stringify({pid: child.pid, dir, file})); }`);
}

// "survived" while the entry's process still runs `waitMs` from now (polled: a crashing process can take a moment to go,
// while its core is written), "exited" as soon as it has gone.
export function targetStateScript(entry, {waitMs = 5000} = {}) {
  const {pid, file} = ownedEntry(entry);
  return node(`import {execFileSync} from 'node:child_process';
${OURS}
const end = Date.now() + ${Number(waitMs)};
let alive = ours(${pid}, ${JSON.stringify(file)});
while (alive && Date.now() < end) { await new Promise(r => setTimeout(r, 250)); alive = ours(${pid}, ${JSON.stringify(file)}); }
console.log(alive ? "survived" : "exited");`);
}

// Ends each entry's process (SIGTERM, then SIGKILL after 3 s) while it is provably the entry's own, and removes the
// entry's directory. Prints {terminated, notOwned (a running pid that names another file: left alone), gone, removed}.
export function terminateScript(entries) {
  const owned = entries.map(ownedEntry);
  return node(`import {execFileSync} from 'node:child_process';
import {existsSync, rmSync} from 'node:fs';
${OURS}
const running = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const result = {terminated: [], notOwned: [], gone: [], removed: []};
for (const {pid, dir, file} of ${JSON.stringify(owned)}) {
  if (ours(pid, file)) {
    process.kill(pid, 'SIGTERM');
    const end = Date.now() + 3000;
    while (ours(pid, file) && Date.now() < end) await new Promise(r => setTimeout(r, 100));
    if (ours(pid, file)) process.kill(pid, 'SIGKILL');
    result.terminated.push(pid);
  } else (running(pid) ? result.notOwned : result.gone).push(pid);
  if (existsSync(dir)) { rmSync(dir, {recursive: true, force: true}); result.removed.push(dir); }
}
console.log(JSON.stringify(result));`);
}

// The running sky_linux helpers, one per line: elapsed seconds and command line.
export const LINUX_HELPER_SCRIPT = `ps -eo etimes=,args= | grep -E '/sky_linux[A-Za-z0-9_]*( |$)' | grep -v grep || true`;
export function classifyLinuxHelpers(output, runtimeRoot) {
  return String(output).split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const [, age, path] = line.match(/^(\d+)\s+(\S+)/) ?? [null, null, line];
    return {path: path.replace(/^\/home\/[^/]+/, '~'), origin: runtimeRoot && path.startsWith(`${runtimeRoot}/`) ? 'pinned runtime' : 'another installation',
      ageSeconds: age === null ? null : Number(age)};
  });
}
// What the run may have left: serves of the clone and gedit processes, as two counts.
const leftoverScript = checkout => `printf '%s %s\\n' "$(pgrep -f ${quote(servePattern(checkout))} | wc -l | tr -d ' ')" "$(pgrep -x gedit | wc -l | tr -d ' ')"`;
// The crash reports apport keeps for gedit: how many, and the newest one's time (a GTK3 crash under typeText or paste
// may add one; apport keeps one per program until it is reported, so the count alone can stay the same).
const CRASH_SCRIPT = `node --input-type=module -e ${quote(`import {readdirSync, statSync} from 'node:fs';
let names = []; try { names = readdirSync('/var/crash').filter(n => /gedit.*\\.crash$/.test(n)); } catch {}
const times = names.map(n => statSync('/var/crash/' + n).mtimeMs).sort((a, b) => b - a);
console.log(JSON.stringify({files: names.length, newest: times.length ? new Date(times[0]).toISOString() : null}));`)}`;

// The device operations of a Linux run, over `remote(script) -> stdout`.
export function linuxDevice(remote, {display, checkout, runtimeRoot, xSession, userHome}) {
  return {
    spawnGedit(role) {
      const line = remote(spawnGeditScript({display, role, xSession, userHome})).split('\n').at(-1);
      return ownedEntry({...JSON.parse(line), role});
    },
    targetState: (entry, options) => remote(targetStateScript(entry, options)).trim(),
    terminate: entries => (entries.length ? JSON.parse(remote(terminateScript(entries)).split('\n').at(-1)) : {terminated: [], notOwned: [], gone: [], removed: []}),
    helpers: () => classifyLinuxHelpers(remote(LINUX_HELPER_SCRIPT), runtimeRoot),
    leftovers() { const [serves, geditRunning] = remote(leftoverScript(checkout)).split(' ').map(Number); return {serves, geditRunning}; },
    crashReports: () => JSON.parse(remote(CRASH_SCRIPT).split('\n').at(-1)),
  };
}

// The Linux adapter of scripts/native-baseline.mjs's run.
export const linuxAdapter = {
  platform: 'linux',
  target: 'gedit',
  device: (remote, {pre, display}) => linuxDevice(remote, {display, checkout: pre.checkout, runtimeRoot: pre.runtimeRoot, xSession: pre.xSession, userHome: pre.userHome}),
  // Linux asks no per-app approval (src/mcp/surface.mjs LINUX_COMPUTER_RULES): nothing is accepted.
  answer: () => ({action: 'decline'}),
  refuse(pre) {
    if (pre.geditRunning) return 'gedit is running on the device: its windows may be the owner\'s; close it (or wait) and re-run';
    if (!pre.display) return `the X display ${pre.x?.display ?? '?'} did not answer xdpyinfo with the recorded X-session environment; run inside the device's X session`;
    if (!pre.gedit) return 'gedit is not installed on the device';
    return null;
  },
  start(meta, pre) { meta.gedit = {version: pre.gedit, owned: [], targetCleanup: [], crashReportsBefore: null}; meta.x = pre.x; },

  async gui(ctx) {
    const {meta, device, guard, js, row, emit, measure} = ctx;
    meta.gedit.crashReportsBefore = device.crashReports();
    const open = role => { const entry = device.spawnGedit(role); meta.gedit.owned.push(entry); return entry; };
    const scratch = open('scratch');
    const found = guard(await js(linux.findWindow(basename(scratch.file)), BIND_MS), 'finding the scratch window');
    row('setup.findWindow', 1, found);
    if (!found.cell?.ok) throw new Error(`the scratch gedit window did not appear: ${found.cell?.error ?? found.failure}`);
    const bind = guard(await js(linux.bind(found.cell.value.windowId), BIND_MS), 'cua.getApp({windowId})');
    const approvals = ctx.elicited();
    row('bind.getApp', 1, bind, {approvals: approvals.length});
    approvals.forEach((a, i) => emit({op: 'approval.elicitation', sample: i + 1, ok: false, wallMs: Math.round((a.at - bind.started) * 1000) / 1000, action: a.action,
      error: 'declined: Linux asks no per-app approval, so the harness accepts none'}));
    meta.service = {surface: 'computer', engine: 'sky', answered: 'vendor', ...ctx.helperAttestation()};
    if (!bind.cell?.ok) throw new Error(`cua.getApp({windowId}) failed: ${bind.cell?.error ?? bind.failure}`);

    await measure('warm.getAXState', ctx.samples, linux.AX_FULL);
    await measure('warm.getScreenshot', ctx.samples, cells.SCREENSHOT);

    for (let sample = 1; sample <= ctx.tasks; sample++) {
      const steps = [];
      const act = guard(await js(linux.TASK_ACT), `task ${sample}`);
      steps.push(row('task.act', sample, act));
      if (act.cell?.ok) steps.push(row('task.verify', sample, guard(await js(linux.TASK_VERIFY), `task ${sample}`)));
      // Cleared even when the act failed part way: whatever it typed is in the run's own window.
      const clear = guard(await js(linux.TASK_CLEAR), `task ${sample}`);
      steps.push(row('task.clear', sample, clear));
      const ok = steps.length === 3 && steps.every(s => s.ok);
      const sum = key => Math.round(steps.reduce((total, s) => total + (s[key] ?? 0), 0) * 1000) / 1000;
      emit({op: 'task.total', sample, ok, wallMs: sum('wallMs'), inCellMs: sum('inCellMs'), cells: steps.length, actions: sum('actions'), observations: sum('observations'),
        outcome: ok ? 'typed with pressKey, verified, cleared' : steps.find(s => !s.ok)?.error ?? 'failed'});
      ctx.log(`task ${sample}: ${ok ? 'ok' : 'FAIL'}`);
      if (!clear.cell?.ok) ctx.stop(`task ${sample}'s text could not be confirmed cleared: ${clear.cell?.error ?? clear.failure}`);
    }

    // The method cases, after every timed sample: those that may take their window down run on a window of their own.
    for (const [op, {ownWindow, code}] of Object.entries(linux.METHOD_CASES)) {
      let target = scratch;
      if (ownWindow) {
        target = open('victim');
        const where = guard(await js(linux.findWindow(basename(target.file)), BIND_MS), `${op}'s window`);
        row('setup.findTarget', 1, where, {for: op});
        if (!where.cell?.ok) throw new Error(`${op}'s gedit window did not appear: ${where.cell?.error ?? where.failure}`);
        const bound = guard(await js(linux.bind(where.cell.value.windowId, '__target'), BIND_MS), `binding ${op}'s window`);
        if (!bound.cell?.ok) throw new Error(`binding ${op}'s window failed: ${bound.cell?.error ?? bound.failure}`);
      }
      const r = guard(await js(code), op);
      const state = device.targetState(target, {waitMs: ownWindow ? 5000 : 0});
      // Where the method returned and its window survived, whether its text went in is read back. A read-back that fails
      // leaves the sample without that observation: it is recorded as failed, never as text that went in.
      let readBack = {}, readBackError = null;
      if (ownWindow && state === 'survived' && r.cell?.value?.outcome === 'returned') {
        const back = guard(await js(linux.INSERTED), `${op}'s read-back`);
        if (back.cell?.ok && typeof back.cell.value?.inserted === 'boolean') readBack = {inserted: back.cell.value.inserted};
        else readBackError = back.cell?.error ?? back.failure ?? 'no read-back result';
      }
      const sample = ctx.record(op, 1, r, {target: state, ...readBack});
      emit(readBackError ? {...sample, ok: false, error: `read-back failed: ${readBackError}`} : sample);
      // The method's own window is ended (or found gone) and its directory removed now; the record says which.
      if (ownWindow) meta.gedit.targetCleanup.push({op, ...device.terminate([target])});
      ctx.log(`${op}: ${r.cell?.value?.outcome ?? 'failed'}${r.cell?.value?.methodError ? ` (${r.cell.value.methodError})` : ''}, window ${state}`);
    }
  },

  // Every gedit the run opened is ended and its directory removed, whatever happened (ending the run's own process is
  // not GUI input, so it is safe after a stop too).
  async cleanup(ctx) {
    const {meta, device} = ctx;
    if (!meta.gedit || !device) return;
    meta.gedit.cleanup = device.terminate(meta.gedit.owned);
    try { meta.gedit.crashReportsAfter = device.crashReports(); } catch {}
  },
  leftovers: device => device.leftovers(),
  leftBehind: leftovers => leftovers.serves > 0 || leftovers.geditRunning > 0,
};
