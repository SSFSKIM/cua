// Ported from readable chatgpt-26.928.40906 BS:63840-63954 (Jf, the virtual clipboard, its items and exclusive queue; JQ, YQ, ZQ and QQ, its items' checks and copies); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: l1, c1, d1 and p1, the tab_clipboard_* commands (BS:50362-50430).
//
// The session's virtual clipboard: what a copy or cut shortcut wrote and a paste shortcut reads (paste.mjs), what the
// tab_clipboard_* commands read and write, and what the page's own navigator.clipboard reads and writes through the
// page bridge (clipboard-bridge.mjs), as clipboard items {entries: [{mime_type, text | base64}],
// presentation_style?}, one operation at a time. Each command installs the bridge in the tab first, as the vendor's
// do, so the page and the agent share one clipboard and the person's own is never read or written.
import {PageClipboardBridge} from './clipboard-bridge.mjs';
import {tabIdOf} from './tabs.mjs';

const PRESENTATION_STYLES = new Set(['unspecified', 'inline', 'attachment']);

function checkedEntry(entry, operation) {                                                                            // YQ
  if (entry == null || typeof entry !== 'object' || typeof entry.mime_type !== 'string' || entry.mime_type.length === 0) {
    throw new Error(`${operation} requires entry mime_type`);
  }
  if (typeof entry.text === 'string' && typeof entry.base64 !== 'string') return {mime_type: entry.mime_type, text: entry.text};
  if (typeof entry.base64 === 'string' && typeof entry.text !== 'string') {
    try { atob(entry.base64); } catch { throw new Error(`${operation} requires valid base64 entry data`); }          // ZQ
    return {mime_type: entry.mime_type, base64: entry.base64};
  }
  throw new Error(`${operation} requires exactly one of entry text or base64`);
}

function checkedItems(items, operation) {                                                                            // JQ
  if (!Array.isArray(items) || items.length === 0) throw new Error(`${operation} requires items`);
  return items.map(item => {
    if (item == null || typeof item !== 'object' || !Array.isArray(item.entries) || item.entries.length === 0) {
      throw new Error(`${operation} requires clipboard item entries`);
    }
    if (item.presentation_style != null && !PRESENTATION_STYLES.has(item.presentation_style)) {
      throw new Error(`${operation} requires a valid presentation_style`);
    }
    return {entries: item.entries.map(entry => checkedEntry(entry, operation)),
      ...(item.presentation_style == null ? {} : {presentation_style: item.presentation_style})};
  });
}

const copied = items => items.map(item => ({entries: item.entries.map(entry => ({...entry})),                        // QQ
  ...(item.presentation_style == null ? {} : {presentation_style: item.presentation_style})}));

export class Clipboard {
  items = [];
  operationTail = Promise.resolve();
  bridges = new Map();           // CdpController -> PageClipboardBridge
  disposed = false;

  // Installs the page bridge in `target` ({tabId, sessionId? | targetId?}) of `cdp`'s tabs, within `deadline` if given.
  async ensurePageClipboard(cdp, target, {deadline} = {}) {
    if (this.disposed) throw new Error('Browser Use clipboard is disposed');
    let bridge = this.bridges.get(cdp);
    if (bridge == null) {
      bridge = new PageClipboardBridge(cdp, this);
      this.bridges.set(cdp, bridge);
    }
    await bridge.ensure(target, {deadline});
  }

  // Removes every installed bridge from its page (the turn's end); later commands install them again.
  async cleanupPageClipboards() {
    await Promise.all([...this.bridges.values()].map(bridge => bridge.cleanup()));
  }

  // Runs `operation` after every earlier one has settled -> its result.
  runExclusive(operation) {
    const result = this.operationTail.then(operation);
    this.operationTail = result.then(() => {}, () => {});
    return result;
  }

  read() { return copied(this.items); }

  write(items, operation) { this.items = checkedItems(items, operation); }

  async dispose() {
    this.disposed = true;
    await Promise.all([...this.bridges.values()].map(bridge => bridge.dispose()));
    this.bridges.clear();
    this.items = [];
  }
}

const plainText = text => [{entries: [{mime_type: 'text/plain', text}], presentation_style: 'unspecified'}];

export const CLIPBOARD_HANDLERS = {
  async tab_clipboard_read(params, session) {                                                                        // l1
    await session.clipboard.ensurePageClipboard(session.cdp, {tabId: tabIdOf(params.tab_id)});
    return await session.clipboard.runExclusive(() => ({items: session.clipboard.read()}));
  },

  async tab_clipboard_read_text(params, session) {                                                                   // c1
    await session.clipboard.ensurePageClipboard(session.cdp, {tabId: tabIdOf(params.tab_id)});
    return await session.clipboard.runExclusive(() => ({
      text: session.clipboard.read().flatMap(item => item.entries).find(entry => entry.mime_type === 'text/plain')?.text ?? '',
    }));
  },

  async tab_clipboard_write(params, session) {                                                                       // d1
    await session.clipboard.ensurePageClipboard(session.cdp, {tabId: tabIdOf(params.tab_id)});
    return await session.clipboard.runExclusive(() => {
      session.clipboard.write(params.items, 'tab_clipboard_write');
      return {};
    });
  },

  async tab_clipboard_write_text(params, session) {                                                                  // p1
    const tabId = tabIdOf(params.tab_id);
    if (typeof params.text !== 'string') throw new Error('tab_clipboard_write_text requires text');
    await session.clipboard.ensurePageClipboard(session.cdp, {tabId});
    return await session.clipboard.runExclusive(() => {
      session.clipboard.write(plainText(params.text), 'tab_clipboard_write_text');
      return {};
    });
  },
};
