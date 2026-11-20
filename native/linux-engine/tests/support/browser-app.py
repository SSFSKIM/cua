#!/usr/bin/env python3
"""The browser identity fixture (#171 M5, ruling 899): a GTK 3 process whose accessible application on the AT-SPI bus is
named `name`, as Chrome's is named "Google Chrome", with no window of its own. A test's fake drag source names this
process in its `_NET_WM_PID`, so the engine's identification (src/browser.rs) asks the bus about it; run as a copy of
the Python interpreter named `chrome`, `/proc/<pid>/exe` reads as a browser's executable too.

It prints `{"pid": pid, "ready": true}` once its application is on the bus, flushed at once. Killed by the test.

usage: browser-app.py <name>
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
# the bridge registers the application as the main loop starts: told once it has run a while
GLib.timeout_add(300, lambda: print(json.dumps({'pid': os.getpid(), 'ready': True}), flush=True) and False)
Gtk.main()
