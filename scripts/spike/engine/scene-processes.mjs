// The device-side reads and launches the spike's scenes need (scripts/spike/engine/scenes.mjs), run on the Mac that shows
// the scenes: which processes run a bundle id (lsappinfo, which answers over ssh as it does at the console), a process's
// windows and the front window (FrontWindowProbe, ./front-window.swift: pids, window numbers and bounds, never a name),
// `open` through LaunchServices, and the stop of a process the run launched. Nothing here reads a window title, an
// accessibility value or a process's environment, and nothing signals a process the run did not record at its launch.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {awaitLaunch, isSameLaunch, launchOf, quitOwned} from '../../accept/fixture-app.mjs';

export const FRONT_WINDOW_SCRIPT = fileURLToPath(new URL('./front-window.swift', import.meta.url));
const run = (cmd, args, options = {}) => execFileSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000, ...options});

// `lsappinfo find bundleid=<id>` prints the matching apps' ASNs (`ASN:0x0-0x2b02b-"Finder":`); -> ['ASN:0x0-0x2b02b'].
export const parseAsns = text => [...String(text).matchAll(/ASN:0x[0-9a-fA-F]+-0x[0-9a-fA-F]+/g)].map(m => m[0]);
// `lsappinfo info -only pid,bundleid <asn>`: `"pid"=736` and `"CFBundleIdentifier"="<id>"` (macOS 26), or the older
// `pid = 736` and `bundleID="<id>"`. -> {pid, bundleId} or null without a pid.
export function parseAppInfo(text) {
  const pid = Number(/"?pid"?\s*=\s*(\d+)/.exec(text)?.[1]);
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  return {pid, bundleId: /(?:bundleID|"CFBundleIdentifier")="([^"]+)"/.exec(text)?.[1] ?? null};
}

// The processes LaunchServices knows running `bundleId`. -> [{pid, bundleId}].
export function runningApps(bundleId, {exec = run} = {}) {
  return parseAsns(exec('/usr/bin/lsappinfo', ['find', `bundleid=${bundleId}`])).flatMap(asn => {
    const info = parseAppInfo(exec('/usr/bin/lsappinfo', ['info', '-only', 'pid,bundleid', asn]));
    return info && info.bundleId === bundleId ? [info] : [];
  });
}

const probe = (args, {exec = run} = {}) => JSON.parse(exec('/usr/bin/swift', [FRONT_WINDOW_SCRIPT, ...args], {timeout: 120_000}));
// FrontWindowProbe's frontmost application and top window. -> {at, frontmost: {bundleId, pid} | null, topWindow | null}.
export const frontWindow = options => probe(['front'], options);
// A process's layer-0 windows, front to back. -> [{ownerPid, number, bounds, onScreen}].
export const appWindows = (pid, options) => probe(['windows', String(pid)], options).windows;

// `open` through LaunchServices, so a GUI app comes up in the console's session even over ssh. `-g` keeps the launch
// from activating anything; `-n` makes a new instance rather than handing the request to a running one.
export function openApp({app, files = [], args = [], newInstance = false}, {exec = run} = {}) {
  exec('/usr/bin/open', ['-g', ...(newInstance ? ['-n'] : []), '-a', app, ...files, ...(args.length ? ['--args', ...args] : [])]);
}

// The one process of `bundleId` this run's `open` started (none running before, launched no earlier than the second
// the open began), polled for up to `boundMs`. -> {pid, at}; throws when none or several appeared.
export async function awaitOwnLaunch({bundleId, before, startedAt, boundMs = 20_000, apps = runningApps, launch = launchOf}) {
  const found = await awaitLaunch({pids: () => apps(bundleId).map(app => app.pid), before, startedAt, launchOf: launch, boundMs});
  if (!found.launch) throw new Error(found.candidates.length > 1 ? `${found.candidates.length} new ${bundleId} processes appeared; none is recorded as the run's`
    : `no ${bundleId} process appeared within ${boundMs} ms`);
  return found.launch;
}

// Stops a process the run recorded at its launch ({pid, at}), only while that pid is still that launch. -> {stopped,
// remaining, skipped?}: `skipped` names why nothing was signalled (gone, or the pid now belongs to another process).
export async function stopRecorded(record, {sameLaunch = isSameLaunch, quit = quitOwned} = {}) {
  if (!record?.pid) return {stopped: [], remaining: [], skipped: 'not recorded'};
  if (!sameLaunch(record)) return {stopped: [], remaining: [], skipped: 'gone or no longer the run\'s launch'};
  const {quit: stopped, remaining} = await quit([record.pid]);
  return {stopped, remaining};
}
