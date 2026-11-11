#!/usr/bin/env python3
"""LibreOffice's AT-SPI shape on its gtk3 plugin, staged in GTK 3 (#171 M4, T16's fix wave; engine `vcl.rs`). One window
whose `WM_CLASS` is `libreoffice-writer` holds a client panel at the window's origin, a 27 px strip where LibreOffice
has its native menu bar, and below it the host panel, which holds the root pane at a chosen offset from the host:
`stale` puts it at the client's origin with the host's size, where LibreOffice reports it after a ConfigureNotify and
until the next pointer event; `agree` at the host's own place, as after a pointer event; `odd` 10 px above the host, a
shape LibreOffice never shows. GTK reports each widget's allocation, so the root pane's AT-SPI extents are where it is
put here.

It prints, one JSON line each, flushed at once: `{"marker": 1, "xid": id, "host": rect, "root_pane": rect}` once the
window is mapped (each rect `[x, y, width, height]` in root coordinates, as GTK allocated it), `{"button": b,
"x": x, "y": y, "type": t, "send_event": s}` for each mouse button press (twice for one press, a real XTEST click's
too) and `{"scroll": direction, "x": x, "y": y}` for each wheel step, in root coordinates. Killed by the test.

usage: vcl-shape.py <title> <stale|agree|odd>
"""

import json
import sys

import gi

gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
gi.require_version('GdkX11', '3.0')
gi.require_version('Atk', '1.0')
from gi.repository import Atk, Gdk, GdkX11, Gtk  # noqa: E402, F401  (GdkX11 gives the window its X11 type)

title, shape = sys.argv[1], sys.argv[2]
MENU_BAR = 27
WIDTH, HOST_HEIGHT = 400, 300
ROOT_Y = {'stale': -MENU_BAR, 'agree': 0, 'odd': -10}[shape]


def say(record):
    print(json.dumps(record), flush=True)


def role(widget, atk_role):
    widget.get_accessible().set_role(atk_role)
    return widget


# before any window: the class LibreOffice's windows carry, which the engine tells LibreOffice by
Gdk.set_program_class('libreoffice-writer')
window = Gtk.Window(title=title)
window.set_default_size(WIDTH, MENU_BAR + HOST_HEIGHT)
window.set_resizable(False)
client = role(Gtk.Box(orientation=Gtk.Orientation.VERTICAL), Atk.Role.PANEL)
strip = Gtk.DrawingArea()
strip.set_size_request(WIDTH, MENU_BAR)
host = role(Gtk.Fixed(), Atk.Role.PANEL)
host.set_size_request(WIDTH, HOST_HEIGHT)
root_pane = role(Gtk.DrawingArea(), Atk.Role.ROOT_PANE)
root_pane.set_size_request(WIDTH, HOST_HEIGHT)
host.put(root_pane, 0, ROOT_Y)
client.pack_start(strip, False, False, 0)
client.pack_start(host, True, True, 0)
window.add(client)
window.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.SCROLL_MASK)

DIRECTIONS = {Gdk.ScrollDirection.UP: 'up', Gdk.ScrollDirection.DOWN: 'down', Gdk.ScrollDirection.LEFT: 'left', Gdk.ScrollDirection.RIGHT: 'right'}


def pressed(_w, event):
    say({'button': event.button, 'x': round(event.x_root), 'y': round(event.y_root), 'type': event.type.value_nick, 'send_event': bool(event.send_event)})
    return False


def scrolled(_w, event):
    say({'scroll': DIRECTIONS.get(event.direction, 'smooth'), 'x': round(event.x_root), 'y': round(event.y_root)})
    return False


def rect(widget):
    """A widget's allocation in root coordinates: [x, y, width, height]."""
    origin = window.get_window().get_origin()
    x, y = widget.translate_coordinates(window, 0, 0)
    allocation = widget.get_allocation()
    return [origin.x + x, origin.y + y, allocation.width, allocation.height]


def mapped(_w, _event):
    say({'marker': 1, 'xid': window.get_window().get_xid(), 'host': rect(host), 'root_pane': rect(root_pane)})
    return False


window.connect('button-press-event', pressed)
window.connect('scroll-event', scrolled)
window.connect('map-event', mapped)
window.connect('destroy', Gtk.main_quit)
window.show_all()
Gtk.main()
