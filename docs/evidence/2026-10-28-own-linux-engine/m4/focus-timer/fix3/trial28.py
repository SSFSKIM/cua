#!/usr/bin/env python3
# Task 56 fix 3: the never-taken probe's direct-2 trial 28, traced from its rows. The terminal's text is the stream its
# recorder echoed: the probe's fill (`abcDefgHPasted` 110 times), then each earlier run's bytes (`got_bytes`), then
# this run's keys; VTE shows it in rows of 69 with no newline at a soft wrap, 20 rows, and a final newline. The run's
# own record says what the paste observed (count, caret) and what the field held when the confirmation gave up.
# Checked here: that the reconstruction gives the observed count and caret and the count at the end; that the paste
# landed whole with one row scrolled out; how often the paste text occurs in the expected text (the old rule's count);
# and whether any reading short of the whole paste (none of it, or its first characters, at the caret, less a prefix
# ending where a row starts) gives the same text (the new rule's question).
# usage: python3 -I trial28.py <direct-2/runs.jsonl>
import json
import sys

runs = [json.loads(l) for l in open(sys.argv[1]) if '"kind":"run"' in l]
trial = runs[28]
stream = 'abcDefgHPasted' * 110 + ''.join(r['got_bytes'] for r in runs[:28]) + 'abcDefgH'
rows = len(stream) // 69
visible = stream[(rows - 19) * 69:]
before = visible + '\n'
at = len(visible)
starts = list(range(0, at + 1, 69))[:20]
paste = trial['pasted']
expected = before[:at] + paste + before[at:]
after = expected[69:]
print('paste text', paste, '| its record:', trial['paste']['observed'], 'unconfirmed_around', trial['paste']['unconfirmed_around'])
print('reconstructed: count', len(before), 'caret', at, '| after one row out:', len(after), 'characters')
print('the paste text occurs', sum(1 for i in range(len(expected)) if expected.startswith(paste, i)), 'times in the expected text')
short = []
for k in starts:
    landed = len(after) + k - len(before)
    if 0 <= landed < len(paste):
        candidate = before[:at] + paste[:landed] + before[at:]
        if candidate[k:] == after:
            short.append((k, landed))
print('readings short of the whole paste that give the same text:', short or 'none')
