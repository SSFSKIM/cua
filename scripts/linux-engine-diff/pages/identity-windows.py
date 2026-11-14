#!/usr/bin/env python3
"""The harness's identity fixture (#171 M4's T5): one process showing several top-level windows with one title and one
size, under GTK 3, GTK 4, Qt 5 (PyQt5) or Qt 6 (PyQt6), each window holding one label `marker <label>-<n>` (n from 1),
so a tree read shows which window it read while the X11 titles and sizes leave the windows indistinguishable. Once a
window is mapped, its marker and X11 window id are printed as a JSON line, `{"marker": n, "xid": id}`, which is how the
harness knows the windows apart. The process ends when its last window closes (WM_DELETE_WINDOW).

usage: identity-windows.py gtk3|gtk4|qt5|qt6 <title> <label> <count> <width> <height>
"""

import json
import sys

toolkit, title, label = sys.argv[1], sys.argv[2], sys.argv[3]
count, width, height = int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])


def mapped(n, xid):
    print(json.dumps({'marker': n, 'xid': int(xid)}), flush=True)


if toolkit in ('gtk3', 'gtk4'):
    import gi

    version = '3.0' if toolkit == 'gtk3' else '4.0'
    gi.require_version('Gtk', version)
    gi.require_version('GdkX11', version)
    from gi.repository import GdkX11, GLib, Gtk  # noqa: E402, F401  (GdkX11 gives the windows their X11 type)

    loop = GLib.MainLoop()
    open_windows = []

    def closed(window, *_):
        open_windows.remove(window)
        if not open_windows:
            loop.quit()
        return False

    for n in range(1, count + 1):
        window = Gtk.Window(title=title)
        window.set_default_size(width, height)
        marker = Gtk.Label(label=f'marker {label}-{n}')
        if toolkit == 'gtk3':
            window.add(marker)
            window.connect('delete-event', closed)
            window.connect('map-event', lambda w, _e, n=n: mapped(n, w.get_window().get_xid()) or False)
            window.show_all()
        else:
            window.set_child(marker)
            window.connect('close-request', closed)
            window.connect('map', lambda w, n=n: mapped(n, w.get_surface().get_xid()))
            window.present()
        open_windows.append(window)
    loop.run()
else:
    if toolkit == 'qt5':
        from PyQt5.QtWidgets import QApplication, QLabel, QVBoxLayout, QWidget
    else:
        from PyQt6.QtWidgets import QApplication, QLabel, QVBoxLayout, QWidget

    app = QApplication(sys.argv[:1])
    windows = []
    for n in range(1, count + 1):
        # a plain widget holding the label: a label as the window would name the frame by its text, not its title
        window = QWidget()
        QVBoxLayout(window).addWidget(QLabel(f'marker {label}-{n}'))
        window.setWindowTitle(title)
        window.resize(width, height)
        window.show()
        mapped(n, window.winId())
        windows.append(window)
    sys.exit(app.exec() if toolkit == 'qt6' else app.exec_())
