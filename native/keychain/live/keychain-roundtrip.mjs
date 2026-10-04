#!/usr/bin/env node
// Opt-in live Keychain roundtrip with the production helper (`npm run test:keychain-live`; never part of `npm test`
// or `npm run test:helper`). It touches exactly one Keychain item, a uniquely named disposable label in the
// "cua.secrets" service, holding generated sentinel values, and deletes that item in `finally`. It never reads any
// other item's value. Steps:
//   create   production `set` typed at a pty by the test-owned seeding fixture (generated sentinel 1)
//   list     production `list` shows the label
//   read 1   production broker -> trusted client returns sentinel 1
//   replace  production `set` again with generated sentinel 2
//   read 2   the broker returns sentinel 2
//   forged   a wrong token gets nothing
//   cleanup  production `remove --yes` deletes the item; `list` no longer shows it
// Every step has a timeout: a Keychain or access prompt (which this script never answers) shows up as a step that
// does not finish, and is reported BLOCKED with the human action needed. Behavioral failures, including cleanup, are
// FAIL; only a full roundtrip with cleanup is PASS. The report holds metadata only, never the generated values (it is
// checked for them before it is written). Exit 0 PASS, 1 FAIL, 3 BLOCKED.
//
//   node native/keychain/live/keychain-roundtrip.mjs [--report <file>]
import {randomBytes, randomUUID} from 'node:crypto';
import {mkdtempSync, rmSync, realpathSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import net from 'node:net';
import {parseArgs} from 'node:util';
import {locateHelper, inspectKeychainHelper} from '../../../src/secrets/helper.mjs';
import {startBroker} from '../../../src/secrets/broker.mjs';
import {brokerClient} from '../../../src/secrets/client.mjs';
import {runCaptured} from '../../../src/secrets/commands.mjs';
import {PTY_DRIVER, setThroughTerminal} from '../fixtures/seed.mjs';

const {values: options} = parseArgs({options: {report: {type: 'string'}}, strict: true});
const STEP_MS = 15_000;
// The helper cua runs for this CUA_HOME (installed copy first, then the checkout build).
const HELPER = locateHelper().path;
const PROMPT_ACTION = 'a Keychain prompt may be waiting: dismiss it (do not allow) and re-run at a time a human can answer Keychain prompts, or sign the helper with a stable identity (npm run build:helper -- --sign <identity>)';

const label = `cua-live-${randomUUID()}`;
const sentinels = [1, 2].map(() => `cua-sentinel-${randomBytes(18).toString('base64url')}`);
const steps = [];
const record = (name, status, detail) => { steps.push({name, status, detail}); return status === 'PASS'; };
const within = (promise, ms) => {
  let timer;
  return Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve({timedOutAfterMs: ms}), ms); })]).finally(() => clearTimeout(timer));
};
const viaNet = path => net.createConnection(path);

async function seed(name, value) {
  const r = await setThroughTerminal({helper: HELPER, label, value, timeoutMs: STEP_MS});
  if (r.echoed) return record(name, 'FAIL', 'the value appeared in terminal output');
  if (!r.terminalRestored) return record(name, 'FAIL', 'the terminal modes were not restored');
  if (r.timedOut) return record(name, 'BLOCKED', `set did not finish within ${STEP_MS} ms (step ${r.failedStep ?? 'exit'}); ${PROMPT_ACTION}`);
  if (r.exit !== 0) return record(name, 'FAIL', `set exited ${r.exit ?? `by signal ${r.signal}`}`);
  return record(name, 'PASS', 'stored through the hidden prompt; terminal restored; value not echoed');
}

async function read(name, client, expected) {
  const outcome = await within(client.read(label).then(value => ({value}), error => ({error})), STEP_MS + 1000);
  if (outcome.timedOutAfterMs) return record(name, 'BLOCKED', `no answer within ${outcome.timedOutAfterMs} ms; ${PROMPT_ACTION}`);
  if (outcome.error) {
    const blocked = ['timeout', 'denied', 'locked'].includes(outcome.error.code);
    return record(name, blocked ? 'BLOCKED' : 'FAIL', `broker read failed: ${outcome.error.code}${blocked ? `; ${PROMPT_ACTION}` : ''}`);
  }
  return outcome.value === expected
    ? record(name, 'PASS', 'the trusted client received exactly the generated value')
    : record(name, 'FAIL', 'the broker returned a different value');
}

async function listed() {
  const r = await runCaptured(HELPER, ['list']);
  if (r.code !== 0) return {error: r.stderr.trim().split('\n').pop()};
  try { return {labels: JSON.parse(r.stdout).labels}; } catch { return {error: 'unreadable list output'}; }
}

let created = false;
let broker;
const scratch = realpathSync(mkdtempSync('/tmp/ckl-'));
try {
  if (!locateHelper().built || !locateHelper({path: PTY_DRIVER}).built) {
    record('preconditions', 'BLOCKED', 'build the helper (npm run build:helper) and the test products (npm run test:helper) first');
  } else {
    const info = await inspectKeychainHelper({path: HELPER});
    record('preconditions', 'PASS', `helper ${info.signature?.adhoc ? 'ad-hoc signed' : `signed by ${info.signature?.authority ?? 'unknown'}`}; label ${label}`);
    created = true;  // from here on, cleanup must run even if creation is only partially confirmed
    if (await seed('create', sentinels[0])) {
      const list = await within(listed(), STEP_MS);
      const shown = list.labels?.includes(label);
      record('list', shown ? 'PASS' : list.timedOutAfterMs ? 'BLOCKED' : 'FAIL', shown ? 'the label is listed' : list.timedOutAfterMs ? PROMPT_ACTION : `label missing (${list.error ?? 'not in the list'})`);
      broker = await startBroker({command: HELPER, endpoint: join(scratch, 'b.sock')});
      const client = brokerClient({endpoint: broker.endpoint, token: broker.token, connect: viaNet, timeoutMs: STEP_MS});
      if (await read('read 1', client, sentinels[0]) && await seed('replace', sentinels[1])) await read('read 2', client, sentinels[1]);
      const forged = await brokerClient({endpoint: broker.endpoint, token: 'f'.repeat(43), connect: viaNet}).read(label).then(() => 'value', error => error.code);
      record('forged token', forged === 'unauthorized' ? 'PASS' : 'FAIL', `a wrong token got ${forged === 'value' ? 'a value' : forged}`);
    }
  }
} catch (error) {
  record('unexpected', 'FAIL', `${error.code ?? 'error'}: ${error.message}`);
} finally {
  if (broker) {
    const closed = await broker.close({budgetMs: 3000});
    record('broker close', closed.confirmed ? 'PASS' : 'FAIL', closed.confirmed ? `stopped after ${closed.steps.join(', ')}; endpoint removed` : closed.reason);
  }
  if (created) {
    const removed = await within(runCaptured(HELPER, ['remove', label, '--yes']), STEP_MS);
    const after = await within(listed(), STEP_MS);
    const gone = Array.isArray(after.labels) && !after.labels.includes(label);
    const notFound = /\[not_found\]/.test(removed.stderr ?? '');
    if (gone && (removed.code === 0 || notFound)) record('cleanup', 'PASS', removed.code === 0 ? 'the scenario-owned item was removed' : 'no item was left to remove');
    else record('cleanup', removed.timedOutAfterMs || after.timedOutAfterMs ? 'BLOCKED' : 'FAIL',
      `CLEANUP FAILED for ${label}: remove ${removed.timedOutAfterMs ? 'timed out' : `exited ${removed.code}`}; still listed: ${!gone}. Remove it with: node bin/cua.mjs secrets remove ${label}`);
  }
  rmSync(scratch, {recursive: true, force: true});
}

const status = steps.some(s => s.status === 'FAIL') ? 'FAIL' : steps.some(s => s.status === 'BLOCKED') ? 'BLOCKED' : 'PASS';
const report = {scenario: 'live-keychain-roundtrip', status, label, steps, date: new Date().toISOString()};
const text = JSON.stringify(report, null, 2);
if (sentinels.some(value => text.includes(value))) {
  console.error('keychain-roundtrip: refusing to write a report containing a generated value');
  process.exit(1);
}
if (options.report) writeFileSync(options.report, text + '\n', {mode: 0o600});
console.log(text);
process.exit(status === 'PASS' ? 0 : status === 'FAIL' ? 1 : 3);
