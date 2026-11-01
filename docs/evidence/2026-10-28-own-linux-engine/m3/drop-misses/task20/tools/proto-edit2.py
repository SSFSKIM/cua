# proto-edit2.py: two more task 20 candidates in the scratch engine (measurement flags, never in the worktree).
#   --drag-atomic-press   (c1) on a Chromium window, the press and every sample up to the first past Blink's 4 px drag
#                         threshold are sent under one server grab, with no pacing between, so no other client's
#                         request (a window mapped under the real pointer, a grab, an XTEST motion) can fall between the
#                         press and the move that starts the drag
#   --drag-stray-watch    (c2) on a Chromium window, a connection of the engine's own selects the real pointer's
#                         crossing and motion events on the target window during the drag (synthetic events reach
#                         only the window's owner, so it sees only events that are not the drag's), polled every step;
#                         `--stats` `stray` {events: [[kind, ms after the press, mode]], before_take}
root = '/Users/new/.local/share/cua-171/task20/proto/linux-engine/src/'

def sub(path, old, new, count=1):
    s = open(root + path).read()
    assert s.count(old) >= 1, (path, old[:70])
    s = s.replace(old, new, count)
    open(root + path, 'w').write(s)

open(root + 'stray.rs', 'w').write('''//! Task 20 (proto, measurement only): the real pointer's events on a window during a drag, on a connection of its own.

use std::time::Instant;

use anyhow::Result;
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xproto::{ChangeWindowAttributesAux, ConnectionExt as _, EventMask, Window};
use x11rb::rust_connection::RustConnection;

pub struct StrayWatch {
    conn: RustConnection,
    pub events: Vec<(String, f64, u8)>,
}

impl StrayWatch {
    pub fn start(window: Window) -> Result<StrayWatch> {
        let (conn, _) = x11rb::connect(None)?;
        let aux = ChangeWindowAttributesAux::new()
            .event_mask(EventMask::ENTER_WINDOW | EventMask::LEAVE_WINDOW | EventMask::POINTER_MOTION);
        conn.change_window_attributes(window, &aux)?.check()?;
        Ok(StrayWatch { conn, events: Vec::new() })
    }

    /// Every event that has arrived, stamped in ms after `since`.
    pub fn poll(&mut self, since: Instant) {
        while let Ok(Some(event)) = self.conn.poll_for_event() {
            let at = since.elapsed().as_secs_f64() * 1000.0;
            match event {
                Event::EnterNotify(e) => self.events.push(("enter".into(), at, u8::from(e.mode))),
                Event::LeaveNotify(e) => self.events.push(("leave".into(), at, u8::from(e.mode))),
                Event::MotionNotify(_) => self.events.push(("motion".into(), at, 0)),
                _ => {}
            }
        }
    }
}
''')
sub('main.rs', 'mod shm;\n', 'mod shm;\nmod stray;\n')
sub('engine.rs', "    pub min_drag: std::time::Duration,\n}", "    pub min_drag: std::time::Duration,\n    pub atomic_press: bool,\n    pub stray_watch: bool,\n}")
sub('main.rs', "        min_drag: std::time::Duration::ZERO,\n    }", "        min_drag: std::time::Duration::ZERO,\n        atomic_press: false,\n        stray_watch: false,\n    }")
sub('main.rs', """            "--drag-take-wait-all" => {""", """            "--drag-atomic-press" => {
                cfg.atomic_press = true;
                takes_value = false;
            }
            "--drag-stray-watch" => {
                cfg.stray_watch = true;
                takes_value = false;
            }
            "--drag-take-wait-all" => {""")
p = 'engine/pointer.rs'
sub(p, """pub(super) struct Candidates {
    first_step_px: u16,""", """pub(super) struct Candidates {
    atomic: bool,
    stray: Option<crate::stray::StrayWatch>,
    first_step_px: u16,""")
sub(p, """        let cand = Candidates {
            first_step_px:""", """        let mut cand = Candidates {
            atomic: chromium && self.cfg.atomic_press,
            stray: match dropping_into {
                Some(w) if chromium && self.cfg.stray_watch => Some(crate::stray::StrayWatch::start(w)?),
                _ => None,
            },
            first_step_px:""")
sub(p, """                &cand,
                &mut cand_stats,""", """                &mut cand,
                &mut cand_stats,""")
sub(p, """    cand: &Candidates,
    cand_stats: &mut Option<Value>,""", """    cand: &mut Candidates,
    cand_stats: &mut Option<Value>,""")
# the atomic press: grab, press, samples through the first past the threshold, ungrab
sub(p, """        route.place_again(x, points[0].0, points[0].1)?;
        route.button(x, 1, true)?;
        pressed = true;
        std::thread::sleep(pacing.press);
        let mut samples = drag_samples(points);""", """        route.place_again(x, points[0].0, points[0].1)?;
        let mut samples = drag_samples(points);
        let pressed_at = Instant::now();
        // (c1): the press and the samples through the first past the threshold under one server grab, unpaced
        let mut atomic_until = None;
        if cand.atomic {
            let (x0, y0) = samples[0];
            let k = samples
                .iter()
                .position(|&(sx, sy)| (sx as i32 - x0 as i32).abs() >= 4 || (sy as i32 - y0 as i32).abs() >= 4)
                .unwrap_or(samples.len() - 1);
            x.conn.grab_server()?;
            let sent = (|| -> Result<()> {
                route.button(x, 1, true)?;
                pressed = true;
                for &(sx, sy) in &samples[..=k] {
                    route.place_again(x, sx, sy)?;
                }
                Ok(())
            })();
            let ungrab = x.conn.ungrab_server().map_err(anyhow::Error::from).and_then(|c| Ok(c.check()?));
            sent?;
            ungrab?;
            atomic_until = Some(k);
        } else {
            route.button(x, 1, true)?;
            pressed = true;
        }
        std::thread::sleep(pacing.press);""")
sub(p, """        let count = samples.len();
        let pressed_at = Instant::now();
        let mut take_wait""", """        let count = samples.len();
        let mut take_wait""")
sub(p, """        for (i, (sx, sy)) in samples.into_iter().enumerate() {
            route.place_again(x, sx, sy)?;
            let mut wait = pacing.step;""", """        for (i, (sx, sy)) in samples.into_iter().enumerate() {
            if let Some(stray) = cand.stray.as_mut() {
                stray.poll(pressed_at);
            }
            if atomic_until.is_some_and(|k| i <= k) {
                continue;
            }
            route.place_again(x, sx, sy)?;
            let mut wait = pacing.step;""")
sub(p, """        *cand_stats = Some(json!({""", """        if let Some(stray) = cand.stray.as_mut() {
            stray.poll(pressed_at);
        }
        let taken_ms = taken.map(|(at, _)| at.duration_since(pressed_at).as_secs_f64() * 1000.0);
        let stray_stats = cand.stray.as_ref().map(|s| {
            json!({
                "events": s.events.iter().map(|(k, t, m)| json!([k, t, m])).collect::<Vec<_>>(),
                "before_take": s.events.iter().filter(|(_, t, _)| taken_ms.is_none_or(|tk| *t <= tk)).count(),
            })
        });
        *cand_stats = Some(json!({
            "atomic_until": atomic_until,
            "stray": stray_stats,
            "taken_ms": taken_ms,""")
