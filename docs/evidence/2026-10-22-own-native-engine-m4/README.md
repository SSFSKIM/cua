# M4's live evidence, from the closed `feat/117-m4`

This is M4's evidence directory as it stood on `feat/117-m4` at a8c3bc1c (PR #211, closed): the mini's holds and owner
sittings of 2026-10-23 and 2026-10-24, and the hosted download proof. M4's report
(`docs/doperpowers/specs/2026-10-18-own-native-engine-m4-report.md`) and the design spec's "M4 on feat/117-m4"
Decision Log block both cite it. Every file here is byte-identical to the branch's copy; none was edited.

## Owner-content check

The repository is public, so all 47 files were read before commit. The check was done by the M4 re-cut's T7 executor
(an agent) on 2026-11-23. It looked for:

- the owner's windows or apps, names, email, and account or machine names
- profile names or ids
- home-directory paths naming the user
- personal content
- tokens or secret-looking values

The directory holds no images. The reading covered every distinct JSON key and string value in all 47 files.

**All 47 files passed and are here.**

### What the check saw

- Generated probe key names (`CUA_PROBE_…`, `CUA_ACCEPT_UI_…`) appear without their values.
- The vendor's signing team ID and the engine's bundle id appear; both are public.
- The window records hold PIDs, numbers and bounds, never titles.
- One note says a disposable fixture document autosaved to iCloud's TextEdit folder. It gives no name and no content.

### The home path

The home path `/Users/new/…` appears in 10 files. The first commit of this directory left those 10 out under a
literal reading of the rule. On 2026-11-23 the design session ruled that this path is not owner content, and the 10
files were then added unchanged:

- The bare account path `/Users/new/` names no person.
- It already appears in 4,045 public files on main, 3,494 of them under `docs/evidence/`.
- Ruling 1124 is the precedent: it kept a `/Users/new/…` socket path in #493's public evidence.

The ruling covers that path only. The check stays as it was for names, emails, tokens, profile names or ids,
non-fixture windows and images.
