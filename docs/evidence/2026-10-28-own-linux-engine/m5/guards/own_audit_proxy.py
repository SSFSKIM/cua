# #171 M5, task 91, the design session's ruling 773: which run process's connection to an X socket is the run's own
# audit proxy's. One rule, read by the guard at each check (wrap71.py) and by the cross-check over the stored records
# (crosscheck-773.py), so both apply the same code.
#
# A connection whose server end ss shows no pid for (one the server has not yet taken: task 71's race, met on the
# proxy by V5's first attempt and F3's V3) is the run's own when its peer path is /tmp/.X11-unix/X<N> and the run's
# own recorded audit proxy serves :<N>: a process recorded in the run's tree that, alive at that check, has the kernel
# name xtrace and an argv naming `-D :<N>` (audit.mjs starts it so). Nothing else: not the abstract name
# @/tmp/.X11-unix/X<N>, not a display with a screen, not a proxy outside the run's tree or one that has exited.
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


def own_audit_proxy(peer_path, records, at_check):
    """The record of the run's own audit proxy whose socket `peer_path` is, or None. `records` are the run's recorded
    processes (wrap71's table: `pid`, `start`, `comm`, `argv`); `at_check(record)` is that very process as it is at this
    check (`comm`, `argv`) while it is alive in the run's tree, else None. The process is judged as it is then, not as
    first recorded: a sample can read a child between its fork and its exec, and the record keeps that argv."""
    m = X_SOCKET.fullmatch(peer_path or '')
    if not m:
        return None
    for rec in records:
        now = at_check(rec)
        if now and now.get('comm') == PROXY_COMM and proxy_display(now.get('argv')) == m.group(1):
            return rec
    return None
