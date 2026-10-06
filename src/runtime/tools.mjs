// System tools cua runs on Linux, found on a PATH the way a shell would, and the classified refusal when one is absent:
// `missing_tool` names the tool and the Debian/Ubuntu package that provides it, so the fix is one apt command.
import {accessSync, constants, statSync} from 'node:fs';
import {isAbsolute, join} from 'node:path';
import {fail} from './errors.mjs';

// The absolute path of the executable `name` in the first PATH directory holding one, or null.
export function findTool(name, path = process.env.PATH ?? '') {
  for (const dir of path.split(':')) {
    if (!isAbsolute(dir)) continue;
    const candidate = join(dir, name);
    try {
      if (statSync(candidate).isFile()) { accessSync(candidate, constants.X_OK); return candidate; }
    } catch {}
  }
  return null;
}

// `needed` maps each tool to its package; `lookup(name)` finds one. Returns {tool: path} or refuses naming every
// missing tool at once.
export function requireTools(needed, lookup, purpose) {
  const found = Object.fromEntries(Object.keys(needed).map(name => [name, lookup(name)]));
  const missing = Object.keys(needed).filter(name => !found[name]);
  if (missing.length) {
    const packages = [...new Set(missing.map(name => needed[name]))];
    fail('missing_tool', `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not installed; ${purpose}`,
      {hint: `install ${missing.map(name => `${name} (package ${needed[name]})`).join(', ')}: sudo apt-get install ${packages.join(' ')}`});
  }
  return found;
}
