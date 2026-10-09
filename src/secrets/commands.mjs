// `cua secrets set|list|remove` on the secret store (src/secrets/store.mjs), the directories `/secret KEY` in Claude Code
// writes. set reads the value at a masked prompt on this terminal (nothing is echoed; typed twice) and writes the file
// 0600; remove asks for confirmation at the terminal unless --yes. Only the key is ever an argument. No route takes,
// prints or returns a value, and a value read at the prompt is never put in an error.
//
// `scope` picks a tier: 'project' (the project of this working directory, src/secrets/project.mjs) or 'global'. set and
// remove work on the global tier unless told --project, as they always have; list shows both tiers unless told one,
// each key marked with its tier. Device credentials (reserved keys, label.mjs) live in the global tier only.
import {CuaError, fail} from '../runtime/errors.mjs';
import {fileStore, projectStoreDir, storeDir, SecretStoreError} from './store.mjs';
import {isReserved, RESERVED_PREFIX} from './label.mjs';
import {projectRoot} from './project.mjs';

export const PREFERRED_ENTRY = 'in Claude Code, the cua plugin\'s /secret KEY stores a secret in the same store, for the session\'s project (/secret -g KEY: for every project), and is preferred';

// Reads one line from a terminal without echo. Resolves the line, or null when the user cancels (Ctrl-C, Ctrl-D on an
// empty line, Escape). Backspace edits; any other control character is ignored, so the value is printable text.
export function readHidden({input = process.stdin, output = process.stderr, prompt}) {
  output.write(prompt);
  return new Promise(resolve => {
    const wasRaw = input.isRaw;
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.resume();
    let value = '';
    const finish = result => {
      input.off('data', onData);
      input.setRawMode(wasRaw ?? false);
      input.pause();
      output.write('\n');
      resolve(result);
    };
    const onData = chunk => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish(value);
        if (char === '\u0003' || char === '\u001b' || (char === '\u0004' && value === '')) return finish(null);
        if (char === '\u007f' || char === '\b') { value = [...value].slice(0, -1).join(''); continue; }
        if (char < ' ') continue;
        value += char;
      }
    };
    input.on('data', onData);
  });
}

const storeErrorToCua = (error, hint) => (error instanceof SecretStoreError ? new CuaError(error.code === 'not_found' ? 'secret_not_found' : `secret_${error.code}`, error.message, error.code === 'not_found' ? {hint} : {}) : error);
// Where to look when a key is not in the tier a remove named.
const OTHER_TIER = {global: 'cua secrets list shows each key\'s tier; --project removes from this project\'s store', project: 'cua secrets list shows each key\'s tier; without --project, remove works on the global store'};

// The two tiers for this working directory: {root, project, global}.
export function defaultStores({env = process.env, cwd = process.cwd()} = {}) {
  const root = projectRoot(cwd);
  return {root, project: fileStore({dir: projectStoreDir(root, env)}), global: fileStore({dir: storeDir(env)})};
}

// Every key of both tiers, sorted by key with the project's first: [{label, scope, shadowed?}], a global key the
// project's of the same name shadows (a {{secret:KEY}} reference reads the project's) marked so.
async function bothTiers(stores) {
  const project = await stores.project.list();
  const global = await stores.global.list();
  const entries = [
    ...project.map(label => ({label, scope: 'project'})),
    ...global.map(label => ({label, scope: 'global', ...(project.includes(label) ? {shadowed: true} : {})})),
  ];
  return {project, global, entries: entries.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : a.scope === 'project' ? -1 : 1))};
}

export const describeEntry = ({label, scope, shadowed}) => `${label} (${scope}${shadowed ? ', shadowed by the project\'s' : ''})`;

export async function runSecrets({command, label, yes = false, json = false, scope}, {
  stores = defaultStores(), terminal = {input: process.stdin, output: process.stderr}, readLine = readHidden,
  print = value => process.stdout.write(typeof value === 'string' ? value + '\n' : JSON.stringify(value, null, 2) + '\n'),
  note = line => process.stderr.write(line + '\n'),
} = {}) {
  if (command !== 'list' && scope === 'project' && isReserved(label))
    fail('secret_reserved', `keys starting ${RESERVED_PREFIX} are device credentials, kept in the global store only; nothing was changed`, {hint: 'leave out --project'});
  const store = command === 'list' && scope === undefined ? null : stores[scope ?? 'global'];
  if (command === 'set') {
    if (!terminal.input.isTTY || typeof terminal.input.setRawMode !== 'function')
      fail('no_terminal', 'secrets set reads the secret at a terminal, and standard input is not one; nothing was stored', {hint: `run it in a terminal; ${PREFERRED_ENTRY}`});
    const first = await readLine({...terminal, prompt: `secret for ${label} (not shown): `});
    if (first === null) { note('cancelled; nothing was stored'); return 130; }
    if (first === '') fail('empty_secret', 'the secret was empty; nothing was stored');
    const second = await readLine({...terminal, prompt: 'again, to confirm: '});
    if (second === null) { note('cancelled; nothing was stored'); return 130; }
    if (second !== first) fail('secret_mismatch', 'the two entries differ; nothing was stored');
    const path = await store.write(label, first);
    note(`stored ${label} in ${path} (mode 0600)`);
    return 0;
  }
  if (command === 'remove') {
    if (!yes) {
      if (!terminal.input.isTTY || typeof terminal.input.setRawMode !== 'function')
        fail('no_terminal', 'secrets remove confirms at a terminal, and standard input is not one; pass --yes to remove without asking; nothing was removed');
      const answer = await readLine({...terminal, prompt: `remove secret ${label}? [y/N] `});
      if (!['y', 'yes'].includes(answer?.toLowerCase())) { note('not confirmed; nothing was removed'); return 1; }
    }
    try { note(`removed ${label} (${await store.remove(label)})`); } catch (error) { throw storeErrorToCua(error, OTHER_TIER[scope ?? 'global']); }
    return 0;
  }
  if (store) {
    let labels;
    try { labels = await store.list(); } catch (error) { throw storeErrorToCua(error); }
    if (json) print({ok: true, ...(scope === 'project' ? {project: stores.root} : {}), labels});
    else if (labels.length) print(labels.join('\n'));
    else note(`no secrets are stored in ${store.dir}`);
    return 0;
  }
  let tiers;
  try { tiers = await bothTiers(stores); } catch (error) { throw storeErrorToCua(error); }
  if (json) print({ok: true, project: stores.root, labels: [...new Set(tiers.entries.map(e => e.label))], scopes: {project: tiers.project, global: tiers.global}});
  else if (tiers.entries.length) print(tiers.entries.map(describeEntry).join('\n'));
  else note(`no secrets are stored in ${stores.project.dir} or ${stores.global.dir}`);
  return 0;
}
