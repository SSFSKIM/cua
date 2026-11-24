#!/bin/sh
# The per-context input preference put back to "unset" (rulings 1181 and 1188; ./hitoolbox.mjs unsetPerContext runs
# this on a hosted runner, and a restore that did not hold names it for a person to run by hand):
#   sh scripts/native-matrix/unset-per-context.sh [--manual-recovery] [--delete-if-empty] [<domain>]
# Hosted only (ruling 1188): off a GitHub-hosted runner it refuses before any defaults call, whatever the domain (a
# path may be the owner's own plist), unless run with --manual-recovery, the owner's own recovery after a restore that
# did not hold (the command a failure names). Tests on a scratch path pass RUNNER_ENVIRONMENT or the mode.
# It removes TextInputGlobalPropertyPerContextInput from com.apple.HIToolbox's AppleGlobalTextInputProperties and
# writes back only that one top-level key, typed, through cfprefsd (defaults). With --delete-if-empty (the dictionary
# was absent before the run) a dictionary left empty is deleted instead. It fails closed: an export, extraction or
# removal that fails stops it before anything is written, and a key that is not a dictionary is never touched. It is
# safe to repeat: with the key, or the dictionary, already absent it writes nothing. `<domain>` is for tests (a
# scratch plist's path), as are UNSET_DEFAULTS and UNSET_PLUTIL (a tool that fails). Prints what it did: none,
# rewritten or deleted.
set -eu
delete_if_empty=no
manual_recovery=no
while [ $# -gt 0 ]; do
  case $1 in
    --delete-if-empty) delete_if_empty=yes; shift ;;
    --manual-recovery) manual_recovery=yes; shift ;;
    --*) echo "unset-per-context: unknown option $1" >&2; exit 2 ;;
    *) break ;;
  esac
done
domain=${1:-com.apple.HIToolbox}
# Whatever the domain's spelling: a path may be the owner's own plist, which defaults writes as the domain.
if [ "${RUNNER_ENVIRONMENT:-}" != github-hosted ] && [ "$manual_recovery" != yes ]; then
  echo "unset-per-context: refused: off a GitHub-hosted runner the harness never writes $domain (ruling 1188); the owner's own recovery runs with --manual-recovery" >&2
  exit 2
fi
dict=AppleGlobalTextInputProperties
key=TextInputGlobalPropertyPerContextInput
defaults=${UNSET_DEFAULTS:-/usr/bin/defaults}
plutil=${UNSET_PLUTIL:-/usr/bin/plutil}

# A key path's type in a property list, or "absent" when plutil finds no value there; any other failure stops the script.
type_of() {
  if out=$(printf '%s' "$2" | "$plutil" -type "$1" - 2>&1); then printf '%s' "$out"; return 0; fi
  case $out in *'No value at that key path'*) printf absent; return 0 ;; esac
  echo "unset-per-context: plutil -type $1 failed: $out: nothing written" >&2
  return 1
}

exported=$("$defaults" export "$domain" -)
type=$(type_of "$dict" "$exported")
if [ "$type" = absent ]; then echo none; exit 0; fi
if [ "$type" != dictionary ]; then echo "unset-per-context: $dict is a $type, not a dictionary: nothing written" >&2; exit 1; fi
value=$(printf '%s' "$exported" | "$plutil" -extract "$dict" xml1 -o - -)
key_type=$(type_of "$key" "$value")
if [ "$key_type" = absent ]; then echo none; exit 0; fi
rest=$(printf '%s' "$value" | "$plutil" -remove "$key" -o - -)
case $rest in *'<plist'*'</plist>'*) ;; *) echo "unset-per-context: plutil left no property list: nothing written" >&2; exit 1 ;; esac
if [ "$delete_if_empty" = yes ] && printf '%s' "$rest" | tr -d ' \t\n' | grep -q '<plistversion="1.0"><dict/></plist>'; then
  "$defaults" delete "$domain" "$dict"
  echo deleted
  exit 0
fi
"$defaults" write "$domain" "$dict" "$rest"
# defaults stores a value it cannot parse as a property list as a string: anything but a dictionary is a broken write.
written=$("$defaults" read-type "$domain" "$dict")
case $written in *dictionary*) echo rewritten ;; *) echo "unset-per-context: $dict was written back as '$written', not a dictionary" >&2; exit 1 ;; esac
