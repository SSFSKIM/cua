# #171 M5, T4's arm64 round, item (e), ruling 773's rule extended narrowly: which run process's connection to an
# autobind abstract address is a connection to the run's own Chrome. Read by the guard at each check (wrap71.py).
#
# The arm64 pilot's V5 (2026-11-18 05:10Z) was stopped by an `outside-peer-connection` to @011e2 with no peer pid, from
# the run's own Chrome 26 ms after it started: its connection to its own crashpad handler, not yet accepted (task 71's
# race, on Chrome's own socket). A read-only observer beside the rerun saw 24 such addresses, every one held by chrome
# or chrome_crashpad. Such a connection counts, rather than flags, only when, in the same ss snapshot:
#   - its peer path is an autobind abstract address: `@` and five hex digits, the name the kernel gives a socket bound
#     to an empty address;
#   - there is a listener at that address, and every pid ss shows holding it is a process in the run's tree, of
#     kernel name chrome or chrome_crashpad, identity-checked as ruling 773 checks the audit proxy: read stat, cmdline,
#     stat at the check, both stats the same name and start and neither a zombie, so a pid reused between the reads
#     lends nothing; and its start before the snapshot was taken, so the process at the check is the one ss showed
#     holding the listener (a process alive both before and after the snapshot held its pid throughout it), never one
#     that took the pid after.
# Anything else flags: a listener with no pid shown, none at all, a holder outside the run's tree or of another name,
# a pid reused between the reads or after the snapshot, any other address.
import re

AUTOBIND = re.compile(r'@[0-9a-f]{5}')
CHROME_COMMS = {'chrome', 'chrome_crashpad'}


def read_proc(path):
    with open(path, 'rb') as f:
        return f.read()


def _stat(raw):
    """(comm, state, start time) from a /proc/<pid>/stat."""
    s = raw.decode(errors='replace')
    r = s.rfind(')')
    f = s[r + 2:].split()
    return s[s.find('(') + 1:r], f[0], int(f[19])


def process_before(pid, snapshot_ticks, read=read_proc):
    """The process `pid` as it is at the check (`comm`, `start`) when it is one live process, read stat, cmdline, stat,
    that started before `snapshot_ticks` (clock ticks since boot, read before the snapshot); else None."""
    try:
        before = _stat(read(f'/proc/{pid}/stat'))
        read(f'/proc/{pid}/cmdline')
        after = _stat(read(f'/proc/{pid}/stat'))
    except (OSError, ValueError, IndexError):
        return None
    (comm, state, began), (comm2, state2, began2) = before, after
    if comm != comm2 or began != began2 or state in ('Z', 'X') or state2 in ('Z', 'X') or began >= snapshot_ticks:
        return None
    return {'comm': comm, 'start': began}


def own_chrome_listener(peer_path, listeners, in_run, snapshot_ticks, read=read_proc):
    """The run's own Chrome processes holding the autobind address `peer_path`, or None (see the header). `listeners`:
    for every listening socket at exactly that address in the snapshot, the pids ss shows holding it; `in_run`: the
    run's tree as read after the snapshot; `snapshot_ticks`: the boot clock in ticks, read before it."""
    if not AUTOBIND.fullmatch(peer_path or '') or not listeners:
        return None
    holders = []
    for pids in listeners:
        if not pids:
            return None
        for pid in sorted(set(pids)):
            now = process_before(pid, snapshot_ticks, read) if pid in in_run else None
            if not now or now['comm'] not in CHROME_COMMS:
                return None
            holders.append({'pid': pid, **now})
    return holders
