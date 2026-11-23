#!/usr/bin/env python3
# Task 89: m5/x64/README.md assembled from README.draft.md, its section files, and the step tables step-table.mjs wrote
# (table-out.md, table-rerun1.md), with each step's result in the words of its own summary (RESULT below).
# usage: assemble.py <out README path>
import re, subprocess, sys
T = '/Users/new/.local/share/cua-171/task89/'
rd = lambda f: open(T + f).read()

RESULT = {
    'V1': "every verdict PASS: 6 cua rows; their speed series 7 faster, 1 within the bound; gedit's caret and bus-trace cases pass",
    'V2': 'every verdict PASS: 15 cua rows; their speed series 26 faster, 1 same within noise, 1 within the bound',
    'V3': 'no verdict FAIL: 41 cua rows (37 pass, 20 speed series faster); listed apart: #373 declared gap (within its 15 ms bound), 2 declared unconfirmed, 1 declared refusal',
    'V4': 'every verdict PASS: 22 cua rows; their speed series 4 faster; every paste case',
    'V5 (1)': "**stopped** by wrap71's outside-peer flag on the run's own audit proxy (:40) at 968 s: no verdict made; a guard false stop, rulings 749, 750 (below)",
    'V5 (2)': '**FAIL as recorded** on 2 device-chrome-dnd cells; **re-judged at H′: no failure left** (late take by 680, chrome_dnd_shared by 756; below)',
    'Z0': "PASS: Firefox's plain drop 30/30 on :0 (the cua:0ms control 0/30), Writer's select 30/30",
    'D1': 'PASS (Chrome: canvas, drag and drop with #358 declared, the thumb at the pinned mean)',
    'D2': "PASS (Electron's cells, its thumb at the pinned mean)",
    'D3': "PASS (Firefox's cells, its canvas on speed)",
    'D4': "PASS (the GTK and Qt editors' cells)",
    'D5': 'PASS (Writer unprimed, the terminals, GTK 4, Writer through gen)',
    'R1': 'repl-parity 34 cases on each lane, the diff exit 0; the prepared home pinned',
    'R2': '`VERDICT: PASS` by in-cell time; unproved.txt empty',
    'R3': 'linux-native passes; engine watch PASS: only the home\'s installed cua-engine, under the trusted worker, no sky_linux',
    'R4': 'linux-device-mode passes; engine watch PASS',
    'FB': 'every step PASS (the truncation line)',
    'E1': 'complete: desktop move first and later faster; every scenario the same or the declared answer',
    'S1': 'complete (#302 counted toward its streak, listed apart)',
    'S2': 'complete', 'S3': 'complete', 'S4': 'complete', 'F1a': 'complete', 'F1b': 'complete', 'F2': 'complete',
    'ES': 'complete (every run one engine under its session, the installed path)',
    'P1': 'every cell PASS (8 of 8)', 'P2': 'every cell PASS (8 of 8)', 'P3': 'every cell PASS (8 of 8)', 'P4': 'every cell PASS (8 of 8)', 'P6': "every cell PASS (8 of 8), Firefox's dnd 30/30 by P6's Fisher judge (p = 1.0 against the pinned build)", 'P5': 'every cell PASS (5 of 5: the leave cases)',
    'H1': 'no false ok, no missing landing, no false error; findings counted', 'H2': 'the same, at the gate\'s window load',
    'C1': 'every late take reported (9 of 9)',
    'L1': "the judges' verdict PASS (thumbs and ranges at 40 a side)", 'L2a': "the judges' verdict PASS", 'L2b': "the judges' verdict PASS", 'L2c': "the judges' verdict PASS",
    'L3a': 'complete', 'L3b': 'complete (#302 listed apart)', 'L3c': 'complete', 'L3d': 'complete', 'L3e': 'complete',
    'L4a': 'no false ok, no missing landing; findings counted', 'L4b': 'complete; findings counted (6 false releases on the measurement lane)',
    'L4c': 'every late take reported (16 of 16)', 'L5': 'complete', 'F3a': 'complete', 'F3b': 'complete', 'F4': 'complete',
}

def rows(table, date_of):
    out = {}
    for line in open(T + table):
        c = [x.strip() for x in line.split('|')[1:-1]]
        if len(c) < 9 or c[0] in ('step', '---') or c[0].startswith('-'):
            continue
        out[c[0]] = c[:9]
    return out

idle = rows('table-out.md', None)
rerun = rows('table-rerun1.md', None)
order = [l.split()[0] for l in rd('list.txt').split('\n')[2:] if re.match(r'^[A-Z][0-9A-Za-z]* +\d+ min', l)]
DATE = lambda step, acq: ('11-16' if step in ('V1',) or (acq and acq >= '12:00') else '11-17')
lines = ['Lock lines are from `~/.local/share/cua-171/host-lock.log`, holder `t5-x64` (`scripts/lock-lines.txt`); the `:0`',
         "steps' times are from their sitting's `zero.log` (one lock hold a sitting). Load is the 1-, 5- and 15-minute average.",
         "mawsd's render host ran during none of them (`render-host=none` on every lock line). The driver held each private",
         'step until the 1-minute load was under 1.0, for up to 15 minutes: at twice the load the 5- and 15-minute averages were',
         "still the previous step's. \"Stands on\" is the SHA whose judge the step's verdict is read by.", '',
         '| step | stands on | out | acquire (UTC) | release | min | exit | load at acquire | load at release | end | result |',
         '|---|---|---|---|---|---:|---:|---|---|---|---|']
for s in order:
    if s == 'V5':
        for tag, src, outdir in (('V5 (1)', idle, 'out'), ('V5 (2)', rerun, 'out-rerun1')):
            c = src['V5']
            sha = 'fefe306c' if tag == 'V5 (1)' else 'fefe306c ran; **re-judged at H′ 0495b1a7**'
            lines.append(f"| {tag} | {sha} | {outdir} | 11-17 {c[2]} | {c[3]} | {c[4]} | {c[5]} | {c[6]} | {c[7]} | all-clear {'NOT clear (hold-sittings)' if tag == 'V5 (1)' else 'clear'} | {RESULT[tag]} |")
        continue
    if s == 'Z0':
        c = rerun['Z0']; outdir = 'out-rerun1'
    else:
        c = idle.get(s); outdir = 'out'
    if not c:
        lines.append(f'| {s} | – | – | – | – | – | – | – | – | – | not run |')
        continue
    zero = s.startswith('V') or s == 'Z0'
    end = 'all-clear clear' if zero else c[8]
    end = end.replace('a process it spawned still runs: ', '').replace('; end check clear', '; end check clear')
    date = '11-16' if (s in ('V1',) or (not zero and c[2] >= '12:00')) else '11-17'
    lines.append(f"| {s} | fefe306c | {outdir} | {date} {c[2]} | {c[3]} | {c[4]} | {c[5]} | {c[6]} | {c[7]} | {end} | {RESULT.get(s, '')} |")
table = '\n'.join(lines)

npm = rd('npm-sets.md')
guard = subprocess.run(['python3', '-I', T + 'guard-rows.py', 'sitting 1', '/Users/new/.local/share/cua-171/m5/out-x64/V1.pinned-release', '/Users/new/.local/share/cua-171/m5/out-x64/V2.pinned-release', '/Users/new/.local/share/cua-171/m5/out-x64/V3.pinned-release', '/Users/new/.local/share/cua-171/m5/out-x64/V4.pinned-release', '/Users/new/.local/share/cua-171/m5/out-x64/V5.pinned-release'], capture_output=True, text=True).stdout
guard += subprocess.run(['python3', '-I', T + 'guard-rows.py', 'sitting 2', '/Users/new/.local/share/cua-171/m5/out-x64-rerun1/V5.pinned-release', '/Users/new/.local/share/cua-171/m5/out-x64-rerun1/Z0.pinned-release'], capture_output=True, text=True).stdout
guard += subprocess.run(['python3', '-I', T + 'guard-rows.py', 'F3', '/Users/new/.local/share/cua-171/m5/f3-out-x64/V2.development-run', '/Users/new/.local/share/cua-171/m5/f3-out-x64/V3.development-run'], capture_output=True, text=True).stdout
sit = rd('sec-sittings.md').replace('<GUARD_ROWS>\n', guard)
for k, v in (('<F3_HOLD>', rd('f3-hold.txt').strip()), ('<F3_HARD>', '12:11:18'), ('<F3_CLEAR>', rd('f3-clear.txt').strip())):
    sit = sit.replace(k, v)
doc = rd('README.draft.md')
for k, v in (('<STATUS>', rd('sec-status.md').strip()), ('<NPM_SETS>', npm.strip()), ('<STEP_TABLE>', table), ('<SITTINGS>', sit.strip()),
             ('<V5>', rd('sec-v5.md').strip()), ('<ITEM2>', rd('sec-item2.md').strip()), ('<ITEM3>', rd('sec-item3.md').strip()),
             ('<DECLARED>', rd('sec-declared.md').strip()), ('<UNCLEAN>', rd('sec-unclean.md').strip()), ('<F3>', rd('sec-f3.md').strip()),
             ('<FILES>', rd('sec-files.md').strip())):
    doc = doc.replace(k, v)
left = re.findall(r'<[A-Z0-9_]+>', doc)
assert not left, left
open(sys.argv[1], 'w').write(doc)
print('wrote', sys.argv[1], len(doc.split('\n')), 'lines')
