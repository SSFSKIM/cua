// Ported from readable chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/create_bootstrap_emitter.js:3-104
// (the facade's named document and state output), for docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (M3,
// CoreDocumentation: "Bootstrap writes cua.core, cua.browser.<id>, cua.state in the vendor order"). #120's clean-room
// rewrite replaces this port before distribution.
//
// emit(value, options) writes, in this order and each as its own named output: the core document once (`cua.core`, the
// first time anything is emitted); for a selected browser, the "Other Browser APIs" document before the first browser's
// documentation and each browser's documentation once (`cua.browser.<id>`); then `value` (`cua.state`; JSON unless a
// string) unless options.emit is false, which suppresses only the value, never first-use documentation. Writes are
// serialized in call order. rewrite_documentation() writes the cached core and every emitted browser document again,
// except a document already written for the executing cell's requestMeta object (the identity, not its contents).
// Without nodeRepl.write nothing is written and browser documentation is never fetched.
export function create_bootstrap_emitter(documentation) {
  const browserDocumentation = new Map(); // browserId -> Promise<string>, fetched once
  let core;                               // the core text once emitted
  let coreRequestMeta;                    // the requestMeta the core was last written for
  const emittedBrowsers = new Map();      // browserId -> {text, request_meta}
  let otherBrowserApisEmitted = false;
  let tail = Promise.resolve();

  // Runs `write(nodeRepl.write, requestMeta)` after every earlier one, with the requestMeta current at the call.
  function serialized(write) {
    const nodeRepl = globalThis.nodeRepl;
    const writeOutput = nodeRepl?.write?.bind(nodeRepl);
    if (writeOutput === undefined) return Promise.resolve();
    const requestMeta = nodeRepl == null ? undefined : nodeRepl.requestMeta;
    const run = tail.then(() => write(writeOutput, requestMeta));
    tail = run.catch(() => {});
    return run;
  }

  return {
    async load_browser_documentation(browser) {
      if (globalThis.nodeRepl?.write !== undefined) {
        let loaded = browserDocumentation.get(browser.browserId);
        if (loaded === undefined) {
          loaded = browser.documentation().catch(error => {
            browserDocumentation.delete(browser.browserId);
            throw error;
          });
          browserDocumentation.set(browser.browserId, loaded);
        }
        await loaded;
      }
    },
    emit(value = '', options) {
      return serialized(async (write, requestMeta) => {
        const browser = options == null ? undefined : options.browser;
        let coreText = '';
        let otherBrowserApis = '';
        let browserText = '';
        if (core === undefined) coreText = await documentation.read_core();
        if (browser !== undefined) {
          const loaded = await browserDocumentation.get(browser.browserId);
          if (!otherBrowserApisEmitted) otherBrowserApis = await documentation.read('other-browser-apis');
          if (loaded !== undefined && !emittedBrowsers.has(browser.browserId)) browserText = loaded;
        }
        let state = '';
        if ((options == null ? undefined : options.emit) !== false) state = typeof value == 'string' ? value : JSON.stringify(value);
        if (coreText !== '') {
          await write(coreText, 'cua.core');
          coreRequestMeta = requestMeta;
        }
        if (core == null) core = coreText;
        const browserDocument = [otherBrowserApis, browserText].filter(part => part !== '').join('\n\n');
        if (browser !== undefined && browserDocument !== '') {
          await write(browserDocument, `cua.browser.${browser.browserId}`);
          emittedBrowsers.set(browser.browserId, {text: browserDocument, request_meta: requestMeta});
        }
        if (browser !== undefined) otherBrowserApisEmitted = true;
        if (state !== '') await write(state, 'cua.state');
      });
    },
    rewrite_documentation() {
      return serialized(async (write, requestMeta) => {
        if (!!core && (requestMeta == null || requestMeta !== coreRequestMeta)) {
          await write(core, 'cua.core');
          coreRequestMeta = requestMeta;
        }
        for (const [browserId, emitted] of emittedBrowsers) {
          if (requestMeta == null || requestMeta !== emitted.request_meta) {
            await write(emitted.text, `cua.browser.${browserId}`);
            emitted.request_meta = requestMeta;
          }
        }
      });
    },
  };
}
