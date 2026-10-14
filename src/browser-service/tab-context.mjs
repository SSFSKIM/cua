// Ported from readable chatgpt-26.928.40906 BS:60011-60261 (pM, xZ, mM, CZ and SZ, and Df.getTabContext, the context read from a user's open tab); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: sl, browser_user_get_tab_context (BS:27552-27557); uh.executeTabRead (BS:67991-67993).
//
// browser.user.getTabContext(tab): bounded context read from one of the user's open tabs without claiming it, through
// the backend's executeTabRead, each read checked against the URL the user authorized: the page's text and title; for a
// Google Workspace document, its export in the first format of its type that answers (Markdown as text, otherwise the
// file as a document); for a YouTube watch page, the user's selection when it is not the whole page, else the video's
// transcript. The member is extension-disabled (the unchanged client does not offer it on Chrome) and cua's host serves
// no executeTabRead, so on its route the command fails as the vendor's does there: without a URL in these words,
// else in the host's. Dropped: the Codex library capture of the tab as a PDF (the runtime's captureTabPdfToLibrary).
import {contextExportFormats, exportFileName, googleWorkspaceDocument, withoutInlineDataImages, youtubeVideoId} from './exports.mjs';
import {tabIdOf} from './tabs.mjs';

const TOO_LARGE = 'Google Workspace export is too large for in-memory tab context';                                  // l_
const TAB_CHANGED = 'The selected tab changed while being read';                                                     // dM

// The page read, checked: {text, title, truncated, url} of exactly the authorized URL (SZ).
function authorizedPage(page, expectedUrl) {
  if (page == null || typeof page !== 'object' || !('url' in page) || page.url !== expectedUrl
    || !('title' in page) || typeof page.title !== 'string' || page.title.length > 4096
    || !('text' in page) || typeof page.text !== 'string' || !('truncated' in page) || typeof page.truncated !== 'boolean') {
    throw new Error('Unable to read tab context for the authorized page');
  }
  return {text: page.text, title: page.title, truncated: page.truncated, url: expectedUrl};
}

// An export read's answer: {base64, truncated}, {redirectUrl} or {errorMessage} (xZ).
function exportAnswer(answer) {
  if (answer == null || typeof answer !== 'object') return {errorMessage: 'Unable to export content'};
  const errorMessage = Reflect.get(answer, 'errorMessage');
  if (typeof errorMessage === 'string') return {errorMessage};
  const redirectUrl = Reflect.get(answer, 'redirectUrl');
  if (typeof redirectUrl === 'string') return {redirectUrl};
  const base64 = Reflect.get(answer, 'base64');
  if (typeof base64 !== 'string' || base64.length === 0) return {errorMessage: 'Unable to export content'};
  return {base64, truncated: Reflect.get(answer, 'truncated') === true};
}

// A Google Workspace document's export, in the first of its type's formats that answers, or null (pM).
async function workspaceExport({expectedUrl, read, title}) {
  const doc = googleWorkspaceDocument(expectedUrl);
  if (doc == null) return null;
  for (const format of contextExportFormats(doc.docType)) {
    let answer;
    try {
      answer = exportAnswer(await read({kind: 'googleWorkspaceExport', format}));
    } catch (error) {
      if ((error instanceof Error ? error.message : error) === TAB_CHANGED) throw error;
      continue;
    }
    if ('errorMessage' in answer) {
      if (answer.errorMessage === TOO_LARGE) throw new Error(TOO_LARGE);
      continue;
    }
    if ('redirectUrl' in answer) continue;
    if (format === 'md') {
      return {kind: 'text', text: withoutInlineDataImages(new TextDecoder().decode(Uint8Array.from(atob(answer.base64), c => c.charCodeAt(0)))), truncated: answer.truncated === true};
    }
    return {
      dataBase64: answer.base64, fileName: `${exportFileName(title)}.${format}`, kind: 'document',
      mimeType: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
  return null;
}

// The user's selection in the tab, or null (CZ).
async function selection(read) {
  try {
    const answer = await read({kind: 'selection'});
    if (answer == null || typeof answer !== 'object') return null;
    const text = Reflect.get(answer, 'text');
    const truncated = Reflect.get(answer, 'truncated');
    return typeof text === 'string' && typeof truncated === 'boolean' ? {text, truncated} : null;
  } catch {
    return null;
  }
}

// The context of the tab at `expectedUrl` through `read(request)`, the backend's tab read (mM).
export async function readTabContext({expectedUrl, read}) {
  const page = authorizedPage(await read({kind: 'page'}), expectedUrl);
  const exported = await workspaceExport({expectedUrl: page.url, read, title: page.title});
  if (exported?.kind === 'text') return {kind: 'text', text: exported.text, title: page.title, truncated: exported.truncated, url: page.url};
  if (exported?.kind === 'document') return {...exported, title: page.title, url: page.url};
  const videoId = youtubeVideoId(page.url);
  const selected = videoId == null ? null : await selection(read).then(s => (s?.text.trim() === page.text.trim() ? null : s));
  if (videoId != null && selected == null) {
    try {
      const transcript = await read({kind: 'youtubeTranscript'});
      if (transcript != null && typeof transcript === 'object' && 'pageUrl' in transcript && typeof transcript.pageUrl === 'string'
        && 'text' in transcript && typeof transcript.text === 'string' && 'truncated' in transcript && typeof transcript.truncated === 'boolean'
        && transcript.pageUrl === expectedUrl) {
        return {
          kind: 'text', text: [page.text, '', '<browser__youtube_transcript>', transcript.text, '</browser__youtube_transcript>'].join('\n'),
          title: page.title, truncated: page.truncated || transcript.truncated, url: page.url,
        };
      }
    } catch {}
  }
  if (selected != null) {
    return {
      kind: 'text', text: ['<user__selection>', selected.text, '</user__selection>', '', '<browser__document__content>', page.text, '</browser__document__content>'].join('\n'),
      title: page.title, truncated: page.truncated || selected.truncated, url: page.url,
    };
  }
  return {kind: 'text', ...page};
}

export const TAB_CONTEXT_HANDLERS = {
  async browser_user_get_tab_context(params, session) {                                                              // sl
    if (params.expected_url == null) throw new Error('Missing authorized user tab URL');
    const tabId = tabIdOf(params.tab_id);
    const expectedUrl = params.expected_url;
    return await readTabContext({expectedUrl, read: read => session.api.executeTabRead({tabId, expectedUrl, read})});
  },
};
