#!/usr/bin/env python3
"""The harness's GTK 4 input scene (#171 M3.1): one window whose status line counts what its input did, so the effect
of a scroll, a drag, a pointer move, a click and a key reads back as an accessible name.

From the top, at fixed window-relative places (families.mjs `places`; GTK 4.14's accessible extents are not window
coordinates, so the harness aims by these): a horizontal scale 0-100 drawing no value (the drag target), a button
counting its clicks, the status line (a label, `scroll <px> scale <value> moves <n> presses <n> keys <n> rights <n>`),
and a scrolled list of 300 lines (the scroll target). The window counts pointer motions, key presses and button-3
presses over all of it.

usage: gtk4-input.py <title>
"""

import sys

import gi

gi.require_version('Gtk', '4.0')
from gi.repository import GLib, Gtk  # noqa: E402

counts = {'moves': 0, 'presses': 0, 'keys': 0, 'rights': 0}

window = Gtk.Window(title=sys.argv[1])
window.set_default_size(600, 400)
box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
status = Gtk.Label(label='')
status.set_xalign(0)
status.set_margin_start(12)
status.set_size_request(-1, 30)
# window-relative: the scale's band y 10-70 across x 20-580, the button's y 78-128 (the box's spacing 8)
scale = Gtk.Scale.new_with_range(Gtk.Orientation.HORIZONTAL, 0, 100, 1)
scale.set_draw_value(False)
scale.set_value(0)
scale.set_margin_start(20)
scale.set_margin_end(20)
scale.set_margin_top(10)
scale.set_size_request(-1, 60)
button = Gtk.Button(label='press')
button.set_margin_start(20)
button.set_margin_end(20)
button.set_size_request(-1, 50)
lines = Gtk.Label(label='\n'.join(f'line {n} of the cua171 GTK 4 input scene' for n in range(1, 301)))
lines.set_xalign(0)
lines.set_margin_start(12)
scrolled = Gtk.ScrolledWindow()
scrolled.set_child(lines)
scrolled.set_vexpand(True)
adjustment = scrolled.get_vadjustment()


def show(*_args):
    status.set_label(
        f"scroll {round(adjustment.get_value())} scale {round(scale.get_value())} "
        f"moves {counts['moves']} presses {counts['presses']} keys {counts['keys']} rights {counts['rights']}"
    )


def count(name):
    def bump(*_args):
        counts[name] += 1
        show()
        return False

    return bump


adjustment.connect('value-changed', show)
scale.connect('value-changed', show)
button.connect('clicked', count('presses'))
motion = Gtk.EventControllerMotion()
motion.connect('motion', count('moves'))
window.add_controller(motion)
rights = Gtk.GestureClick()
rights.set_button(3)
rights.connect('pressed', count('rights'))
window.add_controller(rights)
keys = Gtk.EventControllerKey()
keys.connect('key-pressed', count('keys'))
window.add_controller(keys)
for child in (scale, button, status, scrolled):
    box.append(child)
window.set_child(box)
show()
loop = GLib.MainLoop()
window.connect('close-request', lambda _w: loop.quit() or False)
window.present()
loop.run()
