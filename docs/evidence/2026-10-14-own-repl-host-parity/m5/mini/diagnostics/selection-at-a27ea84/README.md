# Selection lane at a27ea84 (product e24a1cd, selection oracle 30094d0 + 6c79de0): 238/260 rows pass, 23 failures

```sh
node scripts/repl-parity.mjs   prepare --device mini --commit a27ea84887ca4d53f1888dab20a53d49bbe280dc --profile ssfs
node scripts/browser-parity.mjs prepare --device mini --commit a27ea84887ca4d53f1888dab20a53d49bbe280dc --profile ssfs
node scripts/repl-parity/selection.mjs --device mini --node22 /Users/new/.nvm/versions/node/v22.18.0/bin/node --out <this dir>
```

Run 2026-10-16 18:07–18:09 UTC on the mini (harness Node v24.18.0, Node 22 v22.18.0; load in `load.txt`). All 260 planned
rows were evaluated (`selection.json` `rows`), the job check passed (`explicitNodePersisted`, `implicitNodeOmitted`,
service-manager double), and the selection homes under `~/.local/share/cua-parity-selection` were removed afterwards.
ssfs was ready before and after. Every row's host and reason agree with the independent table; every own-host answer
attested the managed Node.

## Failure 1: 22 rows, the oracle's "/MAWS/" route assertion

Every MAWS client-mode row (`maws:true`) whose home also carries a cua registration (`cua` or `chatgpt-then-cua`) fails
only `assert.match(doctor.detail,/MAWS/)` (`scripts/repl-parity/selection.mjs`, the route branch for `row.maws`). Host,
reason, status and the answering host all pass. Doctor names the registration that decided the cua route, not MAWS. The
MAWS rows on homes with no registration, `chatgpt` or `cua-then-chatgpt` name MAWS and pass.

| Row | Registration | Surfaces | Lane | Override | Doctor's browser route |
|---|---|---|---|---|---|
| 121 | cua | browser | ordinary | unset | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:20 |
| 122 | cua | browser | ordinary | cua | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:20 |
| 123 | cua | browser | ordinary | vendor | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:20 |
| 125 | cua | browser | profiles | unset | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:20 |
| 126 | cua | browser | profiles | cua | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:20 |
| 127 | cua | browser | profiles | vendor | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:20 |
| 137 | cua | computer,browser | ordinary | unset | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:20 |
| 139 | cua | computer,browser | ordinary | vendor | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:20 |
| 141 | cua | computer,browser | profiles | unset | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:20 |
| 142 | cua | computer,browser | profiles | cua | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:20 |
| 143 | cua | computer,browser | profiles | vendor | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:20 |
| 217 | chatgpt-then-cua | browser | ordinary | unset | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:21 |
| 218 | chatgpt-then-cua | browser | ordinary | cua | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:21 |
| 219 | chatgpt-then-cua | browser | ordinary | vendor | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:21 |
| 221 | chatgpt-then-cua | browser | profiles | unset | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:21 |
| 222 | chatgpt-then-cua | browser | profiles | cua | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:21 |
| 223 | chatgpt-then-cua | browser | profiles | vendor | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:21 |
| 233 | chatgpt-then-cua | computer,browser | ordinary | unset | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:21 |
| 235 | chatgpt-then-cua | computer,browser | ordinary | vendor | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:21 |
| 237 | chatgpt-then-cua | computer,browser | profiles | unset | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:21 |
| 238 | chatgpt-then-cua | computer,browser | profiles | cua | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:21 |
| 239 | chatgpt-then-cua | computer,browser | profiles | vendor | the cua route, by cua's registration (cua chrome register) of 2023-11-14T22:13:21 |

Which side states the route (doctor naming the deciding registration, or the oracle requiring MAWS whenever MAWS client
mode is present) is a ruling, not an executor call.

## Failure 2: the cache check

`check cache: ENOENT: no such file or directory, scandir '<selection home>/state/handshake'`. The check makes two
`ordinaryCall`s with `CUA_REPL_HOST=cua`, then reads the handshake records. `ordinaryCall` sends `initialize` and `js_reset`
only. The product records a handshake when the runtime answers a live `tools/list` (`src/mcp/lazy-runtime.mjs`
`fromRuntime`: `records.write` follows the `tools/list` answer), so no record exists for the check to read. As built, the
check cannot pass without a `tools/list` in the call; the cache reuse, version-namespace miss and cross-host checks after
it did not run.
