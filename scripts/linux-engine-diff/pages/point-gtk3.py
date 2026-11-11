"""T16's GTK 3 point scene (#171 M4; writer-drag.mjs `--plan element`): one plain window, titled by its argument, which
the window manager decorates (no header bar, so it has a WM frame as LibreOffice's has), holding one button 300x80
at (150, 120) in the window. Every press of any button on it is written into the button's label, `press <button> at
<x> <y>` in the button's own coordinates, so where a press landed reads back as an accessible name. Run as
`python3 -I point-gtk3.py <title>`."""

import sys

import gi

gi.require_version('Gdk', '3.0')
gi.require_version('Gtk', '3.0')
from gi.repository import Gdk, Gtk  # noqa: E402


def pressed(widget, event):
    widget.set_label(f'press {event.button} at {int(event.x)} {int(event.y)}')
    return True


window = Gtk.Window(title=sys.argv[1])
window.set_default_size(600, 400)
fixed = Gtk.Fixed()
button = Gtk.Button(label='press none')
button.set_size_request(300, 80)
button.add_events(Gdk.EventMask.BUTTON_PRESS_MASK)
button.connect('button-press-event', pressed)
fixed.put(button, 150, 120)
window.add(fixed)
window.connect('destroy', Gtk.main_quit)
window.show_all()
Gtk.main()
