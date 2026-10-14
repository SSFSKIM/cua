// Ported from readable chatgpt-26.928.40906 BS:19902-20531 (el, running a clipboard function in the page; Ku, the page's paste, copy and cut; FC, a cut's commit; vj and _j, the focused frame; kn and rb, the clipboard shortcuts); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: Vi, bW, yW, wW, vW, _W, sy and xW (BS:27400-27527, typing by paste and its rich text); gW (BS:27394-27399,
// the vendor's markdown-it instance: the default preset with breaks on, HTML, linkify and typographer off, no plugins
// and no renderer rules); Pn (BS:19881-19886).
//
// Text goes into a page the way the vendor puts it there: as a paste. cua_type, dom_cua_type and fill dispatch a
// `paste` ClipboardEvent at the focused element (the page's own handlers see it and may take it over) carrying the
// text as text/plain and, for typing, as text/html; what the page leaves to the default is inserted at the selection
// (inputs and textareas by setRangeText or their value, editable content by execCommand), then `input` fires. The
// copy, cut and paste shortcuts (keyboard.mjs names them) run against the session's virtual clipboard
// (clipboard.mjs): a copy or cut dispatches its event in the focused frame and stores what the page put in it, or
// the selection; a paste dispatches the stored items. A credential field's selection is never copied.
//
// Typed text's text/html is its Markdown rendering, as the vendor's: markdown-it at the version the vendor embeds
// (14.1.1, vendored from the pinned devDependency by scripts/extract-markdown-it.mjs) configured as the vendor's gW.
// Dropped: the in-app browser's input target tokens and document-only checks.
//
// Every operation takes its caller's Deadline: it bounds the wait for the clipboard's queue (an operation whose budget
// ran out while queued dispatches nothing) and is carried by every CDP call. A page failure is reported only by the
// page function's own fixed sentences; anything else the page threw is reported as "<command> failed", never in the
// page's words, because a page can throw with what it was given (the typed text, the clipboard's items).
import {Deadline} from './budgets.mjs';
import {CREDENTIAL_FIELDS} from './injected.mjs';
import {clipboardShortcut, NATIVE_CLIPBOARD_DISABLED} from './keyboard.mjs';
import {tabIdOf} from './tabs.mjs';
import markdownit from './vendor/markdown-it/markdown-it.mjs';

const CLIPBOARD_ERROR = 'Browser Use encountered an error interacting with this webpage\'s clipboard';
const CLIPBOARD_WORLD = 'browser-use-virtual-clipboard';

// --- in the page ------------------------------------------------------------------------------------------------------

// The page's side of a clipboard operation (Ku): `args` {action: 'paste' | 'copy' | 'cut', clipboardItems,
// replaceInputValue?, richTextFallback?, protectedCredentialFieldPolicy?, cutToken?} -> {} | {items, cutToken?}.
export const pageClipboardAction = async args => {
  const localNameOf = Object.getOwnPropertyDescriptor(window.Element.prototype, 'localName')?.get;
  const namespaceOf = Object.getOwnPropertyDescriptor(window.Element.prototype, 'namespaceURI')?.get;
  if (localNameOf == null || namespaceOf == null) throw new Error('Browser Use virtual clipboard requires native DOM getters');
  const asElement = node => {
    if (node == null) return null;
    try { localNameOf.call(node); } catch { return null; }
    return node.ownerDocument.defaultView == null ? null : node;
  };
  const isHtml = element => namespaceOf.call(element) === 'http://www.w3.org/1999/xhtml';
  const isTag = (element, name) => isHtml(element) && localNameOf.call(element) === name;
  const windowOf = element => element.ownerDocument.defaultView ?? window;
  const isCredentialInput = (element, policy) => element.tagName?.toLowerCase() === 'input'
    && (element.getAttribute('type')?.toLowerCase() === 'hidden'
      || new RegExp(policy.pattern, 'i').test(policy.attributes.map(name => element.getAttribute(name) ?? '').join(' ')));
  const dropCredentialValues = (root, policy) => {
    let dropped = false;
    for (const input of root.querySelectorAll('input[value]')) {
      if (isCredentialInput(input, policy)) {
        input.removeAttribute('value');
        dropped = true;
      }
    }
    return dropped;
  };
  const focusedIn = root => {
    const active = asElement(root.activeElement);
    if (active == null) return null;
    if (isHtml(active) && active.shadowRoot != null) return focusedIn(active.shadowRoot) ?? active;
    if (isTag(active, 'iframe') || isTag(active, 'frame')) {
      try {
        const frameDocument = active.contentDocument ?? active.contentWindow?.document ?? null;
        if (frameDocument != null) return focusedIn(frameDocument) ?? active;
      } catch {
        return active;
      }
    }
    return active;
  };
  const textOf = (items, type) => items.flatMap(item => item.entries).find(entry => entry.mime_type === type)?.text ?? '';
  const bytesOf = base64 => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  };
  const base64Of = buffer => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(binary);
  };
  const fill = (transfer, items, view) => {
    transfer.clearData();
    for (const item of items) {
      for (const entry of item.entries) {
        if (typeof entry.text === 'string') {
          transfer.setData(entry.mime_type, entry.text);
          continue;
        }
        const extension = entry.mime_type.split('/')[1] ?? 'bin';
        transfer.items.add(new view.File([bytesOf(entry.base64 ?? '')], `clipboard.${extension}`, {type: entry.mime_type}));
      }
    }
  };
  const itemsOf = async transfer => {
    const entries = [];
    for (const type of Array.from(transfer.types)) if (type !== 'Files') entries.push({mime_type: type, text: transfer.getData(type)});
    for (const file of Array.from(transfer.files)) if (file.type.length !== 0) entries.push({mime_type: file.type, base64: base64Of(await file.arrayBuffer())});
    return entries.length === 0 ? [] : [{entries, presentation_style: 'unspecified'}];
  };
  const textItems = (text, html) => {
    const entries = [];
    if (text.length > 0) entries.push({mime_type: 'text/plain', text});
    if (html.length > 0) entries.push({mime_type: 'text/html', text: html});
    return entries.length === 0 ? [] : [{entries, presentation_style: 'unspecified'}];
  };
  const cutEvent = (view, type) => new view.InputEvent(type, {bubbles: true, cancelable: type === 'beforeinput', composed: true, inputType: 'deleteByCut'});
  // The focused element's selection, as items, and how to delete it for a cut.
  const selectionOf = (node, policy) => {
    const element = asElement(node);
    if (element == null) return null;
    const view = windowOf(element);
    if (isTag(element, 'textarea') || isTag(element, 'input')) {
      const start = element.selectionStart;
      const end = element.selectionEnd;
      if (start == null || end == null || start === end) return null;
      const text = element.value.slice(start, end);
      return {
        items: textItems(text, ''),
        delete: () => {
          if (!element.disabled && !element.readOnly && element.value.slice(start, end) === text && !!element.dispatchEvent(cutEvent(view, 'beforeinput'))) {
            element.setRangeText('', start, end, 'end');
            element.dispatchEvent(cutEvent(view, 'input'));
          }
        },
      };
    }
    const selection = view.getSelection?.();
    if (selection == null || selection.rangeCount === 0 || selection.isCollapsed) return null;
    const ranges = Array.from({length: selection.rangeCount}, (_, i) => selection.getRangeAt(i).cloneRange());
    const holder = element.ownerDocument.createElement('div');
    for (const range of ranges) holder.append(range.cloneContents());
    dropCredentialValues(holder, policy);
    const text = selection.toString();
    let editable = null;
    if (isHtml(element) && element.isContentEditable) {
      for (editable = element; editable.parentElement?.isContentEditable;) editable = editable.parentElement;
    }
    return {
      items: textItems(text, holder.innerHTML),
      delete: () => {
        if (editable != null && !!editable.isConnected && !!editable.isContentEditable
          && !!ranges.every(range => editable?.contains(range.commonAncestorContainer))
          && ranges.map(range => range.toString()).join('') === text && !!element.dispatchEvent(cutEvent(view, 'beforeinput'))) {
          for (const range of ranges.reverse()) range.deleteContents();
          element.dispatchEvent(cutEvent(view, 'input'));
        }
      },
    };
  };
  // What a paste the page did not take over inserts.
  const insert = (node, html, text, replace) => {
    const element = asElement(node);
    if (element == null) return;
    const view = windowOf(element);
    if (isTag(element, 'textarea') || isTag(element, 'input')) {
      if (element.disabled || element.readOnly || (text.length === 0 && !replace)) return;
      const setValue = value => {
        const prototypeSetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
        const ownSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
        if (prototypeSetter != null && ownSetter !== prototypeSetter) {
          prototypeSetter.call(element, value);
          return;
        }
        element.value = value;
      };
      if (element.selectionStart == null || element.selectionEnd == null) {
        setValue(replace ? text : element.value + text);
      } else {
        const start = element.selectionStart ?? element.value.length;
        const end = element.selectionEnd ?? element.value.length;
        try {
          element.setRangeText(text, start, end, 'end');
        } catch {
          setValue(replace ? text : element.value + text);
        }
      }
      element.dispatchEvent(new view.InputEvent('input', {bubbles: true}));
      return;
    }
    if (isHtml(element) && (element.isContentEditable || element.closest('[contenteditable=true]'))) {
      element.focus();
      if (html.length > 0) {
        element.ownerDocument.execCommand('insertHTML', false, html);
        return;
      }
      if (text.length > 0 || replace) element.ownerDocument.execCommand('insertText', false, text);
    }
  };

  delete globalThis.__browserUsePendingCut;
  const target = focusedIn(document) ?? document.body;
  const focused = asElement(target);
  const view = focused == null ? window : windowOf(focused);
  const items = args.clipboardItems;
  if (args.action === 'paste') {
    if (items.length === 0) throw new Error('Browser Use virtual clipboard has no data to paste');
    const text = textOf(items, 'text/plain');
    const html = args.richTextFallback === true ? textOf(items, 'text/html') : '';
    if (typeof view.DataTransfer !== 'function' || typeof view.ClipboardEvent !== 'function') {
      insert(target, html, text, args.replaceInputValue === true);
      return {};
    }
    const transfer = new view.DataTransfer();
    fill(transfer, items, view);
    const paste = new view.ClipboardEvent('paste', {bubbles: true, cancelable: true, clipboardData: transfer, composed: true});
    if (target.dispatchEvent(paste)) insert(target, html, text, args.replaceInputValue === true);
    return {};
  }
  const policy = args.protectedCredentialFieldPolicy;
  if (policy == null) throw new Error('Virtual clipboard is missing credential protection');
  if (focused != null && isCredentialInput(focused, policy)) return {};
  const selected = selectionOf(target, policy);
  const transfer = new view.DataTransfer();
  const event = new view.ClipboardEvent(args.action, {bubbles: true, cancelable: true, clipboardData: transfer, composed: true});
  if (!target.dispatchEvent(event)) {
    // The page wrote the clipboard itself: its items, with any credential input's value taken out of its HTML.
    const written = await itemsOf(transfer);
    if (written.length === 0) return {};
    for (const entry of written.flatMap(item => item.entries)) {
      if (entry.mime_type !== 'text/html' || typeof entry.text !== 'string' || !/<input[\s/>]/i.test(entry.text)) continue;
      const template = view.document.createElement('template');
      template.innerHTML = entry.text;
      if (dropCredentialValues(template.content, policy)) entry.text = template.innerHTML;
    }
    return {items: written};
  }
  if (selected == null || selected.items.length === 0) return {};
  if (args.action === 'cut') {
    if (args.cutToken == null) throw new Error('Browser Use virtual cut is missing a commit token');
    globalThis.__browserUsePendingCut = {commit: selected.delete, token: args.cutToken};
  }
  return {items: selected.items, ...(args.action === 'cut' ? {cutToken: args.cutToken} : {})};
};

// A cut's deletion, once its items are stored (FC).
const commitPendingCut = ({cutToken}) => {
  const pending = globalThis.__browserUsePendingCut;
  if (pending?.token !== cutToken) throw new Error('Browser Use virtual cut is no longer pending');
  delete globalThis.__browserUsePendingCut;
  pending.commit();
};

// The focused frame element of the document, through shadow roots and same-process frames, or null (vj).
const FOCUSED_FRAME_EXPRESSION = `(() => {
  const focusedFrameElementInRoot = (root) => {
    const active = root.activeElement;
    if (active == null) return null;
    const activeWindow = active.ownerDocument.defaultView ?? window;
    if (active instanceof activeWindow.HTMLElement && active.shadowRoot != null)
      return focusedFrameElementInRoot(active.shadowRoot);
    if (
      active instanceof activeWindow.HTMLIFrameElement ||
      active instanceof activeWindow.HTMLFrameElement
    ) {
      try {
        const frameDocument =
          active.contentDocument ?? active.contentWindow?.document ?? null;
        if (frameDocument != null)
          return focusedFrameElementInRoot(frameDocument);
      } catch {}
      return active;
    }
    return null;
  };
  return focusedFrameElementInRoot(document);
})()`;

// --- in node ----------------------------------------------------------------------------------------------------------

// The page function's own failures; the only page words a rejection repeats.
const PAGE_SENTENCES = new Set([
  'Browser Use virtual clipboard requires native DOM getters', 'Browser Use virtual clipboard has no data to paste',
  'Virtual clipboard is missing credential protection', 'Browser Use virtual cut is missing a commit token',
  'Browser Use virtual cut is no longer pending',
]);
const RELEASE_MS = 100;

// Runs `pageFunction(args)` in the page (el): the target's main world, or the execution context given -> its data.
async function runInPage(session, {args, commandType, deadline, executionContextId, pageFunction, tabId, target}) {
  const where = target ?? {tabId};
  await session.clipboard.ensurePageClipboard(session.cdp, where);
  const result = await session.cdp.callTarget(where, 'Runtime.evaluate', {
    expression: `(
          async () => {
            try {
              const __name = (target) => target;
              const pageFunction = ${pageFunction.toString()};
              const data = await pageFunction(${JSON.stringify(args)});
              return { ok: true, data };
            } catch (error) {
              return {
                ok: false,
                error:
                  error instanceof Error
                    ? error.message
                    : String(error),
              };
            }
          }
        )()`,
    awaitPromise: true,
    ...(executionContextId == null ? {} : {contextId: executionContextId}),
    returnByValue: true,
  }, {deadline});
  if (result.exceptionDetails != null) {
    const objectId = result.exceptionDetails.exception?.objectId;
    if (objectId != null) await session.cdp.callTarget(where, 'Runtime.releaseObject', {objectId}, {deadline: new Deadline(RELEASE_MS)}).catch(() => {});
    throw new Error(`${CLIPBOARD_ERROR}: ${commandType} failed`);
  }
  const answer = result.result?.value;
  if (answer == null || typeof answer !== 'object' || !('ok' in answer)) throw new Error(`${CLIPBOARD_ERROR}: ${commandType} returned an invalid result`);
  if (answer.ok !== true) throw new Error(`${CLIPBOARD_ERROR}: ${PAGE_SENTENCES.has(answer.error) ? answer.error : `${commandType} failed`}`);
  return 'data' in answer ? answer.data : undefined;
}

// --- typing (Vi) ----------------------------------------------------------------------------------------------------

// Leading or trailing whitespace as the HTML that keeps it (sy).
function whitespaceHtml(characters, reversed = false) {
  const html = [];
  for (const character of characters) {
    if (/\r|\n|\u2028|\u2029/.test(character)) { html.push('<br>'); continue; }
    if (/\s/.test(character)) { html.push('&nbsp;'); continue; }
    break;
  }
  if (reversed) html.reverse();
  return html.join('');
}

const MARKDOWN = markdownit({breaks: true, html: false, linkify: false, typographer: false});                          // gW

// Typed text as HTML (bW, _W): its Markdown rendering, a single paragraph unwrapped, and the text's leading and
// trailing whitespace kept.
export function richTextHtml(text) {
  const rendered = MARKDOWN.render(text);
  let html = rendered.trim();
  if (text.trim().length === 0) return whitespaceHtml(text);
  const leading = whitespaceHtml(text);
  const trailing = whitespaceHtml(Array.from(text).reverse(), true);
  if (html.startsWith('<p>') && html.endsWith('</p>')) {
    const inner = html.slice(3, -4);
    if (!inner.includes('<p>')) html = leading + inner + trailing;
  }
  return html === rendered.trim() ? leading + html + trailing : html;
}

// Google Sheets takes the plain text only (yW, wW, xW).
async function allowsRichText(session, tabId) {
  const {url} = await session.tabs.get(tabId);
  let parsed;
  try { parsed = new URL(url); } catch { return true; }
  return !(parsed.host === 'docs.google.com' && parsed.pathname.split('/').filter(Boolean)[0] === 'spreadsheets');
}

const pasteItems = (text, richText) => [{                                                                            // vW
  entries: [{mime_type: 'text/plain', text}, ...(richText ? [{mime_type: 'text/html', text: richTextHtml(text)}] : [])],
  presentation_style: 'unspecified',
}];

// Runs `operation` in the clipboard's queue within `deadline`: the caller stops waiting when it is spent, and an
// operation reached after that dispatches nothing.
async function exclusively(session, deadline, operation) {
  deadline.check();
  return await deadline.race(session.clipboard.runExclusive(async () => {
    deadline.check();
    return await operation();
  }));
}

// Types `params.text` into the focused element by paste (Vi), within `deadline`. `params.target` and
// `params.executionContextId` name the world of an element focused for it (fill); otherwise the tab's top document.
export async function typeText(session, params, commandType, {deadline}) {
  if (typeof params.text !== 'string') throw new Error(`${commandType} requires text`);
  const tabId = tabIdOf(params.tab_id);
  const richText = params.includeRichText !== false && await deadline.race(allowsRichText(session, tabId));
  const items = pasteItems(params.text, richText);
  await exclusively(session, deadline, async () => {
    await runInPage(session, {
      args: {action: 'paste', clipboardItems: items, replaceInputValue: params.replaceInputValue, ...(richText ? {richTextFallback: true} : {})},
      commandType, deadline, executionContextId: params.executionContextId, pageFunction: pageClipboardAction, tabId, target: params.target,
    });
  });
}

// --- the clipboard shortcuts (kn, rb, _j) ---------------------------------------------------------------------------

// The innermost focused frame from `scope` {target, executionContextId?} (_j): an out-of-process frame by its own
// target, a same-process one by an isolated world of the virtual clipboard in it.
async function focusedFrameScope(session, tabId, deadline, scope = {target: {tabId}}) {
  let current = scope;
  const seen = new Set();
  while (true) {
    const {target} = current;
    const key = `${target.sessionId ?? ''}:${target.targetId ?? ''}:${current.executionContextId ?? ''}`;
    if (seen.has(key)) throw new Error('Browser Use encountered a focused frame cycle');
    seen.add(key);
    const found = await session.cdp.callTarget(target, 'Runtime.evaluate', {contextId: current.executionContextId, expression: FOCUSED_FRAME_EXPRESSION, returnByValue: false}, {deadline});
    const release = async objectId => {
      if (objectId != null) await session.cdp.callTarget(target, 'Runtime.releaseObject', {objectId}, {deadline: new Deadline(RELEASE_MS)}).catch(() => {});
    };
    if (found.exceptionDetails != null) {
      await release(found.exceptionDetails.exception?.objectId);
      throw new Error('Browser Use could not inspect the focused frame');
    }
    const objectId = found.result?.objectId;
    if (objectId == null) return current;
    let frameId;
    try {
      ({node: {frameId}} = await session.cdp.callTarget(target, 'DOM.describeNode', {objectId}, {deadline}));
    } finally {
      await release(objectId);
    }
    if (frameId == null) return current;
    const frameTarget = await session.cdp.targetForFrameOrAttach(tabId, frameId, {deadline});
    if (frameTarget != null) {
      current = {target: frameTarget};
      continue;
    }
    const {executionContextId} = await session.cdp.callTarget(target, 'Page.createIsolatedWorld', {frameId, grantUniveralAccess: false, worldName: CLIPBOARD_WORLD}, {deadline});
    current = {executionContextId, target};
  }
}

// Runs a clipboard shortcut's action against the virtual clipboard in the focused frame (rb). `focusTarget(forPaste,
// deadline)` focuses the element the shortcut is for, when it has one, -> its {target, executionContextId}. All within
// `deadline`, the focusing included, so nothing of a queued shortcut runs once it is spent.
async function runClipboardAction({action, commandType, deadline, session, focusTarget, tabId}) {
  const tab = tabIdOf(tabId);
  await exclusively(session, deadline, async () => {
    const focused = await focusTarget?.(action === 'paste' || action === 'paste-plain-text', deadline);
    const scope = await focusedFrameScope(session, tab, deadline, focused == null ? undefined : {target: focused.target, executionContextId: focused.executionContextId});
    let request;
    switch (action) {
      case 'paste': request = {action, clipboardItems: session.clipboard.read()}; break;
      case 'paste-plain-text': {
        const items = session.clipboard.read();
        for (const item of items) item.entries = item.entries.filter(entry => entry.mime_type === 'text/plain');
        request = {action: 'paste', clipboardItems: items};
        break;
      }
      case 'copy': request = {action, clipboardItems: []}; break;
      case 'cut': request = {action, clipboardItems: [], cutToken: crypto.randomUUID()}; break;
      default: throw new Error(`Browser Use encountered an unsupported clipboard shortcut: ${action}`);
    }
    const data = await runInPage(session, {
      args: {...request, protectedCredentialFieldPolicy: CREDENTIAL_FIELDS, clipboardItems: request.clipboardItems.filter(item => item.entries.length > 0)},
      commandType, deadline, executionContextId: scope.executionContextId, pageFunction: pageClipboardAction, tabId: tab, target: scope.target,
    });
    if (request.action !== 'paste' && data.items != null) {
      session.clipboard.write(data.items, commandType);
      if (request.action === 'cut' && data.cutToken != null) {
        await runInPage(session, {args: {cutToken: data.cutToken}, commandType, deadline, executionContextId: scope.executionContextId,
          pageFunction: commitPendingCut, tabId: tab, target: scope.target});
      }
    }
  });
}

// When `keys` is a clipboard shortcut, performs it on the virtual clipboard -> true; refuses a native clipboard key
// press; -> false for any other press (kn). The action runs within `deadline`.
export async function performClipboardShortcut({commandType, deadline, session, keys, tabId, focusTarget}) {
  const action = clipboardShortcut(keys, session.platform);
  if (action == null) return false;
  if (action === 'blocked') throw new Error(NATIVE_CLIPBOARD_DISABLED);
  await runClipboardAction({action, commandType, deadline, session, focusTarget, tabId});
  return true;
}
