#!/usr/bin/env python3
# Task 132 (the coordinator's 1029): on the display in $DISPLAY, does an XTEST motion to the pointer's current position
# generate a core MotionNotify? A window of its own under the pointer selects PointerMotion; each trial sends
# XTestFakeMotionEvent to the pointer's exact root position, flushes and counts the MotionNotify events in 200 ms, then,
# as the control, a 1 px move away and one back, each counted the same way. libX11 and libXtst through ctypes (no
# headers on the VM). Prints one JSON line a trial, then the summary.
#   DISPLAY=:N python3 -I xtest-same-place.py [trials]
import ctypes, ctypes.util, json, sys, time

X = ctypes.CDLL(ctypes.util.find_library('X11') or 'libX11.so.6')
XT = ctypes.CDLL(ctypes.util.find_library('Xtst') or 'libXtst.so.6')
X.XOpenDisplay.restype = ctypes.c_void_p
X.XOpenDisplay.argtypes = [ctypes.c_char_p]
X.XDefaultRootWindow.restype = ctypes.c_ulong
X.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
X.XCreateSimpleWindow.restype = ctypes.c_ulong
X.XCreateSimpleWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_uint, ctypes.c_ulong, ctypes.c_ulong]
X.XSelectInput.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_long]
X.XMapRaised.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
X.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
X.XFlush.argtypes = [ctypes.c_void_p]
X.XPending.argtypes = [ctypes.c_void_p]
X.XNextEvent.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
X.XWarpPointer.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_int, ctypes.c_int]
X.XQueryPointer.argtypes = [ctypes.c_void_p, ctypes.c_ulong] + [ctypes.POINTER(ctypes.c_ulong)] * 2 + [ctypes.POINTER(ctypes.c_int)] * 4 + [ctypes.POINTER(ctypes.c_uint)]
X.XServerVendor.restype = ctypes.c_char_p
X.XServerVendor.argtypes = [ctypes.c_void_p]
X.XVendorRelease.argtypes = [ctypes.c_void_p]
XT.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
XT.XTestQueryExtension.argtypes = [ctypes.c_void_p] + [ctypes.POINTER(ctypes.c_int)] * 4

MOTION_NOTIFY, MAP_NOTIFY = 6, 19
POINTER_MOTION_MASK, STRUCTURE_NOTIFY_MASK = 1 << 6, 1 << 17

dpy = X.XOpenDisplay(None)
if not dpy:
    sys.exit('cannot open the display')
root = X.XDefaultRootWindow(dpy)
a, b, c, d = (ctypes.c_int() for _ in range(4))
if not XT.XTestQueryExtension(dpy, ctypes.byref(a), ctypes.byref(b), ctypes.byref(c), ctypes.byref(d)):
    sys.exit('no XTEST')
xtest = f'{c.value}.{d.value}'
win = X.XCreateSimpleWindow(dpy, root, 0, 0, 400, 400, 0, 0, 0xffffff)
X.XSelectInput(dpy, win, POINTER_MOTION_MASK | STRUCTURE_NOTIFY_MASK)
# with `xi2` (the coordinator's follow-up to 1029): the window also selects XI2's XI_Motion for every master device
# (XISelectEvents, as Chrome does); the counts are then the XI_Motion GenericEvents, beside any core MotionNotify
XI2 = len(sys.argv) > 2 and sys.argv[2] == 'xi2'
xi_opcode = None
if XI2:
    XI = ctypes.CDLL(ctypes.util.find_library('Xi') or 'libXi.so.6')
    X.XQueryExtension.argtypes = [ctypes.c_void_p, ctypes.c_char_p] + [ctypes.POINTER(ctypes.c_int)] * 3
    op, fe, fr = ctypes.c_int(), ctypes.c_int(), ctypes.c_int()
    if not X.XQueryExtension(dpy, b'XInputExtension', ctypes.byref(op), ctypes.byref(fe), ctypes.byref(fr)):
        sys.exit('no XInputExtension')
    xi_opcode = op.value
    major, minor = ctypes.c_int(2), ctypes.c_int(2)
    XI.XIQueryVersion.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int)]
    if XI.XIQueryVersion(dpy, ctypes.byref(major), ctypes.byref(minor)) != 0:
        sys.exit('no XI 2.2')

    class XIEventMask(ctypes.Structure):
        _fields_ = [('deviceid', ctypes.c_int), ('mask_len', ctypes.c_int), ('mask', ctypes.POINTER(ctypes.c_ubyte))]
    bits = (ctypes.c_ubyte * 4)(1 << 6, 0, 0, 0)  # XI_Motion = 6
    m = XIEventMask(1, 4, ctypes.cast(bits, ctypes.POINTER(ctypes.c_ubyte)))  # XIAllMasterDevices = 1
    XI.XISelectEvents.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(XIEventMask), ctypes.c_int]
    XI.XISelectEvents(dpy, win, ctypes.byref(m), 1)
X.XMapRaised(dpy, win)
ev = ctypes.create_string_buffer(192)
while True:  # wait for the window to map
    X.XNextEvent(dpy, ev)
    if ctypes.c_int.from_buffer(ev, 0).value == MAP_NOTIFY:
        break
# the pointer put inside the window once (setup, not XTEST)
X.XWarpPointer(dpy, 0, root, 0, 0, 0, 0, 200, 200)
X.XSync(dpy, 0)
time.sleep(0.2)


def drain():
    X.XSync(dpy, 0)
    while X.XPending(dpy):
        X.XNextEvent(dpy, ev)


GENERIC_EVENT = 35


def count(ms=200):
    """The MotionNotify events in `ms` (core), or with `xi2` the XI_Motion GenericEvents; the core events' points."""
    n, core, points = 0, 0, []
    end = time.monotonic() + ms / 1000
    while time.monotonic() < end:
        while X.XPending(dpy):
            X.XNextEvent(dpy, ev)
            kind = ctypes.c_int.from_buffer(ev, 0).value
            if kind == MOTION_NOTIFY:
                core += 1
                points.append((ctypes.c_int.from_buffer(ev, 72).value, ctypes.c_int.from_buffer(ev, 76).value))
            # XGenericEventCookie: extension at 32, evtype at 36 (64-bit)
            elif XI2 and kind == GENERIC_EVENT and ctypes.c_int.from_buffer(ev, 32).value == xi_opcode and ctypes.c_int.from_buffer(ev, 36).value == 6:
                n += 1
        time.sleep(0.001)
    if XI2:
        points = [('core', core)] + points
        return n, points
    return core, points


def pointer():
    r, ch = ctypes.c_ulong(), ctypes.c_ulong()
    rx, ry, wx, wy = (ctypes.c_int() for _ in range(4))
    m = ctypes.c_uint()
    X.XQueryPointer(dpy, root, ctypes.byref(r), ctypes.byref(ch), ctypes.byref(rx), ctypes.byref(ry), ctypes.byref(wx), ctypes.byref(wy), ctypes.byref(m))
    return rx.value, ry.value


def motion(x, y):
    XT.XTestFakeMotionEvent(dpy, -1, x, y, 0)
    X.XFlush(dpy)


trials = int(sys.argv[1]) if len(sys.argv) > 1 else 10
rows = []
for t in range(trials):
    drain()
    x, y = pointer()
    motion(x, y)
    same, same_pts = count()
    motion(x + 1, y)
    away, _ = count()
    motion(x, y)
    back, _ = count()
    row = {'trial': t, 'pointer': [x, y], 'same_place_motion_notify': same, 'same_place_points': same_pts, 'control_away': away, 'control_back': back, 'pointer_after': list(pointer())}
    rows.append(row)
    print(json.dumps(row))
summary = {'counted': 'XI_Motion (XI2, XISelectEvents on the window)' if XI2 else 'core MotionNotify', 'server_vendor': X.XServerVendor(dpy).decode(),'vendor_release': X.XVendorRelease(dpy), 'xtest': xtest, 'trials': trials,
           'same_place_counts': [r['same_place_motion_notify'] for r in rows], 'control_away_counts': [r['control_away'] for r in rows], 'control_back_counts': [r['control_back'] for r in rows]}
print(json.dumps(summary))
