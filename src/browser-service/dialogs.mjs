// Ported from readable chatgpt-26.928.40906 BS:50431-50490 (pf, UJ, m1 and qJ: tab_handle_js_dialog and its wait for the dialog to close); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: q1, tab_get_js_dialog (BS:54471-54485); FJ, the 60 s budget (BS:50430).
//
// The public dialog commands over the CDP controller's dialog tracking (cdp.mjs): getJsDialog reports the tab's open
// dialog by id and type; handleJsDialog answers it with Page.handleJavaScriptDialog in the frame that opened it and
// settles once Chrome reports the dialog closed, within 60 s. An alert is dismissed by accepting it (it has no other
// answer); accept is refused for an alert and a beforeunload, prompt text for a confirm, and a prompt's accept needs its
// text. While the dialog is open every other command to the tab fails at once with dialog_open (the controller's).
// The answer's own call keeps the host's 10 s bound inside the 60 s, as the vendor's unbudgeted call has it.
import {HOST_CDP_TIMEOUT_MS} from './backend.mjs';
import {DIALOG_MS, Deadline} from './budgets.mjs';
import {tabIdOf} from './tabs.mjs';

function promptTextOf(text) {                                                                                         // UJ
  if (typeof text !== 'string') throw new Error('Prompt dialogs require prompt text');
  return text;
}

// The closing of the dialog opened in `target` (qJ).
const closes = (event, target) => event.method === 'Page.javascriptDialogClosed'
  && (target.sessionId != null ? event.source.sessionId === target.sessionId
    : event.source.tabId === target.tabId && event.source.sessionId == null);

// Answers the dialog and waits for Chrome to close it (m1).
async function answerDialog(session, tabId, dialogId, target, answer) {
  const deadline = new Deadline(DIALOG_MS);
  const abort = new AbortController();
  let answered = false;
  const sent = session.cdp.callTarget(target, 'Page.handleJavaScriptDialog', answer, {deadline, timeoutMs: HOST_CDP_TIMEOUT_MS})
    .finally(() => { answered = true; });
  const closed = session.cdp.waitForEvent(tabId, event => closes(event, target), {
    signal: abort.signal, timeoutMessage: 'Timed out waiting for JavaScript dialog to close.', timeoutMs: DIALOG_MS,
  }).then(() => {});
  try {
    await Promise.race([closed, sent.then(async () => await closed)]);
    session.cdp.deleteJsDialog(tabId, dialogId);
  } finally {
    abort.abort();
    closed.catch(() => {});
    if (!answered) sent.catch(() => {});
  }
}

export const DIALOG_HANDLERS = {
  async tab_get_js_dialog(params, session) {                                                                         // q1
    const dialog = session.cdp.getJsDialog(tabIdOf(params.tab_id));
    return {dialog: dialog == null ? null : {id: dialog.id, type: dialog.type}};
  },

  async tab_handle_js_dialog(params, session) {                                                                      // pf
    const tabId = tabIdOf(params.tab_id);
    const dialog = session.cdp.activeJsDialog(tabId, params.dialog_id);
    if (params.action === 'accept') {
      if (dialog.type === 'alert' || dialog.type === 'beforeunload') throw new Error(`Dialog type ${dialog.type} does not support accept()`);
      if (dialog.type === 'confirm' && params.prompt_text != null) throw new Error('Confirm dialogs do not accept prompt text');
      const answer = dialog.type === 'prompt' ? {accept: true, promptText: promptTextOf(params.prompt_text)} : {accept: true};
      await answerDialog(session, tabId, params.dialog_id, dialog.target, answer);
      return {};
    }
    if (params.action === 'dismiss') {
      await answerDialog(session, tabId, params.dialog_id, dialog.target, {accept: dialog.type === 'alert'});
      return {};
    }
    throw new Error(`Unsupported dialog action: ${String(params.action)}`);
  },
};
