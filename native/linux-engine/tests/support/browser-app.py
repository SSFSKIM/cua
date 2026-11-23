#!/usr/bin/env python3
"""The browser identity fixture (#171 M5, ruling 899): a GTK 3 process whose accessible application on the AT-SPI bus is
named `name`, as Chrome's is named "Google Chrome", with no window of its own. A test's fake drag source names this
process in its `_NET_WM_PID`, so the engine's identification (src/browser.rs) asks the bus about it; run as a copy of
the Python interpreter named `chrome`, `/proc/<pid>/exe` reads as a browser's executable too.

It prints `{"pid": pid, "ready": true}` once its application is on the bus, flushed at once. Killed by the test. With
`--window <class> <role>` it also shows a window of that `WM_CLASS` class and `WM_WINDOW_ROLE` (a stub of Chrome's
marks under another application's name, task 117's identification check), and prints its X id as `xid`.

usage: browser-app.py <name> [--window <class> <role>]
"""

import json
import os
import sys

import gi

gi.require_version('Gtk', '3.0')
from gi.repository import GLib, Gtk  # noqa: E402

GLib.set_prgname(sys.argv[1])
GLib.set_application_name(sys.argv[1])
Gtk.init([])
xid = None
if len(sys.argv) > 4 and sys.argv[2] == '--window':
    gi.require_version('GdkX11', '3.0')
    from gi.repository import GdkX11  # noqa: E402, F401  (the window's X11 type)
    window = Gtk.Window(title=f'{sys.argv[1]} stub')
    window.set_wmclass(sys.argv[3].lower(), sys.argv[3])
    window.set_role(sys.argv[4])
    window.set_default_size(400, 300)
    window.show_all()
    xid = window.get_window().get_xid()
# the bridge registers the application as the main loop starts: told once it has run a while
GLib.timeout_add(300, lambda: print(json.dumps({'pid': os.getpid(), 'ready': True, 'xid': xid}), flush=True) and False)
Gtk.main()
