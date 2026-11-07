# #313 offline: the cells whose reading differs between A and B, from read.mjs's output (the window order's indices,
# which vary run to run, left out).   python3 -I diff.py <read.mjs output>
import re
import sys

cells, header = {}, None
for line in open(sys.argv[1]):
    m = re.match(r'### (\S+) ([ab]) (\S+) (\S+)', line)
    if m:
        header = m.groups()
        if header[2] == 'native':
            header = header[:3] + ('native',)
        continue
    if header and line.startswith('    '):
        label = line.split()[0]
        text = re.sub(r' order=\S+ \S+', '', line.strip())
        art, head, browser, kit = header
        cells.setdefault((art, browser, kit, label), {})[head] = text
same = diff = 0
for key, heads in sorted(cells.items()):
    if heads.get('a') == heads.get('b'):
        same += 1
        continue
    diff += 1
    print('/'.join(key))
    print('  A', heads.get('a'))
    print('  B', heads.get('b'))
print(f'{same} cells identical, {diff} differ')
