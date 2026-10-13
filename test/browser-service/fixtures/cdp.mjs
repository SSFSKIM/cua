// CDP answers and events in Chrome's wire shape (the DevTools protocol, as chrome.debugger relays it and cua's host
// forwards it as onCDPEvent {source, method, params}), for the CDP controller's tests. Written to the protocol's
// documented fields, not captured from a live Chrome (no live surface in M1a task 1); the field sets match what the
// vendor's controller reads (BS:47183-48757) and what scripts/probe/chrome uses.

export const MAIN_FRAME = 'F0A1B2C3D4E5F60718293A4B5C6D7E8F';
export const OOPIF_FRAME = '9C8B7A6F5E4D3C2B1A0F9E8D7C6B5A49';
export const OOPIF_SESSION = '6B1E0C5D2A7F48E3B9D0C1A2F3E4D5C6';

export const frame = ({id = MAIN_FRAME, url = 'https://fixture.test/', parentId} = {}) => ({
  id, ...(parentId ? {parentId} : {}), loaderId: `L-${id.slice(0, 6)}`, url, domainAndRegistry: 'fixture.test',
  securityOrigin: new URL(url).origin, mimeType: 'text/html', adFrameStatus: {adFrameType: 'none'},
  secureContextType: 'Secure', crossOriginIsolatedContextType: 'NotIsolated', gatedAPIFeatures: [],
});

export const getFrameTree = (id = MAIN_FRAME, url) => ({frameTree: {frame: frame({id, url})}});

export const pageTarget = (tabId, url = 'https://fixture.test/') => ({
  targetId: `PAGE-${tabId}`, type: 'page', title: 'Fixture', url, attached: true, canAccessOpener: false, tabId,
});

export const iframeTarget = (targetId = OOPIF_FRAME, url = 'https://other.test/frame') => ({
  targetId, type: 'iframe', title: '', url, attached: false, canAccessOpener: false, browserContextId: 'CTX',
});

export const getTargets = (tabId, extra = []) => ({targetInfos: [pageTarget(tabId), ...extra]});

export const attachedToTarget = ({sessionId = OOPIF_SESSION, targetId = OOPIF_FRAME, url} = {}) => ({
  sessionId, targetInfo: {...iframeTarget(targetId, url), attached: true}, waitingForDebugger: false,
});

export const frameNavigated = ({id = MAIN_FRAME, url = 'https://fixture.test/', parentId, type = 'Navigation'} = {}) => ({
  frame: frame({id, url, parentId}), type,
});

export const dialogOpening = ({type = 'alert', message = 'Hello from the fixture', defaultPrompt, url = 'https://fixture.test/', frameId = MAIN_FRAME} = {}) => ({
  url, frameId, message, type, hasBrowserHandler: true, ...(defaultPrompt !== undefined ? {defaultPrompt} : {}),
});

export const dialogClosed = ({result = true, userInput = '', frameId = MAIN_FRAME} = {}) => ({frameId, result, userInput});

export const evaluated = value => ({result: {type: typeof value, value}});

export const thrown = (description = 'ReferenceError: missing is not defined\n    at <anonymous>:1:1') => ({
  result: {type: 'object', subtype: 'error', className: 'ReferenceError', description, objectId: '-1.1'},
  exceptionDetails: {exceptionId: 1, text: 'Uncaught', lineNumber: 0, columnNumber: 0, scriptId: '7',
    exception: {type: 'object', subtype: 'error', className: 'ReferenceError', description, objectId: '-1.2'}},
});

// The host's wordings (src/chrome/host.mjs executeCdp).
export const HOST_TIMEOUT = (ms, method) => `Timed out after ${ms}ms waiting for CDP command ${method}.`;
export const UNATTACHED = 'Debugger unattached';
export const TAB_NOT_ATTACHED = tabId => `Debugger is not attached to the tab with id: ${tabId}.`;
