# Clean-machine acceptance: no desktop app, fresh permissions, in a macOS VM

Issue #9. Date: 2026-10-05 (UTC times below).

**Host.** The owner's MacBook: Apple silicon, macOS 26.6.2 build 25G83, 32 GB. The owner decided on 2026-10-05 to run
the VM there rather than on the mini, so the owner could work the VM window.

**Hypervisor.** Tart 2.40.1, installed from the Cirrus Labs release tarball (Developer ID `9M2P8L4D89`, notarized);
the Homebrew tap's formula no longer loads with current Homebrew.

**Guest `cua-clean`.**
- Image: `ghcr.io/cirruslabs/macos-golden-gate-base:latest`, manifest `sha256:5302a9ea…`, uploaded 2026-10-03.
- macOS 27.0 build 26A428, the mini's build, running on the 26.6 host.
- 6 CPU, 12 GB, 80 GB disk; the image grows its APFS container on boot.
- The image carries Homebrew, Node v24.21.0 (npm 11.19.0), git and the Command Line Tools 27 (Swift 6.4). It has
  no Xcode.

**How the steps ran.**
- The owner ran the login, permission, Keychain and Chrome steps in the guest's console Terminal.
- Everything else ran over SSH into the guest.

**Main commits.**
- `7edaa08`: setup.
- `74e16d1`: Chrome gate.
- `c54c70b`: the final native and `--all` runs.

**Sandbox default.** Every run used `CUA_SHIM_SANDBOX` unset, which means `disabled` (issue #20). The
sandbox-on row of the third native run sets `default` for that check only.

## Clean baseline, before any cua step

- **No desktop app or state.**
  - `/Applications` held Safari and Utilities only.
  - No ChatGPT or Codex app existed anywhere under `/Applications`, `~/Applications` or either `Application Support`.
  - There was no `~/.codex`, no `~/Library/Group Containers/2DC432GLL2.*` and no helper process.
- **No OpenAI permission grants.** The system TCC database (read with sqlite3, never edited) held no entry for any
  OpenAI or cua client.
- **The image pre-grants permissions to some clients.**
  - Accessibility, Screen Recording, PostEvent and AppleEvents: `sshd-keygen-wrapper` (so everything started over
    SSH), `osascript`, `org.python.python` and `tart-guest-agent`.
  - Full Disk Access: `sshd-keygen-wrapper`.
  - Terminal.app held no grant. That is why every live step ran from the console Terminal: any prompt there is a
    first-run prompt.

## What was run, in order

### Setup over SSH (`7edaa08`)

| Step | Result |
|---|---|
| `git clone https://github.com/SSFSKIM/cua` | ok |
| `npm ci` | not applicable: no dependencies and no lockfile, so npm 11.19 refuses with EUSAGE |
| `npm test` | 414/414 |
| `npm run build:helper` (Command Line Tools only, Swift 6.4) | built, installed `$CUA_HOME/bin/cua-keychain`, `secrets.helper` PASS |
| `npm run test:helper` | **Swift tests do not compile** (`plugin for module 'TestingMacros' not found`); Node 7/7. Defect 1 |
| the same with PR #30 | Swift 55, Node 7 |
| `brew install --cask google-chrome` (not launched, nothing signed in) | Chrome 154.0.8037.98, team `EQHXZ8M8AV` |
| `cua install`: download of the pinned 26.928.40906 archive from the official URL, sha256 and OpenAI signatures verified | installed, Chrome host placed; 1 min 39 s; 515 MB |
| `cua doctor` | passive checks PASS (signatures: 4 components, team `2DC432GLL2`); `chrome.host.registered` BLOCKED: no manifest, because there is no desktop app |
| `cua install` into the scratch home `~/cua-accept.clean` (download mode again), plus `build:helper` with that `CUA_HOME` | installed; `secrets.helper` PASS |
| `cua login --device-auth`, tried over SSH with a terminal | prints the Codex v0.159.2 device prompt (cancelled there); without a terminal it refuses with `tty_required` |

After these steps no native helper had run, so the owner's console run was the pinned helper's cold start.

### Native acceptance (owner, console Terminal)

| Step | Result |
|---|---|
| `cua login --device-auth` (default home) | "Successfully logged in" |
| `accept-native --live-keychain --live-textedit` in the scratch home, report `acceptance-live.json` (18:05:54–18:11:51) | 1, 3, 4, 10 PASS; 2 BLOCKED; 5 FAIL; 6 and 7 FAIL (plant step only, defect 3); 8 and 9 BLOCKED |
| the same, `acceptance-live-2.json` (18:21:13–18:24:29) | 1, 3, 4, 8, 10 PASS; 5 BLOCKED on its last step (see the operator notes); 6 and 7 FAIL (plant step only); 2 and 9 BLOCKED. No new permission prompt |
| `git pull` to `c54c70b`, then the same, `acceptance-live-3.json` (18:34:03–18:37:49) | **1, 3, 4, 5, 6, 7, 8, 10 PASS**; 2 and 9 BLOCKED as designed |

Detail for the first run:
- Item 5 failed because the first-run permission prompts outlasted both 60 s waits to attach to TextEdit. Connection
  A's wait started at 18:07. Connection B's started at 18:08:19 and overlapped the grants at 18:08:31 and 18:08:35.

Detail for the third run:
- **Item 5:** 10/10 steps passed, with one TextEdit app-approval request per connection.
- **Item 7:** the probe passed 34/34. It now includes:
  - "sandbox on (`CUA_SHIM_SANDBOX=default`): trusted roots unwritable" PASS: all four roots EPERM;
  - the informational row "sandbox disabled (default): trusted roots a cell could write (accepted, #20)" INFO.
- **Item 2** asks for a fresh download run because the download code changed since `bc315bc`. The two download-mode
  installs above are that run.
- **Item 9** is BLOCKED by design in the runner. This document is the evidence for its first three gates.

### The pinned helper's first run, without the desktop app

From the guest's unified log, read over SSH with `log show`:

- **Launch.** At 18:07:07 launchd spawned `SkyComputerUseService` (pid 3620) "because launch job demand", as job
  `application.com.openai.sky.CUAService…`. The process manager recorded `launchedByLS=1`. The executable was in
  cua's private release tree:
  `~/cua-accept.clean/runtimes/26.928.40906-darwin-arm64/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app`.
- **Permission attribution.** tccd attributed every request to `com.openai.sky.CUAService` at that path; none went to
  Terminal, node or sshd.
- **The prompt the owner saw.** It was the helper's own onboarding window. Its strings in the binary are "Enable
  ChatGPT Computer Use" and "ChatGPT Computer Use needs these permissions to use apps on your Mac", with rows for app
  interfaces (Accessibility), screenshots (Screen Recording) and "Chrome Extension". macOS's own permission prompts
  followed.
- **Grants, made once in the owner's session.** tccd recorded `Modify kTCCServiceAccessibility` for the helper at
  18:07:07 and 18:08:31, and `Modify kTCCServiceScreenCapture` at 18:08:35.
- **Work after the grants.** From 18:08:39 the helper did computer-use work: cursor, accessibility queries,
  screenshots and focus handling.
- **Later runs.** The helper started again from the same tree for each connection: pids 38263, 38322 and 38343 in the
  third run. tccd answered its Accessibility and Screen Recording checks from the existing grants, with no Modify
  event. No prompt appeared after the first run.
- **No desktop-written state.** The helper wrote no "enabled" flag and no approvals file.
  - Its group container held only `IPC/computeruse.sock.lock` and an analytics database.
  - `~/Library/Preferences/com.openai.sky.CUAService.plist` held a Statsig cache and a status-item key.
- **Harmless errors without the desktop app.**
  - "Failed to configure Codex Computer Use Statsig: codex app-server exited before returning auth status".
  - `ChromeExtensionInstaller.Error Code=2`, from the onboarding window's Chrome row.

### Chrome without the desktop app: the desktop-absent gate, then `--all`

| Step | Where | Result |
|---|---|---|
| `accept-chrome --c6-slots` before (18:11) | SSH | all five browser slots absent |
| `cua chrome register --json` (18:11) | SSH | chrome `placed`, no backup, no replacement consequences |
| `--c6-slots` registered (18:11:42) | SSH | chrome `ours` (manifest sha256 `1f87ba3d…`), the others absent; doctor `chrome.host.registered` class `cua` |
| ChatGPT extension (installed before registration) | owner | showed "ChatGPT app required" until cua's manifest existed; Chrome then launched cua's placed host |
| `profiles add clean --chrome-profile Default`, `profiles bind clean` | owner, console | **automatic bind** to `a63978d0…`: the runtime labelled exactly one live Chrome backend "Your Chrome", matching the profile's unique name |
| `accept-chrome --live --profile clean` (18:26) | owner, console | **C2 PASS 17/17**, no leftover tab |
| the serving host | SSH | see below |
| `cua chrome unregister --json` (18:29:34) | SSH | chrome `removed`/`not_needed`, the others `absent`, `blocked` false |
| `--c6-slots` after | SSH | all five absent, identical to before |
| `cua chrome register --json` again (steady state) | SSH | chrome `placed`; the same manifest bytes (`1f87ba3d…`); record `replaced: false`; doctor class `cua`, 1 live host |
| `accept-chrome --all --profile clean --c2-report … --c6-report …` (18:39:03–18:42:06, `c54c70b`) | SSH | **C1–C7 PASS** |

The serving host was pid 19183, a child of Google Chrome (pid 3791), started at 18:25:06. Its executable is
`~/Library/Application Support/cua/runtimes/26.928.40906-darwin-arm64/chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome`
(team `2DC432GLL2`), it served `/tmp/codex-browser-use/<uuid>.sock`, and Chrome's only manifest named it.

The gate report was assembled in the guest at `~/cua-gate/c6-desktop-absent-gate.json`. Its scenario is
`C6-desktop-absent-live-gate` (PR #31's format), and it contains:
- the before, registered and after slot snapshots;
- the 18:11 `register` output;
- the serving host facts;
- the live report;
- the `unregister` output.

The final `--all` report says:
- **C5:** `chrome.host.registered` passes with "no desktop registration present; cua's own registration (the
  steady state) or none expected; saw cua".
- **C6:** the refusal and no-op checks are `N/A (no desktop registration present)`. Every desktop-absent gate check
  passes, including "absent before, absent after" (identical: true).
- **Suites:** `npm test` 459/459 in this checkout and in the clean clone, which also passed `test:helper` (Swift 55,
  Node 7) and `npm pack` (61 files).

### Report summaries

The reports stay in the guest; their metadata is summarized here, with instance ids as prefixes only.

| Report | Status | Items |
|---|---|---|
| `~/cua-accept.clean/acceptance-live-3.json` | BLOCKED (2 and 9 only) | PASS 1, 3, 4, 5, 6, 7, 8, 10; BLOCKED 2, 9 |
| `~/cua-accept-chrome-live.json` | PASS | 17/17 steps, profile `clean`, chromeData readable, liveHosts 1, leftover none |
| `~/cua-gate/c6-desktop-absent-gate.json` | input | slots before, registered and after; register; servingHost `cua`; roundTrip; unregister |
| `~/cua-gate/accept-chrome-all.json` | PASS | C1–C7 PASS, supplied c2 and c6 reports, head `c54c70b` |

## What the run proved

- **cua works with no ChatGPT desktop app.**
  - It installs from the public repository and downloads and verifies the pinned release.
  - The vendor's `SkyComputerUseService` starts from cua's private release tree through LaunchServices.
  - It serves the native fixture, the Keychain round trip, substitution and the lifecycle checks.
- **First-run permission onboarding works as intended.**
  - Accessibility and Screen Recording are requested by the pinned helper itself (`com.openai.sky.CUAService`, at its
    release-tree path) and granted once.
  - Later starts reuse the grants without prompting.
  - The helper needs no state the desktop app would have written.
- **Chrome works through cua's own host with no desktop registration.**
  - `register` writes into empty slots, Chrome launches the placed host, the live secret round trip passes through
    it, and `unregister` returns every slot to absent.
  - Re-registered, cua's host is the steady state, and C1–C7 pass there.
- **The automatic bind works on a clean machine.** The runtime's own label ("Your Chrome") picked the profile's single
  backend (#27). It needed the `disabled` sandbox for the vendor's label lookup (#20).

## What it did not prove

- Developer ID signing of the Keychain helper across an upgrade (#14). The helper here is ad-hoc signed.
- The first run in a fresh *user account* on a Mac that has other users. The VM's only user is `admin`.
- File-level TCC (Full Disk Access). The VM image has SIP disabled (`csrutil status`, found during #16), so a process without Full Disk Access can still read `~/Library/Mail`, `~/Library/Safari` and Chrome's user-data directory there. The Accessibility and Screen Recording prompts above were real, but any claim about unreadable Chrome directories rests on the second Mac's observation, not on this VM.

## Defects found by this run (all fixed on main)

1. **`test:helper` failed on a Mac with only the Command Line Tools.**
   - With the Command Line Tools 27 and Swift 6.4's default build system, swift-testing's macro plugin ships in
     `usr/lib/swift/host/plugins/testing` but is not passed to the compiler.
   - `accept-native` items 1 and 10 failed as a result.
   - PR #30 passes the plugin path when the developer directory is the Command Line Tools.
2. **`accept-chrome --all` assumed the desktop's registration.**
   - C6's live part took only a `--replace` gate report, and its refusal check was BLOCKED with nothing to refuse.
   - C5 required class `desktop`.
   - PR #31 added the desktop-absent gate (with `--c6-slots`, and `N/A` for the refusal and no-op).
   - PR #32 made cua's own registration the expected steady state: C5 accepts class `cua` or none, by the slots and
     cua's registration record.
3. **The trusted-root plant check contradicted the #20 decision.**
   - `cua serve`'s default `disabled` sandbox lets a cell write trusted roots, but `probe-secrets` still asserted they
     were unwritable, so items 6 and 7 failed on that one step.
   - Owner's decision: the default stays.
   - Issue #34, PR #35 (merged as `c54c70b`), runs the guarantee under `CUA_SHIM_SANDBOX=default`, where it passes, and reports
     the default's writable roots as INFO.

## Observations

- **Chrome was first launched by LaunchServices during the helper's onboarding.** The originator was
  `com.apple.coreservices.uiagent`, at 18:08:39, during the first native run; no cua command launched it. The
  onboarding window has a "Chrome Extension" row. It is unverified whether the owner opened Chrome from that row.
- **Running two acceptance runners at once in the same account can break a test.** While `accept-native` ran,
  `--all`'s checkout `npm test` had one failure (18:34–18:37). Alone it was 459/459 twice. Which test failed was not
  recorded.
- **Tart's image pull was slow on this network.** `tart clone` pulled at about 2 MB/s over one HTTP/2 connection.
  Fetching the 80 image blobs with parallel, resumable, hash-verified downloads and cloning from a local read-only
  registry took about 2 hours for 34 GB.
- **Host disk use** was about 61 GB: the image cache 38 GB, plus the VM's own writes.

## Operator notes

- **`CUA_HOME` left exported in the shell.**
  - What happened: `CUA_HOME` stayed exported in the guest Terminal after the scratch-home run. The next
    `profiles add/bind` and `accept-chrome --live` therefore used the scratch home, which has no login, and the live
    run was BLOCKED with "the server has no Codex login".
  - Practice: use a fresh shell for the default home.
- **Leftover TextEdit window.**
  - What happened: the first run's timed-out connection left its fixture window open in TextEdit (file already
    deleted). In the second run, that window came to the front after the fixture's Command-W. The runner rightly
    left it alone and reported BLOCKED.
  - Practice: close leftover fixture windows before a rerun.
- **SSH is not a clean environment for permission tests in this image.** Processes started over SSH carry the
  image's pre-granted rights, and SSH sessions cannot show Keychain prompts. All secret-bearing and permission steps
  ran from the console.
