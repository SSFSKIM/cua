// One self-contained loopback document for linux-chrome-features.mjs. Like chrome-page.mjs's serveDocuments,
// it binds an ephemeral 127.0.0.1 port, refuses any other Host, and never permits caching or external resources.
import {createServer} from 'node:http';
import {createHash, randomBytes} from 'node:crypto';

// Deterministic >=4 KiB test bytes, not a document intended for a PDF reader. The attachment header forces a download.
export const REPORT_BODY = Buffer.from('%PDF-1.4\n% CUA features acceptance fixture\n' + '% cua-report-0123456789abcdef\n'.repeat(256) + '%%EOF\n');
export const REPORT_SHA256 = 'a3030829e7251330d53ac0d0a803039b8f82f6fa53d294b66e76d8fe3d8c6ec5';
export const SCRIPT = `document.getElementById('alert').addEventListener('click', () => {
  setTimeout(() => { window.__alerted = alert("cua alert"); document.getElementById('state').textContent = 'after-alert'; }, 50);
});
document.getElementById('confirm').addEventListener('click', () => {
  setTimeout(() => { const answer = confirm("cua confirm?"); document.getElementById('state').textContent = 'confirm:' + answer; }, 50);
});
document.getElementById('file').addEventListener('change', () => {
  const file = document.getElementById('file').files[0];
  document.getElementById('picked').textContent = file ? \`\${file.name}:\${file.size}\` : 'none';
});`;
const SCRIPT_HASH = createHash('sha256').update(SCRIPT).digest('base64');
export const CSP = `default-src 'none'; script-src 'sha256-${SCRIPT_HASH}'; style-src 'none'; img-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`;
const html = marker => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>CUA browser features acceptance</title></head>
<body><main>
<h1>CUA browser features acceptance</h1>
<p id="marker">${marker}</p>
<a id="dl" href="/report.pdf" download>Download report</a>
<button id="alert" type="button">Alert</button>
<button id="confirm" type="button">Confirm</button>
<p id="state">waiting</p>
<input id="file" type="file">
<p id="picked">waiting</p>
</main><script>${SCRIPT}</script></body></html>
`;
const HEADERS = {'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff'};

export async function startFeaturesPage() {
  const documentMarker = `cua-accept-features-${randomBytes(6).toString('hex')}`;
  const counts = {total: 0, served: 0, refused: 0};
  const body = Buffer.from(html(documentMarker));
  let expectedHost;
  const server = createServer((req, res) => {
    counts.total++;
    if (req.headers.host !== expectedHost) {
      counts.refused++;
      res.writeHead(421, {...HEADERS, 'content-type': 'text/plain'}).end('misdirected\n');
      return;
    }
    if (req.method !== 'GET' || !['/', '/report.pdf'].includes(req.url)) {
      counts.refused++;
      res.writeHead(404, {...HEADERS, 'content-type': 'text/plain'}).end('not found\n');
      return;
    }
    counts.served++;
    const download = req.url === '/report.pdf';
    res.writeHead(200, {...HEADERS,
      'content-type': download ? 'application/pdf' : 'text/html; charset=utf-8',
      'content-length': download ? REPORT_BODY.length : body.length,
      ...(download ? {'content-disposition': 'attachment; filename="cua-report.pdf"'} : {'content-security-policy': CSP}),
    });
    res.end(download ? REPORT_BODY : body);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  expectedHost = `127.0.0.1:${server.address().port}`;
  const origin = `http://${expectedHost}`;
  return {
    origin, url: `${origin}/`, documentMarker,
    requests: () => ({...counts}),
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
