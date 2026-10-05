// Phase C acceptance as a whole: `node scripts/accept-chrome.mjs --all --report <file> [--c2-report <file>]
// [--c6-report <file>]` evaluates C1-C7 of the spec against $CUA_HOME (default ~/Library/Application Support/cua) and
// writes one PASS/FAIL/BLOCKED report per item, metadata only. The verdict rules live in chrome-all-lib.mjs.
//
// What runs (none of it creates a tab, binds a profile, registers cua's host, or makes a native call):
//   shared  `npm test` in this checkout (C2's matrix and each item's covering tests are read from its TAP)
//   C1      `node verify.mjs` with the default surface, then with CUA_SHIM_SURFACES=computer,browser; the launch
//           record `cua serve` builds for each (buildLaunch, not spawned) for its browser environment
//   C2      the hermetic matrix; the live round trip only from a supplied `accept-chrome --live` report (--c2-report)
//   C3      `cua profiles add/list/remove` in a scratch CUA_HOME against this Mac's Chrome (read only), deleted
//           afterwards; the default home's registry through `cua profiles list --json` (read only)
//   C4      one `cua serve` connection (computer,browser, secrets off): initialize, tools/list, profiles_list, end_task;
//           no js cell
//   C5      `cua doctor --json` (passive)
//   C6      the placed component and its configuration; a no-op `cua install` that cannot download (it names an
//           archive that does not exist); `cua chrome register` without --replace (it must refuse) and `cua chrome
//           unregister` (it must change nothing), each only when no manifest names cua's host and each with the
//           manifests fingerprinted before and after; the --replace gate only from a supplied report (--c6-report)
//   C7      a clean clone of this branch's HEAD in /tmp: npm test, build:helper and test:helper inside the clone (this
//           checkout's helper is never rebuilt), npm pack --dry-run; the clone is deleted
// Exit 0 PASS, 1 FAIL, 3 BLOCKED, 2 usage.
import {spawn} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {defaultHome, homeLayout, realHome} from '../../src/runtime/layout.mjs';
import {loadPins, resolveRuntime} from '../../src/runtime/manifest.mjs';
import {buildLaunch, BROWSER_SERVICE, SKY_SERVICE} from '../../src/runtime/launch.mjs';
import {locateChromeComponent} from '../../src/runtime/chrome-component.mjs';
import {settingsFrom} from '../../src/mcp/server.mjs';
import {chromeFacts} from '../../src/profiles/chrome.mjs';
import {profileStatuses, REASONS} from '../../src/profiles/registry.mjs';
import {BROWSERS, hostSuffixes} from '../../src/chrome/registration.mjs';
import {openSession} from './mcp-session.mjs';
import {diffSnapshots, rollup, snapshotTree, suiteVerdict, testReporterEnv, testTotals, tokenLike} from './lib.mjs';
import {
  c2LiveBlocked, classifySlot, defaultRegistryChecks, doctorChromeChecks, helperSuiteVerdict, hostNotesCheck, launchEnvCheck, liveRoundTripChecks,
  matrixChecks, packChecks, profilesListCheck, registrationGuard, replaceGateBlocked, replaceGateChecks, scratchListCheck, tapTestStatus, verifyCheck,
} from './chrome-all-lib.mjs';

const REPO = realpathSync(fileURLToPath(new URL('../..', import.meta.url)));
const CLI = join(REPO, 'bin', 'cua.mjs');
const NATIVE_HOST = 'com.openai.codexextension';
const NO_DOWNLOAD_GUARD = '/nonexistent/cua-accept-chrome-reinstall-must-not-read-an-archive.zip';
const USAGE = 'usage: node scripts/accept-chrome.mjs --all --report <file> [--c2-report <live C2 report>] [--c6-report <--replace gate report>]';

const check = (name, status, detail) => ({name, status, detail});
const parseJson = text => { try { return JSON.parse(text); } catch { return null; } };
const seconds = ms => `${(ms / 1000).toFixed(1)} s`;

// A child with captured output and a hard time limit, leading its own process group so a timeout stops what it
// started and nothing else (the native runner's rule).
function run(command, args, {cwd = REPO, env = process.env, timeoutMs = 600_000} = {}) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(command, args, {cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true});
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, timeoutMs);
    child.on('error', error => { clearTimeout(timer); resolve({code: null, error: error.code ?? error.message, stdout, stderr, ms: Date.now() - started}); });
    child.on('exit', (code, signal) => { clearTimeout(timer); resolve({code, signal, timedOut: signal === 'SIGKILL', stdout, stderr, ms: Date.now() - started}); });
  });
}
const ended = r => r.timedOut ? `timed out after ${seconds(r.ms)}` : `exit ${r.code ?? r.error ?? r.signal}`;
// Suites and commands run without the caller's server settings; each is given the home it needs explicitly.
const cleanEnv = extra => ({...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'CUA_HOME' && !key.startsWith('CUA_SHIM_'))), ...extra});

// Claims backed by named tests of this run's npm test.
const suiteClaims = (name, tap, titles) => {
  const outcomes = titles.map(title => ({title, ...tapTestStatus(tap, title)}));
  return check(name, rollup(outcomes.map(o => o.status)), outcomes.map(o => `"${o.title}": ${o.detail}`).join('; '));
};

function readReport(path, judge, label) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (error) { return [check(`${label}: supplied report`, 'FAIL', `cannot read it (${error.code ?? error.message})`)]; }
  const report = parseJson(text);
  const digest = createHash('sha256').update(text).digest('hex').slice(0, 16);
  return [check(`${label}: supplied report`, report ? 'PASS' : 'FAIL', `read ${text.length} bytes, sha256 ${digest}…${report ? '' : '; not JSON'}`), ...(report ? judge(report) : [])];
}

export async function runAll(argv) {
  let options;
  try {
    ({values: options} = parseArgs({args: argv, options: {all: {type: 'boolean'}, report: {type: 'string'}, 'c2-report': {type: 'string'}, 'c6-report': {type: 'string'}}, strict: true}));
  } catch { options = {}; }
  if (!options.all || !options.report) { process.stderr.write(`${USAGE}\n`); return 2; }

  const home = realHome(defaultHome());
  const userHome = homedir();
  const sanitize = text => String(text).split(home).join('$CUA_HOME').split(REPO).join('<repo>').split(userHome).join('~');
  const items = [];
  const addItem = (id, title, checks, evidence) => {
    const item = {id, title, status: rollup(checks.map(c => c.status)), checks, ...(evidence ? {evidence} : {})};
    items.push(item);
    process.stderr.write(`accept-chrome --all: ${id} ${item.status}\n`);
  };
  const cua = (args, cuaHome = home) => run(process.execPath, [CLI, ...args], {env: cleanEnv({CUA_HOME: cuaHome}), timeoutMs: 180_000});
  const chrome = chromeFacts();
  const started = new Date();

  let runtime = null;
  let runtimeError = null;
  try { runtime = resolveRuntime({home}); } catch (error) { runtimeError = `${error.code}: ${sanitize(error.message)}`; }
  let registry = [];
  let registryError = null;
  try { registry = profileStatuses({home, chrome}); } catch (error) { registry = []; registryError = error.code ?? error.message; }
  const instanceIds = registry.map(p => p.extensionInstanceId).filter(Boolean);

  // ---- shared: this checkout's npm test -------------------------------------------------------------------------
  const suite = await run('npm', ['test'], {env: testReporterEnv(cleanEnv()), timeoutMs: 300_000});
  const tap = suite.stdout;
  const suiteResult = suiteVerdict({code: suite.code, totals: testTotals(tap)});
  const suiteCheck = check('npm test (this checkout)', suiteResult.status, `${suiteResult.reason} in ${seconds(suite.ms)}`);

  // ---- C1 -----------------------------------------------------------------------------------------------------------
  {
    const checks = [];
    for (const browser of [false, true]) {
      const r = await run(process.execPath, [join(REPO, 'verify.mjs')], {env: cleanEnv({CUA_HOME: home, ...(browser ? {CUA_SHIM_SURFACES: 'computer,browser'} : {})}), timeoutMs: 300_000});
      const report = parseJson(r.stdout.slice(Math.max(0, r.stdout.indexOf('{'))));
      checks.push(verifyCheck(browser ? 'verify.mjs with CUA_SHIM_SURFACES=computer,browser' : 'verify.mjs with the default surface', {code: r.code, report: report && {...report, problems: report.problems?.map(sanitize)}}, {browser}));
    }
    for (const browser of [false, true]) {
      const name = `the launch cua serve builds ${browser ? 'with computer,browser' : 'by default'}`;
      if (!runtime) { checks.push(check(name, 'FAIL', `no runtime: ${runtimeError}`)); continue; }
      const {surfaces} = settingsFrom(browser ? {CUA_SHIM_SURFACES: 'computer,browser'} : {});
      const services = {computer: {sky: SKY_SERVICE}, browser: {browser: BROWSER_SERVICE}};
      const launch = buildLaunch({runtime, home, sessionId: randomUUID(), surfaces, services: Object.assign({}, ...surfaces.map(s => services[s])), secretsUnavailable: 'secrets_disabled'});
      checks.push(launchEnvCheck(name, launch.env, {browser}));
    }
    checks.push(suiteClaims('npm test: surfaces, launch environment and tools per surface', tap, [
      'native-only launches never enable or configure the browser surface',
      'the browser surface registers the trusted browser wrapper and configures the vendor browser service',
      'CUA_SHIM_SURFACES selects computer (default), browser or both, and anything else is refused',
      'by default the surface is unchanged: four tools, the native host notes, no profiles_list',
    ]));
    addItem('C1', 'Surfaces: five tools and the browser API with computer,browser; by default no browser API and no browser env', checks);
  }

  // ---- C2 -----------------------------------------------------------------------------------------------------------
  addItem('C2', 'Browser secret substitution: the hermetic matrix, and the live round trip through cua serve', [
    suiteCheck,
    ...matrixChecks(tap),
    ...(options['c2-report'] ? readReport(options['c2-report'], report => liveRoundTripChecks(report), 'live')
      : registryError ? [check('live: round trip through cua serve', 'BLOCKED', `the default profile registry cannot be read (${registryError}); fix it, bind personal, then run the live round trip`)]
        : [c2LiveBlocked(registry.find(p => p.key === 'personal'))]),
  ]);

  // ---- C3 -----------------------------------------------------------------------------------------------------------
  {
    const checks = [];
    const scratch = mkdtempSync('/tmp/cua-accept-c3.');
    try {
      const adds = [['personal', 'Default', true], ['work', 'Profile 8', false], ['school', 'Profile 6', false]];
      const added = [];
      for (const [key, directory, extension] of adds) {
        const r = await cua(['profiles', 'add', key, '--chrome-profile', directory, '--json'], scratch);
        const out = parseJson(r.stdout);
        if (out?.error?.code === 'chrome_profile_not_found') added.push({key, status: 'BLOCKED', detail: `${key}: this Mac has no Chrome profile directory "${directory}"`});
        else added.push({key, status: r.code === 0 && out?.ok && out.extensionInstalled === extension ? 'PASS' : 'FAIL',
          detail: `${key} -> "${directory}": ${r.code === 0 ? `extension ${out?.extensionInstalled ? 'installed' : 'absent'} (expected ${extension ? 'installed' : 'absent'})` : `exit ${r.code} ${out?.error?.code ?? ''}`}`});
      }
      checks.push(check('scratch home: profiles add personal Default, work "Profile 8", school "Profile 6"', rollup(added.map(a => a.status)), added.map(a => a.detail).join('; ')));
      const list = parseJson((await cua(['profiles', 'list', '--json'], scratch)).stdout);
      checks.push(scratchListCheck(list?.profiles));
      const human = (await cua(['profiles', 'list'], scratch)).stdout.split('\n');
      const line = key => human.find(l => l.startsWith(`${key} `)) ?? '';
      const named = ['work', 'school'].every(k => line(k).includes(REASONS.extension_not_installed)) && line('personal').includes(REASONS.not_bound);
      checks.push(check('scratch home: the human list names each reason', named ? 'PASS' : 'FAIL', named ? 'work and school: extension not installed; personal: not bound yet' : 'a reason is missing from cua profiles list'));
      const before = parseJson(readFileSync(join(scratch, 'profiles.json'), 'utf8'))?.profiles ?? {};
      const removed = await cua(['profiles', 'remove', 'school', '--json'], scratch);
      const after = parseJson(readFileSync(join(scratch, 'profiles.json'), 'utf8'))?.profiles ?? {};
      const {school, ...rest} = before;
      const onlyEntry = removed.code === 0 && parseJson(removed.stdout)?.removed === true && JSON.stringify(after) === JSON.stringify(rest) && Boolean(school)
        && chrome.profileDirectoryExists('Profile 6');
      checks.push(check('scratch home: remove school removes only that entry', onlyEntry ? 'PASS' : 'FAIL',
        `exit ${removed.code}; entries now ${Object.keys(after).join(', ')}; the others unchanged: ${JSON.stringify(after) === JSON.stringify(rest)}; Chrome profile "Profile 6" still present: ${chrome.profileDirectoryExists('Profile 6')}`));
      const written = readdirSync(scratch);
      checks.push(check('scratch home: the registry is the only file written', written.length === 1 && written[0] === 'profiles.json' ? 'PASS' : 'FAIL',
        `scratch home holds ${written.join(', ') || 'nothing'}; the commands read Chrome's directories (profile and extension presence) and write nothing there`));
    } finally { rmSync(scratch, {recursive: true, force: true}); }
    const listed = await cua(['profiles', 'list', '--json']);
    const defaults = parseJson(listed.stdout)?.profiles;
    checks.push(...(Array.isArray(defaults) ? defaultRegistryChecks(defaults) : [check('default home: profiles list --json', 'FAIL', `${ended(listed)}; no list`)]));
    checks.push(suiteClaims('npm test: registry CRUD, readiness and the bind rule', tap, [
      'an empty home has an empty registry; add records an existing directory and reports extension presence',
      'remove deletes only the named registry entry and never touches the Chrome profile',
      'readiness: bound with the extension installed is ready; otherwise the reason is named',
      'automatic bind: a unique display name and exactly one live backend carrying it',
      'automatic bind is undetermined, never a guess, when labels are missing, ambiguous or absent',
      'an explicit pick is accepted only for a live backend, and never against the runtime\'s own label',
      'bind stores the automatically labelled backend and says how it was chosen',
    ]));
    addItem('C3', 'Profile registry: add, list with readiness, remove only the entry; personal ready after bind', checks);
  }

  // ---- C4 -----------------------------------------------------------------------------------------------------------
  {
    const checks = [];
    if (!runtime) checks.push(check('cua serve with the browser surface', 'FAIL', `no runtime: ${runtimeError}`));
    else {
      const runBefore = existsSync(homeLayout(home).run) ? readdirSync(homeLayout(home).run) : [];
      const session = openSession({args: [CLI, 'serve'], env: cleanEnv({CUA_HOME: home, CUA_SHIM_SURFACES: 'computer,browser', CUA_SHIM_SECRETS: 'off'}), clientName: 'cua-accept-chrome-all'});
      let init, tools, listed, endTask;
      try {
        init = await session.initialize().catch(error => ({error: error.message}));
        tools = (await session.request('tools/list', {})).result?.tools?.map(t => t.name);
        listed = (await session.call('profiles_list', {}, 150_000)).result?.structuredContent;
        endTask = (await session.call('end_task')).result?.structuredContent?.status;
      } finally {
        const exit = await session.terminate();
        const messages = session.transcript.map(line => parseJson(line)).filter(Boolean);
        const elicitations = messages.filter(m => m.method === 'elicitation/create').length;
        const cells = messages.filter(m => m.method === 'tools/call' && m.params?.name === 'js').length;
        const left = (existsSync(homeLayout(home).run) ? readdirSync(homeLayout(home).run) : []).filter(n => !runBefore.includes(n));
        checks.push(check('the connection: five tools, no js cell, clean exit', JSON.stringify(tools) === JSON.stringify(['js', 'js_reset', 'end_task', 'secrets_list', 'profiles_list']) && cells === 0 && exit.code === 0 && endTask === 'noop' && !left.length ? 'PASS' : 'FAIL',
          `tools ${tools?.join(', ')}; js cells sent ${cells}; end_task ${endTask}; serve exit ${exit.code}${exit.forced ? ' (forced)' : ''}; elicitations ${elicitations}; connection directories left ${left.length}`));
      }
      checks.push(hostNotesCheck(init?.instructions));
      let statuses = null;
      try { statuses = profileStatuses({home, chrome}); } catch (error) { checks.push(check('the registry profiles_list reads', 'FAIL', error.code)); }
      if (statuses) checks.push(profilesListCheck(listed, statuses));
    }
    checks.push(suiteClaims('npm test: profiles_list and the host notes', tap, [
      'with the browser surface, profiles_list is the fifth tool and returns keys, readiness and instance ids only',
      'the browser host notes carry the three Chrome rules and keep the instructions within 2048 characters',
    ]));
    addItem('C4', 'profiles_list and the browser host notes', checks);
  }

  // ---- C5 -----------------------------------------------------------------------------------------------------------
  const doctorRun = await cua(['doctor', '--json']);
  const doctor = parseJson(doctorRun.stdout);
  addItem('C5', 'doctor --json on this Mac (passive)', [
    ...doctorChromeChecks({code: doctorRun.code, doctor: doctor && {...doctor, checks: doctor.checks?.map(c => ({...c, detail: sanitize(c.detail)}))}}),
    suiteClaims('npm test: the Chrome doctor checks', tap, [
      'per-profile extension checks, the native host registration by path class, and the live host count',
      'doctor reports the Chrome checks beside runtime health and they never change ok',
    ]),
  ]);

  // ---- C6 -----------------------------------------------------------------------------------------------------------
  {
    const checks = [];
    const hostConfig = doctor?.checks?.find(c => c.name === 'chrome.host.config');
    if (!runtime) checks.push(check('install placed the Chrome host and its configuration', 'FAIL', `no runtime: ${runtimeError}`));
    else {
      let placed;
      try { placed = locateChromeComponent(runtime); } catch (error) { checks.push(check('install placed the Chrome host and its configuration', error.code === 'chrome_host_not_installed' ? 'BLOCKED' : 'FAIL', `${error.code}: ${sanitize(error.message)}; ${error.hint ?? ''}`)); }
      if (placed) {
        const config = parseJson(readFileSync(placed.config, 'utf8'));
        const ok = [placed.host, placed.config, placed.record].every(p => existsSync(p)) && config?.codexHome === homeLayout(home).codexHome && hostConfig?.status === 'pass';
        checks.push(check('install placed the Chrome host and its configuration', ok ? 'PASS' : 'FAIL',
          `host, extension-host-config.json and component.json present in ${sanitize(placed.root)}; codexHome is $CUA_HOME/state/codex: ${config?.codexHome === homeLayout(home).codexHome}; doctor chrome.host.config ${hostConfig?.status ?? 'missing'}`));
        const tree = runtime.root;
        const before = snapshotTree(tree);
        const pointer = readFileSync(homeLayout(home).pointer, 'utf8');
        const again = await cua(['install', '--json', '--archive', NO_DOWNLOAD_GUARD]);
        const result = parseJson(again.stdout);
        const diff = diffSnapshots(before, snapshotTree(tree));
        const same = again.code === 0 && result?.changed === false && result?.chromeHost?.changed === false && diff.same && readFileSync(homeLayout(home).pointer, 'utf8') === pointer;
        checks.push(check('install again is a no-op (host and configuration unchanged)', same ? 'PASS' : 'FAIL',
          `${result ? `changed ${result.changed}, chromeHost.changed ${result.chromeHost?.changed}` : `${ended(again)}: ${sanitize(again.stderr.trim().split('\n').at(-1) ?? '')}`}; ${before.size} entries of the release compared: ${diff.same ? 'identical' : `${diff.added.length} added, ${diff.removed.length} removed, ${diff.changed.length} changed`}`));
      }
    }
    // The browsers' manifest slots, and what each run may do to them.
    const slotPaths = BROWSERS.map(b => ({browser: b.browser, path: join(userHome, b.dataDir, 'NativeMessagingHosts', `${NATIVE_HOST}.json`)}));
    const context = {home, userHome, suffixes: hostSuffixes(loadPins())};
    const readSlots = () => slotPaths.map(({browser, path}) => {
      let text = null;
      try { text = readFileSync(path, 'utf8'); } catch {}
      return {browser, ...classifySlot(text, context)};
    });
    const fingerprint = () => JSON.stringify([...slotPaths.map(({path}) => {
      try { const s = statSync(path); return `${createHash('sha256').update(readFileSync(path)).digest('hex')}:${s.mtimeMs}:${s.ino}`; } catch { return 'absent'; }
    }), existsSync(join(home, 'chrome'))]);
    const slotsNow = readSlots();
    const where = slotsNow.map(s => `${s.browser} ${s.state === 'foreign' ? s.pathClass : s.state}`).join(', ');
    let guard = registrationGuard(slotsNow);
    if (!guard.refusal.run) checks.push(check('cua chrome register refuses without --replace', 'BLOCKED', `${guard.refusal.reason} (slots: ${where})`));
    else {
      const before = fingerprint();
      const r = await cua(['chrome', 'register', '--json']);
      const out = parseJson(r.stdout);
      const unchanged = fingerprint() === before;
      const allDesktop = slotsNow.filter(s => s.state === 'foreign').every(s => s.pathClass === 'desktop');
      const sentence = allDesktop ? 'the desktop\'s registration is in use and already works with `cua serve`' : 'cua does not overwrite a registration it did not write';
      const ok = r.code === 1 && out?.error?.code === 'registration_in_use' && out.error.message.includes(sentence) && unchanged;
      checks.push(check('cua chrome register refuses without --replace', ok ? 'PASS' : 'FAIL',
        `exit ${r.code}; ${out?.error?.code ?? 'no error code'}: ${sanitize(out?.error?.message ?? r.stderr.trim())}; manifests and <home>/chrome unchanged (sha256, mtime, inode): ${unchanged}`));
    }
    guard = registrationGuard(readSlots());
    if (!guard.noop.run) checks.push(check('cua chrome unregister is a no-op when the manifest is not ours', 'BLOCKED', guard.noop.reason));
    else {
      const before = fingerprint();
      const r = await cua(['chrome', 'unregister', '--json']);
      const out = parseJson(r.stdout);
      const unchanged = fingerprint() === before;
      const ok = r.code === 0 && out?.ok === true && out.blocked === false && out.browsers?.every(b => ['not_ours', 'absent'].includes(b.action)) && unchanged;
      checks.push(check('cua chrome unregister is a no-op when the manifest is not ours', ok ? 'PASS' : 'FAIL',
        `exit ${r.code}; ${out?.browsers?.map(b => `${b.browser} ${b.action}${b.pathClass ? ` (${b.pathClass})` : ''}`).join(', ') ?? 'no result'}; manifests and <home>/chrome unchanged: ${unchanged}`));
    }
    checks.push(...(options['c6-report'] ? readReport(options['c6-report'], replaceGateChecks, 'live: --replace gate') : [replaceGateBlocked()]));
    checks.push(suiteClaims('npm test: placement, the coexistence rule, backup/restore and the CLI refusal', tap, [
      'a fresh install places the Chrome plugin as its own recorded component with the host configuration beside the host',
      'register refuses when the desktop\'s manifest is present, naming its class, and changes nothing anywhere',
      '--replace announces both consequences, backs the existing manifest up byte-for-byte, then registers our host',
      'unregister removes only our manifests and restores the backed-up one, verified byte-for-byte',
      'unregister is a no-op when the manifest is not ours: it leaves the desktop\'s registration byte-for-byte',
      'chrome register refuses while the desktop\'s manifest is present, with the stated sentence, and writes nothing',
    ]));
    addItem('C6', 'Host placement, the coexistence refusal, no-op unregister, and the --replace live gate', checks);
  }

  // ---- C7 -----------------------------------------------------------------------------------------------------------
  const git = args => run('git', ['-C', REPO, ...args], {timeoutMs: 60_000});
  const head = (await git(['rev-parse', '--short', 'HEAD'])).stdout.trim();
  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
  const dirty = (await git(['status', '--porcelain'])).stdout.trim().length > 0;
  {
    const checks = [];
    const parent = mkdtempSync('/tmp/cua-accept-c7.');
    const dir = join(parent, 'cua');
    try {
      const cloned = await run('git', ['clone', '--quiet', '--branch', branch, REPO, dir], {cwd: parent, timeoutMs: 120_000});
      if (cloned.code !== 0) checks.push(check('clean clone', 'FAIL', `git clone failed: ${cloned.stderr.trim()}`));
      else {
        const test = await run('npm', ['test'], {cwd: dir, env: testReporterEnv(cleanEnv()), timeoutMs: 300_000});
        const verdict = suiteVerdict({code: test.code, totals: testTotals(test.stdout)});
        checks.push(check('clean clone: npm test', verdict.status, `${verdict.reason} in ${seconds(test.ms)}`));
        // build:helper installs what it built into $CUA_HOME/bin: here a home inside the clone directory, never the user's.
        const build = await run('npm', ['run', 'build:helper'], {cwd: dir, env: cleanEnv({CUA_HOME: join(parent, 'home')}), timeoutMs: 900_000});
        checks.push(check('clean clone: npm run build:helper', build.code === 0 ? 'PASS' : 'FAIL', `${ended(build)} in ${seconds(build.ms)} (built inside the clone and installed into a home there; this checkout's helper and the installed one are untouched)`));
        if (build.code === 0) {
          const helper = await run('npm', ['run', 'test:helper'], {cwd: dir, env: testReporterEnv(cleanEnv()), timeoutMs: 900_000});
          const h = helperSuiteVerdict({code: helper.code, text: helper.stdout + helper.stderr});
          checks.push(check('clean clone: npm run test:helper', h.status, `${h.detail} in ${seconds(helper.ms)}`));
        } else checks.push(check('clean clone: npm run test:helper', 'FAIL', 'not run: build:helper failed'));
        const pack = await run('npm', ['pack', '--dry-run', '--json'], {cwd: dir, env: cleanEnv(), timeoutMs: 120_000});
        const packed = parseJson(pack.stdout);
        const entry = Array.isArray(packed) ? packed[0] : packed && Object.values(packed)[0];
        const files = entry?.files?.map(f => f.path) ?? [];
        const tracked = (await run('git', ['-C', dir, 'ls-files'], {timeoutMs: 60_000})).stdout.split('\n').filter(Boolean);
        checks.push(...packChecks({files, tracked, read: path => readFileSync(join(dir, path)), userHome}).map(c => ({...c, name: `clean clone: npm pack --dry-run: ${c.name}`})));
      }
    } finally { rmSync(parent, {recursive: true, force: true}); }
    addItem('C7', 'Clean clone: npm test, the helper suites, npm pack contents', checks, {head, branch, workingTreeDirty: dirty, cloneRemoved: !existsSync(parent)});
  }

  // ---- report -------------------------------------------------------------------------------------------------------
  const status = rollup(items.map(i => i.status));
  const report = {
    scenario: 'accept-chrome-all', status, release: runtime?.release ?? null, home: '$CUA_HOME', host: `${process.platform}-${process.arch}`, node: process.version,
    head, startedAt: started.toISOString(), finishedAt: new Date().toISOString(),
    supplied: {c2Report: Boolean(options['c2-report']), c6Report: Boolean(options['c6-report'])},
    summary: Object.fromEntries(items.map(i => [i.id, i.status])), items,
  };
  const text = JSON.stringify(report, (key, value) => typeof value === 'string' ? sanitize(value) : value, 2);
  // Instance ids and anything token-like stay out of the report.
  if (instanceIds.some(id => text.includes(id)) || tokenLike(text)) {
    process.stderr.write('accept-chrome --all: refusing to write a report that would disclose an instance id or a token-like string\n');
    return 1;
  }
  writeFileSync(options.report, text + '\n', {mode: 0o600});
  process.stdout.write(`accept-chrome --all: ${status}\nreport: ${options.report}\n`);
  for (const item of items) {
    process.stdout.write(`  ${item.status.padEnd(7)} ${item.id} ${item.title}\n`);
    for (const c of item.checks.filter(c => c.status !== 'PASS')) process.stdout.write(`      ${c.status.padEnd(7)} ${c.name}\n`);
  }
  return status === 'PASS' ? 0 : status === 'FAIL' ? 1 : 3;
}
