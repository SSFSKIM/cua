# Two services, one engine: every step passes

Engine: `cua-engine 0.4.0 (8ab1cc758983)` (/Users/new/.local/share/cua-171/task74/w5/engine/8ab1cc758983/cua-engine); checkout 8ab1cc758983e7774cbff74a1cc2fd2d745120bb; scenes gedit, chrome, over-budget; 2026-11-13T06:23:34.752Z.

A step passes when the two lanes are equal and each gives the step's expected outcome: the ordinary steps succeed with their window, state, tree or screenshot present; `unknown-id` and `unknown-action` fail with the sentence they exist to reach. The truncation line is set aside before the lanes are compared and judged in each lane: its count is the `truncated` that lane's service returned for the read, and every read the cua lane's steps make, the query's included, carries `truncated` as the page is known to hold it: the over-budget page counts both limits' cuts, and the other pages read well below both limits with no field (deviations.mjs `fixtureTruncationMismatch`; this path has no `--stats` record, against which the wire run judges the field exactly).

| scene | step | verdict | vendor service vs cua service | expected outcome | nodes / rendered lines (cua) | truncated, line count (cua) | both lanes' error |
|---|---|---|---|---|---|---|---|
| - | setup | pass | equal | yes |  |  |  |
| gedit | window | pass | equal | yes |  |  |  |
| gedit | state | pass | equal | yes | 384 |  |  |
| gedit | tree | pass | equal | yes | 480 |  |  |
| gedit | query | pass | equal | yes |  |  |  |
| gedit | state-after-query | pass | equal | yes | 384 |  |  |
| gedit | screenshot | pass | equal | yes |  |  |  |
| gedit | unknown-id | pass | equal | yes |  |  | Unknown element ID 999999 for this window; refresh get_window_state() |
| gedit | unknown-action | pass | equal | yes |  |  | AT-SPI action "cua171-no-such-action" is unavailable; available actions: ["click"] |
| chrome | window | pass | equal | yes |  |  |  |
| chrome | state | pass | equal | yes | 81 |  |  |
| chrome | tree | pass | equal | yes | 242 |  |  |
| chrome | query | pass | equal | yes |  |  |  |
| chrome | state-after-query | pass | equal | yes | 81 |  |  |
| chrome | screenshot | pass | equal | yes |  |  |  |
| chrome | unknown-id | pass | equal | yes |  |  | Unknown element ID 999999 for this window; refresh get_window_state() |
| chrome | unknown-action | pass | equal | yes |  |  | AT-SPI action "cua171-no-such-action" is unavailable; available actions: ["doDefault", "showContextMenu"] |
| over-budget | window | pass | equal | yes |  |  |  |
| over-budget | state | pass | equal | yes | 4908 | {"depth":2,"failed":0,"nodes":1263}, line 1265 |  |
| over-budget | tree | pass | equal | yes | 5000 | {"depth":2,"failed":0,"nodes":1263} |  |
| over-budget | query | pass | equal | yes |  | {"depth":2,"failed":0,"nodes":1263} |  |
| over-budget | state-after-query | pass | equal | yes | 4908 | {"depth":2,"failed":0,"nodes":1263}, line 1265 |  |
| over-budget | screenshot | pass | equal | yes |  | {"depth":2,"failed":0,"nodes":1263}, line 1265 |  |
| over-budget | unknown-id | pass | equal | yes |  |  | Unknown element ID 999999 for this window; refresh get_window_state() |
| over-budget | unknown-action | pass | equal | yes |  |  | AT-SPI action "cua171-no-such-action" is unavailable; available actions: ["doDefault", "showContextMenu"] |
| - | harness-windows | pass | equal | yes |  |  |  |
