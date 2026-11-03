#!/usr/bin/env python3
"""The AT-SPI probe's Qt scene (#171 M4, T6; atspi-probe.mjs), under Qt 5 (PyQt5) or Qt 6 (PyQt6): one window with a
menu bar (File, Edit), a context menu the scene pops up itself a second after it is shown (so the probe reads an open
menu without sending any input), and a status label and a column of rows that change every 250 ms from five seconds
after the window is shown (a row added up to four, then the first one removed, and the label renamed), each change
recorded with its time as a JSON line (`t`, ms since the epoch, and `event`).

usage: atspi-qt.py <title> <record file> qt5|qt6
"""

import json
import sys
import time

title, record, binding = sys.argv[1], sys.argv[2], sys.argv[3]
if binding == 'qt5':
    from PyQt5.QtCore import QTimer
    from PyQt5.QtWidgets import QApplication, QLabel, QMainWindow, QMenu, QVBoxLayout, QWidget
else:
    from PyQt6.QtCore import QTimer
    from PyQt6.QtWidgets import QApplication, QLabel, QMainWindow, QMenu, QVBoxLayout, QWidget

PERIOD_MS = 250
START_MS = 5000


def log(event, **fields):
    with open(record, 'a', encoding='utf-8') as f:
        f.write(json.dumps({'t': time.time() * 1000, 'event': event, **fields}) + '\n')


app = QApplication([sys.argv[0]])
window = QMainWindow()
window.setWindowTitle(title)
window.resize(600, 400)
for top, items in (('File', ('New', 'Open', 'Close')), ('Edit', ('Copy', 'Paste'))):
    menu = window.menuBar().addMenu(top)
    for item in items:
        menu.addAction(item)
central = QWidget()
layout = QVBoxLayout(central)
status = QLabel('tick 0')
layout.addWidget(status)
rows = QVBoxLayout()
layout.addLayout(rows)
layout.addStretch(1)
window.setCentralWidget(central)
popup = QMenu(window)
for item in ('Cut', 'Copy', 'Paste'):
    popup.addAction(item)
state = {'tick': 0, 'next': 0, 'shown': []}


def change():
    state['tick'] += 1
    if len(state['shown']) < 4:
        label = QLabel(f"row {state['next']}")
        state['next'] += 1
        rows.addWidget(label)
        state['shown'].append(label)
        what = 'added'
    else:
        label = state['shown'].pop(0)
        rows.removeWidget(label)
        label.deleteLater()
        what = 'removed'
    status.setText(f"tick {state['tick']}")
    log('changed', tick=state['tick'], what=what, rows=len(state['shown']))


def open_menu():
    popup.popup(window.mapToGlobal(central.geometry().center()))
    log('menu-opened')


timer = QTimer()
timer.timeout.connect(change)
# after the window has settled once (families.mjs `settle` reads until the tree holds still)
QTimer.singleShot(START_MS, lambda: (log('changing-started'), timer.start(PERIOD_MS)))
QTimer.singleShot(1000, open_menu)
window.show()
log('shown', binding=binding)
sys.exit(app.exec() if binding == 'qt6' else app.exec_())
