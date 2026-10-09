// M5 scratch, acceptance 13 against a real (dev) MAWS: one long-lived `cua serve` on m5-A's socket; MAWS stopped and
// relaunched on the same userData; profiles_list polled; the default selection re-run in the same REPL heap.
import {spawn, execFileSync} from 'node:child_process';
import {openSession} from '../../../../scripts/accept/mcp-session.mjs';
import {parseFeatureResult} from '../../../../scripts/accept/linux-chrome-features.mjs';
import {SELECT_DEFAULT} from '../../../../scripts/accept/maws-selection.mjs';
import {openSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const CLI = fileURLToPath(new URL('../../../../bin/cua.mjs', import.meta.url));
const MAWS = process.env.MAWS_CHECKOUT ?? '/Users/new/Developer/GitHub/MAWS-wt-13';
const USER_DATA = process.env.MAWS_PROBE_USER_DATA ?? '/tmp/mh13-m5';
const LAUNCH = fileURLToPath(new URL('./launch.cjs', import.meta.url));
const LOG = process.env.MAWS_PROBE_DIR ?? '/tmp/maws-probe';
const SOCK = `${USER_DATA}/browser/cua/m5-A.sock`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);
const session = openSession({args: [CLI, 'serve'], env: {...process.env, CUA_SHIM_SURFACES: 'browser', CUA_SHIM_SECRETS: 'off', CUA_BROWSER_BACKENDS: SOCK}, clientName: 'cua-m5-reconnect'});
const entry = async () => (await session.call('profiles_list', {}, 60_000)).result?.structuredContent?.profiles?.find(p => p.key === 'maws');
const mine = () => execFileSync('pgrep', ['-f', `Electron.app/Contents/MacOS/Electron .*(serve-plain|launch)\\.cjs ${USER_DATA} `], {encoding: 'utf8'}).trim().split('\n').filter(Boolean).map(Number);
const out = {};
try {
  await session.initialize();
  out.before = await entry(); log('before', JSON.stringify(out.before));
  out.selectBefore = parseFeatureResult(await session.js(SELECT_DEFAULT, 90_000)); log('selectBefore', JSON.stringify(out.selectBefore));
  await session.call('end_task', {}, 30_000);
  const pids = mine(); out.stoppedPids = pids; log('stopping my dev MAWS', pids);
  for (const pid of pids) process.kill(pid, 'SIGTERM');
  const stopped = Date.now(); let down;
  while (Date.now() - stopped < 20_000) { down = await entry(); if (!down?.ready) break; await sleep(250); }
  out.down = {...down, afterMs: Date.now() - stopped}; log('down', JSON.stringify(out.down));
  await sleep(3000);
  const child = spawn(`${MAWS}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`, [LAUNCH, USER_DATA, 'm5-A', 'm5-B'], {cwd: MAWS, detached: true, stdio: ['ignore', openSync(`${LOG}/relaunch.log`, 'a'), openSync(`${LOG}/relaunch.err`, 'a')]});
  child.unref();
  const relaunched = Date.now(); log('relaunched pid', child.pid);
  let back;
  while (Date.now() - relaunched < 30_000) { back = await entry(); if (back?.ready) break; await sleep(250); }
  out.back = {...back, afterMs: Date.now() - relaunched}; log('back', JSON.stringify(out.back));
  out.selectAfter = parseFeatureResult(await session.js(SELECT_DEFAULT, 90_000)); log('selectAfter', JSON.stringify(out.selectAfter));
  await session.call('end_task', {}, 30_000);
  out.servePid = session.pid;
} catch (e) { out.error = String(e?.stack ?? e); log(out.error); }
finally { out.serveExit = await session.terminate(); console.log(JSON.stringify(out)); }
