# Second-Mac acceptance: fresh install on a Mac mini (coexistence with the desktop app)

Date: 2026-10-05 (KST). Host: `mac-mini` (Apple silicon, macOS 27.0 build 26A428, Node v26.4.0, Xcode/Swift 6.3.3),
reached over Tailscale SSH for the non-interactive steps; the owner ran the Keychain, permission and Chrome steps at the
mini's console. ChatGPT desktop 26.924.22138 was installed and in use (Codex sessions running) throughout: this is a
**coexistence** run on a second machine, not the desktop-absent clean-machine gate (still open).

## What was run, in order

| Step | Where | Result |
|---|---|---|
| `git clone https://github.com/SSFSKIM/cua` at `4cb15fc` (main), `npm ci`, `npm test` | SSH | 377/377 |
| `npm run build:helper` (installs `$CUA_HOME/bin/cua-keychain`), `npm run test:helper` | SSH | Swift 55, Node 7 |
| `cua install` (download of the pinned 26.928.40906 archive, sha256 and signatures verified; Chrome plugin placed) | SSH | installed, doctor passive PASS |
| `cua install` into a scratch home (download mode once more) | SSH | PASS |
| `cua login --device-auth` | owner, console | login in cua's own CODEX_HOME |
| `accept-native --live-keychain --live-textedit` (scratch home) | owner, console | items 1, 3–8, 10 PASS; 2 BLOCKED (runner asks for a fresh download run), 9 BLOCKED (release gates) |
| `profiles add school --chrome-profile "Profile 12"`, `profiles bind school --extension-instance-id …` (owner's pick) | SSH | bound, ready |
| `accept-chrome --live --profile school` (C2) | owner, console | 17/17 PASS, leftover none, one own-origin elicitation |
| `cua chrome register --replace` (5 manifests backed up and replaced; Chromium's untouched) | SSH | class `cua` |
| extension off/on in Profile 12 → Chrome launched cua's host (`…/cua/runtimes/26.928.40906-darwin-arm64/chrome-plugin/…`, pid 9939) | owner | observed |
| `accept-chrome --live --profile school` through that host (C6 round trip) | owner, console | 17/17 PASS, liveHosts 1 |
| socket-restricted read-only listing of host 9939 (`probe-chrome-original --live`, `BROWSER_USE_BACKEND_PATHS` = its socket) | SSH | exactly one Chrome extension backend behind it |
| `cua chrome unregister --json` | SSH | 5 restored; all 6 manifests hash `58b89252…` = pre-gate; backups consumed; doctor class `desktop` |
| `accept-chrome --all --profile school --c2-report … --c6-report …` (at PR #5's head) | SSH | **C1–C7 PASS** |

Report files on the mini: `~/Library/Application Support/cua/{accept-chrome-live,accept-chrome-c6-roundtrip,c6-register,
c6-unregister,c6-host-proof,c6-replace-gate,accept-chrome-all}.json`, `/tmp/cua-accept.mini/acceptance-live.json`.

## What the run proved

- A second machine installs cua from the public repository alone: clone, suite, helper build, pinned download with
  signature verification, its own Codex login, and the whole native and Chrome acceptance, with no file copied from
  the first machine.
- The native live slice (TextEdit fixture, Keychain round trip, substitution, lifecycle with per-connection approvals)
  passes on a machine where cua had never run.
- The original Chrome route works in a profile the owner chose there (Profile 12), and cua's placed host is launched by
  Chrome after `--replace`, serves the round trip, and `unregister` restores every manifest byte-for-byte.

## What it did not prove

Desktop-absent operation, fresh-TCC onboarding and Developer ID signing: the desktop app was installed and running, and
its helper copy shares the pinned helper's identity, so existing grants applied.

## Defects found by this run (all fixed on main)

1. **Node ≥ 23 test summaries** — the acceptance runners parsed only node:test's TAP summary; Node 26 prints the spec
   form, so every suite read as "no test summary" and five items cascaded to FAIL. PR #3: TAP requested via
   NODE_OPTIONS (syntax-aware rewrite) and both forms parsed as coherent blocks.
2. **A probe hard-coded a research tree path** under the owner's home (`static-layer.mjs`), tripping the clean-clone
   hygiene checks. PR #3: `--readable-source` is a required input.
3. **macOS 27 protects Chrome's user-data directory behind TCC.** A process without Full Disk Access (Terminal.app, hence
   Claude Code's shell and `cua serve`) gets `EPERM` there, while sshd-spawned processes read it. cua reported that as
   `extension_not_installed`. PR #4: tri-state presence, `chrome_data_unreadable`, live evidence decides readiness, and
   the Full Disk Access note. The hypothesis recorded at the time (that the same protection explains the vendor's
   profile-name enrichment never labelling a backend) was refuted on 2026-10-05 by spike #8: the cause is node_repl's
   default sandbox denying temp-directory writes when cua sends no sandbox metadata.
4. **`accept-chrome --all` assumed the owner's registry** (personal/work/school, Default/Profile 8/Profile 6, live
   profile personal). PR #5: `--profile <key>`, a fixture Chrome tree for the scratch run, data-driven default-home
   checks.

## Observations to follow up

- **Chrome host lifetime on the mini.** The OpenAI Chrome host often exited within about a minute of the extension
  waking (11:15:xx start → gone by 11:16:38; another lived from 11:19 past 11:32). On the first Mac hosts stay up for
  hours. Versions differ (desktop 26.930 vs 26.924; same extension 1.26.901). A user may have to wake the extension
  (click its icon, or toggle it) right before the agent's first browser call. Not diagnosed.
- **Toggle does not always mint a new instance id.** Two off/on toggles in Profile 12 kept `34e8eab6…`; the first Mac's
  toggle and reinstall minted new ids. Readiness handles both, but "toggle = new id" is not a rule.
- **Transient `extension_not_installed` during an extension update.** At 10:51 the Profile 12 extension directory was
  mid-update (1.2.27236 → 1.26.901) and the presence check saw no manifest for a moment.
- **SSH sessions cannot use the login Keychain or show permission dialogs** (`User interaction is not allowed`): all
  secret-bearing live steps must run from the console session. The runners now say so in their guidance.
