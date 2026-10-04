# M2 evidence: pinned installer, resolver, doctor and launch record

Spec: `docs/doperpowers/specs/2026-10-02-standalone-cua-design.md`, milestone M2. Run on 2026-10-02, macOS 26 arm64,
host Node 22.23.2. Scratch homes were `mktemp -d` directories under `/tmp`, outside the repository; `$CUA_HOME` stands
for the one in use. No GUI action, helper start, grant request, Keychain access or MCP registration was performed.

## Results

| Item | Result | Evidence |
|---|---|---|
| `npm test` (Node only) | PASS | 47/47, no Swift, GUI, network or real credentials; install mechanics on `ditto`-built fixture archives. |
| `install --archive <pinned zip>` | PASS | 9 s. Hash and length checked before extraction; only `cua_node/` and `CodexCLI.app/` kept; `install.json` recorded; pointer written last. |
| Second `install --archive` mutates nothing | PASS | 3 s, "already installed and verified". Sorted `stat` (inode, mtime, ctime, size) of all 2947 entries identical before and after; archive not re-read. |
| `doctor --json` on the real install | PASS (exit 0) | platform, runtime.installed, runtime.files, runtime.vendor-manifest (`0.0.27/20260927214556-b77d38801cca`, node `24.21.0-cua.1`), runtime.ipc (`CodexComputerUseIPC-5`), runtime.signatures (4 components, team `2DC432GLL2`) pass; helper.live pass (existing helper, below); helper.permissions blocked (passive check cannot read TCC). |
| Download mode from the official URL | PASS | `CUA_HOME=$(mktemp -d /tmp/cua-download.XXXXXX) node bin/cua.mjs install`: 55 s end to end, same pinned length/SHA-256, doctor healthy. `diff -rq` against the `--archive` install: identical apart from `install.json`. Scratch home deleted afterwards. |
| `resolveRuntime` + `buildLaunch` drive the real runtime | PASS | Throwaway smoke (not committed): the launch record's command/env/cwd answered `initialize` (`rmcp 1.5.0`) and `tools/list` (`js`, `js_add_node_module_dir`, `js_reset`, `turn_ended`; the `js` description carries the computer surface) and exited 0 on stdin EOF with empty stderr. No `js` cell was run. |
| Bad hash / length / manifest / IPC / signature cannot activate | PASS (fixtures) | `test/runtime-install.test.mjs`; the production `codesign` requirement rejects unsigned fixtures and Apple-signed `/usr/bin/true` (wrong team). |
| Failed activation keeps the old pointer | PASS (fixtures) | Validation failure and an occupied target path both leave the first release active; staging always removed. |

## Facts established for later milestones

- Signature check: `codesign --verify --deep --strict -R '=anchor apple generic and certificate leaf[subject.OU] = "2DC432GLL2"'`
  on each pinned component. This passes on the real tree and rejects a validly Apple-signed binary of another team.
- Provenance: the local archive and every extracted entry carry only `com.apple.provenance`; a Node download carries no
  quarantine. `ditto -x -k` propagates an archive's quarantine to extracted files (observed on a test zip), and the
  installer clones a local archive with `cp -c`, which keeps its extended attributes. Node's `fs.copyFileSync`
  drops them (quarantine included), so it is not used.
- The live helper check is passive: socket holder via `lsof`, executable via `ps`, IPC version strings read from the
  holder's binary, version from its `Info.plist`. On this host it found pid 34706,
  `~/.codex/computer-use/Codex Computer Use.app` 26.924.1001281, speaking `CodexComputerUseIPC-5`: compatible, and
  another installation's helper (the running ChatGPT's), not one started by cua. Cold start remains BLOCKED as in M1.
- `/tmp` is a symlink to `/private/tmp`; the resolver and launch record use real paths throughout, as the trusted
  worker compares real paths.
