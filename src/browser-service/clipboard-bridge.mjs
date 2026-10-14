// Ported from readable chatgpt-26.928.40906 BS:63597-63839 (Xf, the page clipboard bridge, with aN and lN); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: XQ, the bridge's page side, and oN, iN and sN, its install, removal and answer expressions (BS:63320-63596).
//
// The page's navigator.clipboard, served from the session's virtual clipboard (clipboard.mjs): in each document the
// service touches for clipboard work (a tab_clipboard_* command, a paste or a copy), the bridge adds a CDP binding and
// a script that replaces read, readText, write and writeText on the page's navigator.clipboard (or defines one) with
// calls through the binding, so what the page copies lands in the virtual clipboard and what it reads comes from it,
// never from the person's own clipboard. The script is also registered for the document's next navigations. Each
// call is answered by evaluating the bridge's respond() in the calling context. One installation per target (tab,
// child session or child target); it is removed when its tab is detached or closed and when the session ends the
// turn or is disposed (the page's own navigator.clipboard restored, the binding and script removed).
// Changed: an installation's CDP calls carry the deadline of the command that starts it, and a command that joins an
// installation waits for it only within its own deadline (a starter's spent deadline does not fail the joiner, which
// installs again on its own budget), where the vendor's installation calls take the host's 10 s each.
import {Deadline, DEFAULT_ACTION_MS} from './budgets.mjs';
import {isDeadlineError} from './errors.mjs';

const DISPOSED = 'Browser Use clipboard bridge is disposed';

// The page side (XQ), run in the page's main world with the binding's name.
const installPageClipboardBridge = (bindingName) => {
  const scope = globalThis;
  const existing = scope.__browserUseClipboardBridge;
  if (existing?.bindingName === bindingName) return;
  existing?.cleanup();
  const binding = scope[bindingName];
  if (typeof binding !== 'function') throw new Error('Browser Use clipboard bridge is unavailable');
  const windowScope = globalThis;
  const original = navigator.clipboard;
  const hadOwnClipboard = Object.prototype.hasOwnProperty.call(navigator, 'clipboard');
  const ownClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const pending = new Map();
  let lastId = 0;
  const toBase64 = buffer => {
    const bytes = new Uint8Array(buffer);
    const chunk = 32768;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(binary);
  };
  const fromBase64 = base64 => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  };
  const blobOf = entry => new Blob([typeof entry.text === 'string' ? entry.text : fromBase64(entry.base64 ?? '')], {type: entry.mime_type});
  const clipboardItemOf = item => (typeof ClipboardItem === 'function'
    ? new ClipboardItem(Object.fromEntries(item.entries.map(entry => [entry.mime_type, blobOf(entry)])), {presentationStyle: item.presentation_style ?? 'unspecified'})
    : {
      types: item.entries.map(entry => entry.mime_type),
      presentationStyle: item.presentation_style ?? 'unspecified',
      getType: async type => {
        const entry = item.entries.find(e => e.mime_type === type);
        if (entry == null) throw new DOMException(`No clipboard entry for ${type}`, 'NotFoundError');
        return blobOf(entry);
      },
    });
  const itemsOf = async clipboardItems => await Promise.all(Array.from(clipboardItems).map(async item => ({
    entries: await Promise.all(item.types.map(async type => {
      const blob = await item.getType(type);
      return type.startsWith('text/') ? {mime_type: type, text: await blob.text()} : {mime_type: type, base64: toBase64(await blob.arrayBuffer())};
    })),
    presentation_style: item.presentationStyle ?? 'unspecified',
  })));
  const request = (operation, items) => new Promise((resolve, reject) => {
    const id = ++lastId;
    pending.set(id, {reject, resolve});
    try {
      binding(JSON.stringify({id, items, operation}));
    } catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
  const checkReceiver = receiver => { if (receiver !== clipboard) throw new TypeError('Illegal invocation'); };
  const methods = {
    read: async function () {
      checkReceiver(this);
      return (await request('read')).map(clipboardItemOf);
    },
    readText: async function () {
      checkReceiver(this);
      const entry = (await request('read')).flatMap(item => item.entries).find(e => e.mime_type === 'text/plain');
      return entry == null ? '' : await blobOf(entry).text();
    },
    write: async function (clipboardItems) {
      checkReceiver(this);
      if (arguments.length === 0) throw new TypeError("Failed to execute 'write' on 'Clipboard': 1 argument required");
      const items = await itemsOf(clipboardItems);
      if (items.length !== 0) await request('write', items);
    },
    writeText: async function (text) {
      checkReceiver(this);
      if (arguments.length === 0) throw new TypeError("Failed to execute 'writeText' on 'Clipboard': 1 argument required");
      await request('write', [{entries: [{mime_type: 'text/plain', text: `${text}`}], presentation_style: 'unspecified'}]);
    },
  };
  let clipboard = {...methods, addEventListener: () => {}, dispatchEvent: () => true, removeEventListener: () => {}};
  const getter = {configurable: true, get: () => clipboard};
  const names = Object.keys(methods);
  const replaced = new Map();
  let patched;
  const unpatch = () => {
    if (patched == null) return;
    for (const [name, descriptor] of replaced) {
      if (Object.getOwnPropertyDescriptor(patched, name)?.value === methods[name]) {
        if (descriptor == null) Reflect.deleteProperty(patched, name); else Object.defineProperty(patched, name, descriptor);
      }
    }
    patched = undefined;
    replaced.clear();
  };
  const patch = object => {
    patched = object;
    try {
      for (const name of names) {
        replaced.set(name, Object.getOwnPropertyDescriptor(object, name));
        Object.defineProperty(object, name, {configurable: true, enumerable: true, value: methods[name], writable: true});
      }
      return true;
    } catch {
      unpatch();
      return false;
    }
  };
  if (original != null) {
    const prototype = Object.getPrototypeOf(original);
    if (patch(original) || (prototype != null && names.every(name => name in prototype) && patch(prototype))) clipboard = original;
    else Object.defineProperty(navigator, 'clipboard', getter);
  } else {
    Object.defineProperty(navigator, 'clipboard', getter);
  }
  const cleanup = () => {
    if (scope.__browserUseClipboardBridge?.bindingName !== bindingName) return;
    for (const frame of document.querySelectorAll('iframe,frame')) {
      if (frame instanceof HTMLIFrameElement || frame instanceof HTMLFrameElement) frame.contentWindow?.postMessage(bindingName, '*');
    }
    windowScope.removeEventListener('message', onMessage);
    for (const waiting of pending.values()) waiting.reject(new Error('Browser Use clipboard bridge was removed'));
    pending.clear();
    if (patched != null) {
      unpatch();
    } else if (Object.getOwnPropertyDescriptor(navigator, 'clipboard')?.get === getter.get) {
      if (hadOwnClipboard && ownClipboardDescriptor != null) Object.defineProperty(navigator, 'clipboard', ownClipboardDescriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
    delete scope.__browserUseClipboardBridge;
    if (scope[bindingName] === binding) Reflect.deleteProperty(scope, bindingName);
  };
  const onMessage = event => {
    if (event.data === bindingName && (event.source === windowScope || event.source === windowScope.parent)) cleanup();
  };
  scope.__browserUseClipboardBridge = {
    bindingName,
    cleanup,
    respond: text => {
      let answer;
      try { answer = JSON.parse(text); } catch { return; }
      const waiting = pending.get(answer.id);
      if (waiting == null) return;
      pending.delete(answer.id);
      if (answer.ok) waiting.resolve(Array.isArray(answer.items) ? answer.items : []);
      else waiting.reject(new Error(answer.error ?? 'Clipboard request failed'));
    },
  };
  windowScope.addEventListener('message', onMessage);
};

// oN, iN and sN.
const installSource = bindingName => `(() => {
    const __name = (target) => target;
    const installPageClipboardBridge = ${installPageClipboardBridge.toString()};
    installPageClipboardBridge(${JSON.stringify(bindingName)});
  })()`;
const removeSource = bindingName => `globalThis.__browserUseClipboardBridge?.bindingName === ${JSON.stringify(bindingName)} && globalThis.__browserUseClipboardBridge.cleanup()`;
const answerSource = answer => `globalThis.__browserUseClipboardBridge?.respond(${JSON.stringify(JSON.stringify(answer))})`;

const targetKey = target => (target.sessionId != null ? `${target.tabId}:session:${target.sessionId}`                // aN
  : target.targetId != null ? `${target.tabId}:target:${target.targetId}` : `${target.tabId}:`);
const keyOfTab = (key, tabId) => key.startsWith(`${tabId}:`);                                                        // lN

export class PageClipboardBridge {                                                                                    // Xf
  // `cdp` the session's CdpController, `clipboard` the virtual clipboard whose items the page reads and writes.
  constructor(cdp, clipboard) {
    this.cdp = cdp;
    this.clipboard = clipboard;
    this.cdp.on('event', this.handleCdpEvent);
    this.cdp.on('tabDetached', this.handleTabDetached);
    this.removeTabCleanupHandler = this.cdp.addTabCleanupHandler(async tabId => { await this.cleanupTab(tabId); });
  }

  cdp;
  clipboard;
  installations = new Map();          // target key -> {bindingName, invalidated, failed, installation, cleanup?}
  removeTabCleanupHandler;
  disposal;

  // Installs the bridge in `target` once; with a `deadline`, within it.
  async ensure(target, {deadline} = {}) {
    if (this.disposal != null) throw new Error(DISPOSED);
    const key = targetKey(target);
    let entry = this.installations.get(key);
    const joined = entry != null;
    if (entry == null) {
      deadline?.check();
      const bindingName = `__browserUseClipboard_${crypto.randomUUID().replaceAll('-', '')}`;
      entry = {bindingName, invalidated: false, failed: false, installation: this.install(target, bindingName, deadline)};
      const made = entry;
      made.installation.catch(() => { made.failed = true; });
      this.installations.set(key, entry);
    }
    try {
      await (deadline == null ? entry.installation : deadline.race(entry.installation));
    } catch (error) {
      if (!entry.failed) throw error;                     // this command's own deadline ran out; the install goes on
      if (entry.cleanup == null && this.installations.get(key) === entry) this.installations.delete(key);
      if (entry.invalidated && this.disposal == null) {
        await entry.cleanup;
        return await this.ensure(target, {deadline});
      }
      if (joined && isDeadlineError(error) && deadline != null && !deadline.expired()) return await this.ensure(target, {deadline});
      throw error;
    }
    if (this.disposal != null) throw new Error(DISPOSED);
    if (entry.invalidated || entry.cleanup != null) {
      await this.cleanupInstallation(key, entry);
      return await this.ensure(target, {deadline});
    }
  }

  dispose() {
    if (this.disposal == null) {
      this.disposal = this.cleanup();
      this.cdp.removeListener('event', this.handleCdpEvent);
      this.cdp.removeListener('tabDetached', this.handleTabDetached);
      this.removeTabCleanupHandler();
    }
    return this.disposal;
  }

  async cleanup() {
    await Promise.all([...this.installations].map(([key, entry]) => this.cleanupInstallation(key, entry)));
  }

  handleCdpEvent = event => {
    if (event.method !== 'Runtime.bindingCalled') return;
    const entry = this.installations.get(targetKey(event.source));
    if (entry != null && entry.cleanup == null && event.params.name === entry.bindingName) {
      this.handleBindingCall(event.source, event.params.executionContextId, event.params.payload);
    }
  };

  handleTabDetached = tabId => {
    for (const [key, entry] of this.installations) if (keyOfTab(key, tabId)) entry.invalidated = true;
  };

  // A page's clipboard call: answered in the calling context, whatever the outcome; a payload that is not a request
  // with an id is ignored.
  handleBindingCall(source, executionContextId, payload) {
    let request;
    try { request = JSON.parse(payload); } catch { return; }
    if (request == null || typeof request !== 'object' || typeof request.id !== 'number' || !Number.isSafeInteger(request.id)) return;
    const id = request.id;
    let answer;
    try {
      if (!('operation' in request)) throw new Error('Clipboard request is missing an operation');
      switch (request.operation) {
        case 'read':
          answer = {id, items: this.clipboard.read(), ok: true};
          break;
        case 'write':
          if (!Array.isArray(request.items)) throw new Error('Clipboard write requires items');
          this.clipboard.write(request.items, 'navigator.clipboard.write');
          answer = {id, ok: true};
          break;
        default:
          throw new Error('Unsupported clipboard operation');
      }
    } catch (error) {
      answer = {error: error instanceof Error ? error.message : String(error), id, ok: false};
    }
    this.cdp.callTarget(source, 'Runtime.evaluate', {contextId: executionContextId, expression: answerSource(answer), returnByValue: true}).catch(() => {});
  }

  async install(target, bindingName, deadline) {
    const options = deadline == null ? {} : {deadline};
    let bound = false;
    let identifier;
    try {
      await this.cdp.callTarget(target, 'Runtime.addBinding', {name: bindingName}, options);
      bound = true;
      ({identifier} = await this.cdp.callTarget(target, 'Page.addScriptToEvaluateOnNewDocument', {runImmediately: true, source: installSource(bindingName)}, options));
      const installed = await this.cdp.callTarget(target, 'Runtime.evaluate', {
        expression: `globalThis.__browserUseClipboardBridge?.bindingName === ${JSON.stringify(bindingName)}`, returnByValue: true,
      }, options);
      if (installed.result?.value !== true) throw new Error('Browser Use clipboard bridge installation failed');
      return identifier == null ? {bindingName, target} : {bindingName, identifier, target};
    } catch (error) {
      if (bound) await this.cleanupTarget(identifier == null ? {bindingName, target} : {bindingName, identifier, target});
      throw error;
    }
  }

  async cleanupTab(tabId) {
    await Promise.all([...this.installations.entries()].filter(([key]) => keyOfTab(key, tabId)).map(([key, entry]) => this.cleanupInstallation(key, entry)));
  }

  cleanupInstallation(key, entry) {
    entry.cleanup ??= entry.installation
      .then(installed => this.cleanupTarget(installed), () => {})
      .finally(() => { if (this.installations.get(key) === entry) this.installations.delete(key); });
    return entry.cleanup;
  }

  // Removes the page side, the script and the binding; each step on a budget of its own, any failure ignored (the
  // tab may be gone, or a dialog may hold it).
  async cleanupTarget({bindingName, identifier, target}) {
    const options = () => ({deadline: new Deadline(DEFAULT_ACTION_MS)});
    await this.cdp.callTarget(target, 'Runtime.evaluate', {expression: removeSource(bindingName), returnByValue: true}, options()).catch(() => {});
    if (identifier != null) await this.cdp.callTarget(target, 'Page.removeScriptToEvaluateOnNewDocument', {identifier}, options()).catch(() => {});
    await this.cdp.callTarget(target, 'Runtime.removeBinding', {name: bindingName}, options()).catch(() => {});
  }
}
