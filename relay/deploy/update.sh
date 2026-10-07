#!/usr/bin/env bash
# Change the running cua-relay server: run another git ref of https://github.com/SSFSKIM/cua, or install a new
# devices.json; either restarts the relay (agents reconnect by themselves, sessions survive on the Macs). The file
# replaces the server's whole table: keep every device in it (the current one: ssh root@<host> cat /etc/cua-relay/devices.json).
# --ext publishes the self-hosted cua extension (the directory `node scripts/extension-pack.mjs` wrote: update.xml and
# the CRX it names) at https://<host>/ext/, the URL Linux VMs force-install it from; it installs this checkout's
# Caddyfile (the /ext/ route) under the server's current site address when that differs, and reloads Caddy. It does
# not restart the relay.
#
#   relay/deploy/update.sh [--ref <git ref>] [--devices <devices.json>] [--ext <dist dir>] [--host <address>]
#
# With none of --ref, --devices and --ext it runs main. --devices or --ext alone leaves the code as it is. The server
# is found by name (cua-relay) in hcloud context $HCLOUD_CONTEXT (cua when unset) unless --host names it.
set -euo pipefail

ref='' devices='' ext='' host=''
usage() { echo "usage: $0 [--ref <git ref>] [--devices <devices.json>] [--ext <dist dir>] [--host <address>]" >&2; exit 2; }
while (($#)); do
  (($# >= 2)) || usage
  case "$1" in
    --ref) ref="$2" ;;
    --devices) devices="$2" ;;
    --ext) ext="$2" ;;
    --host) host="$2" ;;
    *) usage ;;
  esac
  shift 2
done
[[ -z "$ref" && -z "$devices" && -z "$ext" ]] && ref=main
[[ -z "$ref" || "$ref" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "not a plain git ref: $ref" >&2; exit 2; }
# The extension directory: update.xml and the CRX its codebase names, both here, before anything reaches the server.
crx=''
if [[ -n "$ext" ]]; then
  [[ -f "$ext/update.xml" ]] || { echo "no update.xml in $ext (node scripts/extension-pack.mjs writes it)" >&2; exit 2; }
  crx="$(sed -n "s|.*codebase='[^']*/\([^'/]*\)'.*|\1|p" "$ext/update.xml")"
  [[ "$crx" =~ ^[A-Za-z0-9._-]+\.crx$ ]] || { echo "$ext/update.xml names no plain .crx file: ${crx:-none}" >&2; exit 2; }
  [[ -f "$ext/$crx" ]] || { echo "$ext/update.xml names $crx, which is not in $ext" >&2; exit 2; }
fi
if [[ -z "$host" ]]; then
  export HCLOUD_CONTEXT="${HCLOUD_CONTEXT:-cua}"
  host="$(hcloud server ip cua-relay)"
fi
ssh_opts=(-o StrictHostKeyChecking=accept-new -o BatchMode=yes)

if [[ -n "$devices" ]]; then
  # The relay refuses to start on a malformed file; check it here rather than take the relay down.
  node -e '
    const t = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (t === null || typeof t !== "object" || Array.isArray(t)) throw new Error("devices.json must be an object");
    for (const [id, e] of Object.entries(t))
      for (const k of ["deviceCredentialSha256", "clientCredentialSha256"])
        if (!/^[0-9a-f]{64}$/.test(e?.[k] ?? "")) throw new Error(`device ${id}: ${k} must be 64 hex digits`);
    console.log(`devices.json: ${Object.keys(t).length} device(s)`);' "$devices"
  scp "${ssh_opts[@]}" -q "$devices" "root@$host:/etc/cua-relay/devices.json.new"
  ssh "${ssh_opts[@]}" "root@$host" 'install -o root -g cua-relay -m 0640 /etc/cua-relay/devices.json.new /etc/cua-relay/devices.json && rm /etc/cua-relay/devices.json.new'
fi

if [[ -n "$ext" ]]; then
  # The CRX goes first, so the served update.xml never names a CRX that is not there yet; earlier CRXs stay (a VM
  # mid-download of one still finds it).
  ssh "${ssh_opts[@]}" "root@$host" 'install -d -m 0755 /var/lib/cua-relay/ext /var/lib/cua-relay/ext.in'
  for file in "$crx" update.xml; do
    scp "${ssh_opts[@]}" -q "$ext/$file" "root@$host:/var/lib/cua-relay/ext.in/$file"
    ssh "${ssh_opts[@]}" "root@$host" "install -m 0644 /var/lib/cua-relay/ext.in/$file /var/lib/cua-relay/ext/$file && rm /var/lib/cua-relay/ext.in/$file"
  done
  # This checkout's Caddyfile under the site address the server uses now (create-server.sh's sslip.io name, or the
  # domain the owner moved it to): installed and reloaded only when it differs, after Caddy validates it.
  site="$(ssh "${ssh_opts[@]}" "root@$host" "awk '/^[^#[:space:]].*[{]\$/ {print \$1; exit}' /etc/caddy/Caddyfile")"
  [[ "$site" =~ ^[A-Za-z0-9.:-]+$ ]] || { echo "could not read the site address from $host:/etc/caddy/Caddyfile: ${site:-none}" >&2; exit 1; }
  caddyfile="$(mktemp)"
  trap 'rm -f "$caddyfile"' EXIT
  sed -e "s/@HOST@/$site/g" "$(cd "$(dirname "$0")" && pwd)/Caddyfile" >"$caddyfile"
  scp "${ssh_opts[@]}" -q "$caddyfile" "root@$host:/etc/caddy/Caddyfile.new"
  ssh "${ssh_opts[@]}" "root@$host" 'set -e; cd /etc/caddy
    if cmp -s Caddyfile.new Caddyfile; then rm Caddyfile.new; echo "Caddyfile unchanged"; exit 0; fi
    diff -u Caddyfile Caddyfile.new || true
    if ! out="$(caddy validate --config Caddyfile.new --adapter caddyfile 2>&1)"; then
      printf "%s\n" "$out" | tail -5; rm Caddyfile.new; echo "caddy refused the new Caddyfile; the running one is unchanged"; exit 1
    fi
    install -m 0644 Caddyfile.new Caddyfile && rm Caddyfile.new && systemctl reload caddy && echo "Caddyfile installed, caddy reloaded"'
  echo "extension published: https://$site/ext/update.xml names $crx"
fi

if [[ -n "$ref" ]]; then
  ssh "${ssh_opts[@]}" "root@$host" "set -e; cd /opt/cua && git fetch -q origin '$ref' && git checkout -q --detach FETCH_HEAD && git log --oneline -1 && cd relay && npm ci --omit=dev --no-audit --no-fund"
fi

if [[ -n "$ref" || -n "$devices" ]]; then
  ssh "${ssh_opts[@]}" "root@$host" 'systemctl restart cua-relay && sleep 1 && systemctl is-active cua-relay && journalctl -u cua-relay -n 3 --no-pager -o cat'
fi
