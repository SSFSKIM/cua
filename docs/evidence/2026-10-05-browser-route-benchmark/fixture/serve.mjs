import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 48731;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ACCESS_LOG = path.join(ROOT, 'access.log');
const SUBMISSIONS_LOG = path.join(ROOT, 'submissions.log');
// MiniWoB++ checkout served under /miniwob/ (shallow clone next to this fixture).
const MINIWOB_ROOT = path.resolve(ROOT, '../miniwob-plusplus/miniwob/html');
const MINIWOB_PREFIX = '/miniwob/';
const MINIWOB_EPISODE_MS = 180000;

// MiniWoB is patched in the response only; the clone on disk stays unmodified.
// - every `EPISODE_MAX_TIME = <n>` becomes 180 s, so no agent has to extend it;
// - core.startEpisodeReal seeds Math.random from `?seed=` so every agent gets the same instance.
function patchMiniwob(rel, data) {
  if (!/\.(js|html)$/.test(rel)) return data;
  let text = data.toString('utf8').replace(/(EPISODE_MAX_TIME\s*=\s*)\d+/g, `$1${MINIWOB_EPISODE_MS}`);
  if (rel === 'core/core.js') {
    const anchor = 'core.startEpisodeReal = function () {\n';
    if (!text.includes(anchor)) throw new Error('core.js patch anchor not found');
    text = text.replace(anchor, anchor +
      '  if (/[?&]seed=([^&]+)/.test(location.search)) Math.seedrandom(decodeURIComponent(RegExp.$1));\n');
  }
  return Buffer.from(text, 'utf8');
}
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
};

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  fs.appendFileSync(ACCESS_LOG, `${new Date().toISOString()} ${req.method} ${req.url} HTTP/${req.httpVersion}\n`);
  let pathname;
  try {
    pathname = decodeURIComponent(req.url.split(/[?#]/)[0]);
  } catch {
    send(res, 400, 'text/plain', 'bad request');
    return;
  }

  if (req.method === 'POST' && pathname === '/submit') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      fs.appendFileSync(SUBMISSIONS_LOG, `${new Date().toISOString()} ${body}\n`);
      send(res, 200, 'application/json', JSON.stringify({ ok: true, received: body }));
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'text/plain', 'method not allowed');
    return;
  }

  let base = ROOT;
  let rel = /^\/*$/.test(pathname) ? 'index.html' : pathname;
  if (pathname.startsWith(MINIWOB_PREFIX)) {
    base = MINIWOB_ROOT;
    rel = pathname.slice(MINIWOB_PREFIX.length);
  }
  const file = path.join(base, rel);
  if (!file.startsWith(base + path.sep)) {
    send(res, 403, 'text/plain', 'forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      send(res, 404, 'text/plain', 'not found');
      return;
    }
    if (base === MINIWOB_ROOT) data = patchMiniwob(path.relative(MINIWOB_ROOT, file).split(path.sep).join('/'), data);
    send(res, 200, TYPES[path.extname(file)] || 'application/octet-stream', req.method === 'HEAD' ? undefined : data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`listening ${PORT}`);
});
