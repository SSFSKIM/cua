# Execution report: cua's own Chrome extension and native host (#10)

Spec: `docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md` (plan pinned at 435602f). Branch
`feat/own-chrome-extension`; commits 435602f..HEAD (the spec commits 997edf9 and 435602f precede execution). Executed
2026-10-07 by a plan-executor controlling one fresh task executor per milestone (opus), an opus task review at every
milestone frontier (the task-reviewer brief), and a final whole-branch review (opus, reviewer-high brief). The spec's
Decision Log, Surprises & Discoveries and Outcomes & Retrospective are the authoritative record; this report is the
account of the run.

PR: https://github.com/SSFSKIM/cua/pull/80

## Status

DONE_WITH_CONCERNS: every milestone is built and reviewed clean; H3b's live Mac items (acceptance 1 after
registration, 3, 4, 5, 6) are BLOCKED on the owner loading the extension unpacked (the extension was still absent from
`Default` at 14:22 UTC and at the PR). Acceptance 8's Store half waits on the listing (#78).

## Milestones

| Milestone | Result | Review |
|---|---|---|
| S0 spike | (a) default network, no login: PASS ×3; (b) network off: PASS ×2; control with the field present: refused (`Codex auth token is unavailable`); (c) discovery: live in 228–353 ms, dead paths found next call. `CUA_EXTENSION_ID` = `jkejaaijdfpohkdhankllbekkhmnippb`; key at `~/.config/cua/extension-key.pem` (0600, never printed or committed). | Approved; 3 minor cleanups |
| H1 host | `src/chrome/{host,protocol,extension}.mjs`, fake extension; real vendor service vs real host: 8/8 ×4 | 2 Important fixed (successor's socket deleted on exit; late `turnEnded` stranding a handoff tab) |
| H2 registration | `cua chrome register|unregister` (cua route, `--vendor`), route rule, discovery, presence rule, doctor rows, launcher stderr log | 1 Important fixed (vendor hints sent users to the cua route) + route-flip minors |
| H3a extension | MV3 worker + popup, proven against the real host under a `chrome.*` stub | 1 Important fixed (the design's "Another debugger … refusal otherwise" was wrong per Chromium source; design revised: adopt) |
| H3b Mac live | runner `--route`, cells for every new behaviour; acceptance 2 PASS live; empty backend paths hide vendor sockets | runner: 1 Important fixed (acceptance 3 would pass without its elicitation); **live 1, 3–6 BLOCKED (owner)** |
| H4 Linux | CRX3 packer, relay `/ext/`, template on the cua route; acceptance 7 PASS on Tart VM and Hetzner (3 m 45 s, deleted) | Approved; small fixes (`--deb` path with a space) |
| H5 packaging/docs | `npm run extension:pack`, docs, cua-route wording, plugin 0.4.0; acceptance 8 zip/CRX half PASS | Approved; doc wording fixes |
| Whole branch | — | "correct", no material findings |

Parallelism: H3a ran beside H2, H4 beside H3b, H5 beside H3b's fixes, each in a temporary worktree off a reviewed
head, rebased onto the branch (no conflicts) and removed afterwards. H4's gate (off-store force-install on branded
Linux Chrome) was measured early with a throwaway extension, which removed the plan's product fork before H4.

## Validation evidence (commands run in this session)

- `npm test` at 3eae3f9: 945 tests, 944 pass, 0 fail, 1 skipped (baseline 785 at 435602f).
- `node scripts/probe-chrome-contract.mjs --fixtures --report /tmp/cua-final-fx.json`: `{"PASS":15,"FAIL":0,"BLOCKED":0}`.
- S0, H1 probe, Linux and Mac evidence: `docs/evidence/2026-10-07-s0-no-header-spike.md`,
  `docs/evidence/2026-10-07-h1-host-probe.md`, `docs/evidence/2026-10-07-own-extension-linux.md`,
  `docs/evidence/2026-10-07-own-extension-acceptance.md`.

## Board

Registered #78 "Chrome Web Store listing for cua's extension (unlisted; owner action)" (needs-human, spawned by #10)
and #79 "Remove the ChatGPT extension route (vendor host, --vendor, chrome.host.config, Codex login for the browser)
after the Store listing" (blocked by #78), as the dispatching brief instructed for H5.

## Environmental notes

- The S0 executor's first `cua install` ran before `CUA_HOME` was exported and hit the default home; it found the
  runtime installed and changed nothing.
- The Tart VM run (H4) used a separate home `~/.local/share/cua-h4`, so doctor's `agent.enrolled` row reads fail there
  (the VM's agent belongs to the default home); every browser row passes. The VM's managed force-list now holds both the
  OpenAI and cua entries in its one `cua.json`. A stale throwaway `crx-probe` extension remains under the VM's
  `Default` profile until that profile loads (it uninstalls itself; no longer force-listed).
- The relay host gained the Caddy `/ext/` route (Caddyfile validated and reloaded; the relay service not restarted).
- No Hetzner server left behind (`hcloud server list` → `cua-relay` only).

## Finishing H3b live (for this session or a fresh one, from the PR branch)

Owner's two actions: (1) in Chrome profile `Default`: `chrome://extensions` → Developer mode → Load unpacked →
`<checkout>/extension` (id `jkejaaijdfpohkdhankllbekkhmnippb`); (2) only when the restart runner prints
"OWNER STEP", quit Chrome fully (Cmd-Q) and reopen it.

Executor steps (from the worktree of `feat/own-chrome-extension`; never `cua login`, never set `CODEX_HOME`, read
nothing under the Chrome profile except whether `Local Extension Settings/jkejaaijdfpohkdhankllbekkhmnippb/` exists):

```sh
export CUA_HOME=/tmp/cua-h3.qCqI8E      # kept scratch home (installed, profile 'personal' added, never logged in);
                                        # or: export CUA_HOME=$(mktemp -d /tmp/cua-h3.XXXXXX); node bin/cua.mjs install;
                                        #     node bin/cua.mjs profiles add personal --chrome-profile Default
test ! -e "$CUA_HOME/state/codex/auth.json"
# acceptance 2 baseline: sha256 of every NativeMessagingHosts/{com.openai.codexextension,io.github.ssfskim.cua}.json
node bin/cua.mjs chrome register --replace
# wait for $CUA_HOME/chrome/b/<12-hex>.sock (the extension reconnects within a minute; opening its popup retries at once)
node bin/cua.mjs profiles bind personal                        # bound (automatic, by directory)
node bin/cua.mjs doctor --json | jq '.ok, (.checks[] | select(.id | startswith("chrome") or . == "codex.login"))'
CUA_SHIM_SURFACES=browser node verify.mjs                      # exit 0, problems: []
node scripts/accept-chrome.mjs --live --route cua --profile personal --report /tmp/cua-h3.json      # 1, 3, 4, 5
node scripts/accept-chrome.mjs --live --route cua --chrome-restart --profile personal --report /tmp/cua-h3-restart.json  # 6
node bin/cua.mjs chrome unregister                             # then re-check the acceptance 2 hashes
```

Cells the live runner covers: discovery (`listBrowsers` names "cua"; the host's raw `getInfo` without
`agentRequestHeaderEnabled`/`extensionId`), the secret-substitution form, a cross-origin iframe served from
`localhost:<port2>` (OOPIF via `attachTarget`), `goto` latency per scenario, the user-tab claim on its own loopback
origin with an accepted origin-access elicitation required (the debugger infobar is the owner's observation), turn-end
marking (unmarked closed, deliverable open and unowned, handoff owned with `attached:false`, listed next task), two
`cua serve` clients (`tab owned by another session` via a raw client), and Chrome-after-serve (classified failure within
15 s, `end_task` succeeds, a new task drives the profile). Watch live: the three vendor-API inferences (`browser.user`
API, `tab.id` = Chrome's tab id, the name "cua") — all confirmed against the vendor source by review; distinct vendor
session ids for two serves; an idle open task surviving the restart wait; `Fetch.enable` stalls; `windows.create
{focused:false}` staying unfocused on macOS; whether the debugging bar's Cancel detaches one tab or all. Record results
in `docs/evidence/2026-10-07-own-extension-acceptance.md`, tick H3b in the spec, refresh Outcomes.

### Owner: Chrome Web Store listing (#78)

Do these yourself; nothing waits on them. Sources: developer.chrome.com/docs/webstore (register, set-up-account,
cws-dashboard-listing, cws-dashboard-privacy, cws-dashboard-distribution, review-process, update), the Program Policies,
and Chromium's policy definitions; uncertain points are marked.

**1. Developer registration (once).** At https://chrome.google.com/webstore/devconsole sign in with the Google account
that should own the item (the developer email cannot be changed later), accept the developer agreement, and pay the
one-time registration fee (US$5 per secondary sources; the official page states only "one-time"). Turn on 2-Step
Verification for that account (required before publishing), verify the contact email, set a publisher name, and
declare yourself a non-trader (no sales) in the account settings.

**2. Build the one-off first-upload zip (the id-keeping one).** The Store refuses a manifest with `key`; to keep the id
`jkejaaijdfpohkdhankllbekkhmnippb`, the first upload is the normal Store zip plus your private key as `key.pem` at the
zip root. Build it outside the repository so nothing can enter git:

```sh
cd <your cua checkout>                     # on the branch with H5
npm run extension:pack                     # dist/cua-extension-0.1.0.zip (no key in its manifest)
T=$(mktemp -d)                             # a private scratch directory outside the repository
cp dist/cua-extension-0.1.0.zip "$T/cua-first-upload.zip"
install -m 600 ~/.config/cua/extension-key.pem "$T/key.pem"
(cd "$T" && zip -q cua-first-upload.zip key.pem && rm key.pem)
unzip -l "$T/cua-first-upload.zip"         # manifest.json … and key.pem at the root
```

Upload `$T/cua-first-upload.zip`, then `rm -rf "$T"`. (I dry-ran this recipe with a throwaway key: `zip` appends
`key.pem` at the root of the packer's zip and `unzip -t` passes.) Only the first upload carries `key.pem`; every later
upload is plain `dist/cua-extension-<version>.zip` with a higher `version` in `extension/manifest.json`. Caveat: the
`key.pem` rule comes from Chrome's older packaging docs and forum confirmations, not a current official page.

**3. Check the id before anything else.** In the dashboard, the new item's id must read
`jkejaaijdfpohkdhankllbekkhmnippb`. If it shows another id, the key was not taken: do not submit; delete that draft
item and tell me (the documented fallback is the opposite direction, adopting a Store-assigned key, which would
change every installed copy's id).

**4. Distribution tab.** Visibility **Unlisted** (installable by anyone with the link, not in search; the same review
as public). Regions: all. (That an unlisted item can be force-installed by `ExtensionInstallForcelist` with the
Store's update URL is an inference from the policy, not stated officially; the cloud template's `store` mode relies
on it and gets tested when we flip.)

**5. Store listing tab.** Required: description, category, language, a 128×128 icon, at least one 1280×800 screenshot
(up to 5; 640×400 is also accepted per the Store's image guidelines, though the listing page names 1280×800) and a
440×280 small promo tile; homepage/support URLs optional (use https://github.com/SSFSKIM/cua). Note
the extension's own icons are placeholders (H3a); you may want real artwork first. Category: Developer Tools.
Drafted description:

> cua lets AI agents that you run on your own computer work in this Chrome profile's tabs — with your sign-ins,
> cookies and settings, without copying anything. It is the browser half of cua (https://github.com/SSFSKIM/cua), an
> open-source tool that gives Claude Code computer use: after installing cua, run `cua chrome register` and
> `cua profiles bind <name>`, and your agent can open its own background tabs (grouped and labelled so you can tell
> them apart) or, with your approval, work in a tab you opened. While it drives a tab Chrome shows its "started
> debugging this browser" bar; cancel it to stop the agent on that tab.
>
> The extension only relays Chrome's tab and debugger functions to the cua program on your computer. It adds no
> scripts to web pages; the agent acts in a tab only through Chrome's debugger, while Chrome shows its debugging bar.
> It has no host permissions, sends nothing to any server, and does nothing until cua is installed and registered on
> this computer. No account is needed.

**6. Privacy practices tab.** Drafted entries:

- *Single purpose:* "Lets AI agents that the user runs locally through the cua command-line tool open and operate tabs
  in this Chrome profile, by relaying Chrome's tab and debugger functions to cua's native host on the same computer."
- *`debugger`:* "Core to the single purpose. The extension attaches chrome.debugger only to tabs the user's local cua
  agent created, or a tab the user approved it to use, relays DevTools Protocol commands and events between that tab
  and the local cua native host, and detaches when the agent's task ends or the host disconnects. Chrome shows its
  debugging bar while attached and the user can cancel it at any time. Nothing is sent off the computer."
- *`nativeMessaging`:* "Connects to cua's native host (io.github.ssfskim.cua), which the user installs and registers
  with `cua chrome register`; every action the extension takes is a request from that local program."
- *`tabs`:* "Lists, creates (in the background), reads the URL and title of, and closes tabs at the local host's
  request, so the agent can work in its own tabs and in a tab the user chose."
- *`tabGroups`:* "Puts the tabs an agent session opens into a labelled tab group so the user can see which tabs an
  agent is using."
- *`storage`:* "Keeps one random instance id that distinguishes this Chrome profile's copy of the extension, so the
  local cua tool can bind the right profile."
- *`alarms`:* "A once-a-minute alarm reconnects to the local cua host after it restarts."
- *Remote code:* "No, I am not using remote code."
- *Data usage:* tick no collected categories, and tick the three certifications (no selling/transfer outside the
  approved uses, no use for unrelated purposes, no creditworthiness/lending use). Judgment call for you: the
  extension hands page content to a local program the user runs and never transmits it to you or anyone; the User
  Data FAQ treats that as no collection by the developer, but a reviewer could ask about "website content". If they
  do, a privacy policy URL resolves it; a short one could be a README section: "The cua extension collects no data. It
  passes tab content and DevTools Protocol messages only to the cua program on the user's own computer, which the
  user installs and controls; nothing is sent to the developer or third parties."

**7. Submit for review.** Typically a few days; up to a few weeks for new developers, new items and sensitive
permissions (`debugger`, `tabs`); ask support after three weeks. After approval you have up to 30 days to publish if
you chose deferred publishing.

**8. Send back:** the Store item URL (`https://chromewebstore.google.com/detail/<slug>/jkejaaijdfpohkdhankllbekkhmnippb`)
and confirmation that the dashboard id is `jkejaaijdfpohkdhankllbekkhmnippb`. With those I replace the README's
placeholder, flip the cloud template to `store`, run acceptance 8's Store half (install from the Store,
`chrome://extensions` shows the id, acceptance 1 with the Store install) and unblock the vendor-route removal ticket.

