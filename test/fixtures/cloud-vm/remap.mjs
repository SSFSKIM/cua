// A fake VM's file system for the cloud template's tests (test/fixtures/cloud-vm/vm.mjs). The paths a provisioner or
// update.sh's remote commands name on the VM move under a scratch root, so the scripts run here unprivileged, on any
// host. It is fail-closed, because the scripts run as the test's user and the host may itself be a VM this template
// made, its /opt/cua that user's own: every absolute path in the text is placed or kept by name, and any other refuses
// the whole text before any of it runs.
import {lstatSync} from 'node:fs';
import {posix} from 'node:path';

// Moved under the root, with everything below them.
const MOVED = ['/etc', '/var/cache', '/var/lib', '/var/log', '/opt', '/usr/local', '/usr/share', '/root', '/run', '/dev/dri'];
// Kept as they are, by exact name: programs the scripts run and paths they only name (a PATH entry, a heredoc's text,
// a D-Bus object path, the checklist's `/secret` command).
const KEPT = new Set(['/', '/bin', '/usr/bin', '/bin/bash', '/bin/sh', '/usr/bin/env', '/dev/null', '/usr/bin/google-chrome-stable',
  '/usr/libexec/at-spi-bus-launcher', '/org/a11y/bus', '/secret']);
// An absolute path: a slash where a shell word starts (the line's start, after a delimiter, or after an opening quote),
// up to the first character a path here never holds. A slash after `$HOME"` or `${x}` continues a word.
const START = String.raw`[\s(=<>|;&:,\x60]`;
const ABSOLUTE = new RegExp(String.raw`(?<=^|${START}|(?:^|${START})["'])(\/[^\s'"();|&<>\x60:,=]*)`, 'g');
const under = (path, dir) => path === dir || path.startsWith(`${dir}/`);

// `text` with each VM path under `root`. A path inside `scratch` (the run's own directory, which holds the root) stays.
// A whole-line comment (the shebang included) runs nothing and stays as it is: the scripts' comments name paths of
// every kind. Everything else on every other line is checked.
export function remap(text, root, scratch = posix.dirname(root)) {
  return text.split('\n').map(line => /^\s*#/.test(line) ? line : placeLine(line, root, scratch)).join('\n');
}

const refuse = (path, why) => { throw new Error(`the fake VM would not place ${path}: ${why}`); };

// A path is judged as the shell will spell it under the root. So `//` is left only as jq's operator or as a URL's
// authority (a scheme right before it), and any `..` segment refuses the text: prefixed with the root, enough of them
// would climb back out of it.
function placeLine(line, root, scratch) {
  return line.replace(ABSOLUTE, (path, _path, offset) => {
    if (path === '//') return path;   // jq's `//` and `//=`
    if (path.startsWith('//')) {
      if (/[A-Za-z][A-Za-z0-9+.-]*:$/.test(line.slice(0, offset))) return path;
      refuse(path, 'a path that starts with //, outside a URL');
    }
    if (path.split('/').includes('..')) refuse(path, 'a .. segment, which could climb out of the root');
    const normal = posix.normalize(path);
    if (under(normal, scratch)) return path;
    if (KEPT.has(normal) || KEPT.has(normal.replace(/\/$/, ''))) return path;
    if (MOVED.some(dir => under(normal, dir))) return `${root}${path}`;
    return refuse(path, 'it is no VM path this fixture moves, and not one it may leave');
  });
}

// A path that must lie inside the fake VM's root, as a copy's destination does: by its spelling, and on disk, where no
// component of it below the root that exists may be a link (cp follows one, wherever it leads).
export function contained(path, root) {
  const resolved = posix.resolve(path);
  if (!resolved.startsWith(`${root}/`)) throw new Error(`${path} is outside the fake VM (${root})`);
  let at = root;
  for (const part of resolved.slice(root.length + 1).split('/')) {
    at = `${at}/${part}`;
    let stat;
    try { stat = lstatSync(at); } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`${path} is outside the fake VM (${root}): a copy there would go through the link ${at}`);
  }
  return path;
}

// A provisioner as the fake VM runs it: its paths remapped, and its root check met (the test runs it unprivileged).
// Nothing else in it changes.
export function remapScript(text, root) {
  const check = '[[ $EUID == 0 ]]';
  if (text.split(check).length !== 2) throw new Error('the provisioner\'s root check is not where the fake VM expects it');
  return remap(text, root).replace(check, '[[ 0 == 0 ]]');
}
