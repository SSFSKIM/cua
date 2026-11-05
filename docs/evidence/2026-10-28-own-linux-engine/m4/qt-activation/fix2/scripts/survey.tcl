# A Tk window for the _XEMBED_INFO survey (task 61, fix 2): an entry, a button, a menu bar and a second toplevel.
wm title . cua171-survey-tk
entry .e
.e insert 0 cua171
button .b -text ok
menu .m
.m add cascade -label File -menu .m.f
menu .m.f
.m.f add command -label Quit -command exit
. configure -menu .m
pack .e .b
toplevel .t
wm title .t cua171-survey-tk-second
label .t.l -text second
pack .t.l
