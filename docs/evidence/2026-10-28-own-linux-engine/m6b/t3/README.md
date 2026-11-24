# #171 M6b T3 (task 168): the harnesses' development runs on x64

Development runs, not counted (`LABEL=pilot`, `gate.mjs --dev`), on dc-linux171-1e68 at a6752e74d (branch `m6b-t3`,
clean; the fallback part and E1's traced run at c0ea33bab, which differs from it only in the command a gate step's
record prints, `git diff c0ea33bab a6752e74d` touching `gate.mjs` `launchCommand` and its test), each
under `locked.sh t168 timeout -s TERM -k 60 45m`, on private displays (`:1`), never `:0`. Every home was
the run's own: a source home made by this checkout's `cua install` in a fresh `HOME` and `CUA_HOME`, which made no
`runtimes/` (`fixture/bindings.txt`). Acceptance 13's counted runs are T8's.

| Run | What | Result |
|---|---|---|
| R1 (`r1/`) | `suites.sh parity`: repl-parity's native suite on the cua lane alone, `PARITY_HOME` the source home, by its own verdict (`parity-verdict.mjs`) | **PASS.** The lane exited 0, complete, 34 cases, 34 covered, assertions PASS, both text cases positive, no vendor defect. Every native case's engine was its scratch home's installed `cua-engine` under the trusted worker behind cua's service (20 cases, `verdict.json`). The prepared home passed the pinned rule. The run records no `vendorRelease`. Cleanup exit 0 |
| fallback (`fallback/`) | `suites.sh fallback`, `SELECTION=default`: the five homes | **PASS, 5 of 5:** none `engine_not_installed`; previous, released and older `engine_outdated`; unrecorded `engine_unrecorded`. Each refused by doctor and by an open, with 1212's one remedy (`: run \`node <checkout>/bin/cua.mjs install --engine\``) and nothing else offered, under the judges T3 tightened |
| E1 on the fixture (`fixture/plain/E1`) | `gate.mjs run E1 --dev --vendor-fixture ~/.local/share/cua-171/vendor-x64-pinned --newest <26.1023's sky_linux_x64>`, `HOME` and `CUA_HOME` the source home | **exit 0, complete.** The step's record names the fixture it checked (tar `2e620986…5914`) and the pinned build `sky_linux_x64` `7ac3c2ae…f1cd` inside it; the only vendor binaries in the step's record are that file and the newest build (`88ce5e0a…2991`, `fixture/bindings.txt`). cua's engine is the pinned 0.4.5 (`ef714179…119a`, the pin's x64 hash) |
| FB on the fixture (`fixture/plain/FB`) | `gate.mjs run FB --dev --vendor-fixture …`, the same homes | **exit 0: 10 of 10 steps pass**, both services equal on every step, the truncation line judged in each lane on the over-budget scene. `--vendor-js` is the fixture's `@oai/sky`, its `service.js` the list's hash (`5b2fa2f0…5993`, step.json `vendor_fixture`); `--engine` the pinned cua-engine on both sides |
| The file traces (`fixture/traced/`) | each step again under `strace -f -e trace=%file` | **No traced call names a path under any `runtimes/`**: E1 0 of 160,496 lines, FB 0 of 104,726. E1's traced run used a plain `strace -f`; its speed verdict failed under the tracer's load (desktop drag), which the pre-flight reports and does not judge here (§5.2), and its plain run above passed. FB's first traced run under the same plain tracer stopped at "no stable AT-SPI tree", so it ran again with `--seccomp-bpf` and passed; that is the FB trace kept |

The default home on this VM still holds its vendor tree (1216); the traces are what show the steps never read it.
