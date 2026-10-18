# Native baseline comparison, same host (before and after)

| | Baseline | Candidate |
|---|---|---|
| REPL host | cua | cua |
| initialize answered by | cua-repl-host 0.5.0 | cua-repl-host 0.5.0 |
| Commit | 90cbfe0bd6f21cbde9b656392ee1f2b8dccbc754 | 8782604260f3e3dd90a507ea15ecaf887a8c88ab |
| device | mini | mini |
| release | 26.928.40906-darwin-arm64 | 26.928.40906-darwin-arm64 |
| hardware | Mac14,12, Apple M2 Pro, 16 GiB | Mac14,12, Apple M2 Pro, 16 GiB |
| os | macOS 27.0 (26A428) | macOS 27.0 (26A428) |
| display | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) | 2560 x 1440 points at scale 2 (5120 x 2880 pixels) |
| service | browser surface, no service call | browser surface, no service call |
| sandbox | scoped (platform default) | scoped (platform default) |
| plan | 5 cold, 30 warm, 10 tasks | 5 cold, 30 warm, 10 tasks |
| Runs | run-1, run-2, run-3 | run-1, run-2, run-3 |
| ssh.roundtrip median | 593.4 | 400.3 |

Rule (#115 acceptance 11): one host, three complete, attested runs a side covering the same plan, on the same machine and configuration except the permitted differences below; the judged rows are cold.miss.first_js and cold.hit.first_js: the candidate's median must be at most the baseline's plus max(10%, 500 ms), or faster, and it must succeed in no smaller share of its valid samples. Every other row is reported, not judged. Milliseconds; "OK" is successes over valid samples; wall and in-cell columns are median / p95 / max of successful samples.

| Operation | Basis | Baseline OK | Candidate OK | Baseline judged | Candidate judged | Limit | Verdict | Baseline wall | Candidate wall | Baseline in-cell | Candidate in-cell |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ssh.roundtrip | – | 15/15 | 15/15 | 593.4 | 400.3 | – | not judged | 593.4 / 766.7 / 766.7 | 400.3 / 448.1 / 448.1 | – | – |
| cold.miss.initialize | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 198.6 | 280.2 | – | not judged | 792.0 / 864.1 / 864.1 | 680.5 / 725.8 / 725.8 | – | – |
| cold.miss.tools_list | wall median | 6/6 | 6/6 | 21.6 | 38.3 | – | not judged | 21.6 / 121.8 / 121.8 | 38.3 / 72.5 / 72.5 | – | – |
| cold.miss.first_js | wall median | 6/6 | 6/6 | 1160.5 | 229.6 | 1660.5 | pass | 1160.5 / 2165.4 / 2165.4 | 229.6 / 336.5 / 336.5 | 0.00 / 0.01 / 0.01 | 0.00 / 0.00 / 0.00 |
| cold.miss.total | wall median net of ssh.roundtrip median | 6/6 | 6/6 | 1409.0 | 571.0 | – | not judged | 2002.4 / 3034.0 / 3034.0 | 971.3 / 1050.4 / 1050.4 | – | – |
| cold.hit.initialize | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 31.8 | 159.8 | – | not judged | 625.1 / 748.0 / 748.0 | 560.0 / 679.7 / 679.7 | – | – |
| cold.hit.tools_list | wall median | 9/9 | 9/9 | 29.6 | 13.4 | – | not judged | 29.6 / 128.1 / 128.1 | 13.4 / 184.1 / 184.1 | – | – |
| cold.hit.first_js | wall median | 9/9 | 9/9 | 316.6 | 301.0 | 816.6 | pass | 316.6 / 428.1 / 428.1 | 301.0 / 320.7 / 320.7 | 0.00 / 0.01 / 0.01 | 0.00 / 0.01 / 0.01 |
| cold.hit.total | wall median net of ssh.roundtrip median | 9/9 | 9/9 | 427.1 | 480.2 | – | not judged | 1020.5 / 1092.9 / 1092.9 | 880.4 / 1184.5 / 1184.5 | – | – |

## Permitted configuration differences

- sandbox launcher: codex-cli -> cua (cua's own launcher replaces the Codex CLI (#115))
- TMPDIR: inherited -> session (each session gets its own TMPDIR (#115))

## Failures and notes

None.

## Problems

None: both sides are complete, attested and comparable.

Verdict: **PASS**
