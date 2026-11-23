# x64 V5 at H8: its printed line against H6's (task 123's zero-commands.txt), with each head's checkout, home, out root
# and holder put to placeholders, argument by argument. Read-only.  python3 -I compare-v5-line.py
D = '/Users/new/.local/share/cua-171'
def line(p):
    ls = open(p).read().splitlines()
    return ls[ls.index('== V5') + 1]
norm = [
    ('/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t129-x64', '<checkout>'),
    ('/Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64', '<checkout>'),
    (D + '/m5/home-x64-043', '<home>'), (D + '/m5/home-x64-042', '<home>'),
    (D + '/m5/zero-x64-h8', '<out>'), (D + '/m5/zero-x64-h6', '<out>'),
    ('h8-x64', '<holder>'), ('task123-x64', '<holder>'),
]
def n(s):
    for a, b in norm:
        s = s.replace(a, b)
    return s.split(' ')
h6, h8 = n(line(D + '/task123/zero-commands.txt')), n(line(D + '/v5h8/zero-commands.txt'))
print(f'H6 {len(h6)} arguments, H8 {len(h8)} arguments')
same = h6 == h8
print('identical once the checkout, home, out root and holder are placeholders' if same else 'DIFFERENT:')
if not same:
    import difflib
    for d in difflib.unified_diff(h6, h8, 'H6', 'H8', lineterm='', n=0):
        print(d)
