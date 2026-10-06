# Phase F execution report (issue #51)

Spec: `docs/doperpowers/specs/2026-10-06-remote-and-linux-design.md`, milestones F1 and F2. Branch `feat/phase-f`, cut from E1's head `4595f84` in the worktree `/Users/new/Developer/GitHub/cua-wt-phase-f`. The main checkout stayed on `main` throughout. Executed 2026-10-06 by the Phase F executor session, using subagent-driven execution: one opus task executor per milestone, opus task reviewers, and an opus whole-branch review at the `reviewer-high` brief. The sol and astra routes were at their usage limits.

## Status

PR: https://github.com/SSFSKIM/cua/pull/57 (ready for review, base `main`).

DONE_WITH_CONCERNS. F1 is complete and reviewed clean. F2 is complete and reviewed clean, except acceptance 10's tab cell, which is BLOCKED on the owner's ChatGPT sign-in inside the VM (the owner was unattended). The whole-branch review is clean.

## Timeline and commits

- **Pre-flight** (`9d5d4aa`): the branch base, the doctor `skip` status introduced in F1, the location of the deb mirror, and Phase F headings in the living sections.
- **F1** `fe09732..f03bb74`:
  - Fix wave 1 `16aaee5`, `57a6bbd`: verify's Linux process tree no longer fails open; Linux wording; search hints; relative XDG values; and the suite injects its host instead of assuming darwin.
  - Fix wave 2 `9d5f188`: tests no longer depend on the caller's TMPDIR; Linux has its own `secrets_list` description.
  - Reviewed clean. Spec folds in `2a781e7`, `05cba43`, `d66a813`.
- **Phase E merges**:
  - `c74e19d` merged E1 `ee6362c`, with a conflict in `openConnection`: F1's `host` sits beside E1's `onWithdrawn`.
  - `ed0ce2e` merged E1 `2ed7a22`.
  - `91d70ec` merged main `87f39f3` (Phase E's PR #52). Conflicts in `usageFor`, `settingsFrom`, the doctor `skip` status, `cli.test`, README and the spec. Off macOS, `agent install|uninstall|status` now refuse with `unsupported_platform`, and `runAgent` reads the console only on darwin.
- **F2** `92322a4..040ba7f`: VM acceptance, fixtures, evidence, README.
  - Fix wave 1 `3eea184..a85bf62`: the fail-closed refusal decided by the coordinator, doctor fixes, verify fail-fast.
  - Fix wave 2 `8128b9f..850b1ee`: a connection's listing runs under its own mode, the userns skip rule, hermetic `NO_SCOPED_LAUNCH` gating, one bwrap lookup.
  - Reviewed clean. Spec folds in `7cabfe8`, `8c0f470`, `a31e08d`.
- **Whole-branch review** at `87f39f3..a31e08d`: one P3, a darwin `sandbox` row regression. Fixed in `ac1635d..30c77ab` together with the F2 re-review's two leftover minors, and confirmed clean.
- **Outcomes & Retrospective**: `9d8972b`.

## Tests

- macOS `npm test` at `30c77ab`: 702 tests, 701 pass, 0 fail, 1 skipped (Linux-only).
- VM `npm test`:
  - user namespaces allowed: 659 pass, 43 skipped (darwin-only), 0 fail.
  - user namespaces restricted: 655 pass, 47 skipped, 0 fail.
- `verify.mjs` exits 0 on the VM in every configuration, and once on the MacBook (read-only).

## Acceptance (details in `docs/evidence/2026-10-06-linux-acceptance.md`)

- **Item 8, PASS.** Install from the mirror deb and from the pinned URL. Doctor passes everything but `codex.login` (an owner step). `sandbox.userns` was recorded both before and after the sysctl.
- **Item 9, PASS.** Ran through `scripts/accept/linux-native.mjs`: gedit, `pressKey`, AT-SPI read-back, screenshot.
- **Item 10, PARTIAL.** Done:
  - `chrome register` writes the Linux manifest.
  - The extension starts cua's host without sign-in.
  - `countLiveHosts` counts the host.
  - `profiles add`/`bind me` work.

  **BLOCKED:** the tab cell, which needs the owner's sign-in.
- **Item 11, PASS as revised.** Scoped fails (connect `EPERM`). Disabled passes. Restricted userns used to run unconfined; it is now refused with `sandbox_unavailable`.
- **Item 12, PASS.** On macOS and on the VM.

## Decisions made in execution (all in the spec's Decision Log under `### Phase F`)

- **The Linux sandbox default and the fail-closed refusal.** Decided by the coordinator from F2's finding: on Linux, `disabled` is the default with the computer surface. Every scoped launch on Linux runs a bwrap userns probe first and is refused with `sandbox_unavailable` if it fails. A connection's own readiness listing follows the connection's mode.
- **The VM's userns route.** The VM uses the persisted sysctl. The README also documents a userns AppArmor profile on `/usr/bin/bwrap` (measured to work). A profile on `codex` alone does not satisfy cua's probe.
- **Phase E merge choices.**
  - On Linux, USAGE keeps `remote` and `agent run` but drops the launchd lines.
  - The `agent.*` doctor rows read `skip` off macOS.
- **Gaps F1 settled.** `notes` is a Linux-only key; `CHROME_CONFIG_HOME` moves the whole Chrome family; staging uses `copyFileSync`; `secrets_unsupported_platform` applies to every non-darwin host; there are per-platform wordings.

## Owner steps (BLOCKED item)

The VM `cua-linux` is running. Its Tart window (1440x900) shows Chrome on the ChatGPT "Log in or sign up" page.

1. In the VM window, sign in to ChatGPT in Chrome ("Continue with Google" or email). Optionally check the extension under the puzzle icon → ChatGPT.
2. On the Mac, run `ssh cua-linux 'cd ~/cua && DISPLAY=:0 XAUTHORITY=/home/admin/.Xauthority node bin/cua.mjs login'` and finish the sign-in tab that opens in the VM's Chrome. The alternative is `ssh -t cua-linux 'cd ~/cua && node bin/cua.mjs login --device-auth'`, then use the URL and code on the Mac.

Then an executor, on the VM (`~/cua` is at `30c77ab`, the same code as the branch head):

```sh
cd ~/cua && export DISPLAY=:0 XAUTHORITY=/home/admin/.Xauthority
node bin/cua.mjs login --status && node bin/cua.mjs doctor
node bin/cua.mjs profiles list            # me ready; else node bin/cua.mjs profiles bind me
node scripts/accept/linux-chrome.mjs me   # "status": "PASS"
CUA_SHIM_SURFACES=computer,browser node verify.mjs
```

Append the results to item 10 of the evidence doc and commit them on `feat/phase-f`.

## Environment and friction

- **The Tart image pull was slow.** `ghcr.io/cirruslabs/ubuntu:latest` took about 1 h 50 min at roughly 50 MB/min. A subagent provisioned the VM in parallel with F1.
- **VM provisioning:**
  - Key-only SSH through `tart exec`; the key is `~/.ssh/cua-linux_ed25519`, and a `Host cua-linux` block was added to `~/.ssh/config` with a backup at `/tmp/ssh-config.bak-cua-linux`.
  - lightdm autologin into openbox.
  - Node 22.23.3 from nodejs.org.
  - Chrome 154.0.8037.97 deb, with the ChatGPT extension force-installed by enterprise policy (`/etc/opt/chrome/policies/managed/cua.json`).
  - F2 added `xdotool`, `imagemagick`, `mousepad`, `gnome-text-editor` and `gdb`.
- **No signing key from the vendor.** The vendor's APT repository publishes no key file, so the key came from keyserver.ubuntu.com. It was cross-checked against the debs' `postinst` key and against `InRelease`.
- **One help-only Codex call.** F2 ran `codex sandbox --help` once with a throwaway `CODEX_HOME` under /tmp (help only, no login, removed). This touches the "never set CODEX_HOME" constraint; it is recorded here for that reason.
- **Board writes were requested by the brief.** The brief asked this session to transition #51 (in-progress, then in-review). That conflicts with the executor role's "never write the board" rule; the brief's explicit delegation was followed and is noted here.
- **No password prompts, no TCC dialogs.** Nothing was installed on the Macs, `cua-clean` was not touched, and neither was the MAWS repository.

## Residue

- Finish acceptance 10's tab cell. It stays in scope for #51 and needs the owner steps above.
- A Linux secrets backend (libsecret). The spec names it as a later initiative.
- Prove the relay and agent on Linux, including a systemd user unit as the counterpart of launchd. Deferred by the spec.
- An x64 Linux run on a cloud VM. The x64 pin is proven by inspection only.
