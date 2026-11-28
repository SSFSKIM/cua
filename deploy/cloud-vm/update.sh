#!/usr/bin/env bash
# Upgrade a cua device VM made from this template to one commit, run from the operator's checkout over root's SSH: the
# VM's provisioner, its /etc/cua-provision.conf and its checkout end bound to that commit (deploy/cloud-vm/README.md).
#
#   deploy/cloud-vm/update.sh root@<vm> [--ref <ref>] [--bundle]
#
# 1. --ref (default HEAD) is resolved here, once, to a full commit ID, C. Every later step uses C, never the name, so a
#    ref that moves meanwhile changes nothing.
# 2. C's cua-provision.sh is staged once, here, from the commit itself, and this checkout's copy must be byte for byte
#    that. What is hashed and copied to the VM is the staged file, so a later edit or branch switch here changes nothing.
# 3. --bundle, for a VM whose CUA_REPO is `upload` and whose bundle is stale: a bundle whose tip is C is made here,
#    copied beside the VM's /var/cache/cua/cua.bundle and renamed over it only once it gives C on the VM (4's check).
# 4. Before the VM's script or conf changes, the VM's own source (its conf's CUA_REPO) must give exactly C. As the
#    desktop user, on the VM, it is fetched from into a scratch repository, by C's ID or with its branches and tags
#    where it refuses one by ID, and must then hold C; an uploaded bundle must also name C as a head.
# 5. The staged script is copied to a name of this run's own in /usr/local/sbin, its SHA-256 checked there, and renamed
#    over /usr/local/sbin/cua-provision.sh.
# 6. CUA_REF in the conf becomes C.
# 7. The script runs, and it refuses, before npm ci and cua install, a checkout whose index or tracked files are not
#    its commit's; 8. its exit 0 and the checkout's HEAD at C then mean that what ran is C's own files.
# The script that runs as root comes from this checkout, over the operator's SSH, as the first one did; nothing the
# desktop user can write is run as root. `ssh root@<vm> /usr/local/sbin/cua-provision.sh` stays the repair at the same
# commit.
set -euo pipefail

usage() { echo "usage: $0 root@<vm> [--ref <ref>] [--bundle]" >&2; exit 2; }
target='' ref=HEAD bundle=0
while (($#)); do
  case "$1" in
    --ref) (($# >= 2)) || usage; ref="$2"; shift 2 ;;
    --bundle) bundle=1; shift ;;
    -*) usage ;;
    *) [[ -z "$target" ]] || usage; target="$1"; shift ;;
  esac
done
[[ -n "$target" ]] || usage
[[ "$ref" =~ ^[A-Za-z0-9][A-Za-z0-9._/^~-]*$ ]] || { echo "not a plain git ref: $ref" >&2; exit 2; }
here="$(cd "$(dirname "$0")" && pwd)"
top="$(cd "$here/../.." && pwd)"
conf=/etc/cua-provision.conf dest=/usr/local/sbin/cua-provision.sh bundle_path=/var/cache/cua/cua.bundle
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# This run's own suffix for what it stages on the VM, so that two runs never write the same file.
run="$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
say() { printf 'update.sh: %s\n' "$*"; }
fail() { printf 'update.sh: %s\n' "$*" >&2; exit 1; }
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=30)
vm() { ssh "${ssh_opts[@]}" "$target" "$1"; }
# One word for the VM's shell. The quotes are variables: bash before 4.3 (macOS's /bin/bash is 3.2) reads quotes
# written inside a double-quoted pattern replacement differently.
q() { local sq="'" esc="'\\''"; printf "'%s'" "${1//$sq/$esc}"; }
sha256() { if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1"; else sha256sum "$1"; fi | cut -d' ' -f1; }
# Whether the VM's source $1 (a repository or a bundle) gives C: fetched from as the desktop user into a scratch
# repository that then holds C. A bundle with prerequisites, or a pack cut short, gives nothing.
# shellcheck disable=SC2016  # expanded by the VM's sh, with the source and C as $1 and $2
fetch='d="$(mktemp -d)" && trap '\''rm -rf "$d"'\'' EXIT && git -c init.defaultBranch=scratch init -q "$d" && { git -C "$d" fetch -q --depth=1 "$1" "$2" 2>/dev/null || git -C "$d" fetch -q "$1" "+refs/heads/*:refs/remotes/source/*" "+refs/tags/*:refs/tags/*"; } && git -C "$d" cat-file -e "$2^{commit}" 2>/dev/null'
gives_c() { vm "runuser -u $(q "$user") -- sh -c $(q "$fetch") sh $(q "$1") $C"; }
# Whether the bundle $1 on the VM names C as a head and gives it.
bundle_gives_c() { local heads; heads="$(vm "git bundle list-heads $1")" && grep -q "^$C " <<<"$heads" && gives_c "$1" 2>/dev/null; }

# 1 and 2. The commit, and its provisioner staged from it.
C="$(git -C "$top" rev-parse --verify --quiet "$ref^{commit}")" || fail "$ref names no commit in $top"
say "$ref is $C"
script="$tmp/cua-provision.sh"
{ git -C "$top" cat-file blob "$C:deploy/cloud-vm/cua-provision.sh" >"$script" 2>/dev/null && cmp -s "$script" "$here/cua-provision.sh"; } \
  || fail "this checkout's deploy/cloud-vm/cua-provision.sh is not the one at $C ($ref): check out $ref, or commit the change, then run update.sh again"

# The VM's desktop user and source, from its conf (read only).
answer="$(vm ". $conf && printf '%s\n' \"\$CUA_USER\" \"\$CUA_REPO\"")" || fail "could not read $target:$conf"
[[ "$answer" == *$'\n'* ]] || fail "$target:$conf names no CUA_USER and CUA_REPO"
user="${answer%%$'\n'*}" repo="${answer#*$'\n'}"
[[ -n "$user" && -n "$repo" && "$repo" != *$'\n'* ]] || fail "$target:$conf names no CUA_USER and CUA_REPO"

# 3. A bundle whose tip is C, to replace a stale one.
if ((bundle)); then
  [[ "$repo" == upload ]] || fail "--bundle replaces an uploaded bundle, and this VM's CUA_REPO is $repo, not upload"
  # A scratch repository that borrows this checkout's objects, so the bundle's one head is C and nothing here changes.
  git -c init.defaultBranch=scratch init -q --bare "$tmp/repo.git"
  echo "$(cd "$top" && cd "$(git rev-parse --git-common-dir)" && pwd)/objects" >"$tmp/repo.git/objects/info/alternates"
  git -C "$tmp/repo.git" update-ref refs/heads/cua-update "$C"
  git -C "$tmp/repo.git" bundle create -q "$tmp/cua.bundle" refs/heads/cua-update
  candidate="$bundle_path.update.$run"
  say "copying a bundle of $C beside $target:$bundle_path"
  scp "${ssh_opts[@]}" -q "$tmp/cua.bundle" "$target:$candidate"
  if ! vm "chmod 0644 $candidate" || ! bundle_gives_c "$candidate"; then
    vm "rm -f $candidate" || true
    fail "the bundle copied to $target:$candidate does not give $C: its heads do not name it, or a fetch from it fails; it was removed, and $bundle_path, the VM's script and its conf are unchanged"
  fi
  vm "mv -f $candidate $bundle_path"
fi

# 4. The VM's source gives exactly C.
if [[ "$repo" == upload ]]; then
  bundle_gives_c "$bundle_path" \
    || fail "the VM's $bundle_path does not give $C: its heads do not name it, or a fetch from it fails; run update.sh again with --bundle, which replaces it with one whose tip is $C; the VM's script and conf are unchanged"
else
  gives_c "$repo" \
    || fail "the VM's source $repo (its CUA_REPO) does not give $C: push $C ($ref) there, then run update.sh again; the VM's script and conf are unchanged"
fi

# 5. The staged script, by its hash.
staged="$dest.update.$run"
want="$(sha256 "$script")"
scp "${ssh_opts[@]}" -q "$script" "$target:$staged"
got="$(vm "sha256sum $staged")" || got=''
got="${got%% *}"
if [[ "$got" != "$want" ]]; then
  vm "rm -f $staged" || true
  fail "the copy at $target:$staged has SHA-256 ${got:-none}, not $want: it was removed, and the VM's script and conf are unchanged"
fi
vm "chmod 0755 $staged && mv -f $staged $dest"
say "$target:$dest is the provisioner at $C"

# 6. CUA_REF is C.
vm "sed -e \"s/^CUA_REF=.*/CUA_REF='$C'/\" $conf >$conf.update.$run && grep -qx \"CUA_REF='$C'\" $conf.update.$run && chmod 0644 $conf.update.$run && mv -f $conf.update.$run $conf" \
  || fail "could not set CUA_REF in $target:$conf (its provisioner is already the one at $C): run update.sh again"
say "CUA_REF=$C in $target:$conf"

# 7 and 8. The run, then the checkout it left (the run checked its tracked files against C).
status=0
vm "$dest" || status=$?
head="$(vm "runuser -u $(q "$user") -- git -C /opt/cua rev-parse HEAD")" || head='unknown'
((status == 0)) || fail "$dest exited $status on $target (its log: /var/log/cua-provision.log there); its checkout /opt/cua is at $head"
[[ "$head" == "$C" ]] || fail "the VM's checkout /opt/cua is at $head, not $C"
say "the VM's checkout is at $C"
