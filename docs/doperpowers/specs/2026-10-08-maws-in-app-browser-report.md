# Execution report: MAWS in-app browser driven by cua_repl (#13)

**Spec:** `docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md`, approved at 22a27bc. The spec's Progress,
Surprises & Discoveries, Decision Log and Outcomes & Retrospective are the authoritative record. This file is the
account of the run.

**How it ran:** a plan-executor controlled the run under doperpowers:subagent-driven-execution, on 2026-10-08:
- one fresh opus task-executor per milestone;
- `doperpowers:reviewer-high` at every milestone frontier and for both whole-branch reviews, on opus, because astra was
  at its usage limit until Oct 13; the coordinator accepted this;
- fixes went back to the executor that wrote the code.

**Pull requests:**
- cua: https://github.com/SSFSKIM/cua/pull/91, base main, `Closes #13`.
- MAWS: https://github.com/SSFSKIM/MAWS/pull/1, base master, no closing keyword.

Neither is merged.

## Status

DONE_WITH_CONCERNS:
- Every milestone is built and reviewed clean, and both whole-branch reviews are clean after their fix waves.
- The acceptance items that need an app session running the 0.5.0 plugin are BLOCKED for the owner's sitting. Its
  steps S1-S7 are in `docs/evidence/2026-10-08-maws-in-app-browser.md` and use `--plugin-dir`.
- The release (marketplace, plugin cache) is held until merge.

## Milestones

| Milestone | Commits | Review |
|---|---|---|
| M1 (cua): client-mode host, discovery, `maws` profile | c4f9c86, 0bd4190; fix ab7db6e | 1 P2 fixed. The default selection is now resolved at selection time, so a serve started while MAWS was down picks it up. |
| M2 (MAWS): primitive server, leases, launch env, spikes S1/S2 (both PROMOTE) | b5dec4aa..d1d9d910, cua 602391b; fix e33bf014 | 1 P3 fixed: an attach during a closing lease now waits for the release. |
| M3 (MAWS): control and takeover, cursor, activity rows, downloads, dialogs, badge, tab cap | 46fdc6b9..3bdad848, cua 4ae0f10; fix 9be49224..be8e257b | 2 findings fixed: dialog routing and navigation attribution now follow `personHolds`. The same wave added the owner's persistent activity rows and the 500-entry buffer, and the ` (1)` suffix. |
| M4 (MAWS): cut-over, A-54, charter | ef3256b3..a04c83b5; fix 2e08cd75..82bdf2be | 4 P3 fixed: the cursor is hidden before capture, the owner-script note, the tracker remedy, and the P-5 pointer. |
| M5 (cua): live acceptance and evidence | b1d802f, 1172f51, 3d7a486 | Covered by the whole-branch review. |
| MAWS whole branch | 38d4df7f..a47603a4, tracker fb56e803 | "incorrect", then fixed. Screencast screenshots, cookie-jar methods refused, downloads following `personHolds`, and the owner's Browser panel opening. Re-review clean. |
| cua whole branch | fabc6b3 | "correct", plus 1 P3: the probes now refuse to run without `CUA_BROWSER_BACKENDS`. |

Commit ranges:
- cua: eb692a8..HEAD on `maws-in-app-browser-13`. Spec commits are interleaved.
- MAWS: aa1fa4ff..fb56e803 on `e13-cua-in-app-browser`.

## Validation evidence (commands run in this session)

- **cua.** `npm test` at fabc6b3: 1034 tests, 1033 pass, 0 fail, 1 skipped (that skip was already there). Of 5 runs,
  one had a single failure that did not recur and was not identified.
- **MAWS static checks.** `pnpm typecheck` and `pnpm lint` at fb56e803: exit 0, run by me.
- **MAWS unit tests.** `pnpm test` at a47603a4: 9778 pass, 1 skipped (the M5 executor's run).
- **MAWS e2e.**
  - `e2e:browser-cua`: 3/3.
  - `e2e:tools`: 8/8.
  - `test:live` at M4: 39/40. The failure is W1, engine drift, not this change.
- **Live, against MAWS a47603a4 and the real vendor runtime:**
  - harness: 11/11, including `--other` isolation;
  - selection probe: 11/11;
  - reconnect: ready again in 2.0 s;
  - takeover, cursor and cookie-jar probes: all pass;
  - the 30 s dialog default: confirmed live in M3.

## Decisions taken during execution

Each has a dated entry in the spec's Decision Log. In brief:
- A pre-flight entry sets the rules for the live environment.
- The default selection is resolved at the moment of selection.
- The reviewer rung ran on opus.
- Each milestone's mechanism choices are recorded.
- Two coordinator and owner decisions:
  - activity rows stay in view and survive a reload;
  - the Browser panel opens when the agent acts.
- Two final-review rules:
  - screencast screenshots, and only viewport-bounded starts count;
  - the cookie-jar methods are refused.
- Acceptance 3, 8, 9 and 10 are reworded to what the pinned vendor actually does.

## Environment friction

- **astra unavailable.** astra returned HTTP 400 (usage limit until Oct 13), so every review ran on opus.
- **Repeated hand-backs.** The harness's hand-back enforcement ended the controller's run several times while
  reviewers or executors were running. The coordinator resumed it each time, and the ledger
  (`.doperpowers/sde/2026-10-08-maws-in-app-browser-design/progress.md`) carried state across.
- **The owner's packaged MAWS stayed running throughout.** All live work used dev or bare-Electron builds with their
  own userData under /tmp.
- **No inside-MAWS session.** Driving a session with a real engine headlessly was not set up, so the inside-MAWS items
  wait for the owner's sitting.
- **Playwright and dialogs.** Playwright's Electron driver dismisses page dialogs, so the dialog route can only be
  seen live on a MAWS started without Playwright (`serve-plain.cjs`).

## Small fixes I made directly as controller

- MAWS 82bdf2be: one tracker sentence.
- MAWS fb56e803: tracker rows for the deferred minors.
- cua fabc6b3: a three-line guard in each of three probes.

## Residue (for tickets)

- **Activity rows across an app restart.** They survive a reload but not an app restart; this needs a journal or store
  for `browser.agent.activity`.
- **MAWS `test:live` W1.** The case asserts the on-disk steer record exactly, and engine 2.1.295 adds `delivery_id`.
  The case or the engine pin needs updating.
- **Socket peer authentication.** Every process in a session has the browser socket path. A per-launch token or a
  signed-peer check would narrow that; it needs its own design.

Held for the dispatching session (not tickets):
- the owner's inside-MAWS sitting (S1-S7);
- the 0.5.0 release after merge.
