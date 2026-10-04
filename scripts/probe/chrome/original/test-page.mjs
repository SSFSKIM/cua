// The --with-tabs probe's own loopback test page: one self-contained document served on 127.0.0.1 (ephemeral port)
// with a per-run document marker, one text input and one button whose click writes "done: <input value>" into its
// own DOM. No external resource, form, cookie or network request (CSP forbids them); nothing persists. The server
// answers only GET / on its exact Host (a rebinding or lookalike Host is refused) and counts requests without paths.
import {createServer} from 'node:http';
import {createHash, randomBytes} from 'node:crypto';

export const PAGE_TITLE = 'CUA probe page';
export const INPUT_LABEL = 'Probe input';
export const BUTTON_LABEL = 'Mark probe page';
export const doneText = typed => `done: ${typed}`;

const SCRIPT = "document.getElementById('mark').addEventListener('click', () => { document.getElementById('out').textContent = 'done: ' + document.getElementById('probe-input').value; });";
const SCRIPT_HASH = createHash('sha256').update(SCRIPT).digest('base64');
const CSP = `default-src 'none'; script-src 'sha256-${SCRIPT_HASH}'; style-src 'none'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`;

const html = marker => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${PAGE_TITLE}</title></head>
<body><main>
<h1>${PAGE_TITLE}</h1>
<p id="marker">${marker}</p>
<input id="probe-input" type="text" aria-label="${INPUT_LABEL}" autocomplete="off" autofocus>
<button id="mark" type="button">${BUTTON_LABEL}</button>
<p id="out" role="status">waiting</p>
</main><script>${SCRIPT}</script></body></html>
`;

export async function startTestPage() {
  const documentMarker = `cua-probe-doc-${randomBytes(6).toString('hex')}`;
  const typedMarker = `cuaprobe${randomBytes(6).toString('hex')}`;
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
    origin, url: `${origin}/`, documentMarker, typedMarker,
    requests: () => ({...counts}),
    close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}
