#!/usr/bin/env python3
"""A GTK 3 window with one horizontal scale, 0-100 in whole steps (role `slider`, its value through AT-SPI Value).

The drag experiment's GTK slider scene (family `gtk-scale`, families.mjs; #171 M1a.4). The scale fills the window's
width less a margin of 20 pixels on each side, at a fixed place, and draws no value label, so nothing moves under it.

usage: gtk-scale.py <title>
"""
import sys

import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gtk  # noqa: E402

title = sys.argv[1]
scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 100, 1)
scale.set_draw_value(False)
scale.set_value(0)
scale.set_margin_start(20)
scale.set_margin_end(20)
scale.set_margin_top(40)
scale.set_valign(Gtk.Align.START)
win = Gtk.Window(title=title)
win.set_default_size(600, 300)
win.add(scale)
win.connect("destroy", Gtk.main_quit)
win.show_all()
Gtk.main()
