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

## Hosting

`deploy/` stands the relay up on a Hetzner Cloud server behind Caddy, which terminates TLS with a Let's Encrypt
certificate and meets the proxy requirements above (WebSocket upgrades pass through, `flush_interval -1` on `/d/*`,
no compression, no read timeout). With the `hcloud` CLI configured (context `$HCLOUD_CONTEXT`, `cua` when unset) and
an SSH key named `macbook` in the project:

```
relay/deploy/create-server.sh            # --ref <git ref>, --type cx23, --location nbg1, --ssh-key macbook
#   creating cua-relay (cx23, nbg1) at 203.0.113.7, ref main
#   relay up: agents enrol with  cua remote enroll --relay wss://203-0-113-7.sslip.io/ws
```

It creates a primary IPv4 `cua-relay` (kept when the server is deleted, so the host name survives a rebuild), a
firewall `cua-relay` (TCP 22, 80, 443 in) and the server, whose cloud-init (`cloud-init.yaml`) installs Caddy and
Node 22, clones this repository into `/opt/cua`, runs `cua-relay.service` (user `cua-relay`, `127.0.0.1:7800`,
`/etc/cua-relay/devices.json`, empty at first) and serves `Caddyfile` at `<ip-with-dashes>.sslip.io`. It refuses if a
server named `cua-relay` exists. Then:

```
relay/deploy/update.sh --devices devices.json   # install a devices.json and restart the relay
relay/deploy/update.sh --ref main               # run another ref (git fetch, npm ci, restart)
relay/deploy/update.sh --ext dist               # publish the self-hosted cua extension at https://<host>/ext/ (no restart)
```

`--ext` takes what `CUA_EXTENSION_KEY=<owner's key> node scripts/extension-pack.mjs` wrote (`update.xml` and the CRX it
names): it copies the CRX, then `update.xml`, to `/var/lib/cua-relay/ext`, installs this checkout's `Caddyfile` (its
`/ext/` file server) under the server's current site address when that differs, and reloads Caddy after `caddy
validate`. Linux VMs force-install the extension from `https://<host>/ext/update.xml` (`deploy/cloud-vm/`).

`--devices` replaces the server's whole table, so keep every device's line in the file you send (the current one:
`ssh root@<ip> cat /etc/cua-relay/devices.json`). To rebuild (or after a failed cloud-init), `hcloud server delete
cua-relay` and run `create-server.sh` again: the address and firewall are reused, the stale SSH host key is dropped,
and `devices.json` starts empty again, so send it with `update.sh --devices` (agents retry until their line is back).
Each rebuild requests a new certificate for the same name, and Let's Encrypt allows five per name a week. Caddy and Node
come from their own apt repositories, which unattended upgrades skip: upgrade them with
`apt-get -o Dpkg::Options::=--force-confold upgrade`, which keeps the site's Caddyfile.

A real domain later: point its DNS at the address, change the site line of `/etc/caddy/Caddyfile` on the server,
`systemctl reload caddy`, and move each Mac with `cua remote enroll --relay wss://<domain>/ws` (the agent follows it
without a restart; clients re-register on the new URL). Logs: `journalctl -u cua-relay` and `journalctl -u caddy`.
The standing setup and its acceptance run: `docs/evidence/2026-10-06-hosted-relay-acceptance.md`.

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
needed). A client with the cua plugin adds the device once, its credential stored under `clientSecretKey`
(`/secret <key>`), with the `devicesAddCommand` that `enroll --json` printed
(`cua devices add <name> --relay https://<relay> --device=<deviceId>`, or `cua devices import <client config>`), and
switches to it in any session with `devices_use <name>`; a client without the plugin registers the endpoint itself:
`claude mcp add --transport http cua_repl https://<relay>/d/<deviceId>/mcp --header "Authorization: Bearer <client credential>"`
(the cua README, "Remote control", 4 and 5).
The agent follows the Mac's `device.json` while it runs, so moving a device to another relay (`cua remote enroll
--relay <new url>`) needs no restart: the agent redials the new URL by itself. A `cua remote enroll --rotate` changes
both hashes: replace the line and restart the relay (the agent, which already refuses the old client credential and
has ended the sessions opened with it, reconnects with the new device credential), and give clients the new
credential (stored under the same key on the plugin route, registered again on the standalone one).

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
