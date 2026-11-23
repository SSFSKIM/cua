# M2b hold 10 (2026-10-23 21:24–22:52Z, the mini, sitting hold10-20261023-184-188)

The last matrix run against the vendor's engine, and the run in which acceptance 6 was met. Before this commit, its
only copy was the coordinator's job directory on the MacBook. The M4/M5 pre-flight cites it in §2 finding 2 and §7.
It was committed by the M4 re-cut's T7 (#117), as ruled in 1108.

- The controller was at 2f71911e and the approved engine was build d0b2fa13, approved 2026-10-23T20:33:19Z on M4's
  branch.
- `hold-outcomes.json` sums up the run and `coordinator-rulings.json` holds the coordinator's rulings during it.
  `initial-posture.txt`, `pre-matrix-posture.txt` and `lanes.txt` record the posture readings between phases.
  `env.sh`, `posture.sh` and `collect-sidecars.sh` are the controller's own scripts.

| What | Where | Outcome |
|---|---|---|
| Matrix pair (#184) | `matrix/{vendor,cua}/run-1`, `matrix-*.log`, `matrix-summary.txt` (= `matrix-comparison.txt`), `matrix-*-issues.json`, `matrix-vendor-counts.json` | One pair, FAIL as recorded. Vendor 563 rows (397 ok, 88 invalid, 78 failed); cua 562 rows (444 ok, 90 invalid, 28 failed). One run per side, where 3 are the rule |
| native-mac pair (acceptance 6) | `native-mac/{vendor,cua}`, `native-mac-*.log`, `native-mac-diff.txt` | Both complete; `summary: 0 unexpected differences` |
| Route A/B (#184) | `route-ab/run-1`, `route-ab.log`, `route-ab-judgment.json` | Raw pass, judged incomplete: sample 5 was invalid because of the harness's release check |
| #188 diagnostic | `electron-focus/cua/run-1`, `electron-focus*.json`, `electron-focus.log` | 5 valid arms |
| Finder frame pin (M4.5-D, M4.6, M4.8) | `finder-frame-summary.json`, `*-finder-steps*.jsonl` | Exact in six of six opens |
| Activation guards | `*-activation-guards*.jsonl` | Per phase; `-all` is the whole file, the other is the current hold's rows |

## Owner-content check

The repository is public, so all 103 files were read before commit for the owner's windows or apps, names, email,
account or machine names, profile names or ids, home-directory paths naming the user, personal content, and tokens
or secret-looking values. The check was done by the M4 re-cut's T7 executor (an agent) on 2026-11-23. The directory
has no images: 18 JSON, 30 JSONL, 9 logs, 3 shell scripts and 43 text files. The reading covered every distinct
JSON key, every string value and every text line in all 103 files.

**103 passed and none were left out.** Every file is byte-identical to the original.

- **Every window is a harness fixture.** They are the TextEdit `cua-scene.rtf`, Finder's `cua-scene-finder` with
  `scene-file-NNN`, Chrome for Testing's `cua scene page` on 127.0.0.1, and the cua Electron Fixture. The front app
  is Terminal. The Open panel's rows record only booleans and counts, not the files it lists.
- **Nothing else is owner content.** There are no names, emails, profile names or ids, tokens or secret-looking
  values. The posture files carry MAWS's tart VM image names, which are CI images, plus the mini's hardware model
  and its ssh alias `mini`.
- **The home path `/Users/new/…` appears in 37 files and is not owner content.** The design session ruled this on
  2026-11-23: the bare account path `/Users/new/` names no person and is already in 4,045 public files on main,
  3,494 of them under `docs/evidence/`. Ruling 1124 is the precedent: it kept a `/Users/new/…` socket path in #493's
  public evidence. The ruling covers only that path. The check stays as it was for names, emails, tokens, profile
  names or ids, non-fixture windows and images.
- **Logs are force-added.** The repository ignores `*.log`, so the 9 logs here were added with `git add -f`.
