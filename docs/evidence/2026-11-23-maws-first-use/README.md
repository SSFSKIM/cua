# #493 MAWS first use: live run in a MAWS session (2026-11-23)

Head 26696f62 (`fix/493-maws-first-use`, PR #498). The owner ran both commands from a detached worktree at that head, in a fresh MAWS session's Bash, so `CUA_BROWSER_BACKENDS` was mawsd's socket. MAWS's Settings were not changed (ruling 1120).

## 1. The ticket's literal path, on the vendor host: [literal-vendor.json](literal-vendor.json): PASS

`node scripts/accept/maws-features.mjs --steps literalVendor --report …`. This starts a second `cua serve` the way a MAWS session runs one: `CUA_SHIM_SURFACES=computer,browser`, with `CUA_NATIVE_ENGINE` and `CUA_REPL_HOST` removed, so the default host applies. Every result came back without `_meta['cua/replHost']`, so the host attested as `vendor`. The step makes five separate `js` calls, then `end_task`:

| Call | Result |
|---|---|
| `cua.getBrowser()` | `maws:` instance; the first-use document names it "- Name: MAWS in-app browser (maws)" |
| `createBrowserTab(id, url, {visible: true})` | throws `Capability is not available: visibility` (the vendor host's declared limit, #496) |
| the same open without `visible` | page marker matches; tab closed |
| `createBrowserTab("maws", url)` | marker matches, tab listed in the same browser; closed |
| `getBrowser({id: "iab"})` | miss lists the browser ids and the `profiles_list` keys, including `"maws"` |

No elicitations. Two page requests, both served from 127.0.0.1.

## 2. cua's own host, browser-only: [maws-features-493.json](maws-features-493.json): PASS

`--steps profiles,service,firstUse,mawsKey,keyMiss`. The profile inventory lists `maws` as ready. The browser service is cua's. On first use the MAWS instance is named, and `{visible: true}` is ignored with a note. `"maws"` selects the MAWS browser. The `iab` miss lists ids and keys.

## Not covered
- The vendor host's `{visible: true}` throw remains: #496, blocked by #117's switch of the macOS default.
- `chromeKey` was not selected (no Chrome profile key was exercised in this run). The profile-selection invariant is covered by the table-driven test (ruling 1112).

## Redaction
In `maws-features-493.json`, the `personal` profile's extension instance id and the `school` profile's Chrome profile directory are replaced with `<redacted: …>`. They are owner details in a public repository. The MAWS instance id and the mawsd socket path are per-session and kept as recorded.
