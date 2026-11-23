// Task 100's fix wave 2, the live check: a development run (never counted) of V5's five premise cells through the
// harness's own CLI, on a private display (display.mjs `runOnPrivateDisplay`, which refuses :0), at checkout `root`.
//   node live-probe.mjs <checkout> <out dir>
import { mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [root, dir] = process.argv.slice(2);
const { runOnPrivateDisplay } = await import(pathToFileURL(join(root, 'scripts/linux-engine-gate/display.mjs')).href);
mkdirSync(join(dir, 'run'), { recursive: true });
const home = '/Users/new/.local/share/cua-171/m5/home-x64';
const args = [
  '--vendor', `${home}/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64`,
  '--newest', '/Users/new/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64',
  '--cua', `${home}/engine/linux/cua-engine`,
  '--scene', 'device-chrome-dnd',
  '--ops', 'chrome_dnd_shared,chrome_dnd_obscured_in_front_shared,chrome_dnd_late_shared,chrome_dnd_obscured_in_front_late_shared,chrome_dnd_late_take_shared',
  '--blocks', '1', '--run', 'v5pl', '--dev',
  '--out', join(dir, 'run'),
];
const label = 'development run, not a release gate (task 100 fix wave 2 live check, never counted)';
const out = openSync(join(dir, 'stdout.log'), 'a');
const err = openSync(join(dir, 'stderr.log'), 'a');
const result = await runOnPrivateDisplay({ dir, label, script: join(root, 'scripts/linux-engine-diff.mjs'), args, cwd: root, env: { ...process.env, CUA_HOME: home }, out, err });
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(result.code ?? 1);
