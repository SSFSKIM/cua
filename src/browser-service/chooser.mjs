// Ported from readable chatgpt-26.928.40906 BS:50034-50093 (ZO, playwright_wait_for_file_chooser, with kJ, IJ, RJ, QO and e1); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: FO, playwright_file_chooser_set_files, and EJ (BS:49554-49615); Li and za's extension management URLs
// (BS:18308-18310, BS:10006).
//
// The file chooser, the vendor's way. waitForEvent("filechooser") arms Chrome's file chooser interception for the tab
// (Page.setInterceptFileChooserDialog), so a chooser the page opens is reported (Page.fileChooserOpened) instead of
// shown, within the wait's budget (3 s by default, the caller's up to 120 s); the chooser is kept by a fresh id with its
// input's backend node and multiplicity, and the interception is disarmed whatever happened. setFiles gives the input
// its files with DOM.setFileInputFiles, once (the id is spent on success). The CDP controller forgets a tab's choosers
// when the tab is detached.
// Changed: a chooser in an out-of-process frame is refused with the vendor's reason alone, without its security-policy
// framing (errors.mjs keeps none of it); Chrome refusing the files to an extension without file URL access names the
// cua extension and drops the vendor's link to OpenAI's documentation. Dropped: the upload approval
// (ensureFileUploadAllowed; no approval prompts of cua's own).
import {CHOOSER_MAX_MS, DEFAULT_ACTION_MS, Deadline, clamp} from './budgets.mjs';
import {BrowserServiceError, isDeadlineError} from './errors.mjs';
import {attemptBudget} from './selectors.mjs';
import {tabIdOf} from './tabs.mjs';

const BROWSERS = {                                                                                                    // za
  chrome: {displayName: 'Google Chrome', extensionManagementUrl: 'chrome://extensions'},
  edge: {displayName: 'Microsoft Edge', extensionManagementUrl: 'edge://extensions'},
};
const browserOf = clientInfo => BROWSERS[clientInfo?.family ?? 'chrome'] ?? BROWSERS.chrome;                          // Li

const isBackendNodeId = id => typeof id === 'number' && Number.isInteger(id) && id > 0;                              // e1
const isChooserOpened = event => event.method === 'Page.fileChooserOpened' && isBackendNodeId(event.params?.backendNodeId);  // kJ

// The chooser Chrome reported, as the service keeps it (IJ).
function chooserOf(tabId, event) {
  if (!isBackendNodeId(event.params?.backendNodeId)) throw new Error('File chooser event did not include a backend node id');
  if (event.source.tabId != null && event.source.tabId !== tabId) throw new Error('File chooser event belongs to a different tab');
  if (event.source.sessionId != null || event.source.targetId != null) throw new Error('File uploads in out-of-process frames are not supported.');  // RJ
  return {backendNodeId: event.params.backendNodeId, isMultiple: event.params.mode === 'selectMultiple', tabId};
}

// Chrome refusing DOM.setFileInputFiles to an extension without access to file URLs (EJ).
function isFileAccessRefusal(error) {
  const message = typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : undefined;
  if (message === 'Not allowed') return true;
  if (typeof message !== 'string') return false;
  try {
    const parsed = JSON.parse(message);
    return parsed?.code === -32000 && parsed?.message === 'Not allowed';
  } catch {
    return false;
  }
}

export const CHOOSER_HANDLERS = {
  async playwright_wait_for_file_chooser(params, session) {                                                          // ZO
    const tabId = tabIdOf(params.tab_id);
    const timeoutMs = clamp(params.timeout_ms, CHOOSER_MAX_MS);
    const timeoutMessage = `Timed out after ${timeoutMs}ms waiting for file chooser.`;
    // Arming is dispatched within the wait's budget (an explicit zero arms once, within 3 s, then times out as the
    // vendor's does); a budget spent while arming reads as the wait's own timeout.
    const deadline = attemptBudget(new Deadline(timeoutMs));
    try {
      const event = await session.cdp.waitForEvent(tabId, isChooserOpened, {
        timeoutMs, timeoutMessage,
        action: async () => {
          try {
            await session.cdp.call(tabId, 'Page.enable', undefined, {deadline});
            await session.cdp.call(tabId, 'Page.setInterceptFileChooserDialog', {enabled: true}, {deadline});
          } catch (error) {
            if (deadline.expired() && isDeadlineError(error)) throw new BrowserServiceError('timeout', timeoutMessage, {cause: error});
            throw error;
          }
        },
      });
      const id = crypto.randomUUID();
      const chooser = chooserOf(tabId, event);
      session.cdp.fileChoosersById.set(id, chooser);
      return {file_chooser_id: id, is_multiple: chooser.isMultiple};
    } finally {
      // Always disarmed, on a budget of its own: a chooser left intercepted would never open for the person.
      await session.cdp.call(tabId, 'Page.setInterceptFileChooserDialog', {enabled: false}, {deadline: new Deadline(DEFAULT_ACTION_MS)}).catch(() => {});
    }
  },

  async playwright_file_chooser_set_files(params, session) {                                                        // FO
    const tabId = tabIdOf(params.tab_id);
    const chooser = session.cdp.fileChoosersById.get(params.file_chooser_id);
    if (chooser == null) throw new BrowserServiceError('file_chooser_not_found', `Unknown file chooser id "${params.file_chooser_id}"`);
    if (chooser.tabId !== tabId) throw new Error(`File chooser "${params.file_chooser_id}" belongs to tab ${chooser.tabId}`);
    const files = params.files;
    if (!Array.isArray(files) || files.length === 0) throw new Error('fileChooser.setFiles requires at least one file');
    if (!chooser.isMultiple && files.length > 1) throw new Error('File chooser does not accept multiple files');
    try {
      await session.cdp.call(tabId, 'DOM.setFileInputFiles', {backendNodeId: chooser.backendNodeId, files});
    } catch (error) {
      if (isFileAccessRefusal(error)) {
        const browser = browserOf(session.clientInfo);
        throw new Error(`To enable file upload, go to ${browser.extensionManagementUrl} in ${browser.displayName}, click Details under the cua extension, and enable "Allow access to file URLs."`);
      }
      throw error;
    }
    session.cdp.fileChoosersById.delete(params.file_chooser_id);
    return {};
  },
};
