// Scenarios for the browser client at its transport seam (./browser-client-harness.mjs): each runs against a service
// double and checks what crossed the seam and what the cell got back. ./browser-client.test.mjs checks them against
// cua's port; ./browser-client-vendor.test.mjs, when the vendor's readable client is at hand, runs them against both and
// requires the same records, except where a scenario names the deliberate difference (`vendorDiffers`).
import assert from 'node:assert/strict';
import {BROWSER, commands} from './browser-client-harness.mjs';

const REJECTED = 'Browser Use rejected this action due to browser security policy. Reason:';
const REJECTED_TAIL = ' The agent must not attempt to achieve the same outcome via workaround, indirect execution, raw CDP or browser commands, alternate browser surfaces, or policy circumvention. Proceed only with a materially safer alternative that does not require this blocked browser action; if none exists, stop and request user input.';
const INVALID_RECOVERY = 'Browser service returned an invalid recovery response';
const RECOVERY = {schema_version: 1, command: 'tab_screenshot', phase: 'command', reason: 'credential_delivery_in_progress', next_action: 'retry_after_credential_delivery'};
const PNG_BASE64 = 'AAECAw==';   // bytes 0, 1, 2, 3
const withTab = {browser: {...BROWSER, apiSupportOverrides: {'Tab.ax': true, 'Tabs.content': true, 'BrowserUser.getTabContext': true}}};
const errorOf = async promise => { try { await promise; return 'resolved'; } catch (error) { return {name: error.name, message: error.message}; } };

export const SCENARIOS = [
  {
    name: 'setup asks the service once, with environment codex-app by default and the caller\'s documentation options',
    run: async agent => Object.keys(agent),
    check(record) {
      assert.deepEqual(record.requests, [{service: 'browser', method: 'setup', params: {environment: 'codex-app'}}]);
      assert.deepEqual(record.result, ['documentation', 'browsers']);
    },
  },
  {
    name: 'setup passes environment, undocumented members and excluded documentation through',
    options: {environment: 'codex-app', undocumentedApiMembers: ['Tab.ax'], excludedDocumentation: ['tab-claiming-chrome']},
    run: async () => null,
    check(record) {
      assert.deepEqual(record.requests[0].params, {environment: 'codex-app', undocumentedApiMembers: ['Tab.ax'], excludedDocumentation: ['tab-claiming-chrome']});
    },
  },
  {
    name: 'without a trusted rpc there is no browser runtime',
    noRpc: true,
    run: async () => null,
    check(record) {
      assert.deepEqual(record.error, {name: 'Error', message: 'Browser use requires a trusted Node REPL browser service'});
    },
  },
  {
    name: 'a command crosses flat ({type, ...payload}); client_timeout_ms rides along only when positive',
    run: async (agent, ctx) => {
      const tab = await ctx.tab('t1');
      await tab.playwright.locator('#a').click({timeoutMs: 1500});
      await tab.playwright.locator('#a').click({timeoutMs: 0});
      await tab.goto('https://example.test/next');
    },
    check(record) {
      assert.deepEqual(record.requests.slice(1).map(r => r.method), ['execute', 'execute', 'execute', 'execute', 'execute']);
      assert.deepEqual(commands(record), [
        {type: 'get_browser', id: 'b1'},
        {type: 'get_tab', browser_id: 'b1', tab_id: 't1'},
        {type: 'playwright_locator_click', browser_id: 'b1', tab_id: 't1', selector: '#a', timeout_ms: 1500, client_timeout_ms: 1500},
        {type: 'playwright_locator_click', browser_id: 'b1', tab_id: 't1', selector: '#a', timeout_ms: 0},
        {type: 'navigate_tab_url', browser_id: 'b1', tab_id: 't1', url: 'https://example.test/next'},
      ]);
    },
  },
  {
    name: 'a command\'s toJSON never validates its payload: what the schema would refuse still crosses',
    run: async (agent, ctx) => {
      const browser = await ctx.browser();
      await browser.tabs.get(42);
      await (await ctx.tab('t1')).cua.click({x: 1, y: 2, button: 'sideways'});
    },
    check(record) {
      assert.deepEqual(commands(record).filter(c => c.type !== 'get_browser'), [
        {type: 'get_tab', browser_id: 'b1', tab_id: 42},
        {type: 'get_tab', browser_id: 'b1', tab_id: 't1'},
        {type: 'cua_click', browser_id: 'b1', tab_id: 't1', x: 1, y: 2, button: 'sideways'},
      ]);
    },
  },
  {
    name: 'side effects are displayed in order, long ones truncated at 100,000 characters, and stripped from the result',
    handle: {get_documentation: {side_effects: ['first', 'x'.repeat(100_005)], value: 'kept', other: 1}},
    run: agent => agent.documentation.get('anything'),
    check(record) {
      assert.deepEqual(record.result, {value: 'kept', other: 1});
      assert.deepEqual(record.displayed, [{type: 'value', value: 'first'}, {type: 'value', value: `${'x'.repeat(100_000)}[truncated 5 chars]`}]);
    },
  },
  {
    name: 'a result that is not a side-effect envelope is returned untouched',
    handle: {get_documentation: {side_effects: 'not a list', value: 1}},
    run: agent => agent.documentation.get('anything'),
    check(record) {
      assert.deepEqual(record.result, {side_effects: 'not a list', value: 1});
      assert.deepEqual(record.displayed, []);
    },
  },
  {
    name: 'an empty service answer is an error',
    handle: {get_documentation: null},
    run: agent => agent.documentation.get('anything'),
    check(record) {
      assert.deepEqual(record.error, {name: 'Error', message: 'transport send returned empty response'});
    },
  },
  {
    name: 'string evaluate is one expression, `return (text);`, after the JSON argument; functions are called with it',
    handle: {playwright_evaluate: params => ({value: params.script.length})},
    run: async (agent, ctx) => {
      const tab = await ctx.tab('t1');
      return [
        await tab.playwright.evaluate('document.title'),
        await tab.playwright.evaluate('arg.n * 2', {n: 2}, {timeoutMs: 700}),
        await tab.playwright.evaluate(arg => arg.n, {n: 1}),
        await tab.playwright.locator('li').evaluate('element.id'),
        await tab.playwright.locator('li').evaluateAll(elements => elements.length, [1]),
        await errorOf(tab.playwright.evaluate('')),
        await errorOf(tab.playwright.evaluate(5)),
        await errorOf(tab.playwright.evaluate('arg', {big: 1n})),
        await errorOf(tab.playwright.locator('li').evaluateAll('')),
      ];
    },
    check(record) {
      const evaluated = commands(record).filter(c => c.type === 'playwright_evaluate');
      assert.deepEqual(evaluated, [
        {type: 'playwright_evaluate', browser_id: 'b1', script: 'const arg = undefined;\nreturn (document.title);', tab_id: 't1'},
        {type: 'playwright_evaluate', browser_id: 'b1', script: 'const arg = {"n":2};\nreturn (arg.n * 2);', tab_id: 't1', timeout_ms: 700, client_timeout_ms: 700},
        {type: 'playwright_evaluate', browser_id: 'b1', script: 'const arg = {"n":1};\nconst __playwrightEvaluate = (arg => arg.n);\nreturn await __playwrightEvaluate(arg);', tab_id: 't1'},
        {type: 'playwright_evaluate', browser_id: 'b1', script: 'const arg = undefined;\nreturn (element.id);', selector: 'li', tab_id: 't1'},
        {type: 'playwright_evaluate', browser_id: 'b1', script: 'const arg = [1];\nconst __playwrightEvaluate = (elements => elements.length);\nreturn await __playwrightEvaluate(elements, arg);', selector: 'li', selector_mode: 'all', tab_id: 't1'},
      ]);
      assert.deepEqual(record.result.slice(5), [
        {name: 'Error', message: 'playwright.evaluate requires a pageFunction'},
        {name: 'Error', message: 'playwright.evaluate requires a string or function'},
        {name: 'Error', message: 'Do not know how to serialize a BigInt\nplaywright.evaluate arg must be JSON-serializable'},
        {name: 'Error', message: 'locator.evaluateAll requires a pageFunction'},
      ]);
    },
  },
  {
    name: 'with credentialRecoveryErrorVersion 1 commands go through executeWithRecovery and an ok answer is its value',
    setup: {credentialRecoveryErrorVersion: 1},
    handle: (params, method) => ({ok: true, value: {method, type: params.type}}),
    run: agent => agent.documentation.get('anything'),
    check(record) {
      assert.equal(record.requests[1].method, 'executeWithRecovery');
      assert.deepEqual(record.result, {method: 'executeWithRecovery', type: 'get_documentation'});
    },
  },
  {
    name: 'a valid recovery envelope becomes a BrowserCredentialRecoveryError with the vendor\'s sentence',
    setup: {credentialRecoveryErrorVersion: 1},
    handle: params => (params.name === 'security'
      ? {ok: false, error: {schema_version: 1, command: 'tab_ax_get_state', phase: 'before_command', reason: 'browser_security_restricted', next_action: 'stop', security_reason: 'user_declined'}}
      : {ok: false, error: RECOVERY}),
    run: async agent => [await errorOf(agent.documentation.get('plain')), await errorOf(agent.documentation.get('security'))],
    check(record) {
      assert.deepEqual(record.result, [
        {name: 'BrowserCredentialRecoveryError', message: 'Browser observation is unavailable while credential delivery is in progress. Wait for credential delivery to finish, then retry the command. Recovery v1: command=tab_screenshot, phase=command, reason=credential_delivery_in_progress, next_action=retry_after_credential_delivery.'},
        {name: 'BrowserCredentialRecoveryError', message: `${REJECTED} The user declined permission for this action. ${REJECTED_TAIL} Stop this browser action and report the failure. Recovery v1: command=tab_ax_get_state, phase=before_command, reason=browser_security_restricted, next_action=stop.`},
      ]);
    },
  },
  {
    name: 'any other recovery answer is refused with the exact invalid-response sentence',
    setup: {credentialRecoveryErrorVersion: 1},
    handle: params => ({
      missing: {ok: false},
      version: {ok: false, error: {...RECOVERY, schema_version: 2}},
      command: {ok: false, error: {...RECOVERY, command: 'Tab-Screenshot'}},
      phase: {ok: false, error: {...RECOVERY, phase: 'later'}},
      pair: {ok: false, error: {...RECOVERY, next_action: 'stop'}},
      extra: {ok: false, error: {...RECOVERY, security_reason: 'user_declined'}},
      unknownSecurity: {ok: false, error: {...RECOVERY, reason: 'browser_security_restricted', next_action: 'stop', security_reason: 'no_such_reason'}},
      retryability: {ok: false, error: {...RECOVERY, reason: 'browser_security_unavailable', next_action: 'retry_after_resolution', security_reason: 'user_declined'}},
      neither: {value: 1},
      nothing: null,
    })[params.name],
    run: async agent => {
      const out = [];
      for (const name of ['missing', 'version', 'command', 'phase', 'pair', 'extra', 'unknownSecurity', 'retryability', 'neither', 'nothing']) out.push(await errorOf(agent.documentation.get(name)));
      return out;
    },
    check(record) {
      assert.deepEqual(record.result, Array(10).fill({name: 'Error', message: INVALID_RECOVERY}));
    },
  },
  {
    name: 'without a recovery version, a service\'s rejection reaches the cell unchanged',
    handle: () => { throw new Error(`${REJECTED} The user declined permission for this action. ${REJECTED_TAIL}`); },
    run: agent => agent.documentation.get('anything'),
    check(record) {
      assert.equal(record.requests[1].method, 'execute');
      assert.deepEqual(record.error, {name: 'Error', message: `${REJECTED} The user declined permission for this action. ${REJECTED_TAIL}`});
    },
  },
  {
    name: 'CUA_REPL_BROWSER_ENV=orbit rewrites nothing on cua\'s client (Table 2: the Orbit-only rewriting is dropped)',
    env: {CUA_REPL_BROWSER_ENV: 'orbit'},
    handle: () => { throw new Error(`${REJECTED} The user declined permission for this action. ${REJECTED_TAIL}`); },
    run: agent => agent.documentation.get('anything'),
    check(record) {
      assert.deepEqual(record.error, {name: 'Error', message: `${REJECTED} The user declined permission for this action. ${REJECTED_TAIL}`});
    },
    vendorDiffers: 'the vendor rewrites the security tail under orbit (browser-client.js:10285-10308); Table 2 drops it',
  },
  {
    name: 'locators compose selectors as Playwright does and refuse another tab\'s locator',
    run: async (agent, ctx) => {
      const tab = await ctx.tab('t1');
      const other = await ctx.tab('t2');
      const pw = tab.playwright;
      await pw.getByRole('button', {name: 'Go "now"', exact: true}).click();
      await pw.getByText(/a"b>>c/i).click();
      await pw.getByLabel('Email').click();
      await pw.getByPlaceholder('Search', {exact: true}).click();
      await pw.getByTestId('save').click();
      await pw.locator('ul').filter({hasText: 'x', hasNotText: /y/, has: pw.locator('li'), visible: true}).click();
      await pw.locator('a').and(pw.locator('b')).or(pw.locator('c')).first().click();
      await pw.frameLocator('iframe').getByRole('link').nth(2).click();
      return [
        await errorOf(Promise.resolve().then(() => pw.locator('a').and(other.playwright.locator('a')))),
        await errorOf(Promise.resolve().then(() => pw.locator('a').filter({has: other.playwright.locator('a')}))),
        await errorOf(Promise.resolve().then(() => pw.locator('a').and('a'))),
        await errorOf(Promise.resolve().then(() => pw.locator('a').filter({visible: 'yes'}))),
      ];
    },
    check(record) {
      assert.deepEqual(commands(record).filter(c => c.type === 'playwright_locator_click').map(c => c.selector), [
        'internal:role=button[name="Go \\"now\\""s]',
        'internal:text=/a\\\\"b\\>\\>c/i',
        'internal:label="Email"i',
        'internal:attr=[placeholder="Search"s]',
        'internal:testid=[data-testid="save"s]',
        'ul >> internal:has-text="x"i >> internal:has-not-text=/y/ >> internal:has="li" >> visible=true',
        'a >> internal:and="b" >> internal:or="c" >> nth=0',
        'iframe >> internal:control=enter-frame >> internal:role=link >> nth=2',
      ]);
      assert.deepEqual(record.result, [
        {name: 'Error', message: 'Locators must belong to the same tab'},
        {name: 'Error', message: 'Locators must belong to the same tab'},
        {name: 'Error', message: 'locator.and requires a PlaywrightLocator'},
        {name: 'Error', message: 'locator.filter visible must be a boolean'},
      ]);
    },
  },
  {
    name: 'a failed locator action asks for diagnostics (evaluateAll, 1,000 ms) and appends them to the error',
    handle: {
      playwright_locator_click: params => { throw new Error(params.selector === 'b' ? 'boom b' : 'Timeout 3000ms exceeded'); },
      playwright_evaluate: params => {
        if (params.selector === 'b') throw new Error('diagnostics failed');
        return {value: {matchCount: 7, visibleCount: 0, matches: [{tag: 'button', role: null, type: null, ariaLabel: null, text: 'Go', visible: false, disabled: false}]}};
      },
    },
    run: async (agent, ctx) => {
      const tab = await ctx.tab('t1');
      return [await errorOf(tab.playwright.locator('a').click()), await errorOf(tab.playwright.locator('b').click())];
    },
    check(record) {
      const diagnostics = commands(record).filter(c => c.type === 'playwright_evaluate');
      assert.equal(diagnostics.length, 2);
      assert.deepEqual({...diagnostics[0], script: undefined}, {type: 'playwright_evaluate', browser_id: 'b1', selector: 'a', selector_mode: 'all', tab_id: 't1', timeout_ms: 1000, client_timeout_ms: 1000, script: undefined});
      assert.match(diagnostics[0].script, /^const arg = undefined;\nconst __playwrightEvaluate = \(\(e\) => \(\{\n {10}matchCount: e\.length,/);
      assert.deepEqual(record.result, [
        {name: 'Error', message: `Timeout 3000ms exceeded\nwaiting on click for selector a\nLocator diagnostics: ${JSON.stringify({kind: 'no_visible_match', action: 'click', locator: 'a', matchCount: 7, visibleCount: 0,
          matches: [{tag: 'button', role: null, type: null, ariaLabel: null, text: 'Go', visible: false, disabled: false}], truncated: true})}`},
        {name: 'Error', message: 'boom b\nwaiting on click for selector b'},
      ]);
    },
  },
  {
    name: 'a collection\'s items read through one cached read per relative selector; a local action clears it; a failed read is not cached',
    makeHandle: () => {
      let reads = 0;
      return browserDoubleWith({
        playwright_locator_count: {count: 2},
        playwright_locator_read_all: params => {
          reads++;
          if (params.relative_selector === 'em' && reads <= 3) throw new Error('read failed');
          return {values: [
            {attributes: {href: '/one'}, inner_text: `one-${reads}`, text_content: `One ${reads}`},
            {attributes: {}, inner_text: `two-${reads}`, text_content: null},
          ]};
        },
      });
    },
    run: async (agent, ctx) => {
      const items = await (await ctx.tab('t1')).playwright.locator('li').all();
      return [
        await items[0].textContent(), await items[1].innerText(), await items[0].getAttribute('href'), await items[1].getAttribute('href'),
        await items[1].locator('span').textContent(), await items[0].locator('span').innerText(),
        await errorOf(items[0].locator('em').textContent()),
        await items[1].locator('em').innerText(),
        await items[0].click().then(() => 'clicked'),
        await items[1].textContent(),
      ];
    },
    check(record) {
      const reads = commands(record).filter(c => c.type === 'playwright_locator_read_all');
      assert.deepEqual(reads.map(c => [c.selector, c.relative_selector]), [['li', undefined], ['li', 'span'], ['li', 'em'], ['li', 'em'], ['li', undefined]],
        'the failed em read is retried with a new read before anything clears the cache');
      assert.deepEqual(commands(record).filter(c => c.type === 'playwright_locator_click').map(c => c.selector), ['li >> nth=0']);
      assert.deepEqual(record.result, ['One 1', 'two-1', '/one', null, null, 'one-2', {name: 'Error', message: 'read failed'}, 'two-4', 'clicked', null]);
    },
  },
  {
    name: 'API views hide unsupported and disabled members from get, in, keys and descriptors, per browser; overrides grant them; methods keep their identity',
    setup: {disabledMemberIds: ['Tab.dev']},
    run: async (agent, ctx) => {
      const tab = await ctx.tab('t1');
      const granted = await (await agent.browsers.get('b2')).tabs.get('t3');
      const facts = member => ({get: tab[member] === undefined, in: member in tab, keys: Object.keys(tab).includes(member), descriptor: Object.getOwnPropertyDescriptor(tab, member) === undefined});
      return {
        ax: facts('ax'), dev: facts('dev'), playwright: facts('playwright'),
        handoff: 'requestManualHandoff' in tab,
        grantedAx: 'ax' in granted && typeof granted.ax.get === 'function', grantedDev: 'dev' in granted,
        content: 'content' in (await ctx.browser()).tabs,
        sameMethod: tab.goto === tab.goto,
        keys: Object.keys(tab).sort(),
        decorated: ctx.decorated.length, decoratedIsView: ctx.decorated[0] === tab,
      };
    },
    handle: {get_browser: params => ({...BROWSER, id: params.id, ...(params.id === 'b2' ? {apiSupportOverrides: {'Tab.ax': true, 'Tab.dev': true}} : {})})},
    check(record) {
      assert.deepEqual(record.result, {
        ax: {get: true, in: false, keys: false, descriptor: true},
        dev: {get: true, in: false, keys: false, descriptor: true},
        playwright: {get: false, in: true, keys: true, descriptor: false},
        handoff: false, grantedAx: true, grantedDev: false, content: false, sameMethod: true,
        keys: ['capabilities', 'clipboard', 'content', 'cua', 'dom_cua', 'id', 'playwright'],
        decorated: 2, decoratedIsView: true,
      });
    },
  },
  {
    name: 'the agent itself is a view: a disabled agent member is absent',
    setup: {disabledMemberIds: ['Agent.documentation']},
    run: async agent => ({documentation: agent.documentation, in: 'documentation' in agent, keys: Object.keys(agent)}),
    check(record) {
      assert.deepEqual(record.result, {documentation: undefined, in: false, keys: ['browsers']});
    },
  },
  {
    name: 'a manifest interface the client has no type for is refused',
    setup: {apiManifest: {root: 'Agent', interfaces: {Agent: {}, Nope: {}}, types: {}}},
    run: async () => null,
    check(record) {
      assert.deepEqual(record.error, {name: 'Error', message: 'Browser API interface has no runtime type: Nope'});
    },
  },
  {
    name: 'screenshots are bytes: tab.screenshot maps a clip, ax.get decodes, ax.write displays state then the image',
    ...withTab,
    handle: {
      tab_screenshot: {data: PNG_BASE64},
      tab_ax_get_state: params => (params.content === 'axStateAndScreenshot' && params.disable_diffing ? {state: 'S', screenshot_unavailable: 'no screen'} : {state: 'S', data: PNG_BASE64}),
    },
    run: async (agent, ctx) => {
      const tab = await ctx.tab('t1');
      return [
        await tab.screenshot({clip: {x: 1, y: 2, width: 3, height: 4}, fullPage: false}),
        await errorOf(tab.screenshot({clip: {x: 1}})),
        await tab.ax.get('screenshot'),
        await tab.ax.get('both'),
        await tab.ax.get('both', {disableDiffing: true}),
        await tab.ax.write('both'),
      ];
    },
    check(record) {
      assert.deepEqual(commands(record).find(c => c.type === 'tab_screenshot'), {type: 'tab_screenshot', browser_id: 'b1', tab_id: 't1', fullPage: false, cropX: 1, cropY: 2, cropWidth: 3, cropHeight: 4});
      assert.deepEqual(record.result, [
        {uint8: [0, 1, 2, 3]},
        {name: 'Error', message: 'tab.screenshot clip requires x, y, width, and height'},
        {uint8: [0, 1, 2, 3]},
        {state: 'S', screenshot: {uint8: [0, 1, 2, 3]}},
        {state: 'S'},
        undefined,
      ]);
      assert.deepEqual(record.displayed, [{type: 'value', value: 'S'}]);
      assert.deepEqual(record.images, [[0, 1, 2, 3]]);
    },
  },
  {
    name: 'a DOM-only tab\'s snapshot is the service\'s dom_snapshot string',
    handle: {playwright_dom_snapshot: {dom_snapshot: '- button "Go"'}},
    run: async (agent, ctx) => (await ctx.tab('t1')).playwright.domSnapshot(),
    check(record) {
      assert.equal(record.result, '- button "Go"');
    },
  },
  {
    name: 'parse site: tabs.content validates its request before sending, and an empty url list sends nothing',
    ...withTab,
    handle: {tabs_content: {results: [{url: 'https://a.test/', title: null, content: 'A', extra: true}]}},
    run: async (agent, ctx) => {
      const tabs = (await ctx.browser()).tabs;
      return [
        await errorOf(tabs.content({urls: ['https://a.test/'], contentType: 'markdown'})),
        await tabs.content({urls: [], contentType: 'text'}),
        await tabs.content({urls: ['https://a.test/'], contentType: 'text', timeoutMs: 900}),
      ];
    },
    check(record) {
      assert.deepEqual(commands(record).filter(c => c.type === 'tabs_content'), [{type: 'tabs_content', browser_id: 'b1', urls: ['https://a.test/'], content_type: 'text', timeout_ms: 900}]);
      assert.equal(record.result[0].name, 'ZodError');
      assert.deepEqual(JSON.parse(record.result[0].message).map(issue => [issue.code, issue.path, issue.message]),
        [['invalid_enum_value', ['content_type'], 'Invalid enum value. Expected \'html\' | \'text\' | \'domSnapshot\', received \'markdown\'']]);
      assert.deepEqual(record.result.slice(1), [[], [{url: 'https://a.test/', title: null, content: 'A', extra: true}]]);
    },
  },
  {
    name: 'parse site: DOM node ids are checked with the schema\'s own messages',
    run: async (agent, ctx) => {
      const dom = (await ctx.tab('t1')).dom_cua;
      return [
        await errorOf(dom.click({})), await errorOf(dom.click({node_id: 7})), await errorOf(dom.click({node_id: ''})),
        await errorOf(dom.scroll({node_id: 3, x: 0, y: 1})), await dom.click({node_id: 'n1'}),
      ];
    },
    check(record) {
      assert.deepEqual(record.result, [
        {name: 'Error', message: 'dom_cua.click requires a node_id'},
        {name: 'Error', message: 'dom_cua.click node_id must be a string'},
        {name: 'Error', message: 'dom_cua.click node_id must not be empty'},
        {name: 'Error', message: 'dom_cua.scroll node_id must be a string'},
        undefined,
      ]);
      assert.deepEqual(commands(record).filter(c => c.type.startsWith('dom_cua')), [{type: 'dom_cua_click', browser_id: 'b1', tab_id: 't1', node_id: 'n1'}]);
    },
  },
  {
    name: 'parse sites: botDetection validates its report and its result; the result is the parsed value',
    browser: {...BROWSER, capabilities: {browser: [], tab: [{id: 'botDetection', description: 'd'}]}},
    handle: {tab_bot_detection_report: params => (params.reason === 'access_denied' ? {status: 'reported', hostname: 'a.test', extra: 1} : {status: 'queued', hostname: null})},
    run: async (agent, ctx) => {
      const capability = await (await ctx.tab('t1')).capabilities.get('botDetection');
      return [
        await capability.list?.(), await errorOf(capability.report({reason: 'nope'})), await capability.report({reason: 'access_denied'}),
        await errorOf(capability.report({reason: 'captcha_failed'})), await (await ctx.tab('t1')).capabilities.list(),
      ];
    },
    check(record) {
      const reports = commands(record).filter(c => c.type === 'tab_bot_detection_report');
      assert.deepEqual(reports.map(c => c.reason), ['access_denied', 'captcha_failed'], 'an invalid reason never left the client');
      assert.equal(record.result[1].name, 'ZodError');
      assert.deepEqual(record.result[2], {status: 'reported', hostname: 'a.test'}, 'unknown result keys are stripped');
      assert.equal(record.result[3].name, 'ZodError');
      assert.deepEqual(record.result[4], [{id: 'botDetection', description: 'Use when the current tab is blocked by bot detection, a failed CAPTCHA, a hard access denial, or a repeated challenge/login loop.'}],
        'a listed capability carries the client\'s own description, not the advertised one');
    },
  },
  {
    name: 'parse sites: browserAuth validates its request locally (refinements, limits, same-tab locators) and its result',
    browser: {...BROWSER, capabilities: {browser: [], tab: [{id: 'browserAuth', description: 'd'}]}},
    handle: {tab_browser_auth_handoff: {status: 'submitted', selected_option: 'pw', extra: 'dropped'}},
    run: async (agent, ctx) => {
      const tab = await ctx.tab('t1');
      const other = await ctx.tab('t2');
      const auth = await tab.capabilities.get('browserAuth');
      const field = {id: 'user', label: 'User', type: 'text', required: true, selector: tab.playwright.locator('#user')};
      return [
        await errorOf(auth.request({origin: 'https://a.test', fields: []})),
        await errorOf(auth.request({origin: 'https://a.test', fields: [{...field, id: '__proto__'}]})),
        await errorOf(auth.request({origin: 'https://a.test', fields: [{...field, selector: other.playwright.locator('#user')}]})),
        await errorOf(auth.request({origin: 'https://a.test', fields: [{...field, selector: 5}]})),
        await auth.request({origin: 'https://a.test', fields: [field], submit: {action: 'click', selector: '#go'}, otpHandle: 'h'}),
      ];
    },
    check(record) {
      const sent = commands(record).filter(c => c.type === 'tab_browser_auth_handoff');
      assert.deepEqual(sent, [{type: 'tab_browser_auth_handoff', browser_id: 'b1', tab_id: 't1', origin: 'https://a.test', otpHandle: 'h',
        fields: [{id: 'user', label: 'User', type: 'text', required: true, selector: '#user'}], submit: {action: 'click', selector: '#go'}}]);
      assert.equal(record.result[0].name, 'ZodError');
      assert.match(record.result[0].message, /browser auth requests require credential fields, sign-in options, or a QR code/);
      assert.equal(record.result[1].name, 'ZodError');
      assert.deepEqual(record.result.slice(2, 4), [
        {name: 'Error', message: 'browserAuth selector locator must belong to this tab'},
        {name: 'Error', message: 'browserAuth selector must be a string or PlaywrightLocator'},
      ]);
      assert.deepEqual(record.result[4], {status: 'submitted', selected_option: 'pw'});
    },
  },
  {
    name: 'parse site: a user tab\'s context is validated, and a document\'s bytes are decoded',
    ...withTab,
    handle: {browser_user_get_tab_context: params => (params.tab_id === 'doc'
      ? {kind: 'document', dataBase64: PNG_BASE64, fileName: 'f.pdf', mimeType: 'application/pdf', title: 'T', url: 'https://a.test/f.pdf'}
      : params.tab_id === 'text' ? {kind: 'text', text: 'hello', title: 'T', truncated: false, url: 'https://a.test/', extra: 1} : {kind: 'image'})},
    run: async (agent, ctx) => {
      const user = (await ctx.browser()).user;
      return [await user.getTabContext({id: 'doc'}), await user.getTabContext('text'), await errorOf(user.getTabContext('bad')), await errorOf(user.getTabContext(''))];
    },
    check(record) {
      assert.deepEqual(record.result[0], {data: {uint8: [0, 1, 2, 3]}, fileName: 'f.pdf', kind: 'document', mimeType: 'application/pdf', title: 'T', url: 'https://a.test/f.pdf'});
      assert.deepEqual(record.result[1], {kind: 'text', text: 'hello', title: 'T', truncated: false, url: 'https://a.test/'});
      assert.equal(record.result[2].name, 'ZodError');
      assert.deepEqual(record.result[3], {name: 'Error', message: 'browser.user.getTabContext received an empty tab id'});
    },
  },
  {
    name: 'parse sites: CDP results (any value for send; a checked event page), page assets, WebMCP tools',
    browser: {...BROWSER, capabilities: {browser: [], tab: [{id: 'cdp', description: 'd'}, {id: 'pageAssets', description: 'd'}, {id: 'webmcp', description: 'd'}]}},
    handle: {
      tab_cdp_call: {anything: [1, 2]},
      tab_cdp_events: params => (params.limit === 1 ? {cursor: -1, events: [], hasMore: false, truncated: false} : {cursor: 3, events: [{sequence: 1, source: {tabId: 9}, method: 'Page.loadEventFired'}], hasMore: false, truncated: false}),
      tab_page_assets_list: {assets: [], id: 'inv', inlineSvgs: [], pageUrl: null, summary: {byKind: {}, inlineSvgCount: 0, totalCount: 0}},
      webmcp_list_tools: {tools: [{name: 'search', call_name: 'search_1', registration_id: 'r1', description: 'Search', input_schema: {type: 'object'}}]},
      webmcp_invoke_tool: params => ({result: {echo: params.input}}),
    },
    run: async (agent, ctx) => {
      const tab = await ctx.tab('t1');
      const cdp = await tab.capabilities.get('cdp');
      const assets = await tab.capabilities.get('pageAssets');
      const tools = await (await tab.capabilities.get('webmcp')).fetchTools();
      return [
        await cdp.send('Runtime.evaluate', {expression: '1'}, {target: {sessionId: 's'}, timeoutMs: 400}),
        await cdp.readEvents({methods: ['Page.loadEventFired'], timeoutMs: 100}),
        await errorOf(cdp.readEvents({limit: 1})),
        await assets.list(),
        tools.description(),
        await tools.call(' search_1 ', {q: 'x'}, {timeoutMs: 50}),
        await errorOf(tools.call('search', {})),
        Object.isFrozen(tools),
      ];
    },
    check(record) {
      const sent = commands(record);
      assert.deepEqual(sent.find(c => c.type === 'tab_cdp_call'), {type: 'tab_cdp_call', browser_id: 'b1', method: 'Runtime.evaluate', params: {expression: '1'}, tab_id: 't1', target: {session_id: 's'}, timeout_ms: 400, client_timeout_ms: 400});
      assert.deepEqual(sent.find(c => c.type === 'tab_cdp_events'), {type: 'tab_cdp_events', browser_id: 'b1', methods: ['Page.loadEventFired'], tab_id: 't1', timeout_ms: 100, client_timeout_ms: 2100});
      assert.deepEqual(sent.find(c => c.type === 'webmcp_invoke_tool'), {type: 'webmcp_invoke_tool', browser_id: 'b1', tab_id: 't1', tool_name: 'search', tool_description: 'Search', registration_id: 'r1', input: {q: 'x'}, timeout_ms: 50});
      assert.deepEqual(record.result[0], {anything: [1, 2]});
      assert.deepEqual(record.result[1], {cursor: 3, events: [{sequence: 1, source: {tabId: 9}, method: 'Page.loadEventFired'}], hasMore: false, truncated: false});
      assert.equal(record.result[2].name, 'ZodError');
      assert.equal(record.result[3].id, 'inv');
      assert.equal(record.result[4], 'WebMCP tools available in this document:\n[\n  {\n    "name": "search_1",\n    "description": "Search",\n    "inputSchema": {\n      "type": "object"\n    }\n  }\n]\nCall tools.call(name, input) to invoke one.');
      assert.deepEqual(record.result.slice(5), [{echo: {q: 'x'}}, {name: 'Error', message: 'WebMCP tool "search" is not available in this snapshot. Call fetchTools() again.'}, true]);
    },
  },
  {
    name: 'parse sites: management, visibility and viewport results',
    browser: {...BROWSER, capabilities: {browser: [{id: 'management', description: 'd'}, {id: 'visibility', description: 'd'}, {id: 'viewport', description: 'd'}], tab: []}},
    handle: {
      browser_management_call: params => (params.method === 'bad' ? 'not an object' : {value: {namespace: params.namespace, method: params.method, args: params.args}}),
      browser_management_get_audit_trail: {changes: [{args: [], method: 'create', namespace: 'tabs', createdAt: 1, before: {}}]},
      browser_visibility_get: {visible: 'yes'},
      browser_visibility_set: {},
      browser_viewport_set: {ignored: 1},
      browser_viewport_reset: [],
    },
    run: async (agent, ctx) => {
      const capabilities = (await ctx.browser()).capabilities;
      const management = await capabilities.get('management');
      const visibility = await capabilities.get('visibility');
      const viewport = await capabilities.get('viewport');
      return [
        await management.windows.getAll({populate: true}),
        await management.bookmarks.then,
        await errorOf(management.tabs.bad()),
        await management.getAuditTrail(),
        await errorOf(visibility.get()),
        await visibility.set(true),
        await viewport.set({width: 800, height: 600}),
        await errorOf(viewport.reset()),
        await capabilities.list(),
        await errorOf(capabilities.get('nope')),
      ];
    },
    check(record) {
      assert.deepEqual(commands(record).find(c => c.type === 'browser_management_call'), {type: 'browser_management_call', args: [{populate: true}], browser_id: 'b1', method: 'getAll', namespace: 'windows'});
      assert.deepEqual(record.result[0], {namespace: 'windows', method: 'getAll', args: [{populate: true}]});
      assert.equal(record.result[1], undefined, 'then is never a management method, so the namespace is not thenable');
      assert.equal(record.result[2].name, 'ZodError');
      assert.deepEqual(record.result[3], {changes: [{args: [], method: 'create', namespace: 'tabs', createdAt: 1, before: {}}]});
      assert.equal(record.result[4].name, 'ZodError');
      assert.deepEqual(record.result.slice(5, 7), [undefined, undefined]);
      assert.equal(record.result[7].name, 'ZodError');
      assert.deepEqual(record.result[8].map(c => c.id), ['management', 'visibility', 'viewport']);
      assert.deepEqual(record.result[9], {name: 'Error', message: 'Capability is not available: nope'});
    },
  },
  {
    name: 'browser inventory, history and names: arguments checked locally with the vendor\'s sentences',
    browser: {...BROWSER, type: 'extension'},
    handle: {list_browsers: [BROWSER], browser_user_history: {items: [{url: 'https://a.test/'}]}},
    run: async (agent, ctx) => {
      const browser = await ctx.browser();
      return [
        await agent.browsers.list(),
        await errorOf(agent.browsers.get('')),
        await browser.history({queries: ['a'], limit: 2, from: '2026-01-01T00:00:00Z', to: new Date(0)}),
        await errorOf(browser.history({limit: 0})),
        await errorOf(browser.history({queries: []})),
        await errorOf(browser.history({from: 'not a date'})),
        await errorOf(browser.history(null)),
        await errorOf(browser.nameSession('  ')),
        await browser.nameSession('  Research  '),
        browser.browserId,
      ];
    },
    check(record) {
      assert.deepEqual(commands(record).find(c => c.type === 'browser_user_history'), {type: 'browser_user_history', browser_id: 'b1', queries: ['a'], limit: 2, from: '2026-01-01T00:00:00.000Z', to: '1970-01-01T00:00:00.000Z'});
      assert.deepEqual(commands(record).find(c => c.type === 'name_session'), {type: 'name_session', browser_id: 'b1', name: 'Research'});
      assert.deepEqual(record.result.slice(1), [
        {name: 'Error', message: 'browsers.get requires a browser id'},
        [{url: 'https://a.test/'}],
        {name: 'Error', message: 'browser.history received an invalid limit'},
        {name: 'Error', message: 'browser.history received invalid queries'},
        {name: 'Error', message: 'browser.history received an invalid from date'},
        {name: 'Error', message: 'browser.history expects an options object'},
        {name: 'Error', message: 'browser.nameSession requires a name'},
        undefined,
        'b1',
      ]);
    },
  },
];

function browserDoubleWith(overrides) {
  return params => {
    if (overrides[params.type] !== undefined) return typeof overrides[params.type] === 'function' ? overrides[params.type](params) : overrides[params.type];
    if (params.type === 'get_browser') return {...BROWSER, id: params.id};
    if (params.type === 'get_tab') return {id: params.tab_id};
    return {};
  };
}
