// Layer (a) of the M7 spike: deterministic wire scenarios over a real owned Unix socket, the prototype adapter and
// the fake extension. Each scenario cites the source it reproduces and returns PASS/FAIL with metadata-only checks.
import {join} from 'node:path';
import {encodeFrame, frameDecoder, hostEndianness, HEADER_BYTES} from './frame.mjs';
import {NO_HANDLER, backendInfo} from './adapter.mjs';
import {startFixture, connectClient, settle} from './fixture.mjs';

const SESSION = {session_id: 'm7-session', turn_id: 'm7-turn', session_context: 'live'};
const BG = 'extension 0.4.0 lib/background.mjs';
const BS = 'browser-desktop 0.1.1 scripts/browser-service.mjs';

async function attempt(promise) {
  try { return {ok: true, value: await promise}; } catch (error) { return {ok: false, code: error.code, message: error.message}; }
}

function scenario(id, title, sources, body) {
  return {id, title, sources, async run(ctx) {
    const checks = [];
    const check = (name, pass, detail) => checks.push({name, pass: Boolean(pass), ...(detail === undefined ? {} : {detail})});
    let error = null;
    try { await body({...ctx, check}); } catch (e) { error = e.message; }
    const status = !error && checks.length && checks.every(c => c.pass) ? 'PASS' : 'FAIL';
    return {id, title, status, sources, checks, ...(error ? {error} : {})};
  }};
}

// Each scenario gets its own backend socket and fake extension with one offered, attached-ready user tab.
async function withFixture(ctx, opts, fn) {
  const fixture = await startFixture({kind: 'extension', socketPath: join(ctx.dir, `${opts.name}.sock`), sentinels: ctx.sentinels, ...opts});
  const client = await connectClient(join(ctx.dir, `${opts.name}.sock`));
  try { return await fn({...fixture, client}); } finally {
    client.close();
    await fixture.close();
    ctx.captures?.push(JSON.stringify(fixture.backend.frames), JSON.stringify(fixture.adapter.events), JSON.stringify(client.notifications));
  }
}

const attachedCount = (extension, tabId) => extension.commands.filter(c => c.method === 'chrome.debugger.attach' && c.debuggee?.tabId === tabId).length;

export const SCENARIOS = [
  scenario('framing', 'CUA backend frames: u32 host-endian length + UTF-8 JSON, chunk-split and coalesced',
    [`${BS}:66712-66841`, `${BS}:66667-66688`], async ({check, dir, sentinels, captures}) => {
      check('host is little-endian (frames are UInt32LE)', hostEndianness() === 'LE');
      const a = encodeFrame({jsonrpc: '2.0', id: 1, method: 'getInfo', params: {}});
      const b = encodeFrame({jsonrpc: '2.0', method: 'onCDPEvent', params: {s: 'é✓'}});
      check('length prefix counts UTF-8 bytes', b.readUInt32LE(0) === b.length - HEADER_BYTES);
      const push = frameDecoder();
      const byteByByte = [...Buffer.concat([a, b])].flatMap(byte => push(Buffer.from([byte])));
      check('one-byte chunks reassemble both frames', byteByByte.length === 2 && byteByByte[1].params.s === 'é✓');
      check('two frames in one chunk decode in order', frameDecoder()(Buffer.concat([a, b])).map(m => m.id ?? m.method).join() === '1,onCDPEvent');
      const oversize = Buffer.alloc(4); oversize.writeUInt32LE(1025, 0);
      let rejected = false; try { frameDecoder(1024)(oversize); } catch (e) { rejected = e.message === 'native pipe frame exceeds limit'; }
      check('declared length over the limit is rejected with the vendor message', rejected);
      await withFixture({dir, sentinels, captures}, {name: 'framing'}, async ({client}) => {
        const info = await client.request('getInfo', {});
        check('getInfo round-trips over the owned socket', info.type === 'extension');
      });
    }),

  scenario('offer-before-initialized', 'the selected tab is offered before extension.initialized; requests wait for it',
    [`${BG}:56-72`, `${BG}:361-375`, `${BS}:68061-68110`], async ({check, dir, sentinels, captures}) => {
      await withFixture({dir, sentinels, captures}, {name: 'offer'}, async ({extension, adapter, client, connectTab}) => {
        const early = await attempt(client.request('getTabs', SESSION));
        check('session request before the connection exists is refused', !early.ok && early.message === 'extension has not initialized');
        const info = await client.request('getInfo', {});
        check('getInfo is answered before initialization (discovery does not wait)', info.type === 'extension');
        extension.connect(connectTab.id);
        await settle(5);
        const order = adapter.events.filter(e => e.kind === 'event').map(e => e.method);
        check('wire order is chrome.tabs.onCreated then extension.initialized', order.join() === 'chrome.tabs.onCreated,extension.initialized', order);
        check('the pre-initialization offer is retained as owned', adapter.state().offered.includes(connectTab.id));
        const tabs = await client.request('getTabs', SESSION);
        check('getTabs lists exactly the offered tab', tabs.length === 1 && tabs[0].id === connectTab.id);
        const missing = await attempt(client.request('getTabs', {}));
        check('a session request without session_id/turn_id is refused', !missing.ok);
      });
    }),

  scenario('reply-and-error-shapes', 'extension replies {id,result|error:string}; parse errors carry no id; no tab enumeration',
    [`${BG}:178-217`, `${BG}:20-26`, `${BS}:10403-10416`], async ({check, dir, sentinels, captures}) => {
      await withFixture({dir, sentinels, captures}, {name: 'replies'}, async ({extension, adapter, client, connectTab}) => {
        extension.connect(connectTab.id); await settle(5);
        const attached = await client.request('attach', {...SESSION, tabId: connectTab.id});
        check('a void chrome result is relayed as {} (result ?? {})', JSON.stringify(attached) === '{}');
        const refused = await attempt(client.request('executeCdp', {...SESSION, target: {tabId: connectTab.id}, method: 'Runtime.evaluate', commandParams: {expression: '1'}}));
        check('an extension error string reaches the client verbatim as error.message', !refused.ok && refused.message.startsWith('fixture refuses CDP Runtime.evaluate'), refused.message);
        check('a handler failure uses code 1 (vendor peer convention)', refused.code === 1);
        await extension.receive('{not json'); await settle(5);
        check('a parse error reply has no id and is logged, not matched to a request', adapter.events.some(e => e.kind === 'protocol-error' && e.code === -32700));
        const before = extension.commands.length;
        await extension.receive(JSON.stringify({id: 9001, method: 'chrome.tabs.query', params: [{}]})); await settle(5);
        check('chrome.tabs.query (tab enumeration) is not an allowed extension method', extension.commands.length === before + 1 && adapter.events.at(-1)?.ok === false);
      });
    }),

  scenario('optional-method-errors', 'unimplemented optional methods return the exact vendor fallback strings',
    [`${BS}:67810-67890`, `${BS}:67942-67955`, `${BS}:10452-10460`], async ({check, dir, sentinels, captures}) => {
      await withFixture({dir, sentinels, captures}, {name: 'optional'}, async ({extension, client, connectTab}) => {
        extension.connect(connectTab.id); await settle(5);
        for (const method of ['executeCdpWithCachedExpression', 'getCommittedTabUrl']) {
          const r = await attempt(client.request(method, {...SESSION, tabId: connectTab.id}));
          check(`${method}: code -1 and exact "${NO_HANDLER(method)}"`, !r.ok && r.code === -1 && r.message === NO_HANDLER(method), r.message);
        }
      });
    }),

  scenario('unknown-tab-rejection', 'only offered or adapter-created tabs are attachable; no guessed ids reach the extension',
    [`${BG}:199-208`, 'spec Phase C connection boundary'], async ({check, dir, sentinels, captures}) => {
      await withFixture({dir, sentinels, captures}, {name: 'unknown'}, async ({extension, client, connectTab}) => {
        const userTab = extension.addTab({url: 'https://user.fixture.invalid/', title: 'user tab, never offered'});
        extension.connect(connectTab.id); await settle(5);
        for (const tabId of [userTab.id, 424242, 0, -1, '1001']) {
          const r = await attempt(client.request('attach', {...SESSION, tabId}));
          check(`attach ${JSON.stringify(tabId)} refused`, !r.ok);
        }
        const cdp = await attempt(client.request('executeCdp', {...SESSION, target: {tabId: userTab.id}, method: 'Page.enable', commandParams: {}}));
        check('executeCdp on an unoffered tab refused', !cdp.ok);
        check('no debugger command for the unoffered tab reached the extension', extension.commands.every(c => c.debuggee?.tabId !== userTab.id));
        const listed = await client.request('getTabs', SESSION);
        check('getTabs does not reveal the unoffered tab', !listed.some(t => t.id === userTab.id));
      });
    }),

  scenario('child-session-forwarding', 'flattened child sessions keep {tabId, sessionId} in commands and onCDPEvent',
    [`${BS}:47189-47215`, `${BS}:47617-47660`, `${BS}:48392-48410`, `${BS}:48485-48517`, `${BG}:170-176`], async ({check, dir, sentinels, captures}) => {
      await withFixture({dir, sentinels, captures}, {name: 'child'}, async ({extension, client}) => {
        const tab = extension.addTab({url: 'https://parent.fixture.invalid/', childFrames: 1});
        extension.connect(tab.id); await settle(5);
        await client.request('attach', {...SESSION, tabId: tab.id});
        await client.request('executeCdp', {...SESSION, target: {tabId: tab.id}, method: 'Target.setAutoAttach', commandParams: {autoAttach: true, flatten: true, waitForDebuggerOnStart: false, filter: [{type: 'iframe', exclude: false}]}});
        await settle(10);
        const attachedEvent = client.notifications.find(n => n.method === 'onCDPEvent' && n.params.method === 'Target.attachedToTarget');
        const sessionId = attachedEvent?.params.params.sessionId;
        const targetId = attachedEvent?.params.params.targetInfo.targetId;
        check('Target.attachedToTarget arrives as onCDPEvent with source {tabId}', attachedEvent && JSON.stringify(attachedEvent.params.source) === JSON.stringify({tabId: tab.id}));
        extension.cdpEvent({tabId: tab.id, sessionId}, 'Runtime.executionContextCreated', {context: {id: 1}});
        await settle(5);
        const childEvent = client.notifications.find(n => n.params?.method === 'Runtime.executionContextCreated');
        check('a child-session event keeps source.sessionId', childEvent?.params.source.sessionId === sessionId && childEvent?.params.source.tabId === tab.id);
        await client.request('executeCdp', {...SESSION, target: {tabId: tab.id, sessionId}, method: 'Page.enable', commandParams: {}});
        const last = extension.commands.at(-1);
        check('a {tabId, sessionId} command reaches chrome.debugger.sendCommand with the same debuggee', last.cdp === 'Page.enable' && last.debuggee.sessionId === sessionId && last.debuggee.tabId === tab.id);
        await client.request('executeCdp', {...SESSION, target: {tabId: tab.id, targetId}, method: 'Page.enable', commandParams: {}});
        check('a {tabId, targetId} command is routed through the known child session', extension.commands.at(-1).debuggee.sessionId === sessionId);
        const both = await attempt(client.request('executeCdp', {...SESSION, target: {tabId: tab.id, sessionId, targetId}, method: 'Page.enable', commandParams: {}}));
        check('sessionId and targetId together are refused', !both.ok && both.message.includes('not both'));
        const unknown = await attempt(client.request('executeCdp', {...SESSION, target: {tabId: tab.id, sessionId: 'NOPE'}, method: 'Page.enable', commandParams: {}}));
        check('an unknown sessionId is refused before the extension', !unknown.ok && extension.commands.at(-1).debuggee.sessionId === sessionId);
      });
    }),

  scenario('user-detach-no-retry', 'a user cancellation releases the tab; no automatic re-attach; an explicit new offer re-grants',
    [`${BG}:119-132`, `${BG}:133-169`, 'spec Phase C connection boundary'], async ({check, dir, sentinels, captures}) => {
      await withFixture({dir, sentinels, captures}, {name: 'cancel'}, async ({extension, adapter, client}) => {
        const a = extension.addTab({url: 'https://a.fixture.invalid/'});
        const b = extension.addTab({url: 'https://b.fixture.invalid/'});
        extension.connect(a.id); extension.offer(b.id); await settle(5);
        await client.request('attach', {...SESSION, tabId: a.id});
        await client.request('attach', {...SESSION, tabId: b.id});
        extension.userCancel(a.id);
        await settle(400);                    // past the extension's 150 ms re-offer delay
        const detach = client.notifications.find(n => n.method === 'onCDPDetach');
        check('client receives onCDPDetach {tabId, reason:"canceled_by_user"}', detach?.params.tabId === a.id && detach?.params.reason === 'canceled_by_user');
        check('no automatic chrome.debugger.attach after the cancellation', attachedCount(extension, a.id) === 1);
        check('the cancelled tab is no longer owned', !adapter.state().offered.includes(a.id));
        const again = await attempt(client.request('attach', {...SESSION, tabId: a.id}));
        check('a client attach of the cancelled tab is refused', !again.ok && attachedCount(extension, a.id) === 1);
        extension.offer(a.id); await settle(5);   // the user drags it back into the group: an explicit offer
        check('an explicit renewed offer restores ownership without attaching', adapter.state().offered.includes(a.id) && attachedCount(extension, a.id) === 1);
        await client.request('attach', {...SESSION, tabId: a.id});
        check('the client may attach again after the explicit offer', attachedCount(extension, a.id) === 2);
        const mine = await client.request('createTab', SESSION);
        await client.request('attach', {...SESSION, tabId: mine.id});
        extension.userCancel(mine.id); await settle(400);
        const reclaim = await attempt(client.request('attach', {...SESSION, tabId: mine.id}));
        check('a cancelled adapter-created tab is released too (no re-attach)', !reclaim.ok && attachedCount(extension, mine.id) === 1);
      });
    }),

  scenario('transient-target-renewal', 'target_closed is renewed only through the extension\'s own re-offer; a group release is not',
    [`${BG}:73-84`, `${BG}:119-169`], async ({check, dir, sentinels, captures}) => {
      await withFixture({dir, sentinels, captures}, {name: 'renew'}, async ({extension, adapter, client}) => {
        const a = extension.addTab({url: 'https://a.fixture.invalid/'});
        const b = extension.addTab({url: 'https://b.fixture.invalid/'});
        const c = extension.addTab({url: 'https://c.fixture.invalid/'});
        extension.connect(a.id); extension.offer(b.id); extension.offer(c.id); await settle(5);
        for (const tab of [a, b, c]) await client.request('attach', {...SESSION, tabId: tab.id});
        extension.transientTargetClose(a.id);
        const during = attempt(client.request('attach', {...SESSION, tabId: a.id}));   // the vendor's immediate re-attach
        await settle(400);
        check('target_closed on a held tab is renewed by the extension\'s re-offer (one adapter re-attach)', attachedCount(extension, a.id) === 2 && adapter.state().attached.includes(a.id));
        check('a client attach during the window waits for the renewal and succeeds', (await during).ok);
        extension.userReleaseFromGroup(b.id);
        await settle(5);
        const released = attempt(client.request('attach', {...SESSION, tabId: b.id}));
        await settle(2700);                   // past the extension's 2500 ms verify window
        const r = await released;
        check('a group release (also "target_closed", no re-offer) is never re-attached', attachedCount(extension, b.id) === 1 && !r.ok, r.message);
        check('the connection stays open while another tab is held', !extension.closed && adapter.state().connected);
      });
    }),

  scenario('popup-offers', 'popups opened by a held tab arrive as offers; popups of unheld tabs never do',
    [`${BG}:170-176`, `${BG}:119-125`], async ({check, dir, sentinels, captures}) => {
      await withFixture({dir, sentinels, captures}, {name: 'popup'}, async ({extension, adapter, client}) => {
        const a = extension.addTab({url: 'https://a.fixture.invalid/'});
        const outside = extension.addTab({url: 'https://outside.fixture.invalid/'});
        extension.connect(a.id); await settle(5);
        await client.request('attach', {...SESSION, tabId: a.id});
        const popup = extension.openPopup(a.id);
        const stray = extension.openPopup(outside.id);
        await settle(5);
        check('a popup of a held tab is offered (chrome.tabs.onCreated with openerTabId)', adapter.state().offered.includes(popup.id));
        check('the popup is not attached until the client asks', attachedCount(extension, popup.id) === 0);
        check('a popup of an unheld tab is never offered', !adapter.state().offered.includes(stray.id));
        const r = await attempt(client.request('attach', {...SESSION, tabId: popup.id}));
        check('the client can attach the offered popup', r.ok);
      });
    }),

  scenario('disconnect', 'an extension disconnect rejects in-flight work, detaches everything and is not reconnected',
    [`${BG}:103-118`, `${BG}:116-118`, `${BS}:10360-10364`], async ({check, dir, sentinels, captures}) => {
      await withFixture({dir, sentinels, captures}, {name: 'disconnect'}, async ({extension, adapter, client}) => {
        const a = extension.addTab({url: 'https://a.fixture.invalid/'});
        extension.connect(a.id); await settle(5);
        await client.request('attach', {...SESSION, tabId: a.id});
        extension.holdReplies = true;
        const inflight = attempt(client.request('executeCdp', {...SESSION, target: {tabId: a.id}, method: 'Page.enable', commandParams: {}}));
        for (let i = 0; i < 50 && extension.commands.at(-1)?.cdp !== 'Page.enable'; i++) await settle(2);
        check('the command reached the extension and is unanswered (precondition)', extension.commands.at(-1)?.cdp === 'Page.enable' && adapter.state().pending === 1);
        extension.userDisconnect();
        const r = await inflight;
        await settle(5);
        check('the in-flight request is rejected "extension disconnected"', !r.ok && r.message === 'extension disconnected', r.message);
        check('client receives onCDPDetach for the held tab', client.notifications.some(n => n.method === 'onCDPDetach' && n.params.tabId === a.id && n.params.reason === 'extension_disconnected'));
        const after = await attempt(client.request('attach', {...SESSION, tabId: a.id}));
        check('later work is refused, not re-routed', !after.ok);
        check('ownership is cleared', adapter.state().offered.length === 0);
        const info = await client.request('getInfo', {});
        check('getInfo still answers (the backend reports, it does not reconnect)', info.type === 'extension');
      });
      await withFixture({dir, sentinels, captures}, {name: 'lasttab'}, async ({extension, adapter, client}) => {
        const a = extension.addTab({url: 'https://a.fixture.invalid/'});
        extension.connect(a.id); await settle(5);
        await client.request('attach', {...SESSION, tabId: a.id});
        extension.userCancel(a.id); await settle(20);
        check('cancelling the last controlled tab closes the whole extension connection', extension.closed && !adapter.state().connected);
      });
    }),

  scenario('created-tab-retention', 'createTab owns a new background tab; user tabs are never closed; turnEnded detaches but keeps tabs',
    [`${BG}:20-26`, `${BS}:67999-68008`, `${BS}:68041-68054`], async ({check, dir, sentinels, captures}) => {
      await withFixture({dir, sentinels, captures}, {name: 'created'}, async ({extension, adapter, client, connectTab}) => {
        extension.connect(connectTab.id); await settle(5);
        const tab = await client.request('createTab', SESSION);
        const create = extension.commands.find(c => c.method === 'chrome.tabs.create');
        check('createTab maps to chrome.tabs.create and returns a numeric id', create && Number.isInteger(tab.id));
        check('the created tab is owned and attachable', (await attempt(client.request('attach', {...SESSION, tabId: tab.id}))).ok);
        await client.request('attach', {...SESSION, tabId: connectTab.id});
        const closeUser = await attempt(adapter.handleRequest('closeTab', {...SESSION, tabId: connectTab.id}));
        check('closing a user-offered tab is refused without chrome.tabs.remove', !closeUser.ok && !extension.commands.some(c => c.method === 'chrome.tabs.remove'));
        await client.request('turnEnded', {session_id: SESSION.session_id, turn_id: SESSION.turn_id});
        await settle(5);
        check('turnEnded detaches every held tab', adapter.state().attached.length === 0 && extension.commands.filter(c => c.method === 'chrome.debugger.detach').length === 2);
        check('turnEnded closes no tab', extension.tabs.has(tab.id) && extension.tabs.has(connectTab.id) && !extension.commands.some(c => c.method === 'chrome.tabs.remove'));
      });
    }),

  scenario('token-url-redaction', 'the auto-connected connect page (token-bearing URL) is exposed without query or fragment',
    ['extension 0.4.0 lib/ui/connect.js:27-69', `${BG}:537-539`], async ({check, dir, sentinels, captures}) => {
      await withFixture({dir, sentinels, captures}, {name: 'redact'}, async ({extension, client, connectTab}) => {
        extension.connect(connectTab.id); await settle(5);
        const [tab] = await client.request('getTabs', SESSION);
        const text = JSON.stringify(tab);
        check('the offered connect page URL carried the fake token (precondition)', connectTab.url.includes(sentinels.token));
        check('getTabs exposes neither the fake token nor the fake capability', !text.includes(sentinels.token) && !text.includes(sentinels.capability));
        check('the exposed URL keeps origin and path', tab.url === 'chrome-extension://mmlmfjhmonkocbjadbfplnigmagldckm/connect.html');
      });
    }),
];

export const fixtureInfo = kind => backendInfo(kind);
