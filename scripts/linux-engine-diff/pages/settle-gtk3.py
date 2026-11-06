"""The settle experiment's GTK 3 scene (#171 M4, T8; action-settle.mjs): one window, titled by its argument, holding a
button whose label counts its presses and a pad whose label counts the pointer moves and wheel steps it receives, so a
click's, an element action's, a move's and a scroll's effect each read back as an accessible name in the window's
tree. Run as `python3 -I settle-gtk3.py <title>`; it needs GTK 3's introspection data (gir1.2-gtk-3.0)."""

import sys

import gi

gi.require_version('Gdk', '3.0')
gi.require_version('Gtk', '3.0')
from gi.repository import Gdk, Gtk  # noqa: E402

counts = {'presses': 0, 'moves': 0, 'scrolls': 0}


def show():
    button.set_label(f"presses {counts['presses']}")
    status.set_text(f"moves {counts['moves']} scrolls {counts['scrolls']}")


def pressed(_button):
    counts['presses'] += 1
    show()


def moved(_widget, _event):
    counts['moves'] += 1
    show()
    return False


def scrolled(_widget, event):
    # a wheel step is one discrete scroll event (smooth scrolling is never asked for, so none come as deltas)
    if event.direction in (Gdk.ScrollDirection.UP, Gdk.ScrollDirection.DOWN, Gdk.ScrollDirection.LEFT, Gdk.ScrollDirection.RIGHT):
        counts['scrolls'] += 1
        show()
    return True


window = Gtk.Window(title=sys.argv[1])
window.set_default_size(600, 400)
box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
button = Gtk.Button(label='presses 0')
button.connect('clicked', pressed)
button.set_size_request(600, 80)
pad = Gtk.EventBox()
pad.set_size_request(600, 260)
pad.add_events(Gdk.EventMask.POINTER_MOTION_MASK | Gdk.EventMask.SCROLL_MASK)
pad.connect('motion-notify-event', moved)
pad.connect('scroll-event', scrolled)
status = Gtk.Label(label='moves 0 scrolls 0')
pad.add(status)
box.pack_start(button, False, False, 0)
box.pack_start(pad, True, True, 0)
window.add(box)
window.connect('destroy', Gtk.main_quit)
window.show_all()
Gtk.main()
