# plant.sh <dir>: synthetic files by the prune's names and node_repl's keepers (no real credentials)
d=$1; mkdir -p "$d"/cache "$d"/plugins "$d"/skills "$d"/log "$d"/tmp "$d"/browser/sessions "$d"/computer-use/sessions "$d"/node_repl/active_execs
for f in auth.json installation_id state_5.sqlite state_5.sqlite-wal state_5.sqlite-shm models_cache.json cache/x plugins/x skills/x log/x tmp/arg0 browser/sessions/x config.toml computer-use/sessions/s.toml node_repl/active_execs/x; do printf synthetic > "$d/$f"; done
