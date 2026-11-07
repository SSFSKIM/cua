//! The desktop route (behaviour §10, §11.3; Design, Input): input through the XTEST extension, which moves the real
//! pointer and goes to whatever has focus. Requests without a window use it, as the vendor's do. Every primitive is
//! `FakeInput` with time 0 and device 0, followed by a round trip.

use std::time::Duration;

use anyhow::Result;
use x11rb::protocol::xproto::{
    BUTTON_PRESS_EVENT, BUTTON_RELEASE_EVENT, ConnectionExt as _, KEY_PRESS_EVENT, KEY_RELEASE_EVENT,
    MOTION_NOTIFY_EVENT,
};
use x11rb::protocol::xtest::ConnectionExt as _;

use crate::input::Keys;
use crate::x11::X11;

/// The pause between two positions of a desktop pointer path: the vendor's 8 ms (behaviour §10.2), kept. Shorter, an
/// Electron page's move misses the service's move settle (0 to 6 ms missed idle, 7 held one step from them; M4's
/// T9, evidence `m4/waits/`), and the service's settle was set at 8. The points stay
/// the vendor's, the leading one at the pointer's own position included: the server delivers a motion there as it
/// does any other (task 64's motion listener), so leaving it out, as the newest build does, would change what an
/// application receives. What goes is the pause after it ([`paused_before`]). `--path-step-ms` sets the pause for
/// measurement only.
pub const PATH_STEP: Duration = Duration::from_millis(8);

/// Whether a path pauses before its point `i` (> 0): not after a leading motion at the pointer's own position
/// (`pointer`, where the path began), which moves nothing, so no two positions are closer in time than the step, and a
/// one-step move answers at once as the newest build's does (M4's T9, closing M1a's declared gap).
pub fn paused_before(points: &[(i16, i16)], pointer: (i16, i16), i: usize) -> bool {
    !(i == 1 && points.first() == Some(&pointer))
}

/// The points a desktop move visits from `start` to `end` (behaviour §10.2): none to interpolate when already there
/// (one motion to the end); else n = ⌈distance / 160 × 10⌉ clamped to 1–10, the points start + d·i/n for i = 0…n
/// rounded half away from zero and clamped to i16, the start included, consecutive duplicates removed.
pub fn path_points(start: (i16, i16), end: (i16, i16)) -> Vec<(i16, i16)> {
    if start == end {
        return vec![end];
    }
    let (dx, dy) = (end.0 as f64 - start.0 as f64, end.1 as f64 - start.1 as f64);
    let n = (dx.hypot(dy) / 160.0 * 10.0).ceil().clamp(1.0, 10.0) as u32;
    let clamp = |v: f64| v.round().clamp(i16::MIN as f64, i16::MAX as f64) as i16;
    let mut points: Vec<(i16, i16)> = Vec::with_capacity(n as usize + 1);
    for i in 0..=n {
        let t = i as f64 / n as f64;
        let point = (clamp(start.0 as f64 + dx * t), clamp(start.1 as f64 + dy * t));
        if points.last() != Some(&point) {
            points.push(point);
        }
    }
    points
}

/// The desktop's held keys: counted per keycode as a window's are, shared by every desktop request (the server
/// computes the events' state itself, so no modifier masks are kept).
pub struct Desktop {
    pub keys: Keys,
    /// After each new key edge (Design: no pacing).
    pub key_pace: Duration,
    /// Between a pointer path's points ([`PATH_STEP`]).
    pub path_step: Duration,
    /// How long the request's foreground pointer input waited for its window to be on top at its points
    /// (`Route::on_top_at`), for the `--stats` line.
    pub on_top_waited: Option<Duration>,
}

fn fake(x: &X11, kind: u8, detail: u8, root: u32, rx: i16, ry: i16) -> Result<()> {
    x.conn.xtest_fake_input(kind, detail, 0, root, rx, ry, 0)?.check()?;
    Ok(())
}

impl Desktop {
    pub fn new(key_pace: Duration, path_step: Duration) -> Desktop {
        Desktop {
            keys: Keys::new(Vec::new()),
            key_pace,
            path_step,
            on_top_waited: None,
        }
    }

    fn key(x: &X11, keycode: u8, press: bool) -> Result<()> {
        let kind = if press { KEY_PRESS_EVENT } else { KEY_RELEASE_EVENT };
        let send = || fake(x, kind, keycode, x.root, 0, 0);
        // recorded for the exits that cannot wait for the bookkeeping (pressed.rs)
        crate::pressed::desktop_key(keycode, press, || {
            #[cfg(test)]
            return crate::fault::key(keycode, press, send);
            #[cfg(not(test))]
            send()
        })
    }

    /// Presses each keycode not already held, in order (behaviour §11.3).
    pub fn acquire(&mut self, x: &X11, keycodes: &[u8]) -> Result<Vec<u8>> {
        let pace = self.key_pace;
        self.keys.acquire(
            keycodes,
            |keycode, _| {
                Self::key(x, keycode, true)?;
                std::thread::sleep(pace);
                Ok(())
            },
            |keycode, _| {
                let sent = Self::key(x, keycode, false);
                std::thread::sleep(pace);
                sent
            },
        )
    }

    /// Releases in reverse press order; every release is attempted and the first failure returned.
    pub fn release(&mut self, x: &X11, keycodes: &[u8]) -> Result<()> {
        self.release_tracked(x, keycodes).0
    }

    /// [`Desktop::release`], also answering the references still unreleased ([`Keys::release_tracked`]).
    pub fn release_tracked(&mut self, x: &X11, keycodes: &[u8]) -> (Result<()>, Vec<u8>) {
        let pace = self.key_pace;
        self.keys.release_tracked(keycodes, |keycode, _| {
            let sent = Self::key(x, keycode, false);
            std::thread::sleep(pace);
            sent
        })
    }

    /// Releases a key the bookkeeping does not hold (its press's delivery unknown), sending no press.
    pub fn release_unheld(x: &X11, keycode: u8) -> Result<()> {
        Self::key(x, keycode, false)
    }

    /// Releases every key still held (the engine's exit).
    pub fn release_all(&mut self, x: &X11) {
        let pace = self.key_pace;
        self.keys.release_all(|keycode, _| {
            let sent = Self::key(x, keycode, false);
            std::thread::sleep(pace);
            sent
        });
    }

    pub fn button(x: &X11, button: u8, press: bool) -> Result<()> {
        let kind = if press {
            BUTTON_PRESS_EVENT
        } else {
            BUTTON_RELEASE_EVENT
        };
        // recorded for the exits that cannot wait for the bookkeeping (pressed.rs)
        crate::pressed::desktop_button(button, press, || fake(x, kind, button, x.root, 0, 0))
    }

    /// One absolute motion of the real pointer.
    pub fn motion(x: &X11, rx: i16, ry: i16) -> Result<()> {
        fake(x, MOTION_NOTIFY_EVENT, 0, x.root, rx, ry)
    }

    /// One relative motion (`move_relative`): no root, no interpolation.
    pub fn relative(x: &X11, dx: i16, dy: i16) -> Result<()> {
        fake(x, MOTION_NOTIFY_EVENT, 1, x11rb::NONE, dx, dy)
    }

    /// `move_path`: from wherever the pointer is to the point, through [`path_points`], with the path's step
    /// ([`PATH_STEP`]) between points.
    pub fn move_path(&self, x: &X11, rx: i16, ry: i16) -> Result<()> {
        Self::move_path_paced(x, rx, ry, self.path_step)
    }

    /// [`Desktop::move_path`]'s points with `step` between them: a held `drag_handle` move, paced by its family.
    pub fn move_path_paced(x: &X11, rx: i16, ry: i16, step: Duration) -> Result<()> {
        let pointer = x.conn.query_pointer(x.root)?.reply()?;
        let start = (pointer.root_x, pointer.root_y);
        let points = path_points(start, (rx, ry));
        for (i, &(px, py)) in points.iter().enumerate() {
            if i > 0 && !step.is_zero() && paused_before(&points, start, i) {
                std::thread::sleep(step);
            }
            Self::motion(x, px, py)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_long_move_is_ten_steps_from_the_start() {
        // traced: (640,400) → (1260,790) gave 11 motions from 640,400 (behaviour §10.2)
        let points = path_points((640, 400), (1260, 790));
        assert_eq!(points.len(), 11);
        assert_eq!(points[0], (640, 400));
        assert_eq!(points[1], (702, 439));
        assert_eq!(points[10], (1260, 790));
    }

    #[test]
    fn a_short_move_has_one_step_per_sixteen_pixels() {
        assert_eq!(path_points((300, 300), (310, 300)), vec![(300, 300), (310, 300)]);
        // 40 px: ⌈2.5⌉ = 3 steps
        assert_eq!(
            path_points((0, 0), (40, 0)),
            vec![(0, 0), (13, 0), (27, 0), (40, 0)],
            "13.33 and 26.67 round to the nearest"
        );
        assert_eq!(path_points((0, 0), (1, 1)), vec![(0, 0), (1, 1)]);
    }

    #[test]
    fn a_path_pauses_between_two_positions_but_not_after_the_motion_at_the_pointer_s_own_position() {
        let start = (640, 400);
        let points = path_points(start, (1260, 790));
        let paused: Vec<bool> = (1..points.len()).map(|i| paused_before(&points, start, i)).collect();
        assert_eq!(
            paused,
            [false, true, true, true, true, true, true, true, true, true],
            "nine pauses for the ten steps: none after the leading motion, which moves nothing"
        );
        // a short move: the leading motion, then the point, at once (the newest build's one motion and no pause)
        let short = path_points((300, 300), (310, 300));
        assert!(!paused_before(&short, (300, 300), 1));
        // the leading motion counts as the pointer's own position only when it is
        assert!(paused_before(&[(0, 0), (5, 5)], (9, 9), 1));
    }

    #[test]
    fn coordinates_round_half_away_from_zero_and_staying_put_is_one_motion() {
        // 3 steps: x 0, 0.67, 1.33, 2 → 0, 1, 1, 2
        assert_eq!(path_points((0, 0), (2, 40)), vec![(0, 0), (1, 13), (1, 27), (2, 40)]);
        // 2 steps over 17 px: −8.5 → −9
        assert_eq!(path_points((0, 0), (-17, 0)), vec![(0, 0), (-9, 0), (-17, 0)]);
        assert_eq!(path_points((5, 5), (5, 5)), vec![(5, 5)]);
    }
}
