# S0 evidence: the vendor service without `agentRequestHeaderEnabled`, no login; the extension key

Spec: `docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md`, milestone S0. Run on 2026-10-07, macOS 26
arm64, host Node 22.23.2, pinned runtime `26.928.40906-darwin-arm64` (`@oai/browser-desktop` 0.1.1)
installed with `node bin/cua.mjs install` into a scratch `CUA_HOME=/tmp/cua-s0.XXXXXX` (never `cua login`). Each
launch had its own fresh `CODEX_HOME` under that home; `auth.json` was absent there before and after every run
(existence check only).

**No Chrome.** The backend is a recording stub (`scripts/probe/chrome/no-header.mjs`) that answers `getInfo` with
the shape cua's host will send — `{type:"extension", family:"chrome", name:"cua", version, capabilities:{browser:[],
tab:[]}, metadata:{extensionInstanceId}}`, no `agentRequestHeaderEnabled`, no `metadata.extensionId` — plus
`getTabs`/`createTab`/`attach`/`detach`/`turnEnded`; it refuses every CDP command and answers everything
else with the vendor's `No handler registered for method: <m>`. A session request "reached the backend" when its
frame arrived at the stub. The launch environment is the M7 harness's allowlist plus production's
`BROWSER_USE_AVAILABLE_BACKENDS=chrome`; the vendor launcher's own browser service is used (not cua's trusted
wrapper, which delegates `handleRpc` unchanged).

## Commands

```sh
export CUA_HOME=$(mktemp -d /tmp/cua-s0.XXXXXX); node bin/cua.mjs install
node scripts/probe-chrome-contract.mjs --vendor --network default --report /tmp/cua-s0-a.json   # (a), ~19 s
node scripts/probe-chrome-contract.mjs --vendor --network off --report /tmp/cua-s0-b.json       # (b), ~24 s
node scripts/probe-chrome-contract.mjs --fixtures --report /tmp/cua-s0-fixtures.json            # M7: 15 PASS
node scripts/probe-chrome-contract.mjs --vendor --report /tmp/cua-s0-m7.json                    # M7: 12 PASS, 1 BLOCKED (as recorded)
```

Each `--network` run launches the vendor three times: `no-header` (the cua getInfo), `header-control` (the same
with `agentRequestHeaderEnabled:false`) and `discovery` (four listed paths). `BROWSER_USE_DISABLE_AMBIENT_NETWORK`
appears only in the `off` runs; the harness also plants it (and a fake token and `BROWSER_USE_SECURITY_MODE`) in
the ambient environment to show none of them leak into a `default` launch (`s0-launch`).

## Results (two runs of each, all PASS)

| Scenario | (a) network default | (b) network off |
|---|---|---|
| `s0-launch` | PASS | PASS |
| `s0-a-…` / `s0-b-…`: getTabs, createTab, attach, turnEnded reach the backend; no identity error | PASS | PASS |
| `s0-control-header-field-present`: nothing but getInfo reaches the backend | PASS — `Codex auth token is unavailable` | PASS — `Browser request-header policy requires caller identity.` |
| `s0-c-backend-paths-live-and-dead` | PASS | PASS |
| `s0-c-mute-listener-cost` (observation) | PASS | PASS |
| `sentinel-non-disclosure` | PASS | PASS |

**(a) PASS — the design stands.** Under the vendor's default network, with no login, the cua-shaped backend received
`getInfo, getUserTabs (No handler), getTabs, createTab, attach, executeCdp ×6 (refused), getCommittedTabUrl (No
handler), getTabs, detach, turnEnded` — the same sequence as with the network off. The control under the same
default network failed with `Codex auth token is unavailable` (node_repl's authenticated fetch, as in M9): identity
initialization *was* attempted and failed, and the omission of the field is what keeps the session requests clear of
it. The documented browser API was identical in both networks (30 329 characters, same members), so no network-
dependent gate changed the agent's surface.

**When the first session request arrives.** Identity initialization adds no wait: the first session request reached
the backend 6–29 ms after the cell that issued it started, in both networks. From spawn: handshake 0.3–0.6 s warm
(3.7 s on the first, cold-disk launch); the first `listBrowsers` call costs 0.5–0.8 s (worker start); the first
session request arrived 1.2–2.2 s after spawn warm (9.4 s cold).

| Run | spawn → handshake | spawn → first session request | call → first session request |
|---|---|---|---|
| a (1) | 491 ms | 1 383 ms | 6 ms |
| a (2) | 563 ms | 2 229 ms | 29 ms |
| b (1, cold disk) | 3 722 ms | 9 357 ms | 11 ms |
| b (2) | 431 ms | 1 185 ms | 11 ms |

**(c) PASS — the discovery rule holds.** `BROWSER_USE_BACKEND_PATHS` = absent path, stale socket file (its
listener SIGKILLed), a path with nothing yet, then the live socket (dead paths first). The first `listBrowsers`
listed exactly the live backend in 228–353 ms (measured inside the cell). After the harness started listeners at the
absent and the stale path (unlinking the stale file first, as the host will), the next call listed all three in
5–47 ms. Absent paths and refused stale files fail immediately on macOS; the 1 s connect bound was never approached.

**Observation: a listener that accepts but never answers.** When a listener appeared at the fourth path and never
answered `getInfo`, `listBrowsers` took 5 005–5 026 ms and still listed the three answering backends: the vendor's
5 000 ms `getInfo` bound (`BS:67475`, `BS:67627-67640`), not the 1 s connect bound, is the worst case per wedged
backend per call. A host must therefore answer `getInfo` from the moment it listens (it listens only after `hello`,
so it can), or a wedged one costs every `listBrowsers` 5 s.

**Observation: the runtime's own network.** In every launch, `network off` included, the owned process group held
`codex`, `git` and `git-remote-http` processes and established outbound TCP connections (1 with the switch, 3
without; counts only, hosts not recorded). The switch is browser-service-scoped; the `codex` app-server that
node_repl starts does its own fetching. It needs no login and did not affect any result here.

## Artifact: the extension key

`openssl genrsa 2048` (OpenSSL 3.6.3, PKCS#8 PEM) → `~/.config/cua/extension-key.pem`, mode 0600, directory 0700;
never printed, not in git. Derived with `openssl pkey -pubout -outform DER` and cross-checked in Node
(`createPublicKey` → RSA 2048; sha256 of the DER, first 32 hex chars, `0-f` → `a-p`):

- `CUA_EXTENSION_ID` = `jkejaaijdfpohkdhankllbekkhmnippb`
- manifest `key` (public key, SPKI DER, base64; public by design, it ships in `extension/manifest.json`):

```
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApCrhXD2s4AbSBxHsJxiAaEHRdamtfTiRhMLNZcbhEuQUS3PgbguhQHOTqwXxOF/GKaFb6LgDtGB9qQBtiZkGbq+KL0QlDAVsgBLYMGkQbS7ceohkyHBHXcwLCPW/bq4U48U3eNy8VK4EMTrMX1Mr/k+BxbttbLJ5LQahM8dhS6a9r+9TMMoaVUHaCC7PNVQiVCaCUTJ9EvgIfy+ijFByg2lBTv0vU8Kjqpkhnta184YbSbSxx4eWGQ+ZBEFlTHI00uardYziUmlbX31n35B4lZ9UOkiFFwKpI7gQ9dddLr/87QWcXK3ZVoWokIM1uW/h7lT8hFy/DATTPXItmuvytQIDAQAB
```
