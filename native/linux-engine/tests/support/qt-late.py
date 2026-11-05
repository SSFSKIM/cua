#!/usr/bin/env python3
"""The engine's late Qt window (#171 M4, task 61): one top-level Qt window, Qt 5 (PyQt5) or Qt 6 (PyQt6), holding a
plain text editor, whose main thread is kept late on purpose: a timer every `every` ms blocks it for `block` ms, as a
loaded machine's scheduler does to kate's and qtcreator's at twice the gate's load. Qt's xcb reader thread keeps reading
X events meanwhile, so a synthetic FocusIn and a press sent a few milliseconds after it are handled in one batch once the
main thread runs again, and Qt's press handler, finding no focus window yet, asks for the window's activation: with no
window manager, by taking the X input focus itself (`QXcbWindow::requestActivateWindow`'s `SetInputFocus`). The test reads
the X input focus after each press.

It prints, one JSON line each, flushed at once: `{"xid": id}` once the window is shown, `{"press": n}` for the editor's
nth mouse press, and `{"focus_window": bool}` as Qt's own focus window becomes the window or stops being it. Killed by
the test.

A mode, if given, changes the window as task 61's review and the design session's rulings need (2026-11-05):
- `native`: the editor's viewport is a native child X window (`WA_NativeWindow`, which makes the editor native too), so
  a press lands on a window that is never Qt's focus window: the review's reproducer.
- `modal`: a modal dialog of the window's own is shown over it, and `{"dialog": id}` printed once it is.
- `nested`: as `modal`, and that dialog opens a modal dialog of its own over itself, as a message box over a file
  dialog: `{"dialog": id, "inner": id}` printed once both are shown (the bounded re-review's P2).

- `other`: a second top-level window of the same application, `{"other": id}` printed once it is shown, for the person
  to focus while a background press to the first is held (task 61's fix 3).

usage: qt-late.py <title> qt5|qt6 <block ms> <every ms> [native|modal|nested|other]
"""

import json
import sys
import time

title, binding = sys.argv[1], sys.argv[2]
block, every = int(sys.argv[3]), int(sys.argv[4])
mode = sys.argv[5] if len(sys.argv) > 5 else None
if binding == 'qt5':
    from PyQt5.QtCore import QEvent, QObject, Qt, QTimer
    from PyQt5.QtWidgets import QApplication, QDialog, QPlainTextEdit
else:
    from PyQt6.QtCore import QEvent, QObject, Qt, QTimer
    from PyQt6.QtWidgets import QApplication, QDialog, QPlainTextEdit


def say(record):
    print(json.dumps(record), flush=True)


presses = 0


class Presses(QObject):
    def eventFilter(self, obj, event):
        global presses
        if event.type() == QEvent.Type.MouseButtonPress:
            presses += 1
            say({'press': presses})
        return False


app = QApplication(sys.argv[:1])
editor = QPlainTextEdit()
editor.setWindowTitle(title)
editor.setPlainText('late one\nlate two\n')
editor.resize(400, 200)
watcher = Presses()
editor.viewport().installEventFilter(watcher)
if mode == 'native':
    editor.viewport().setAttribute(Qt.WidgetAttribute.WA_NativeWindow)
app.focusWindowChanged.connect(lambda w: say({'focus_window': w is not None and w is editor.windowHandle()}))
editor.show()
say({'xid': int(editor.winId())})
if mode == 'other':
    other = QPlainTextEdit()
    other.setWindowTitle(title + ' other')
    other.resize(200, 100)
    other.move(450, 300)
    other.show()
    QTimer.singleShot(300, lambda: say({'other': int(other.winId())}))
if mode in ('modal', 'nested'):
    dialog = QDialog(editor)
    dialog.setWindowTitle(title + ' dialog')
    dialog.setModal(True)
    dialog.resize(200, 100)
    dialog.show()
    if mode == 'modal':
        QTimer.singleShot(300, lambda: say({'dialog': int(dialog.winId())}))
    else:
        inner = QDialog(dialog)
        inner.setWindowTitle(title + ' inner dialog')
        inner.setModal(True)
        inner.resize(150, 80)
        QTimer.singleShot(200, inner.show)
        QTimer.singleShot(500, lambda: say({'dialog': int(dialog.winId()), 'inner': int(inner.winId())}))


def late():
    time.sleep(block / 1000)


timer = QTimer()
timer.timeout.connect(late)
timer.start(every)
sys.exit(app.exec() if binding == 'qt6' else app.exec_())
