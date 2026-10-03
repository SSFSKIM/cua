// The fixed agent script of the Chrome acceptance (C2), run against an MCP session to `cua serve`, and the two pieces
// of state that must survive any failure of it: the stop latch and the created tab's ownership record.
//
// Stop latch. The elicitation policy accepts only the structured origin-access request for the runner's own page
// origin (session scope). The first request it declines latches a stop: from then on every request is declined
// (even the own-origin one) and no further browser input or observation is sent; only the still-authorized cleanup
// of the tab the run created (close, then confirm) runs.
//
// Tab record. Created outside the script by the caller, so whatever throws (a cell, a full disk while keeping the
// screenshot), the script's finally still attempts the close of a tab it created, and the caller reads the leftover
// from the record: anything short of a confirmed close is reported for the user. end_task and process teardown do
// not prove a tab closed.
import {createHash} from 'node:crypto';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decideElicitation, answerFor, inventoryEntry} from '../probe/chrome/original/elicitation.mjs';
import {cellOutcome} from '../probe/chrome/original/classify.mjs';
import {RESULT_MARKER} from '../probe/chrome/original/cells.mjs';
import {PAGE_TITLE, expectedDigest} from './chrome-page.mjs';
import * as cells from './chrome-cells.mjs';

export const LIMITS = {
  select: {cellMs: 30_000, callMs: 60_000}, create: {cellMs: 60_000, callMs: 90_000}, goto: {cellMs: 45_000, callMs: 75_000},
  default: {cellMs: 30_000, callMs: 60_000},
};

export function createStopLatch() {
  const latch = {stopped: false, reason: null, stop(reason) { if (!latch.stopped) { latch.stopped = true; latch.reason = reason; } }};
  return latch;
}

// The session's answer to every server request; each one is recorded in `inventory`.
export function elicitationPolicy({origin, latch, inventory}) {
  return msg => {
    const decided = decideElicitation(msg, {origin});
    const decision = latch.stopped && decided.accept ? {...decided, accept: false, reason: `the run stopped earlier (${latch.reason})`} : decided;
    inventory.push(inventoryEntry(msg, decision));
    if (!decision.accept) latch.stop(`declined ${decision.kind}`);
    return answerFor(decision);
  };
}

export const newTabRecord = () => ({createAttempted: false, created: false, closeAttempted: false, closed: false, confirmed: false, stillListed: false});

export function leftoverOf(tab) {
  const hand = 'The runner did not reconnect or retry.';
  if (!tab.createAttempted) return {status: 'none'};
  if (!tab.created) return {status: 'unknown', note: `createBrowserTab did not return a tab; if a new tab appeared in Chrome, close it by hand. ${hand}`};
  if (!tab.closed) return {status: 'possibly-open', note: `the runner's own tab ("${PAGE_TITLE}" on 127.0.0.1) could not be closed${tab.closeAttempted ? '' : ' (no close was possible)'}; close it by hand. ${hand}`};
  if (tab.stillListed) return {status: 'open', note: `the runner's own tab ("${PAGE_TITLE}" on 127.0.0.1) is still listed after close(); close it by hand. ${hand}`};
  if (!tab.confirmed) return {status: 'unconfirmed', note: `the runner's own tab was closed but its absence could not be confirmed; if it is still open, close it by hand. ${hand}`};
  return {status: 'none'};
}

// The screenshot is kept outside the repository; only its size and SHA-256 are reported.
export function keepScreenshot(bytes) {
  const file = join(mkdtempSync(join(tmpdir(), 'cua-m11-shot-')), `owned-tab.${bytes[0] === 0xff ? 'jpeg' : 'png'}`);
  writeFileSync(file, bytes, {mode: 0o600});
  return file;
}

// Runs the script; `record(name, status, detail)` collects steps, `facts` gets cellsSent/tabOperations, `shots` the
// screenshot bytes, file and metadata. Throws whatever failed unexpectedly, after the finally's cleanup attempt.
export async function runAgentScript({session, page, instanceId, reference, sentinel, latch, tab, record, facts, shots = {}, saveScreenshot = keepScreenshot, limits = LIMITS}) {
  const run = async (name, code, limit = limits.default) => {
    facts.cellsSent.push(name);
    const started = Date.now();
    const reply = await session.request('tools/call', {name: 'js', arguments: {code, title: `cua accept ${name}`, timeout_ms: limit.cellMs}}, limit.callMs);
    const content = reply.result?.content ?? [];
    const text = content.filter(c => c.type === 'text').map(c => c.text).join('\n');
    let result = null;
    try { result = JSON.parse(text.match(new RegExp(`${RESULT_MARKER} (\\{.*\\})`))?.[1] ?? 'null'); } catch {}
    const cell = reply.timedOut ? {probeError: `${name} timed out after ${limit.callMs} ms`, images: []}
      : {isError: reply.result?.isError === true, result, images: content.filter(c => c.type === 'image'), ...(result ? {} : {unmarked: text.slice(0, 600)})};
    return {...cellOutcome(cell), durationMs: Date.now() - started, result, images: cell.images};
  };
  const stoppedBefore = names => { record('input-stopped', 'BLOCKED', {reason: latch.reason, notSent: names}); };
  const withText = c => (c.text ? {text: c.text} : {});

  try {
    const select = await run('selectBrowser', cells.selectBrowser(instanceId), limits.select);
    if (!record('select-profile-backend', select.result?.selected === true ? 'PASS' : 'FAIL', {class: select.class, ...withText(select)})) return;
    if (latch.stopped) return stoppedBefore(['createBrowserTab']);

    tab.createAttempted = true;
    const create = await run('createBrowserTab', cells.CREATE_TAB, limits.create);
    facts.tabOperations++;
    tab.created = create.result?.created === true;
    if (!record('create-tab', tab.created ? 'PASS' : 'FAIL', {class: create.class, durationMs: create.durationMs, limitMs: limits.create.cellMs, ...withText(create)})) return;

    // Every browser operation after this point first checks the latch; a stop leaves only the cleanup below. Each step
    // returns whether it succeeded (its record's PASS), so any failure stops the later steps the same way.
    const steps = [
      ['gotoOwnedPage', async () => {
        const go = await run('gotoOwnedPage', cells.gotoPage(page), limits.goto);
        const verified = go.result?.markerFound === true;
        return record('owned-page', verified ? 'PASS' : 'FAIL', {class: go.class, markerFound: verified, ...withText(go)});
      }],
      ['fillSecretReference', async () => {
        const fill = await run('fillSecretReference', cells.fillReference(page, reference));
        return record('fill-secret-reference', fill.result?.filled === true ? 'PASS' : 'FAIL', {class: fill.class, ...withText(fill)});
      }],
      ['computeDigest', async () => {
        const digest = await run('computeDigest', cells.computeDigest(page));
        const matches = typeof digest.result?.digest === 'string' && digest.result.digest === expectedDigest(sentinel);
        return record('page-digest-matches-sentinel', matches ? 'PASS' : 'FAIL', {class: digest.class, digestShown: typeof digest.result?.digest === 'string', digestMatches: matches, ...withText(digest)});
      }],
      ['inducedFailure', async () => {
        const induced = await run('inducedFailure', cells.inducedFailure(page, reference));
        const r = induced.result ?? {};
        return record('induced-failure-value-free', r.code === 'secret_input_failed' && typeof r.classification === 'string' && !r.unexpectedSuccess ? 'PASS' : 'FAIL',
          {class: induced.class, code: r.code ?? null, classification: r.classification ?? null, ...(r.unexpectedSuccess ? {unexpectedSuccess: true} : {})});
      }],
      ['getScreenshot', async () => {
        const shot = await run('getScreenshot', cells.screenshot(page));
        if (shot.images.length === 1) {
          shots.bytes = Buffer.from(shot.images[0].data, 'base64');
          shots.meta = {bytes: shots.bytes.length, sha256: createHash('sha256').update(shots.bytes).digest('hex'), sizeMatches: shots.bytes.length === shot.result?.bytes};
          shots.file = saveScreenshot(shots.bytes);
        }
        return record('screenshot', shots.meta?.sizeMatches ? 'PASS' : 'FAIL', {class: shot.class, ...(shots.meta ?? {images: shot.images.length})});
      }],
    ];
    for (let i = 0; i < steps.length; i++) {
      if (latch.stopped) return stoppedBefore(steps.slice(i).map(([name]) => name));
      facts.tabOperations++;
      if (!await steps[i][1]()) return record('input-stopped', 'BLOCKED', {reason: `${steps[i][0]} did not succeed`, notSent: steps.slice(i + 1).map(([name]) => name)});
    }
  } finally {
    // Still-authorized cleanup of the tab this run created, whatever happened above.
    if (tab.created && !tab.closeAttempted) {
      tab.closeAttempted = true;
      facts.tabOperations++;
      const close = await run('closeCreatedTab', cells.CLOSE_TAB).catch(() => null);
      tab.closed = close?.result?.closed === true;
      if (tab.closed) {
        const confirm = await run('confirmClosed', cells.CONFIRM_CLOSED).catch(() => null);
        tab.confirmed = confirm?.class === 'ok' && confirm.result?.stillListed === false;
        tab.stillListed = confirm?.result?.stillListed === true;
      }
    }
  }
}
