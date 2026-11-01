#!/usr/bin/env python3
"""Task 22 step A scratch engine, second patch (after hold1): after a take, the release's floor (350 ms after the take)
is filled with motions, never a silent wait: a step after the take waits at most KEEP (12 ms) and the floor's rest
re-visits the path's second-to-last sample and its last, KEEP apart, ending on the last. A take seen at or after the
path's last sample gets the floor too. CUA_SCRATCH_DRAG_STEP_US fixes the drag step (the forced-held lane)."""
import sys
from pathlib import Path

root = Path(sys.argv[1])
p = root / "src/engine/pointer.rs"
s = p.read_text()

def sub(old, new):
    global s
    if s.count(old) != 1:
        raise SystemExit(f"expected one of {old!r}, found {s.count(old)}")
    s = s.replace(old, new)

sub("""                        let due = crate::dnd::step_due(at, after_take, since_take, left);
                        wait = wait.max(due.saturating_duration_since(Instant::now()));""",
    """                        let due = crate::dnd::step_due(at, after_take, since_take, left);
                        wait = wait.max(due.saturating_duration_since(Instant::now()).min(KEEP));""")

old = s[s.index("        if let Some((hold, bound)) = hold.as_mut()\n            && !bound.is_zero()\n            && taken.is_none()"):s.index("        std::thread::sleep(pacing.release);\n        // the last look before the release")]
new = """        // scratch: a take not seen during the path: wait for it up to the bound
        let mut late_take: Option<Instant> = None;
        if let Some((hold, bound)) = hold.as_mut()
            && taken.is_none()
        {
            let since = Instant::now();
            if hold.started(x) {
                late_take = Some(since);
                *waited = Some((true, Duration::ZERO));
            } else if !bound.is_zero() {
                while !hold.started(x) && since.elapsed() < *bound {
                    std::thread::sleep(Duration::from_millis(2));
                }
                let seen = hold.is_started();
                *waited = Some((seen, since.elapsed()));
                if seen {
                    late_take = Some(Instant::now());
                }
            }
        }
        // scratch: the floor filled with motions on the path's last two samples, ending on the last
        let floor_from = late_take.or(taken.map(|(at, _)| at));
        if let Some(at) = floor_from
            && !after_take.is_zero()
        {
            let all = drag_samples(points);
            let last = *all.last().expect("a drag has samples");
            let before = if all.len() > 1 { all[all.len() - 2] } else { last };
            let due = at + after_take;
            let mut keepalives = 0u32;
            while Instant::now() < due {
                route.place_again(x, before.0, before.1)?;
                route.place_again(x, last.0, last.1)?;
                keepalives += 1;
                std::thread::sleep(KEEP.min(due.saturating_duration_since(Instant::now())));
            }
            KEEPALIVES.store(keepalives, std::sync::atomic::Ordering::Relaxed);
        }
"""
s = s.replace(old, new)
sub("pub static SCRATCH:", "const KEEP: Duration = Duration::from_millis(12);\npub static KEEPALIVES: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);\npub static SCRATCH:")
sub("""                        "bound_ms": bound.as_secs_f64() * 1000.0,""",
    """                        "bound_ms": bound.as_secs_f64() * 1000.0,
                        "keepalives": KEEPALIVES.swap(0, std::sync::atomic::Ordering::Relaxed),""")
p.write_text(s)

m = root / "src/main.rs"
u = m.read_text()
old = "        dnd_after_take: crate::dnd::RELEASE_AFTER_TAKE,\n"
if u.count(old) != 1:
    raise SystemExit("main.rs dnd_after_take")
u = u.replace(old, old + "        // scratch: CUA_SCRATCH_DRAG_STEP_US fixes the drag's step\n")
# applied after parsing: find the parse function's return of the server config is complex; set at the default instead
u = u.replace(
    "        dnd_wait: std::time::Duration::from_millis(",
    "        // (scratch drag step: see engine.rs)\n        dnd_wait: std::time::Duration::from_millis(",
)
m.write_text(u)

e = root / "src/engine.rs"
t = e.read_text()
old = "        if let Some(fixed) = self.cfg.pacing.drag {\n            return fixed;\n        }\n"
if t.count(old) != 1:
    raise SystemExit("engine.rs pacing")
t = t.replace(old, old.replace("        if let Some(fixed)", "        if let Some(us) = std::env::var(\"CUA_SCRATCH_DRAG_STEP_US\").ok().and_then(|v| v.parse::<u64>().ok()) {\n            return DragPacing { step: std::time::Duration::from_micros(us), ..DragPacing::NONE };\n        }\n        if let Some(fixed)", 1))
e.write_text(t)
print("patched keepalive")
