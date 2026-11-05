#!/usr/bin/env python3
"""The native-child probe's positive control, the review's reproducer: a QWidget holding a QPlainTextEdit whose
viewport has WA_NativeWindow, so the editor's text area is a native child X window.
usage: native-control.py <title> qt5|qt6"""
import sys

title, binding = sys.argv[1], sys.argv[2]
if binding == 'qt5':
    from PyQt5.QtCore import Qt
    from PyQt5.QtWidgets import QApplication, QPlainTextEdit, QVBoxLayout, QWidget
else:
    from PyQt6.QtCore import Qt
    from PyQt6.QtWidgets import QApplication, QPlainTextEdit, QVBoxLayout, QWidget

app = QApplication(sys.argv[:1])
top = QWidget()
top.setWindowTitle(title)
layout = QVBoxLayout(top)
editor = QPlainTextEdit()
editor.viewport().setAttribute(Qt.WidgetAttribute.WA_NativeWindow)
layout.addWidget(editor)
top.resize(400, 200)
top.show()
sys.exit(app.exec() if binding == 'qt6' else app.exec_())
