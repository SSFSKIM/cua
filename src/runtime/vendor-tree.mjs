// The vendor's tree kept out of every own lookup (#171 M6a; the pre-flight's §3.3, §3.5): the Node lookup and the engine
// lookup (src/runtime/launch.mjs), the sandbox helper's path and the scoped preflight's walk of the engine's lookup path
// (src/runtime/sandbox.mjs), and the git the secret store's project lookup runs (src/secrets/project.mjs). Since #171
// M6b (its pre-flight's §3.4) also out of install's and doctor's own reads and writes: the managed Node's paths
// (managed-node.mjs managedNodeIntoVendorTree), the sandbox helper's installed file (install.mjs), and staging/, which
// every lane that acquires a part refuses as a link before it touches it (stagingOutsideVendorTree).
import {accessSync, constants, lstatSync, readdirSync, readlinkSync, statSync} from 'node:fs';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {fail} from './errors.mjs';
import {homeLayout, realHome} from './layout.mjs';

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
// its name), for the scoped preflight, which refuses one a cell could re-point (src/runtime/sandbox.mjs). {lead} carries
// the links followed before it too, the first of them the one inside the home that leads away, for a remedy to name.
//
// The tree is kept out wherever it lies: <home>/runtimes as spelled and under the home's real path, and, when that entry
// is itself a link (the tree moved to another volume), where it leads, so the tree's files are refused by their physical
// path too (vendorTreeRoots).
export function outsideVendorTree(path, home) {
  const roots = home === undefined ? [] : vendorTreeRoots(home);
  const inTree = candidate => roots.some(root => candidate === root || candidate.startsWith(`${root}/`));
  if (inTree(resolve(path))) return {lead: resolve(path), links: []};
  let pending = pathComponents(path);
  let current = '/';
  const links = [];
  while (pending.length) {
    const part = pending.shift();
    if (part === '.') continue;                                  // `current` is a directory: entering it required that
    if (part === '..') { current = dirname(current); continue; }
    const next = join(current, part);
    if (inTree(next)) return {lead: next, links};
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
// The executable `command` as a PATH search finds it for a child that runs in `cwd` (`pathVariable`, the caller's PATH),
// with every entry that is, or leads, into the vendor's tree of the cua home `home` skipped before anything there is
// touched -> the real path of the first one found (the path to run, which is the one checked), or null. Each candidate
// is spelled as the search spells it, `<entry>/<command>`, and walked with its own components, `..` after a link
// included, as the kernel walks them; a relative entry, the empty one included, is taken against `cwd`, as it is for
// the child.
export function executableOutsideVendorTree(command, pathVariable, home, cwd) {
  for (const dir of (pathVariable ?? '').split(':')) {
    const {real} = outsideVendorTree(`${isAbsolute(dir) ? dir : `${cwd}/${dir}`}/${command}`, home);
    try { if (real && statSync(real).isFile()) { accessSync(real, constants.X_OK); return real; } } catch { /* the next entry */ }
  }
  return null;
}

// The roots of the vendor's tree of the cua home `home`: <home>/runtimes as spelled and under the home's real path, and,
// where that entry is a symbolic link, where it resolves by the same kernel-faithful walk (guarding nothing). Whether
// it is a link is read from the home's own listing, so a home whose runtimes/ is a directory, or absent, has nothing
// at or under it named by any call (the live judge counts the entry itself, the pre-flight's §3.5); only a link is
// read, its target walked, and nothing inside the tree. A home that is absent (or no directory) has no tree; one that
// cannot be listed leaves the boundary unknown, which is refused (layout_invalid), never read as "not a link".
function vendorTreeRoots(home) {
  const spelled = [...new Set([join(resolve(home), 'runtimes'), join(realHome(home), 'runtimes')])];
  const isLink = root => {
    let entries;
    try { entries = readdirSync(dirname(root), {withFileTypes: true}); } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
      fail('layout_invalid', `the cua home ${dirname(root)} cannot be listed (${error.code ?? error.message}), so whether its runtimes/ leads elsewhere, and so where the vendor's tree lies, cannot be established; nothing is resolved without it`,
        {hint: `let this user list ${dirname(root)} (chmod u+r)`});
    }
    return entries.some(entry => entry.name === 'runtimes' && entry.isSymbolicLink());
  };
  return [...new Set([...spelled, ...spelled.filter(isLink).map(root => outsideVendorTree(root).real).filter(Boolean)])];
}
// A path's components as the kernel walks them: empty ones dropped, and a trailing slash kept as the `.` it means.
const pathComponents = path => [...path.split('/').filter(part => part !== ''), ...(path.endsWith('/') && path.replace(/\/+$/, '') !== '' ? ['.'] : [])];

// Off only in a test, which shows that its recorder sees the mkdtemp this guard prevents (the negative control).
export const stagingGuard = {enabled: true};

// staging/ of the real cua home `home`, refused before anything is created or read there when it is, or leads, into the
// vendor's tree, or is a link or anything but a directory: target_occupied, naming what to move aside. A link there would
// take a lane's mkdtemp, its download, its unpacking and its cleanup's recursive delete wherever it leads. Every lane
// that acquires a part calls it before its first access to staging/ (the module tree, the sandbox helper, Node, the
// engine, and a local build's placing) -> the path, absent or a real directory.
export function stagingOutsideVendorTree(home) {
  const staging = homeLayout(home).staging;
  if (!stagingGuard.enabled) return staging;
  const {lead, links} = outsideVendorTree(staging, home);
  if (lead) fail('target_occupied', `${staging} leads to ${lead}, under the vendor's tree, and cua does not install through it`, {hint: `move ${links[0] ?? staging} aside first`});
  let stat = null;
  try { stat = lstatSync(staging); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (stat && !stat.isDirectory()) fail('target_occupied', `${staging} is a link or not a real directory; cua does not install through it`, {hint: `move ${staging} aside first`});
  return staging;
}
