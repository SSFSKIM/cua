# Inputs for the browser-strategy decision (#10), as of 2026-10-05

Issue #10 asks whether cua's browser route stays on OpenAI's ChatGPT Chrome extension and native host, moves to an
extension of our own, or returns to the Playwright extension route (`wip/m8-playwright-transport`). The decision is
scheduled for a live brainstorming session after about two weeks of real use. This page gathers what the first day of
real use, the spikes and the benchmark already answered, item by item against the inputs the issue named, so the
session starts from evidence rather than memory. Each line names its source.

## The issue's four inputs

**1. How often bindings go stale.**
- Seen once in one day: `school` on the first Mac went `binding_stale` (its store records an instance id that is not
  live) after the extension in that profile went quiet; a wake (click the extension icon) and `profiles bind` repair
  it. Toggling the extension does not always mint a new instance id (second-mac acceptance, Observations).
- Mitigation shipped: `profiles bind` labels candidates with the vendor's `profileName` (#21 step 1, PR #27) and, since
  PR #45, with the Chrome profile directory computed by cua itself, and binds automatically when the registered
  directory's store names exactly one live backend. A stale binding is now a one-command repair with no guessing.
- Still open: readiness cannot tell "host asleep" from "rebind needed" (`binding_stale` covers both); PR #45 notes the
  directory map could split them but `cua serve` may lack Full Disk Access to read the stores.

**2. Host lifetime and how often users must wake the extension.**
- Spike #7 refuted the one-minute idle exit: hosts on both Macs lived hours with no client; the host binary's only
  exit paths are Chrome-side stdin EOF and stdout failure; the MV3 worker-idle explanation is unsupported (Chrome 154
  on both Macs, native port retained since Chrome 105). The historical short-lived hosts on the mini are unreproduced;
  `scripts/probe/host-exit-capture.mjs` (#41) records the next one. A recorder run on the mini on 2026-10-06 saw no
  exit in its first hours.
- Practical rule today: with Chrome open and the extension awake, a host serves for hours. The user wakes the extension
  by clicking its icon when readiness says `host_not_live`.

**3. Impact of extension updates on the pinned shape.**
- One update observed (1.2.27236 → 1.26.901 on the mini) produced a transient `extension_not_installed` while the
  directory was mid-update, and no change to the wire shape cua pins (`client_timeout_ms` was the earlier one).
- The extension's `background.js` is identical across both Macs at 1.26.901.11451 (spike #7), so the shape is stable
  across machines at one version. Nothing yet measures a shape break at the next version; the acceptance runners
  (`accept-chrome`) would catch it.

**4. The cost of the Codex login requirement.**
- One-time `cua login` per CUA_HOME; `codex login status` is the only later use. No re-login was needed in the day's
  work (benchmark, dogfood, spikes). Cost so far is the install-time step and the doctor row.

## What the benchmark added (docs/evidence/2026-10-05-browser-route-benchmark/)

| | playwright-cli bridge | cua_repl (ChatGPT extension) |
|---|---|---|
| Capability | fixture 8/8, MiniWoB 13/15 | fixture 8/8, MiniWoB 15/15 |
| Per-call latency | 0.25–0.8 s | first tab 60 s, then ~0.5 s per `goto`; 3 s locator cap |
| Total wall (same tasks) | 13 min 38 s (incl. ~3.5 min tab-contention pause) | 7 min 10 s |
| Shares the owner's live Chrome | actions stall 5 s each when the tab is hidden; two episodes lost | worked from a background tab of a 9-tab window |
| Token hygiene | extension token echoed in `attach`/`tab-list` output | results redacted (#24) |
| Page globals | readable | invisible (read-only isolated world); console via `tab.dev.logs` |

Reading for #10: for an agent that shares the user's open Chrome, the cua route's independence from tab visibility is
the decisive property; the Playwright route is the lower-latency choice when the tab can be kept in front.

## What the spikes fixed in the route's API model (vendor limits, not cua bugs)

- 3 s cap on locator actions, waits and evaluate; `timeoutMs` only shortens (#25).
- `evaluate` is a read-only isolated world: no page globals, no `fetch`/`require`, also no `parseFloat`,
  `document.hasFocus` (#26 side observation).
- `press` needs a focusable target (a frame body never passes the focus check); `cua.type` pastes; menus are not closed
  between calls, sites close them (#26).
- `locator(sel, {hasText})` ignored; `screenshot({clip})` in page coordinates (benchmark).
- Under `scoped` sandbox cells have no network; `disabled` opens it (#33, #36).

## What the first real task showed (docs/evidence/2026-10-05-homework-1b-dogfooding.md)

A graded ten-question assignment completed 26/26 in the signed-in `school` profile through nested iframes, custom
dropdowns and canvas graphs; 1h22m wall, 78% outside tool intervals. Rough edges were all addressed the same day:
host notes (#23), result redaction (#24), the spikes above, labelled bind (#21).

## Questions the two weeks should still answer

- How many stale bindings and `host_not_live` waits per week of normal use, and whether the user ever had to rebind
  without an extension change.
- Whether an extension version change breaks the pinned wire shape or only the transient presence check.
- Whether the 60 s first-tab open and the 3 s cap cost real tasks time, now that the host notes teach the loop pattern.
- Any case where the cua route could not do what the Playwright route could (page globals were the only one so far,
  and `tab.dev.logs` covered it).

## Options as they stand

1. **Stay on the ChatGPT extension route** (status quo): no extension of our own to maintain, works in the user's real
   profiles, independent of tab visibility; costs are the vendor's API limits above, the Codex login, the pinned wire
   shape and the vendor's update cadence.
2. **Own extension + host speaking the host's protocol**: removes the vendor extension and login dependency and could
   lift the 3 s cap and the read-only evaluate; costs a store listing or developer-mode load, our own update channel,
   and reimplementing the browser-use protocol the vendor service expects.
3. **Playwright extension route** (`wip/m8-playwright-transport`): lowest latency and full page access; costs the
   tab-visibility dependence and the token echo seen in the benchmark, both of which would need fixing in the bridge
   rather than in cua.
