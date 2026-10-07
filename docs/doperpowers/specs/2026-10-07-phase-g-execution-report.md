# Phase G execution report: one server, every device (issue #70, closes #69)

Spec: `docs/doperpowers/specs/2026-10-06-remote-and-linux-design.md`, section "Phase G: one server, every device" (its Decision Log, Surprises & Discoveries "Phase G" and Outcomes & Retrospective carry the living record). Branch `feat/device-multiplexing`, worktree `/Users/new/Developer/GitHub/cua-wt-70`, commits `d1ab9dd..92e879b` (32 commits). PR https://github.com/SSFSKIM/cua/pull/71 (ready for review; `Closes #70`, `Closes #69`). Board: #70 in-progress at start, in-review at the PR.

## Status

DONE. Acceptance 13–18 passed live in both directions. Every task review and the whole-branch review ended clean. `npm test` at 92e879b: 780 tests, 779 pass, 0 fail, 1 skipped (704 pass before).

## How it ran

The spec section was written first (7708f3a) and sent to the coordinator. The coordinator confirmed it and added one ruling: a session the client re-opens by itself says that its REPL state is fresh. That ruling was folded in at def11d1. The spec was then executed with doperpowers:subagent-driven-execution: a fresh opus `task-executor` for each milestone, and an opus `task-reviewer` at each frontier. Reviewers were pinned to opus because the sol and astra gateways were at their limits.

| Milestone | Commits | Review |
|---|---|---|
| G1: registry, `cua devices`, reserved prefix | d532546, afba208; fix 465c1e2, 3ad2b7c | One fix wave. The prefix check was case-sensitive, and macOS's case-insensitive APFS let `{{secret:cua_device_<id>}}` type the credential (reproduced against the real store). Device names were also echoed in errors. Clean at 3ad2b7c. |
| G2: Streamable HTTP client, `Cua-Console` header | b3557af, 1762a05; fix 72d2783 | One fix wave. A request whose signal was already aborted was still sent. A cancellation could overtake its request. There was no bound on the head wait. Clean at 72d2783. |
| G3: target in the stdio server | 15d2a66, 8d3894a; fix 3be9741, f74db8f | One fix wave. A stale five-tool assertion broke chrome-all acceptance. A `task_open` race during a lazy open. Stray ids. Close answers. Clean at f74db8f. |
| G4: live acceptance, docs, 0.3.0 | c346167, 54603ef, 2882096, 0d76ff5 | Covered by the final review. The executor's API connection dropped once mid-run and it was resumed. |
| Whole-branch review (reviewer-high brief, opus) | fix e6222d0, cherry-picked as cbcca48; doc fix 92e879b | G1–G3 were reviewed while G4 ran. Two seam defects were found and reproduced: a `js` pipelined between two `devices_use` calls ran on the later device, and a close during a device-to-device switch leaked the new session. Both were fixed in a separate worktree and re-reviewed as correct. The last stretch (G4) was then reviewed and left one doc clause, which was fixed. |

## Acceptance (evidence `docs/evidence/2026-10-07-device-multiplexing-acceptance.md`)

Items 13–18 passed MacBook → mini and mini → MacBook through `https://178-104-102-73.sslip.io`. Item 15, a relay restart mid-`js` with the result delivered by `Last-Event-Id` replay, passed once per direction, each time only after confirming no other client was on the relay. The credential appears 0 times in every captured output and transcript. Both launchd agents, both main checkouts and the plugin cache were left untouched.

## What the live run found

- Claude Code 2.1.292 shows the model only the `structuredContent` of a successful result. `devices_use`'s host notes therefore moved into the structured content (54603ef). The local `profiles_list` has the same blind spot (residue).
- The first `js` on a fresh device session returns the API document, so this recurs once per task on a device.
- The mini's network was degraded from about 04:40 to 05:01 UTC. Two Chrome attempts failed in that window, and the next full run passed.
- The probe is a 3 s snapshot.
- Approvals over the plugin route took 0.9–4.7 s, against about 0.4 s on the standalone route.

## Decisions taken without the coordinator

All are recorded in the spec's Decision Log, newest first:
- The probe never opens a session.
- Sessions open at `devices_use` and are DELETEd after `end_task`.
- The local initialize params are forwarded to the device.
- Elicitations from the device are remapped to fresh ids.
- The resume budget is 90 s, and no call is ever resent.
- The device tools exist on stdio connections only.
- The registry uses the ticket's flat shape.
- The reserved prefix applies to the model-facing surfaces only.
- `devices_use` answers in structured content.
- G1–G3's mechanics, as each executor reported them.

## Environmental friction routed around

- The `/secret` mod's guard refused a heredoc that named the store directory, so the spec was written through file tools instead.
- `.doperpowers/sde/` was not gitignored in this repo, so it was added to `.gitignore`.
- G2's commits interleave with G1's fixes, so G2 was reviewed from two packages.
- The G4 executor dropped on an API connection error and was resumed from its transcript.

## Left behind

- Each Mac has `~/.config/cua/devices.json` and the other Mac's `CUA_DEVICE_*` key in its secret store. This is the owner's working setup.
- The mini has a detached worktree `/Users/new/Developer/GitHub/cua-wt-70` of the branch.
- This MacBook has the worktree `/Users/new/Developer/GitHub/cua-wt-70` (kept, per the brief) and `/Users/new/Developer/GitHub/cua-wt-70-fix` (branch `fix/g70-branch-review`, already cherry-picked; removable).
- The relay was restarted twice in total.

## Residue

- The local `profiles_list` guidance never reaches the model (structured content only).
- Update both launchd agents to 0.3.0 after merge, so the device side of the prefix and the `Cua-Console` header take effect.
- The host-notes budget is effectively exhausted: 2,045 of 2,048 characters on Linux.

## Deferred review minors

In the PR's "Unresolved Review Findings" and in `tech-debt-tracker.md`:
- `cli.mjs` size.
- One test title.
- Two message and ordering refinements in `target.mjs`.
- The Linux host-notes margin.
