#!/bin/bash
# T8's (task 173) evidence, copied from the run's scratch into the branch's m6b/ directory.
set -e
T=/Users/new/.local/share/cua-171/t173
W=$(cd "$T/wt" && pwd -P)
D=$W/docs/evidence/2026-10-28-own-linux-engine/m6b
S=$T/evidence/m6b
for l in x64 arm64 x64-hosted; do mkdir -p "$D/$l"; cp "$S/$l/runtime.json" "$S/$l/traces.txt" "$D/$l/"; done
R=$D/x64/regression
mkdir -p "$R/parity" "$R/accept-default" "$R/accept-explicit" "$R/device" "$R/fallback" "$R/logs"
cp -r "$T/run/reg/r1/out/parity/." "$R/parity/"
cp -r "$T/run/reg/r3d/out/accept/." "$R/accept-default/"
cp -r "$T/run/reg/r3c/out/accept/." "$R/accept-explicit/"
cp -r "$T/run/reg/r4/out/device/." "$R/device/"
cp -r "$T/run/reg/fallback/out/fallback/." "$R/fallback/"
for p in r1 r3d r3c r4 fallback; do cp "$T/$p.log" "$R/logs/$p.log"; done
cp "$T/run/src-install.json" "$R/source-install.json"
F=$D/x64/fixture
mkdir -p "$F/plain/E1" "$F/plain/FB" "$F/traced/E1" "$F/traced/FB"
cp "$T/run/fxverify/fixture-verify.txt" "$F/"
cp "$T/run/fixture-plain/bindings.txt" "$F/bindings.txt"
for m in plain trace; do
  if [ "$m" = plain ]; then dst=$F/plain; else dst=$F/traced; fi
  for s in E1 FB; do
    src=$T/run/fixture-$m/out/$s.pinned-release
    cp "$src/README.md" "$src/step.json" "$src/run/summary.md" "$dst/$s/"
    cp "$T/run/fixture-$m/$s.out" "$dst/$s/gate.out"
  done
  cp "$T/run/fixture-$m/out/FB.pinned-release/run/results.jsonl" "$dst/FB/"
done
cp "$T/run/fixture-trace/trace-check.txt" "$F/traced/"
cp "$T/run/fixture-trace/E1.process-paths.txt" "$F/traced/E1/process-paths.txt"
cp "$T/run/fixture-trace/FB.process-paths.txt" "$F/traced/FB/process-paths.txt"
mkdir -p "$D/x64/scripts"
cp "$T/t8.sh" "$T/chain.sh" "$T/credit.sh" "$T/credit-files.sh" "$T/witness.mjs" "$T/fx-witness.sh" "$T/cites.mjs" "$T/ci-gates.sh" "$T/collect.sh" "$D/x64/scripts/"
cp "$T/chain.log" "$D/x64/chain.log"
cp "$T/ci-gate-default.log" "$T/ci-gate-engine-linux.log" "$D/"
du -sh "$D/x64" "$D/arm64" "$D/x64-hosted"
