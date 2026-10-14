// A listing of $CUA_HOME/state/codex for the M5 live observation: every entry's relative path, type, size and mtime
// (lstat only; no file under it is opened), plus a sha256 of each file under browser/, the vendor service's persisted
// grants directory, which the session must not create or change.
//   node codex-listing.mjs <CUA_HOME>
import {lstatSync, readdirSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const base = join(process.argv[2], 'state', 'codex');
const entries = [], browser = {};
function walk(rel) {
  for (const name of readdirSync(join(base, rel)).sort()) {
    const path = rel ? `${rel}/${name}` : name;
    const s = lstatSync(join(base, path));
    const type = s.isDirectory() ? 'dir' : s.isSymbolicLink() ? 'link' : s.isFile() ? 'file' : 'other';
    entries.push([path, type, s.size, Math.round(s.mtimeMs)]);
    if (type === 'file' && (path === 'browser' || path.startsWith('browser/'))) browser[path] = createHash('sha256').update(readFileSync(join(base, path))).digest('hex');
    if (type === 'dir') walk(path);
  }
}
walk('');
process.stdout.write(JSON.stringify({at: new Date().toISOString(), base, entries, browser}) + '\n');
