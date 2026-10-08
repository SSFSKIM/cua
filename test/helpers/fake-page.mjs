// A fake page for the chrome.* stub: just enough DOM to run the cua extension's page guards (extension/background.js,
// "Page guards") the way chrome.scripting runs them, serialized into a world of the page. A page has one document,
// shared by two worlds: `main` (the page's own; window.open lives here) and `isolated` (the extension's, with
// chrome.runtime and chrome.dom). Modelled: elements, attributes, open and closed shadow roots, MutationObserver
// (childList and attributes, subtree, attributeFilter; records delivered in a microtask; a shadow tree is observed only
// through its own root), events with capture and bubble phases, CustomEvent, user activation, and frames: a connected
// <iframe>/<frame> commits its document a turn after its src or srcdoc changes (srcdoc wins, as in Chrome), then fires
// `load`. `onCommit(frame)` lets the stub react to a frame committing (Chrome detaching the debugger for another
// extension's frame).
import vm from 'node:vm';

const later = fn => setImmediate(fn);

export function createFakePage({url, extensionId, sendMessage = async () => {}, onCommit = () => {}}) {
  const observers = new Set();          // {observer, root, options}
  const nativeOpens = [];               // what reached Chrome's own window.open
  const navigator = {userActivation: {isActive: false}};
  const location = {href: url, origin: new URL(url).origin};

  // --- events ---------------------------------------------------------------------------------------------------------

  class Event {
    constructor(type, {bubbles = false, cancelable = false, detail = null} = {}) {
      Object.assign(this, {type, bubbles, cancelable, detail, defaultPrevented: false, isTrusted: false, button: 0, path: []});
    }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    composedPath() { return [...this.path]; }
  }
  class CustomEvent extends Event {}

  class Target {
    #listeners = [];
    addEventListener(type, fn, options) {
      const capture = options === true || options?.capture === true;
      if (!this.#listeners.some(l => l.type === type && l.fn === fn && l.capture === capture))
        this.#listeners.push({type, fn, capture, once: options?.once === true});
    }
    removeEventListener(type, fn, options) {
      const capture = options === true || options?.capture === true;
      this.#listeners = this.#listeners.filter(l => !(l.type === type && l.fn === fn && l.capture === capture));
    }
    invoke(event, phase) {
      for (const l of [...this.#listeners]) {
        if (l.type !== event.type) continue;
        if (phase === 'capture' && !l.capture) continue;
        if (phase === 'bubble' && l.capture) continue;
        if (l.once) this.removeEventListener(l.type, l.fn, l.capture);
        l.fn.call(this, event);
      }
    }
    dispatchEvent(event) {
      const path = [];
      for (let n = this; n; n = n.parentNode ?? n.host ?? (n === document ? win : null)) path.push(n);
      event.path = path;
      for (const n of [...path].reverse().slice(0, -1)) n.invoke(event, 'capture');
      this.invoke(event, 'target');
      if (event.bubbles) for (const n of path.slice(1)) n.invoke(event, 'bubble');
      return !event.defaultPrevented;
    }
  }

  // --- nodes ----------------------------------------------------------------------------------------------------------

  class ParentNode extends Target {
    children = [];
    parentNode = null;
    appendChild(child) {
      child.parentNode?.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      mutated({type: 'childList', target: this, addedNodes: [child]});
      for (const frame of framesIn(child)) frame.schedule();
      return child;
    }
    append(...nodes) { for (const n of nodes) this.appendChild(n); }
    removeChild(child) {
      this.children = this.children.filter(c => c !== child);
      child.parentNode = null;
      mutated({type: 'childList', target: this, addedNodes: [], removedNodes: [child]});
      return child;
    }
    // '*' and 'iframe, frame' are all the guards ask; neither crosses into a shadow tree.
    querySelectorAll(selector) {
      const tags = selector === '*' ? null : selector.split(',').map(s => s.trim().toUpperCase());
      const out = [];
      const walk = n => { for (const c of n.children) { if (!tags || tags.includes(c.tagName)) out.push(c); walk(c); } };
      walk(this);
      return out;
    }
  }

  class Element extends ParentNode {
    nodeType = 1;
    #attributes = new Map();
    #shadow = null;
    constructor(tagName) { super(); this.tagName = tagName.toUpperCase(); }
    getAttribute(name) { return this.#attributes.has(name) ? this.#attributes.get(name) : null; }
    hasAttribute(name) { return this.#attributes.has(name); }
    setAttribute(name, value) {
      this.#attributes.set(name, String(value));
      mutated({type: 'attributes', target: this, attributeName: name});
      if (this.frame && (name === 'src' || name === 'srcdoc')) this.schedule();
    }
    removeAttribute(name) {
      if (!this.#attributes.delete(name)) return;
      mutated({type: 'attributes', target: this, attributeName: name});
      if (this.frame && (name === 'src' || name === 'srcdoc')) this.schedule();
    }
    remove() { this.parentNode?.removeChild(this); }
    attachShadow({mode}) { this.#shadow = new ShadowRoot(this, mode); return this.#shadow; }
    get shadowRoot() { return this.#shadow?.mode === 'open' ? this.#shadow : null; }
    get anyShadowRoot() { return this.#shadow; }
    get isConnected() {
      for (let n = this; n; n = n.parentNode ?? n.host) if (n === document) return true;
      return false;
    }
    #resolve(name) { const v = this.getAttribute(name); if (v === null) return ''; try { return new URL(v, url).href; } catch { return v; } }
    get src() { return this.#resolve('src'); }
    get href() { return this.#resolve('href'); }
    get target() { return this.getAttribute('target') ?? ''; }
    get origin() { try { return new URL(this.href).origin; } catch { return ''; } }
    get frame() { return this.tagName === 'IFRAME' || this.tagName === 'FRAME'; }
    // A frame's document: committed a turn after its source changes, while connected.
    committedUrl = null;
    #generation = 0;
    schedule() {
      const generation = ++this.#generation;
      later(() => {
        if (generation !== this.#generation || !this.isConnected) return;
        this.committedUrl = this.tagName === 'IFRAME' && this.hasAttribute('srcdoc') ? 'about:srcdoc' : (this.src || 'about:blank');
        onCommit(this);
        this.dispatchEvent(new Event('load'));
      });
    }
  }

  class ShadowRoot extends ParentNode {
    nodeType = 11;
    constructor(host, mode) { super(); this.host = host; this.mode = mode; }
  }

  class Document extends ParentNode {
    nodeType = 9;
    baseURI = url;
    createElement(tag) { return new Element(tag); }
  }

  const win = new Target();
  const document = new Document();
  const html = document.appendChild(new Element('html'));
  const body = html.appendChild(new Element('body'));
  document.body = body;

  function framesIn(node) {
    const out = [];
    const walk = n => {
      if (n.frame) out.push(n);
      for (const c of n.children ?? []) walk(c);
      if (n.anyShadowRoot) walk(n.anyShadowRoot);
    };
    walk(node);
    return out;
  }

  // --- MutationObserver -----------------------------------------------------------------------------------------------

  function treeRootPath(node) {
    const path = [];
    for (let n = node; n; n = n.parentNode) path.push(n);
    return path;
  }
  function mutated(record) {
    const path = treeRootPath(record.target);
    for (const reg of observers) {
      const i = path.indexOf(reg.root);
      if (i < 0 || (i > 0 && !reg.options.subtree)) continue;
      if (record.type === 'childList' && !reg.options.childList) continue;
      if (record.type === 'attributes' && (!reg.options.attributes || (reg.options.attributeFilter && !reg.options.attributeFilter.includes(record.attributeName)))) continue;
      reg.observer.queue({addedNodes: [], removedNodes: [], ...record});
    }
  }
  class MutationObserver {
    #callback;
    #records = [];
    constructor(callback) { this.#callback = callback; }
    observe(root, options) { observers.add({observer: this, root, options}); }
    disconnect() { for (const reg of [...observers]) if (reg.observer === this) observers.delete(reg); this.#records = []; }
    queue(record) {
      if (this.#records.push(record) > 1) return;
      queueMicrotask(() => { const records = this.#records; this.#records = []; if (records.length) this.#callback(records, this); });
    }
  }

  // --- the two worlds -------------------------------------------------------------------------------------------------

  const timers = {setTimeout: (fn, ms) => setTimeout(fn, ms).unref(), clearTimeout};
  const common = {document, navigator, location, MutationObserver, CustomEvent, Event, URL, console, ...timers, queueMicrotask};
  const main = vm.createContext({...common,
    open(target, name, features) { nativeOpens.push({url: target, target: name, features}); return {native: true}; },
    addEventListener: (...a) => win.addEventListener(...a), removeEventListener: (...a) => win.removeEventListener(...a)});
  main.window = main;
  main.globalThis = main;
  const isolated = vm.createContext({...common,
    chrome: {runtime: {id: extensionId, sendMessage: message => sendMessage(structuredClone(message))},
      dom: {openOrClosedShadowRoot: el => el.anyShadowRoot ?? null}}});
  isolated.window = isolated;
  isolated.globalThis = isolated;

  const page = {
    url, document, nativeOpens, navigator, main, isolated,
    run(world, source) { return vm.runInContext(source, world === 'main' ? main : isolated); },
    // Another extension drawing its frame into the page (in a shadow root of its own when `shadow` is set).
    addForeignFrame(foreignId = 'pejdijmoenmkgeppbflobdenhhabjlaj', {shadow = null, path = '/completion_list.html'} = {}) {
      const frame = new Element('iframe');
      frame.setAttribute('src', `chrome-extension://${foreignId}${path}`);
      if (!shadow) return body.appendChild(frame);
      const host = body.appendChild(new Element('div'));
      host.attachShadow({mode: shadow}).appendChild(frame);
      return frame;
    },
    // Frames whose committed document belongs to another extension: what Chrome refuses the debugger for.
    foreignFrames() {
      return framesIn(document).filter(f => f.isConnected && /^chrome-extension:\/\//.test(f.committedUrl ?? '') && new URL(f.committedUrl).host !== extensionId);
    },
    // A trusted click (the user's, or the debugger's Input events): user activation, then the event, then the default
    // action of a link with a target (Chrome opening it) unless something prevented it.
    click(el) {
      navigator.userActivation.isActive = true;
      const event = new Event('click', {bubbles: true, cancelable: true});
      event.isTrusted = true;
      el.dispatchEvent(event);
      if (!event.defaultPrevented && el.tagName === 'A' && el.target) nativeOpens.push({url: el.href, target: el.target, link: true});
      return event;
    },
    element: tag => new Element(tag),
  };
  return page;
}
