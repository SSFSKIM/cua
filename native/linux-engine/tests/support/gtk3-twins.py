#!/usr/bin/env python3
"""The engine's identity fixture (#171 M4's T5): one GTK 3 process showing `count` top-level windows with one title and
one size at one place, so neither X11 nor an AT-SPI frame's extents tell them apart. Window n holds an entry whose text
`twin-n` is selected and has the focus, a second entry `other-n`, and a button `press-n`; the process owns CLIPBOARD,
holding `before`. It prints, one JSON line each, flushed at once: `{"marker": n, "xid": id}` once window n is mapped,
`{"active": n, "is": bool}` when its active state changes, `{"configured": n, "x": x, "y": y}` when it is placed,
`{"focus": "other", "window": n}` when its second entry takes the focus, and `{"pressed": n}` when its button is
pressed, so the test reads what each window did. Killed by the test.

usage: gtk3-twins.py <title> <count> <width> <height>
"""

import json
import sys

import gi

gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
gi.require_version('GdkX11', '3.0')
from gi.repository import Gdk, GdkX11, Gtk  # noqa: E402, F401  (GdkX11 gives the windows their X11 type)

title, count = sys.argv[1], int(sys.argv[2])
width, height = int(sys.argv[3]), int(sys.argv[4])


def say(record):
    print(json.dumps(record), flush=True)


for n in range(1, count + 1):
    window = Gtk.Window(title=title)
    window.set_default_size(width, height)
    window.move(0, 0)
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
    entry = Gtk.Entry(text=f'twin-{n}')
    other = Gtk.Entry(text=f'other-{n}')
    other.connect('focus-in-event', lambda _w, _e, n=n: say({'focus': 'other', 'window': n}) or False)
    button = Gtk.Button(label=f'press-{n}')
    button.connect('clicked', lambda _b, n=n: say({'pressed': n}))
    for widget in (entry, other, button):
        box.pack_start(widget, False, False, 0)
    window.add(box)
    window.connect('map-event', lambda w, _e, n=n: say({'marker': n, 'xid': w.get_window().get_xid()}) or False)
    window.connect('notify::is-active', lambda w, _p, n=n: say({'active': n, 'is': w.is_active()}))
    window.connect('configure-event', lambda _w, e, n=n: say({'configured': n, 'x': e.x, 'y': e.y}) or False)
    window.show_all()
    entry.grab_focus()
    entry.select_region(0, -1)
Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD).set_text('before', -1)
Gtk.main()
