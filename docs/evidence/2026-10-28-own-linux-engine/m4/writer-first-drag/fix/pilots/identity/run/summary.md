# linux-engine-diff summary

## t72-pilot-identity (experiment writer-drag)

Each family's application as AT-SPI shows it (vcl-probe.mjs `runIdentityPlan`), against app-identity.mjs `APP_IDENTITY`.

| family | application | toolkit | document | frame | verdict |
|---|---|---|---|---|---|
| writer | soffice | gtk | document text | cua171-diff-t72-pilot-identity-af352381-writer-idwriter.txt — LibreOffice Writer | **toolkit "gtk", not "VCL"** |
| calc | soffice | gtk | document spreadsheet | cua171-diff-t72-pilot-identity-af352381-calc-idcalc.csv — LibreOffice Calc | **toolkit "gtk", not "VCL"** |
| impress | soffice | gtk | document text | cua171-diff-t72-pilot-identity-af352381-impress-idimpress.fodp — LibreOffice Writer | **toolkit "gtk", not "VCL"; document "document text", not "document presentation"** |
| gtk3-frame | point-gtk3.py | gtk | – | cua171-diff-t72-pilot-identity-af352381-pointgtk3-idgtk3frame | **toolkit "gtk", not "GTK"** |

desktop: started with 0x0080000c active (foreign), ended with 0x0080000c active (foreign), neither acted on; holder 0x00e0000c; the harness's own trace: 298 requests, 16 changes of a window, every one of its own; the run's record: not run (the display is a private one, and the run's caller declined to start the whole-run RECORD on it)

