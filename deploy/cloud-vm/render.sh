#!/usr/bin/env bash
# Print the cloud-init user data for a cua device VM (cloud-init.yaml with its parameters filled in), for any provider
# that takes user data. create-hetzner.sh uses it; on another provider, pass its output as the server's user data.
#
#   deploy/cloud-vm/render.sh [--user cua] [--ref main] [--deb pin|<https URL>|<local file>] [--relay wss://<relay>/ws]
#
# --deb: `pin` (default) downloads the pin's official URL on the VM; an https URL downloads a mirror instead; a local
# file means the operator copies it to the VM's /var/cache/cua/<its name> (create-hetzner.sh --deb does), and the VM
# waits for it. Either way the VM checks the bytes against the pin's sha256 before installing.
set -euo pipefail

user=cua ref=main deb=pin relay='' repo=https://github.com/SSFSKIM/cua
usage() { echo "usage: $0 [--user <name>] [--ref <git ref>] [--deb pin|<https URL>|<local file>] [--relay <wss url>]" >&2; exit 2; }
while (($#)); do
  (($# >= 2)) || usage
  case "$1" in
    --user) user="$2" ;;
    --ref) ref="$2" ;;
    --deb) deb="$2" ;;
    --relay) relay="$2" ;;
    *) usage ;;
  esac
  shift 2
done
[[ "$user" =~ ^[a-z_][a-z0-9_-]{0,31}$ && "$user" != root ]] || { echo "not a plain user name: $user" >&2; exit 2; }
[[ "$ref" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "not a plain git ref: $ref" >&2; exit 2; }
[[ -z "$relay" || "$relay" =~ ^wss://[A-Za-z0-9._:/@%-]+$ ]] || { echo "not a wss:// relay URL: $relay" >&2; exit 2; }
case "$deb" in
  pin) ;;
  https://*) [[ "$deb" =~ ^https://[A-Za-z0-9._:/@%+~=-]+$ ]] || { echo "not a plain https URL: $deb" >&2; exit 2; } ;;
  *) [[ -f "$deb" ]] || { echo "--deb is neither pin, an https URL nor a file: $deb" >&2; exit 2; }
     deb=upload ;;
esac
here="$(cd "$(dirname "$0")" && pwd)"

conf="CUA_USER='$user'
CUA_REF='$ref'
CUA_REPO='$repo'
CUA_DEB='$deb'
CUA_RELAY='$relay'
"
b64() { base64 | tr -d '\n'; }
# Comment lines go (they name the placeholders); #cloud-config stays.
sed -e '/^ *# /d' -e "s|@CONF_B64@|$(printf '%s' "$conf" | b64)|" \
  -e "s|@PROVISION_B64@|$(b64 <"$here/cua-provision.sh")|" "$here/cloud-init.yaml"
