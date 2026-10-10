// Who is on the other end of a client-mode relay socket (docs/doperpowers/specs/2026-10-09-maws-socket-peer-auth-design.md,
// "The addon" and "The policy"): the loader of the peer identity addon (native/peer-auth/peer-auth.c, three system
// calls) and the policy over it, the same in shape as MAWS's src/main/browser/cua/peer.ts. A peer is accepted by where it
// sits in the process tree: it runs as this user and descends from a root, a process instance {pid, start} captured when
// it became known and re-verified on every walk, so a root whose pid now names another process matches nothing. The
// kernel reports the peer's pid and uid; the process table each process's parent and start time (microseconds since the
// epoch). Nothing here logs.
//
// The addon's exports: peer(fd) → {pid, uid} (throws a plain Error carrying the system error); process(pid) →
// {ppid, start} or null for a gone or unreadable pid; version.
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Pins the addon's exported `version`; an addon reporting another is refused at load (fail closed).
export const PEER_AUTH_VERSION = 1;
export const ANCESTRY_LIMIT = 64; // parents walked up from the peer at most

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The committed prebuild under the package root (package.json `files` ships native/).
export const peerAddonPath = (root = PACKAGE_ROOT) => join(root, 'native', 'peer-auth', 'prebuilds', 'darwin-arm64', 'peer-auth.node');

// The addon, or null when it cannot serve: not Apple silicon macOS (not tried), a missing or unloadable file, or exports
// of another shape or version.
export function loadPeerAddon(path, host = process) {
  if (host.platform !== 'darwin' || host.arch !== 'arm64') return null;
  const module = {exports: {}};
  try {
    process.dlopen(module, path);
  } catch {
    return null;
  }
  const {peer, process: lookup, version} = module.exports;
  if (typeof peer !== 'function' || typeof lookup !== 'function' || version !== PEER_AUTH_VERSION) return null;
  return {peer, process: lookup, version};
}

// The live instance of `pid` as a root, or null when the process is gone.
export function rootOf(pid, addon) {
  const info = addon.process(pid);
  return info ? {pid, start: info.start} : null;
}

// The accepted socket's descriptor (libuv's pipe handle exposes it; Node offers no peer credentials of its own).
export function socketFd(socket) {
  const fd = socket._handle?.fd;
  return typeof fd === 'number' && fd >= 0 ? fd : null;
}

const isLive = (root, lookup) => lookup(root.pid)?.start === root.start;

// Whether `pid`, or a parent of it at most ANCESTRY_LIMIT steps up, is a root whose live start is the stored one. The
// walk ends at launchd (1), the kernel (0), a gone process or the limit.
export function descends(pid, roots, lookup) {
  let current = pid;
  for (let steps = 0; steps <= ANCESTRY_LIMIT; steps += 1) {
    if (current === 0 || current === 1) return false;
    const info = lookup(current);
    if (!info) return false;
    if (roots.some(root => root.pid === current && root.start === info.start)) return true;
    current = info.ppid;
  }
  return false;
}

// The verdict on an accepted socket's peer: the first refusal {reason, pid}, or null to accept. Reasons, in the order
// they are checked: module_unavailable, peer_unavailable, uid_mismatch, no_root, not_descendant. `roots` is every root
// the socket answers to; `now` is the accept time in milliseconds since the epoch, and `uid` this process's user.
export function authorizePeer(fd, roots, {addon, now, uid}) {
  if (!addon) return {reason: 'module_unavailable', pid: null};
  const read = () => {
    if (typeof fd !== 'number') return null;
    try {
      return addon.peer(fd);
    } catch {
      return null;
    }
  };
  const peer = read();
  if (!peer) return {reason: 'peer_unavailable', pid: null};
  const {pid} = peer;
  if (peer.uid !== uid) return {reason: 'uid_mismatch', pid};
  const live = roots.filter(root => isLive(root, addon.process));
  if (live.length === 0) return {reason: 'no_root', pid};
  // A peer started after the accept is not the process that connected: that one is gone and its pid reused.
  const info = addon.process(pid);
  if (!info || info.start > now * 1000 || !descends(pid, live, addon.process)) return {reason: 'not_descendant', pid};
  // LOCAL_PEERPID names the peer socket's last operator: a descriptor handed to another process during the walk shows here.
  if (read()?.pid !== pid) return {reason: 'not_descendant', pid};
  return null;
}
