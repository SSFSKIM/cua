# M5's T4: the person whose display `:0` is, read from the session (sourced by owner-check.sh and owner-watch.sh): the
# account the guards run as, the home its passwd entry names and its runtime directory. Task 50 wrote in the #171 x86-64
# VM's (uid 501, /Users/new); M5's arm64 VM's may differ. An account with no home stops the guard before it reads anything.
PUID=$(id -u)
H=$(getent passwd "$PUID" | cut -d: -f6)
PRUN=/run/user/$PUID
if [ -z "$H" ] || [ ! -d "$H" ]; then echo "no home for uid $PUID: stopping before anything is read" >&2; exit 3; fi
