# #115 M0: the retained Linux vendor parity control on `cua-gce`

Spec `docs/doperpowers/specs/2026-10-17-own-sandbox-design.md`, M0 "Baselines and controls" and acceptance 12: the last vendor-host runs on Linux before M3 retires the vendor host there. M3 and M4 diff the own host against this directory:

```sh
node scripts/repl-parity.mjs diff docs/evidence/2026-10-17-own-sandbox/m0/gce-vendor-control docs/evidence/2026-10-17-own-sandbox/<m>/gce-cua --expected test/repl-parity/expected-differences.json
```

## How it ran

```sh
node scripts/repl-parity.mjs prepare --device cua-gce --commit 8afd143 --profile me
node scripts/repl-parity.mjs run --device cua-gce --host vendor --suite all --out docs/evidence/2026-10-17-own-sandbox/m0/gce-vendor-control
node scripts/repl-parity.mjs cleanup-prepared --device cua-gce      # {"removed": true}
```

- **Box:** `../gce-box/` (Chrome 155 arm64, cua's extension by policy, profile `me` bound to Chrome's `Default`, Xorg dummy 1280 × 800, gedit 46.2).
- **Commit:** the box's parity clone at `8afd143a378bc683c83e5a6b62cfafdc48b50c02`. The controller ran this worktree at `ce45273` (`meta.harnessCommit`), whose harness code is the same as `8afd143`'s; it adds only evidence.
- **Runtime:** `26.928.40906-linux-arm64`, freshly installed in the prepared scratch home, with managed Node v24.22.0. Every one of the 91 connections attested the vendor host (`rmcp`).
- **Sitting:** 10:04 to 11:08Z on 2026-10-17. `run.log` is the runner's output.

## Result

- **Complete:** 493 cases, 0 pending, 492 covered, 1887 rows. The verdict is `RECORDED_VENDOR_DEFECT`.
- **The one recorded vendor defect:** `cells/confinement/no-unsandboxed-fallback`, entry `linux-vendor-sandbox-launcher-fail-open` (#135). The pinned Linux vendor host runs the cell unconfined after its sandbox launcher fails. This is the behaviour M3 removes by refusing.
- **The native cases** ran under the fixture's `{surfaces: computer, sandbox: disabled}`. Every native assertion passed.

## The first attempt, and the fix to the box

`../gce-vendor-control-attempt-1/` (committed) is the same command at the same commit, run at 08:55–09:57Z before the fix. It completed with `assertions: FAIL`, from four unexpected failures and the same vendor defect:

- `api/browser-playwrightapi/waitforevent`
- `api/browser-playwrightdownload/path`
- `api/browser-playwrightfilechooser/ismultiple`
- `api/browser-playwrightfilechooser/setfiles`

Each failed with "fixture download cleanup failed". The root is the `set-files` cell: `fileChooser.setFiles` was refused with the service's own sentence, "To enable file upload, go to chrome://extensions … enable 'Allow access to file URLs.'". The cleanup's proof then failed validation, and the fixture's downloads (`parity*.txt`, `image.svg`) stayed in `~/Downloads`.

No Chrome policy grants an extension file access (`docs/evidence/2026-10-08-downloads-dialogs-chooser.md`; the Tart VM's `me` had it switched on by hand, per #116's execution report). The setting lives in the profile's MAC-protected `Preferences`, so editing the file was ruled out. The fix:

1. Open `chrome://extensions/?id=jkejaaijdfpohkdhankllbekkhmnippb` in the box's Chrome. I drove the box's own `sky_linux` (keys and a click, verified on screenshots; this is the harness-owned desktop of the harness-owned box).
2. Switch **"Allow access to file URLs"** on for cua's extension.
3. Return the tab to New Tab.

Afterwards `cua profiles list` still showed `me` ready with the same extension instance (`50633755-…`). I removed the stranded fixture downloads, cleaned up the preparation, prepared again and reran. **The box keeps this setting.** M3's own-host runs on the same box therefore see the same Chrome as this control.

After the rerun I removed one more fixture leftover, `~/Downloads/image.svg` (a 160-byte synthetic SVG). The box then had no parity scratch home, gedit or download left.
