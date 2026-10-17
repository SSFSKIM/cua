// Placeholders and filesystem setup for the seatbelt golden fixtures (#115 M0; test/fixtures/sandbox/seatbelt/).
// A fixture's input names paths under a scratch root as `@ROOT@` (the root's real path) or `@VAR_ROOT@` (the same path
// spelled through macOS's /var -> /private/var alias), and the generator's output is mapped back to those placeholders,
// with the daemon directory's euid as `@EUID@` (the original inlines /private/tmp/codex-daemon-<euid> in the profile),
// so a fixture compares byte for byte on any Mac. The root is free of regex-lite metacharacters, so the original's
// regex-escaped spelling of a path under it (the protected-name carve-outs) contains the root verbatim too.
import {mkdirSync, symlinkSync, writeFileSync} from 'node:fs';
import {dirname, isAbsolute, join, relative} from 'node:path';

export const ROOT = '@ROOT@';
export const VAR_ROOT = '@VAR_ROOT@';
export const EUID = '@EUID@';
const PRIVATE_VAR = '/private/var/';
// regex-lite's escape set (sandboxing/src/seatbelt.rs) plus whitespace and quotes, which would need escaping in SBPL.
const UNSAFE = /[\\.+*?()|[\]{}^$#&\-~\s"']/;

export function assertFixtureRoot(root) {
  if (typeof root !== 'string' || !isAbsolute(root)) throw new Error(`fixture root ${root} must be absolute`);
  const bad = root.match(UNSAFE);
  if (bad) throw new Error(`fixture root ${root} contains the metacharacter ${JSON.stringify(bad[0])}`);
}

const varRootOf = root => (root.startsWith(PRIVATE_VAR) ? root.slice('/private'.length) : null);

const mapStrings = (value, fn) => (typeof value === 'string' ? fn(value)
  : Array.isArray(value) ? value.map(item => mapStrings(item, fn))
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)])) : value);

// `value` with the placeholders filled for `root`.
export function substitute(value, {root}) {
  const varRoot = varRootOf(root);
  return mapStrings(value, text => {
    if (text.includes(VAR_ROOT) && !varRoot) throw new Error(`${VAR_ROOT} needs a root under ${PRIVATE_VAR}, not ${root}`);
    return text.replaceAll(VAR_ROOT, varRoot ?? VAR_ROOT).replaceAll(ROOT, root);
  });
}

// `value` (generator output) with `root`, its alias spelling and the daemon directory's euid replaced by placeholders.
export function placehold(value, {root, euid}) {
  const varRoot = varRootOf(root);
  const daemon = `codex-daemon-${euid}`;
  return mapStrings(value, text => {
    let out = text.replaceAll(root, ROOT);
    if (varRoot) out = out.replaceAll(varRoot, VAR_ROOT);
    return out.replaceAll(daemon, `codex-daemon-${EUID}`);
  });
}

// Creates a fixture's setup under `root`: [{dir}, {file, content}, {symlink, target}], paths relative to the root and
// staying inside it; a file's content and a symlink's target (relative or absolute) may carry placeholders.
export function materialize(setup, {root}) {
  const inside = rel => {
    const path = join(root, rel);
    const back = relative(root, path);
    if (back === '' || back.startsWith('..') || isAbsolute(back)) throw new Error(`setup path ${rel} must stay inside the fixture root`);
    return path;
  };
  for (const item of setup) {
    if (item.dir !== undefined) mkdirSync(inside(item.dir), {recursive: true, mode: 0o755});
    else if (item.file !== undefined) {
      const path = inside(item.file);
      mkdirSync(dirname(path), {recursive: true, mode: 0o755});
      writeFileSync(path, substitute(item.content ?? '', {root}));
    } else if (item.symlink !== undefined) {
      const path = inside(item.symlink);
      mkdirSync(dirname(path), {recursive: true, mode: 0o755});
      symlinkSync(substitute(item.target, {root}), path);
    } else throw new Error(`unknown setup item ${JSON.stringify(item)}`);
  }
}
