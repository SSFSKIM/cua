# proto-edit.py: task 20's candidates as measurement flags in the scratch engine copy (never in the worktree).
#   --drag-first-step-px N   the first motion after the press goes straight to the first sample N px out (0: off)
#   --drag-take-wait-ms B    after that step, wait up to B for the target's take before the remaining steps (0: off)
#   --drag-take-wait-all     the wait for every family (a); without it only Chromium-family windows (b)
#   --drag-min-ms T          (c) a Chromium drag with no take yet spreads its steps so the release comes no sooner
#                            than T after the press (0: off)
# --stats gains `take_wait` {waited_ms, taken, first_step} and `min_drag` {release_after_press_ms}.
import re
root = '/Users/new/.local/share/cua-171/task20/proto/linux-engine/src/'

def sub(path, old, new, count=1):
    s = open(root + path).read()
    assert s.count(old) >= 1, (path, old[:60])
    s = s.replace(old, new, count)
    open(root + path, 'w').write(s)

sub('engine.rs', "    pub dnd_after_take: std::time::Duration,\n}", """    pub dnd_after_take: std::time::Duration,
    /// Task 20 candidates, measurement only (proto).
    pub first_step_px: u16,
    pub take_wait: std::time::Duration,
    pub take_wait_all: bool,
    pub min_drag: std::time::Duration,
}""")
sub('main.rs', "        dnd_after_take: crate::dnd::RELEASE_AFTER_TAKE,\n    }", """        dnd_after_take: crate::dnd::RELEASE_AFTER_TAKE,
        first_step_px: 0,
        take_wait: std::time::Duration::ZERO,
        take_wait_all: false,
        min_drag: std::time::Duration::ZERO,
    }""")
sub('main.rs', """            "--dnd-defer-take" => {""", """            "--drag-take-wait-all" => {
                cfg.take_wait_all = true;
                takes_value = false;
            }
            "--dnd-defer-take" => {""")
sub('main.rs', """            "--drag-dnd-after-take-ms" =>""", """            "--drag-first-step-px" => cfg.first_step_px = number(value, arg)?.min(1000) as u16,
            "--drag-take-wait-ms" => cfg.take_wait = Duration::from_millis(number(value, arg)?),
            "--drag-min-ms" => cfg.min_drag = Duration::from_millis(number(value, arg)?),
            "--drag-dnd-after-take-ms" =>""")

# pointer.rs: drag_along gets the candidates
p = 'engine/pointer.rs'
sub(p, """    after_take: Duration,
    scheduled: &mut Option<Value>,
) -> Result<()> {""", """    after_take: Duration,
    scheduled: &mut Option<Value>,
    cand: &Candidates,
    cand_stats: &mut Option<Value>,
) -> Result<()> {""")
sub(p, """        let samples = drag_samples(points);
        let count = samples.len();""", """        let mut samples = drag_samples(points);
        // (a, b): the first motion after the press straight to the first sample `first_step_px` out
        let mut first_step = None;
        if cand.first_step_px > 0 {
            let (x0, y0) = samples[0];
            let far = |&(sx, sy): &(i16, i16)| {
                (sx as i32 - x0 as i32).abs() >= cand.first_step_px as i32 || (sy as i32 - y0 as i32).abs() >= cand.first_step_px as i32
            };
            if let Some(k) = samples.iter().position(far)
                && k > 1
            {
                samples.drain(1..k);
            }
            first_step = Some(1usize);
        }
        let count = samples.len();
        let pressed_at = Instant::now();
        let mut take_wait: Option<(bool, Duration)> = None;""")
sub(p, """            route.place_again(x, sx, sy)?;
            let mut wait = pacing.step;
            if let Some((watch, _)) = hold.as_mut()
                && !after_take.is_zero()
            {
                match taken {
                    Some((at, left)) => {
                        since_take += 1;
                        let due = crate::dnd::step_due(at, after_take, since_take, left);
                        wait = wait.max(due.saturating_duration_since(Instant::now()));
                    }
                    None if watch.started(x) => taken = Some((Instant::now(), count - 1 - i)),
                    None => {}
                }
            }
            std::thread::sleep(wait);""", """            route.place_again(x, sx, sy)?;
            let mut wait = pacing.step;
            if let Some((watch, _)) = hold.as_mut() {
                match taken {
                    Some((at, left)) if !after_take.is_zero() => {
                        since_take += 1;
                        let due = crate::dnd::step_due(at, after_take, since_take, left);
                        wait = wait.max(due.saturating_duration_since(Instant::now()));
                    }
                    Some(_) => {}
                    None if watch.started(x) => taken = Some((Instant::now(), count - 1 - i)),
                    None => {
                        // (c): no take yet, the steps spread so the release comes no sooner than min_drag after the press
                        if !cand.min_drag.is_zero() && cand.min_applies {
                            let due = pressed_at + cand.min_drag.mul_f64((i + 1) as f64 / count as f64);
                            wait = wait.max(due.saturating_duration_since(Instant::now()));
                        }
                    }
                }
                // (a, b): after the first step, a bounded wait for the take before the remaining steps
                if first_step == Some(i) && !cand.take_wait.is_zero() && cand.wait_applies && taken.is_none() {
                    std::thread::sleep(wait);
                    wait = Duration::ZERO;
                    let since = Instant::now();
                    while !watch.started(x) && since.elapsed() < cand.take_wait {
                        std::thread::sleep(Duration::from_micros(500));
                    }
                    let got = watch.is_started();
                    take_wait = Some((got, since.elapsed()));
                    if got {
                        taken = Some((Instant::now(), count - 1 - i));
                    }
                }
            }
            std::thread::sleep(wait);""")
sub(p, """        if let Some((at, left)) = taken {
            *scheduled =""", """        *cand_stats = Some(json!({
            "first_step": first_step.is_some(),
            "samples": count,
            "take_wait": take_wait.map(|(t, w)| json!({ "taken": t, "waited_ms": w.as_secs_f64() * 1000.0 })),
            "release_after_press_ms": pressed_at.elapsed().as_secs_f64() * 1000.0,
            "taken": taken.is_some(),
        }));
        if let Some((at, left)) = taken {
            *scheduled =""")
# the Candidates struct
sub(p, """#[derive(Debug)]
pub(super) struct DropCancelled;""", """/// Task 20's candidates for one drag (proto, measurement only).
pub(super) struct Candidates {
    first_step_px: u16,
    take_wait: Duration,
    wait_applies: bool,
    min_drag: Duration,
    min_applies: bool,
}

#[derive(Debug)]
pub(super) struct DropCancelled;""")
# drag(): hold for the candidates, and the candidates' scope
sub(p, """        let mut hold = match dropping_into {
            Some(window)
                if guard.is_none()
                    && !(self.cfg.dnd_wait.is_zero() && self.cfg.dnd_after_take.is_zero())
                    && self
                        .family_of(window)
                        .is_some_and(|f| crate::dnd::release_waits_after_take(f.name)) =>
            {
                Some(DndWatch::start(&mut self.x, window)?)
            }
            _ => None,
        };
        let after_take = self.cfg.dnd_after_take;""", """        let chromium = dropping_into
            .map(|w| self.family_of(w).is_some_and(|f| crate::dnd::release_waits_after_take(f.name)))
            .unwrap_or(false);
        let cand = Candidates {
            first_step_px: if chromium || self.cfg.take_wait_all { self.cfg.first_step_px } else { 0 },
            take_wait: self.cfg.take_wait,
            wait_applies: chromium || self.cfg.take_wait_all,
            min_drag: self.cfg.min_drag,
            min_applies: chromium,
        };
        let wants_watch = (chromium
            && !(self.cfg.dnd_wait.is_zero()
                && self.cfg.dnd_after_take.is_zero()
                && self.cfg.take_wait.is_zero()
                && self.cfg.min_drag.is_zero()))
            || (self.cfg.take_wait_all && !self.cfg.take_wait.is_zero());
        let mut hold = match dropping_into {
            Some(window) if guard.is_none() && wants_watch => Some(DndWatch::start(&mut self.x, window)?),
            _ => None,
        };
        let after_take = if chromium { self.cfg.dnd_after_take } else { Duration::ZERO };
        let mut cand_stats = None;""")
sub(p, """                after_take,
                &mut scheduled,
            );""", """                after_take,
                &mut scheduled,
                &cand,
                &mut cand_stats,
            );""")
sub(p, """        if let Some(scheduled) = scheduled {
            self.extra.insert("after_take".into(), scheduled);
        }""", """        if let Some(scheduled) = scheduled {
            self.extra.insert("after_take".into(), scheduled);
        }
        if let Some(c) = cand_stats {
            self.extra.insert("take_wait".into(), c);
        }""")
