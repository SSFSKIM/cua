"""The harness's GTK 4 scene (M0.4): one window, titled by its argument, holding one button whose label counts its
presses, so a click's effect reads back as the button's accessible name. Run as `python3 -I gtk4-button.py <title>`;
it needs GTK 4's introspection data (gir1.2-gtk-4.0)."""

import sys

import gi

gi.require_version('Gtk', '4.0')
from gi.repository import GLib, Gtk  # noqa: E402

presses = 0


def pressed(button):
    global presses
    presses += 1
    button.set_label(f'presses {presses}')


window = Gtk.Window(title=sys.argv[1])
window.set_default_size(600, 400)
button = Gtk.Button(label='presses 0')
button.connect('clicked', pressed)
window.set_child(button)
loop = GLib.MainLoop()
window.connect('close-request', lambda _w: loop.quit() or False)
window.present()
loop.run()
