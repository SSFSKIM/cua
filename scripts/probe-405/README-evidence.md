# #405 hosted macOS qualification

The initial hosted smoke passed on Chrome for Testing and an AppKit `NSSecureTextField`. The six-lane qualification is held for a reviewed final engine pin; the smoke is not the full matrix.

## Runs and pins

| Run | Kit | Main | Fix | Coverage |
|---|---|---|---|---|
| [Smoke 44224481847](https://github.com/SSFSKIM/cua/actions/runs/44224481847) | `1641a24b51f450329a280af9de780ef606fa0de4` | `11f1ff68135a72b345880aea1e19a01b3e366996` | `6a1c7658e4d48d7bcaa6ce25aba760b712148687` | CfT and AppKit; both jobs green |

Run artifacts are named `probe-405-<lane>-<mode>`. They contain redacted native replies, production full and diff text, the independent AX provider comparison, timing samples, and the scored and invalid rows. Both engines were unmodified release builds; their matching production Node modules supplied render, cache/diff, and secret substitution. Both smoke jobs used GitHub-hosted macOS `26.7.2`, image `20261112.0504.1`.

## Smoke: observation and ordinary controls

The synthetic fixture used lengths 0, 23 and 31, selecting seven characters when nonempty. Each row checked a native reply, a same-lineage repeat, a genuine full request, and the matching production text. The populated cases also exercised the diff from a preceding length. The fix left the field in the diff's tree when its password changed; the fixture's independent freshness marker could change without a password update line.

| Lane | Main native, full and diff | Fix native, full and diff | Ordinary text field and textarea |
|---|---|---|---|
| CfT `157.0.8103.78` | 3/3. Nonempty full and transition display 23/31 bullets; `numberOfCharacters` 0/23/31; selected-text trailer contains seven bullets on populated full, transition and repeat. | 3/3. `secure:true`, no value/Markdown/count/selected text; full and the focused-field trailer say `Value: secure text`; no password update on length changes. | 3/3 paired rows byte-identical, `public-control` and `public-textarea` retained. |
| AppKit `NSSecureTextField` | 3/3. Nonempty full and transition display 23/31 U+F79A mask characters, still visible in the repeated focus trailer; no explicit native count or selected text from this provider. Independently selected range was seven. | 3/3. `secure:true`, no value/Markdown/count/selected text; full and focused-field trailer say `Value: secure text`; no password update on length changes. | 3/3 paired rows byte-identical; both public values retained. |

## Smoke: CfT secret typing and paste

| Action | Main | Fix |
|---|---|---|
| `type_text` with a synthetic `{{secret:…}}` label | 1/1 exact DOM delivery. Native returned `typeUnconfirmed`; follow-up native/full/diff exposed the provider's 23 bullets and native count. | 1/1 exact DOM delivery with the same intentional `typeUnconfirmed`. Native/full/diff exposed neither value nor length; rendered field says `secure text`. |
| `paste` of a disposable synthetic string | 1/1 exact replacement of a fully selected synthetic password; confirmed, with count and range in the baseline and confirming reads. Follow-up exposed masked length. | 1/1 exact replacement; confirmed by notification, with baseline reduced to `{secure:true}` and no confirming-read record. Follow-up native/full/diff exposed neither value nor length. |

The type cell used the production sky wrapper and file-store reader with a fresh temporary `HOME`, then a thin IPC adapter to the native engine. Exact delivery was verified from the owned page, not inferred from the action response. The paste cell intentionally did **not** use a secret-store placeholder: the production wrapper never allows a concealed value onto the clipboard. No real secrets, profiles, tokens or keys were read.

## Smoke: latency (not the 20-sample qualification)

Triples are nearest-rank p50 / p95 / max in milliseconds, **two warm observations per arm and head**. With two samples p50 is the lower observation and p95 is the maximum. Wall time is the native `get_app_state` RPC from the Node harness, with screenshots disabled; it excludes rendering and independent fixture checks. `walkMs` is the engine's final tree walk. The reused-settle arm explicitly requested settle and kept only replies that recorded `settleTreeReused:true`; busy-walk timings are separate and wall time also includes the settle wait.

| Lane / tree (emitted nodes) | Metric | Main | Fix | Fix − main |
|---|---|---:|---:|---:|
| CfT small (69) | Wall | 53.19 / 65.73 / 65.73 | 76.55 / 87.61 / 87.61 | +23.36 / +21.87 / +21.87 |
| | Walk | 43.61 / 52.15 / 52.15 | 65.05 / 72.89 / 72.89 | +21.44 / +20.74 / +20.74 |
| CfT large (286) | Wall | 278.58 / 363.60 / 363.60 | 435.62 / 458.77 / 458.77 | +157.05 / +95.17 / +95.17 |
| | Walk | 254.54 / 341.38 / 341.38 | 408.79 / 437.93 / 437.93 | +154.25 / +96.55 / +96.55 |
| CfT large, reused settle (286) | Wall | 590.60 / 649.61 / 649.61 | 659.13 / 705.18 / 705.18 | +68.53 / +55.57 / +55.57 |
| | Walk | 150.44 / 205.45 / 205.45 | 229.73 / 296.71 / 296.71 | +79.29 / +91.25 / +91.25 |
| | Settle busy walk | 92.21 / 98.55 / 98.55 | 80.23 / 121.74 / 121.74 | −11.98 / +23.19 / +23.19 |
| AppKit small (11) | Wall | 9.56 / 10.07 / 10.07 | 9.66 / 10.18 / 10.18 | +0.10 / +0.12 / +0.12 |
| | Walk | 6.26 / 6.78 / 6.78 | 6.54 / 6.63 / 6.63 | +0.28 / −0.15 / −0.15 |
| AppKit large (227) | Wall | 122.53 / 125.58 / 125.58 | 146.90 / 149.71 / 149.71 | +24.37 / +24.14 / +24.14 |
| | Walk | 114.26 / 114.85 / 114.85 | 139.28 / 141.78 / 141.78 | +25.02 / +26.94 / +26.94 |
| AppKit large, reused settle (227) | Wall | 521.49 / 611.02 / 611.02 | 600.60 / 678.54 / 678.54 | +79.11 / +67.52 / +67.52 |
| | Walk | 51.70 / 61.55 / 61.55 | 97.96 / 108.11 / 108.11 | +46.26 / +46.57 / +46.57 |
| | Settle busy walk | 70.43 / 99.69 / 99.69 | 80.47 / 105.10 / 105.10 | +10.04 / +5.41 / +5.41 |

Both large trees added exactly **216 visible editable fields**. This is a dense editor stress case, not a representative page. A mixed-content or settings page with a few hundred AX nodes and a handful of editable fields would make a useful intermediate benchmark; we did not measure it. Guarded attribute batches also run on non-editable nodes, so the overhead cannot be extrapolated from editable-field count alone.

The smoke also passed 10 native `SecureFieldTests` (including a provider stub that returns plaintext, settle, focus, re-resolution, `select_text`, and paste coverage) and 62 production renderer/diff/cache tests. Live providers mask the value independently; the live test demonstrates what reaches IPC/render/diff. The stub is the check for what is requested and for a provider that returns plaintext. No screenshot, owner GUI, Mac mini, or full vendor REPL was involved.
