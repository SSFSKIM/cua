// remap.mjs for the fake VM's ssh and scp stubs: stdin with its VM paths moved under the root, `node remap-cli.mjs
// <root> <scratch> [--contained]`. It exits 1, printing nothing to stdout, when the text names a path the fake VM will
// not place, or (--contained, a copy's destination) when the remapped path lies outside the root: the stub then runs
// nothing and copies nothing.
import {readFileSync} from 'node:fs';
import {contained, remap} from './remap.mjs';

const [root, scratch, mode] = process.argv.slice(2);
try {
  const text = remap(readFileSync(0, 'utf8'), root, scratch);
  process.stdout.write(mode === '--contained' ? contained(text, root) : text);
} catch (error) {
  process.stderr.write(`fake VM: refused: ${error.message}\n`);
  process.exit(1);
}
