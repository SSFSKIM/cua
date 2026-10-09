// M5 probe (MAWS final fix wave, A-51's note): the cookie-jar CDP methods are refused through MAWS's primitive server.
// A raw primitive client on the socket (u32 LE length + JSON-RPC 2.0, the extension protocol): waits for hello, creates
// a tab, attaches, sends each cookie-jar method and one allowed Network read for contrast, then detaches and removes
// the tab. Prints {hello, results}; never prints a cookie (an unexpected success reports only its key count).
//
//   node cookie-jar.mjs <MAWS session socket>
import net from 'node:net';
const [path] = process.argv.slice(2);
const METHODS = ['Network.getAllCookies', 'Network.getCookies', 'Network.setCookie', 'Network.setCookies', 'Network.deleteCookies', 'Network.clearBrowserCookies'];
const sock = net.connect(path);
let buf = Buffer.alloc(0), id = 0;
const waiters = new Map();
let hello;
const helloSeen = new Promise(resolve => { hello = resolve; });
sock.on('data', chunk => {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= 4) {
    const n = buf.readUInt32LE(0);
    if (buf.length < 4 + n) break;
    const msg = JSON.parse(buf.subarray(4, 4 + n).toString('utf8'));
    buf = buf.subarray(4 + n);
    if (msg.method === 'hello') hello(msg.params);
    else if (msg.id !== undefined) waiters.get(msg.id)?.(msg);
  }
});
const call = (method, params = {}) => new Promise(resolve => {
  const k = ++id;
  waiters.set(k, resolve);
  const body = Buffer.from(JSON.stringify({jsonrpc: '2.0', id: k, method, params}));
  const head = Buffer.alloc(4); head.writeUInt32LE(body.length);
  sock.write(Buffer.concat([head, body]));
});
const brief = reply => reply.error ? {error: reply.error.message} : {ok: true, keys: Object.keys(reply.result ?? {}).length};
const h = await helloSeen;
const created = await call('tabs.create', {url: 'about:blank'});
const tabId = created.result?.id;
const results = {attach: brief(await call('debugger.attach', {tabId}))};
for (const method of [...METHODS, 'Network.enable']) {
  results[method] = brief(await call('debugger.sendCommand', {debuggee: {tabId}, method, params: method === 'Network.getCookies' ? {urls: ['https://example.com']} : {}}));
}
results.detach = brief(await call('debugger.detach', {tabId}));
results.remove = brief(await call('tabs.remove', {tabId}));
console.log(JSON.stringify({hello: {extensionInstanceId: h.extensionInstanceId, profileName: h.profileName}, tabId, results}, null, 1));
sock.end();
