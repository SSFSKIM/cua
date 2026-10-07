#!/usr/bin/env bash
# Create a cua device VM on Hetzner Cloud: a firewall cua-vm (ssh in only; reused if it exists) and a server whose
# cloud-init (render.sh) installs the desktop, Chrome, Node, cua and its pinned runtime. Waits for cloud-init to finish,
# then prints the doctor summary and the owner's checklist. Refuses if a server of that name already exists (re-run
# /usr/local/sbin/cua-provision.sh on it instead).
#
#   deploy/cloud-vm/create-hetzner.sh [--name cua-vm] [--arch x64|arm64] [--type <server type>] [--location nbg1]
#       [--ssh-key macbook] [--user cua] [--ref main] [--deb pin|<https URL>|<local file>] [--relay wss://<relay>/ws]
#
# --arch picks the type: cx23 (x64) or cax11 (arm64). --deb <local file> copies that deb (the pinned one for --arch,
# checked here) to the server while cloud-init runs, instead of the server downloading it. The hcloud context is
# $HCLOUD_CONTEXT, cua when unset; never devbox.
set -euo pipefail

name=cua-vm arch=x64 type='' location=nbg1 ssh_key=macbook render_args=() deb=''
usage() { echo "usage: $0 [--name <name>] [--arch x64|arm64] [--type <server type>] [--location <location>] [--ssh-key <name>] [--user <name>] [--ref <git ref>] [--deb pin|<https URL>|<file>] [--relay <wss url>]" >&2; exit 2; }
while (($#)); do
  (($# >= 2)) || usage
  case "$1" in
    --name) name="$2" ;;
    --arch) arch="$2" ;;
    --type) type="$2" ;;
    --location) location="$2" ;;
    --ssh-key) ssh_key="$2" ;;
    --deb) deb="$2"; render_args+=("$1" "$2") ;;
    --user|--ref|--relay) render_args+=("$1" "$2") ;;
    *) usage ;;
  esac
  shift 2
done
[[ "$name" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "not a plain server name: $name" >&2; exit 2; }
case "$arch" in x64) type="${type:-cx23}" deb_arch=amd64 ;; arm64) type="${type:-cax11}" deb_arch=arm64 ;; *) usage ;; esac
export HCLOUD_CONTEXT="${HCLOUD_CONTEXT:-cua}"
[[ "$HCLOUD_CONTEXT" != devbox ]] || { echo "refusing hcloud context devbox: cua servers live in context cua" >&2; exit 2; }
here="$(cd "$(dirname "$0")" && pwd)"
t0=$SECONDS
elapsed() { printf '%dm%02ds' "$(((SECONDS - t0) / 60))" "$(((SECONDS - t0) % 60))"; }

# A local deb must be the pinned one for this architecture: check it here rather than after a 10-minute upload.
upload=''
if [[ -n "$deb" && "$deb" != pin && "$deb" != https://* ]]; then
  read -r file want < <(node -e '
    const fs = require("fs"), dir = process.argv[1];
    const pins = fs.readdirSync(dir).filter(f => f.endsWith("-linux-" + process.argv[2] + ".json")).sort();
    const a = JSON.parse(fs.readFileSync(dir + "/" + pins.at(-1), "utf8")).archive;
    console.log(a.url.split("/").pop(), a.sha256);' "$here/../../runtime/releases" "$arch")
  [[ "$file" == *_"$deb_arch".deb ]] || { echo "the $arch pin does not name an $deb_arch deb ($file)" >&2; exit 1; }
  echo "checking $deb against the $arch pin ($file)"
  [[ "$(shasum -a 256 "$deb" | cut -d' ' -f1)" == "$want" ]] || { echo "$deb does not match the pin's sha256 ($want)" >&2; exit 1; }
  upload="$file"
fi

if hcloud server describe "$name" >/dev/null 2>&1; then
  echo "a server named $name already exists in context $HCLOUD_CONTEXT; re-run /usr/local/sbin/cua-provision.sh on it" >&2
  exit 1
fi
if ! hcloud firewall describe cua-vm >/dev/null 2>&1; then
  rules="$(mktemp)"
  trap 'rm -f "$rules"' EXIT
  echo '[{"direction": "in", "protocol": "tcp", "port": "22", "source_ips": ["0.0.0.0/0", "::/0"], "description": "ssh"}]' >"$rules"
  hcloud firewall create --name cua-vm --rules-file "$rules" >/dev/null
fi

user_data="$("$here/render.sh" ${render_args[@]+"${render_args[@]}"})"
echo "creating $name ($type, $arch, $location)"
printf '%s\n' "$user_data" | hcloud server create --name "$name" --type "$type" --image ubuntu-24.04 \
  --location "$location" --ssh-key "$ssh_key" --firewall cua-vm --user-data-from-file - >/dev/null
ip="$(hcloud server ip "$name")"
echo "server id $(hcloud server describe "$name" -o format='{{.ID}}') at $ip ($(elapsed))"

ssh-keygen -R "$ip" >/dev/null 2>&1 || true
ssh_opts=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 -o BatchMode=yes -o ServerAliveInterval=30)
for try in $(seq 60); do
  ssh "${ssh_opts[@]}" "root@$ip" true 2>/dev/null && break
  if ((try == 60)); then ssh "${ssh_opts[@]}" "root@$ip" true; echo "no ssh to root@$ip after 5 minutes" >&2; exit 1; fi
  sleep 5
done
echo "ssh up ($(elapsed))"

# The upload runs beside cloud-init; the VM's provisioning waits for the file under its final name.
scp_pid=''
if [[ -n "$upload" ]]; then
  echo "copying $deb to /var/cache/cua/$upload in the background"
  # shellcheck disable=SC2029  # $upload is the pin's plain file name, meant to expand here
  ( ssh "${ssh_opts[@]}" "root@$ip" 'mkdir -p /var/cache/cua' \
    && scp "${ssh_opts[@]}" -q "$deb" "root@$ip:/var/cache/cua/$upload.part" \
    && ssh "${ssh_opts[@]}" "root@$ip" "mv /var/cache/cua/$upload.part /var/cache/cua/$upload" \
    && echo "deb copied ($(elapsed))" ) &
  scp_pid=$!
fi

echo "waiting for cloud-init (provisioning log: ssh root@$ip tail -f /var/log/cua-provision.log)"
status=0
ssh "${ssh_opts[@]}" "root@$ip" 'cloud-init status --wait >/dev/null' || status=$?
if [[ -n "$scp_pid" ]]; then wait "$scp_pid" || echo "the deb copy failed: copy it to /var/cache/cua/$upload and re-run cua-provision.sh" >&2; fi
# cloud-init status: 0 done, 2 done with warnings (recoverable), 1 error.
if ((status == 1)); then
  echo "cloud-init failed ($(elapsed)): ssh root@$ip tail -50 /var/log/cua-provision.log" >&2
  exit 1
fi
echo "cloud-init done ($(elapsed))"
ssh "${ssh_opts[@]}" "root@$ip" 'test -s /var/log/cua-provision.json' || {
  echo "no /var/log/cua-provision.json: ssh root@$ip tail -50 /var/log/cua-provision.log" >&2; exit 1; }
echo "doctor (/var/log/cua-provision.json):"
ssh "${ssh_opts[@]}" "root@$ip" "jq -r '\"  ok: \\(.ok)\", (.checks[] | \"  \\(.status)\\t\\(.name)\\t\\(.detail | .[0:110])\")' /var/log/cua-provision.json"
echo
ssh "${ssh_opts[@]}" "root@$ip" cat /var/lib/cua-provision/checklist.txt
echo "(total $(elapsed); delete with: HCLOUD_CONTEXT=$HCLOUD_CONTEXT hcloud server delete $name)"
