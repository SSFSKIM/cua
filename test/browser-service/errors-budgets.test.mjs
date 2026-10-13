// The service's error vocabulary (src/browser-service/errors.mjs) and its budgets (src/browser-service/budgets.mjs):
// the kept reasons and nothing else, the vendor's sentences, the navigation URL check, the clamp with its lifted
// maximum, and the Deadline that carries a command's remaining budget into each CDP call.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BrowserServiceError, KEPT_REASONS, serviceError, checkNavigationUrl, isDeadlineError} from '../../src/browser-service/errors.mjs';
import {
  DEFAULT_ACTION_MS, MAX_ACTION_MS, PRESS_SEQUENTIALLY_MS, DOWNLOAD_MS, CHOOSER_DEFAULT_MS, CHOOSER_MAX_MS, DIALOG_MS, LOAD_MS,
  clamp, Deadline, DEADLINE_EXCEEDED,
} from '../../src/browser-service/budgets.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };

test('KEPT_REASONS is exactly the design\'s kept vocabulary: no site status, approval, guardian, policy or recovery reason', () => {
  assert.deepEqual([...KEPT_REASONS].sort(), [
    'browser_capability_unavailable', 'browser_not_found', 'dialog_open', 'download_not_found', 'evaluate_interrupted',
    'file_chooser_not_found', 'invalid_url', 'strict_mode_violation', 'tab_detached', 'tab_not_found', 'timeout',
    'unsupported_backend', 'unsupported_command', 'unsupported_protocol',
  ]);
  for (const dropped of ['site_status_blocked', 'site_status_unavailable', 'approval_cancelled', 'guardian_denied', 'user_declined',
    'persisted_user_denied', 'enterprise_policy_blocked', 'browser_navigation_blocked', 'browser_capability_blocked', 'navigation_url_policy_blocked'])
    assert.equal(KEPT_REASONS.has(dropped), false, dropped);
});

test('BrowserServiceError carries name, code, message and retryable; a code outside the vocabulary is a programming error', () => {
  const error = new BrowserServiceError('timeout', 'it took too long');
  assert.ok(error instanceof Error);
  assert.equal(error.name, 'BrowserServiceError');
  assert.equal(error.code, 'timeout');
  assert.equal(error.message, 'it took too long');
  assert.equal(error.retryable, true);
  assert.equal(new BrowserServiceError('dialog_open', 'x').retryable, false);
  assert.equal(new BrowserServiceError('dialog_open', 'x', {retryable: true}).retryable, true);
  const cause = new Error('underlying');
  assert.equal(new BrowserServiceError('tab_detached', 'x', {cause}).cause, cause);
  assert.throws(() => new BrowserServiceError('site_status_blocked', 'x'), TypeError);
  assert.throws(() => new BrowserServiceError('timeout'), TypeError, 'a message is required');
});

test('serviceError builds the vendor\'s sentences for the reasons M1a raises', () => {
  assert.equal(serviceError('dialog_open', 'alert').message,
    'A alert JavaScript dialog is active in this tab. Use `tab.getJsDialog()` to get it and dismiss it first.');
  assert.equal(serviceError('browser_not_found', 'chrome:9').message, 'Browser is not available: chrome:9');
  assert.equal(serviceError('tab_not_found', 7, []).message, 'Tab not found: 7. Existing tabs: none');
  assert.equal(serviceError('tab_not_found', 7, [{id: 3, title: 'A', url: 'https://a.test/'}, {id: 4}]).message,
    'Tab not found: 7. Existing tabs: 3|A|https://a.test/, 4|<no title>|<no url>');
  assert.equal(serviceError('unsupported_command', 'tab_frobnicate').message, 'Unsupported browser command: tab_frobnicate');
  assert.equal(serviceError('timeout').message, DEADLINE_EXCEEDED);
  for (const code of KEPT_REASONS) assert.equal(serviceError(code, 'x', []).code, code);
});

test('checkNavigationUrl allows http, https and about:blank and refuses the rest with the vendor\'s sentences', () => {
  for (const url of ['https://www.nytimes.com/', 'http://127.0.0.1:48732/slow', 'about:blank']) assert.equal(checkNavigationUrl(url), undefined, url);
  assert.throws(() => checkNavigationUrl('not a url'), error => error.code === 'invalid_url'
    && error.message === 'Browser use cannot visit the requested page. The requested URL is invalid.');
  assert.throws(() => checkNavigationUrl('file:///etc/passwd'), error => error.code === 'unsupported_protocol'
    && error.message === 'Browser use cannot visit the requested page. The requested URL protocol is not allowed. Allowed protocols: "http:", "https:".');
  assert.throws(() => checkNavigationUrl('chrome://settings'), error => error.code === 'unsupported_protocol');
  assert.equal(checkNavigationUrl(undefined), undefined, 'no URL is no check (the vendor\'s Cz)');
});

test('isDeadlineError recognises the deadline sentence and the host\'s CDP timeout wording', () => {
  assert.equal(isDeadlineError(new Error(DEADLINE_EXCEEDED)), true);
  assert.equal(isDeadlineError(new Error('Timed out after 25ms waiting for CDP command Runtime.evaluate.')), true);
  assert.equal(isDeadlineError('Timed out after 5ms'), true);
  assert.equal(isDeadlineError(new Error('Debugger unattached')), false);
  assert.equal(isDeadlineError(null), false);
});

test('the budget constants are the vendor\'s, with the action maximum lifted to 120 s', () => {
  assert.deepEqual({DEFAULT_ACTION_MS, MAX_ACTION_MS, PRESS_SEQUENTIALLY_MS, DOWNLOAD_MS, CHOOSER_DEFAULT_MS, CHOOSER_MAX_MS, DIALOG_MS, LOAD_MS},
    {DEFAULT_ACTION_MS: 3000, MAX_ACTION_MS: 120000, PRESS_SEQUENTIALLY_MS: 5000, DOWNLOAD_MS: 120000, CHOOSER_DEFAULT_MS: 3000,
      CHOOSER_MAX_MS: 120000, DIALOG_MS: 60000, LOAD_MS: 10000});
});

test('clamp keeps the 3 s default, raises the budget up to 120 s and never goes below 0', () => {
  assert.equal(clamp(undefined), 3000);
  assert.equal(clamp(null), 3000);
  assert.equal(clamp(15000), 15000, 'a caller\'s timeoutMs raises the budget (the vendor capped it at 3 s)');
  assert.equal(clamp(500000), 120000);
  assert.equal(clamp(-5), 0);
  assert.equal(clamp(9000, PRESS_SEQUENTIALLY_MS), 5000);
  assert.equal(clamp(undefined, 1000), 1000);
});

test('a Deadline counts down, expires, and a child never outlives its parent', async () => {
  const d = new Deadline(60);
  assert.equal(d.expired(), false);
  assert.ok(d.remaining() > 0 && d.remaining() <= 60);
  assert.ok(d.child(10).remaining() <= 10);
  assert.ok(d.child(10_000).remaining() <= 60, 'the child is bounded by the parent');
  await sleep(80);
  assert.equal(d.expired(), true);
  assert.equal(d.remaining(), 0);
  assert.throws(() => d.check(), error => error instanceof BrowserServiceError && error.code === 'timeout' && error.message === DEADLINE_EXCEEDED);
  assert.equal(new Deadline(0).expired(), true);
  assert.throws(() => new Deadline(Number.NaN), TypeError);
});

test('Deadline.timeoutMs gives each CDP call what the command has left (at least 1 ms), and the caller\'s smaller bound', () => {
  const d = new Deadline(5000);
  assert.ok(d.timeoutMs() <= 5000 && d.timeoutMs() > 4900);
  assert.equal(d.timeoutMs(250), 250);
  assert.ok(d.timeoutMs(60_000) <= 5000, 'never more than is left');
  assert.throws(() => new Deadline(0).timeoutMs(), error => error.code === 'timeout', 'an expired deadline dispatches nothing');
});

test('Deadline.race settles with the work, or rejects with the deadline sentence when the budget runs out first', async () => {
  assert.equal(await new Deadline(200).race(Promise.resolve('done')), 'done');
  await assert.rejects(new Deadline(200).race(Promise.reject(new Error('own failure'))), /own failure/);
  const late = await rejection(new Deadline(20).race(sleep(500).then(() => 'late')));
  assert.equal(late.code, 'timeout');
  assert.equal(late.message, DEADLINE_EXCEEDED);
  const expired = new Deadline(0);
  let settled = false;
  const work = sleep(5).then(() => { settled = true; throw new Error('ignored'); });
  assert.equal((await rejection(expired.race(work))).code, 'timeout');
  await sleep(10);
  assert.equal(settled, true, 'a raced loser\'s rejection is absorbed, not unhandled');
});
