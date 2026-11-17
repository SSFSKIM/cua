# Two services, one engine: every step passes

Engine: `cua-engine 0.4.0 (514f5c62dd6c)` (/tmp/cua171-candidate-VUjuqS/cua-engine); checkout 514f5c62dd6c74b1ed24c48f112ca9c35a70eece; scenes over-budget; 2026-11-13T12:40:51.645Z.

A step passes when the two lanes are equal and each gives the step's expected outcome: the ordinary steps succeed with their window, state, tree or screenshot present; `unknown-id` and `unknown-action` fail with the sentence they exist to reach. The truncation line is set aside before the lanes are compared and judged in each lane: its count is the `truncated` that lane's service returned for the read, and every read the cua lane's steps make, the query's included, carries `truncated` as the page is known to hold it: the over-budget page counts both limits' cuts, and the other pages read well below both limits with no field (deviations.mjs `fixtureTruncationMismatch`; this path has no `--stats` record, against which the wire run judges the field exactly).

| scene | step | verdict | vendor service vs cua service | expected outcome | nodes / rendered lines (cua) | truncated, line count (cua) | both lanes' error |
|---|---|---|---|---|---|---|---|
| - | setup | pass | equal | yes |  |  |  |
| over-budget | window | pass | equal | yes |  |  |  |
| over-budget | state | pass | equal | yes | 4908 | {"depth":2,"failed":0,"nodes":1263}, line 1265 |  |
| over-budget | tree | pass | equal | yes | 5000 | {"depth":2,"failed":0,"nodes":1263} |  |
| over-budget | query | pass | equal | yes |  | {"depth":2,"failed":0,"nodes":1263} |  |
| over-budget | state-after-query | pass | equal | yes | 4908 | {"depth":2,"failed":0,"nodes":1263}, line 1265 |  |
| over-budget | screenshot | pass | equal | yes |  | {"depth":2,"failed":0,"nodes":1263}, line 1265 |  |
| over-budget | unknown-id | pass | equal | yes |  |  | Unknown element ID 999999 for this window; refresh get_window_state() |
| over-budget | unknown-action | pass | equal | yes |  |  | AT-SPI action "cua171-no-such-action" is unavailable; available actions: ["doDefault", "showContextMenu"] |
| - | harness-windows | pass | equal | yes |  |  |  |
