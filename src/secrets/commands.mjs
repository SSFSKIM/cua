// `cua secrets set|list|remove` on the secret store (src/secrets/store.mjs), the directory `/secret KEY` in Claude Code
// writes. set reads the value at a masked prompt on this terminal (nothing is echoed; typed twice) and writes the file
// 0600; remove asks for confirmation at the terminal unless --yes. Only the key is ever an argument. No route takes,
// prints or returns a value, and a value read at the prompt is never put in an error.
import {CuaError, fail} from '../runtime/errors.mjs';
import {fileStore, storeDir, SecretStoreError} from './store.mjs';

export const PREFERRED_ENTRY = 'in Claude Code with the doperpowers secrets mod, /secret KEY stores a secret in the same file (preferred)';

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

const storeErrorToCua = error => (error instanceof SecretStoreError ? new CuaError(error.code === 'not_found' ? 'secret_not_found' : `secret_${error.code}`, error.message) : error);

export async function runSecrets({command, label, yes = false, json = false}, {
  store = fileStore({dir: storeDir()}), terminal = {input: process.stdin, output: process.stderr}, readLine = readHidden,
  print = value => process.stdout.write(typeof value === 'string' ? value + '\n' : JSON.stringify(value, null, 2) + '\n'),
  note = line => process.stderr.write(line + '\n'),
} = {}) {
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
    try { note(`removed ${label} (${await store.remove(label)})`); } catch (error) { throw storeErrorToCua(error); }
    return 0;
  }
  let labels;
  try { labels = await store.list(); } catch (error) { throw storeErrorToCua(error); }
  if (json) print({ok: true, labels});
  else if (labels.length) print(labels.join('\n'));
  else note(`no secrets are stored in ${store.dir}`);
  return 0;
}
