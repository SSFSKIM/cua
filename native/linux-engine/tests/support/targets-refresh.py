#!/usr/bin/env python3
"""A paste target that keeps CLIPBOARD's targets, as gnome-terminal does (task 56, fix 3): at every owner change it
forgets the targets it kept and asks for the new owner's (`TARGETS`), `delay` ms later (`never`: it never asks), and
it takes a paste chord (Ctrl+V or Ctrl+Shift+V) only when the targets it keeps include text, inserting CLIPBOARD's text
at its entry's caret; a chord that comes before them is dropped. Its program name (`prgname`) is its X11 class's, which
decides the engine's family (`Gnome-terminal` is VTE's).

One window titled `title`, an entry `start` with the focus and its caret at the end, and a second entry `other`.

It prints, one JSON line each, flushed at once: `{"marker": 1, "xid": id}` once the window is mapped, `{"owner_change":
true}` at each owner change, `{"targets": n, "text": bool}` when the new owner's targets arrive, `{"chord": true,
"kept": bool}` for each paste chord (whether it found text among the targets it keeps), `{"pasted": text}` once the
chord's text is inserted, and `{"focus": "other"}` when the second entry takes the focus.

It reads commands on stdin, one a line: `focus other` moves the focus to the second entry. Killed by the test.

usage: targets-refresh.py <title> <prgname> <delay ms | never>
"""

import json
import sys

from gi.repository import GLib

title, prgname, delay = sys.argv[1], sys.argv[2], sys.argv[3]
GLib.set_prgname(prgname)

import gi  # noqa: E402

gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
gi.require_version('GdkX11', '3.0')
from gi.repository import Gdk, GdkX11, Gtk  # noqa: E402, F401  (GdkX11 gives the window its X11 type)


def say(record):
    print(json.dumps(record), flush=True)


clipboard = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD)
kept = {'text': False}


def received(_clipboard, atoms, n):
    kept['text'] = bool(atoms) and Gtk.targets_include_text(atoms)
    say({'targets': n if atoms else 0, 'text': kept['text']})


def ask():
    clipboard.request_targets(received)
    return False


def owner_changed(_clipboard, _event):
    kept['text'] = False
    say({'owner_change': True})
    if delay != 'never':
        GLib.timeout_add(int(delay), ask)


def insert(_clipboard, text):
    if text is None:
        return
    at = entry.get_position()
    entry.insert_text(text, at)
    entry.set_position(at + len(text))
    say({'pasted': text})


def key(_window, event):
    ctrl = event.state & Gdk.ModifierType.CONTROL_MASK
    if not (ctrl and event.keyval in (Gdk.KEY_v, Gdk.KEY_V)):
        return False
    say({'chord': True, 'kept': kept['text']})
    if kept['text']:
        clipboard.request_text(insert)
    return True


def command(source, _condition):
    line = source.readline()
    if not line:
        return False
    if line.split() == ['focus', 'other']:
        other.grab_focus()
    return True


window = Gtk.Window(title=title)
window.set_default_size(400, 200)
window.move(0, 0)
box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
entry = Gtk.Entry(text='start')
other = Gtk.Entry(text='other')
other.connect('focus-in-event', lambda _w, _e: say({'focus': 'other'}) or False)
box.pack_start(entry, False, False, 0)
box.pack_start(other, False, False, 0)
window.add(box)
window.connect('key-press-event', key)
window.connect('map-event', lambda w, _e: say({'marker': 1, 'xid': w.get_window().get_xid()}) or False)
clipboard.connect('owner-change', owner_changed)
window.show_all()
entry.grab_focus()
entry.set_position(-1)
GLib.io_add_watch(sys.stdin, GLib.IO_IN | GLib.IO_HUP, command)
Gtk.main()
