#!/usr/bin/env python3
"""Probe fixture (task 61 fix: a modal dialog that maps while a request runs): a Qt main window whose one button, filling
it, opens a modal dialog of its own when clicked; the dialog closes itself 1.5 s later. Prints {"main": xid} once shown,
then {"opened": n} each time the dialog is shown.
usage: qt-opener.py <title> qt5|qt6"""
import json
import sys

title, binding = sys.argv[1], sys.argv[2]
if binding == 'qt5':
    from PyQt5.QtCore import QTimer
    from PyQt5.QtWidgets import QApplication, QDialog, QPushButton, QVBoxLayout, QWidget
else:
    from PyQt6.QtCore import QTimer
    from PyQt6.QtWidgets import QApplication, QDialog, QPushButton, QVBoxLayout, QWidget

app = QApplication(sys.argv[:1])
top = QWidget()
top.setWindowTitle(title)
top.resize(300, 150)
button = QPushButton('open')
button.setMinimumHeight(130)
QVBoxLayout(top).addWidget(button)
opened = 0


def open_dialog():
    global opened
    opened += 1
    dialog = QDialog(top)
    dialog.setWindowTitle(title + ' dialog')
    dialog.setModal(True)
    dialog.resize(200, 100)
    dialog.show()
    print(json.dumps({'opened': opened}), flush=True)
    QTimer.singleShot(1500, dialog.close)


button.clicked.connect(open_dialog)
top.show()
QTimer.singleShot(300, lambda: print(json.dumps({'main': int(top.winId())}), flush=True))
sys.exit(app.exec() if binding == 'qt6' else app.exec_())
