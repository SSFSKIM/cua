#!/usr/bin/env python3
"""Probe: a Qt main window blocked by a modal dialog of its own. Qt relays a FocusIn (and a FocusOut) on a blocked window
to its modal window (`QXcbWindow::relayFocusToModalWindow`, called from `doFocusIn` and `doFocusOut`), which asks for
that window's activation: so a background key's synthetic FocusIn alone may activate the dialog. Prints
`{"main": xid, "dialog": xid}` once both are shown, then `{"key": text}` for each key the main window's editor takes.
usage: qt-modal.py <title> qt5|qt6"""
import json
import sys

title, binding = sys.argv[1], sys.argv[2]
if binding == 'qt5':
    from PyQt5.QtCore import QTimer
    from PyQt5.QtWidgets import QApplication, QDialog, QPlainTextEdit
else:
    from PyQt6.QtCore import QTimer
    from PyQt6.QtWidgets import QApplication, QDialog, QPlainTextEdit


def say(record):
    print(json.dumps(record), flush=True)


app = QApplication(sys.argv[:1])
editor = QPlainTextEdit()
editor.setWindowTitle(title)
editor.resize(400, 200)
editor.show()
dialog = QDialog(editor)
dialog.setWindowTitle(title + ' dialog')
dialog.setModal(True)
dialog.resize(200, 100)


def shown():
    dialog.show()
    QTimer.singleShot(500, lambda: say({'main': int(editor.winId()), 'dialog': int(dialog.winId())}))


QTimer.singleShot(300, shown)
sys.exit(app.exec() if binding == 'qt6' else app.exec_())
