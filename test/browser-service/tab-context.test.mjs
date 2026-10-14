// browser_user_get_tab_context (src/browser-service/tab-context.mjs, the vendor's sl, Df.getTabContext and mM with pM,
// xZ, CZ and SZ, readable chatgpt-26.928.40906 BS:27552-27557 and BS:60011-60261): bounded context read from a user's
// open tab through the backend's executeTabRead. Extension-disabled (the client never offers getTabContext there), and
// cua's host has no executeTabRead, so on its route the command fails as it does for the vendor there: a missing URL
// in the service's words, else the host's. The reader itself is checked against a backend double that answers reads.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {COMMAND_HANDLERS} from '../../src/browser-service/index.mjs';
import {readTabContext} from '../../src/browser-service/tab-context.mjs';
import {execute, readyBrowser, rejection, serviceOnHost} from './support/service-on-host.mjs';

const b64 = text => Buffer.from(text).toString('base64');

// A tab answering reads by kind: `answers[kind]` is a value or a function of the read; an Error is thrown.
function tabReads(url, answers) {
  const reads = [];
  return {
    reads,
    read: async read => {
      reads.push(read);
      const answer = answers[read.kind];
      const value = typeof answer === 'function' ? answer(read) : answer;
      if (value instanceof Error) throw value;
      return value;
    },
  };
}

const page = (url, extra = {}) => ({url, title: 'Title - Google Docs', text: 'page text', truncated: false, ...extra});

test('browser_user_get_tab_context is registered', () => {
  assert.equal(typeof COMMAND_HANDLERS.get('browser_user_get_tab_context'), 'function');
});

test('on cua\'s host the command needs the authorized URL, then fails with the host\'s refusal of executeTabRead', async t => {
  const env = await serviceOnHost(t);
  const browserId = await readyBrowser(env.service);
  const tabId = String(env.ext.addTab({url: 'https://example.com/'}).id);
  const run = params => execute(env.service, {type: 'browser_user_get_tab_context', browser_id: browserId, ...params});
  assert.equal((await rejection(run({tab_id: 'not a tab'}))).message, 'Missing authorized user tab URL');
  assert.equal((await rejection(run({tab_id: 'not a tab', expected_url: 'https://example.com/'}))).message, 'Expected a positive integer');
  const before = env.requests().length;
  assert.equal((await rejection(run({tab_id: tabId, expected_url: 'https://example.com/'}))).message, 'No handler registered for method: executeTabRead');
  assert.deepEqual(env.requests().slice(before), ['executeTabRead'], 'the tab is not claimed again first');
});

test('a page read must be the authorized page; an ordinary page is its own text', async t => {
  const url = 'https://example.com/a';
  await assert.rejects(readTabContext({expectedUrl: url, read: tabReads(url, {page: page('https://example.com/b')}).read}), {message: 'Unable to read tab context for the authorized page'});
  await assert.rejects(readTabContext({expectedUrl: url, read: tabReads(url, {page: {...page(url), title: 'x'.repeat(4097)}}).read}), {message: 'Unable to read tab context for the authorized page'});
  await assert.rejects(readTabContext({expectedUrl: url, read: tabReads(url, {page: {url, title: 't', text: 'x'}}).read}), {message: 'Unable to read tab context for the authorized page'});
  const tab = tabReads(url, {page: page(url, {title: 'A page', truncated: true})});
  assert.deepEqual(await readTabContext({expectedUrl: url, read: tab.read}), {kind: 'text', text: 'page text', title: 'A page', truncated: true, url});
  assert.deepEqual(tab.reads, [{kind: 'page'}], 'no export or selection read off Google Workspace and YouTube');
});

test('a Google document is exported in its first format that answers: Markdown as text, else the PDF as a document', async t => {
  const url = 'https://docs.google.com/document/d/D1/edit';
  const markdown = tabReads(url, {page: page(url), googleWorkspaceExport: () => ({base64: b64('# Doc\n[i]: <data:image/png;base64,AA>\nbody\n'), truncated: true})});
  assert.deepEqual(await readTabContext({expectedUrl: url, read: markdown.read}), {kind: 'text', text: '# Doc\nbody', title: 'Title - Google Docs', truncated: true, url});
  assert.deepEqual(markdown.reads, [{kind: 'page'}, {kind: 'googleWorkspaceExport', format: 'md'}]);
  const pdf = tabReads(url, {page: page(url), googleWorkspaceExport: read => (read.format === 'md' ? {redirectUrl: 'https://accounts.google.com/'} : {base64: b64('%PDF')})});
  assert.deepEqual(await readTabContext({expectedUrl: url, read: pdf.read}), {
    dataBase64: b64('%PDF'), fileName: 'Title.pdf', kind: 'document', mimeType: 'application/pdf', title: 'Title - Google Docs', url,
  });
  const sheet = 'https://docs.google.com/spreadsheets/d/S1/edit';
  const xlsx = tabReads(sheet, {page: page(sheet, {title: 'Budget - Google Sheets'}), googleWorkspaceExport: read => (read.format === 'xlsx' ? {base64: b64('PK')} : {errorMessage: 'no'})});
  assert.deepEqual(await readTabContext({expectedUrl: sheet, read: xlsx.read}), {
    dataBase64: b64('PK'), fileName: 'Budget.xlsx', kind: 'document', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', title: 'Budget - Google Sheets', url: sheet,
  });
});

test('an export that fails every format falls back to the page text; too large or a changed tab ends the read', async t => {
  const url = 'https://docs.google.com/document/d/D1/edit';
  const failing = tabReads(url, {page: page(url), googleWorkspaceExport: read => (read.format === 'md' ? new Error('boom') : {errorMessage: 'Unable to export content'})});
  assert.deepEqual(await readTabContext({expectedUrl: url, read: failing.read}), {kind: 'text', text: 'page text', title: 'Title - Google Docs', truncated: false, url});
  await assert.rejects(readTabContext({expectedUrl: url, read: tabReads(url, {page: page(url), googleWorkspaceExport: {errorMessage: 'Google Workspace export is too large for in-memory tab context'}}).read}),
    {message: 'Google Workspace export is too large for in-memory tab context'});
  await assert.rejects(readTabContext({expectedUrl: url, read: tabReads(url, {page: page(url), googleWorkspaceExport: new Error('The selected tab changed while being read')}).read}),
    {message: 'The selected tab changed while being read'});
  const empty = tabReads(url, {page: page(url), googleWorkspaceExport: {base64: ''}});
  assert.deepEqual((await readTabContext({expectedUrl: url, read: empty.read})).text, 'page text', 'an empty export is no export');
});

test('a YouTube watch page adds the user\'s selection when it differs from the page, else the transcript', async t => {
  const url = 'https://www.youtube.com/watch?v=abcdefghijk';
  const selected = tabReads(url, {page: page(url, {title: 'Video'}), selection: {text: 'chosen words', truncated: true}});
  assert.deepEqual(await readTabContext({expectedUrl: url, read: selected.read}), {
    kind: 'text', text: '<user__selection>\nchosen words\n</user__selection>\n\n<browser__document__content>\npage text\n</browser__document__content>',
    title: 'Video', truncated: true, url,
  });
  assert.deepEqual(selected.reads, [{kind: 'page'}, {kind: 'selection'}]);
  const transcript = tabReads(url, {page: page(url, {title: 'Video'}), selection: {text: ' page text ', truncated: false}, youtubeTranscript: {pageUrl: url, text: '[0:00] hi', truncated: false}});
  assert.deepEqual(await readTabContext({expectedUrl: url, read: transcript.read}), {
    kind: 'text', text: 'page text\n\n<browser__youtube_transcript>\n[0:00] hi\n</browser__youtube_transcript>', title: 'Video', truncated: false, url,
  });
  const neither = tabReads(url, {page: page(url, {title: 'Video'}), selection: new Error('no selection'), youtubeTranscript: {pageUrl: 'https://www.youtube.com/watch?v=zzzzzzzzzzz', text: 'x', truncated: false}});
  assert.deepEqual(await readTabContext({expectedUrl: url, read: neither.read}), {kind: 'text', text: 'page text', title: 'Video', truncated: false, url});
});
