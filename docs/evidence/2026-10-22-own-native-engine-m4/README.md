# M4's live evidence, from the closed `feat/117-m4`

M4's evidence directory as it stood on `feat/117-m4` at a8c3bc1c (PR #211, closed): the mini's holds and owner
sittings of 2026-10-23 and 2026-10-24 and the hosted download proof. M4's report
(`docs/doperpowers/specs/2026-10-18-own-native-engine-m4-report.md`) and its Decision Log entries (the design spec's
"M4 on feat/117-m4" block) cite it. Every file here is byte-identical to the branch's; none was edited.

## Owner-content check

The repository is public, so every file was read for the owner's windows or apps, names, email, account or machine
names, home-directory paths naming the user, personal content, and tokens or secret-looking values, before it was
committed. Checked by the M4 re-cut's T7 executor (an agent), 2026-11-23. The directory holds no images.

47 files were read: 37 passed and are here; 10 were left out. Each of the 10 fails for one reason only: a
home-directory path naming the user account (the approved engine's and the vendor runtime's locations under the home
`Library/Application Support`, a checkout under the home, or the coordinator's job directory). Nothing else in any
of the 47 failed. These files remain readable at a8c3bc1c on the branch.

| Left out | Reason |
|---|---|
| `2026-10-23-frame-d0-prestep/engine-approved-frame-d0.json` | home path (the approved engine's bundle path) |
| `2026-10-23-frame-prestep/engine-approved-frame.json` | home path (the approved engine's bundle path) |
| `2026-10-23-hold/acceptance1.json` | home path (`doctor`'s engine row names the bundle path) |
| `2026-10-23-hold/compatibility.json` | home path (the vendor runtime and a checkout) |
| `2026-10-23-hold/putback.json` | home path (the vendor runtime) |
| `2026-10-23-hold/vendor-admission-safe.json` | home path (the vendor runtime) |
| `2026-10-23-owner-retry/provenance.json` | home path (the coordinator's job directory) |
| `2026-10-23-unattended-retry/admission-engine.json` | home path (`doctor`'s engine row names the bundle path) |
| `2026-10-23-unattended-retry/compatibility.json` | home path (the vendor runtime and a checkout) |
| `2026-10-24-owner-timeout/provenance.json` | home path (the coordinator's job directory) |
