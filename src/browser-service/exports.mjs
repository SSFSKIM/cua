// Ported from readable chatgpt-26.928.40906 BS:54248-54446 (_c, Xv, Jv, _f, xf, the GSuite export L1 with qY/WY and F1, the YouTube transcript export); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: Ao, jg, z6, G6, V6 and Uu (BS:10607-10934, the YouTube watch-page check and the transcript capture); the
// payloads (BS:32596-32660); the dispatch of tab_content_export, which has no handler of its own, to the backend
// (BS:66434-66443).
//
// tab.content: a Google Workspace document exported in a format its type offers, and a YouTube watch page's transcript,
// each written to a file under the temporary directory's browser-use/exports, the path returned. Both fetch inside the
// page, with the person's own session there, never from this process: the export fetches its one export URL (the
// document's own /export on docs.google.com), the transcript the caption URL the page's own player requests once its
// subtitles are on (www.youtube.com/api/timedtext, as JSON), the subtitles then put back as they were. Each page call is
// the controller's evaluate, bounded by the host's per-call budget as the vendor's are. tab_content_export (the in-app
// browser's page export, extension-disabled) goes to the backend as the command came, as the vendor sends it, and cua's
// host refuses it in its own words. Changed: an exported document is at most 64 MiB (the route's own ceiling,
// byte-bounds.mjs), bounded while the page reads it and again on this side before it is decoded; the title in its file
// name is cut to 200 UTF-8 bytes so the name stays under the filesystem's 255. Dropped: nothing; neither feature has
// telemetry or a policy check in the vendor.
import {randomUUID} from 'node:crypto';
import {EXPORT_TOO_LARGE, MAX_FILE_BYTES, decodedLength, readBoundedBodyInPage} from './byte-bounds.mjs';
import {tabIdOf} from './tabs.mjs';

const EXPORT_GSUITE = 'tab_content_export_gsuite';                                                                   // N1
const FORMATS_BY_DOC_TYPE = {                                                                                         // FY
  document: new Set(['pdf', 'md', 'docx']),
  spreadsheets: new Set(['pdf', 'xlsx', 'csv']),
  presentation: new Set(['pdf', 'pptx']),
};
const FORMATS = new Set(['pdf', 'md', 'xlsx', 'csv', 'docx', 'pptx']);                                               // UY
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/u;                                                                     // uC
export const TRANSCRIPT_LIMITS = Object.freeze({                                                                     // Uu
  fetchTimeoutMs: 8000, maxItems: 5000, maxJsonBytes: 5242880, maxTextBytes: 500000, observationTimeoutMs: 4000,
});

// --- Google Workspace documents ----------------------------------------------------------------------------------------

// The document a docs.google.com URL opens -> {docId, docType, url}, or null (a published /pub page, another app or host).
export function googleWorkspaceDocument(href) {                                                                       // _c
  if (href == null) return null;
  let url;
  try { url = new URL(href); } catch { return null; }
  if (url.host !== 'docs.google.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const docType = parts[0];
  if (docType !== 'document' && docType !== 'presentation' && docType !== 'spreadsheets') return null;
  const d = parts.indexOf('d', 1);
  const docId = d < 0 ? null : parts[d + 1];
  if (docId == null || docId.length === 0 || parts.at(-1) === 'pub') return null;
  return {docId, docType, url};
}

// The formats the tab's own context read tries for a document type, in order (Xv).
export function contextExportFormats(docType) {
  switch (docType) {
    case 'document': return ['md', 'pdf'];
    case 'presentation': return ['pdf'];
    case 'spreadsheets': return ['xlsx', 'pdf'];
  }
}

// The document's export URL in `format`, keeping the tab it shows and the URL's fragment (Jv).
export function googleExportUrl(doc, format) {
  const url = new URL(`https://docs.google.com/${doc.docType}/d/${doc.docId}/export`);
  url.searchParams.set('format', format);
  const tab = doc.url.searchParams.get('tab');
  if (tab != null) url.searchParams.append('tab', tab);
  url.hash = doc.url.hash;
  return url.toString();
}

// A file name from a page title: a trailing " - Google …" product suffix dropped, path and shell characters replaced (_f).
export function exportFileName(title, fallback = 'ExportedContent') {
  const parts = (title ?? 'Asset').split(' - ');
  const name = (parts.length > 1 && parts.at(-1)?.startsWith('Google') ? parts.slice(0, -1).join(' - ') : parts.join(' - '))
    .replaceAll(/[/\\?%*|"<>:]/g, '_')
    .trim();
  return name.length === 0 ? fallback : name;
}

const TITLE_BYTES = 200;

// `text` cut to at most `maxBytes` of UTF-8 on a character boundary.
export function truncateUtf8(text, maxBytes) {
  if (Buffer.byteLength(text) <= maxBytes) return text;
  let bytes = 0;
  let end = 0;
  for (const char of text) {
    const size = Buffer.byteLength(char);
    if (bytes + size > maxBytes) break;
    bytes += size;
    end += char.length;
  }
  return text.slice(0, end);
}

// Markdown without the reference definitions of inline data images Docs appends (xf).
export function withoutInlineDataImages(markdown) {
  return markdown.replace(/^\s*\[[^\]]+\]:\s*<data:[^>]+>\s*\n?/gm, '').trim();
}

// In the page: one GET of the export URL, the body (read within `maxBytes` by `readBody`) as base64 (qY). Serialised
// into the page with toString.
async function fetchExportInPage({exportUrl, maxBytes, tooLarge}, readBody) {
  const response = await fetch(exportUrl, {method: 'GET'});
  if (!response.ok) throw new Error('GSuite export request failed with HTTP ' + response.status);
  const bytes = await readBody(response, maxBytes, tooLarge);
  const chunk = 32768;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return {base64: btoa(binary)};
}

async function fetchExport(session, tabId, exportUrl) {                                                               // WY, jY
  const args = JSON.stringify({exportUrl, maxBytes: MAX_FILE_BYTES, tooLarge: EXPORT_TOO_LARGE});
  const result = await session.cdp.evaluateJavascript(tabId, `(${fetchExportInPage.toString()})(${args},${readBoundedBodyInPage.toString()})`, {awaitPromise: true});
  if (result?.base64 == null) throw new Error('Unable to export GSuite content for this tab');
  if (typeof result.base64 !== 'string' || decodedLength(result.base64) > MAX_FILE_BYTES) throw new Error(EXPORT_TOO_LARGE);
  return result;
}

function supportedFormat(format) {                                                                                     // HY
  if (typeof format !== 'string' || !FORMATS.has(format)) throw new Error(`${EXPORT_GSUITE} requires supported format`);
  return format;
}

function exportedBytes({base64}, format) {                                                                            // $Y
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return format === 'md' ? new TextEncoder().encode(withoutInlineDataImages(new TextDecoder().decode(bytes))) : bytes;
}

async function exportsDirectory(filesystem) {
  const dir = `${filesystem.tmpDir}/browser-use/exports`;
  await filesystem.mkdir(dir, {recursive: true});
  return dir;
}

// --- YouTube transcripts -----------------------------------------------------------------------------------------------

// The video a YouTube watch URL plays -> its id, or null (Ao).
export function youtubeVideoId(href) {
  if (href == null) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' || (url.hostname !== 'www.youtube.com' && url.hostname !== 'youtube.com') || url.pathname !== '/watch') return null;
    const id = url.searchParams.get('v');
    return id != null && YOUTUBE_VIDEO_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

// The caption reply as the page read it: exactly {body, captionKind, captionLanguage, pageUrl} (z6).
function isCaptionReply(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 4
    && 'body' in value && typeof value.body === 'string'
    && 'captionKind' in value && (value.captionKind === null || (typeof value.captionKind === 'string' && !(value.captionKind.length > 100)))
    && 'captionLanguage' in value && (value.captionLanguage === null || (typeof value.captionLanguage === 'string' && !(value.captionLanguage.length > 100)))
    && 'pageUrl' in value && typeof value.pageUrl === 'string';
}

// A caption event with a start time and text segments -> {segs, tStartMs}, or null (G6).
function captionEvent(event) {
  if (event == null || typeof event !== 'object' || Array.isArray(event)
    || !('tStartMs' in event) || typeof event.tStartMs !== 'number' || !Number.isFinite(event.tStartMs) || event.tStartMs < 0
    || !('segs' in event) || !Array.isArray(event.segs)
    || !event.segs.every(s => s != null && typeof s === 'object' && !Array.isArray(s) && (!('utf8' in s) || s.utf8 === undefined || typeof s.utf8 === 'string'))) {
    return null;
  }
  return {segs: event.segs, tStartMs: event.tStartMs};
}

// In the page: with the player on `videoId` (the URL's and the player's), turn its subtitles on, take the caption URL its
// player then requests (resource timing), fetch it as JSON with the page's credentials within the limits, and put the
// subtitles back as they were -> {body, captionKind, captionLanguage, pageUrl}, or null (V6). Serialised with toString.
async function captureCaptionsInPage(videoId, limits) {
  const call = (target, name) => {
    const method = Reflect.get(target, name);
    return typeof method === 'function' ? Reflect.apply(method, target, []) : undefined;
  };
  const findPlayer = () => {
    const element = document.querySelector('ytd-player');
    const getPlayer = element == null ? null : Reflect.get(element, 'getPlayer');
    if (typeof getPlayer === 'function' && element != null) {
      const player = Reflect.apply(getPlayer, element, []);
      if (player != null && typeof player === 'object') return player;
    }
    return document.querySelector('#movie_player');
  };
  const state = () => {
    const player = findPlayer();
    let url;
    try { url = new URL(location.href); } catch { return {player, playerVideoId: null, urlVideoId: null}; }
    const data = player == null ? null : call(player, 'getVideoData');
    const id = data != null && typeof data === 'object' ? Reflect.get(data, 'video_id') : null;
    return {player, playerVideoId: typeof id === 'string' ? id : null, urlVideoId: url.searchParams.get('v')};
  };
  const onVideo = s => s.player != null && s.playerVideoId === videoId && s.urlVideoId === videoId;
  const initial = state();
  if (!onVideo(initial)) return null;
  const player = initial.player;
  if (['getVideoData', 'isSubtitlesOn', 'toggleSubtitles', 'toggleSubtitlesOn'].some(name => typeof Reflect.get(player, name) !== 'function')) return null;
  const started = performance.now();
  let captionUrl = null;
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (entry.startTime + 0.5 < started) continue;
      try {
        const url = new URL(entry.name);
        if (url.protocol === 'https:' && url.hostname === 'www.youtube.com' && url.pathname === '/api/timedtext' && url.searchParams.get('v') === videoId) captionUrl = entry.name;
      } catch {}
    }
  });
  observer.observe({buffered: true, type: 'resource'});
  const wasOn = !!call(player, 'isSubtitlesOn');
  try {
    if (wasOn) call(player, 'toggleSubtitles');
    call(player, 'toggleSubtitlesOn');
    const until = Date.now() + limits.observationTimeoutMs;
    while (Date.now() < until && captionUrl == null) await new Promise(resolve => setTimeout(resolve, 150));
  } finally {
    try {
      const now = state();
      if (onVideo(now) && now.player === player) {
        const on = !!call(player, 'isSubtitlesOn');
        if (wasOn && !on) call(player, 'toggleSubtitlesOn');
        else if (!wasOn && on) call(player, 'toggleSubtitles');
      }
    } finally {
      observer.disconnect();
    }
  }
  if (captionUrl == null || !onVideo(state())) return null;
  const url = new URL(captionUrl);
  url.searchParams.set('fmt', 'json3');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), limits.fetchTimeoutMs);
  try {
    const response = await fetch(url.toString(), {credentials: 'include', signal: abort.signal});
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) return null;
    const length = Number(response.headers.get('content-length') ?? Number.NaN);
    if (Number.isFinite(length) && length > limits.maxJsonBytes) {
      abort.abort();
      return null;
    }
    const reader = response.body?.getReader();
    let body;
    if (reader == null) {
      body = await response.text();
      if (new TextEncoder().encode(body).byteLength > limits.maxJsonBytes) return null;
    } else {
      const chunks = [];
      let total = 0;
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        if (value != null) {
          total += value.byteLength;
          if (total > limits.maxJsonBytes) {
            await reader.cancel();
            return null;
          }
          chunks.push(new Uint8Array(value));
        }
      }
      const all = new Uint8Array(total);
      let offset = 0;
      for (const piece of chunks) {
        all.set(piece, offset);
        offset += piece.byteLength;
      }
      body = new TextDecoder().decode(all);
    }
    return onVideo(state()) ? {body, captionKind: url.searchParams.get('kind'), captionLanguage: url.searchParams.get('lang'), pageUrl: location.href} : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// The transcript of `videoId` through `runInPage(fn, ...args)` -> {pageUrl, text, truncated}, or null when the page has
// none (jg): a header, then one "[m:ss] text" line per caption event, within the item and byte limits.
export async function readYouTubeTranscript(videoId, runInPage) {
  const reply = await runInPage(captureCaptionsInPage, videoId, TRANSCRIPT_LIMITS);
  if (!isCaptionReply(reply) || new TextEncoder().encode(reply.body).byteLength > TRANSCRIPT_LIMITS.maxJsonBytes) return null;
  let events;
  try {
    const parsed = JSON.parse(reply.body);
    if (parsed == null || typeof parsed !== 'object' || !('events' in parsed) || !Array.isArray(parsed.events)) return null;
    events = parsed.events;
  } catch {
    return null;
  }
  const encoder = new TextEncoder();
  const lines = [
    'YouTube transcript',
    `Video ID: ${videoId}`,
    `Language: ${reply.captionLanguage ?? 'unknown'}`,
    `Captions: ${reply.captionKind === 'asr' ? 'auto-generated' : 'authored or unspecified'}`,
    '',
  ];
  let items = 0;
  let bytes = encoder.encode(lines.join('\n')).byteLength;
  let truncated = false;
  for (const raw of events) {
    if (items >= TRANSCRIPT_LIMITS.maxItems) {
      truncated = true;
      break;
    }
    const event = captionEvent(raw);
    if (event == null) continue;
    const text = event.segs.map(s => s.utf8 ?? '').join('').replace(/\s+/g, ' ').trim();
    if (text.length === 0) continue;
    const seconds = Math.floor(event.tStartMs / 1000);
    const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
    const line = `[${h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`}] ${text}`;
    const size = encoder.encode(`\n${line}`).byteLength;
    if (bytes + size > TRANSCRIPT_LIMITS.maxTextBytes) {
      truncated = true;
      break;
    }
    lines.push(line);
    bytes += size;
    items += 1;
  }
  if (items === 0) return null;
  if (truncated) lines.push('', '[Transcript truncated]');
  return {pageUrl: reply.pageUrl, text: lines.join('\n'), truncated};
}

// --- the commands ------------------------------------------------------------------------------------------------------

export const EXPORT_HANDLERS = {
  // The in-app browser's page export: the backend's, as the vendor dispatches a command without a handler of its own.
  async tab_content_export(params, session) {
    return await session.api.executeUnhandledCommand({type: 'tab_content_export', ...params});
  },

  async tab_content_export_gsuite(params, session) {                                                                 // L1
    const tabId = tabIdOf(params.tab_id);
    const format = supportedFormat(params.format);
    const tab = await session.tabs.get(tabId);
    const doc = googleWorkspaceDocument(tab.url);
    if (doc == null) throw new Error('Tab is not a Google Workspace document');
    if (!FORMATS_BY_DOC_TYPE[doc.docType].has(format)) throw new Error('GSuite export type is not supported for this tab');
    const exported = await fetchExport(session, tabId, googleExportUrl(doc, format));
    const name = truncateUtf8(exportFileName(tab.title), TITLE_BYTES).trimEnd() || 'ExportedContent';
    const path = `${await exportsDirectory(session.filesystem)}/${name}-${randomUUID()}.${format}`;                 // zY
    const bytes = exportedBytes(exported, format);
    if (bytes.length === 0) throw new Error('Unable to export GSuite content for this tab');
    // Cleaning Markdown re-encodes it, and invalid UTF-8 grows up to threefold as replacement characters; it is written
    // as the vendor writes it, within 3 x MAX_FILE_BYTES by the bound on what arrived.
    try {
      await session.filesystem.writeFile(path, bytes);
    } catch (error) {
      throw new Error('Unable to write exported content to disk', {cause: error});
    }
    return {path};
  },

  async tab_content_export_youtube_transcript(params, session) {                                                     // F1
    const tabId = tabIdOf(params.tab_id);
    const videoId = youtubeVideoId((await session.tabs.get(tabId)).url);
    if (videoId == null) throw new Error('Tab is not a supported YouTube watch page');
    const transcript = await readYouTubeTranscript(videoId, async (fn, ...args) => await session.cdp.evaluateJavascript(
      tabId, `(${fn.toString()})(${args.map(a => JSON.stringify(a)).join(',')})`, {awaitPromise: true}));
    if (transcript == null || youtubeVideoId(transcript.pageUrl) !== videoId) throw new Error('No transcript is available for this YouTube video');
    if (youtubeVideoId((await session.tabs.get(tabId)).url) !== videoId) throw new Error('YouTube video changed before its transcript was exported');
    const path = `${await exportsDirectory(session.filesystem)}/youtube-${videoId}-${randomUUID()}.txt`;
    await session.filesystem.writeFile(path, new TextEncoder().encode(transcript.text));
    return {path};
  },
};
