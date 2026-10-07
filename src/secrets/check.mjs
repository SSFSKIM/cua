// What `cua doctor` says about the secret store (src/secrets/store.mjs), read from metadata only: the directory and
// each key file are stat'ed, never opened, so no value is ever read. One row, `secrets.store`:
//   skip     secrets are turned off (CUA_SHIM_SECRETS=off)
//   blocked  no store yet: nothing is stored, and storing the first secret creates it
//   fail     the directory is not one, is not this user's, or is open to others; or a key file the trusted services
//            would refuse (not a regular file, not this user's, not mode 0600), named by key
//   pass     otherwise, with the number of stored keys
import {lstatSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {isLabel} from './label.mjs';
import {storeDir} from './store.mjs';

const ownUid = () => (typeof process.geteuid === 'function' ? process.geteuid() : null);
const octal = mode => `0${(mode & 0o777).toString(8)}`;

// Facts about the store at `dir`: {dir, exists, error?, directory?, owned?, mode?, keys?, unsafe?: [{key, why}]}.
export function inspectStore({dir}) {
  let stat;
  try { stat = statSync(dir); } catch (error) {
    return error.code === 'ENOENT' ? {dir, exists: false} : {dir, exists: true, error: error.code ?? 'error'};
  }
  const uid = ownUid();
  const info = {dir, exists: true, directory: stat.isDirectory(), owned: uid === null || stat.uid === uid, mode: stat.mode & 0o777};
  if (!info.directory) return info;
  let names;
  try { names = readdirSync(dir).filter(isLabel).sort(); } catch (error) { return {...info, error: error.code ?? 'error'}; }
  info.keys = [];
  info.unsafe = [];
  for (const key of names) {
    let entry;
    try { entry = lstatSync(join(dir, key)); } catch { continue; }
    if (!entry.isFile()) { if (!entry.isDirectory()) info.unsafe.push({key, why: 'not a regular file'}); continue; }
    info.keys.push(key);
    if (uid !== null && entry.uid !== uid) info.unsafe.push({key, why: 'not owned by you'});
    else if ((entry.mode & 0o777) !== 0o600) info.unsafe.push({key, why: `mode ${octal(entry.mode)}, not 0600`});
  }
  return info;
}

export function classifyStore(info, {enabled = true} = {}) {
  const row = (status, detail) => ({name: 'secrets.store', status, detail});
  if (!enabled) return row('skip', 'secrets are turned off for this server (CUA_SHIM_SECRETS=off)');
  const {dir} = info;
  if (!info.exists) return row('blocked', `no secret store at ${dir} yet, so nothing is stored; /secret KEY in Claude Code (the doperpowers secrets mod) or cua secrets set KEY creates it`);
  if (info.error && info.directory === undefined) return row('fail', `the secret store ${dir} could not be read (${info.error})`);
  if (!info.directory) return row('fail', `${dir} is not a directory, so no secret can be stored or read there`);
  if (!info.owned) return row('fail', `the secret store ${dir} is not owned by you`);
  if (info.mode & 0o077) return row('fail', `the secret store ${dir} is mode ${octal(info.mode)}, open to other users; chmod 700 "${dir}"`);
  if (info.error) return row('fail', `the secret store ${dir} could not be listed (${info.error})`);
  if (info.unsafe.length) return row('fail', `secret files the trusted services would refuse: ${info.unsafe.map(u => `${u.key} (${u.why})`).join(', ')}; chmod 600 each file in ${dir}`);
  return row('pass', `${info.keys.length} secret${info.keys.length === 1 ? '' : 's'} in ${dir} (0700, yours, each file 0600)`);
}

export const inspectSecretStore = ({env = process.env} = {}) => inspectStore({dir: storeDir(env)});
