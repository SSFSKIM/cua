#!/usr/bin/env python3
"""Probe fixture (task 61 fix, ruling A): a GTK 3 or GTK 4 main window blocked by a modal dialog of its own (transient
for it, modal), as qt-modal.py is for Qt. Prints `{"main": xid, "dialog": xid}` once both are shown. The main window
holds a text view and a button named "probe" (for GTK 4, whose only background input in shared mode is an element
action).
usage: gtk-modal.py <title> gtk3|gtk4"""
import json
import sys

title, binding = sys.argv[1], sys.argv[2]
import gi

if binding == 'gtk3':
    gi.require_version('Gtk', '3.0')
    gi.require_version('GdkX11', '3.0')
else:
    gi.require_version('Gtk', '4.0')
    gi.require_version('GdkX11', '4.0')
from gi.repository import GdkX11, GLib, Gtk  # noqa: E402


def say(record):
    print(json.dumps(record), flush=True)


def xid(window):
    if binding == 'gtk3':
        return window.get_window().get_xid()
    return GdkX11.X11Surface.get_xid(window.get_surface())


if binding == 'gtk3':
    win = Gtk.Window(title=title)
    win.set_default_size(400, 200)
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
    box.pack_start(Gtk.TextView(), True, True, 0)
    box.pack_start(Gtk.Button(label='probe'), False, False, 0)
    win.add(box)
    win.show_all()
    dialog = Gtk.Dialog(title=title + ' dialog', transient_for=win, modal=True)
    dialog.set_default_size(200, 100)
else:
    win = Gtk.Window(title=title)
    win.set_default_size(400, 200)
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
    view = Gtk.TextView()
    view.set_vexpand(True)
    box.append(view)
    box.append(Gtk.Button(label='probe'))
    win.set_child(box)
    win.present()
    dialog = Gtk.Window(title=title + ' dialog', transient_for=win, modal=True)
    dialog.set_default_size(200, 100)
    dialog.set_child(Gtk.Label(label='modal'))


def shown():
    if binding == 'gtk3':
        dialog.show_all()
    else:
        dialog.present()
    GLib.timeout_add(500, lambda: say({'main': xid(win), 'dialog': xid(dialog)}) and False)
    return False


GLib.timeout_add(300, shown)
GLib.MainLoop().run()
