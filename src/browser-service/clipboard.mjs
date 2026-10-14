// Ported from readable chatgpt-26.928.40906 BS:63840-63954 (Jf, the virtual clipboard, its items and exclusive queue; JQ, YQ, ZQ and QQ, its items' checks and copies); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
//
// The session's virtual clipboard: what a copy or cut shortcut wrote and a paste shortcut reads (paste.mjs), as
// clipboard items {entries: [{mime_type, text | base64}], presentation_style?}, one operation at a time. The vendor's
// page bridge (Xf: navigator.clipboard in the page served from these items through a CDP binding) and the
// tab_clipboard_* commands are M2's; until then ensurePageClipboard leaves the page's own navigator.clipboard alone.

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

  // M2 installs the page bridge here (Xf); nothing to install before it.
  async ensurePageClipboard() {}

  // Runs `operation` after every earlier one has settled -> its result.
  runExclusive(operation) {
    const result = this.operationTail.then(operation);
    this.operationTail = result.then(() => {}, () => {});
    return result;
  }

  read() { return copied(this.items); }

  write(items, operation) { this.items = checkedItems(items, operation); }

  dispose() { this.items = []; }
}
