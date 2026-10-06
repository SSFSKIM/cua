# Linux acceptance (Phase F, F2): items 8–12 on a Tart arm64 Ubuntu VM

Date: 2026-10-06. Spec: `docs/doperpowers/specs/2026-10-06-remote-and-linux-design.md` (acceptance 8–12). Spike
#12's unverified items are answered at the end. Branch `feat/phase-f`. The code under test is the F1 head `d66a813`
plus F2's fixes (`92322a4`, `2a0d1a2`, `5f2ffd9`, `1356921`, and this document's commit). The F1 code's own results
are recorded where they differ.

Summary:

| Item | Result |
|---|---|
| 8 Install and doctor | **PASS**. Install from the mirror deb and from the pinned URL. Doctor passes every row except `codex.login` (blocked: no Codex login, an owner step). `sandbox.userns` was `blocked` before the sysctl and `pass` after it |
| 9 Native action | **PASS**. A gedit window bound by X11 id; marker typed, read back through AT-SPI and visible in the screenshot; `run/` empty afterwards |
| 10 Chrome | **Partial**. Done: `chrome register` writes the Linux manifest; the extension starts cua's host **without sign-in**; `countLiveHosts` counts it; `profiles add` and `bind` work. **Blocked**: the `js` tab cell stops at `Codex auth token is unavailable`, which needs the owner's `cua login` and, possibly, the extension's sign-in |
| 11 Sandbox and bus from inside | Recorded as the item allows: item 9 **fails under `scoped`** (X11 connect `EPERM`) and passes under `disabled`. F2 makes `disabled` the Linux default for the computer surface |
| 12 Tests | **PASS**. macOS 614/614. VM 614 tests: 571 pass, 43 skipped (darwin-only: codesign, `ditto` zips, Keychain), 0 fail. `verify.mjs` passes on the VM in four configurations |

## The machine

| | |
|---|---|
| VM | Tart `cua-linux` (clone of `ghcr.io/cirruslabs/ubuntu:latest`), 4 CPUs, 8 GB, 1024x768 console, on the owner's MacBook |
| Distro, kernel | Ubuntu 24.04.5 LTS, `7.0.0-38-generic` aarch64 |
| Desktop | Xorg `21.1.12` (modesetting on virtio-gpu), Openbox 3.6.1 via lightdm autologin on `:0`; AT-SPI bus started from the Openbox autostart (`at-spi2-core` 2.52.0) |
| Chrome | Google Chrome deb `154.0.8037.97-1`; ChatGPT extension `hehggadaopoacecdllhhajmbjkdcmajg` 1.26.901.11451, force-installed by policy, **not signed in** |
| Node | 22.23.3 (nodejs.org linux-arm64 tarball) |
| Others | bubblewrap 0.9.0, AppArmor 4.0.1, gedit 46.2 / GTK 3.24.41, mousepad 0.6.1 (GTK3), gnome-text-editor 46.3 / GTK 4.14.5 |

Everything ran as `admin` (uid 1000) over SSH with `DISPLAY=:0 XAUTHORITY=/home/admin/.Xauthority`. The session bus
came from the SSH session's `XDG_RUNTIME_DIR`. The checkout was pushed to a bare repository in the VM, and `npm ci`
was run there. `CUA_HOME` was the XDG default `~/.local/share/cua`; the download install used a temporary home.

## Item 8: install and doctor

- **From the mirror deb.** `cua install --archive ~/mirror/chatgpt_26.928.40906_arm64.deb --json` returned `{"ok":
  true, "release": "26.928.40906-linux-arm64", "source": "archive", "chromeHost": {…, "changed": true}}` in 24 s.
  GNU `ar` 2.42, GNU `tar` and `xz` unpacked it. The ar member names and the `./usr/...` tar paths caused no problem.
- **Downloaded.** With no `--archive`, in a temporary `CUA_HOME`: `"source": "download"`, length and hash verified, in
  1 min 58 s. The pool still served `chatgpt_26.928.40906_arm64.deb` on 2026-10-06. The 451 MB home was removed
  afterwards.
- **Doctor with user namespaces restricted** (F1 code, `kernel.apparmor_restrict_unprivileged_userns=1`, exit 0).
  These rows passed: `platform`, `runtime.installed`, `runtime.files`, `runtime.vendor-manifest` (`linux-arm64`),
  `runtime.ipc` ("not applicable on linux"), `runtime.signatures` ("archive hash is the trust root on linux"),
  `chrome.host.config`, `sandbox`, `run.stale`, `display` (XTEST, Composite, XFIXES) and `accessibility.bus`
  (`org.a11y.Bus` on `unix:path=/run/user/1000/bus`). `secrets.helper` read `skip`. These were `blocked`:
  - `sandbox.userns`: "bubblewrap could not create an unprivileged user namespace: bwrap --ro-bind / / true failed
    (bwrap: setting up uid map: Permission denied); Ubuntu restricts …"
  - `codex.login`
  - `chrome.host.registered` and `chrome.hosts.live`, because the host was not registered yet.

  The F1 `sandbox` row read `pass`, claiming that cells write only their run directory and have no network. That
  claim was false on this machine; see Item 11.
- **The step.** Applied `kernel.apparmor_restrict_unprivileged_userns=0`, persisted in
  `/etc/sysctl.d/60-cua-userns.conf`, after testing both routes the spec offers:
  - **The sysctl** makes `bwrap --ro-bind / / true` exit 0. The runtime's scoped sandbox then confines cells.
  - **An AppArmor profile**, `profile cua-codex <release>/codex flags=(unconfined) { userns, }`, also gave a fully
    confined scoped sandbox with the restriction still on (cells got `EROFS` and `EPERM`). Children inherit the
    profile: bwrap runs under it, just as Chrome's children run under Ubuntu's `chrome` profile. But doctor's probe
    runs bwrap unconfined, so `sandbox.userns` still read `blocked`, and the profile must follow every release path
    and `CUA_HOME`. The profile was removed after the test.

  The sysctl was chosen because it fits a disposable single-user agent VM, it survives releases, and with it doctor's
  probe tells the truth. The README documents both routes.
- **Doctor after the step** (F2 code, `doctor --json` exit 0, `ok: true`). Every row passes except two:
  `secrets.helper` (`skip`) and `codex.login` (`blocked`: "no Codex login in the server's own CODEX_HOME …; the
  browser route needs one: run cua login"). With the default surface (computer) `sandbox` reads `pass`: "CUA_SHIM_SANDBOX
  unset: on linux with the computer surface the default is disabled, …". With `CUA_SHIM_SURFACES=browser` it reads
  `pass` with the scoped text. `sandbox.userns` reads `pass` in both. Once the host was registered, `chrome.host.registered`,
  `chrome.hosts.live` ("1 OpenAI Chrome host(s) running") and `chrome.extension.me` passed too. Text verdict:
  "passive runtime checks pass; live capability remains unverified (blocked: codex.login)".
- **Doctor with user namespaces restricted again** (F2 code, sysctl temporarily back to 1):
  - Default surface: `sandbox` `pass` (the disabled default) and `sandbox.userns` `skip` ("not needed while
    CUA_SHIM_SANDBOX is disabled: no sandbox runs. CUA_SHIM_SANDBOX=scoped would need it, and it would read: …").
  - `CUA_SHIM_SURFACES=browser`: `sandbox` `fail` ("… the runtime then runs JavaScript cells with no sandbox at all
    …") and `sandbox.userns` `blocked`.
  - `CUA_SHIM_SANDBOX=scoped` (computer surface): `sandbox` `fail` ("… the computer-use helper (sky_linux) cannot
    reach the X display or the session bus …").

  The sysctl was restored to 0 afterwards.

## Item 9: native action

`scripts/accept/linux-native.mjs` (new in F2) did the following:

- started its own `gedit --standalone` on an empty file under `/tmp`;
- over `cua serve` (stdio, default settings), polled `listWindows()` for the window, then `getApp({windowId})`;
- typed the marker with `pressKey`, one keysym per character;
- read it back with `getAXState({disableDiffing: true})`, took a screenshot, called `end_task`, and closed the
  connection;
- compared `$CUA_HOME/run` before and after, then ended its gedit and removed its directory.

Every step passed:

- window `23068920` `org.gnome.gedit`, "fixture-13151f.txt (/tmp/cua-linux-native-f9vodG) - gedit";
- accessibility source `at_spi`, marker `cua-f2-a2883322` read back;
- a 36,951-byte JPEG of the gedit window, showing `cua-f2-a2883322` on line 1;
- `end_task` `{"status": "ended"}`, serve exit 0, `run/` `[]` before and after.

**Text input, measured.** The helper's `typeText` and `paste` insert through AT-SPI (its strings include
`org.a11y.atspi.EditableText`, `PasteText`, `SetCaretOffset`, "editable Paste did not insert text"):

- **GTK3 text views.** Both crashed gedit 46.2, every time (three runs, empty and non-empty buffers), and crashed
  mousepad 0.6.1 as well. The cell got `Resource temporarily unavailable (os error 11)`. The apport core shows
  SIGSEGV in `gtk_text_buffer_get_iter_at_offset`, reached from `gtk_main_do_event` and a signal emission.
- **`pressKey`.** It typed into gedit without trouble.
- **GTK4.** In gnome-text-editor, `typeText` and `paste` inserted the text and then threw `D-Bus
  org.a11y.atspi.Text.SetCaretOffset failed: org.freedesktop.DBus.Error.NotSupported`, and `pressKey` did not reach
  the window.

This may be specific to arm64 or to these GTK builds; no x64 machine was used. The Linux host notes now steer agents to
`pressKey` in GTK3 text views. The fixture uses `pressKey` for that reason.

## Item 10: Chrome

- **Registration.** `cua chrome register --json` placed `~/.config/google-chrome/NativeMessagingHosts/
  com.openai.codexextension.json`. Its body is the same as on macOS: `type: stdio`, both extension origins, and `path`
  = `$CUA_HOME/runtimes/26.928.40906-linux-arm64/chrome-plugin/extension-host/linux/arm64/extension-host`.
  `chrome unregister` reported every one of the eight Linux browser entries (`removed` for chrome, `absent` for the
  other seven) and `register` placed it again.
- **The host starts without sign-in.** Within 20 s of registration the extension, still signed out, launched cua's
  host. Its parent was Chrome, its AppArmor label is `chrome (unconfined)`, and it created
  `/tmp/codex-browser-use/<uuid>.sock` (directory mode 1777, socket 0600). Doctor's `countLiveHosts` read "1 OpenAI
  Chrome host(s) running". The host was still alive 35 minutes later; the macOS "exits about a minute after waking"
  behaviour was not seen while the extension stayed connected.
- **Profiles.** `cua profiles add me --chrome-profile Default` reported `"extension": "installed"`.
  `cua profiles bind me --json` launched the bounded listing (scoped sandbox, browser surface), found one backend
  (`e579ff6c-…`, Chrome profile `Default`, "Your Chrome"), and bound it automatically by directory
  (`"directoryMap": {"status": "complete"}`). `profiles list` shows `me` ready. `verify.mjs` with
  `CUA_SHIM_SURFACES=computer,browser` reports `profilesList` `{"status": "ok", "keys": ["me"], "ready": ["me"]}`.
- **The tab cell (blocked).** Over `cua serve` with `CUA_SHIM_SURFACES=computer,browser`:
  - `cua.getBrowser({extensionInstanceId})` returned browser `1`, with the vendor's documentation.
  - `cua.createBrowserTab(browserId, 'https://example.com/')` failed with **`Codex auth token is unavailable`**. The
    browser route needs the server's Codex login (`cua login`), which only the owner may make. Whether the
    extension must also be signed in is not known until then. `scripts/accept/linux-chrome.mjs` finishes the item
    once the owner has signed in: it checks the live host's path, reads the bound instance id from
    `profiles_list`, opens, reads and closes the tab, and checks `run/`. A dry run before the login passed the
    host and `profiles_list` steps and stopped at that same error.

## Item 11: sandbox and bus from inside

These are the measurements behind F2's sandbox change. Cell probes ran through `cua serve`; the trusted worker, where
the sky service spawns `sky_linux`, runs under the same `codex sandbox` wrapper.

| State | Cell writes `~/.local/share/cua/…` | TCP | unix connect: X0, session bus, AT-SPI bus | `listWindows` / item 9 |
|---|---|---|---|---|
| `scoped`, user namespaces allowed | `EROFS` | `EPERM` | `EPERM`, `EPERM`, `EPERM` | fails: `Could not connect to X11 … Operation not permitted` |
| `scoped`, user namespaces restricted (Ubuntu default) | **written** | **connected** | connected | passes, unconfined |
| `disabled` | written | connected | connected, connected, connected | passes |

- **With user namespaces allowed, the sandbox works.** `node_repl` runs each child through the pinned `codex sandbox`.
  That calls `codex-linux-sandbox`, which runs `/usr/bin/bwrap --as-pid-1 --new-session --die-with-parent --ro-bind /
  / … --unshare-user --unshare-pid --unshare-ipc --unshare-net --cap-drop ALL`. Inside, `connect(2)` is refused for
  every socket, unix sockets included. **Neither X nor the session bus is reachable**, so the computer surface cannot
  work under `scoped`.
- **The usual remedies are not honoured on Linux.** The `codex` permissions `node_repl` passes never include unix
  sockets, so `NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS`, which on macOS becomes `--allow-unix-socket`, does not reach
  Linux. A managed profile's `network: "enabled"` was tried and also ignored.
- **The browser surface does work under `scoped`.** `profiles bind` and `getBrowser` succeeded. The browser service
  reaches the host's socket through `node_repl`.
- **Fail-open under the restriction.** With user namespaces restricted, bwrap's user-namespace setup is denied
  (`audit: apparmor="DENIED" operation="capable" profile="unprivileged_userns" comm="bwrap" capname="setpcap"`). The
  runtime then starts the kernel and the trusted worker with **no sandbox at all**: no `codex` or bwrap is in the
  tree, cells write anywhere and reach the network. Nothing reports this. Item 9 "passes under `scoped`" here only
  because nothing is confined.
- **`disabled` uses no sandbox** (no `codex` or bwrap in the tree), so it does not need user namespaces.
- **Teardown.** A bubblewrap subtree is outside the anchor's process group, because bwrap's `--new-session` gives it
  a new session. It still ends with the connection, because `--die-with-parent` ties it to its parent. A serve killed
  with SIGTERM or SIGKILL mid-cell, on either surface, left no runtime process; SIGKILL left its `run/` entries for
  the next sweep, as designed.

**What F2 changed.**

- `CUA_SHIM_SANDBOX` now defaults to `disabled` on Linux when the computer surface is on, and to `scoped` otherwise.
  An explicit value always wins.
- Doctor's `sandbox` row fails for `scoped` together with the computer surface, and for `scoped` where user
  namespaces are refused. `sandbox.userns` reads `skip` while no sandbox runs.
- `verify.mjs` accepts the system bubblewrap and its subtree's own process group, and fails if any runtime process
  outlives the close.

## Item 12: tests

- **macOS (the MacBook):**
  - `npm test`: 614 tests, 614 pass, 0 fail, 0 skipped.
  - That includes `test/accept-linux-native.test.mjs` and the new `probe-lib`, `mcp-sandbox` and
    `runtime-linux-doctor` cases.
- **The VM**, with the runtime installed under the default home, so the classic-level tests that F1's simulated
  Linux run had to skip now ran:
  - `npm test`: 614 tests, 571 pass, 43 skipped, 0 fail. The skips are the darwin-only codesign, `ditto` and Keychain
    tests named in the F1 report.
  - The first VM run, with the F1 code plus the sandbox default, found four failures that only a real Linux host with
    an installed runtime exercises. They are fixed in `1356921`:
    - a macOS "Full Disk Access" literal;
    - two tests that assumed `scoped` is the computer surface's default;
    - a staging-mode test that relied on a 077 umask (Ubuntu's is 002).

    One of these failed mid-test with its server still open, and that held the `serve-cli` file open until it was
    killed; the fixed suite has no hang.
- **`verify.mjs` on the VM, all passing (`problems: []`, exit 0):**

  | Configuration | Host notes served | Processes |
  |---|---|---|
  | default (computer, `disabled`) | 1,152 characters | no bwrap |
  | `CUA_SHIM_SURFACES=computer,browser` | 2,043 characters | `profilesList` ok, `me` ready |
  | `CUA_SHIM_SURFACES=browser` (`scoped`) | | two bwrap subtrees |
  | `CUA_SHIM_SANDBOX=scoped` (computer) | | two bwrap subtrees |

  The native-helper step reads `skip`. Under F1's `verify.mjs` the scoped runs failed: "a runtime process is outside
  the anchor's process group" and "pid … /usr/bin/bwrap" not relocated. No process showed as `<unreadable …>`.

The host notes as served on Linux with `computer,browser` (the vendor's 61-character line plus a blank line, then
cua's notes) are 2,043 characters, within Claude Code's 2,048.

## Spike #12's unverified items

- **bubblewrap and user namespaces under Ubuntu 24.04's AppArmor restriction.** bwrap is refused (`setting up uid
  map: Permission denied`), and the runtime then **fails open**: no sandbox, silently. Either the sysctl or an
  AppArmor `userns` profile for the release's `codex` restores it; both were measured.
- **D-Bus and X from inside the node_repl sandbox.** **Not reachable**: every unix-socket `connect` is `EPERM`, and
  neither the socket allowance nor `network: enabled` changes that on Linux. The computer surface therefore runs with
  the sandbox disabled, F2's new Linux default.
- **Chrome's AT-SPI exposure.** With default settings, Chrome's window is X11 only (`Accessibility source: x11`, one
  line). It joins AT-SPI when toolkit accessibility is on (`org.a11y.Status.IsEnabled`, set persistently by `gsettings
  set org.gnome.desktop.interface toolkit-accessibility true`); then the frame is an `at_spi` element. The web
  contents appear only when Chrome is also started with `--force-renderer-accessibility` (80 lines with the page's
  "Log in or sign up" and "Continue with Google"). The flag alone, with IsEnabled false, still gave x11 only. The
  browser surface needs neither. The VM keeps both settings.
- **arm64 against the x64 inspection.** Everything held:
  - The arm64 deb has the pinned layout (`runtime.files` passes).
  - Its vendor manifest is `linux` / `arm64` / `linux-arm64` with the pinned node and runtime versions.
  - `sky_linux_arm64`, `extension-host/linux/arm64/extension-host`, `codex` and `node_repl` are aarch64 ELF and run.
  - The helper drove X and AT-SPI, and the host served the extension.

  The one behaviour the inspection could not predict is the GTK3 crash under `typeText`/`paste`, which may or may not
  be arm64-specific.
- **Pool retention.** The mirror answers it: the pinned arm64 file still downloaded today, and the README tells users
  to keep a copy.

Not settled here:

- the login line `cua login` prints when `xdg-open` is absent. That needs a `codex login` run, which is the owner's
  step; the VM has `xdg-open`.
- the browser route past `createBrowserTab`, which needs the owner's login.
- multi-user behaviour of `/tmp/codex-browser-use`: one user here; the directory was created 1777 by the host.
