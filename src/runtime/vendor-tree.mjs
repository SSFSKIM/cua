// The vendor's tree kept out of every own lookup (#171 M6a; the pre-flight's §3.3, §3.5): the Node lookup and the engine
// lookup (src/runtime/launch.mjs) and the scoped preflight's walk of the engine's lookup path (src/runtime/sandbox.mjs).
import {lstatSync, readlinkSync} from 'node:fs';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {realHome} from './layout.mjs';

// The absolute `path` resolved as the kernel resolves it, kept out of the vendor's tree, <home>/runtimes/ of the cua home
// `home` (#171 M6a; the pre-flight's §3.3, §3.5) -> {real} its real path, every component of which exists; {lead} where
// it enters the tree; or {missing} the first component that does not exist (or a loop of links). The walk takes the
// path's own components as spelled, `..` included, one at a time: a `..` climbs from the real directory reached so far,
// and a link's target, absolute or relative, is walked the same way in its place. It refuses a component that lies in
// the tree before it lstat-s or reads it, so nothing there is touched to find out. Every caller then uses `real`, and
// only `real`, for whatever it does next (its metadata, a version probe, the launch): the guard and the use resolve
// the same path. A spelling that lies in the tree as written is refused too. `home` undefined guards nothing (there is
// no tree to keep out of) but still resolves.
//
// As the kernel does, it requires every component it passes through to be a directory: one followed by more of the path
// (a `..`, or the `.` a trailing slash stands for, included) that is not is {notDirectory} (ENOTDIR), never skipped or
// climbed out of. {real} also carries `links`: where each symbolic link it followed lies (its directory's real path and
// its name), for the scoped preflight, which refuses one a cell could re-point (src/runtime/sandbox.mjs).
export function outsideVendorTree(path, home) {
  const roots = home === undefined ? [] : [...new Set([join(resolve(home), 'runtimes'), join(realHome(home), 'runtimes')])];
  const inTree = candidate => roots.some(root => candidate === root || candidate.startsWith(`${root}/`));
  if (inTree(resolve(path))) return {lead: resolve(path)};
  let pending = pathComponents(path);
  let current = '/';
  const links = [];
  while (pending.length) {
    const part = pending.shift();
    if (part === '.') continue;                                  // `current` is a directory: entering it required that
    if (part === '..') { current = dirname(current); continue; }
    const next = join(current, part);
    if (inTree(next)) return {lead: next};
    let stat;
    try { stat = lstatSync(next); } catch { return {missing: next}; }
    if (stat.isSymbolicLink()) {
      if (links.length >= 40) return {missing: next};
      links.push(next);
      const target = readlinkSync(next);
      pending = [...pathComponents(target), ...pending];
      if (isAbsolute(target)) current = '/';
      continue;
    }
    if (pending.length && !stat.isDirectory()) return {notDirectory: next};
    current = next;
  }
  return {real: current, links};
}
// A path's components as the kernel walks them: empty ones dropped, and a trailing slash kept as the `.` it means.
const pathComponents = path => [...path.split('/').filter(part => part !== ''), ...(path.endsWith('/') && path.replace(/\/+$/, '') !== '' ? ['.'] : [])];
