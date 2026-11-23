# #171 M5, task 91, the design session's ruling 773: which run process's connection to an X socket is the run's own
# audit proxy's. One rule, read by the guard at each check (wrap71.py) and by the cross-check over the stored records
# (crosscheck-773.py), so both apply the same code.
#
# A connection whose server end ss shows no pid for (one the server has not yet taken: task 71's race, met on the
# proxy by V5's first attempt and F3's V3) is the run's own when its peer path is /tmp/.X11-unix/X<N> and the run's
# own recorded audit proxy serves :<N> on that very socket:
#   - a process recorded in the run's tree that, alive at that check, has the kernel name xtrace and an argv naming
#     `-D :<N>` (audit.mjs starts it so), read as stat, cmdline, stat so that a pid reused between the reads lends
#     nothing (fix wave 1);
#   - and in the same ss snapshot, every listener at exactly that path is that process's alone, and there is one
#     (fix wave 1): a foreign listener at the path, one ss shows no owner for, or one left from an earlier proxy on the
#     display makes the socket not provably the proxy's.
# Nothing else: not the abstract name @/tmp/.X11-unix/X<N>, not a display with a screen, not a proxy outside the run's
# tree or one that has exited.
import re

X_SOCKET = re.compile(r'/tmp/\.X11-unix/X([0-9]+)')
PROXY_COMM = 'xtrace'


def proxy_display(argv):
    """The display an xtrace serves, from its argv as one space-joined string (wrap71's form): the number after its
    last `-D :<N>` (getopt's last wins), or None."""
    tokens = (argv or '').split(' ')
    shown = None
    for flag, value in zip(tokens, tokens[1:]):
        if flag == '-D':
            m = re.fullmatch(r':([0-9]+)', value)
            shown = m.group(1) if m else None
    return shown


def read_proc(path):
    with open(path, 'rb') as f:
        return f.read()


def _stat(raw):
    """(comm, state, start time) from a /proc/<pid>/stat."""
    s = raw.decode(errors='replace')
    r = s.rfind(')')
    f = s[r + 2:].split()
    return s[s.find('(') + 1:r], f[0], int(f[19])


def process_at_check(pid, start, read=read_proc):
    """The process `pid` as it is now (`comm`, `argv`), when it is the live process that started at `start`; else None.
    Read stat, cmdline, stat: the argv is that process's only when both stats show it, the same name and start, and
    neither a zombie, so a pid reused between the reads never lends the new process's argv to the old one."""
    try:
        before = _stat(read(f'/proc/{pid}/stat'))
        argv = read(f'/proc/{pid}/cmdline')
        after = _stat(read(f'/proc/{pid}/stat'))
    except (OSError, ValueError, IndexError):
        return None
    (comm, state, began), (comm2, state2, began2) = before, after
    if comm != comm2 or began != began2 or began != start or state in ('Z', 'X') or state2 in ('Z', 'X'):
        return None
    return {'comm': comm, 'argv': ' '.join(a.decode(errors='replace') for a in argv.split(b'\0') if a)}


def recorded_proxy(peer_path, records, at_check):
    """The recorded processes that, as they are at this check, are an xtrace serving the display `peer_path` is the
    socket of: `records` are wrap71's table (`pid`, `start`, `comm`, `argv`); `at_check(record)` is that process at this
    check (`comm`, `argv`) while it is alive in the run's tree, else None."""
    m = X_SOCKET.fullmatch(peer_path or '')
    if not m:
        return []
    found = []
    for rec in records:
        now = at_check(rec)
        if now and now.get('comm') == PROXY_COMM and proxy_display(now.get('argv')) == m.group(1):
            found.append(rec)
    return found


def listener_is(rec, listeners):
    """Whether the socket is `rec`'s own: `listeners` holds, for every listening socket at exactly that path in the same
    ss snapshot, the pids ss shows holding it; there must be one, and each must be held by `rec`'s pid alone."""
    return bool(listeners) and all(sorted(set(pids)) == [rec['pid']] for pids in listeners)


def own_audit_proxy(peer_path, records, at_check, listeners):
    """The record of the run's own audit proxy whose socket `peer_path` is, or None (see recorded_proxy, listener_is)."""
    for rec in recorded_proxy(peer_path, records, at_check):
        if listener_is(rec, listeners):
            return rec
    return None
