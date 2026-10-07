// The Chrome acceptance pages (C2, and the cua route's cells in H3b): self-contained documents served on 127.0.0.1
// (ephemeral port), each with a per-run document marker. No external resource, form, cookie or network request (each
// document's CSP forbids them); nothing persists. The servers answer only their own paths on their exact Host (a
// rebinding or lookalike Host is refused) and count requests without paths.
//   /        the C2 page: one password input and one button. The button computes SHA-256 of the input's value in the
//            page (crypto.subtle; a loopback origin is a secure context) and shows only `done: <first 16 hex digits>`,
//            so the harness can check what was entered without the value ever being displayed, read back or
//            screenshotted (the field stays masked).
//   /framed  a page embedding the frame server's page in an iframe. The frame server is a second loopback port named
//            `localhost`, so the frame is cross-site as well as cross-origin: Chrome's site isolation puts it in its own
//            renderer (an out-of-process iframe), which the vendor service reaches only through attachTarget. Its page
//            carries its own marker, a button and a status line the button sets.
//   /user    the user-tab page: the runner opens it in Chrome as the user would (acceptance 3), never through the agent.
import {createServer} from 'node:http';
import {createHash, randomBytes} from 'node:crypto';

export const PAGE_TITLE = 'CUA acceptance page';
export const INPUT_LABEL = 'Acceptance password';
export const BUTTON_LABEL = 'Compute digest';
export const DIGEST_HEX = 16;
export const expectedDigest = value => createHash('sha256').update(value, 'utf8').digest('hex').slice(0, DIGEST_HEX);

export const SCRIPT = "document.getElementById('compute').addEventListener('click', async () => { const out = document.getElementById('out'); out.textContent = 'computing'; const bytes = new TextEncoder().encode(document.getElementById('secret').value); const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)); out.textContent = 'done: ' + Array.from(hash, b => b.toString(16).padStart(2, '0')).join('').slice(0, " + DIGEST_HEX + "); });";
const SCRIPT_HASH = createHash('sha256').update(SCRIPT).digest('base64');
export const CSP = `default-src 'none'; script-src 'sha256-${SCRIPT_HASH}'; style-src 'none'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`;

const html = marker => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${PAGE_TITLE}</title></head>
<body><main>
<h1>${PAGE_TITLE}</h1>
<p id="marker">${marker}</p>
<input id="secret" type="password" aria-label="${INPUT_LABEL}" autocomplete="off">
<button id="compute" type="button">${BUTTON_LABEL}</button>
<p id="out" role="status">waiting</p>
</main><script>${SCRIPT}</script></body></html>
`;

// The cross-site frame and the page that embeds it.
export const FRAMED_TITLE = 'CUA acceptance framed page';
export const FRAME_BUTTON_LABEL = 'Frame button';
export const FRAME_CLICKED = 'clicked in the frame';
export const FRAME_SCRIPT = `document.getElementById('frame-button').addEventListener('click', () => { document.getElementById('frame-out').textContent = '${FRAME_CLICKED}'; });`;
const FRAME_SCRIPT_HASH = createHash('sha256').update(FRAME_SCRIPT).digest('base64');
export const frameCsp = parentOrigin => `default-src 'none'; script-src 'sha256-${FRAME_SCRIPT_HASH}'; style-src 'none'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors ${parentOrigin}`;
export const framedCsp = frameOrigin => `default-src 'none'; frame-src ${frameOrigin}; script-src 'none'; style-src 'none'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`;
const framedHtml = (marker, frameUrl) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${FRAMED_TITLE}</title></head>
<body><main>
<h1>${FRAMED_TITLE}</h1>
<p id="marker">${marker}</p>
<iframe id="cross" title="Cross-site frame" src="${frameUrl}" width="480" height="200"></iframe>
</main></body></html>
`;
const frameHtml = marker => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>CUA acceptance frame</title></head>
<body>
<p id="frame-marker">${marker}</p>
<button id="frame-button" type="button">${FRAME_BUTTON_LABEL}</button>
<p id="frame-out" role="status">waiting</p>
<script>${FRAME_SCRIPT}</script></body></html>
`;

// The user-tab page: a marker only, nothing to type into.
export const USER_TITLE = 'CUA acceptance user tab';
export const USER_CSP = "default-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";
const userHtml = marker => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${USER_TITLE}</title></head>
<body><main><h1>${USER_TITLE}</h1><p id="marker">${marker}</p></main></body></html>
`;

const marker = kind => `cua-accept-${kind}-${randomBytes(6).toString('hex')}`;
const HEADERS = {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer'};

// One loopback server answering GET on the given paths, and only on its exact Host. `hostName` is what the browser
// names it by (127.0.0.1, or localhost for the cross-site frame). The server listens on 127.0.0.1, and for localhost
// also on ::1 when it can (Chrome may try either address first; a refused ::1 falls back to 127.0.0.1).
async function serveDocuments({hostName, documents}) {
  const counts = {total: 0, served: 0, refused: 0};
  let expectedHost;
  const handler = (req, res) => {
    counts.total++;
    const doc = req.method === 'GET' && Object.hasOwn(documents(), req.url) ? documents()[req.url] : null;
    if (req.headers.host !== expectedHost) { counts.refused++; res.writeHead(421, {'content-type': 'text/plain'}).end('misdirected\n'); return; }
    if (!doc) { counts.refused++; res.writeHead(404, {'content-type': 'text/plain'}).end('not found\n'); return; }
    counts.served++;
    res.writeHead(200, {...HEADERS, 'content-security-policy': doc.csp});
    res.end(doc.body);
  };
  const servers = [createServer(handler)];
  await new Promise((resolve, reject) => { servers[0].once('error', reject); servers[0].listen(0, '127.0.0.1', resolve); });
  const {port} = servers[0].address();
  if (hostName === 'localhost') {
    const v6 = createServer(handler);
    const bound = await new Promise(resolve => { v6.once('error', () => resolve(false)); v6.listen(port, '::1', () => resolve(true)); });
    if (bound) servers.push(v6);
  }
  expectedHost = `${hostName}:${port}`;
  return {
    origin: `http://${expectedHost}`,
    requests: () => ({...counts}),
    close: () => Promise.all(servers.map(server => new Promise(resolve => { server.closeAllConnections?.(); server.close(() => resolve()); }))),
  };
}

export async function startAcceptancePage() {
  const documentMarker = marker('doc'), framedMarker = marker('framed'), frameMarker = marker('frame'), userMarker = marker('user');
  let frame = null, main = null;
  frame = await serveDocuments({hostName: 'localhost', documents: () => ({'/': {csp: frameCsp(main.origin), body: frameHtml(frameMarker)}})});
  main = await serveDocuments({hostName: '127.0.0.1', documents: () => ({
    '/': {csp: CSP, body: html(documentMarker)},
    '/framed': {csp: framedCsp(frame.origin), body: framedHtml(framedMarker, `${frame.origin}/`)},
    '/user': {csp: USER_CSP, body: userHtml(userMarker)},
  })});
  const {origin} = main;
  return {
    origin, url: `${origin}/`, documentMarker,
    framedUrl: `${origin}/framed`, framedMarker, frameOrigin: frame.origin, frameUrl: `${frame.origin}/`, frameMarker,
    userUrl: `${origin}/user`, userMarker,
    // The origins the runner owns: the only ones its elicitation policy accepts.
    origins: [origin, frame.origin],
    requests: () => ({...main.requests(), frame: frame.requests()}),
    close: () => Promise.all([main.close(), frame.close()]).then(() => {}),
  };
}
