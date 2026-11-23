#!/usr/bin/env node
// Task 50, step 0 (#171 M4): the harness's X tools against a private display created in this process, whose clients
// the spawner gives the run's nonexistent authority path (xspawn.mjs NO_AUTHORITY, task 51's fix). One process: the
// harness's own `startPrivateServer` (Xvfb -displayfd, its watchdog, the private mark), Openbox and an xterm standing
// for the person's window, both through the harness's spawner, then the harness's own verdict run in-process
// (run.mjs `runDiff`, as the CLI calls it), which starts its watchdog, its private session bus, the whole-run record
// (allowed on a private display), its xtrace trace, the engines (three lanes) and their audit passes through xtrace
// proxies, the activating stub and the run's Chrome. XAUTHORITY is left as the session has it (unset), the case where
// a client that escaped the spawner would read the person's ~/.Xauthority; the outer guard (wrap50.py private) forbids
// that path in any fd and records each process's XAUTHORITY. Never :0.
// usage: node step0-xtools.mjs <out>

import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const LIVE = '/Users/new/.local/share/cua-171/live-43';
const D = `${LIVE}/scripts/linux-engine-diff`;
const { startPrivateServer } = await import(`${D}/xtools.mjs`);
const { xSpawn, xExecFileSync, NO_AUTHORITY, declareLiveRun } = await import(`${D}/xspawn.mjs`);
const { parseArgs } = await import(`${D}/cli.mjs`);
const { runDiff } = await import(`${D}/run.mjs`);

declareLiveRun('task 50 step 0: the harness on a private display it creates');
const out = process.argv[2];
mkdirSync(join(out, 'server'), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const facts = { xauthority_inherited: process.env.XAUTHORITY ?? null, no_authority: NO_AUTHORITY };

const server = await startPrivateServer({ out: join(out, 'server') });
process.env.DISPLAY = server.display;
facts.display = server.display;
const side = [];
// a stop (the harness's own SIGTERM handler ends the process after its cleanup): this session's side ends with it
process.on('exit', () => {
  for (const c of side) if (c.exitCode === null) c.kill('SIGTERM');
  try {
    process.kill(server.pid, 'SIGTERM');
  } catch {
    // already gone
  }
});
let code = 1;
try {
  const x = (cmd, args) => xExecFileSync(cmd, args, { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  side.push(xSpawn('openbox', [], { stdio: 'ignore' }));
  for (let i = 0; i < 50 && !/window id/.test(x('xprop', ['-root', '_NET_SUPPORTING_WM_CHECK'])); i++) await sleep(100);
  side.push(xSpawn('xterm', ['-T', 'person', '-e', 'sleep', '100000'], { stdio: 'ignore' }));
  let person = '';
  for (let i = 0; i < 100 && !/^\d+$/.test(person); i++) {
    try {
      person = x('xdotool', ['search', '--name', '^person$']).split('\n')[0];
    } catch {
      // not yet mapped
    }
    await sleep(100);
  }
  x('xdotool', ['windowactivate', '--sync', person]);
  facts.person_window = Number(person);
  facts.mark = x('xprop', ['-root', 'CUA171_PRIVATE_DISPLAY']);
  const SKY = '/Users/new/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky';
  const args = parseArgs([
    '--dev',
    '--vendor', `${SKY}/bin/linux/sky_linux_x64`,
    '--newest', '/Users/new/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64',
    '--cua', '/Users/new/.local/share/cua-171/task42/engine/cua-engine',
    '--scene', 'gedit', '--ops', 'tree,press_key', '--blocks', '1',
    '--run', 'task50-step0-xtools', '--out', join(out, 'run'),
  ]);
  const ok = await runDiff(args);
  facts.run_exit = ok ? 0 : 1;
  code = ok ? 0 : 1;
} catch (error) {
  facts.error = String(error?.stack ?? error);
} finally {
  for (const c of side) if (c.exitCode === null) c.kill('SIGTERM');
  await sleep(300);
  facts.server_watchdog = await server.stop();
  writeFileSync(join(out, 'step0-xtools.json'), `${JSON.stringify(facts, null, 1)}\n`);
  process.stdout.write(`${JSON.stringify(facts)}\n`);
}
process.exit(code);
