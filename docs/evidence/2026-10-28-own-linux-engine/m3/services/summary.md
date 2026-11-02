# Two services, one engine: every step passes

Engine: `cua-engine 0.3.0 (9381f166e106)` (/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine/target/release/cua-engine); checkout 88167c0d80e75e1e1c0090537dd8f07053f26767; scenes gedit, chrome, over-budget; 2026-10-31T11:28:23.843Z.

A step passes when the two lanes are equal and each gives the step's expected outcome: the ordinary steps succeed with their window, state, tree or screenshot present; `unknown-id` and `unknown-action` fail with the sentence they exist to reach.

| scene | step | verdict | vendor service vs cua service | expected outcome | nodes / rendered lines (cua) | both lanes' error |
|---|---|---|---|---|---|---|
| - | setup | pass | equal | yes |  |  |
| gedit | window | pass | equal | yes |  |  |
| gedit | state | pass | equal | yes | 402 |  |
| gedit | tree | pass | equal | yes | 498 |  |
| gedit | query | pass | equal | yes |  |  |
| gedit | state-after-query | pass | equal | yes | 402 |  |
| gedit | screenshot | pass | equal | yes |  |  |
| gedit | unknown-id | pass | equal | yes |  | Unknown element ID 999999 for this window; refresh get_window_state() |
| gedit | unknown-action | pass | equal | yes |  | AT-SPI action "cua171-no-such-action" is unavailable; available actions: ["click"] |
| chrome | window | pass | equal | yes |  |  |
| chrome | state | pass | equal | yes | 82 |  |
| chrome | tree | pass | equal | yes | 243 |  |
| chrome | query | pass | equal | yes |  |  |
| chrome | state-after-query | pass | equal | yes | 82 |  |
| chrome | screenshot | pass | equal | yes |  |  |
| chrome | unknown-id | pass | equal | yes |  | Unknown element ID 999999 for this window; refresh get_window_state() |
| chrome | unknown-action | pass | equal | yes |  | AT-SPI action "cua171-no-such-action" is unavailable; available actions: ["doDefault", "showContextMenu"] |
| over-budget | window | pass | equal | yes |  |  |
| over-budget | state | pass | equal | yes | 4907 |  |
| over-budget | tree | pass | equal | yes | 5000 |  |
| over-budget | query | pass | equal | yes |  |  |
| over-budget | state-after-query | pass | equal | yes | 4907 |  |
| over-budget | screenshot | pass | equal | yes |  |  |
| over-budget | unknown-id | pass | equal | yes |  | Unknown element ID 999999 for this window; refresh get_window_state() |
| over-budget | unknown-action | pass | equal | yes |  | AT-SPI action "cua171-no-such-action" is unavailable; available actions: ["doDefault", "showContextMenu"] |
