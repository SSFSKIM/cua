# probe6c: frames 03–08 removed

`6-space-03.png` through `6-space-08.png` were removed on 2026-11-03. Each shot captured the screen region at TextEdit's window bounds (`probe.jsonl`'s `bounds`), not TextEdit's window alone. While the owner was on the second Space, that region showed the owner's own terminal window over the fixture, so these six frames held another window's contents, which don't belong in a public repository.

What they showed, for the record: the owner's terminal covered the fixture region in all six. The cursor overlay (circle and `cursor235` badge) showed at the fixture's position in 04–08 and not in 03. Frames 00–02 and 09–19 show the fixture alone and are kept. `probe.jsonl` and `log` are unchanged.

Later sittings capture a window by its window ID (`screencapture -l <id>`), which leaves other windows out.
