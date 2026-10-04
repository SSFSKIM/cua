// M9 backend selection: which sockets may the probe hand to the vendor browser service? Only sockets held by a
// running "ChatGPT for Chrome" native host whose parent is the user's own Google Chrome, read from `lsof` for that
// pid. The shared socket directory is never listed or scanned, so a stale socket file cannot be selected, and no
// socket path is ever written to a report (callers report counts only).
import {execFileSync} from 'node:child_process';

export const CHROME_EXECUTABLE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const HOST_BASENAME = 'ChatGPT for Chrome';
export const DESKTOP_EXECUTABLES = ['/Applications/ChatGPT.app/Contents/MacOS/ChatGPT', '/Applications/Codex.app/Contents/MacOS/Codex'];
export const VENDOR_REQUIREMENT = '=anchor apple generic and certificate leaf[subject.OU] = "2DC432GLL2"';
const SOCKET = /^n((?:\/private)?\/tmp\/codex-browser-use\/[A-Fa-f0-9-]+\.sock)$/;
const TOOL_TIMEOUT_MS = 5000;

// `ps -axo pid=,ppid=,comm=`: comm is the full executable path and may contain spaces, so it is the rest of the line.
export function parsePs(text) {
  return text.split('\n').map(line => line.match(/^\s*(\d+)\s+(\d+)\s+(.*?)\s*$/)).filter(Boolean)
    .map(([, pid, ppid, executable]) => ({pid: Number(pid), ppid: Number(ppid), executable}));
}

// `lsof -F n` lines for one process -> its distinct live codex-browser-use socket paths.
export function parseLsofSockets(text) {
  return [...new Set(text.split('\n').map(line => line.match(SOCKET)?.[1]).filter(Boolean))];
}

export function selectBackends({processes, lsof}) {
  const byPid = new Map(processes.map(p => [p.pid, p]));
  const all = processes.filter(p => p.executable.endsWith(`/${HOST_BASENAME}`));
  const hosts = all.filter(p => byPid.get(p.ppid)?.executable === CHROME_EXECUTABLE).map(p => {
    const text = lsof(p.pid);
    return {pid: p.pid, executable: p.executable, sockets: text == null ? [] : parseLsofSockets(text), ...(text == null ? {lsofFailed: true} : {})};
  });
  return {
    hosts,
    rejectedHosts: all.length - hosts.length,
    sockets: [...new Set(hosts.flatMap(h => h.sockets))],
    hostExecutables: [...new Set(hosts.map(h => h.executable))],
  };
}

export const desktopRunning = processes => processes.some(p => DESKTOP_EXECUTABLES.includes(p.executable));

export function listProcesses() {
  return parsePs(execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,comm='], {encoding: 'utf8', timeout: TOOL_TIMEOUT_MS}));
}

export function lsofUnix(pid) {
  try { return execFileSync('/usr/sbin/lsof', ['-n', '-a', '-p', String(pid), '-U', '-F', 'n'], {encoding: 'utf8', timeout: TOOL_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore']}); } catch { return null; }
}

// Strict Apple-anchor + OpenAI team check; true only when codesign accepts the requirement.
export function verifiedVendor(path) {
  try { execFileSync('/usr/bin/codesign', ['--verify', '--strict', '-R', VENDOR_REQUIREMENT, path], {stdio: 'ignore', timeout: 15_000}); return true; } catch { return false; }
}
