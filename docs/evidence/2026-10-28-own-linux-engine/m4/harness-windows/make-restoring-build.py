# The negative control's harness build (task 35): the worktree's harness scripts copied, with the restore the harness
# made until M4's rule put back into `closeEverything` (before its trace stops, where the old build activated the
# window found active at the start). argv[1]: the output directory.
import os
import shutil
import sys

WT = '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff'
out = sys.argv[1]
shutil.rmtree(out, ignore_errors=True)
os.makedirs(out)
for name in os.listdir(WT):
    if name.endswith('.mjs'):
        shutil.copy(os.path.join(WT, name), os.path.join(out, name))
for name in ('xprobe', 'pages'):
    os.symlink(os.path.join(WT, name), os.path.join(out, name))

path = os.path.join(out, 'scenes.mjs')
s = open(path).read()
anchor = '    if (this.trace) this.ending = await this.finishTrace();\n'
assert s.count(anchor) == 1
restore = """    // the restore the harness made until M4's rule, put back for the negative control
    if (this.startActive) {
      try {
        xdotool('windowactivate', this.startActive);
      } catch {
        // the previously active window is gone
      }
    }
"""
s = s.replace(anchor, restore + anchor)
open(path, 'w').write(s)
print(f'restoring build in {out}')
