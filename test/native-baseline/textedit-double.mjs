import assert from 'node:assert/strict';

// A TextEdit double shaped as measured on the mini: launched with no document it shows the Open panel (served out of
// process: keys sent to TextEdit do not reach it; its New Document button does); super+w on an edited document brings
// up the keep-or-delete sheet as the front window (window element ID save-panel, its question naming the document, a
// Delete button with ID DontSaveButton), after `sheetDelayMs`; `foreign` puts some other window in front instead. An
// unedited document closes at once, and closing the last one brings the panel back.
export function textEdit({failType = false, sheetDelayMs = 0, foreign = false} = {}) {
  const windows = [], keys = [], clicks = [];
  let count = 0, sheet = null, panel = true, quit = false, other = false;
  const front = () => windows.at(-1);
  const newDocument = () => { panel = false; windows.push({title: count++ ? `Untitled ${count}` : 'Untitled', text: '', edited: false}); };
  return {
    windows, keys, clicks, get quit() { return quit; },
    async getAXState(options) {
      assert.deepEqual(options, {emit: false, disableDiffing: true});
      if (panel) return 'App=com.apple.TextEdit\nWindow: "Open", App: TextEdit.\n0 standard window Open, ID: open-panel, Secondary Actions: Raise\n\t1 row Description: a document of the owner\n\t74 button New Document, ID: NewDocumentButton\n\t76 button Cancel, ID: CancelButton';
      if (!windows.length) throw new Error('Computer Use server error: noWindowsAvailable');
      if (other) return 'App=com.apple.TextEdit\nWindow: "Alert", App: TextEdit.\n0 dialog Alert\n\t1 button OK, ID: OKButton';
      if (sheet !== null && performance.now() >= sheet) return `App=com.apple.TextEdit\nWindow: "Save", App: TextEdit.\n0 sheet Description: save, ID: save-panel, Secondary Actions: Raise\n\t6 text Do you want to keep this new document ("${front().title}")?\n\t7 text field (settable) Value: ${front().title}, ID: saveAsNameTextField\n\t12 button Delete, ID: DontSaveButton\n\t13 button Cancel, ID: CancelButton\n\t14 button Save, ID: OKButton`;
      return `App=com.apple.TextEdit\nWindow: "${front().title}", App: TextEdit.\n0 standard window ${front().title}\n\t1 scroll area\n\t\t2 text area Value: ${front().text}, ID: First Text View`;
    },
    async getScreenshot(options) {
      assert.deepEqual(options, {emit: false});
      const png = new Uint8Array(40); png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      new DataView(png.buffer).setUint32(16, 2560); new DataView(png.buffer).setUint32(20, 1440);
      return png;
    },
    async click(index) {
      clicks.push(index);
      if (panel && index === 74) newDocument();
      else if (sheet !== null && performance.now() >= sheet && index === 12) { sheet = null; windows.pop(); }
    },
    async pressKey(key) {
      keys.push(key);
      if (panel) return;
      if (key === 'super+n') newDocument();
      else if (key === 'super+w' && sheet === null) {
        if (!front().edited) { windows.pop(); panel = !windows.length; } else if (foreign) other = true; else sheet = performance.now() + sheetDelayMs;
      } else if (key === 'super+q' && !windows.some(w => w.edited)) quit = true;
    },
    async typeText(text) { if (failType) throw new Error('typing failed'); if (panel) return; front().text += text; front().edited = true; },
  };
}
