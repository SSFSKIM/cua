#!/usr/bin/env python3
"""Probe (task 61 fix, P1 1): where in a Qt application's window does a background press land on a native child X
window? The engine's background press goes to the deepest viewable child under the point (`input.rs`
`Session::move_to`'s descent: children topmost first, the first viewable one containing the point). Over a grid of
points across the client window this counts the points whose recipient is not the client window itself, and lists the
native children (size and depth only: no title, text or pixels of the window are read).

usage: native-children.py <window id> [grid columns] [grid rows]   (prints one JSON line)"""
import ctypes
import ctypes.util
import json
import sys

X = ctypes.cdll.LoadLibrary(ctypes.util.find_library('X11'))
Window = ctypes.c_ulong


class Attributes(ctypes.Structure):
    _fields_ = [('x', ctypes.c_int), ('y', ctypes.c_int), ('width', ctypes.c_int), ('height', ctypes.c_int),
                ('border_width', ctypes.c_int), ('depth', ctypes.c_int), ('visual', ctypes.c_void_p),
                ('root', Window), ('class', ctypes.c_int), ('bit_gravity', ctypes.c_int),
                ('win_gravity', ctypes.c_int), ('backing_store', ctypes.c_int), ('backing_planes', ctypes.c_ulong),
                ('backing_pixel', ctypes.c_ulong), ('save_under', ctypes.c_int), ('colormap', ctypes.c_ulong),
                ('map_installed', ctypes.c_int), ('map_state', ctypes.c_int), ('all_event_masks', ctypes.c_long),
                ('your_event_mask', ctypes.c_long), ('do_not_propagate_mask', ctypes.c_long),
                ('override_redirect', ctypes.c_int), ('screen', ctypes.c_void_p)]


X.XOpenDisplay.restype = ctypes.c_void_p
X.XDefaultRootWindow.restype = Window
X.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
X.XQueryTree.argtypes = [ctypes.c_void_p, Window, ctypes.POINTER(Window), ctypes.POINTER(Window),
                         ctypes.POINTER(ctypes.POINTER(Window)), ctypes.POINTER(ctypes.c_uint)]
X.XGetWindowAttributes.argtypes = [ctypes.c_void_p, Window, ctypes.POINTER(Attributes)]
X.XTranslateCoordinates.argtypes = [ctypes.c_void_p, Window, Window, ctypes.c_int, ctypes.c_int,
                                    ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(Window)]
X.XFree.argtypes = [ctypes.c_void_p]
VIEWABLE = 2

display = X.XOpenDisplay(None)
root = X.XDefaultRootWindow(display)
target = int(sys.argv[1], 0)
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 40
rows = int(sys.argv[3]) if len(sys.argv) > 3 else 30


def children(w):
    r, p, kids, n = Window(), Window(), ctypes.POINTER(Window)(), ctypes.c_uint()
    if not X.XQueryTree(display, w, ctypes.byref(r), ctypes.byref(p), ctypes.byref(kids), ctypes.byref(n)):
        return []
    out = [kids[i] for i in range(n.value)]
    if n.value:
        X.XFree(kids)
    return out


def attributes(w):
    a = Attributes()
    return a if X.XGetWindowAttributes(display, w, ctypes.byref(a)) else None


def local(w, rx, ry):
    lx, ly, child = ctypes.c_int(), ctypes.c_int(), Window()
    X.XTranslateCoordinates(display, root, w, rx, ry, ctypes.byref(lx), ctypes.byref(ly), ctypes.byref(child))
    return lx.value, ly.value


def recipient(rx, ry):
    """The engine's descent (Session::move_to): the deepest viewable child containing the point, topmost first."""
    w, depth = target, 0
    for _ in range(100):
        found = None
        for child in reversed(children(w)):
            a = attributes(child)
            if not a or a.map_state != VIEWABLE:
                continue
            lx, ly = local(child, rx, ry)
            if 0 <= lx < a.width and 0 <= ly < a.height:
                found = child
                break
        if found is None:
            return w, depth
        w, depth = found, depth + 1
    return w, depth


def descendants(w, depth=1):
    for child in children(w):
        a = attributes(child)
        if a:
            yield {'depth': depth, 'width': a.width, 'height': a.height, 'viewable': a.map_state == VIEWABLE,
                   'input_only': getattr(a, 'class') == 2}
            yield from descendants(child, depth + 1)


a = attributes(target)
ox, oy = local(target, 0, 0)
ox, oy = -ox, -oy
hits, total = 0, 0
for i in range(cols):
    for j in range(rows):
        rx = ox + int((i + 0.5) * a.width / cols)
        ry = oy + int((j + 0.5) * a.height / rows)
        w, _ = recipient(rx, ry)
        total += 1
        hits += w != target
print(json.dumps({'window': target, 'size': [a.width, a.height], 'points': total, 'on_native_child': hits,
                  'share': round(hits / total, 4), 'descendants': list(descendants(target))}))
