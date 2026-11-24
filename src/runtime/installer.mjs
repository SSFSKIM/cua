// The installer every Linux remedy names (#171 M6a, ruling 1110's F9): this cua's own bin/cua.mjs by its absolute path,
// since a `cua` on PATH from another checkout installs that checkout's runtime. It depends on nothing of cua's, so the
// sandbox's own modules (src/sandbox/linux.mjs) can name it as manifest.mjs does, which re-exports it.
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

// This cua's own entry point: the checkout's, or the plugin copy's, whichever this module was loaded from.
export const CUA_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'cua.mjs');
// A word a POSIX shell reads as one argument, quoted only where it needs to be.
export const shellWord = word => /^[A-Za-z0-9_./:=@%+,-]+$/.test(word) ? word : `'${word.replaceAll('\'', '\'\\\'\'')}'`;

// -> {command, hint}: the command, and the release it installs where the caller knows it.
export function ownInstaller({release, entry = CUA_ENTRY} = {}) {
  const command = `node ${shellWord(entry)} install`;
  return {command, hint: `run \`${command}\`; a \`cua\` from another checkout installs that checkout's runtime${release ? `, which may not be ${release}` : ', not this one\'s'}`};
}
