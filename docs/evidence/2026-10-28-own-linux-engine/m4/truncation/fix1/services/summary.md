# Two services, one engine: every step passes

Engine: `cua-engine 0.3.0 (e112f4f37f6b)` (/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine); checkout d4a8ba7ec5b2c1e979214677369e0e2de5775f36; scenes gedit, chrome, over-budget; 2026-11-02T04:35:07.266Z.

A step passes when the two lanes are equal and each gives the step's expected outcome: the ordinary steps succeed with their window, state, tree or screenshot present; `unknown-id` and `unknown-action` fail with the sentence they exist to reach. The truncation line is set aside before the lanes are compared and judged in each lane: its count is the `truncated` that lane's service returned for the read, and every read the cua lane's steps make, the query's included, carries `truncated` exactly when it was cut (deviations.mjs; the over-budget page is built with both limits' cuts).

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
| over-budget | state | pass | equal | yes | 4908 | {"depth":2,"failed":0,"nodes":1263}, line 1265 |  |
| over-budget | tree | pass | equal | yes | 5000 | {"depth":2,"failed":0,"nodes":1263} |  |
| over-budget | query | pass | equal | yes |  | {"depth":2,"failed":0,"nodes":1263} |  |
| over-budget | state-after-query | pass | equal | yes | 4908 | {"depth":2,"failed":0,"nodes":1263}, line 1265 |  |
| over-budget | screenshot | pass | equal | yes |  | {"depth":2,"failed":0,"nodes":1263}, line 1265 |  |
| over-budget | unknown-id | pass | equal | yes |  |  | Unknown element ID 999999 for this window; refresh get_window_state() |
| over-budget | unknown-action | pass | equal | yes |  |  | AT-SPI action "cua171-no-such-action" is unavailable; available actions: ["doDefault", "showContextMenu"] |
