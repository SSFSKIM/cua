# #171 M6b T3 (task 168): the harnesses' development runs on x64

Development runs, not counted (`LABEL=pilot`, `gate.mjs --dev`), on dc-linux171-1e68, each under
`locked.sh t168 timeout -s TERM -k 60 45m`, on private displays (`:1`), never `:0`. Every home was the run's own: a
source home made by this checkout's `cua install` in a fresh `HOME` and `CUA_HOME`, which made no `runtimes/`
(`fixture/bindings.txt`). Acceptance 13's counted runs are T8's.

Heads: R1 and the fallback part at 9c6c2f361 (fix wave 1's head; the fallback part's tree held only the two untracked
`process-paths.txt` files below, hence its `dirty=yes`), E1 and FB at a6752e74d, E1's traced run at c0ea33bab. Fix wave 1
changed neither the harness E1 and FB run nor the fixture module's check of a good fixture: it added the `:0` launch
path's check, refused linked cache roots and snapshotted the pin tool's tar.

| Run | What | Result |
|---|---|---|
| R1 (`r1/`) | `suites.sh parity`: repl-parity's native suite on the cua lane alone, `PARITY_HOME` the source home, by its own verdict (`parity-verdict.mjs`) | **PASS.** The lane exited 0, complete, 34 cases, 34 covered, assertions PASS, both text cases positive, no vendor defect. Each of the 20 native cases names its own connection (`connection-16` to `-35`), and its engine is the installed `cua-engine` of the home that connection's recorded provenance attests answered it, under the trusted worker behind cua's service (`verdict.json`). The prepared home passed the pinned rule. The run records no `vendorRelease`. Cleanup exit 0 |
| fallback (`fallback/`) | `suites.sh fallback`, `SELECTION=default`: the five homes | **PASS, 5 of 5:** none `engine_not_installed`; previous, released and older `engine_outdated`; unrecorded `engine_unrecorded`. Each refused by doctor and by an open, each read whole: the default engine's refusal for the home's reason, ending with 1212's one remedy (`: run \`node <checkout>/bin/cua.mjs install --engine\``), then the hint and nothing else |
| E1 on the fixture (`fixture/plain/E1`) | `gate.mjs run E1 --dev --vendor-fixture ~/.local/share/cua-171/vendor-x64-pinned --newest <26.1023's sky_linux_x64>`, `HOME` and `CUA_HOME` the source home | **exit 0, complete.** The step's record names the fixture it checked (tar `2e620986…5914`) and the pinned build `sky_linux_x64` `7ac3c2ae…f1cd` inside it; cua's engine is the pinned 0.4.5 (`ef714179…119a`, the pin's x64 hash), the newest build `88ce5e0a…2991` (`fixture/bindings.txt`) |
| FB on the fixture (`fixture/plain/FB`) | `gate.mjs run FB --dev --vendor-fixture …`, the same homes | **exit 0: 10 of 10 steps pass**, both services equal on every step, the truncation line judged in each lane on the over-budget scene. `--vendor-js` is the fixture's `@oai/sky`, its `service.js` the list's hash (`5b2fa2f0…5993`, step.json `vendor_fixture`); `--engine` the pinned cua-engine on both sides |
| The file traces (`fixture/traced/`) | each step again under `strace -f -e trace=%file` | **No traced call names a path under any `runtimes/`**: E1 0 of 160,496 lines, FB 0 of 104,726. E1's traced run used a plain `strace -f`; its speed verdict failed under the tracer's load (desktop drag), which the pre-flight reports and does not judge here (§5.2), and its plain run above passed. FB's first traced run under the same plain tracer stopped at "no stable AT-SPI tree", so it ran again with `--seccomp-bpf` and passed; that is the FB trace kept |
| The process-path witness (`fixture/traced/*/process-paths.txt`) | from each trace: every successful `execve` of an engine binary and every open of the vendor client's `service.js`, by path, with counts | **E1:** 511 execs of the fixture's `sky_linux_x64`, 511 of the newest build's, 512 of the source home's `cua-engine`, nothing else; one open of the fixture's `service.js`. **FB:** 5 execs of the source home's `cua-engine` and no vendor binary (both services drive cua's engine, by design); 2 opens of the fixture's `service.js` |

The default home on this VM still holds its vendor tree (1216); the traces are what show the steps never read it.
