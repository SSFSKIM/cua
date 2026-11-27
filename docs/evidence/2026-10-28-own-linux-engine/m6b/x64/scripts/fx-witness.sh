#!/bin/bash
# The fixture steps' process-path witness, from each traced step's file trace (strace -f --seccomp-bpf -e trace=%file):
# every successful execve of an engine binary (sky_linux_*, cua-engine) and every open of the vendor client's service.js,
# by path, with counts, and the count of trace lines naming any runtimes/ path. Then each named binary's SHA-256.
set -eu
T=/Users/new/.local/share/cua-171/t173
for step in E1 FB; do
  tr=$T/run/fixture-trace/$step.strace.gz
  out=$T/run/fixture-trace/$step.process-paths.txt
  {
    echo "# $step: the engine binaries the step executed and the vendor client files it opened, from $(basename "$tr") (strace -f -qq --seccomp-bpf -e trace=%file), $(zcat "$tr" | wc -l) lines"
    echo "# execve of an engine binary (count, path), successful calls only:"
    zcat "$tr" | grep -E 'execve\(' | grep -v ' = -1 ' | grep -oE 'execve\("[^"]*(sky_linux[A-Za-z0-9_]*|cua-engine)"' | sed 's/^execve("//; s/"$//' | sort | uniq -c
    echo "# execve of any other path holding sky_linux, successful calls only: $(zcat "$tr" | grep -E 'execve\(' | grep -v ' = -1 ' | grep -c 'sky_linux' || true) lines in all (the counts above included)"
    echo "# opens of the vendor client's service.js (count, path), successful calls only:"
    zcat "$tr" | grep -E 'open(at)?\(' | grep -v ' = -1 ' | grep -oE '"[^"]*@oai/sky/[^"]*/service\.js"' | tr -d '"' | sort | uniq -c
    echo "# any path under a runtimes/ directory, any call: $(zcat "$tr" | grep -c '/runtimes/' || true)"
    echo "# the SHA-256 of each executed engine binary:"
    for p in $(zcat "$tr" | grep -E 'execve\(' | grep -v ' = -1 ' | grep -oE 'execve\("[^"]*(sky_linux[A-Za-z0-9_]*|cua-engine)"' | sed 's/^execve("//; s/"$//' | sort -u); do
      if [ -e "$p" ]; then sha256sum "$p"; else echo "(gone) $p"; fi
    done
  } > "$out"
  cat "$out"
done
