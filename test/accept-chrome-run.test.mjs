// The Chrome acceptance's fixed agent script against a fake MCP session (no runtime, no browser): a declined
// elicitation latches a stop after which only the created tab's cleanup is sent, and an exception after the tab was
// created still closes it, with the leftover read from the tab record rather than from a normal return.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStopLatch, elicitationPolicy, newTabRecord, leftoverOf, runAgentScript} from '../scripts/accept/chrome-run.mjs';
import {expectedDigest} from '../scripts/accept/chrome-page.mjs';
import {originAccessRequest, downloadRequest} from '../scripts/probe/chrome/original/vendor-shapes.mjs';

const ORIGIN = 'http://127.0.0.1:4567';
const PAGE = {origin: ORIGIN, url: `${ORIGIN}/`, documentMarker: 'doc-marker'};
const SENTINEL = 'cua-m11-sentinel-test';
const elicit = params => ({jsonrpc: '2.0', id: 'e', method: 'elicitation/create', params});
const marker = out => ({result: {content: [{type: 'text', text: `PROBERESULT ${JSON.stringify(out)}`}]}});

// Answers each cell by name; `during[name]` runs while that cell is "in flight" (e.g. a server request arrives).
function fakeSession({during = {}, answers = {}} = {}) {
  const sent = [];
  const defaults = {
    selectBrowser: () => marker({selected: true}),
    createBrowserTab: () => marker({created: true}),
    gotoOwnedPage: () => marker({markerFound: true}),
    fillSecretReference: () => marker({filled: true}),
    computeDigest: () => marker({digest: expectedDigest(SENTINEL)}),
    inducedFailure: () => marker({code: 'secret_input_failed', classification: 'failed'}),
    getScreenshot: () => ({result: {content: [{type: 'text', text: 'PROBERESULT {"bytes":3}'}, {type: 'image', data: Buffer.from([0xff, 0xd8, 0xff]).toString('base64'), mimeType: 'image/jpeg'}]}}),
    closeCreatedTab: () => marker({closed: true}),
    confirmClosed: () => marker({stillListed: false}),
  };
  return {
    sent,
    request: async (method, params) => {
      const name = params.arguments.title.replace('cua accept ', '');
      sent.push(name);
      during[name]?.();
      return (answers[name] ?? defaults[name])();
    },
  };
}

function harness(session, options = {}) {
  const latch = createStopLatch();
  const inventory = [];
  const policy = elicitationPolicy({origin: ORIGIN, latch, inventory});
  const steps = [];
  const record = (name, status, detail) => { steps.push({name, status, detail}); return status === 'PASS'; };
  const tab = newTabRecord();
  const facts = {cellsSent: [], tabOperations: 0};
  const run = () => runAgentScript({session, page: PAGE, instanceId: 'inst-a', reference: '{{secret:l}}', sentinel: SENTINEL, latch, tab, record, facts, saveScreenshot: () => '/tmp/x.jpeg', ...options});
  return {latch, inventory, policy, steps, tab, facts, run};
}

test('the happy path sends the whole script, then closes and confirms the created tab', async () => {
  const session = fakeSession();
  const h = harness(session);
  await h.run();
  assert.deepEqual(session.sent, ['selectBrowser', 'createBrowserTab', 'gotoOwnedPage', 'fillSecretReference', 'computeDigest', 'inducedFailure', 'getScreenshot', 'closeCreatedTab', 'confirmClosed']);
  assert.deepEqual(leftoverOf(h.tab), {status: 'none'});
  assert.ok(h.steps.every(s => s.status === 'PASS'), JSON.stringify(h.steps.filter(s => s.status !== 'PASS')));
});

test('a decline during the fill stops every later input; only the cleanup of the created tab is sent', async () => {
  let h;
  const answers = [];
  const session = fakeSession({during: {fillSecretReference: () => {
    answers.push(h.policy(elicit(downloadRequest(ORIGIN))));
    answers.push(h.policy(elicit(originAccessRequest(ORIGIN))));   // even the own origin is declined once stopped
  }}});
  h = harness(session);
  await h.run();
  assert.deepEqual(session.sent, ['selectBrowser', 'createBrowserTab', 'gotoOwnedPage', 'fillSecretReference', 'closeCreatedTab', 'confirmClosed']);
  assert.deepEqual(answers, [{action: 'decline'}, {action: 'decline'}]);
  assert.equal(h.latch.stopped, true);
  const stop = h.steps.find(s => s.name === 'input-stopped');
  assert.equal(stop.status, 'BLOCKED');
  assert.deepEqual(stop.detail.notSent, ['computeDigest', 'inducedFailure', 'getScreenshot']);
  assert.deepEqual(leftoverOf(h.tab), {status: 'none'});
});

test('an own-origin request before any decline is accepted for the session', () => {
  const h = harness(fakeSession());
  assert.deepEqual(h.policy(elicit(originAccessRequest(ORIGIN))), {action: 'accept', content: {}, _meta: {persist: 'session'}});
  assert.equal(h.latch.stopped, false);
});

test('an exception after the tab was created (full disk keeping the screenshot) still closes it before propagating', async () => {
  const session = fakeSession();
  const enospc = Object.assign(new Error('ENOSPC: no space left on device, mkdtemp'), {code: 'ENOSPC'});
  const h = harness(session, {saveScreenshot: () => { throw enospc; }});
  await assert.rejects(h.run(), error => error === enospc);
  assert.deepEqual(session.sent.slice(-3), ['getScreenshot', 'closeCreatedTab', 'confirmClosed']);
  assert.deepEqual(leftoverOf(h.tab), {status: 'none'});
});

test('when closure cannot be established the leftover is reported, never "none"', async () => {
  const failingClose = fakeSession({answers: {closeCreatedTab: () => ({timedOut: true})}});
  const a = harness(failingClose, {saveScreenshot: () => { throw new Error('ENOSPC'); }});
  await assert.rejects(a.run());
  assert.equal(leftoverOf(a.tab).status, 'possibly-open');
  assert.equal(failingClose.sent.includes('confirmClosed'), false, 'nothing is sent after a failed close');

  const unconfirmed = fakeSession({answers: {confirmClosed: () => ({timedOut: true})}});
  const b = harness(unconfirmed);
  await b.run();
  assert.equal(leftoverOf(b.tab).status, 'unconfirmed');

  const createLost = fakeSession({answers: {createBrowserTab: () => ({timedOut: true})}});
  const c = harness(createLost);
  await c.run();
  assert.equal(leftoverOf(c.tab).status, 'unknown');
  assert.equal(createLost.sent.includes('closeCreatedTab'), false, 'no tab id, so nothing is guessed or closed');
});

test('a failed digest or induced-failure step stops every later browser operation; only the cleanup is sent', async () => {
  const cases = {
    'digest mismatch': [{computeDigest: () => marker({digest: '0'.repeat(16)})}, 'computeDigest', ['inducedFailure', 'getScreenshot']],
    'digest timeout': [{computeDigest: () => ({timedOut: true})}, 'computeDigest', ['inducedFailure', 'getScreenshot']],
    'induced failure not value-free': [{inducedFailure: () => marker({unexpectedSuccess: true})}, 'inducedFailure', ['getScreenshot']],
  };
  for (const [name, [answers, failed, notSent]] of Object.entries(cases)) {
    const session = fakeSession({answers});
    const h = harness(session);
    await h.run();
    const upTo = ['selectBrowser', 'createBrowserTab', 'gotoOwnedPage', 'fillSecretReference', 'computeDigest', 'inducedFailure'];
    assert.deepEqual(session.sent, [...upTo.slice(0, upTo.indexOf(failed) + 1), 'closeCreatedTab', 'confirmClosed'], name);
    const stop = h.steps.find(s => s.name === 'input-stopped');
    assert.equal(stop?.status, 'BLOCKED', name);
    assert.deepEqual(stop.detail.notSent, notSent, name);
    assert.deepEqual(leftoverOf(h.tab), {status: 'none'}, name);
  }
});
