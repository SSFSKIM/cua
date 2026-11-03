#!/usr/bin/env python3
"""The AT-SPI probe's GTK 4 scene (#171 M4, T6; atspi-probe.mjs): one window whose accessible tree holds what the
probe asks `Cache.GetItems` about, and whose text widgets record what reaches them.

Modes:
- `menus`: a menu bar (File, Edit) from a menu model, and a menu button whose popover menu the scene opens itself a
  second after it is shown, so the probe reads an open menu without sending any input.
- `changing`: a status label and a box of rows that change every 250 ms from five seconds after the window is shown
  (a row added up to four, then the first one removed, and the label renamed), each change recorded with its time, so the probe can tell a read that straddles a
  change from one that does not.
- `text-view` and `entry`: a text view and an entry, each holding a line of text outside its undo history, the named
  one holding the focus, each recording the signals its edits raise (the text buffer's `insert-text`, `changed`,
  user-action brackets and `can-undo`; the entry buffer's `inserted-text` and the entry's `changed`; the widgets'
  `insert-at-cursor` and `preedit-changed`; and the key presses that reach the window), so the probe can tell an edit
  through `EditableText.InsertText` from typed input.

Every record line is a JSON object with `t` (ms since the epoch) and `event`.

usage: atspi-gtk4.py <title> <record file> menus|changing|text-view|entry
"""

import json
import sys
import time

import gi

gi.require_version('Gtk', '4.0')
from gi.repository import Gio, GLib, Gtk  # noqa: E402

title, record, mode = sys.argv[1], sys.argv[2], sys.argv[3]
PERIOD_MS = 250
START_MS = 5000
PREFILL = 'cua171 probe line'


def log(event, **fields):
    with open(record, 'a', encoding='utf-8') as f:
        f.write(json.dumps({'t': time.time() * 1000, 'event': event, **fields}) + '\n')


window = Gtk.Window(title=title)
window.set_default_size(600, 400)
box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
window.set_child(box)
actions = Gio.SimpleActionGroup()
noop = Gio.SimpleAction.new('noop', None)
actions.add_action(noop)
window.insert_action_group('win', actions)


def menu_model():
    root = Gio.Menu()
    for top, items in (('File', ('New', 'Open', 'Close')), ('Edit', ('Copy', 'Paste'))):
        sub = Gio.Menu()
        for item in items:
            sub.append(item, 'win.noop')
        root.append_submenu(top, sub)
    return root


if mode == 'menus':
    box.append(Gtk.PopoverMenuBar.new_from_model(menu_model()))
    button = Gtk.MenuButton(label='Menu')
    button.set_menu_model(menu_model())
    box.append(button)

    def open_menu():
        button.popup()
        log('menu-opened')
        return False

    GLib.timeout_add(1000, open_menu)
elif mode == 'changing':
    status = Gtk.Label(label='tick 0')
    rows = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
    box.append(status)
    box.append(rows)
    state = {'tick': 0, 'next': 0, 'shown': []}

    def change():
        state['tick'] += 1
        if len(state['shown']) < 4:
            label = Gtk.Label(label=f"row {state['next']}")
            state['next'] += 1
            rows.append(label)
            state['shown'].append(label)
            what = 'added'
        else:
            rows.remove(state['shown'].pop(0))
            what = 'removed'
        status.set_label(f"tick {state['tick']}")
        log('changed', tick=state['tick'], what=what, rows=len(state['shown']))
        return True

    def start():
        log('changing-started')
        GLib.timeout_add(PERIOD_MS, change)
        return False

    # after the window has settled once (families.mjs `settle` reads until the tree holds still)
    GLib.timeout_add(START_MS, start)
else:
    view = Gtk.TextView()
    view.set_size_request(-1, 150)
    buffer = view.get_buffer()
    buffer.set_enable_undo(True)
    # each widget starts with a line of text its undo history does not hold, so an undo can only take back what the
    # probe did, and the probe's insert can sit away from its typed key
    buffer.begin_irreversible_action()
    buffer.set_text(PREFILL)
    buffer.end_irreversible_action()
    entry = Gtk.Entry()
    box.append(view)
    box.append(entry)
    editable = entry.get_delegate()
    # GtkText's set_text is an irreversible action of its own history
    entry.set_text(PREFILL)
    buffer.connect('insert-text', lambda _b, where, text, _n: log('buffer insert-text', offset=where.get_offset(), text=text))
    buffer.connect('changed', lambda b: log('buffer changed', text=b.get_text(b.get_start_iter(), b.get_end_iter(), True)))
    buffer.connect('begin-user-action', lambda _b: log('buffer begin-user-action'))
    buffer.connect('end-user-action', lambda _b: log('buffer end-user-action'))
    buffer.connect('notify::can-undo', lambda b, _p: log('buffer can-undo', value=b.get_can_undo()))
    view.connect('insert-at-cursor', lambda _v, text: log('view insert-at-cursor', text=text))
    view.connect('preedit-changed', lambda _v, text: log('view preedit-changed', text=text))
    # the entry's buffer for its inserts: GtkEditable's own `insert-text` passes its position as a pointer, which
    # PyGObject cannot hand back, and a handler of it breaks the insert
    entry.get_buffer().connect('inserted-text', lambda _b, position, text, _n: log('entry inserted-text', position=position, text=text))
    editable.connect('changed', lambda e: log('entry changed', text=e.get_text()))
    editable.connect('insert-at-cursor', lambda _e, text: log('entry insert-at-cursor', text=text))
    editable.connect('preedit-changed', lambda _e, text: log('entry preedit-changed', text=text))
    keys = Gtk.EventControllerKey()
    keys.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
    keys.connect('key-pressed', lambda _c, keyval, _code, _state: log('key-pressed', keyval=keyval) or False)
    window.add_controller(keys)
    (view if mode == 'text-view' else entry).grab_focus()

loop = GLib.MainLoop()
window.connect('close-request', lambda _w: loop.quit() or False)
window.present()
log('shown', mode=mode)
loop.run()
