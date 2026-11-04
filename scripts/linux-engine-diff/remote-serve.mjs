// A remote device's MCP endpoint for the engine-stop experiment (engine-stop.mjs, M4's T7b): cua's own Streamable HTTP
// handler (src/mcp/http.mjs, the code `cua agent run` serves) from the checkout `--root` names, on a loopback listener
// of its own, so a session's end (end_task, then DELETE) takes the production path to the runtime's teardown. It
// stands in for the agent's listener alone, without its device record, lock or relay, which would touch the person's
// enrolment; the bearer is the experiment's own (`CUA171_REMOTE_TOKEN`, one run's random value), never a device's.
// Prints `{"port": N}` once listening; SIGTERM closes every session (as the agent's signal does), then exits.
//   node remote-serve.mjs --root <cua checkout>
import { createServer } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const at = process.argv.indexOf('--root');
const root = at > 0 ? process.argv[at + 1] : null;
const token = process.env.CUA171_REMOTE_TOKEN;
if (!root || !token) {
  process.stderr.write('remote-serve: --root and CUA171_REMOTE_TOKEN are required\n');
  process.exit(2);
}
const { createMcpHttp } = await import(pathToFileURL(join(root, 'src/mcp/http.mjs')).href);
const { defaultHome } = await import(pathToFileURL(join(root, 'src/runtime/layout.mjs')).href);
const home = process.env.CUA_HOME ?? defaultHome();
const mcp = createMcpHttp({ home, env: process.env, clientCredential: () => token, diagnostics: (line) => process.stderr.write(`remote-serve: ${line}\n`) });

// node:http's request and response as the handler's abstract ones (src/mcp/http.mjs, its header)
const server = createServer((req, res) => {
  const aborted = new AbortController();
  res.on('close', () => aborted.abort());
  const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(', ') : v]));
  Promise.resolve(
    mcp.handle(
      { method: req.method, url: req.url, headers, body: req, signal: aborted.signal },
      { writeHead: (status, h) => res.writeHead(status, h), write: (chunk) => res.write(chunk), end: (chunk) => res.end(chunk) },
    ),
  ).catch((error) => {
    process.stderr.write(`remote-serve: ${error.stack ?? error.message}\n`);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});
server.listen({ host: '127.0.0.1', port: 0 }, () => process.stdout.write(`${JSON.stringify({ port: server.address().port })}\n`));
process.once('SIGTERM', async () => {
  server.close();
  await mcp.close('signal');
  server.closeAllConnections();
  process.exit(0);
});
