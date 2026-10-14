// The content exports (src/browser-service/exports.mjs, the vendor's L1, WY/qY/Jv and F1/jg/V6, readable
// chatgpt-26.928.40906 BS:54248-54446 and BS:10607-10934), through the real host and the fake extension: a Google
// Workspace document is exported by a fetch of its one export URL made inside the page (the person's own session), a
// YouTube watch page's transcript by the caption request its own player makes; each lands in a file under the temporary
// directory's browser-use/exports. tab_content_export goes to the backend as the vendor's does, and cua's host refuses it.
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {COMMAND_HANDLERS} from '../../src/browser-service/index.mjs';
import {googleWorkspaceDocument, googleExportUrl, youtubeVideoId} from '../../src/browser-service/exports.mjs';
import {evaluateInPage, pageResponse} from './support/page-vm.mjs';
import {execute, readyBrowser, rejection, scriptedPages, serviceOnHost} from './support/service-on-host.mjs';

// The exports land under os.tmpdir(), which follows TMPDIR: each tab a test makes gets a directory of its own (the
// latest one made receives the files), all removed when the file's tests end.
const ORIGINAL_TMPDIR = process.env.TMPDIR;
const BASE = tmpdir();
const made = [];
after(() => {
  if (ORIGINAL_TMPDIR === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = ORIGINAL_TMPDIR;
  for (const dir of made) rmSync(dir, {recursive: true, force: true});
});
function scratchTmp() {
  const dir = mkdtempSync(join(BASE, 'cua-exports-'));
  made.push(dir);
  process.env.TMPDIR = dir;
  return dir;
}

// A tab on `url` whose Runtime.evaluate of anything but the document-state read runs in a page made by `page(tabId)`.
async function exportTab(t, {url, title = 'Page', page = () => ({})} = {}) {
  const tmp = scratchTmp();
  const pages = scriptedPages();
  const evaluations = [];
  const cdp = request => {
    const {debuggee: {tabId}, method, params} = request;
    if (method === 'Runtime.evaluate' && !params.expression.startsWith('({ href: window.location.href')) {
      evaluations.push(params);
      return evaluateInPage(page(tabId), params);
    }
    return pages.cdp(request);
  };
  const env = await serviceOnHost(t, {pages: {...pages, cdp}});
  const browserId = await readyBrowser(env.service);
  const {id} = await execute(env.service, {type: 'create_tab', browser_id: browserId});
  Object.assign(env.ext.state.tabs.get(Number(id)), {url, title});
  const run = params => execute(env.service, {browser_id: browserId, tab_id: id, ...params});
  return {...env, tmp, run, evaluations, tabId: Number(id), setUrl: next => { env.ext.state.tabs.get(Number(id)).url = next; }};
}

const exportsIn = tmp => (existsSync(join(tmp, 'browser-use', 'exports')) ? readdirSync(join(tmp, 'browser-use', 'exports')) : []);

test('the export commands are registered', () => {
  for (const type of ['tab_content_export', 'tab_content_export_gsuite', 'tab_content_export_youtube_transcript']) {
    assert.equal(typeof COMMAND_HANDLERS.get(type), 'function', type);
  }
});

test('a Google Workspace URL names its document, and its export URL keeps the tab and the fragment (_c, Jv)', () => {
  const doc = googleWorkspaceDocument('https://docs.google.com/document/d/DOC1/edit?tab=t.0#heading=h.1');
  assert.deepEqual({docId: doc.docId, docType: doc.docType}, {docId: 'DOC1', docType: 'document'});
  assert.equal(googleExportUrl(doc, 'md'), 'https://docs.google.com/document/d/DOC1/export?format=md&tab=t.0#heading=h.1');
  assert.equal(googleWorkspaceDocument('https://docs.google.com/spreadsheets/u/1/d/S1/edit')?.docId, 'S1');
  for (const url of ['https://docs.google.com/document/d/DOC1/pub', 'https://docs.google.com/forms/d/F1/edit', 'https://drive.google.com/document/d/D/edit',
    'https://docs.google.com/document/d/', 'not a url', null]) {
    assert.equal(googleWorkspaceDocument(url), null, String(url));
  }
});

test('a YouTube watch URL names its video only on https www/bare youtube.com /watch with an 11-character id (Ao)', () => {
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=abcdefghijk&t=3'), 'abcdefghijk');
  assert.equal(youtubeVideoId('https://youtube.com/watch?v=abc-_fghijk'), 'abc-_fghijk');
  for (const url of ['http://www.youtube.com/watch?v=abcdefghijk', 'https://m.youtube.com/watch?v=abcdefghijk', 'https://www.youtube.com/shorts/abcdefghijk',
    'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/watch', null]) {
    assert.equal(youtubeVideoId(url), null, String(url));
  }
});

test('tab_content_export_gsuite checks the format first, then the tab, then the format for the document type', async t => {
  const {run} = await exportTab(t, {url: 'http://127.0.0.1:48732/counter.html'});
  assert.equal((await rejection(run({type: 'tab_content_export_gsuite', format: 'bogus'}))).message, 'tab_content_export_gsuite requires supported format');
  assert.equal((await rejection(run({type: 'tab_content_export_gsuite', format: 'bogus', tab_id: '999'}))).message, 'tab_content_export_gsuite requires supported format');
  assert.equal((await rejection(run({type: 'tab_content_export_gsuite', format: 'pdf'}))).message, 'Tab is not a Google Workspace document');
  const slides = await exportTab(t, {url: 'https://docs.google.com/presentation/d/P1/edit'});
  assert.equal((await rejection(slides.run({type: 'tab_content_export_gsuite', format: 'md'}))).message, 'GSuite export type is not supported for this tab');
  assert.equal(slides.evaluations.length, 0, 'nothing ran in the page');
});

test('a document is exported by one page fetch of its export URL and written under browser-use/exports; Markdown loses its inline data images', async t => {
  const fetched = [];
  const markdown = 'Intro\n[image1]: <data:image/png;base64,AAAA>\nBody text\n';
  const {run, tmp, evaluations} = await exportTab(t, {
    url: 'https://docs.google.com/document/d/DOC1/edit?tab=t.0#heading=h.1', title: 'Plan: Q3 / draft - Google Docs',
    page: () => ({fetch: async (url, init) => { fetched.push({url, init: {...init}}); return pageResponse(markdown); }}),
  });
  const {path} = await run({type: 'tab_content_export_gsuite', format: 'md'});
  assert.deepEqual(fetched, [{url: 'https://docs.google.com/document/d/DOC1/export?format=md&tab=t.0#heading=h.1', init: {method: 'GET'}}]);
  assert.equal(evaluations.length, 1);
  assert.equal(evaluations[0].awaitPromise, true);
  assert.match(path, new RegExp(`^${tmp}/browser-use/exports/Plan_ Q3 _ draft-[0-9a-f-]{36}\\.md$`));
  assert.equal(readFileSync(path, 'utf8'), 'Intro\nBody text');
});

test('a spreadsheet exports its bytes as they came; an untitled one is ExportedContent', async t => {
  const bytes = Uint8Array.from({length: 70000}, (_, i) => i % 256);
  const {run} = await exportTab(t, {url: 'https://docs.google.com/spreadsheets/d/S1/edit', title: '', page: () => ({fetch: async () => pageResponse(bytes)})});
  const {path} = await run({type: 'tab_content_export_gsuite', format: 'xlsx'});
  assert.match(path, /\/ExportedContent-[0-9a-f-]{36}\.xlsx$/);
  assert.deepEqual(new Uint8Array(readFileSync(path)), bytes);
});

test('a failed export request reports its HTTP status, an empty one cannot be exported, and nothing is written', async t => {
  const failing = await exportTab(t, {url: 'https://docs.google.com/document/d/DOC1/edit', page: () => ({fetch: async () => pageResponse('', {status: 403})})});
  assert.match((await rejection(failing.run({type: 'tab_content_export_gsuite', format: 'pdf'}))).message, /GSuite export request failed with HTTP 403/);
  const empty = await exportTab(t, {url: 'https://docs.google.com/document/d/DOC1/edit', page: () => ({fetch: async () => pageResponse('')})});
  assert.equal((await rejection(empty.run({type: 'tab_content_export_gsuite', format: 'pdf'}))).message, 'Unable to export GSuite content for this tab');
  assert.deepEqual(exportsIn(empty.tmp), [], 'the directory is made, no file');
  const nothing = await exportTab(t, {url: 'https://docs.google.com/document/d/DOC1/edit', page: () => ({fetch: async () => { throw new Error('offline'); }})});
  assert.match((await rejection(nothing.run({type: 'tab_content_export_gsuite', format: 'pdf'}))).message, /offline/);
});

// A YouTube watch page: its player (ytd-player's getPlayer) plays `videoId`; turning subtitles on makes the player
// request `captionUrl`, which the page's resource timing shows; the caption fetch answers `captions`.
function youtubePage({videoId = 'abcdefghijk', playerVideoId = videoId, subtitlesOn = false, captionUrl, captions, contentType = 'application/json; charset=UTF-8', onFetch} = {}) {
  const fetched = [];
  const toggles = [];
  let on = subtitlesOn;
  let observed = [];
  const observers = [];
  const player = {
    getVideoData: () => ({video_id: playerVideoId}),
    isSubtitlesOn: () => on,
    toggleSubtitles: () => { toggles.push('toggle'); on = !on; },
    toggleSubtitlesOn: () => {
      toggles.push('on');
      on = true;
      if (captionUrl) {
        observed = [{name: captionUrl, startTime: 10}];
        for (const callback of observers) callback({getEntries: () => observed});
      }
    },
  };
  const globals = {
    location: {href: `https://www.youtube.com/watch?v=${videoId}`},
    document: {querySelector: selector => (selector === 'ytd-player' ? {getPlayer: () => player} : null)},
    performance: {now: () => 5},
    PerformanceObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() { observers.push(this.callback); if (observed.length) this.callback({getEntries: () => observed}); }
      disconnect() { observers.splice(observers.indexOf(this.callback), 1); }
    },
    fetch: async (url, init) => {
      fetched.push({url, credentials: init.credentials});
      onFetch?.();
      return pageResponse(JSON.stringify(captions), {headers: {'content-type': contentType}});
    },
  };
  return {globals, fetched, toggles, isOn: () => on};
}

const CAPTIONS = {events: [
  {tStartMs: 0, segs: [{utf8: 'Hello'}, {utf8: '  there'}]},
  {tStartMs: 1500, segs: [{utf8: '\n'}]},
  {tStartMs: 65000, segs: [{utf8: 'a minute in'}]},
  {tStartMs: 3723000, segs: [{utf8: 'an hour in'}]},
  {tStartMs: -1, segs: [{utf8: 'dropped'}]},
]};

test('a YouTube transcript is read from the caption request the player makes, written as text, and the subtitles restored', async t => {
  const captionUrl = 'https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=en&kind=asr&fmt=srv3';
  const page = youtubePage({captionUrl, captions: CAPTIONS});
  const {run, tmp} = await exportTab(t, {url: 'https://www.youtube.com/watch?v=abcdefghijk', page: () => page.globals});
  const {path} = await run({type: 'tab_content_export_youtube_transcript'});
  assert.deepEqual(page.fetched, [{url: 'https://www.youtube.com/api/timedtext?v=abcdefghijk&lang=en&kind=asr&fmt=json3', credentials: 'include'}]);
  assert.deepEqual(page.toggles, ['on', 'toggle'], 'turned on, then back off as the person had it');
  assert.equal(page.isOn(), false);
  assert.match(path, new RegExp(`^${tmp}/browser-use/exports/youtube-abcdefghijk-[0-9a-f-]{36}\\.txt$`));
  assert.equal(readFileSync(path, 'utf8'), [
    'YouTube transcript', 'Video ID: abcdefghijk', 'Language: en', 'Captions: auto-generated', '',
    '[0:00] Hello there', '[1:05] a minute in', '[1:02:03] an hour in',
  ].join('\n'));
});

test('a page that is not a watch page, a player on another video, or unusable captions give the vendor\'s sentences', async t => {
  const other = await exportTab(t, {url: 'https://www.youtube.com/results?search_query=x'});
  assert.equal((await rejection(other.run({type: 'tab_content_export_youtube_transcript'}))).message, 'Tab is not a supported YouTube watch page');
  const mismatch = youtubePage({playerVideoId: 'zzzzzzzzzzz', captionUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk'});
  const elsewhere = await exportTab(t, {url: 'https://www.youtube.com/watch?v=abcdefghijk', page: () => mismatch.globals});
  assert.equal((await rejection(elsewhere.run({type: 'tab_content_export_youtube_transcript'}))).message, 'No transcript is available for this YouTube video');
  assert.deepEqual(mismatch.fetched, []);
  const html = youtubePage({captionUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk', captions: CAPTIONS, contentType: 'text/html'});
  const notJson = await exportTab(t, {url: 'https://www.youtube.com/watch?v=abcdefghijk', page: () => html.globals});
  assert.equal((await rejection(notJson.run({type: 'tab_content_export_youtube_transcript'}))).message, 'No transcript is available for this YouTube video');
  const blank = youtubePage({captionUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk', captions: {events: [{tStartMs: 0, segs: [{utf8: ' '}]}]}});
  const noText = await exportTab(t, {url: 'https://www.youtube.com/watch?v=abcdefghijk', page: () => blank.globals});
  assert.equal((await rejection(noText.run({type: 'tab_content_export_youtube_transcript'}))).message, 'No transcript is available for this YouTube video');
  assert.deepEqual(exportsIn(noText.tmp), []);
});

test('a tab that moved to another video while its captions were read is not exported', async t => {
  let tab;
  const page = youtubePage({captionUrl: 'https://www.youtube.com/api/timedtext?v=abcdefghijk', captions: CAPTIONS, onFetch: () => tab.setUrl('https://www.youtube.com/watch?v=zzzzzzzzzzz')});
  tab = await exportTab(t, {url: 'https://www.youtube.com/watch?v=abcdefghijk', page: () => page.globals});
  assert.equal((await rejection(tab.run({type: 'tab_content_export_youtube_transcript'}))).message, 'YouTube video changed before its transcript was exported');
  assert.deepEqual(exportsIn(tab.tmp), []);
});

test('tab_content_export goes to the backend as it came, and cua\'s host refuses it in its words', async t => {
  const {run} = await exportTab(t, {url: 'https://example.com/'});
  assert.equal((await rejection(run({type: 'tab_content_export'}))).message, 'cua does not support command "tab_content_export".');
});
