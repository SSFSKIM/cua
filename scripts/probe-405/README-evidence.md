# #405: hosted macOS qualification

The final single-batch fix removed most of the Chrome for Testing (CfT) slowdown seen in the earlier two-request smoke. In the full run, CfT's regular 286-node fixture rose from **176.12 to 178.20 ms p50 wall**; its reused-settle fixture rose from **466.48 to 484.33 ms p50 wall**. The reused final walk was slower in all four CfT blocks. AppKit's **+254.91 ms p95** reused-settle spike did not reproduce in the 40-per-head follow-up; its wall p95 delta fell to **+23.00 ms** and the maximum favored the fix. A smaller final-walk cost did reproduce, tied to the extra classification before Markdown reads.

## Final single-batch latency

[Full matrix 44228841099](https://github.com/SSFSKIM/cua/actions/runs/44228841099) used kit `65c00994a559ca02ba26bd75cbf60daee234f4b5` and unmodified release builds of main `11f1ff68135a72b345880aea1e19a01b3e366996` and fix `5f2926134d3340ff27e52c9fb278eb0e6e471d77` (0.28.12). Each arm has **20 warm observations per head** in one hosted job per app: four blocks of five samples per head, alternating the head order by block. Each block starts both engines in turn, each with an uncounted warm-up. Wall is native `get_app_state` RPC time with screenshots disabled, excluding the renderer and independent fixture attestations. `walkMs` is the observation's final walk; the forced settle arm requires `settleTreeReused:true` and separately reports its preceding busy walk.

All numbers are milliseconds. Triples are nearest-rank p50 / p95 / max. Delta is fix minus main. Counts below are window-tree nodes, excluding the menu bar; both large fixtures add 216 visible editable fields. That is a stress case, not a representative settings or content page.

| App / arm (nodes) | Phase | Main | Fix | Delta |
|---|---|---:|---:|---:|
| CfT small (69) | Wall | 55.65 / 64.82 / 66.03 | 56.07 / 68.96 / 70.15 | +0.42 / +4.14 / +4.12 |
| | Walk | 42.81 / 51.27 / 53.12 | 42.65 / 53.88 / 57.07 | −0.16 / +2.60 / +3.95 |
| CfT large (286) | Wall | 176.12 / 185.74 / 291.22 | 178.20 / 188.13 / 190.43 | +2.09 / +2.39 / −100.80 |
| | Walk | 156.51 / 169.05 / 175.68 | 162.06 / 169.70 / 173.63 | +5.55 / +0.65 / −2.05 |
| CfT large, reused settle (286) | Wall | 466.48 / 511.01 / 514.18 | 484.33 / 535.73 / 557.67 | +17.85 / +24.72 / +43.49 |
| | Walk | 100.11 / 118.98 / 158.43 | 115.96 / 144.31 / 166.24 | +15.84 / +25.32 / +7.82 |
| | Settle busy walk | 66.11 / 84.59 / 85.44 | 67.53 / 71.32 / 71.47 | +1.42 / −13.27 / −13.97 |
| AppKit small (11) | Wall | 17.27 / 65.68 / 76.18 | 15.90 / 26.07 / 29.95 | −1.37 / −39.61 / −46.23 |
| | Walk | 11.19 / 58.14 / 62.50 | 10.66 / 17.19 / 18.27 | −0.53 / −40.95 / −44.23 |
| AppKit large (227) | Wall | 229.53 / 302.98 / 588.45 | 237.69 / 360.35 / 375.93 | +8.16 / +57.37 / −212.51 |
| | Walk | 211.41 / 291.03 / 570.83 | 223.20 / 347.27 / 349.94 | +11.79 / +56.24 / −220.89 |
| AppKit large, reused settle (227) | Wall | 617.51 / 730.88 / 744.95 | 585.35 / 985.79 / 1494.41 | −32.16 / +254.91 / +749.47 |
| | Walk | 98.59 / 154.94 / 162.59 | 111.14 / 179.87 / 193.62 | +12.55 / +24.93 / +31.04 |
| | Settle busy walk | 95.24 / 188.01 / 202.06 | 102.78 / 343.93 / 904.35 | +7.54 / +155.91 / +702.29 |

**Paired block medians, fix minus main.** Each vector is in block execution order; medians subtract the two sets of five, not individual observations. The small regular wall differences are near zero; the large CfT final walk has a small positive delta in every block, and reuse has a larger positive final-walk delta in every block. AppKit shows larger block-to-block swings. This is not a formal equivalence claim.

| App / arm | Wall Δ (blocks 1–4) | Final walk Δ (blocks 1–4) | Busy walk Δ (blocks 1–4) |
|---|---:|---:|---:|
| CfT small | −3.50 / +12.68 / +1.20 / +9.84 | −2.51 / +8.12 / −2.67 / +6.74 | — |
| CfT large | +6.77 / −2.35 / +13.36 / +2.09 | +4.91 / +5.24 / +12.23 / +4.67 | — |
| CfT large, reused | +9.70 / −13.97 / +16.57 / +31.74 | +23.52 / +1.57 / +8.74 / +23.35 | −14.53 / +2.58 / +0.71 / +1.10 |
| AppKit small | +0.72 / −2.16 / +7.89 / −35.79 | +0.32 / −0.43 / +3.76 / −27.78 | — |
| AppKit large | −54.70 / +42.23 / +4.81 / +56.76 | −54.43 / +51.17 / +4.35 / +57.52 | — |
| AppKit large, reused | −30.12 / −111.86 / +105.99 / +70.03 | +18.26 / −24.38 / +46.36 / +89.41 | +3.78 / −39.51 / +41.87 / +30.72 |

**CfT reused final walk: the added Markdown classification fits the measured delta.** Both heads logged `markdownFetches=219` in every sample. Main calls the attributed-string request directly; the fix sends a [role/subrole batch](https://github.com/SSFSKIM/cua/blob/5f2926134d3340ff27e52c9fb278eb0e6e471d77/native/engine/Sources/Engine/Fetch.swift#L407-L417) immediately before each counted open Markdown fetch. These are the nonempty eligible text values of at most 2,000 UTF-16 units; the grid accounts for 216 of them. The new requests are charged to `attributesMs`, not `markdownMs`. The p50 of the final walk's attribute bucket was **2.32→13.13 ms** (paired blocks **+10.62 / +10.58 / +11.07 / +11.20 ms**); attributed Markdown itself was **24.34→25.53 ms**, and the reused busy walk's attribute bucket was **63.82→61.97 ms**. The artifact counts Markdown fetches and records aggregate phase times; it does not time individual AX batches or isolate exactly how much of the +10.81 ms attribute delta belongs to these preflights.

## Secure-field observations

Each scored lane used three lengths (0, 23, 31), five repetitions per length and head, with seven characters selected when nonempty. The independent AX helper corroborated the field and available selection; a fixture generation marker and increasing native revisions prevented stale snapshots from passing. The kit exercised genuine full requests, transition diffs, and same-lineage repeat replies on matching production render/cache code.

In each completed fix lane, native replies carried `secure:true`, with no value, value description, Markdown, `numberOfCharacters` or selected text. The full text said `Value: secure text`. A changed password did not produce a password update in the transition diff; the repeated output and focus trailer did not disclose value or length. The field stayed visible in the diff's resulting tree. Any test length or selection reported in the independent AX evidence belongs to the **fixture control**, not to the fix's production observation.

| Lane / provider | Main: native, full and repeated/diff | Fix: native, full and repeated/diff |
|---|---|---|
| Chrome for Testing 157.0.8103.78 | 15/15 expected baseline. Explicit count 0/23/31, nonempty full and transition 23/31 bullets, selected-text trailer seven bullets on populated repeats. | 15/15, `secure text`, no count or selection. |
| Default Electron 44.4.5 / Chromium 152.0.7977.130 | 15/15; same count, value masks and seven-bullet selection contrast. | 15/15, `secure text`, no count or selection. |
| MAWS-parity Electron 44.4.5 / Chromium 152.0.7977.130 | 15/15; same count, value masks and seven-bullet selection contrast. | 15/15, `secure text`, no count or selection. |
| Safari 27.2 | 15/15; explicit count 0/23/31 and masks in full, transition and repeated focus text. Independent range was seven; the provider did not expose selected text. | 15/15, `secure text`, no count or selection. |
| Firefox 159.0, original matrix | Setup-invalid, no samples. The loopback page loaded, but initial activation returned `accepted:false` and frontmost PID 358 instead of owned PID 5961. | Setup-invalid, no samples. Neither engine was started. |
| Firefox 160.0, [follow-up](https://github.com/SSFSKIM/cua/actions/runs/44230454220) | 15/15; explicit count 0/23/31 and 23/31 bullets in full and transition. No selected text in repeated output; native focus was `AXWebArea`, not the field. | 15/15; full says `secure text`, no count or selection; transition and repeat leave that field unchanged. |
| AppKit `NSSecureTextField` | 15/15. AppKit exposed 23/31 U+F79A masks in full, transition and repeated focus text, but no explicit count or selected text. Independent range was seven. | 15/15, `secure text`, no count or selection. |

Across the full matrix and the separate Firefox follow-up, each head completed **90/90** seeded rows and the ordinary controls matched in **90/90** pairs. The original Firefox attempt remains setup-invalid. The follow-up kept the direct binary and isolated profile used in the original pw-walk spike, but waited for launch registration, a native window and the page's acknowledgement before activation. Firefox 160/the newer image also differ from the failed setup, so the recovery cannot be attributed solely to the wait. The DOM proved selection, but Firefox's AX selected-range getter returned unsupported (`-25212`) and the native focus was the web area; Firefox proves the walk/render/diff output, not focused-password selection suppression. CfT and both Electron variants provided the positive AX selected-text control.

## Ordinary controls, secret typing and paste

| Lane | Byte-identical ordinary field and textarea (`public-control` / `public-textarea`) | Production `{{secret:…}}` type and follow-up |
|---|---:|---|
| CfT | 15/15 paired | Main and fix 5/5 exact DOM delivery, each reporting `typeUnconfirmed` from keyed secure read-back. Main follow-up showed masked length in native/full/diff; fix native/full/diff showed only the secure marker, with no value/count/selection. Native action metadata and wrapper reply did not disclose the value or length. |
| Default Electron | 15/15 paired | Not run |
| MAWS-parity Electron | 15/15 paired | Not run |
| Safari | 15/15 paired | Not run |
| Firefox, original matrix | Setup-invalid, 0/15 observed | Not planned |
| Firefox, follow-up | 15/15 paired | Not run |
| AppKit | 15/15 paired | Not run |

CfT used the matching production sky wrapper and file-store reader in a temporary `HOME`; a small IPC adapter sent the substituted concealed request to the unmodified engine. A fresh owned-page digest and caret verified delivery, not the native reply. The paste used a separate disposable synthetic string, **not** a secret-store placeholder; the production route intentionally forbids putting a concealed value onto the clipboard.

| CfT paste, one exact replacement per head | Confirmation path | Action reply | Follow-up observation and diff |
|---|---|---|---|
| Main | `notification` | Confirmed; baseline exposed `characters:7` and `range:[0,7]`. No confirming read. | Masked value and length still visible. |
| Fix | `reading` (count match) | Confirmed; baseline and confirming records both exactly `{secure:true}`. No count or range. | `secure text`, no value, length or selection. |

## What this qualifies

The final engine requests the classification and value-bearing attributes in the **same AX batch**; it discards closed values at decode, before they enter native reply, cache, lineage identity or logs. This does not mean the OS provider never returned the value in its AX reply. The CfT job passed **17 `SecureFieldTests`** with a plaintext-returning stub (including secure closure, busy-walk reuse, internal retention, error/stderr, `select_text` refusal and paste) and **63 renderer/diff/cache tests**. The live providers supplied masked controls, not adversarial plaintext. No screenshots were taken, and this did not run the full vendor REPL or a user-owned app/profile.

Under ruling 813, a readable non-text role whose subrole read fails drops the value and renders `value unread`, not `secure text`; this was covered by native and renderer tests. No such node or rendered line was seen in the captured full-matrix or Firefox follow-up observations. The authoritative live pin is **5f292613**. The later PR tip **05ed8800** adds only a renderer predicate and a Node regression assertion so an unlabelled `valueUnread` node is not pruned. It changes no native source and was not rerun live.

## AppKit reused-settle tail follow-up

[Run 44230116365](https://github.com/SSFSKIM/cua/actions/runs/44230116365), kit `bd9279815b5e3f2497852521653f7c28d2bc6637`, same exact product pins and macOS image `20261102.0473.1`. One AppKit job, only the 227-node large reused-settle arm, **40 valid samples per head** across eight alternating five-sample blocks; no invalid samples. This is separate evidence, not pooled with the full run.

| Phase | Main p50 / p95 / max (ms) | Fix p50 / p95 / max (ms) | Fix − main (ms) |
|---|---:|---:|---:|
| Wall | 456.37 / 522.40 / 705.22 | 463.17 / 545.40 / 570.32 | +6.80 / +23.00 / −134.89 |
| Settle total | 381.69 / 448.17 / 550.57 | 374.64 / 465.67 / 478.90 | −7.04 / +17.50 / −71.67 |
| Time to quiet | 307.23 / 365.82 / 401.47 | 297.44 / 387.52 / 414.49 | −9.79 / +21.69 / +13.02 |
| Settle busy walk | 77.49 / 87.12 / 148.83 | 75.75 / 84.07 / 99.65 | −1.75 / −3.05 / −49.17 |
| Busy walk: width | 28.99 / 34.57 / 50.15 | 23.47 / 33.44 / 36.33 | −5.52 / −1.13 / −13.83 |
| Busy walk: attributes | 47.53 / 57.87 / 96.01 | 45.83 / 57.25 / 72.24 | −1.70 / −0.62 / −23.77 |
| Final walk | 63.87 / 87.77 / 138.05 | 75.98 / 105.46 / 118.68 | +12.11 / +17.69 / −19.37 |
| Final walk: attributes | 0.49 / 0.80 / 1.33 | 12.35 / 17.66 / 20.27 | +11.86 / +16.86 / +18.94 |
| Final walk: attributed Markdown | 25.43 / 33.90 / 65.20 | 25.69 / 35.13 / 40.48 | +0.26 / +1.23 / −24.72 |

| Phase | Paired block median Δ in order, ms (1–8) |
|---|---:|
| Wall | −16.93 / +40.58 / +13.56 / −52.00 / −34.25 / +12.75 / +64.35 / −1.91 |
| Settle busy walk | −0.53 / +0.44 / +2.71 / +2.18 / −9.38 / −16.53 / +0.07 / −1.98 |
| Final walk | +3.37 / +3.44 / +13.00 / +14.50 / +3.16 / +15.50 / +29.06 / +28.17 |
| Final walk: attributes | +10.58 / +10.49 / +12.01 / +10.77 / +9.51 / +12.46 / +14.89 / +14.82 |

**The large busy-walk tail was run noise, not a reproduced regression.** The original fix maximum spent 904.35 ms in the busy walk, 812.55 ms in the width phase; its p95 wall sample instead spent 278.39 ms in busy attribute reads. Neither repeated. Both heads ran exactly one busy walk with zero notifications, one wide list, 224 frame reads and no fetch failures per sample. The busy walk uses the existing per-element AX batch, with the same attributes and cache reuse; `readVisibleChildren` and the frame batch (`AXPosition`, `AXSize`, `AXRole`) are unchanged. No extra AX request was identified in those busy-walk paths. Width timing is aggregate and cannot identify an individual slow frame request from the original run.

**The smaller final-walk cost is repeatable.** Both heads fetched 218 Markdown values per sample. The fix adds the role/subrole batch before each of those parameterized reads; main does not. The attribute bucket rose in all eight blocks, while the attributed read bucket itself barely moved at p50. This accounts for the phase where the measurable overhead sits; the exact preflight-only duration cannot be separated from the rest of `attributesMs`. The residual +23 ms wall p95 is not zero, but it is much smaller than +255 ms and mixes that final-walk cost with a variable settle wait. Wall block medians split four slower and four faster, so this is not evidence of a comparable native busy-walk tail.

## Runs and environment

| Run | Kit | Result / scope |
|---|---|---|
| [Full matrix 44228841099](https://github.com/SSFSKIM/cua/actions/runs/44228841099) | `65c00994` | Five green jobs; Firefox setup-invalid before any engine RPC. Authoritative platform and latency comparison. |
| [AppKit tail 44230116365](https://github.com/SSFSKIM/cua/actions/runs/44230116365) | `bd927981` | Green, AppKit large reused settle only, 40 valid observations per head, same product pins. |
| [Firefox follow-up 44230454220](https://github.com/SSFSKIM/cua/actions/runs/44230454220) | `9f486ae6` | Green, Firefox 160.0 only, 15/15 seeded rows per head and control pairs, same product pins; waited for readiness before activation. |
| [Earlier smoke 44224481847](https://github.com/SSFSKIM/cua/actions/runs/44224481847) | `1641a24b` | CfT and AppKit green, 3/3 seeded and control rows each, 10 native / 62 Node tests. Used `6a1c7658`'s superseded split-batch fix, not the final design. |

All full jobs ran on GitHub-hosted macOS 26.7.2. CfT, parity Electron and Safari used image `20261112.0504.1`; default Electron, AppKit and original Firefox used `20261102.0473.1`. Artifacts `probe-405-<lane>-<mode>` contain the redacted native evidence, independent AX controls, production text, action diagnostics and raw timing rows. No real passwords, owner profiles, tokens or keys were read. The smoke used two timing samples per head; e.g. CfT large regular p50 wall 278.58→435.62 ms, walk 254.54→408.79 ms; reused p50 wall 590.60→659.13 ms, walk 150.44→229.73 ms. Different pins and jobs: do not pool with final samples or use cross-run absolute time as the treatment effect.
