// Ported from readable chatgpt-26.928.40906 BS:60710-60880 (Of, the console and exception log of each attached tab, with RZ, DZ, BZ, OZ, MZ, hM, NZ, Sc and hi); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: U1, tab_dev_logs (BS:54448-54469); its payload and levels (BS:32519-32538).
//
// tab.dev.logs(): what the page wrote to its console and the exceptions it threw, per tab, from the time the service
// enabled the Runtime domain on it (at every attachment, as the vendor does, so a page's logs are kept from its first
// command on; a logs call on a tab not yet attached attaches it). The newest 500 entries of a tab are kept; a call
// answers the last `limit` (100 by default) whose message contains `filter` and whose level is among `levels`. A
// tab's log is forgotten when it is detached. Entries are {level, message, timestamp, url?}: the console call's
// arguments as text, an exception's value or description. Dropped from Of: the browser-auth event protection (the
// vendor's credential-saving flow, not ported).
import {tabIdOf} from './tabs.mjs';

const LOG_LIMIT = 500;
const DEFAULT_LIMIT = 100;

const isObject = value => typeof value === 'object' && value != null;                                                // hi
const stringIn = (object, key) => (typeof object[key] === 'string' ? object[key] : undefined);                       // Sc
const withUrl = url => (url ? {url} : {});                                                                            // hM

function levelOf(type) {                                                                                              // NZ
  switch (type) {
    case 'debug': return 'debug';
    case 'info': return 'info';
    case 'warning':
    case 'warn': return 'warn';
    case 'error': return 'error';
    default: return 'log';
  }
}

function argumentsText(args) {                                                                                        // OZ
  if (!Array.isArray(args) || args.length === 0) return '';
  return args.map(arg => (isObject(arg)
    ? arg.type === 'string' ? String(arg.value ?? '')
      : arg.value !== undefined ? String(arg.value)
        : typeof arg.description === 'string' ? arg.description : '[object]'
    : '[object]')).join(' ');
}

function firstFrameUrl(stackTrace) {                                                                                  // MZ
  if (!isObject(stackTrace) || !Array.isArray(stackTrace.callFrames)) return {};
  const [frame] = stackTrace.callFrames;
  return isObject(frame) ? withUrl(stringIn(frame, 'url')) : {};
}

function consoleEntry(params) {                                                                                       // RZ
  if (!isObject(params)) return null;
  return {level: levelOf(stringIn(params, 'type')), message: argumentsText(params.args), timestamp: new Date().toISOString(), ...firstFrameUrl(params.stackTrace)};
}

function exceptionMessage(details, exception) {                                                                       // BZ
  const value = exception?.value;
  return typeof value === 'string' ? value : stringIn(exception ?? {}, 'description') ?? stringIn(details, 'text') ?? 'Uncaught exception';
}

function exceptionEntry(params) {                                                                                     // DZ
  if (!isObject(params) || !isObject(params.exceptionDetails)) return null;
  const exception = isObject(params.exceptionDetails.exception) ? params.exceptionDetails.exception : null;
  return {level: 'error', message: exceptionMessage(params.exceptionDetails, exception), timestamp: new Date().toISOString(),
    ...withUrl(stringIn(params.exceptionDetails, 'url'))};
}

export class DevLogs {
  // `cdp` the session's CdpController.
  constructor(cdp) {
    this.cdp = cdp;
    this.cdp.addTabAttachHandler((tabId, options) => {
      if (!this.runtimeEnablePromises.has(tabId)) return this.ensureRuntimeEnabled(tabId, options);
    });
    this.cdp.on('tabDetached', tabId => {
      this.logsByTabId.delete(tabId);
      this.runtimeEnabledTabIds.delete(tabId);
      this.runtimeEnablePromises.delete(tabId);
    });
    this.cdp.on('event', event => { this.handleCdpEvent(event); });
  }

  cdp;
  logsByTabId = new Map();
  runtimeEnabledTabIds = new Set();
  runtimeEnablePromises = new Map();

  async logs({tabId, filter, levels, limit = DEFAULT_LIMIT}) {
    await this.ensureRuntimeEnabled(tabId);
    const wanted = levels ? new Set(levels) : null;
    return (this.logsByTabId.get(tabId) ?? [])
      .filter(entry => (!filter || entry.message.includes(filter)) && (!wanted || wanted.has(entry.level)))
      .slice(-limit);
  }

  async ensureRuntimeEnabled(tabId, options = {}) {
    if (this.runtimeEnabledTabIds.has(tabId)) return;
    const pending = this.runtimeEnablePromises.get(tabId);
    if (pending) {
      await pending;
      return;
    }
    const enabling = (async () => {
      await this.cdp.call(tabId, 'Runtime.enable', undefined, options);
      this.runtimeEnabledTabIds.add(tabId);
    })();
    this.runtimeEnablePromises.set(tabId, enabling);
    try {
      await enabling;
    } finally {
      this.runtimeEnablePromises.delete(tabId);
    }
  }

  handleCdpEvent(event) {
    const tabId = event.source.tabId;
    if (typeof tabId !== 'number') return;
    const entry = event.method === 'Runtime.consoleAPICalled' ? consoleEntry(event.params)
      : event.method === 'Runtime.exceptionThrown' ? exceptionEntry(event.params) : null;
    if (entry) this.pushLog(tabId, entry);
  }

  pushLog(tabId, entry) {
    const entries = this.logsByTabId.get(tabId) ?? [];
    entries.push(entry);
    if (entries.length > LOG_LIMIT) entries.splice(0, entries.length - LOG_LIMIT);
    this.logsByTabId.set(tabId, entries);
  }
}

export const DEVLOG_HANDLERS = {
  async tab_dev_logs(params, session) {                                                                              // U1
    const tabId = tabIdOf(params.tab_id);
    const logs = await session.dev.logs({tabId, filter: params.filter, levels: params.levels, limit: params.limit});
    return {logs: logs.map(({level, message, timestamp, url}) => ({level, message, timestamp, ...(url == null ? {} : {url})}))};
  },
};
