# M5 (task 2): the capability-host group, and the MAWS probe and Linux runners on the default selection

Spec `docs/doperpowers/specs/2026-10-13-own-browser-service-design.md`, M5. 2026-10-14. The cua branch
`feat/own-browser-service-m5` at 237f91e, after task 1 and its refinement landed (a838239: with CUA_BROWSER_SERVICE
unset, a home with cua's Chrome registration, or MAWS client mode, gets cua's service; otherwise the vendor's). The
MAWS and Linux cua passes leave CUA_BROWSER_SERVICE unset, so that default answers; each has a control run with
CUA_BROWSER_SERVICE=vendor; every run attests which service served it (the documentation's `cua browser service`
marker against the requested selection).

## Capability-host group (raw CDP, WebMCP, auth handoff, history)

`capability-host/diff.txt`: how it runs and where (this Mac, real `cua serve` and REPL client, the test backend
`test/browser-parity/capability-host.mjs` as the only backend), vendor against vendor 0 differences, vendor against cua
0 unexpected differences (5 expected, all in the auth handoff's `qr` cell).

## MAWS client mode (acceptance 8): PASS on the default (cua), vendor control PASS

Run from a clean detached worktree of 237f91e (`/tmp/cua-m5-clean`, removed afterwards; the shared worktree had another
task's uncommitted edits), the same MAWS worktree (detached at origin/master d33de1c4, unchanged) and scratch home
`/tmp/cua-m4-home` (the runtime only; no Chrome registration, so MAWS client mode is what selects cua) as M4:

```
MAWS_E2E_QUIET=1 /tmp/maws-review/waitload20.sh && MAWS_E2E_QUIET=1 /tmp/maws-review/with-slot.sh \
  env -u CUA_BROWSER_SERVICE MAWS_CHECKOUT=<MAWS worktree> CUA_HOME=/tmp/cua-m4-home \
  node docs/evidence/2026-10-13-own-browser-service-parity/m4/maws-live/run.mjs --out m5/maws/maws-live-default.json   # exit 0
... the same with env CUA_BROWSER_SERVICE=vendor --out m5/maws/maws-live-vendor.json                                    # exit 0
```

| check | default (`maws/maws-live-default.json`) | vendor control (`maws/maws-live-vendor.json`) |
|---|---|---|
| verdict, exit code | PASS, 0 | PASS, 0 |
| service: requested / served | cua / `cua browser service 0.1.0` | vendor / vendor |
| maws-features (profiles, service, createTab, locator, viewport, popup, download, alert, confirm, chooser, cleanup, isolation) | all PASS | all PASS |
| `hello.profileName` | `MAWS` (instance `maws:m4-A`) | same |
| `cursor.move` | messages 0 → 4 on a locator click | 0 → 4 |
| announced capabilities | browser `[viewport]`, tab `[]` | same |
| takeover, default budget | fails at 3,014 ms "Playwright selector deadline exceeded", `#state` waiting | fails at 3,033 ms, same |
| takeover, `click({timeoutMs: 15000})` | succeeds at 3,251 ms (3,269 ms after the person's click), `#state` submitted:x | fails at 3,025 ms (the 3 s cap) |
| serve exit | 0 | 0 |

The e2e group `pnpm e2e:browser-cua` was not re-run: it drives MAWS's fake host and never starts cua (M4 README), so
the default cannot reach it. (Earlier the same day, at e14c74c, a default run was taken from the shared worktree while
task 1's route-aware default was uncommitted there; it is superseded by the run above.)

## Linux (acceptance 9): PASS on the default (cua), vendor control PASS

The cua-linux VM as in M4: `~/cua-m4` at 237f91e (`git checkout --detach`, `npm ci`), its launcher registered from
`~/cua-m4` for the runs (`node bin/cua.mjs chrome register`, CUA_HOME=/home/admin/.local/share/cua-h4, a home with
cua's registration record and no vendor record; `cua doctor`'s new row reads "browser.service: cua ... CUA_BROWSER_SERVICE
is unset and this home has cua's Chrome registration"), Chrome started with `--profile-directory=Default
--disable-extensions-file-access-check about:blank` in the X session, then stopped, and the launcher registered back to
`~/cua` afterwards.

```
cd ~/cua-m4 && export DISPLAY=:0 XAUTHORITY=/home/admin/.Xauthority CUA_HOME=/home/admin/.local/share/cua-h4 CUA_SHIM_SURFACES=browser
unset CUA_BROWSER_SERVICE
node scripts/accept/linux-chrome.mjs me                                   # exit 0, PASS
node scripts/accept/linux-chrome-features.mjs                             # exit 0, PASS
CUA_BROWSER_SERVICE=vendor node scripts/accept/linux-chrome.mjs me        # exit 0, PASS
CUA_BROWSER_SERVICE=vendor node scripts/accept/linux-chrome-features.mjs  # exit 0, PASS
```

`linux/linux-{chrome,features}-default.json`: every step PASS, "the selected browser service answers" requested `cua`
(the default), served `cua browser service 0.1.0`. `linux/linux-{chrome,features}-vendor.json`: every step PASS,
requested and served `vendor`. The one SKIP on the features runs is informational, as in M4 (the raw-CDP download
alternative: the host announces no `cdp`).

# M5 (task 3): the live checks on the default selection, and the gates

2026-10-14, 15:28 to 15:40 UTC. The mini's parity clone `~/Developer/GitHub/cua-parity` at 6c89167 (the branch head
then; `browser-parity.mjs prepare --device mini --commit 6c89167 --profile ssfs`, which also confirmed ssfs bound and
ready), its home the mini's default `CUA_HOME` (the resident agent's, shared). Every run starts its `cua serve` with
`env -u CUA_BROWSER_SERVICE`, so the launch resolves the service itself: the clone's own `browserServiceFor` read
`{route: cua, service: cua, reason: cua_route}` for this home, and the first-call documentation carried the marker
`cua browser service 0.1.0` (attested against that resolution before any case ran).

The harness's `run` always sets CUA_BROWSER_SERVICE, so these runs use `live/session.mjs`, which keeps the harness's
pieces (its MCP client, fixture process on 48732, runner, cell envelope and attestation) and replaces only the serve
command; it drives all of a run's cases through one serve, one after another (one whole session), and with
`--network` it runs `live/sampler.mjs` on the mini beside it and lists `$CUA_HOME/state/codex` before and after
(`live/codex-listing.mjs`). `live/summarize.mjs` condenses a run into `summary.txt` and `codex-diff.json`.

## Network and disk (acceptance 7, live half): no TCP or UDP at all from the serve tree; browser/ unchanged

`network/session-3/` (16:11 UTC; the parity clone was at 8e10092 by then, re-prepared for the scripted drag check,
the same service code as 6c89167) is the reference run: setup and browser selection, then 31 cases in one serve, all
ok: tabs/discovery, examples/tabs, tabs/navigation, tabs/manual-handoff-disabled, reads/locators, reads/snapshot,
reads/frames, evaluate/read, evaluate/mutation, evaluate/counter, evaluate/context-loss, actions/locators,
actions/strict-error, actions/slow-budget, input/coordinates, input/dom, waits/page, screenshot/modes,
screenshot/clip, dialogs/alert, downloads/chooser, capabilities/clipboard, capabilities/logs, capabilities/viewport,
capabilities/cursor, the M3 features as the corpus has them on this host (capabilities/export-rejections,
capabilities/page-assets, capabilities/m3-members, capabilities/m3-disabled, capabilities/history), and
`live/m3-raw.mjs`, which sends the M3 commands the client does not offer here through node_repl's browser RPC: the
bot-detection report answers `{status: 'reported', hostname: '127.0.0.1'}` locally; the user's tab context and
history are refused by the host ("No handler registered for method: executeTabRead" / "getUserHistory"); WebMCP and
browserAuth are refused as not announced ("cua does not support command ..."; a stale-registration refusal for
invoke); the generic content export is not served.

How it was observed (`live/sampler.mjs`): the serve tree is the serve pid and every process whose ancestry reaches it
or that belongs to a tree process's process group (which a descendant keeps when launchd adopts it), learned from
`ps` every 250 ms and, for every process nettop reports, from its ancestry read at that moment (through the last ps
row any table had, for one that already exited), so a descendant born between two ps snapshots that does network I/O
is still attributed. A reported process counts as outside only when its ancestry reaches launchd or a process already
known to be outside; one whose ancestry cannot be read that far (an ancestor no ps table listed, a cycle) is listed as
unresolved with its bytes and connections, never dropped. What is left unseen: a descendant that launchd adopted and
that also left the tree's process groups before any ps table listed it (macOS keeps no original parent for a user
to read). One continuous `nettop -L 0 -s 1 -n -x` over every process, under `script`'s
pseudo-terminal so each sample arrives as it is taken (into a pipe nettop block-buffers, in bursts about 4 s apart),
keeps the tree's connection rows (with endpoints) and process rows (whose byte totals include flows too brief for a
connection row); `lsof -nP -p <tree>` every second lists internet sockets, Unix sockets (each peer named from a
machine-wide `lsof -U`, a tree holder preferred for a socket several processes inherited) and files under
state/codex. The spec's `nettop -P -L 0 -p <pid>` was widened this way because `-P` drops the per-connection
endpoints and `-p` cannot follow a tree that grows during the session. Coverage is checked, not assumed: nettop must
have printed a sample before the serve starts (the driver waits for the sampler's ready line), never exit or fall
silent for more than 5 s, and ps and lsof must not fail; a lapse fails the run (`live/collector.mjs`, which also
always settles: a sampler that exits early is a failed observation, and the fixture and scratch are released
regardless). `live/observation.test.mjs` tests these offline (9 tests: attribution of a descendant only nettop saw,
an exited unseen one as unresolved, the ancestry rules over a scripted process table (tree parent, adopted process
in the serve's group, launchd's, under an outsider, a missing ancestor and a cycle, the last two unresolved with
their connections), a collector that exits, never prints or falls silent, a sampler that exits early,
hangs or reports lost coverage, and readiness). `network/sampler-control.json` is the positive control on the mini
with this sampler (coverage held, ready in 1 s, samples about every second): a child holding a TCP connection is
attributed with both endpoints (nettop and lsof), and a child whose only activity was one brief connection and one
datagram, never shown as a connection row, still shows in its nettop process row (5 bytes out).

`network/session-3/summary.txt`, the verdict:

| observation | result |
|---|---|
| coverage | held: nettop ready before the serve, 39 samples, longest silence 1,021 ms, running until stopped |
| serve tree | serve, two anchors (`src/mcp/anchor.mjs`) each with the vendor runtime and its node_repl supervisor, and two `codex sandbox` wrappers running the REPL kernel and the trusted worker (where the browser service runs); no `codex app-server` process at any time |
| TCP/UDP | none: no tree process ever appeared in nettop, no reported process was left unresolved, lsof saw no internet socket |
| Unix-socket peers outside the tree | one: the node_repl supervisor to cua's Chrome host (`src/chrome/host.mjs`, Chrome's child) — the extension socket |
| `state/codex/browser/` | 947 files before and after (vendor runs elsewhere had added ten since session-2), listing and content digest unchanged |
| other `state/codex` changes | `tmp/arg0/codex-arg0*` directories created by the two `codex sandbox` processes (lsof shows each holding its `.lock`) and an earlier run's swept, and `node_repl/active_execs`' mtime: the runtime's own (#115), none the browser service's; and `models_cache.json` rewritten at the same size, which no tree process held at any sample: it is rewritten about every 270 s whether a session runs or not (15:58:41, 16:03:11, 16:07:42 between runs, 16:12:12 UTC), a periodic refresh by a long-running process outside the tree (the home's other runtimes run a `codex app-server`, pid 5726, a resident session's since 10-11; the tree never had one) |
| fixture server | not a peer of the tree at all: Chrome fetches the pages, page assets and exports |
| processes left | none (serve exit 0; no tree process alive at the end; nettop, the sampler and the mini's `/tmp` scratch gone) |

The runtime's own Codex app-server traffic the spec anticipated for #115 did not occur: no app-server ran in the
tree. session-3 was taken three times with the same TCP/UDP verdict: an attempt at 16:02 (discarded, not committed)
named a short-lived `node` holding the serve's inherited stdio socket as an outside peer, which the tree-holder
preference above corrects; the run at 16:04 (committed in 7ad3daf, replaced) classified a reported process whose
ancestry stopped at an unlisted ancestor as outside, which the rule above now leaves unresolved, so its verdict could
not be re-derived from what it kept and the session was re-run at 16:11 under the corrected rule.

Qualification of the earlier runs, taken with the first sampler (`network/session-1/`, `network/session-2/`,
`acceptance/run-1/`): the same verdict (no tree process in nettop, no internet socket in lsof, the one Unix peer, browser/
unchanged), but that sampler recorded no coverage (nettop's liveness and silences were not checked, and its rows came
in block-buffered bursts, so the final burst before it was stopped, within the 5 s wind-down after the serve exited,
may not have been read), and it added a descendant to the tree only when a 250 ms ps snapshot saw it, so a descendant
born and gone between two snapshots would not have been attributed. Their summaries say so. session-1 also had two
case failures outside the service: `live/m3-raw.mjs` had not yet read the WebMCP and browserAuth documentation those
commands require first (fixed from session-2), and `capabilities/viewport` reported `restored: false` once
(`network/viewport-diagnosis.txt`: the same case restores exactly alone and in the same order; the viewport commands
are the host's).

## Acceptance 1 to 3 on the default selection

`acceptance/run-1/` (15:36 UTC, one serve, all four cases ok, also observed with `--network` by the first sampler,
qualified as above: no TCP/UDP from the tree, the same single Unix peer, browser/ unchanged):

| acceptance | case | result |
|---|---|---|
| 1 | `acceptance/nytimes.mjs` (acceptance-1's scenario) | `createBrowserTab(..., 'https://www.nytimes.com/')` opens it (title "The New York Times - Breaking News, ..."); `getByRole('link', {name: /Opinion/i}).first().click()` navigates to `/section/opinion` ("Opinion - The New York Times") |
| 2 | `acceptance/slow-click.mjs` | `locator('#late').click({timeoutMs: 15000})` succeeds 8,457 ms after the reload that starts the page's 8 s clock; the page recorded the click |
| 3 | `acceptance/evaluate-title.mjs` | the `document.title = 'changed'` evaluate returns `changed`; `tab.title()` reads `changed` |
| 3 | `acceptance/evaluate-context-loss.mjs` | the POST-then-reload evaluate rejects with "playwright.evaluate was interrupted: Inspected target navigated or closed. The script was sent to the page once and may have run there; it was not run again." (evaluate_interrupted's sentence; only the message crosses the client); the counter reads 1, through the page and the fixture's state; the tab stays usable |

The vendor halves of 1 to 3 are the earlier runs' (acceptance-1/vendor, the corpus' vendor runs); a first acceptance
run at 15:28 passed the same way and was replaced by this one only because its socket listing predated a sampler
parsing fix. Acceptance 4, 5, 8 and 9 have their M5-head evidence already (`m5-diff.txt`, the sections above).

## Gates (acceptance 10)

`gates.txt`, at d49b03f (6c89167 plus the bench corpus; no `src/` change): `HOME=/tmp/cua-scratch-home npm test` 1,686
pass, 0 fail, 8 skipped (the Linux-only one and seven visible vendor-absent skips); `npm run test:mods` 32 pass;
`claude plugin validate .` passed with the known CLAUDE.md warning; `node --test test/browser-service/no-network.test.mjs`
3 pass (acceptance 7's unit half).
