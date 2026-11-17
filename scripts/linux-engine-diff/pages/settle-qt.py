#!/usr/bin/env python3
"""The settle experiment's Qt scene (#171 M4, T8; action-settle.mjs), under Qt 5 (PyQt5) or Qt 6 (PyQt6): one window
of plain Qt widgets, a push button whose label counts its presses and a pad whose label counts the pointer moves it
receives and the wheel steps it takes, so a click's, an element action's, a move's and a scroll's effect each read back
as an accessible name in the window's tree. (Qt takes no synthetic wheel event, so cua refuses a background scroll to it
in shared mode; the pad counts the foreground route's, in dedicated mode: task 63.)

usage: settle-qt.py <title> qt5|qt6
"""

import sys

title, binding = sys.argv[1], sys.argv[2]
if binding == 'qt5':
    from PyQt5.QtWidgets import QApplication, QLabel, QPushButton, QVBoxLayout, QWidget
else:
    from PyQt6.QtWidgets import QApplication, QLabel, QPushButton, QVBoxLayout, QWidget

counts = {'presses': 0, 'moves': 0, 'scrolls': 0}


class Pad(QLabel):
    def __init__(self):
        super().__init__('moves 0 scrolls 0')
        self.setMouseTracking(True)
        self.setMinimumSize(600, 260)

    def show_counts(self):
        self.setText(f"moves {counts['moves']} scrolls {counts['scrolls']}")

    def mouseMoveEvent(self, event):
        counts['moves'] += 1
        self.show_counts()

    def wheelEvent(self, event):
        counts['scrolls'] += 1
        self.show_counts()


def pressed():
    counts['presses'] += 1
    button.setText(f"presses {counts['presses']}")


app = QApplication([sys.argv[0]])
window = QWidget()
window.setWindowTitle(title)
window.resize(600, 400)
layout = QVBoxLayout(window)
button = QPushButton('presses 0')
button.setMinimumHeight(80)
button.clicked.connect(pressed)
pad = Pad()
layout.addWidget(button)
layout.addWidget(pad)
window.show()
sys.exit(app.exec() if binding == 'qt6' else app.exec_())
