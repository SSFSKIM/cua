# cua-relay

The meeting point between a cloud MCP client (a Claude Code session in a VM, say) and a user's Mac running
`cua agent run --relay`. The Mac dials out to the relay over a WebSocket, so it needs no open port; the client reaches
it at `https://<relay>/d/<deviceId>/mcp`, an ordinary MCP Streamable HTTP endpoint. Each HTTP request travels to the
Mac as one channel on its WebSocket and is answered by the agent's own endpoint, which checks the client's credential
again. The relay keeps no session state: sessions live on the Mac, so restarting the relay costs a reconnect (up to
30 s of the agent's backoff), never a session.

## Run it

```
cd relay && npm ci
node server.mjs --port 7800 --devices devices.json        # listens on 127.0.0.1:7800; --host <address> to change that
```

It speaks plain HTTP and never terminates TLS: put it behind a proxy that does, and give agents a `wss://` URL (`cua
remote enroll` refuses a `ws://` relay URL unless it names a loopback address, `invalid_relay_url`: over `ws://` the
device credential and every client bearer would cross the network in the clear). The proxy must:

- pass WebSocket upgrades on **`/ws`** (where agents connect) and forward everything under **`/d/`** (where clients
  connect), with the `Authorization` header intact;
- not buffer or compress responses: MCP answers arrive as server-sent events, sent with `Cache-Control: no-cache,
  no-transform` and `X-Accel-Buffering: no`; with nginx also set `proxy_buffering off` for `/d/`;
- allow a read timeout above the longest `js` call you expect; open streams carry a `: keepalive` comment after every
  20 s of silence, so 10 minutes is a safe floor.

nginx, inside the TLS `server` block:

```
location /ws { proxy_pass http://127.0.0.1:7800; proxy_http_version 1.1;
               proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_read_timeout 600s; }
location /d/ { proxy_pass http://127.0.0.1:7800; proxy_http_version 1.1; proxy_buffering off; proxy_read_timeout 600s; }
```

Without a server, a Cloudflare quick tunnel gives a public `https://<random>.trycloudflare.com` in front of the
loopback listener: `cloudflared tunnel --url http://127.0.0.1:7800` (agents then use
`wss://<random>.trycloudflare.com/ws`). The URL changes on every start, so it suits tests, not a standing setup.

## Add a device

On the Mac: `cua remote enroll --relay wss://<relay>/ws` (or, already enrolled, the same command updates the relay URL
without rotating anything) prints the line for this file; `cua remote show` prints it again at any time. It holds
SHA-256 hashes of the two credentials, never the credentials themselves. `devices.json` is one object:

```json
{
  "<deviceId>": {"deviceCredentialSha256": "<64 hex>", "clientCredentialSha256": "<64 hex>"}
}
```

The relay reads it at start: restart the relay after editing it (the agents reconnect by themselves). Then, on the Mac,
`cua agent install` if its launchd job does not dial a relay yet (it adds `--relay`; `enroll` says when this is
needed), and on the client the line `enroll` printed:
`claude mcp add --transport http cua_repl https://<relay>/d/<deviceId>/mcp --header "Authorization: Bearer <client credential>"`.
The agent follows the Mac's `device.json` while it runs, so moving a device to another relay (`cua remote enroll
--relay <new url>`) needs no restart: the agent redials the new URL by itself. A `cua remote enroll --rotate` changes
both hashes: replace the line and restart the relay (the agent, which already refuses the old client credential,
reconnects with the new device credential), and re-register the client.

## What the answers mean

| Seen by | Answer | Meaning |
|---|---|---|
| client | `401` | the bearer is not this device's client credential, or the device is not in `devices.json` (the two are not told apart) |
| client | `404` | not a device endpoint: the path is `/d/<deviceId>/mcp` |
| client | `503 device offline` | the device has no live WebSocket: the Mac is asleep, offline, or its agent is not running (`cua agent status` on the Mac) |
| client | `413` | the request body is over 4 MB (MCP requests are far smaller); nothing reached the Mac's session |
| client | `502` | the Mac's connection dropped (or its agent failed) before it answered; a stream already under way is cut instead, and an MCP client resumes it |
| agent | upgrade refused `401` | the device credential matches no line in `devices.json`: add the line `cua remote show` prints |
| agent | close `4001` (`replaced`) | a newer connection for the same device took over. The agent stops and exits 0 rather than fight for the slot, and launchd leaves it stopped; find the other holder of this enrolment |
| agent | close `4003` | the agent's hello named another device than its credential belongs to; it exits 0 |

A client that stops reading while the relay holds more than 32 MB of its response has that response cut; once it reads
again it resumes by `Last-Event-ID`.

Liveness: the relay pings every WebSocket every 25 s and drops one that misses two pongs; the agent drops a connection
that heard no ping for 60 s and dials again, from 1 s doubling to 30 s.

## What it sees

Everything an MCP session carries, screenshots and results included, passes through the relay in the clear after the
proxy terminates TLS: run it where you would keep the client credential. The relay never logs credentials or payloads,
only device ids, connections and dropped frames.
