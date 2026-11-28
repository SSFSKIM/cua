#!/usr/bin/env python3
"""A GTK 3 window with nothing in it, so its frame reads bare: a frame of another toolkit than Chromium's for the
rule's live test 7 (`rule.py`).

usage: bare-gtk3.py <title>
"""
import sys

import gi

gi.require_version('Gtk', '3.0')
from gi.repository import Gtk  # noqa: E402

window = Gtk.Window(title=sys.argv[1])
window.set_default_size(420, 300)
window.connect('destroy', Gtk.main_quit)
window.show_all()
Gtk.main()
