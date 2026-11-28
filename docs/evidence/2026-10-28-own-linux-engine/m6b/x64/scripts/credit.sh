#!/bin/bash
# T8's (task 173) credit check (the M6b pre-flight §5.3) and N8's empty diff (§5.2), at H, each command with its output.
set -u
T=/Users/new/.local/share/cua-171/t173
cd "$(cd "$T/wt" && pwd -P)" || exit 2
H=3722f2826ca8a8ff3c7a6e28e00ba765d10b077b
PATHS=(src/services/engine/linux src/services/engine/policy.mjs src/services/sky.mjs src/cua-api src/repl-host docs/cua-api)
run() { echo "\$ $*"; "$@"; echo "(exit $?)"; echo; }
echo "# #171 M6b T8 (task 173): the credit check (pre-flight §5.3) and engine-linux's paths (§5.2, N8), at H"
echo "# H = $H ($(git log -1 --format=%s $H))"
echo "# run $(date -u +%FT%TZ) on $(hostname)"
echo
echo "## 1. The engine's source at H is linux-engine-v0.4.5's: the stat prints nothing"
run git rev-parse 'linux-engine-v0.4.5^{commit}'
run git diff --stat linux-engine-v0.4.5 "$H" -- native/linux-engine
echo "## 2. The two hashes of runtime/engine/linux-engine.json at H are the release's assets'"
run git show "$H:runtime/engine/linux-engine.json"
echo "\$ gh release view linux-engine-v0.4.5 --repo SSFSKIM/cua --json tagName,assets --jq '.tagName, (.assets[] | \"\\(.name) \\(.size) \\(.digest)\")'"
gh release view linux-engine-v0.4.5 --repo SSFSKIM/cua --json tagName,assets --jq '.tagName, (.assets[] | "\(.name) \(.size) \(.digest)")'; echo "(exit $?)"; echo
echo "\$ node: each pin hash against the asset digest of the same name"
pin=$(git show "$H:runtime/engine/linux-engine.json")
assets=$(gh release view linux-engine-v0.4.5 --repo SSFSKIM/cua --json assets)
node -e '
  const pin = JSON.parse(process.argv[1]); const assets = JSON.parse(process.argv[2]).assets;
  let ok = true;
  for (const [arch, a] of Object.entries(pin.assets)) {
    const name = a.url.split("/").pop(); const asset = assets.find(x => x.name === name);
    const match = asset && asset.digest === `sha256:${a.sha256}`;
    ok &&= Boolean(match);
    console.log(`${arch} ${name} pin ${a.sha256} release ${asset?.digest ?? "absent"} ${match ? "equal" : "DIFFERENT"}`);
  }
  console.log(ok ? "both equal" : "NOT EQUAL"); process.exit(ok ? 0 : 1);' "$pin" "$assets"; echo "(exit $?)"; echo
echo "## 3. Main's service, facade and host are H's: the diff prints nothing"
run git diff 854103aa5 "$H" -- "${PATHS[@]}"
echo "## 4. What changed from da7585c31 to 854103aa5 in the same paths and native/linux-engine (each file is assigned in README.md's bridge table)"
run git diff --stat=200 da7585c31 854103aa5 -- "${PATHS[@]}" native/linux-engine
run git log --oneline --first-parent da7585c31..854103aa5 -- "${PATHS[@]}" native/linux-engine
run git log --oneline da7585c31..854103aa5 -- "${PATHS[@]}" native/linux-engine
echo "## 5. engine-linux's three paths (.github/ci-kit.yml) from 854103aa5 to H (N8): the diff prints nothing"
run git diff 854103aa5 "$H" -- native/linux-engine runtime/releases/node/24.22.0-linux-x64.json .github/ci-kit.yml
