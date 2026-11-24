// remap.mjs for the fake VM's ssh and scp stubs: stdin with its VM paths moved under the root given as the argument.
import {readFileSync} from 'node:fs';
import {remap} from './remap.mjs';

process.stdout.write(remap(readFileSync(0, 'utf8'), process.argv[2]));
