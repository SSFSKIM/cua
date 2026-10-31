# Item 1's recorder on a pseudo-terminal of its own (./recording.mjs). screencapture -v stops cleanly, writing its movie,
# only when it runs on a terminal and a character is typed there (or ctrl-c): on a pipe it ignores the character and a
# signal kills it with no movie, and with -V it takes no stop at all (checked on the MacBook, 2026-10-31). So it runs
# here on a pty, its output passed through, and this process types the stop for it: when a line or EOF arrives on its
# own stdin (the kit asking, or the kit gone), or when the cap runs out. Exit: the recorder's.
#
#   python3 -I recorder-pty.py <cap seconds> <command> [<argument>...]
import fcntl
import os
import select
import sys
import termios
import time

cap = float(sys.argv[1])
command = sys.argv[2:]
master, slave = os.openpty()
pid = os.fork()
if pid == 0:
    os.setsid()
    fcntl.ioctl(slave, termios.TIOCSCTTY, 0)  # its controlling terminal: if this process dies, the recorder is hung up
    os.close(master)
    for fd in (0, 1, 2):
        os.dup2(slave, fd)
    os.execv(command[0], command)
os.close(slave)

deadline = time.monotonic() + cap
stopped = False
watch = [master, 0]
while True:
    wait = None if stopped else max(0.0, deadline - time.monotonic())
    ready, _, _ = select.select(watch, [], [], wait)
    if not ready and not stopped:  # the cap
        os.write(master, b'x')
        stopped = True
        continue
    if master in ready:
        try:
            data = os.read(master, 4096)
        except OSError:  # the recorder closed its side
            data = b''
        if not data:
            break
        sys.stdout.buffer.write(data)
        sys.stdout.flush()
    if 0 in ready:
        os.read(0, 4096)  # a line or EOF: either way, the stop
        watch = [master]
        if not stopped:
            os.write(master, b'x')
            stopped = True

_, status = os.waitpid(pid, 0)
code = os.waitstatus_to_exitcode(status)
sys.exit(code if code >= 0 else 128 - code)
