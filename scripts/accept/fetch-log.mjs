// The fetch log of acceptance 13's installs (#171 M6b, T6; its pre-flight §5.2, "Two witnesses are new"): a preload,
// `node --import <this file> bin/cua.mjs install`, that wraps globalThis.fetch and writes every URL the process asks for,
// the URL that answered, its status and the bytes its body gave, one JSON line each, to the file FETCH_LOG names. cua's
// code is not changed by it: every installer takes `fetch = globalThis.fetch` as a default parameter, read at its call,
// and the preload runs before the entry point is imported. Whether it sees every fetch is not assumed: the older cua's
// install under the same preload must show the vendor's deb asked for and answered in full (the control), and this cua's
// must show every pinned asset (linux-runtime-cells.mjs fetchLogProblems).
//
// Each fetch gives two lines: {event: 'asked', id, url, at} when it is called, then one of (`answered` the final URL's
// origin and path)
//   {event: 'answered', id, url, answered, status, redirected, bytes, complete}  once its body has ended (complete) or
//                                                                                 failed or was cancelled (not complete);
//   {event: 'failed', id, url, error}                                            when the fetch itself rejected.
// A fetch asked and never ended (the process exited first) has its `asked` line alone.
//
// Its first line is READY, written once fetch is wrapped: a log without it, or empty, witnesses nothing (fix wave 1).
// Imported for its reader (readFetchLog) it changes nothing: the wrapper is installed only when FETCH_LOG is set, which
// only the driver's child processes have.
import {appendFileSync, readFileSync} from 'node:fs';

/** The variable that names the log file; set only in the environment of the command being logged. */
export const FETCH_LOG = 'CUA_ACCEPT_FETCH_LOG';

const urlOf = input => (typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url ?? String(input));
// The URL that answered, without its query or fragment: a release asset answers from a signed URL whose query is a
// short-lived credential, which no log keeps. Where it answered from is its origin and path.
const withoutQuery = url => { try { const u = new URL(url); return `${u.origin}${u.pathname}`; } catch { return url; } };

/**
 * `fetchImpl` wrapped so that every call is written to `log` (a function taking one record), the response's body counted
 * as it is read. The response keeps its status, headers, url and redirected; its body is the counted stream.
 */
export function loggedFetch(fetchImpl, log) {
  let next = 0;
  return async function fetch(input, init) {
    const id = ++next;
    const url = urlOf(input);
    log({event: 'asked', id, url, at: new Date().toISOString()});
    let response;
    try {
      response = await fetchImpl(input, init);
    } catch (error) {
      log({event: 'failed', id, url, error: error?.cause?.code ?? error?.message ?? String(error)});
      throw error;
    }
    const answer = {event: 'answered', id, url, answered: withoutQuery(response.url), status: response.status, redirected: response.redirected};
    if (!response.body) { log({...answer, bytes: 0, complete: true}); return response; }
    let bytes = 0, ended = false;
    const end = complete => { if (!ended) { ended = true; log({...answer, bytes, complete}); } };
    const reader = response.body.getReader();
    const counted = new ReadableStream({
      async pull(controller) {
        let chunk;
        try { chunk = await reader.read(); } catch (error) { end(false); controller.error(error); return; }
        if (chunk.done) { end(true); controller.close(); return; }
        bytes += chunk.value.byteLength;
        controller.enqueue(chunk.value);
      },
      cancel(reason) { end(false); return reader.cancel(reason); },
    });
    const wrapped = new Response(counted, {status: response.status, statusText: response.statusText, headers: response.headers});
    Object.defineProperty(wrapped, 'url', {value: response.url});
    Object.defineProperty(wrapped, 'redirected', {value: response.redirected});
    return wrapped;
  };
}

// The preload's first line, written once fetch is wrapped: a log without it was never armed, so it witnesses nothing.
export const READY = Object.freeze({event: 'ready'});

/**
 * The log at `file` as one entry per fetch, in the order asked: {url, answered, status, bytes, complete, error}, each of
 * the last five null until its line came. The log must open with READY and every later record must follow from what was
 * asked: an `asked` of a new id, then at most one `answered` or `failed` of that id and URL. Anything else, an unknown
 * event, a torn line, a missing or empty file included, is null: no witness, never "nothing fetched".
 */
export function readFetchLog(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { return null; }
  const records = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { records.push(JSON.parse(line)); } catch { return null; }
  }
  if (records[0]?.event !== READY.event) return null;
  const fetches = new Map();
  // Whether each fetch has ended, kept apart from what its end carried (fix wave 2): a null status cannot reopen it.
  const ended = new Set();
  const isUrl = value => { try { return typeof value === 'string' && Boolean(new URL(value)); } catch { return false; } };
  for (const record of records.slice(1)) {
    if (record?.event === 'asked') {
      if (fetches.has(record.id) || typeof record.url !== 'string') return null;
      fetches.set(record.id, {url: record.url, answered: null, status: null, bytes: null, complete: null, error: null});
      continue;
    }
    const entry = fetches.get(record?.id);
    if (!entry || record.url !== entry.url || ended.has(record.id)) return null;
    ended.add(record.id);
    if (record.event === 'answered') {
      // An answer names where it answered from, a real HTTP status, its bytes and whether its body ended.
      if (!isUrl(record.answered) || !Number.isInteger(record.status) || record.status < 100 || record.status > 599
        || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || typeof record.complete !== 'boolean') return null;
      Object.assign(entry, {answered: record.answered, status: record.status, bytes: record.bytes, complete: record.complete});
    } else if (record.event === 'failed') entry.error = typeof record.error === 'string' && record.error ? record.error : 'failed';
    else return null;
  }
  return [...fetches.values()];
}

const file = process.env[FETCH_LOG];
if (file && typeof globalThis.fetch === 'function') {
  const original = globalThis.fetch;
  globalThis.fetch = loggedFetch(original, record => appendFileSync(file, `${JSON.stringify(record)}\n`));
  appendFileSync(file, `${JSON.stringify(READY)}\n`);
}
