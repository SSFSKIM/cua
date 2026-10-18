// The user HOME a harness gives a scratch CUA_HOME: its sibling `<cua home>.home`, in the same owned parent, never a
// directory inside it. #115 M1's own host refuses (sandbox_conflict) a layout whose secret store or ~/.config/cua lies
// inside CUA_HOME, so a HOME inside the cua home would fail every scoped or default connection at its preflight.
// Removing a scratch cua home removes its sibling HOME too (removeScratchHomes).
import {rmSync} from 'node:fs';
import {isAbsolute, relative} from 'node:path';

export const userHomeBeside = cuaHome => `${cuaHome}.home`;

export function removeScratchHomes(cuaHome) {
  rmSync(cuaHome, {recursive: true, force: true});
  rmSync(userHomeBeside(cuaHome), {recursive: true, force: true});
}

// Whether `home` lies outside `cuaHome` (and does not contain it), by path.
export function homeOutside(cuaHome, home) {
  const inside = (path, root) => { const rel = relative(root, path); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../')); };
  return !inside(home, cuaHome) && !inside(cuaHome, home);
}
