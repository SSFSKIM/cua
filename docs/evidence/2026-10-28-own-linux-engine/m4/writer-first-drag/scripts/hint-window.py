# A GTK 3 window that logs the pointer events GTK hands its drawing area, one line each, to stdout.
# argv: title, mask (`hint`: the area selects GDK_POINTER_MOTION_HINT_MASK, as LibreOffice's gtk3 frame does; `nohint`),
# rearm (`rearm`: after each motion the handler asks for the pointer, as LibreOffice's signalMotion does, "ask for the
# next hint"; `none`).
import sys

import gi

gi.require_version('Gtk', '3.0')
gi.require_version('Gdk', '3.0')
from gi.repository import Gdk, Gtk  # noqa: E402

title, mask, rearm = sys.argv[1], sys.argv[2], sys.argv[3]
window = Gtk.Window(title=title)
window.set_default_size(400, 200)
area = Gtk.DrawingArea()
events = (Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK | Gdk.EventMask.POINTER_MOTION_MASK
          | Gdk.EventMask.ENTER_NOTIFY_MASK | Gdk.EventMask.LEAVE_NOTIFY_MASK)
if mask == 'hint':
    events |= Gdk.EventMask.POINTER_MOTION_HINT_MASK
area.add_events(events)


def log(*parts):
    print(*parts, flush=True)


def origin(e):
    return 'sent' if e.send_event else 'real'


def motion(widget, e):
    log('motion', int(e.x), int(e.y), int(e.state), 'hint' if e.is_hint else '-', origin(e), e.get_device().get_name())
    if rearm == 'rearm':
        widget.get_window().get_pointer()
    return True


area.connect('motion-notify-event', motion)
area.connect('button-press-event', lambda w, e: log('press', int(e.x), int(e.y), origin(e), e.get_device().get_name()) or True)
area.connect('button-release-event', lambda w, e: log('release', int(e.x), int(e.y), origin(e)) or True)
area.connect('enter-notify-event', lambda w, e: log('enter', int(e.x), int(e.y), origin(e), e.get_device().get_name()) or True)
area.connect('leave-notify-event', lambda w, e: log('leave', origin(e)) or True)
window.add(area)
window.connect('destroy', Gtk.main_quit)
window.show_all()
log('ready', Gtk.get_major_version(), Gtk.get_minor_version(), Gtk.get_micro_version())
Gtk.main()
