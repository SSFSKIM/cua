#!/usr/bin/env python3
"""Writes sources.md: the lines of Chromium, Electron, at-spi2-core and Orca the pre-flight cites, each with its
file's SHA-256, from the copies fetched into the scratch (how each was fetched is in the file's own heading).

usage: sources.py <scratch> <out.md>
"""
import hashlib
import os
import re
import sys

CHROMIUM = '152.0.7977.167'
EXCERPTS = [
    # (root, path, first line, last line, what it shows)
    ('chromium', 'ui/accessibility/platform/atk_util_auralinux.cc', 30, 35, 'The three environment variables.'),
    ('chromium', 'ui/accessibility/platform/atk_util_auralinux.cc', 109, 111, 'The toolkit name and version every Chromium application reports.'),
    ('chromium', 'ui/accessibility/platform/atk_util_auralinux.cc', 125, 191, 'Whether the ATK bridge starts: the variables (1 on, 0 off), CHROME_HEADLESS, then `org.a11y.Status` `IsEnabled` on the session bus, then GSettings `toolkit-accessibility` only when that call got no reply; `InitializeAsync` stays uninitialized after a no, so a later call asks again.'),
    ('chromium', 'ui/accessibility/platform/atk_util_auralinux.cc', 201, 211, 'The only later call: a key event, and only while the mode has kNativeAPIs.'),
    ('chromium', 'ui/accessibility/platform/atk_util_auralinux_gtk.cc', 12, 18, 'Starting the bridge is `atk_bridge_adaptor_init`.'),
    ('chromium', 'ui/views/accessibility/view_ax_platform_node_delegate_auralinux.cc', 184, 192, 'The first call: the application object, made once with the first widget.'),
    ('chromium', 'ui/views/widget/desktop_aura/desktop_window_tree_host_linux.cc', 437, 445, 'Where key events reach `HandleAtkKeyEvent`.'),
    ('chromium', 'ui/accessibility/platform/ax_platform_node_auralinux.cc', 2185, 2212, '`Accessible.GetRelationSet` and `Accessible.GetAttributes` (ATK `ref_relation_set`, `get_attributes`) turn the mode on.'),
    ('chromium', 'ui/accessibility/platform/ax_platform_node_auralinux.cc', 2278, 2282, 'They are the class functions of every Chromium ATK object.'),
    ('chromium', 'content/browser/accessibility/browser_accessibility_state_impl.cc', 330, 375, 'The command-line switches: `--disable-platform-accessibility-integration`, `--disable-renderer-accessibility`, `--force-renderer-accessibility[=bundle]`.'),
    ('chromium', 'content/browser/accessibility/browser_accessibility_state_impl.cc', 561, 569, '`EnableAXModeFromPlatform`: the only writer of the platform mode, and it only adds.'),
    ('chromium', 'content/browser/accessibility/browser_accessibility_state_impl.cc', 594, 596, 'What the two requests add: kAXModeBasic and kExtendedProperties.'),
    ('chromium', 'content/browser/accessibility/browser_accessibility_state_impl.cc', 602, 626, 'The other recheck for a screen reader, on an action from one: only when the mode is already complete.'),
    ('chromium', 'content/browser/accessibility/browser_accessibility_state_impl.cc', 638, 660, 'A web contents created later takes the process mode.'),
    ('chromium', 'content/browser/accessibility/browser_accessibility_state_impl.cc', 821, 835, 'A mode change goes to every web contents (a hidden one when it is shown).'),
    ('chromium', 'content/browser/accessibility/browser_accessibility_state_impl.cc', 846, 854, 'What the two disabling switches do to a platform request.'),
    ('chromium', 'content/browser/accessibility/browser_accessibility_state_impl_auralinux.cc', 39, 52, 'What counts as Orca: an argument `orca`, or the process name `orca`.'),
    ('chromium', 'content/browser/accessibility/browser_accessibility_state_impl_auralinux.cc', 145, 169, 'When the scan for Orca runs: when kExtendedProperties is added to or removed from the mode.'),
    ('chromium', 'content/browser/accessibility/browser_accessibility_state_impl_auralinux.cc', 186, 198, 'What finding Orca adds: kAXModeComplete and kScreenReader.'),
    ('chromium', 'ui/accessibility/ax_mode.h', 236, 252, 'The bundles: kAXModeBasic, kAXModeComplete.'),
    ('chromium', 'ui/accessibility/ax_mode.h', 261, 264, 'What a mode without the screen-reader flag may leave out.'),
    ('electron', 'shell/browser/native_window_views.cc', 324, 327, 'The window role Electron gives its windows.'),
    ('electron', 'shell/browser/api/electron_api_app.cc', 1205, 1209, '`app.isAccessibilitySupportEnabled()` is true only with all of kAXModeComplete.'),
    ('electron', 'shell/browser/api/electron_api_app.cc', 1292, 1309, '`app.setAccessibilitySupportEnabled` is not limited to macOS and Windows in the code (docs/api/app.md marks it so).'),
    ('at-spi2-core', 'at-spi-bus-launcher.c', 654, 669, '`IsEnabled` is GSettings `org.gnome.desktop.interface` `toolkit-accessibility`: a set writes the key.'),
    ('at-spi2-core', 'at-spi-bus-launcher.c', 689, 711, 'Setting `ScreenReaderEnabled` sets `IsEnabled` too, and writes `org.gnome.desktop.a11y.applications` `screen-reader-enabled`.'),
    ('at-spi2-core', 'at-spi-bus-launcher.c', 961, 973, 'Both start from the keys.'),
    ('orca', 'orca-autostart.desktop.in', 1, 10, 'A GNOME, MATE, Unity or Cinnamon session starts Orca when `screen-reader-enabled` turns true.'),
]
HEADINGS = {
    'chromium': f'Chromium {CHROMIUM} (the fixture\'s Electron 44.9.0 embeds it): https://chromium.googlesource.com/chromium/src/+/refs/tags/{CHROMIUM}/<path>?format=TEXT',
    'electron': 'Electron v44.9.0 (git clone --depth 1 --branch v44.9.0 https://github.com/electron/electron, fd148b9)',
    'at-spi2-core': 'at-spi2-core 2.52.0, this host\'s (https://gitlab.gnome.org/GNOME/at-spi2-core/-/raw/AT_SPI2_CORE_2_52_0/bus/at-spi-bus-launcher.c)',
    'orca': 'Orca, main as fetched 2026-11-27 (https://gitlab.gnome.org/GNOME/orca/-/raw/main/orca-autostart.desktop.in)',
}
# the hook and the bridge's checks at older releases (history, below)
HISTORY = ['80.0.3987.87', '86.0.4240.75', '90.0.4430.72', '100.0.4896.60', '110.0.5481.77', '112.0.5615.49', '114.0.5735.90', '120.0.6099.71',
           '128.0.6613.84', '134.0.6998.35', '136.0.7103.59', '138.0.7204.49', '142.0.7444.59', '146.0.7680.65', '150.0.7871.46', CHROMIUM]


def locate(scratch, root, path):
    if root == 'chromium':
        return os.path.join(scratch, 'src', 'chromium', CHROMIUM, path)
    if root == 'electron':
        return os.path.join(scratch, 'electron-src', path)
    return os.path.join(scratch, 'src', root, path)


def sha(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def history_row(scratch, tag):
    node = os.path.join(scratch, 'src', 'chromium', tag, 'ui/accessibility/platform/ax_platform_node_auralinux.cc')
    util = os.path.join(scratch, 'src', 'chromium', tag, 'ui/accessibility/platform/atk_util_auralinux.cc')
    if not os.path.exists(node) or not os.path.exists(util):
        return None
    text = open(node, errors='replace').read()
    body = re.search(r'^AtkAttributeSet\* AtkGetAttributes\(AtkObject\* atk_object\) \{(.*?)^\}', text, re.S | re.M)
    body = body.group(1) if body else ''
    if 'OnExtendedPropertiesUsedInWebContent' in body:
        hook = 'kAXModeBasic and kExtendedProperties (`OnExtendedPropertiesUsedInWebContent`)'
    elif 'EnableAXMode' in body:
        hook = 'kAXModeComplete (`EnableAXMode`)' if 'NotifyAddAXModeFlags(kAXModeComplete)' in text else '`EnableAXMode`'
    else:
        hook = 'none'
    bridge = open(util, errors='replace').read()
    checks = ['the variables'] if 'ACCESSIBILITY_ENABLED' in bridge else []
    if 'org.a11y.Status' in bridge:
        checks.append('`IsEnabled`')
    if 'toolkit-accessibility' in bridge:
        checks.append('GSettings')
    return f"| {tag} | {hook} | {', '.join(checks)} | `{sha(node)[:12]}`, `{sha(util)[:12]}` |"


def main():
    scratch, out = sys.argv[1], sys.argv[2]
    lines = ['# #228 pre-flight: the source lines cited', '',
             'Written by `probes/sources.py` from the copies fetched on 2026-11-27. Each excerpt names its file, its lines and the file\'s SHA-256.', '']
    last_root = None
    for root, path, first, last, what in EXCERPTS:
        full = locate(scratch, root, path)
        if root != last_root:
            lines += [f'## {HEADINGS[root]}', '']
            last_root = root
        text = open(full, errors='replace').read().split('\n')
        lines += [f'**`{path}` lines {first} to {last}** (SHA-256 `{sha(full)}`). {what}', '', '```']
        lines += [f'{number:5d}  {text[number - 1]}' for number in range(first, last + 1)]
        lines += ['```', '']
    lines += ['## The same two things at other Chromium releases', '',
              'What `AtkGetAttributes` (and `AtkRefRelationSet`, the same line in each) adds to the mode, and what the bridge\'s start checks, read from',
              '`ui/accessibility/platform/ax_platform_node_auralinux.cc` and `atk_util_auralinux.cc` at each tag (the two files\' SHA-256, first 12 digits).',
              'Electron embeds Chromium 108 in 22.3.27, 128 in 32.3.0, 136 in 36.0.0, 138 in 37.0.0 and 152 in 44.9.0 (`out/versions.jsonl`); 87 in Electron 11 and 112 in',
              'Electron 24 are from Electron\'s release notes, not probed.', '',
              '| Chromium | the two requests add | the bridge\'s start checks | files |', '|---|---|---|---|']
    for tag in HISTORY:
        row = history_row(scratch, tag)
        if row:
            lines.append(row)
    lines.append('')
    with open(out, 'w') as f:
        f.write('\n'.join(lines))
    print(f'{out}: {len(lines)} lines')


if __name__ == '__main__':
    main()
