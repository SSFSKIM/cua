#!/usr/bin/env node
// Derive replay relocation from the recording's provenance, not this host's home or a copied machine path.
import {readFileSync} from 'node:fs';
import {dirname, isAbsolute, normalize} from 'node:path';
import {pathToFileURL} from 'node:url';

export function captureRoot(capture) {
  const input = capture?.input, home = input?.env?.HOME;
  const root = typeof home === 'string' ? dirname(home) : null;
  if (!root || root === '/' || !isAbsolute(root) || normalize(root) !== root || home !== `${root}/userhome`
      || !input.cwd?.startsWith(`${root}/home/run/`) || !input.cli?.startsWith(`${root}/home/runtimes/`))
    throw new Error('capture has no consistent scratch-root provenance');
  return root;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const roots = process.argv.slice(2).map(path => captureRoot(JSON.parse(readFileSync(path, 'utf8'))));
    if (!roots.length || roots.some(root => root !== roots[0])) throw new Error('roots differ');
    console.log(roots[0]);
  } catch {
    console.error('recorded-root: captures have no consistent shared scratch root');
    process.exitCode = 1;
  }
}
