// A real headless Chrome for the tests that must see Chrome's own behaviour (the wheel scroll's): started with a
// scratch HOME and user-data dir, no display, its DevTools endpoint on a free port; one page target driven over CDP by
// a WebSocket. `cdp.call(tabId, method, params, {deadline})` has the browser service's controller shape, the
// deadline honoured as the controller does. Pages are served from two loopback origins (127.0.0.1 and localhost), so a
// test can put a cross-origin frame in a page. Without a Chrome on this machine -> null, and the test skips.
import {spawn} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const CANDIDATES = [process.env.CUA_TEST_CHROME, '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
export const chromePath = () => CANDIDATES.find(p => existsSync(p)) ?? null;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// -> {cdp, load(path, {origin}), evaluate(expression), url(path, origin), requests, pageSocketUrl}; `pages` maps a path to
// its HTML, read at each request, and `requests` lists what the pages asked for ({host, path, found}). `pageSocketUrl`
// is the page's DevTools WebSocket, for a test that opens debugger sessions of its own beside the helper's.
export async function realChrome(t, pages = {}) {
  const path = chromePath();
  if (path == null) return null;
  const requests = [];
  const server = createServer((req, res) => {
    const body = pages[new URL(req.url, 'http://x').pathname];
    requests.push({host: req.headers.host?.split(':')[0], port: Number(req.headers.host?.split(':')[1]), path: new URL(req.url, 'http://x').pathname, found: body != null});
    res.writeHead(body == null ? 404 : 200, {'content-type': 'text/html'});
    res.end(body ?? 'missing');
  });
  // a second port on the same host serves the same table: a same-site, cross-origin frame (Chrome may keep it in the
  // page's own renderer)
  const second = createServer((req, res) => server.emit('request', req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => second.listen(0, '127.0.0.1', resolve));
  const port = server.address().port, port2 = second.address().port;
  const home = mkdtempSync(join(tmpdir(), 'cua-real-chrome-'));
  // Puppeteer's quiet set beside headless: no keychain or password-store prompt (macOS), no background fetches
  const child = spawn(path, ['--headless=new', `--user-data-dir=${join(home, 'profile')}`, '--remote-debugging-port=0', '--no-first-run',
    '--no-default-browser-check', '--use-mock-keychain', '--password-store=basic', '--disable-background-networking', '--disable-component-update',
    '--disable-sync', '--window-size=1000,800', 'about:blank'], {env: {PATH: process.env.PATH, HOME: home}, stdio: 'ignore'});
  let socket = null;
  t.after(async () => {
    socket?.close();
    child.kill();
    await Promise.race([new Promise(resolve => (child.exitCode != null ? resolve() : child.once('exit', resolve))), sleep(5000).then(() => child.kill('SIGKILL'))]);
    for (const s of [server, second]) { s.closeAllConnections(); s.close(); }
    // Chrome's helpers can still be writing its profile as it exits (macOS): retried, and a leftover tmp dir is no failure
    try { rmSync(home, {recursive: true, force: true, maxRetries: 10, retryDelay: 200}); } catch {}
  });
  // Chrome creates the file before it writes the port into it: read on until its first line is a port, since an empty
  // read becomes `http://127.0.0.1:/json/list`, which is port 80 (#444)
  const portFile = join(home, 'profile', 'DevToolsActivePort');
  const portIn = () => { try { return /^\d+$/.exec(readFileSync(portFile, 'utf8').split('\n')[0].trim())?.[0] ?? null; } catch { return null; } };
  let devtools = portIn();
  for (let i = 0; i < 400 && devtools == null; i++) { await sleep(50); devtools = portIn(); }
  if (devtools == null) throw new Error(`real Chrome (${path}) wrote no port to DevToolsActivePort in 20 s`);
  let target;
  for (let i = 0; i < 100 && target == null; i++) {
    target = (await (await fetch(`http://127.0.0.1:${devtools}/json/list`, {signal: AbortSignal.timeout(5000)})).json()).find(x => x.type === 'page');
    if (target == null) await sleep(50);
  }
  if (target == null) throw new Error('real Chrome listed no page target in 5 s');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await Promise.race([new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; }),
    sleep(10_000).then(() => { throw new Error('real Chrome\'s page socket did not open in 10 s'); })]);
  let id = 0;
  const waiting = new Map(), listeners = [];
  socket.onmessage = ({data}) => {
    const msg = JSON.parse(data);
    if (msg.id != null) { const w = waiting.get(msg.id); waiting.delete(msg.id); if (msg.error) w?.reject(new Error(msg.error.message)); else w?.resolve(msg.result); }
    else for (const listener of listeners) listener(msg);
  };
  // every command bounded, so a stalled Chrome fails the test with the command's name instead of hanging the suite
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { waiting.delete(n); reject(new Error(`real Chrome did not answer ${method} in 20 s`)); }, 20_000);
    waiting.set(n, {resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); }});
    socket.send(JSON.stringify({id: n, method, params}));
  });
  const sent = [];
  const cdp = {
    sent,
    async call(tabId, method, params, options = {}) {
      options.deadline?.check();
      sent.push({method, params});
      const work = send(method, params);
      return await (options.deadline ? options.deadline.race(work) : work);
    },
  };
  await send('Page.enable');
  const url = (pathname, origin = '127.0.0.1', {other = false} = {}) => `http://${origin}:${other ? port2 : port}${pathname}`;
  const evaluate = async expression => (await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true})).result?.value;
  const load = async (pathname, {origin} = {}) => {
    const loaded = new Promise(resolve => { const l = msg => { if (msg.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(l), 1); resolve(); } }; listeners.push(l); });
    await send('Page.navigate', {url: url(pathname, origin)});
    await Promise.race([loaded, sleep(20_000).then(() => { throw new Error(`real Chrome did not load ${pathname} in 20 s`); })]);
    sent.length = 0;
  };
  return {cdp, load, evaluate, url, requests, pageSocketUrl: target.webSocketDebuggerUrl};
}
