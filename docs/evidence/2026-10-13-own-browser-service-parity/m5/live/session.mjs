#!/usr/bin/env node
// M5's live checks on the default selection (spec docs/doperpowers/specs/2026-10-13-own-browser-service-design.md, M5
// task 3; acceptance 1 to 3 and 7's live half). One `cua serve` on the mini's parity clone, started over ssh with
// CUA_BROWSER_SERVICE removed from its environment so the launch resolves the service itself (this home is on the cua
// route), drives a list of scenarios through the parity harness's own runner (scripts/browser-parity/runner.mjs: the
// real REPL client, the fixture reset and state, the same cell envelope) in that one connection, one after another.
// The harness's `run` always sets CUA_BROWSER_SERVICE, so this driver keeps the harness's pieces and replaces only the
// serve command. Before the first scenario it records the launch's own resolution (launch.mjs browserServiceFor) and
// attests the documentation's marker against it. With --network it also starts live/sampler.mjs on the mini beside the
// serve and lists $CUA_HOME/state/codex before and after (live/codex-listing.mjs).
//   node m5/live/session.mjs --out <dir> --scenarios <file>[,<file>...] [--network]
import {parseArgs} from 'node:util';
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync} from 'node:fs';
import {join, resolve, relative} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {StdioClient, textOf} from '../../../../../scripts/browser-parity/mcp.mjs';
import {attest, runScenario} from '../../../../../scripts/browser-parity/runner.mjs';
import {root, execute, remoteCommand, quote} from '../../../../../scripts/browser-parity/topology.mjs';
import {fixtureProcess} from '../../../../../scripts/browser-parity/resources.mjs';
import {startCollector} from './collector.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const {values} = parseArgs({options: {out: {type: 'string'}, scenarios: {type: 'string'}, network: {type: 'boolean', default: false}, device: {type: 'string', default: 'mini'}}});
const out = resolve(values.out);
if (existsSync(join(out, 'meta.json'))) throw new Error('Output directory already contains a run');
mkdirSync(out, {recursive: true});
const prepared = JSON.parse(readFileSync(join(root, '.doperpowers/sde/browser-parity', `${values.device}.json`), 'utf8'));
const remote = script => execute(remoteCommand(values.device, script));
const log = line => { console.log(line); appendFileSync(join(out, 'run-output.txt'), line + '\n'); };
const remoteDir = `/tmp/cua-m5-live-${randomUUID()}`;
const scenarioPaths = values.scenarios.split(',').map(p => resolve(p.trim()));
const scenarios = await Promise.all(scenarioPaths.map(async p => (await import(pathToFileURL(p))).default));
const meta = {commit: prepared.commit, checkout: prepared.checkout, home: prepared.home, profile: prepared.profile, device: values.device,
  fixturePort: prepared.fixturePort, environment: {CUA_BROWSER_SERVICE: '(removed: env -u)', CUA_SHIM_SURFACES: 'browser', CUA_HOME: prepared.home},
  connection: 'one cua serve for every scenario', scenarios: scenarioPaths.map(p => relative(root, p)), cases: scenarios.map(s => s.id),
  started: new Date().toISOString(), complete: false};
writeFileSync(join(out, 'results.jsonl'), '');

let fixture, client, collector, failed = false;
try {
  const actual = remote(`cd ${quote(prepared.checkout)} && git rev-parse HEAD && git status --porcelain`).trim().split('\n');
  if (actual[0] !== prepared.commit || actual.length > 1) throw new Error('Parity clone moved or is dirty since prepare');
  // The launch's own resolution for this environment and home.
  meta.resolution = JSON.parse(remote(`cd ${quote(prepared.checkout)} && env -u CUA_BROWSER_SERVICE CUA_HOME=${quote(prepared.home)} node --input-type=module -e ${quote(
    `import {browserServiceFor} from './src/runtime/launch.mjs';import {chromeRoute} from './src/chrome/route.mjs';const h=process.env.CUA_HOME;console.log(JSON.stringify({route:chromeRoute(h),...browserServiceFor(process.env,h)}));`)}`).trim());
  log(`resolution: CUA_BROWSER_SERVICE unset, home route ${meta.resolution.route} -> ${meta.resolution.service} (${meta.resolution.reason}) at ${prepared.commit}`);
  remote(`mkdir -m 700 ${quote(remoteDir)}`);
  for (const name of ['sampler.mjs', 'codex-listing.mjs']) {
    const put = remoteCommand(values.device, `cat > ${quote(`${remoteDir}/${name}`)}`);
    execFileSync(put.command, put.args, {input: readFileSync(join(here, name))});
  }
  const listing = () => JSON.parse(remote(`node ${quote(`${remoteDir}/codex-listing.mjs`)} ${quote(prepared.home)}`));
  if (values.network) meta.codexBefore = listing();
  fixture = await fixtureProcess(prepared);
  if (values.network) {
    const command = remoteCommand(values.device, `exec node ${quote(`${remoteDir}/sampler.mjs`)} ${quote(`${remoteDir}/serve.pid`)}`);
    collector = startCollector(command);
    await collector.ready();                          // nettop's first sample precedes the serve
  }
  const serve = remoteCommand(values.device, `cd ${quote(prepared.checkout)} && echo $$ > ${quote(`${remoteDir}/serve.pid`)} && exec env -u CUA_BROWSER_SERVICE CUA_HOME=${quote(prepared.home)} CUA_SHIM_SURFACES='browser' node bin/cua.mjs serve`);
  meta.elicitations = [];
  client = new StdioClient({...serve, onElicitation: row => meta.elicitations.push(row)});
  await client.initialize();
  const profiles = (await client.call('profiles_list')).structuredContent?.profiles;
  const profile = profiles?.find(p => p.key === prepared.profile);
  if (!profile?.ready || !profile.extensionInstanceId) throw new Error(`Prepared profile ${prepared.profile} is not ready`);
  const selected = await client.call('js', {code: `globalThis.browser=await cua.getBrowser({extensionInstanceId:${JSON.stringify(profile.extensionInstanceId)}}); nodeRepl.write(await browser.documentation());`, timeout_ms: 60000, title: 'M5 live service attestation'});
  if (selected.isError) throw new Error('Service selection failed');
  meta.attestation = attest(textOf(selected), meta.resolution.service);
  log(`attested: ${meta.resolution.service} (${meta.attestation.header}; ${meta.attestation.marker ?? 'no cua marker'}) at ${prepared.commit}`);
  meta.servePid = Number(remote(`cat ${quote(`${remoteDir}/serve.pid`)}`).trim());
  const fixtureURL = fixture.url, browserFixtureURL = fixture.browserURL;
  for (const scenario of scenarios) {
    const result = await runScenario(scenario, {client, service: meta.resolution.service, fixtureURL, browserFixtureURL, instanceId: profile.extensionInstanceId,
      emit: row => appendFileSync(join(out, 'results.jsonl'), JSON.stringify(row) + '\n')});
    log(`case ${scenario.id} ${result.assertion.ok ? 'ok' : 'FAIL ' + (result.assertion.reason ?? 'assertion')}`);
    failed ||= !result.assertion.ok;
  }
  meta.complete = true;
} catch (e) { meta.error = e.message; failed = true; log(`error: ${e.message}`); }
finally {
  // Every step runs whatever the one before it did, so the fixture, the sampler and the mini's scratch are always
  // released; a step that fails marks the run failed.
  const step = async (name, action) => { try { await action(); } catch (e) { (meta.cleanupErrors ??= []).push(`${name}: ${e.message}`); failed = true; } };
  await step('serve', async () => { if (client) meta.serveExit = await client.close(); });
  await step('sampler', async () => {
    if (!collector) return;
    await new Promise(r => setTimeout(r, 5000));      // the serve's children wind down; the sampler keeps watching
    const result = await collector.stop();
    if (result.summary) meta.network = result.summary;
    if (!result.ok) { meta.networkError = result.reason; failed = true; log(`observation failed: ${result.reason}`); }
  });
  await step('fixture', async () => { if (fixture) await fixture.close(); });
  if (values.network) await step('codex listing', () => { meta.codexAfter = JSON.parse(remote(`node ${quote(`${remoteDir}/codex-listing.mjs`)} ${quote(prepared.home)}`)); });
  await step('scratch', () => { remote(`rm -rf ${quote(remoteDir)}`); });
  meta.finished = new Date().toISOString();
  const {codexBefore, codexAfter, network, ...rest} = meta;
  writeFileSync(join(out, 'meta.json'), JSON.stringify(rest, null, 2) + '\n');
  if (network) writeFileSync(join(out, 'network-raw.json'), JSON.stringify(network, null, 2) + '\n');
  if (codexBefore) writeFileSync(join(out, 'codex-before.json'), JSON.stringify(codexBefore) + '\n');
  if (codexAfter) writeFileSync(join(out, 'codex-after.json'), JSON.stringify(codexAfter) + '\n');
}
process.exitCode = failed ? 1 : 0;
