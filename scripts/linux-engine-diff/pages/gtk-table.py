#!/usr/bin/env python3
"""A GTK 3 window with a list-only TreeView over many rows (role `table` with more than 5,000 children).

The differential harness's large-table scene (scene `gtk-table`, families.mjs), from M1a.1's fixture.

usage: gtk-table.py <title> <rows> [--headers] [--scroll <row>] [--cols <n>]
"""
import sys

import gi

gi.require_version("Gtk", "3.0")
from gi.repository import GLib, Gtk  # noqa: E402

title = sys.argv[1]
rows = int(sys.argv[2])
headers = "--headers" in sys.argv
scroll = int(sys.argv[sys.argv.index("--scroll") + 1]) if "--scroll" in sys.argv else 0
cols = int(sys.argv[sys.argv.index("--cols") + 1]) if "--cols" in sys.argv else 2

store = Gtk.ListStore(*([str] * cols))
for r in range(rows):
    store.append([f"r{r}c{c}" for c in range(cols)])
view = Gtk.TreeView(model=store)
view.set_headers_visible(headers)
for c in range(cols):
    view.append_column(Gtk.TreeViewColumn(f"col{c}", Gtk.CellRendererText(), text=c))
sw = Gtk.ScrolledWindow()
sw.add(view)
win = Gtk.Window(title=title)
win.set_default_size(500, 400)
win.add(sw)
win.connect("destroy", Gtk.main_quit)
win.show_all()
if scroll:
    GLib.idle_add(lambda: view.scroll_to_cell(Gtk.TreePath(scroll), None, True, 0.0, 0.0) and False)
Gtk.main()
