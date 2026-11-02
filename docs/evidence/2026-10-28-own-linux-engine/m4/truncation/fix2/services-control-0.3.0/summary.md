# Two services, one engine: FAILURES

Engine: `cua-engine 0.3.0 (cd4c929758ca)` (/Users/new/.local/share/cua/engine/linux/cua-engine); checkout cf6d82f0bf753614a7710eb60666373a8f1f11dc; scenes gedit, chrome, over-budget; 2026-11-02T07:26:38.607Z.

A step passes when the two lanes are equal and each gives the step's expected outcome: the ordinary steps succeed with their window, state, tree or screenshot present; `unknown-id` and `unknown-action` fail with the sentence they exist to reach. The truncation line is set aside before the lanes are compared and judged in each lane: its count is the `truncated` that lane's service returned for the read, and every read the cua lane's steps make, the query's included, carries `truncated` as the page is known to hold it: the over-budget page counts both limits' cuts, and the other pages read well below both limits with no field (deviations.mjs `fixtureTruncationMismatch`; this path has no `--stats` record, against which the wire run judges the field exactly).

| scene | step | verdict | vendor service vs cua service | expected outcome | nodes / rendered lines (cua) | truncated, line count (cua) | both lanes' error |
|---|---|---|---|---|---|---|---|
| - | setup | pass | equal | yes |  |  |  |
| gedit | window | pass | equal | yes |  |  |  |
| gedit | state | pass | equal | yes | 402 |  |  |
| gedit | tree | pass | equal | yes | 498 |  |  |
| gedit | query | pass | equal | yes |  |  |  |
| gedit | state-after-query | pass | equal | yes | 402 |  |  |
| gedit | screenshot | pass | equal | yes |  |  |  |
| gedit | unknown-id | pass | equal | yes |  |  | Unknown element ID 999999 for this window; refresh get_window_state() |
| gedit | unknown-action | pass | equal | yes |  |  | AT-SPI action "cua171-no-such-action" is unavailable; available actions: ["click"] |
| chrome | window | pass | equal | yes |  |  |  |
| chrome | state | pass | equal | yes | 82 |  |  |
| chrome | tree | pass | equal | yes | 243 |  |  |
| chrome | query | pass | equal | yes |  |  |  |
| chrome | state-after-query | pass | equal | yes | 82 |  |  |
| chrome | screenshot | pass | equal | yes |  |  |  |
| chrome | unknown-id | pass | equal | yes |  |  | Unknown element ID 999999 for this window; refresh get_window_state() |
| chrome | unknown-action | pass | equal | yes |  |  | AT-SPI action "cua171-no-such-action" is unavailable; available actions: ["doDefault", "showContextMenu"] |
| over-budget | window | pass | equal | yes |  |  |  |
| over-budget | state | **FAIL** | equal | **no** (vendor true, cua false) | 4907 |  |  |
| over-budget | tree | **FAIL** | equal | **no** (vendor true, cua false) | 5000 |  |  |
| over-budget | query | **FAIL** | equal | **no** (vendor true, cua false) |  |  |  |
| over-budget | state-after-query | **FAIL** | equal | **no** (vendor true, cua false) | 4907 |  |  |
| over-budget | screenshot | **FAIL** | equal | **no** (vendor true, cua false) |  |  |  |
| over-budget | unknown-id | pass | equal | yes |  |  | Unknown element ID 999999 for this window; refresh get_window_state() |
| over-budget | unknown-action | pass | equal | yes |  |  | AT-SPI action "cua171-no-such-action" is unavailable; available actions: ["doDefault", "showContextMenu"] |
