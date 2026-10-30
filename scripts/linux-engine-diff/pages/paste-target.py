#!/usr/bin/env python3
"""A GTK 3 window whose paste the harness controls: the requestor side of M2's paste safety cases (#171, Plan of Work,
M2, Decisions; the cases in safety.mjs).

The window holds one focused widget. A paste chord (Ctrl+V) reaches it as GTK's own paste would, but what happens next
is the mode's, and every conversion is made on the application's own X connection with one of its own windows as the
requestor, so the engine attributes it to the paste's target (Decision Log, M2.1):

- `stall-incr`: a text view. Ctrl+V asks CLIPBOARD for `UTF8_STRING` at once (GDK's own conversion, the top-level's
  window the requestor) and never reads or deletes the answer's property: when the answer is an INCR transfer, no
  chunk is ever acknowledged. A requestor that stalls INCR.
- `late-convert:<ms>`: a text view. Ctrl+V asks CLIPBOARD `<ms>` later (GTK's selection conversion), with the Ctrl+V's
  own timestamp: a requestor that delays its ConvertSelection.
- `late-convert-current:<ms>`: the same, with `CurrentTime`.
- `unreadable`: a focusable drawing area (no AT-SPI Text interface, so no engine can read what it holds). Ctrl+V pastes
  through GTK's clipboard, and what it received is kept and reported: a field whose Text cannot be read.

Neither text view inserts anything. It prints one JSON line per event on stdout: `{"ready": …}`, `{"paste": …}` (the
chord arrived), `{"convert": …}` (the request went out), `{"received": …}` (the late conversion's answer: `refused`, or
`served` with the text), `{"notify": …}` (stall-incr: the owner answered) and `{"pasted": …}` (unreadable: the text
received).

usage: paste-target.py <title> <mode>
"""
import json
import sys

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
from gi.repository import Gdk, GLib, Gtk  # noqa: E402

title, mode = sys.argv[1], sys.argv[2]
kind, _, delay = mode.partition(":")
CLIPBOARD = Gdk.Atom.intern("CLIPBOARD", False)
UTF8 = Gdk.Atom.intern("UTF8_STRING", False)
pasted = []


def say(**fields):
    print(json.dumps(fields, ensure_ascii=False), flush=True)


win = Gtk.Window(title=title)
win.set_default_size(600, 400)
win.connect("destroy", Gtk.main_quit)
box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
win.add(box)
status = Gtk.Label(label="pasted 0")
box.pack_start(status, False, False, 4)

if kind in ("stall-incr", "late-convert", "late-convert-current"):
    view = Gtk.TextView()
    view.get_buffer().set_text("cua171 paste target\n")
    box.pack_start(view, True, True, 0)
    focus = view

    def late(time):
        Gtk.selection_convert(view, CLIPBOARD, UTF8, time)
        say(convert=True, time=time)
        return False

    def on_received(widget, data, time):
        if data.get_length() < 0:
            say(received="refused", time=time)
        else:
            say(received="served", time=time, text=bytes(data.get_data()).decode("utf-8", "replace"))

    def on_notify(widget, event):
        # stall-incr: the answer's property is left as it is; deleting it would acknowledge the transfer's next chunk
        if event.selection == CLIPBOARD:
            say(notify="refused" if event.property is None else "answered", time=event.time)
        return True

    def on_paste(widget):
        widget.stop_emission_by_name("paste-clipboard")
        time = Gtk.get_current_event_time()
        say(paste=True, time=time)
        if kind == "stall-incr":
            Gdk.selection_convert(win.get_window(), CLIPBOARD, UTF8, time)
            say(convert=True, time=time)
        else:
            GLib.timeout_add(int(delay), late, time if kind == "late-convert" else Gdk.CURRENT_TIME)

    view.connect("paste-clipboard", on_paste)
    view.connect("selection-received", on_received)
    if kind == "stall-incr":
        win.connect("selection-notify-event", on_notify)
elif kind == "unreadable":
    area = Gtk.DrawingArea()
    area.set_can_focus(True)
    area.set_size_request(400, 300)
    box.pack_start(area, True, True, 0)
    focus = area

    def received(clipboard, text):
        pasted.append(text)
        status.set_text(f"pasted {len(pasted)}")
        say(pasted=text)

    def on_key(widget, event):
        ctrl = event.state & Gdk.ModifierType.CONTROL_MASK
        if ctrl and Gdk.keyval_to_lower(event.keyval) == Gdk.KEY_v:
            say(paste=True, time=event.time)
            Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD).request_text(received)
            return True
        return False

    area.connect("key-press-event", on_key)
else:
    sys.exit(f"unknown mode {mode}")

win.show_all()
focus.grab_focus()
say(ready=True, mode=mode)
Gtk.main()
