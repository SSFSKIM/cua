// The device-side reads, launches and writes the macOS scenes need (./scenes-mac.mjs), run on the Mac that shows the
// scenes; promoted in M1b from the M0 spike's scripts/spike/engine/scene-processes.mjs. Which processes run a bundle id
// and which is frontmost (lsappinfo, which answers over ssh as it does at the console), a process's windows and the
// front window (FrontWindowProbe, scripts/accept/front-window.swift: pids, window numbers and bounds, never a name),
// `open` through LaunchServices, one recorded process put back in front (./activate-process.swift), the stop of a
// process the run launched, and Finder's three window-chrome preference keys (./scenes-mac-finder.mjs). Nothing here reads a window title, an accessibility value, a process's environment or
// any preference but those three keys, and nothing signals a process the run did not record at its launch.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {awaitLaunch, isSameLaunch, launchOf, quitOwned} from '../accept/fixture-app.mjs';
import {FRONT_WINDOW_SCRIPT, FRONTMOST_PROCESS_SCRIPT, parseFrontmostProcess} from '../accept/key-guard.mjs';
import {FINDER_DOMAIN, FINDER_KEYS, parsePreference} from './scenes-mac-finder.mjs';

const run = (cmd, args, options = {}) => execFileSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000, ...options});

// `lsappinfo find bundleid=<id>` prints the matching apps' ASNs (`ASN:0x0-0x2b02b-"Finder":`); -> ['ASN:0x0-0x2b02b'].
export const parseAsns = text => [...String(text).matchAll(/ASN:0x[0-9a-fA-F]+-0x[0-9a-fA-F]+/g)].map(m => m[0]);
// `lsappinfo info -only pid,bundleid <asn>`: `"pid"=736` and `"CFBundleIdentifier"="<id>"` (macOS 26), or the older
// `pid = 736` and `bundleID="<id>"`. -> {pid, bundleId} or null without a pid.
export const parseAppInfo = parseFrontmostProcess;

// The processes LaunchServices knows running `bundleId`. -> [{pid, bundleId}].
export function runningApps(bundleId, {exec = run} = {}) {
  return parseAsns(exec('/usr/bin/lsappinfo', ['find', `bundleid=${bundleId}`])).flatMap(asn => {
    const info = parseAppInfo(exec('/usr/bin/lsappinfo', ['info', '-only', 'pid,bundleid', asn]));
    return info && info.bundleId === bundleId ? [info] : [];
  });
}
// The frontmost application's process, the key guard's reading. -> {pid, bundleId} or null.
export function frontmostProcess({exec = run} = {}) {
  try { return parseFrontmostProcess(exec('/bin/sh', ['-c', FRONTMOST_PROCESS_SCRIPT], {timeout: 5000})); } catch { return null; }
}

const probe = (args, {exec = run} = {}) => JSON.parse(exec('/usr/bin/swift', [FRONT_WINDOW_SCRIPT, ...args], {timeout: 120_000}));
// FrontWindowProbe's frontmost application and top window. -> {at, frontmost: {bundleId, pid} | null, topWindow | null}.
export const frontWindow = options => probe(['front'], options);
// A process's layer-0 windows, front to back. -> [{ownerPid, number, bounds, onScreen}].
export const appWindows = (pid, options) => appWindowState(pid, options).windows;
// The same reading with whether the app is hidden (Cmd-H; null when LaunchServices does not know the pid). -> {windows, hidden}.
export const appWindowState = (pid, options) => { const {windows, hidden} = probe(['windows', String(pid)], options); return {windows, hidden}; };

// `open` through LaunchServices, so a GUI app comes up in the console's session even over ssh. `-g` keeps the launch
// from activating anything; `-n` makes a new instance rather than handing the request to a running one.
export function openApp({app, files = [], args = [], newInstance = false}, {exec = run} = {}) {
  exec('/usr/bin/open', ['-g', ...(newInstance ? ['-n'] : []), '-a', app, ...files, ...(args.length ? ['--args', ...args] : [])]);
}
// Activates the running app at `app` (no -g: bringing it to the front is the point; no -n: the running instance).
export function activateApp(app, {exec = run} = {}) { exec('/usr/bin/open', ['-a', app]); }
// The owner's front app put back at the end, addressed by the process recorded in front (./activate-process.swift):
// `open -b` would take the bundle id alone, so it could pick another instance of the app or launch one when the
// recorded process has exited. -> {activated, reason?}.
export const ACTIVATE_PROCESS_SCRIPT = fileURLToPath(new URL('./activate-process.swift', import.meta.url));
export function activateProcess({pid, bundleId}, {exec = run} = {}) {
  return JSON.parse(exec('/usr/bin/swift', [ACTIVATE_PROCESS_SCRIPT, String(pid), bundleId], {timeout: 120_000}));
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

// How `defaults read` says a key is unset (exit 1): macOS 26 "The domain/default pair of (<domain>, <key>) does not
// exist", macOS 27 "Error: Could not find key '<key>' in domain '<domain>'." (the mini's goldens recording, 2026-10-20).
const UNSET_KEY = /does not exist|Could not find key/;
const withStderr = {stdio: ['ignore', 'pipe', 'pipe']};
const failure = error => String(error.stderr || error.message).trim();

// One window-chrome key as `defaults` reads it: a Boolean, or null for an unset key, which is a state of its own (what
// Finder then draws is its own; the scene reads it off the window). Any other failure throws, so an unreadable key is
// never taken for an unset one.
function readFinderPreference(key, exec) {
  let text;
  try { text = exec('/usr/bin/defaults', ['read', FINDER_DOMAIN, key], withStderr); } catch (error) {
    if (error.status === 1 && UNSET_KEY.test(String(error.stderr ?? ''))) return null;
    throw new Error(`could not read Finder's ${key} preference: ${failure(error)}`);
  }
  return parsePreference(text);
}
// Finder's three window-chrome keys. -> {key: true | false | null}.
export const readFinderPreferences = ({exec = run} = {}) => Object.fromEntries(FINDER_KEYS.map(key => [key, readFinderPreference(key, exec)]));
// Writes one of the three keys back: a Boolean, or null to delete it (unset, as it was). A delete that fails is checked
// by reading the key: already unset is the goal reached (defaults refuses to delete an absent key), anything else throws.
export function writeFinderPreference(key, value, {exec = run} = {}) {
  if (!FINDER_KEYS.includes(key)) throw new Error(`${key} is not one of the Finder keys the scene changes (${FINDER_KEYS.join(', ')})`);
  if (value !== null) { exec('/usr/bin/defaults', ['write', FINDER_DOMAIN, key, '-bool', value ? 'true' : 'false']); return; }
  try { exec('/usr/bin/defaults', ['delete', FINDER_DOMAIN, key], withStderr); } catch (error) {
    if (readFinderPreference(key, exec) !== null) throw new Error(`could not delete Finder's ${key} preference: ${failure(error)}`);
  }
}
