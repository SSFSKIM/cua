# Two services, one engine: every step equal

Engine: `cua-engine 0.3.0 (9381f166e106)` (/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine/target/release/cua-engine); checkout dd2255b49e53aa0d8a9fc5bc14642917f1c96d4a; scenes gedit, chrome, over-budget; 2026-10-31T10:54:13.231Z.

| scene | step | vendor service vs cua service | nodes / rendered lines (cua) | both lanes' error |
|---|---|---|---|---|
| - | setup | equal |  |  |
| gedit | window | equal |  |  |
| gedit | state | equal | 402 |  |
| gedit | tree | equal | 498 |  |
| gedit | query | equal |  |  |
| gedit | state-after-query | equal | 402 |  |
| gedit | screenshot | equal |  |  |
| gedit | unknown-id | equal |  | Unknown element ID 999999 for this window; refresh get_window_state() |
| gedit | unknown-action | equal |  | AT-SPI action "cua171-no-such-action" is unavailable; available actions: ["click"] |
| chrome | window | equal |  |  |
| chrome | state | equal | 82 |  |
| chrome | tree | equal | 243 |  |
| chrome | query | equal |  |  |
| chrome | state-after-query | equal | 82 |  |
| chrome | screenshot | equal |  |  |
| chrome | unknown-id | equal |  | Unknown element ID 999999 for this window; refresh get_window_state() |
| chrome | unknown-action | equal |  | AT-SPI action "cua171-no-such-action" is unavailable; available actions: ["doDefault", "showContextMenu"] |
| over-budget | window | equal |  |  |
| over-budget | state | equal | 4907 |  |
| over-budget | tree | equal | 5000 |  |
| over-budget | query | equal |  |  |
| over-budget | state-after-query | equal | 4907 |  |
| over-budget | screenshot | equal |  |  |
| over-budget | unknown-id | equal |  | Unknown element ID 999999 for this window; refresh get_window_state() |
| over-budget | unknown-action | equal |  | AT-SPI action "cua171-no-such-action" is unavailable; available actions: ["doDefault", "showContextMenu"] |
