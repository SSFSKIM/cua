// Ported from readable chatgpt-26.928.40906 BS:65373-65480 (class nh, the documentation builder, and DN); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: kN and IN, RN and Tee (BS:65288-65372, the documents a browser gets and the API reference); Lp and its name
// check (BS:37773-37798); k_ and D_ (BS:66044-66068, the two documentation commands); jee (BS:66560-66570, the
// launch's addendum).
//
// The first-use documentation. A selected browser's documentation is "# Selected Browser" with the browser and the
// service marker `cua browser service <version>` (the parity harness's and the live runners' attestation checks it),
// then the guidance documents its backend type and API members call for (docs-content.mjs: the vendor's where its text
// still holds, and cua's own "cua-browser-service": the Chrome rules, the lifted budgets, evaluate in the page with
// the no-replay rule, the prompts cua does not make, and the errors as the model sees them), the lookup catalogue, its
// capabilities, the API reference generated from the manifest, and the launch's addendum. A document a command requires (requiredFor) must have been
// read, through the browser documentation or by name, before that command runs. Dropped from the vendor: the
// orbit/cloud renames and GaaS instruction overrides, and the Codex app's confirmation-policy override read from the
// request meta.
import {DOCUMENT_MANIFEST, DOCUMENTS} from './docs-content.mjs';
import {CAPABILITY_INFO, unsupportedMembers} from './manifest.mjs';

const DOCUMENT_NAME = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/u;   // Sz

export class Documentation {
  // {apiManifest, disabledMemberIds: Set, serviceVersion, undocumentedApiMembers?, excludedDocumentation?, addendum?,
  // documentManifest?, documents?}
  constructor(options) {
    this.options = {documentManifest: DOCUMENT_MANIFEST, documents: DOCUMENTS, ...options};
  }

  options;
  readNames = new Set();

  async read(name) {
    if (!this.options.documentManifest.some(d => d.name === name)) throw new Error(`Documentation is not available: ${name}`);
    const text = this.readDocument(name);
    this.readNames.add(name);
    return text;
  }

  // `browser` is a selected browser ({id, name, type, capabilities, apiSupportOverrides?}).
  async readBrowser(browser) {
    const {apiManifest, disabledMemberIds, documentManifest, excludedDocumentation, undocumentedApiMembers} = this.options;
    const hidden = unsupportedMembers({apiManifest, browserInfo: browser, disabledMemberIds});
    for (const id of undocumentedApiMembers ?? []) hidden.add(id);
    const selected = selectDocuments(documentManifest, {browserType: browser.type, capabilities: browser.capabilities, disabledApiMembers: hidden});
    const guidance = selected.guidanceNames.filter(name => !excludedDocumentation?.includes(name)).map(name => this.readDocument(name));
    const header = [
      '# Selected Browser',
      `- Name: ${browser.name}`,
      `- Type: ${browser.type}`,
      `- ID: ${browser.id}`,
      `- Service: cua browser service ${this.options.serviceVersion}`,
      'Reuse this browser binding across later turns. A new user turn or tab error does not invalidate it; select another browser only when the browser-selection policy requires it.',
      'If a tab is stale or missing later, obtain or create a fresh tab from this browser; never reselect a browser to recover a tab. Empty tab lists are normal after cleanup and do not invalidate this browser binding.',
    ].join('\n');
    const capabilities = ['# Additional Capabilities', capabilityList('browser', browser.capabilities?.browser), capabilityList('tab', browser.capabilities?.tab)].join('\n');
    const text = [
      header,
      ...guidance,
      selected.lookup.length === 0 ? undefined : [
        '# Additional Documentation',
        'Use `await agent.documentation.get("<name>")` when you need one of these topics:',
        ...selected.lookup.map(({description, name}) => `- \`${name}\`: ${description}`),
      ].join('\n'),
      capabilities,
      apiReference(apiManifest, browser.type, hidden),
      this.options.addendum,
    ].filter(part => part != null).join('\n\n');
    for (const name of selected.guidanceNames) this.readNames.add(name);
    return text;
  }

  assertRequiredDocumentationRead(type) {
    const unread = this.options.documentManifest.filter(({name, requiredFor}) => requiredFor?.includes(type) === true && !this.readNames.has(name)).map(({name}) => name);
    if (unread.length !== 0) {
      throw new Error(`Required documentation has not been read: ${unread.map(n => JSON.stringify(n)).join(', ')}. Read the instructions with ${unread.map(n => `await agent.documentation.get(${JSON.stringify(n)})`).join('; ')}.`);
    }
  }

  // Lp: a relative name without an extension, of a packaged document.
  readDocument(name) {
    if (typeof name !== 'string' || !DOCUMENT_NAME.test(name)) throw new Error('Documentation name must be a relative path without an extension.');
    const text = this.options.documents[name];
    if (typeof text !== 'string') throw new Error(`Documentation is not available: ${name}`);
    return text;
  }
}

// The launch's documentation addendum, when the browser surface is enabled (jee).
export function documentationAddendum(env) {
  if (!env?.CUA_REPL_ENABLED_SURFACES?.split(',').includes('browser')) return undefined;
  const addendum = env.CUA_REPL_BROWSER_DOCUMENTATION_ADDENDUM;
  return addendum?.trim() ? addendum : undefined;
}

// The guidance documents (included) and the lookup catalogue a browser gets (kN).
export function selectDocuments(manifest, {browserType, capabilities, disabledApiMembers}) {
  const browserCaps = new Set(capabilities?.browser?.map(({id}) => id) ?? []);
  const tabCaps = new Set(capabilities?.tab?.map(({id}) => id) ?? []);
  const applies = ({when}) => !(when?.browserTypes?.includes(browserType) === false
    || when?.requiredApiMembers?.some(id => disabledApiMembers.has(id)) === true
    || when?.requiredBrowserCapabilities?.some(id => !browserCaps.has(id)) === true
    || when?.excludedTabCapabilities?.some(id => tabCaps.has(id)) === true
    || when?.requiredTabCapabilities?.some(id => !tabCaps.has(id)) === true);
  const selected = manifest.filter(applies);
  return {
    guidanceNames: selected.flatMap(d => (d.mode === 'included' ? [d.name] : [])),
    lookup: selected.flatMap(d => (d.mode === 'lookup' ? [{description: d.description, name: d.name}] : [])),
  };
}

// "## Browser Capabilities" or "## Tab Capabilities": each announced capability the service knows, with how to read
// its documentation (DN).
function capabilityList(kind, announced) {
  const known = new Map(CAPABILITY_INFO[kind].map(info => [info.id, info]));
  const lines = (announced ?? []).flatMap(({id}) => {
    const info = known.get(id);
    return info == null ? [] : [`- \`${id}\`: ${info.description}\n  Read with \`await (await ${kind}.capabilities.get("${id}")).documentation()\`.`];
  });
  return [`## ${kind === 'browser' ? 'Browser' : 'Tab'} Capabilities`, ...(lines.length === 0 ? ['- None'] : lines)].join('\n');
}

// The declarations of an interface a backend type gets: neither hidden nor undocumented nor unsupported there (RN).
function declarations(iface, members, browserType, hidden) {
  return Object.entries(members).flatMap(([member, definition]) => (hidden.has(`${iface}.${member}`) || definition.documented === false
    ? []
    : definition.declarations.filter(({documented, unsupportedByDefaultIn}) => documented !== false && unsupportedByDefaultIn?.includes(browserType) !== true)));
}

// The API reference: every interface and type reachable from the root through the declarations the browser gets (IN),
// with cua's budget rule (the clamp's lifted maximum, the spec's "Lifted") at its head.
export function apiReference(manifest, browserType, hidden = new Set()) {
  const reached = new Set();
  const queue = [manifest.root];
  for (const name of queue) {
    if (reached.has(name)) continue;
    const iface = manifest.interfaces[name];
    const type = manifest.types[name];
    let references;
    if (iface != null) references = declarations(name, iface, browserType, hidden).flatMap(d => d.references);
    else if (type != null) references = type.references;
    else continue;
    reached.add(name);
    for (const ref of references) if (!reached.has(ref)) queue.push(ref);
  }
  const lines = ['# API Reference', '', 'Use this as the supported `agent.browsers.*` surface.', '', '```ts', '// Returned by setupBrowserRuntime().', '// browser was selected during bootstrap.',
    '// timeoutMs on locator, wait and evaluate calls is a per-phase budget in milliseconds: 3000 by default, at most 120000; 0 makes one attempt of at most 3000.'];
  for (const [name, members] of Object.entries(manifest.interfaces)) {
    if (reached.has(name)) lines.push(`interface ${name} {`, ...declarations(name, members, browserType, hidden).map(({text}) => `  ${text}`), '}', '');
  }
  for (const [name, type] of Object.entries(manifest.types)) if (reached.has(name)) lines.push(type.text, '');
  lines[lines.length - 1] = '```';
  return `${lines.join('\n').trim()}\n`;
}

// The two documentation commands (zN's k_ and D_), dispatched with the runtime of the last setup.
export const DOCUMENTATION_HANDLERS = {
  async get_browser_documentation(params, runtime) {
    const browser = await runtime.context.get(params.browser_id);
    return await runtime.docs.readBrowser(runtime.context.selection(browser));
  },
  async get_documentation(params, runtime) {
    return await runtime.docs.read(params.name);
  },
};
