#!/usr/bin/python3 -I
# Task 58: which owner title a privacy-check hit is, without printing any title: for each owner window title (read
# into memory from :0, as privacy-check.py reads it) found in the file, whether it is one of the generic names
# Chrome gives every instance's leader window, and its length otherwise.
# usage: title-hit.py <owner chrome pid> <file>
import gzip, re, subprocess, sys, os

H = os.path.expanduser('~') + '/'
env = {'DISPLAY': ':0', 'XAUTHORITY': H + '.Xauthority', 'PATH': '/usr/bin:/bin'}
GENERIC = {'google-chrome-stable', 'google-chrome', 'Google Chrome', 'chrome'}
ids = subprocess.run(['xdotool', 'search', '--pid', sys.argv[1]], capture_output=True, text=True, env=env).stdout.split()
p = sys.argv[2]
text = (gzip.open(p) if p.endswith('.gz') else open(p, 'rb')).read().decode('utf8', 'replace')
for i in ids:
    out = subprocess.run(['xprop', '-id', i, '_NET_WM_NAME', 'WM_NAME'], capture_output=True, text=True, env=env).stdout
    for t in re.findall(r'= "(.*)"', out):
        if t and t in text:
            print('window', i, 'title found:', 'generic: ' + t if t in GENERIC else f'NOT generic ({len(t)} characters)')
        for w in re.findall(r'\w{6,}', t):
            if w in text and w not in ('Google', 'Chrome', 'google', 'chrome'):
                print('window', i, 'word found:', 'generic: ' + w if w in ('stable',) else f'NOT generic ({len(w)} characters)')
