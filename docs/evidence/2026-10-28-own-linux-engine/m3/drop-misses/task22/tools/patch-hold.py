#!/usr/bin/env python3
"""Task 22 step A scratch engine: the hold measured, never committed.

- `CUA_SCRATCH_DND_WAIT_MS` (env) sets the hold's bound (the existing `--drag-dnd-wait-ms`), 0 by default.
- The hold waits only when no take came by the path's end; after a take seen in the wait, the pointer is nudged a pixel
  and back and the release comes no sooner than RELEASE_AFTER_TAKE (350 ms) after the take.
- Every Chromium drag records, on its --stats line under `scratch`: the press's and the take's server times and the
  take's delay after the press (server ms), the path's end after the press (ms), and for a held drag the wait.
"""
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
p = root / "src/engine/pointer.rs"
s = p.read_text()

def sub(old, new, count=1):
    global s
    if s.count(old) != count:
        raise SystemExit(f"expected {count} of {old!r}, found {s.count(old)}")
    s = s.replace(old, new)

# statics: the press's server time and instant, the path's end
sub("use crate::x11::X11;\n", "use crate::x11::X11;\n\npub static SCRATCH: std::sync::Mutex<Option<(Option<u32>, Instant, Option<Instant>)>> = std::sync::Mutex::new(None);\n")

# the press: in the atomic press, after the button
sub("        route.button(x, 1, true)?;\n        *pressed = true;\n",
    "        route.button(x, 1, true)?;\n        *SCRATCH.lock().unwrap() = Some((route.event_time(), Instant::now(), None));\n        *pressed = true;\n")
# the plain press
sub("                route.button(x, 1, true)?;\n                pressed = true;\n                0\n",
    "                route.button(x, 1, true)?;\n                *SCRATCH.lock().unwrap() = Some((route.event_time(), Instant::now(), None));\n                pressed = true;\n                0\n")

old_hold = """        if let Some((hold, bound)) = hold.as_mut()
            && !bound.is_zero()
        {
            let since = Instant::now();
            while !hold.started(x) && since.elapsed() < *bound {
                std::thread::sleep(Duration::from_millis(2));
            }
            let taken = hold.is_started();
            *waited = Some((taken, since.elapsed()));
            if taken {
                let &(lx, ly) = points.last().expect("a drag has two points");
                route.place_again(x, lx.saturating_add(1), ly)?;
                route.place_again(x, lx, ly)?;
            }
        }
"""
new_hold = """        if let Some(s) = SCRATCH.lock().unwrap().as_mut() {
            s.2 = Some(Instant::now());
        }
        if let Some((hold, bound)) = hold.as_mut()
            && !bound.is_zero()
            && taken.is_none()
            && !hold.started(x)
        {
            let since = Instant::now();
            while !hold.started(x) && since.elapsed() < *bound {
                std::thread::sleep(Duration::from_millis(2));
            }
            let seen = hold.is_started();
            let take_seen = Instant::now();
            *waited = Some((seen, since.elapsed()));
            if seen {
                let &(lx, ly) = points.last().expect("a drag has two points");
                route.place_again(x, lx.saturating_add(1), ly)?;
                route.place_again(x, lx, ly)?;
                let due = take_seen + after_take;
                std::thread::sleep(due.saturating_duration_since(Instant::now()));
            }
        }
"""
sub(old_hold, new_hold)
p.write_text(s)

# the engine's drag: the scratch record on --stats
s = p.read_text()
sub("""        if let Some(scheduled) = scheduled {
            self.extra.insert("after_take".into(), scheduled);
        }
""", """        if let Some(scheduled) = scheduled {
            self.extra.insert("after_take".into(), scheduled);
        }
        let scratch_press = SCRATCH.lock().unwrap().take();
""")
sub("""        if let Some(mut hold) = hold {
            taken = hold.started(&mut self.x);
""", """        if let Some(mut hold) = hold {
            taken = hold.started(&mut self.x);
            if let Some((press_time, pressed_at, path_end)) = scratch_press {
                let take_time = hold.first_take_time();
                self.extra.insert(
                    "scratch".into(),
                    json!({
                        "press_time": press_time,
                        "take_time": take_time,
                        "take_after_press_ms": match (press_time, take_time) {
                            (Some(p), Some(t)) => Some(i64::from(t) - i64::from(p)),
                            _ => None,
                        },
                        "path_end_after_press_ms": path_end.map(|e| e.duration_since(pressed_at).as_secs_f64() * 1000.0),
                        "bound_ms": bound.as_secs_f64() * 1000.0,
                    }),
                );
            }
""")
p.write_text(s)

# DndWatch: the first take's server time
d = root / "src/dnd.rs"
t = d.read_text()
def dsub(old, new):
    global t
    if t.count(old) != 1:
        raise SystemExit(f"dnd.rs: expected one of {old!r}")
    t = t.replace(old, new)
dsub("    mask: u32,\n    started: bool,\n}\n", "    mask: u32,\n    started: bool,\n    first_take: Option<u32>,\n}\n")
dsub("            mask: x.conn.setup().resource_id_mask,\n            started: false,\n        })", "            mask: x.conn.setup().resource_id_mask,\n            started: false,\n            first_take: None,\n        })")
dsub("""                self.started |= taken_by_target(report.owner, self.target, self.mask);
""", """                if taken_by_target(report.owner, self.target, self.mask) {
                    self.started = true;
                    self.first_take.get_or_insert(report.timestamp);
                }
""")
dsub("""    /// Whether a drag and drop was seen to start.
""", """    /// Scratch: the first take's server time.
    pub fn first_take_time(&self) -> Option<u32> {
        self.first_take
    }

    /// Whether a drag and drop was seen to start.
""")
d.write_text(t)

# main.rs: the bound from the environment
m = root / "src/main.rs"
u = m.read_text()
old = "        dnd_wait: std::time::Duration::ZERO,\n"
if u.count(old) != 1:
    raise SystemExit("main.rs dnd_wait default")
u = u.replace(old, "        dnd_wait: std::time::Duration::from_millis(std::env::var(\"CUA_SCRATCH_DND_WAIT_MS\").ok().and_then(|v| v.parse().ok()).unwrap_or(0)),\n")
m.write_text(u)
print("patched")
