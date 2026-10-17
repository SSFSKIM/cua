# Package contents at 5f188d9 (mini parity clone)

```sh
# on the mini, in ~/Developer/GitHub/cua-parity at 5f188d99a6c9d076c5706e7c47e1ebdfe13f8c85, clean tree, npm 11.16.0, Node v24.18.0
npm pack --dry-run --json > npm-pack-dry-run.json
# here, at the same commit
node check-pack.mjs npm-pack-dry-run.json package.json > check.json     # exit 0, "ok": true
```

`check.json` verdict: **ok**. The packed `cua` package (200 entries) contains the owned first-call documents
(`docs/cua-api/core.md`, `confirmations.md`, `other-browser-apis.md`, `PROVENANCE.md`), the vendored parser
(`src/repl-host/vendor/meriyah/meriyah.mjs`, whose header carries the ISC licence, and `VERSION` 7.0.0), the vendored
validator (`src/cua-api/vendor/zod/`, with `LICENSE` and `VERSION` 3.25.76), the four managed Node pins
(`runtime/releases/node/24.22.0-{darwin-arm64,darwin-x64,linux-arm64,linux-x64}.json`) and the own host's modules. The
package's `engines.node` stays `^22.14 || >=23.7` (cua itself runs on Node 22; the own host's floor of 24 is checked per
connection). Plugin and marketplace versions are 0.12.0; `REPL_HOST_VERSION` is 0.5.0. Not timed, so no load is recorded.
