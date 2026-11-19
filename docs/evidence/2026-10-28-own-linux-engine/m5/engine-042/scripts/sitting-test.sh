#!/bin/bash
# Task 115 (ruling 888.6): the M5 sitting launchers exit with a failing step's status. Each copy the 0.4.2 reruns use
# (arm64's h5 and x64's h4 scripts/sitting.sh) runs in a scratch root (CUA171_DIR) with stub steps: a sitting whose
# first step fails and whose second passes must exit with the first's status, having run the second; one whose steps
# all pass must exit 0. Nothing outside the scratch root is read or written, and no step drives a display.
# usage: sitting-test.sh <checkout>
set -u
C=${1:?checkout}
M=$C/docs/evidence/2026-10-28-own-linux-engine/m5
status=0
check() { # <what> <want> <got>
  if [ "$2" = "$3" ]; then echo "PASS $1 ($3)"; else echo "FAIL $1: want $2, got $3"; status=1; fi
}
for copy in "arm64/h5 task109 task109-arm64" "x64/h4 task105 t105-x64"; do
  set -- $copy
  dir=$1; task=$2; holder=$3
  root=$(mktemp -d)
  mkdir -p "$root/$task"
  printf '#!/bin/bash\necho stub > "$2"\n' > "$root/$task/after-step.sh"
  chmod +x "$root/$task/after-step.sh"
  {
    echo "== S1"; echo "$root/locked.sh $holder bash -c 'exit 3'"
    echo "== S2"; echo "$root/locked.sh $holder true"
  } > "$root/$task/zero-commands.txt"
  run() { CUA171_DIR=$root HARD_STOP=$(( $(date +%s) + 3600 )) bash "$M/$dir/scripts/sitting.sh" "" "$root/out$1" label "${@:2}" > /dev/null 2>&1; echo $?; }
  check "$dir: a failing step, then a passing one" 3 "$(run 1 S1:1 S2:1)"
  check "$dir: the step after the failing one still ran" 1 "$(grep -c 'end S2 exit 0' "$root/out1/zero.log")"
  check "$dir: passing steps alone" 0 "$(run 2 S2:1 S2:1)"
  rm -rf "$root"
done
exit $status
