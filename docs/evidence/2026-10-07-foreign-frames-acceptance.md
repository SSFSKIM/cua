# #81 evidence: other extensions' frames and popups on the cua route, live on this Mac

Spec: `docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md`, Decision Log 2026-10-07 (#81). Run
2026-10-08 02:47–02:53 UTC, macOS 26 arm64, Google Chrome 154.0.8037.98, Node 22.23.2, pinned runtime
`26.928.40906-darwin-arm64`. The owner removed the stale `cua` card and loaded `extension/` unpacked from this worktree
in profile `Default` ("personal"): id `jkejaaijdfpohkdhankllbekkhmnippb`, version 0.2.0. Scratch home
`CUA_HOME=/tmp/cua-h3.qCqI8E` (never logged in; `state/codex/auth.json` absent before and after; `cua login` not run,
`CODEX_HOME` not set). The owner's input-helper extension `pejdijmoenmkgeppbflobdenhhabjlaj` stayed enabled.

**What was measured:** the extension and host of commit `59bbcf5` (the host ran from a detached checkout of that commit,
so the review fixes landing meanwhile could not change it mid-run). The review fixes in `d7970a5` (a 1.5 s bound on
the pre-attach sweep, unguard not awaited at turn end, the popup interceptor in the top frame only and for new-context
opens only) were proven under the stub, not live; they need the extension reloaded.

**Result: fixed.** The pm-probe page went from 0/8 fills (before, same Chrome, same helper) to 8/8, twice, and the tab
never wedged. A page's `window.open` from an agent tab appeared in the session's tabs without a claim. The cua-route
acceptance runner passed 40/40. The vendor manifests were byte-identical before and after.

## Steps

- `node bin/cua.mjs chrome register --replace` (from the pinned checkout): `placed` for chrome, edge, brave, opera,
  vivaldi; `previous launcher recorded: none`. The host socket `chrome/b/cde28f0485f4.sock` appeared within 2 s; its
  status names extension 0.2.0, protocol 1, instance `ef1e8c42-…`.
- `node bin/cua.mjs profiles bind personal`: bound `ef1e8c42-…` automatically by directory, replacing the stale
  binding `d132fc92-…` (the old unpacked load's instance, removed with its card).
- The probe (`pm-probe/fix-81/probe.mjs`, the earlier probe with the worktree's paths, a value read-back, the frames
  seen after each focus, and a popup cell), twice; then `node scripts/accept-chrome.mjs --live --route cua --profile
  personal --report …`; then `node bin/cua.mjs chrome unregister` (`removed` ×5, nothing to restore).
- Vendor manifests (`com.openai.codexextension.json` in 8 browser directories): sha256 identical before and after.

## The probe (password and text field, 4 trials each, focus then fill)

| Run | Fills | Text read-back | Helper frame after focus | Tab wedged |
|---|---|---|---|---|
| before (#81 report, main `3bf2e2d`) | 0/8 | — | (refusal) | yes, every later call |
| 1 | 8/8 | 4/4 | present, `srcdoc=""` in every trial | no |
| 2 | 8/8 | 4/4 | present, `srcdoc=""` in every trial | no |

- After every focus the helper's frame was in the page with `src=chrome-extension://pejdijmoenmkgeppbflobdenhhabjlaj/
  completion_list.html?…` and `srcdoc=""`: the guard blanked it. The host log has no attach refusal at all, so the
  sweep-and-retry path was never needed live.
- Run 1 had one cell error (trial 2's focus cell: `Detached while handling command.` on its `goto`); the fill that
  followed passed. The host log shows four `Detached while handling command.` answers across both runs, all on
  `Page.navigate`/`Page.enable` right at a navigation; the calls after each succeeded (the service re-attached). The vendor route showed
  the same kind of single detach in its rerun. Likely cause: the helper draws its frame into the new document before
  the guard is injected at commit (`tabs.onUpdated` url); recovery is the service's re-attach, whose sweep finds the
  frame blanked. Logged as debt.
- The password field's value after a successful fill was not the probe's marker (10 characters, not the 17 typed) in
  all 8 password trials. Something in the profile replaced it after the fill; the value itself was deliberately not
  read (it may be a stored credential). The text field round-tripped exactly 4/4.
- Timings: tab creation 241 ms and 295 ms; `goto` 114–199 ms.

## The popup (run 2)

The probe page's button calls `window.open('/popup-target?n=…')`; the agent clicked it with a Playwright locator.
`cua.listTabs()` listed the new tab 4 ms after the click (`http://127.0.0.1:…/popup-target?n=…`, title `pm-popup`);
`cua.getTab(id)` bound it and read its marker. The host status file showed it in the session as `origin: created`,
attached, and the host log has `session 7b653c2d-… took popup tab 1030414639 from tab 1030414632`. No claim and no
elicitation. Run 1's popup cell did not get that far: its first `goto` answered `Detached while handling command.`
(above) and that version of the cell did not retry; run 2's cell retries the `goto` once.

## Acceptance runner (cua route)

`accept-chrome --live --route cua --profile personal`: status PASS, 40/40 steps, `codexAuthPresent: false`, `goto`
90–470 ms, leftover none. The C2 page still uses its plain text field (the H3b workaround), so this run proves the
guard changes nothing on the existing paths; it is not a password-field test.

## The host log

The run's log (`$CUA_HOME/chrome/logs/cde28f0485f4.log`) now names every refusal, which is how the detaches above were
attributed. 34 refusal lines, of three kinds: `debugger.sendCommand … Page.navigate: Detached
while handling command.` and the commands racing it (`Debugger is not attached to the tab with id: N.`);
`Page.removeScriptToEvaluateOnNewDocument: {"code":-32000,"message":"Script not found"}` (the service's own cleanup,
harmless); and `tabs.guard {"tabId":N}: Cannot access contents of url "about:blank". Extension manifest must request
permission to access this host.` (the pre-attach sweep of a just-created tab; expected, ignored). Chrome's wording for
the last one is now the stub's.
