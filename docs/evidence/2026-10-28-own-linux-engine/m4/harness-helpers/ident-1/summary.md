# linux-engine-diff summary

## t74w3-ident-1 (experiment writer-drag)

Each family's application as AT-SPI shows it (vcl-probe.mjs `runIdentityPlan`), against app-identity.mjs `APP_IDENTITY`.

| family | application | toolkit | document | frame | verdict |
|---|---|---|---|---|---|
| gedit | gedit | gtk | – | cua171-diff-t74w3-ident-1-f29ac040-gedit-idgedit.txt (/tmp/cua171-run-Wc0uUN/…1-f29ac040-gedit-idgedit) - gedit | **no identity is declared for family gedit** |
| gnome-text-editor | gnome-text-editor | GTK | – | cua171-diff-t74w3-ident-1-f29ac040-gnometexteditor-idgnometexteditor.txt (/tmp/cua171-run-Wc0uUN/cua171-diff-t74w3-ident-1-f29ac040-gnometexteditor-idgnometexteditor) - Text Editor | **no identity is declared for family gnome-text-editor** |
| gtk4-button | Unnamed | GTK | – | cua171-diff-t74w3-ident-1-f29ac040-gtk4button-idgtk4button | **no identity is declared for family gtk4-button** |
| gtk4-input | Unnamed | GTK | – | cua171-diff-t74w3-ident-1-f29ac040-gtk4input-idgtk4input | **no identity is declared for family gtk4-input** |
| qt5-input | qt-input.py | Qt | – | cua171-diff-t74w3-ident-1-f29ac040-qt5input-idqt5input | **no identity is declared for family qt5-input** |
| qt6-input | qt-input.py | Qt | – | cua171-diff-t74w3-ident-1-f29ac040-qt6input-idqt6input | **no identity is declared for family qt6-input** |
| qt5-breeze | qt-input.py | Qt | – | cua171-diff-t74w3-ident-1-f29ac040-qt5breeze-idqt5breeze | **no identity is declared for family qt5-breeze** |
| qt5-fusion | qt-input.py | Qt | – | cua171-diff-t74w3-ident-1-f29ac040-qt5fusion-idqt5fusion | **no identity is declared for family qt5-fusion** |
| settle-gtk3 | settle-gtk3.py | gtk | – | cua171-diff-t74w3-ident-1-f29ac040-settlegtk3-idsettlegtk3 | **no identity is declared for family settle-gtk3** |
| settle-qt5 | settle-qt.py | Qt | – | cua171-diff-t74w3-ident-1-f29ac040-settleqt5-idsettleqt5 | **no identity is declared for family settle-qt5** |
| settle-qt6 | settle-qt.py | Qt | – | cua171-diff-t74w3-ident-1-f29ac040-settleqt6-idsettleqt6 | **no identity is declared for family settle-qt6** |
| atspi-gtk4 | Unnamed | GTK | – | cua171-diff-t74w3-ident-1-f29ac040-atspigtk4-idatspigtk4 | **no identity is declared for family atspi-gtk4** |
| atspi-qt5 | atspi-qt.py | Qt | – | cua171-diff-t74w3-ident-1-f29ac040-atspiqt5-idatspiqt5 | **no identity is declared for family atspi-qt5** |
| atspi-qt6 | atspi-qt.py | Qt | – | cua171-diff-t74w3-ident-1-f29ac040-atspiqt6-idatspiqt6 | **no identity is declared for family atspi-qt6** |
| gtk-scale | gtk-scale.py | gtk | – | cua171-diff-t74w3-ident-1-f29ac040-gtkscale-idgtkscale | **no identity is declared for family gtk-scale** |
| kate | kate | Qt | – | cua171-diff-t74w3-ident-1-f29ac040-kate-idkate.txt  | **no identity is declared for family kate** |
| qtcreator | QtCreator | Qt | – | cua171-diff-t74w3-ident-1-f29ac040-qtcreator-idqtcreator.txt - Qt Creator | **no identity is declared for family qtcreator** |
| firefox | Firefox | Gecko | document web | cua171-diff-t74w3-ident-1-f29ac040-firefox-idfirefox — Mozilla Firefox | **no identity is declared for family firefox** |
| chrome | Google Chrome | Chromium | document web | cua171-diff-t74w3-ident-1-f29ac040-matrix-idchrome - Google Chrome | **no identity is declared for family chrome** |
| electron | electron | Chromium | document web | cua Electron fixture | **no identity is declared for family electron** |
| writer | soffice | gtk | document text | cua171-diff-t74w3-ident-1-f29ac040-writer-idwriter.txt — LibreOffice Writer | ok |
| writer-gen | **failed: undefined is not an AT-SPI node** |
| gtk-table | gtk-table.py | gtk | – | cua171-diff-t74w3-ident-1-f29ac040-gtktable-idgtktable | **no identity is declared for family gtk-table** |
| calc | soffice | gtk | document spreadsheet | cua171-diff-t74w3-ident-1-f29ac040-calc-idcalc.csv — LibreOffice Calc | ok |
| impress | soffice | gtk | document presentation | cua171-diff-t74w3-ident-1-f29ac040-impress-idimpress.fodp — LibreOffice Impress | ok |
| xterm | **failed: undefined is not an AT-SPI node** |
| xterm-allow | **failed: undefined is not an AT-SPI node** |
| gnome-terminal | gnome-terminal-server | gtk | – | cua171-diff-t74w3-ident-1-f29ac040-gnometerminal-idgnometerminal | **no identity is declared for family gnome-terminal** |
| gtk3-frame | point-gtk3.py | gtk | – | cua171-diff-t74w3-ident-1-f29ac040-pointgtk3-idgtk3frame | ok |

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 785 requests, 71 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

