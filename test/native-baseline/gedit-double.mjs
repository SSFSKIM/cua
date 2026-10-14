// A scripted Linux desktop for the native baseline's tests: gedit windows as the vendor's Linux facade presents them
// (cua.listWindows and cua.getApp({windowId}); the bound app's methods throw exactly what bind_linux_app.js throws,
// readable chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/bind_linux_app.js:20-178).
// typeText and paste behave as measured on the cua-linux VM (docs/evidence/2026-10-06-linux-acceptance.md): on a GTK3
// text view they fail with `Resource temporarily unavailable (os error 11)` and the window's process crashes. pressKey
// takes one X keysym (or ctrl+a) and edits the buffer; `ignoreKeys` makes it reach nothing.
const CHARS = {space: ' ', minus: '-', underscore: '_', period: '.'};

export function geditDesktop({ignoreKeys = false, typeTextWorks = false} = {}) {
  const windows = new Map();   // id -> {id, file, title, text, selected, crashed, closed}
  const calls = [];
  let nextId = 0x1600001;
  const live = id => {
    const w = windows.get(id);
    if (!w || w.crashed || w.closed) throw new Error(`Computer Use server error: window ${id} is not available`);
    return w;
  };
  const insert = (w, text) => { w.text = w.selected ? text : w.text + text; w.selected = false; };
  function bind(id) {
    const tree = () => { const w = live(id); return `Accessibility source: at_spi\n0 frame ${w.title}\n\t1 scroll pane\n\t\t2 text (editable, focused) ${w.text}`; };
    const typed = text => {
      calls.push({id, method: 'type_text', text});
      const w = live(id);
      if (typeTextWorks) { insert(w, text); return Promise.resolve(); }
      w.crashed = true;
      return Promise.reject(new Error('Resource temporarily unavailable (os error 11)'));
    };
    return {
      async getAXState() { return tree(); },
      async getScreenshot() {
        live(id);
        const jpeg = new Uint8Array(64); jpeg.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x00, 0x04, 0x00]);
        return jpeg;
      },
      async click() { live(id); },
      async scroll(at, direction, options) {
        if (typeof options === 'number') throw new Error('Linux scroll accepts { pixels }, not pages.');
        calls.push({id, method: 'scroll', at, direction}); live(id);
      },
      async selectText() { throw new Error('selectText is unavailable on Linux.'); },
      async setValue() { throw new Error('setValue is unavailable on Linux; use click, pressKey, and typeText.'); },
      paste(text, options) {
        if (options?.format !== undefined && options.format !== 'text') throw new Error('Linux paste supports only text format.');
        return typed(text);
      },
      typeText: typed,
      async pressKey(key) {
        calls.push({id, method: 'press_key', key});
        const w = live(id);
        if (ignoreKeys) return;
        if (key === 'ctrl+a') w.selected = true;
        else if (key === 'BackSpace') { if (w.selected) { w.text = ''; w.selected = false; } else w.text = w.text.slice(0, -1); }
        else if (CHARS[key] !== undefined) insert(w, CHARS[key]);
        else if (/^[A-Za-z0-9]$/.test(key)) insert(w, key);
        else throw new Error(`unknown key ${key}`);
      },
    };
  }
  return {
    windows, calls,
    open(file) {
      const id = nextId++;
      windows.set(id, {id, file, title: `${file.split('/').at(-1)} (${file.split('/').slice(0, -1).join('/')}) - gedit`, text: '', selected: false, crashed: false, closed: false});
      return id;
    },
    cua: {
      async listWindows(options) {
        if (options?.emit !== false) throw new Error('the baseline must not emit');
        return [{id: 0x400007, app: 'org.openbox.Panel', title: 'a window the run did not open'},
          ...[...windows.values()].filter(w => !w.crashed && !w.closed).map(w => ({id: w.id, app: 'org.gnome.gedit', title: w.title}))];
      },
      async getApp(target) {
        if (typeof target !== 'object' || !Number.isSafeInteger(target?.windowId)) throw new Error('Linux getApp requires { windowId } from listApps() or listWindows().');
        live(target.windowId);
        return bind(target.windowId);
      },
    },
  };
}
