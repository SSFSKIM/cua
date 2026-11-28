#!/usr/bin/env python3
"""#228 probe 4: telling an Electron (or other Chromium-embedding) application from its files, before it starts.

For each desktop entry of the sample (packages unpacked under a root of their own, never installed, and this host's
own installed applications as the controls) it resolves the entry's Exec to a program the way a launcher would
(skipping `env VAR=...`, mapping an absolute path into the package's root, following symbolic links), then asks:

  elf            whether the program is an ELF executable, a script, an AppImage or missing
  via            how the executable examined was reached: the Exec's own program, or, for a script, a path the script
                 names (a heuristic: every absolute path in the script's text that exists, and its directory)
  asar           D1: <dir>/resources/app.asar, <dir>/resources/app/package.json or default_app.asar (Electron's layout)
  marker         D2: the executable contains the bytes ELECTRON_RUN_AS_NODE (Electron's own switch)
  chromium       D3: <dir> holds icudtl.dat and a V8 snapshot (v8_context_snapshot.bin or snapshot_blob.bin) and a .pak
                 (any Chromium content embedder: Electron, CEF, NW.js, Chrome)
  versions       Electron/x.y.z and Chrome/x.y.z.w where the executable or its libraries carry them

usage: detect.py <out.jsonl> <apps root> [name ...]
"""
import glob
import json
import mmap
import os
import re
import shlex
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402

# what each sample is, by its vendor's own account (the truth the detectors are scored against)
TRUTH = {
    'code': 'electron', 'obsidian': 'electron', 'mattermost': 'electron', 'github-desktop': 'electron', 'bitwarden': 'electron',
    'joplin': 'electron', 'discord': 'electron', 'signal': 'electron', 'element': 'electron', 'logseq': 'electron',
    'cef152': 'cef', 'nwjs': 'nwjs',
}
HOST_CONTROLS = {
    'org.gnome.gedit.desktop': 'gtk3', 'org.gnome.TextEditor.desktop': 'gtk4', 'org.kde.kate.desktop': 'qt5', 'org.qt-project.qtcreator.desktop': 'qt6',
    'google-chrome.desktop': 'chrome', 'libreoffice-writer.desktop': 'vcl', 'libreoffice-calc.desktop': 'vcl', 'debian-xterm.desktop': 'xt',
    'firefox_firefox.desktop': 'gecko', 'org.gnome.Terminal.desktop': 'gtk3', 'org.gnome.Zenity.desktop': 'gtk', 'x11vnc.desktop': 'x11',
    'htop.desktop': 'terminal', 'vim.desktop': 'terminal', 'openjdk-21-java.desktop': 'java', 'yad-icon-browser.desktop': 'gtk3',
}


# Chromium's own helper programs, which sit beside an application's executable and are never the application
HELPERS = ('chrome-sandbox', 'chrome_sandbox', 'chrome_crashpad_handler', 'chrome-management-service', 'crashpad_handler', 'chrome_crashpad_handler')


def exec_of(entry):
    for line in open(entry, errors='replace'):
        if line.startswith('Exec='):
            return line[5:].strip()
    return None


def program_of(exec_line):
    """The program a launcher would run for an Exec line: field codes dropped, a leading `env VAR=...` skipped."""
    try:
        words = [w for w in shlex.split(exec_line) if not re.fullmatch(r'%[a-zA-Z]', w)]
    except ValueError:
        return None, []
    if words and os.path.basename(words[0]) == 'env':
        words = words[1:]
        while words and re.match(r'^[A-Za-z_][A-Za-z0-9_]*=', words[0]):
            words = words[1:]
    return (words[0] if words else None), words[1:]


def in_root(root, path):
    """An absolute path of the package, inside its unpacked root (following links that stay absolute to the package)."""
    seen = 0
    while seen < 20:
        seen += 1
        full = os.path.join(root, path.lstrip('/')) if root != '/' else path
        if os.path.islink(full):
            target = os.readlink(full)
            path = target if os.path.isabs(target) else os.path.normpath(os.path.join(os.path.dirname(path), target))
            continue
        return full
    return full


def which(root, program):
    if os.path.isabs(program):
        return in_root(root, program)
    for directory in ('/usr/local/bin', '/usr/bin', '/bin', '/usr/games', '/snap/bin'):
        full = in_root(root, os.path.join(directory, program))
        if os.path.exists(full):
            return full
    return None


def kind_of(path):
    if not path or not os.path.isfile(path):
        return 'missing'
    with open(path, 'rb') as f:
        head = f.read(16)
    if head.startswith(b'#!'):
        return 'script'
    if head.startswith(b'\x7fELF'):
        return 'appimage' if head[8:10] == b'AI' else 'elf'
    return 'other'


def contains(path, needle):
    try:
        with open(path, 'rb') as f, mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as m:
            return m.find(needle) >= 0
    except (OSError, ValueError):
        return False


def find_version(paths, pattern):
    regex = re.compile(pattern)
    for path in paths:
        try:
            with open(path, 'rb') as f, mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as m:
                found = regex.search(m)
                if found:
                    return found.group(0).decode()
        except (OSError, ValueError):
            pass
    return None


def examine(exe):
    directory = os.path.dirname(exe)
    has = lambda *names: any(os.path.exists(os.path.join(directory, n)) for n in names)
    libs = [exe] + sorted(glob.glob(os.path.join(directory, '*.so')))[:6]
    return {
        'asar': has('resources/app.asar', 'resources/app/package.json', 'resources/default_app.asar'),
        'marker': contains(exe, b'ELECTRON_RUN_AS_NODE'),
        'chromium': has('icudtl.dat') and has('v8_context_snapshot.bin', 'snapshot_blob.bin') and bool(glob.glob(os.path.join(directory, '*.pak'))),
        'electron_version': find_version([exe], rb'Electron/\d+\.\d+\.\d+'),
        'chrome_version': find_version(libs, rb'Chrome/\d+\.\d+\.\d+\.\d+'),
    }


def script_candidates(root, script):
    """Executables a wrapper script may start: every absolute path its text names that exists in the root, and ELF
    files directly inside a directory it names or inside the script's own directory."""
    text = open(script, errors='replace').read()
    found = []
    # the script's own directory first: a wrapper usually starts a program beside itself ($(dirname "$0")/...)
    own = os.path.dirname(script)
    shared = own.rstrip('/').endswith(('/bin', '/sbin', '/games'))  # a shared program directory says nothing of the script
    for full in ([] if shared else [own]) + [in_root(root, token) for token in sorted(set(re.findall(r'/(?:usr|opt|snap|app)[A-Za-z0-9_./+-]*', text)))]:
        if os.path.isfile(full) and kind_of(full) == 'elf':
            found.append(full)
        elif os.path.isdir(full):
            for name in sorted(os.listdir(full)):
                candidate = os.path.join(full, name)
                if os.path.isfile(candidate) and os.access(candidate, os.X_OK) and kind_of(candidate) == 'elf' and name not in HELPERS and not name.startswith('lib') and '.' not in name:
                    found.append(candidate)
    return found


def row_for(name, truth, root, entry):
    exec_line = exec_of(entry)
    program, args = program_of(exec_line or '')
    path = which(root, program) if program else None
    kind = kind_of(path)
    row = {'probe': 'detect', 'sample': name, 'truth': truth, 'entry': os.path.relpath(entry, root) if root != '/' else entry,
           'exec': exec_line, 'program': program, 'args': args, 'elf': kind, 'via': None}
    examined = None
    if kind == 'elf':
        examined, row['via'] = path, 'exec'
    elif kind == 'script':
        candidates = script_candidates(root, path)
        scored = [(c, examine(c)) for c in candidates]
        hit = next((c for c, e in scored if e['marker'] or e['asar'] or e['chromium']), None)
        examined, row['via'] = (hit or (candidates[0] if candidates else None)), 'script'
        row['script_candidates'] = [os.path.relpath(c, root) if root != '/' else c for c in candidates][:6]
    if examined:
        row['executable'] = os.path.relpath(examined, root) if root != '/' else examined
        row.update(examine(examined))
    return row


def main():
    out, apps = sys.argv[1], sys.argv[2]
    wanted = sys.argv[3:]
    rows = []
    for name, truth in TRUTH.items():
        if wanted and name not in wanted:
            continue
        root = os.path.join(apps, name)
        entries = sorted(glob.glob(os.path.join(root, 'usr/share/applications/*.desktop')))
        entries = [e for e in entries if 'UrlHandler' not in e and 'url-handler' not in e]
        if not entries:
            # no desktop entry in the package (a tarball or an AppImage): the program itself
            programs = [p for p in glob.glob(os.path.join(root, '*')) + glob.glob(os.path.join(root, '*', '*')) + glob.glob(os.path.join(root, '*', '*', '*'))
                        if os.path.isfile(p) and os.path.basename(p) in ('nw', 'cefclient', 'cefsimple', 'app.AppImage')]
            for program in sorted(programs):
                kind = kind_of(program)
                row = {'probe': 'detect', 'sample': name, 'truth': truth, 'entry': None, 'exec': None, 'program': os.path.relpath(program, root), 'elf': kind, 'via': 'program'}
                if kind == 'elf':
                    row['executable'] = os.path.relpath(program, root)
                    row.update(examine(program))
                rows.append(row)
            continue
        for entry in entries:
            rows.append(row_for(name, truth, root, entry))
    if not wanted:
        for entry_name, truth in HOST_CONTROLS.items():
            for directory in ('/usr/share/applications', '/var/lib/snapd/desktop/applications'):
                entry = os.path.join(directory, entry_name)
                if os.path.exists(entry):
                    rows.append(row_for(entry_name, truth, '/', entry))
                    break
    for row in rows:
        lib.emit(row, out)


if __name__ == '__main__':
    main()
