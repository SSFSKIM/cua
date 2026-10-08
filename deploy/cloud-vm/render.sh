#!/usr/bin/env bash
# Print the cloud-init user data for a cua device VM (cloud-init.yaml with its parameters filled in), for any provider
# that takes user data. create-hetzner.sh uses it; on another provider, pass its output as the server's user data.
#
#   deploy/cloud-vm/render.sh [--user cua] [--ref main] [--repo <https URL>|<git bundle>] [--deb pin|<https URL>|<local file>]
#       [--relay wss://<relay>/ws] [--extension hosted|store] [--extension-url https://<host>/ext/update.xml]
#
# --deb: `pin` (default) downloads the pin's official URL on the VM; an https URL downloads a mirror instead; a local
# file means the operator copies it to the VM's /var/cache/cua/upload.deb (create-hetzner.sh --deb does), and the VM
# waits for it. Either way the VM checks the bytes against the pin's sha256 before installing.
# --repo: the repository the VM clones (default https://github.com/SSFSKIM/cua); a local file is a git bundle holding
# --ref (`git bundle create cua.bundle <ref>`, for a ref that is not pushed) that the operator copies to the VM's
# /var/cache/cua/cua.bundle (create-hetzner.sh --repo does), and the VM waits for it.
# --extension: where Chrome force-installs the cua extension from: `hosted` (default), the self-hosted CRX whose update
# manifest is --extension-url (default the relay's, which relay/deploy/update.sh --ext publishes), or `store`, the
# Chrome Web Store listing.
set -euo pipefail

user=cua ref=main deb=pin relay='' repo=https://github.com/SSFSKIM/cua
extension=hosted extension_url=https://178-104-102-73.sslip.io/ext/update.xml
usage() { echo "usage: $0 [--user <name>] [--ref <git ref>] [--repo <https URL>|<git bundle>] [--deb pin|<https URL>|<local file>] [--relay <wss url>] [--extension hosted|store] [--extension-url <https URL>]" >&2; exit 2; }
while (($#)); do
  (($# >= 2)) || usage
  case "$1" in
    --user) user="$2" ;;
    --ref) ref="$2" ;;
    --repo) repo="$2" ;;
    --deb) deb="$2" ;;
    --relay) relay="$2" ;;
    --extension) extension="$2" ;;
    --extension-url) extension_url="$2" ;;
    *) usage ;;
  esac
  shift 2
done
plain_https='^https://[A-Za-z0-9._:/@%+~=-]+$'
[[ "$user" =~ ^[a-z_][a-z0-9_-]{0,31}$ && "$user" != root ]] || { echo "not a plain user name: $user" >&2; exit 2; }
[[ "$ref" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] || { echo "not a plain git ref: $ref" >&2; exit 2; }
[[ -z "$relay" || "$relay" =~ ^wss://[A-Za-z0-9._:/@%-]+$ ]] || { echo "not a wss:// relay URL: $relay" >&2; exit 2; }
[[ "$extension" == hosted || "$extension" == store ]] || { echo "--extension is hosted or store: $extension" >&2; exit 2; }
[[ "$extension_url" =~ $plain_https ]] || { echo "not a plain https URL: $extension_url" >&2; exit 2; }
case "$deb" in
  pin) ;;
  https://*) [[ "$deb" =~ $plain_https ]] || { echo "not a plain https URL: $deb" >&2; exit 2; } ;;
  *) [[ -f "$deb" ]] || { echo "--deb is neither pin, an https URL nor a file: $deb" >&2; exit 2; }
     deb=upload ;;
esac
case "$repo" in
  https://*) [[ "$repo" =~ $plain_https ]] || { echo "not a plain https URL: $repo" >&2; exit 2; } ;;
  *) [[ -f "$repo" ]] || { echo "--repo is neither an https URL nor a git bundle file: $repo" >&2; exit 2; }
     repo=upload ;;
esac
here="$(cd "$(dirname "$0")" && pwd)"

conf="CUA_USER='$user'
CUA_REF='$ref'
CUA_REPO='$repo'
CUA_DEB='$deb'
CUA_RELAY='$relay'
CUA_EXTENSION='$extension'
CUA_EXTENSION_URL='$extension_url'
"
b64() { base64 | tr -d '\n'; }
# Comment lines go (they name the placeholders); #cloud-config stays.
sed -e '/^ *# /d' -e "s|@CONF_B64@|$(printf '%s' "$conf" | b64)|" \
  -e "s|@PROVISION_GZB64@|$(gzip -9n <"$here/cua-provision.sh" | b64)|" "$here/cloud-init.yaml"
