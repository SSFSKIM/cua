#!/usr/bin/env bash
# Change the running cua-relay server: run another git ref of https://github.com/SSFSKIM/cua, or install a new
# devices.json; either restarts the relay (agents reconnect by themselves, sessions survive on the Macs). The file
# replaces the server's whole table: keep every device in it (the current one: ssh root@<host> cat /etc/cua-relay/devices.json).
#
#   relay/deploy/update.sh [--ref <git ref>] [--devices <devices.json>] [--host <address>]
#
# With neither --ref nor --devices it runs main. --devices alone leaves the code as it is. The server is found by
# name (cua-relay) in hcloud context $HCLOUD_CONTEXT (cua when unset) unless --host names it.
set -euo pipefail

ref='' devices='' host=''
usage() { echo "usage: $0 [--ref <git ref>] [--devices <devices.json>] [--host <address>]" >&2; exit 2; }
while (($#)); do
  (($# >= 2)) || usage
  case "$1" in
    --ref) ref="$2" ;;
    --devices) devices="$2" ;;
    --host) host="$2" ;;
    *) usage ;;
  esac
  shift 2
done
[[ -z "$ref" && -z "$devices" ]] && ref=main
[[ -z "$ref" || "$ref" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "not a plain git ref: $ref" >&2; exit 2; }
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

if [[ -n "$ref" ]]; then
  ssh "${ssh_opts[@]}" "root@$host" "set -e; cd /opt/cua && git fetch -q origin '$ref' && git checkout -q --detach FETCH_HEAD && git log --oneline -1 && cd relay && npm ci --omit=dev --no-audit --no-fund"
fi

ssh "${ssh_opts[@]}" "root@$host" 'systemctl restart cua-relay && sleep 1 && systemctl is-active cua-relay && journalctl -u cua-relay -n 3 --no-pager -o cat'
