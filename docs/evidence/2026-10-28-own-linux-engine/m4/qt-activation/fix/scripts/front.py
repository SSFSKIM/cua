#!/usr/bin/env python3
"""The probes' front window: a plain GTK 3 window, standing for the person's. Prints {"xid": id} once shown."""
import json

import gi

gi.require_version('Gtk', '3.0')
from gi.repository import GLib, Gtk  # noqa: E402

win = Gtk.Window(title='cua171-probe-front')
win.set_default_size(300, 200)
win.move(900, 500)
win.show_all()
GLib.timeout_add(300, lambda: print(json.dumps({'xid': win.get_window().get_xid()}), flush=True) and False)
GLib.MainLoop().run()
