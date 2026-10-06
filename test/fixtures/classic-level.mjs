// A real classic-level for fixture extension stores: the one the installed runtime ships (the active release in the
// default CUA_HOME), else the one inside an installed ChatGPT.app. The suites that need it say so and skip without it;
// nothing here is vendored into the repo.
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {defaultHome} from '../../src/runtime/layout.mjs';
import {resolveRuntime} from '../../src/runtime/manifest.mjs';
import {loadClassicLevel} from '../../src/profiles/directory-map.mjs';

function candidates() {
  const dirs = [];
  try { dirs.push(resolveRuntime({home: defaultHome({HOME: homedir()})}).paths.moduleDir); } catch {}
  dirs.push('/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules');
  return dirs;
}

// -> the node_modules directory holding a loadable classic-level, or null.
export const CLASSIC_LEVEL_MODULES = candidates().find(dir => {
  if (!existsSync(join(dir, 'classic-level'))) return false;
  try { return typeof loadClassicLevel(dir) === 'function'; } catch { return false; }
}) ?? null;
export const NO_CLASSIC_LEVEL = CLASSIC_LEVEL_MODULES ? false : 'no installed runtime or ChatGPT.app provides classic-level';

// Writes a LevelDB store at `path` holding the extension's instance id as Chrome's extension storage does (a JSON
// string value), and leaves it open when `keepOpen` (as Chrome holds its live store, LOCK included); returns the handle.
export async function writeStore(path, instanceId, {keepOpen = false, extra = {}} = {}) {
  const ClassicLevel = loadClassicLevel(CLASSIC_LEVEL_MODULES);
  const db = new ClassicLevel(path, {keyEncoding: 'utf8', valueEncoding: 'utf8'});
  await db.open();
  if (instanceId !== undefined) await db.put('extensionInstanceId', JSON.stringify(instanceId));
  for (const [key, value] of Object.entries(extra)) await db.put(key, JSON.stringify(value));
  if (!keepOpen) await db.close();
  return db;
}
