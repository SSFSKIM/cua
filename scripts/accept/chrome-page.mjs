// The Chrome acceptance page (C2): one self-contained document served on 127.0.0.1 (ephemeral port) with a per-run
// document marker, one password input and one button. The button computes SHA-256 of the input's value in the page
// (crypto.subtle; a loopback origin is a secure context) and shows only `done: <first 16 hex digits>`, so the harness
// can check what was entered without the value ever being displayed, read back or screenshotted (the field stays
// masked). No external resource, form, cookie or network request (CSP forbids them); nothing persists. The server
// answers only GET / on its exact Host (a rebinding or lookalike Host is refused) and counts requests without paths.
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

export async function startAcceptancePage() {
  const documentMarker = `cua-accept-doc-${randomBytes(6).toString('hex')}`;
  const counts = {total: 0, served: 0, refused: 0};
  let expectedHost;
  const server = createServer((req, res) => {
    counts.total++;
    if (req.headers.host !== expectedHost) { counts.refused++; res.writeHead(421, {'content-type': 'text/plain'}).end('misdirected\n'); return; }
    if (req.method !== 'GET' || req.url !== '/') { counts.refused++; res.writeHead(404, {'content-type': 'text/plain'}).end('not found\n'); return; }
    counts.served++;
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': CSP, 'referrer-policy': 'no-referrer'});
    res.end(html(documentMarker));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const {port} = server.address();
  expectedHost = `127.0.0.1:${port}`;
  const origin = `http://${expectedHost}`;
  return {
    origin, url: `${origin}/`, documentMarker,
    requests: () => ({...counts}),
    close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}
