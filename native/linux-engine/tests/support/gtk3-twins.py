#!/usr/bin/env python3
"""The engine's identity fixture (#171 M4's T5): one GTK 3 process showing `count` top-level windows with one title and
one size at one place, so neither X11 nor an AT-SPI frame's extents tell them apart. Window n holds an entry whose text
`twin-n` is selected and has the focus, a second entry `other-n`, a button `press-n`, an entry `nofocus-n` that cannot
take the focus, and `menu-n`, a focusable widget with no text whose one action is `showContextMenu`: it opens a context
menu (items named by `labels`, Copy by default) whose Copy puts `menu-copy-n` on CLIPBOARD, the route of an element
whose only Copy is its context menu (Chrome's web nodes). With `focus` `menu`, `menu-n` has the focus instead of the
entry. The process owns CLIPBOARD, holding `before`.

It prints, one JSON line each, flushed at once: `{"marker": n, "xid": id}` once window n is mapped, `{"active": n,
"is": bool}` when its active state changes, `{"configured": n, "x": x, "y": y}` when it is placed, `{"entry_focus": n}`
when its first entry takes the focus, `{"focus": "other", "window": n}` when its second entry does, `{"button": b,
"window": n}` for each mouse button press on that entry, `{"pressed": n}` when its button is pressed, `{"menu": "open"
| "closed", "window": n}` as a context menu opens and once it has closed and gone, and `{"copied": n}` when a menu's Copy is activated, so the test reads what each window did.

It reads commands on stdin, one a line: `popup <n>` opens window n's context menu as its action would, `popdown`
closes every open context menu, `focus <entry|other> <n>` moves window n's focus to that entry. Killed by the test.

usage: gtk3-twins.py <title> <count> <width> <height> [entry|menu] [labels, comma-separated]
"""

import json
import sys

import gi

gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
gi.require_version('GdkX11', '3.0')
gi.require_version('Atk', '1.0')
from gi._gi import hook_up_vfunc_implementation  # noqa: E402
from gi.repository import Atk, Gdk, GdkX11, GLib, Gtk  # noqa: E402, F401  (GdkX11 gives the windows their X11 type)

title, count = sys.argv[1], int(sys.argv[2])
width, height = int(sys.argv[3]), int(sys.argv[4])
focus = sys.argv[5] if len(sys.argv) > 5 else 'entry'
labels = sys.argv[6].split(',') if len(sys.argv) > 6 else ['Copy']


def say(record):
    print(json.dumps(record), flush=True)


menus = {}
widgets = {}


def popup(n):
    menu = Gtk.Menu()
    for label in labels:
        item = Gtk.MenuItem(label=label)
        if label == 'Copy':
            item.connect('activate', lambda _i, n=n: copy(n))
        menu.append(item)
    menu.connect('deactivate', lambda _m, n=n: closed(n))
    menu.show_all()
    menu.popup_at_widget(widgets[n]['menu'], Gdk.Gravity.SOUTH_WEST, Gdk.Gravity.NORTH_WEST, None)
    menus[n] = menu
    say({'menu': 'open', 'window': n})
    return False


def copy(n):
    Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD).set_text(f'menu-copy-{n}', -1)
    say({'copied': n})


def closed(n):
    menu = menus.pop(n, None)
    if menu is not None:
        GLib.idle_add(destroyed, menu, n)


def destroyed(menu, n):
    # said once the menu is gone, so it is no longer among the application's accessible children
    menu.destroy()
    say({'menu': 'closed', 'window': n})
    return False


class MenuAccessible(Gtk.WidgetAccessible, Atk.Action):
    """`menu-n`'s accessible: no text, one action, `showContextMenu`."""

    def do_get_n_actions(self):
        return 1

    def do_do_action(self, i):
        if i != 0:
            return False
        GLib.idle_add(popup, self.get_widget().window_n)
        return True


# Atk.Action's get_name shares its name with Atk.Object's, which PyGObject cannot tell apart in a subclass, so it is
# hooked up by its interface's own vfunc info.
hook_up_vfunc_implementation(
    next(v for v in Atk.Action.__info__.get_vfuncs() if v.get_name() == 'get_name'),
    MenuAccessible.__gtype__,
    lambda _self, i: 'showContextMenu' if i == 0 else None,
)


class MenuWidget(Gtk.DrawingArea):
    pass


MenuWidget.set_accessible_type(MenuAccessible.__gtype__)


def command(source, _condition):
    line = source.readline()
    if not line:
        return False
    words = line.split()
    if words[:1] == ['popup']:
        GLib.idle_add(popup, int(words[1]))
    elif words[:1] == ['popdown']:
        for menu in list(menus.values()):
            menu.deactivate()  # pops it down and says so, as an Escape or a click elsewhere would
    elif words[:1] == ['focus']:
        widgets[int(words[2])][words[1]].grab_focus()
    return True


for n in range(1, count + 1):
    window = Gtk.Window(title=title)
    window.set_default_size(width, height)
    window.move(0, 0)
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
    entry = Gtk.Entry(text=f'twin-{n}')
    entry.connect('focus-in-event', lambda _w, _e, n=n: say({'entry_focus': n}) or False)
    other = Gtk.Entry(text=f'other-{n}')
    other.connect('focus-in-event', lambda _w, _e, n=n: say({'focus': 'other', 'window': n}) or False)
    other.connect('button-press-event', lambda _w, e, n=n: say({'button': e.button, 'window': n}) or False)
    button = Gtk.Button(label=f'press-{n}')
    button.connect('clicked', lambda _b, n=n: say({'pressed': n}))
    nofocus = Gtk.Entry(text=f'nofocus-{n}')
    nofocus.set_can_focus(False)
    menu_widget = MenuWidget()
    menu_widget.window_n = n
    menu_widget.set_can_focus(True)
    menu_widget.set_size_request(120, 24)
    menu_widget.get_accessible().set_name(f'menu-{n}')
    menu_widget.get_accessible().set_role(Atk.Role.LABEL)
    for widget in (entry, other, button, nofocus, menu_widget):
        box.pack_start(widget, False, False, 0)
    window.add(box)
    window.connect('map-event', lambda w, _e, n=n: say({'marker': n, 'xid': w.get_window().get_xid()}) or False)
    window.connect('notify::is-active', lambda w, _p, n=n: say({'active': n, 'is': w.is_active()}))
    window.connect('configure-event', lambda _w, e, n=n: say({'configured': n, 'x': e.x, 'y': e.y}) or False)
    widgets[n] = {'entry': entry, 'other': other, 'menu': menu_widget}
    window.show_all()
    if focus == 'menu':
        menu_widget.grab_focus()
    else:
        entry.grab_focus()
        entry.select_region(0, -1)
GLib.io_add_watch(sys.stdin, GLib.IO_IN | GLib.IO_HUP, command)
Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD).set_text('before', -1)
Gtk.main()
