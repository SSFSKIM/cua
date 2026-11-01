#!/usr/bin/env python3
"""Task 22 step A scratch harness: run.mjs keeps the scratch engine's `scratch` stats, and with SCRATCH_WARM_FIRST=<op>
the named operation's series engine first serves a window state with a screenshot (its window retained, the engine's
first request spent) before its cold sample's preparation. Never committed."""
import sys
from pathlib import Path

p = Path(sys.argv[1])
s = p.read_text()

def sub(old, new):
    global s
    if s.count(old) != 1:
        raise SystemExit(f"expected one of {old!r}")
    s = s.replace(old, new)

sub("    if (stats.press) row.press = stats.press;\n",
    "    if (stats.press) row.press = stats.press;\n    if (stats.scratch) row.scratch = stats.scratch;\n")
sub("  if (def.prepare || needsIds) {\n",
    "  if (i === 0 && process.env.SCRATCH_WARM_FIRST === op && target) {\n"
    "    const warm = await ctx.witnessed(() => engine.request('get_window_state', { window: { id: target.id }, include_screenshot: true }));\n"
    "    ctx.warmedFirst = { ok: warm.response.ok === true, ms: Math.round(warm.ms * 10) / 10 };\n"
    "  }\n"
    "  if (def.prepare || needsIds) {\n")
sub("  if (ctx.prepareError) row.prepare_error = ctx.prepareError;\n",
    "  if (ctx.prepareError) row.prepare_error = ctx.prepareError;\n  if (ctx.warmedFirst) row.warmed_first = ctx.warmedFirst;\n")
sub("    const stubScene = needsStub ? await desktop.openChrome('stub', 'scene.html') : null;\n",
    "    const stubScene = needsStub ? await desktop.openChrome('stub', 'scene.html') : null;\n"
    "    if (process.env.SCRATCH_BALLAST === 'gate') {\n"
    "      const { GATE_BALLAST } = await import('./dnd.mjs');\n"
    "      for (const [scene, k] of Object.entries(GATE_BALLAST)) for (let j = 0; j < k; j++) await openScene(desktop, scene, `ballast${j}`, { text: ['chrome-textarea', 'chrome-address-bar'].includes(scene) });\n"
    "    }\n")
p.write_text(s)
print("harness patched")
