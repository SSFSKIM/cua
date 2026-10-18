# prune-seq.sh <home> <label>: doctor, plain install, prune, doctor at the checkout's SHA; env CODEX_HOME points at the planted elsewhere dir
H=$1; L=$2; E=$(cat /tmp/m4/env-codex); cd ~/cua-m3
row() { CUA_HOME=$H CODEX_HOME=$E node bin/cua.mjs doctor --json 2>/dev/null | python3 -c "import json,sys; r=[x for x in json.load(sys.stdin)['checks'] if x['name']=='runtime.leftovers'][0]; print('doctor runtime.leftovers:', r['status'], '|', r['detail'])"; }
echo "== $L"; row
echo "-- plain install"; CUA_HOME=$H CODEX_HOME=$E node bin/cua.mjs install --archive /var/cache/cua/chatgpt_26.928.40906_arm64.deb --no-node 2>&1 | grep -v "^installing\|%" | tail -4
echo "codex after plain install: $(ls $H/runtimes/*/codex 2>/dev/null | wc -l); state/codex files: $(find $H/state/codex -type f | wc -l)"
echo "-- prune"; CUA_HOME=$H CODEX_HOME=$E node bin/cua.mjs install --archive /var/cache/cua/chatgpt_26.928.40906_arm64.deb --no-node --prune-leftovers 2>&1 | grep -v "^installing\|%" | tail -25
echo "codex after prune: $(ls $H/runtimes/*/codex 2>/dev/null | wc -l); state/codex left: $(cd $H/state/codex && find . -type f | sort | tr '\n' ' ')"
echo "env CODEX_HOME intact: $(find $E -type f | wc -l) files"
echo "runtimes bytes: $(du -sb $H/runtimes | cut -f1)"; row
