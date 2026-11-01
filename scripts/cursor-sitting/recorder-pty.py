# Item 1's recorder on a pseudo-terminal of its own (./recording.mjs). screencapture -v stops cleanly, writing its movie,
# only when it runs on a terminal and a character is typed there (or ctrl-c): on a pipe it ignores the character and a
# signal kills it with no movie, and with -V it takes no stop at all (checked on the MacBook, 2026-10-31). So it runs
# here on a pty, its output passed through, and this process types the stop for it when asked: a line or EOF on its own
# stdin (the kit asking, or the kit gone), SIGINT, SIGTERM or SIGHUP to this process, or the cap running out. A screen
# recorder must never outlive the kit on the owner's Mac, so a recorder still running `grace` seconds after the stop
# was typed is sent SIGTERM, then SIGKILL two seconds later, and its terminal is closed; and if this process is killed
# outright, the pty (the recorder's controlling terminal) hangs it up. Exit: the recorder's (128 + n for signal n).
#
#   python3 -I recorder-pty.py <cap seconds> <grace seconds> <command> [<argument>...]
import fcntl
import os
import select
import signal
import sys
import termios
import time

cap, grace = float(sys.argv[1]), float(sys.argv[2])
command = sys.argv[3:]
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

requested = False


def ask(signum, frame):
    global requested
    requested = True


for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
    signal.signal(sig, ask)

status = None  # the recorder's wait status, once reaped


def reap(block=False):
    global status
    if status is None:
        done, wait_status = os.waitpid(pid, 0 if block else os.WNOHANG)
        if done:
            status = wait_status
    return status is not None


def end_it():
    """SIGTERM, then SIGKILL two seconds later: the recorder is gone when this returns."""
    for sig, wait in ((signal.SIGTERM, 2.0), (signal.SIGKILL, None)):
        if reap():
            return
        try:
            os.kill(pid, sig)
        except ProcessLookupError:
            pass
        until = time.monotonic() + (wait or 0)
        while wait and time.monotonic() < until and not reap():
            time.sleep(0.05)
    reap(block=True)


deadline = time.monotonic() + cap
stopped_at = None
watch = [master, 0]
while True:
    now = time.monotonic()
    if stopped_at is None and (requested or now >= deadline):
        try:
            os.write(master, b'x')
        except OSError:
            pass
        stopped_at = now
    if stopped_at is not None and now >= stopped_at + grace:
        end_it()
        break
    ready, _, _ = select.select(watch, [], [], 0.1)
    if master in ready:
        try:
            data = os.read(master, 4096)
        except OSError:  # the recorder closed its side
            data = b''
        if not data:
            break
        try:
            sys.stdout.buffer.write(data)
            sys.stdout.flush()
        except OSError:  # the kit is gone: its stop comes with it
            requested = True
    if 0 in ready:
        os.read(0, 4096)  # a line or EOF: either way, the stop
        watch = [master]
        requested = True

# The recorder closed its terminal, or was ended: it gets the same grace to exit before it is ended.
until = time.monotonic() + grace
while not reap() and time.monotonic() < until:
    time.sleep(0.05)
end_it()
os.close(master)
code = os.waitstatus_to_exitcode(status)
sys.exit(code if code >= 0 else 128 - code)
