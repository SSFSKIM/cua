// An in-memory, macOS-shaped filesystem for the seatbelt port's filesystem seam (src/sandbox/seatbelt.mjs): the
// top-level aliases (/tmp, /var and /etc, symlinks into /private), the scratch directories the original looks at, and
// whatever a golden fixture's `setup` creates under its root. It lets the fixtures replay byte for byte on any OS.
import {posix} from 'node:path';

const fsError = (code, path) => Object.assign(new Error(`${code}: ${path}`), {code});
const stats = node => ({isSymbolicLink: () => node.type === 'link', isDirectory: () => node.type === 'dir', isFile: () => node.type === 'file'});

export function virtualFs({root = null, setup = [], fill = value => value} = {}) {
  const tree = new Map([['/', {type: 'dir'}]]);
  const mkdirp = path => {
    let current = '';
    for (const part of path.split('/').filter(Boolean)) {
      current += `/${part}`;
      if (!tree.has(current)) tree.set(current, {type: 'dir'});
    }
  };
  for (const dir of ['/private/tmp', '/private/var/tmp', '/private/var/folders', '/private/etc', '/Applications', '/Users']) mkdirp(dir);
  tree.set('/tmp', {type: 'link', target: 'private/tmp'});
  tree.set('/var', {type: 'link', target: 'private/var'});
  tree.set('/etc', {type: 'link', target: 'private/etc'});
  if (root) mkdirp(root);
  for (const item of setup) {
    const path = posix.join(root, item.dir ?? item.file ?? item.symlink);
    if (item.dir !== undefined) mkdirp(path);
    else {
      mkdirp(posix.dirname(path));
      tree.set(path, item.file !== undefined ? {type: 'file', content: fill(item.content ?? '')} : {type: 'link', target: fill(item.target)});
    }
  }

  // The real path of `path` and its node, following symlinks in every component (and the last when `follow`).
  function resolve(path, follow) {
    let pending = path.split('/').filter(Boolean);
    let current = '/';
    for (let hops = 0; pending.length;) {
      const [name, ...rest] = pending;
      const parent = tree.get(current);
      if (parent.type !== 'dir') throw fsError('ENOTDIR', path);
      const child = current === '/' ? `/${name}` : `${current}/${name}`;
      const node = tree.get(child);
      if (!node) throw fsError('ENOENT', path);
      if (node.type === 'link' && (rest.length || follow)) {
        if (++hops > 40) throw fsError('ELOOP', path);
        const target = node.target.startsWith('/') ? node.target : posix.join(current, node.target);
        pending = [...target.split('/').filter(Boolean), ...rest];
        current = '/';
        continue;
      }
      current = child;
      pending = rest;
    }
    return {real: current, node: tree.get(current)};
  }

  return {
    lstat: path => stats(resolve(path, false).node),
    stat: path => stats(resolve(path, true).node),
    realpath: path => resolve(path, true).real,
    readFile: path => {
      const {node} = resolve(path, true);
      if (node.type !== 'file') throw fsError('EISDIR', path);
      return node.content;
    },
  };
}
