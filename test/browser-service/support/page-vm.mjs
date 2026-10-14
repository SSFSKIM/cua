// Runs an expression the service sends with Runtime.evaluate the way Chrome would answer it, in a node:vm context made
// of the page globals a test supplies (document, location, fetch and so on): {result: {type, value}} for a value (an
// awaited one with awaitPromise), {exceptionDetails} when it throws, as the DevTools protocol shapes them. For the
// commands whose work runs inside the page (the exports' page fetch, the transcript capture, the asset listing).
import vm from 'node:vm';

const NODE_GLOBALS = {URL, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout, btoa, atob};

export async function evaluateInPage(globals, {expression, awaitPromise}) {
  const context = vm.createContext({...NODE_GLOBALS, ...globals});
  try {
    let value = vm.runInContext(expression, context);
    if (awaitPromise) value = await value;
    // The value crosses the protocol as JSON (returnByValue), as Chrome sends it.
    return {result: value === undefined ? {type: 'undefined'} : {type: typeof value, value: JSON.parse(JSON.stringify(value))}};
  } catch (error) {
    const description = error instanceof Error || error?.message ? `Error: ${error.message}` : String(error);
    return {result: {type: 'object', subtype: 'error', description}, exceptionDetails: {exceptionId: 1, text: 'Uncaught (in promise)', lineNumber: 0, columnNumber: 0, exception: {type: 'object', subtype: 'error', description}}};
  }
}

// A fetch Response stand-in: `body` a string or bytes; headers by lower-case name.
export function pageResponse(body, {status = 200, headers = {}} = {}) {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300, status,
    headers: {get: name => lower[name.toLowerCase()] ?? null},
    async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
    async text() { return new TextDecoder().decode(bytes); },
    body: null,
  };
}
