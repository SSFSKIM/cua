#!/usr/bin/env python3
"""The harness's Qt input scene (#171 M3.1): one window of plain Qt widgets, under Qt 5 (PyQt5) or Qt 6 (PyQt6), that
counts the pointer moves, wheel events and button presses it receives and writes the counts to a file on each, so the
kinds experiment reads what reached the toolkit itself, apart from any application's behaviour. With a style named
(`breeze`, `fusion`), the window also holds an auto-raise tool button at (10, 10), 80 by 40, whose hover highlight is
the style's to draw, and counts the hover events the button receives: whether a style's highlight follows the pointer
moves that reach the toolkit.

usage: qt-input.py <title> <record file> qt5|qt6 [style]
"""

import sys

title, record, binding = sys.argv[1], sys.argv[2], sys.argv[3]
style = sys.argv[4] if len(sys.argv) > 4 else None
if binding == 'qt5':
    from PyQt5.QtCore import QEvent, QObject
    from PyQt5.QtWidgets import QApplication, QToolButton, QWidget
else:
    from PyQt6.QtCore import QEvent, QObject
    from PyQt6.QtWidgets import QApplication, QToolButton, QWidget

counts = {'moves': 0, 'wheels': 0, 'presses': 0, 'hovers': 0}


def write():
    with open(record, 'a', encoding='utf-8') as f:
        f.write(f"moves {counts['moves']} wheels {counts['wheels']} presses {counts['presses']} hovers {counts['hovers']}\n")


class Pad(QWidget):
    def __init__(self):
        super().__init__()
        self.setMouseTracking(True)
        self.setWindowTitle(title)
        self.resize(600, 400)

    def mouseMoveEvent(self, event):
        counts['moves'] += 1
        write()

    def wheelEvent(self, event):
        counts['wheels'] += 1
        write()

    def mousePressEvent(self, event):
        counts['presses'] += 1
        write()


class Hovers(QObject):
    def eventFilter(self, watched, event):
        if event.type() in (QEvent.Type.HoverEnter, QEvent.Type.HoverMove):
            counts['hovers'] += 1
            write()
        return False


app = QApplication([sys.argv[0]])
if style:
    app.setStyle(style)
pad = Pad()
if style:
    button = QToolButton(pad)
    button.setText('tool')
    button.setAutoRaise(True)
    button.setGeometry(10, 10, 80, 40)
    hovers = Hovers()
    button.installEventFilter(hovers)
pad.show()
write()
sys.exit(app.exec() if binding == 'qt6' else app.exec_())
