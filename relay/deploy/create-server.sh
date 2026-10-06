#!/usr/bin/env bash
# Create the cua-relay server on Hetzner Cloud: a primary IPv4 named cua-relay (kept when the server is deleted, so
# the host name survives a rebuild; reused if it exists), a firewall cua-relay (22, 80, 443 in), and a server
# cua-relay whose cloud-init installs Caddy, Node 22 and the relay. Waits until https://<host>/ answers, then prints the
# relay URLs. Refuses if a server named cua-relay already exists (update.sh changes a running one).
#
#   relay/deploy/create-server.sh [--ref <git ref>] [--type cx23] [--location nbg1] [--ssh-key macbook]
#
# The hcloud context is $HCLOUD_CONTEXT, cua when unset. The host is <ip-with-dashes>.sslip.io.
set -euo pipefail

ref=main type=cx23 location=nbg1 ssh_key=macbook name=cua-relay
usage() { echo "usage: $0 [--ref <git ref>] [--type <server type>] [--location <location>] [--ssh-key <name>]" >&2; exit 2; }
while (($#)); do
  (($# >= 2)) || usage
  case "$1" in
    --ref) ref="$2" ;;
    --type) type="$2" ;;
    --location) location="$2" ;;
    --ssh-key) ssh_key="$2" ;;
    *) usage ;;
  esac
  shift 2
done
[[ "$ref" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "not a plain git ref: $ref" >&2; exit 2; }
export HCLOUD_CONTEXT="${HCLOUD_CONTEXT:-cua}"
here="$(cd "$(dirname "$0")" && pwd)"

if hcloud server describe "$name" >/dev/null 2>&1; then
  echo "a server named $name already exists in context $HCLOUD_CONTEXT; use update.sh to change it" >&2
  exit 1
fi

if ! hcloud primary-ip describe "$name" >/dev/null 2>&1; then
  hcloud primary-ip create --name "$name" --type ipv4 --location "$location" >/dev/null
fi
ip="$(hcloud primary-ip describe "$name" -o format='{{.IP}}')"
ip_location="$(hcloud primary-ip describe "$name" -o format='{{.Location.Name}}')"
if [[ "$ip_location" != "$location" ]]; then
  echo "the primary IP $name ($ip) is in $ip_location, not $location: pass --location $ip_location" >&2
  exit 1
fi
host="${ip//./-}.sslip.io"

if ! hcloud firewall describe "$name" >/dev/null 2>&1; then
  rules="$(mktemp)"
  trap 'rm -f "$rules"' EXIT
  cat >"$rules" <<'JSON'
[
  {"direction": "in", "protocol": "tcp", "port": "22", "source_ips": ["0.0.0.0/0", "::/0"], "description": "ssh"},
  {"direction": "in", "protocol": "tcp", "port": "80", "source_ips": ["0.0.0.0/0", "::/0"], "description": "http (ACME, redirect)"},
  {"direction": "in", "protocol": "tcp", "port": "443", "source_ips": ["0.0.0.0/0", "::/0"], "description": "https"}
]
JSON
  hcloud firewall create --name "$name" --rules-file "$rules" >/dev/null
fi

b64() { base64 <"$1" | tr -d '\n'; }
user_data="$(sed -e "s/@HOST@/$host/g" "$here/Caddyfile" | base64 | tr -d '\n')"
# Comment lines go (they name the placeholders); #cloud-config stays.
user_data="$(sed -e '/^ *# /d' -e "s|@REF@|$ref|g" -e "s|@CADDYFILE_B64@|$user_data|" \
  -e "s|@UNIT_B64@|$(b64 "$here/cua-relay.service")|" "$here/cloud-init.yaml")"

echo "creating $name ($type, $location) at $ip, ref $ref"
printf '%s\n' "$user_data" | hcloud server create --name "$name" --type "$type" --image ubuntu-24.04 \
  --location "$location" --ssh-key "$ssh_key" --primary-ipv4 "$name" --firewall "$name" \
  --user-data-from-file - >/dev/null
echo "server id $(hcloud server describe "$name" -o format='{{.ID}}')"

# A new server on a reused address has new host keys: forget the old ones.
ssh-keygen -R "$ip" >/dev/null 2>&1 || true
ssh_opts=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 -o BatchMode=yes)
echo "waiting for cloud-init on root@$ip"
for try in $(seq 60); do
  ssh "${ssh_opts[@]}" "root@$ip" true 2>/dev/null && break
  if ((try == 60)); then ssh "${ssh_opts[@]}" "root@$ip" true; echo "no ssh to root@$ip after 5 minutes" >&2; exit 1; fi
  sleep 5
done
ssh "${ssh_opts[@]}" "root@$ip" 'cloud-init status --wait >/dev/null; cloud-init status --long' || {
  echo "cloud-init did not finish cleanly: ssh root@$ip less /var/log/cloud-init-output.log" >&2; exit 1; }

# Ready when Caddy answers over TLS and the relay behind it refuses an unknown device (401).
echo "waiting for https://$host/ (Caddy obtains its certificate)"
for _ in $(seq 30); do
  status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 -X POST "https://$host/d/x/mcp" 2>/dev/null || true)"
  if [[ "$status" == 401 ]]; then
    echo "relay up: agents enrol with  cua remote enroll --relay wss://$host/ws"
    echo "          clients reach      https://$host/d/<deviceId>/mcp"
    exit 0
  fi
  sleep 5
done
echo "https://$host/d/x/mcp did not answer 401 within 5 minutes: ssh root@$ip journalctl -u caddy" >&2
exit 1
