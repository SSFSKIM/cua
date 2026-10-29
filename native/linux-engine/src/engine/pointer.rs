//! Coordinate clicks, `move`, `move_relative`, `scroll`, `drag` and `drag_handle` (behaviour §10) on either route:
//! the vendor's arithmetic, its order of placing, pressing the chord and pressing the button, and its holds.

use std::time::Duration;

use anyhow::{Result, bail};
use serde_json::Value;

use super::Engine;
use crate::desktop::Desktop;
use crate::families::DragPacing;
use crate::input::chord_keycodes;
use crate::route::{Route, Target};
use crate::wire::{
    ClickInput, DragHandleInput, DragInput, MouseButton, MoveInput, MoveRelativeInput, ScrollInput, parse_input,
};
use crate::x11::X11;

/// The click hold when `duration` is absent (behaviour §10.1).
pub(super) const CLICK_HOLD: Duration = Duration::from_millis(12);
/// Each wheel step's hold (behaviour §10.3).
const WHEEL_HOLD: Duration = Duration::from_millis(36);
/// `scroll`'s pixels when absent.
const DEFAULT_PIXELS: u16 = 800;

/// Wheel steps for a pixel count: pixels / 100 rounded half away from zero, at least one (behaviour §10.3).
pub fn scroll_steps(pixels: u16) -> u32 {
    ((pixels as u32 + 50) / 100).max(1)
}

/// Every pointer sample a drag visits after its press (behaviour §10.4): for each consecutive pair a→b,
/// n = max(1, ⌊distance⌋) and the points a + (i·dx/n, i·dy/n) for i = 0…n, integer division truncating toward
/// zero, so the joint between two segments is visited twice.
pub fn drag_samples(points: &[(i16, i16)]) -> Vec<(i16, i16)> {
    let mut samples = Vec::new();
    for pair in points.windows(2) {
        let ((ax, ay), (bx, by)) = (pair[0], pair[1]);
        let (dx, dy) = (bx as i64 - ax as i64, by as i64 - ay as i64);
        let n = ((dx as f64).hypot(dy as f64) as i64).max(1);
        for i in 0..=n {
            samples.push(((ax as i64 + i * dx / n) as i16, (ay as i64 + i * dy / n) as i16));
        }
    }
    samples
}

fn chord(x: &X11, key: Option<&str>) -> Result<Vec<u8>> {
    key.map_or(Ok(Vec::new()), |key| chord_keycodes(x, key))
}

/// Press, hold, release of one button, inside a pressed chord that is released whatever happened; the first error
/// wins (behaviour §10.1).
fn click_once(
    x: &X11,
    route: &mut Route,
    keycodes: &[u8],
    at: Option<(i16, i16)>,
    button: u8,
    hold: Duration,
) -> Result<()> {
    let held = route.acquire(x, keycodes)?;
    let pressed = match at {
        Some((rx, ry)) => route.place_again(x, rx, ry),
        None => Ok(()),
    }
    .and_then(|()| route.button(x, button, true));
    if pressed.is_ok() {
        std::thread::sleep(hold);
    }
    let released = pressed.and_then(|()| route.button(x, button, false));
    let keys_released = route.release(x, &held);
    released.and(keys_released)
}

/// The drag after the pointer is placed at its first point: the chord, the press, every sample, the release.
/// `pacing.step` follows each sample, the last included (where the vendor waits 1 ms, behaviour §10.4),
/// `pacing.press` follows the press and `pacing.release` precedes the release (`families.rs`).
fn drag_along(x: &X11, route: &mut Route, keycodes: &[u8], points: &[(i16, i16)], pacing: &DragPacing) -> Result<()> {
    let held = route.acquire(x, keycodes)?;
    let mut pressed = false;
    let dragged = (|| -> Result<()> {
        route.place_again(x, points[0].0, points[0].1)?;
        route.button(x, 1, true)?;
        pressed = true;
        std::thread::sleep(pacing.press);
        for (sx, sy) in drag_samples(points) {
            route.place_again(x, sx, sy)?;
            std::thread::sleep(pacing.step);
        }
        std::thread::sleep(pacing.release);
        pressed = false;
        route.button(x, 1, false)
    })();
    if pressed {
        // interrupted while the button is down: its release is attempted; the interruption stays the answer
        let _ = route.button(x, 1, false);
    }
    let keys_released = route.release(x, &held);
    dragged.and(keys_released)
}

impl Engine {
    /// A click at coordinates (window-relative, or the desktop's), or on the desktop at the pointer; element clicks
    /// are `elements.rs`'s. The chord is parsed before anything else, as the vendor's errors come first.
    pub(super) fn click(&mut self, input: Option<Value>) -> Result<Value> {
        let input: ClickInput = parse_input(input)?;
        let keycodes = chord(&self.x, input.key.as_deref())?;
        if let Some(element) = &input.element_id {
            let Some(window) = input.window else {
                bail!("element click requires window")
            };
            if input.x.is_some() || input.y.is_some() {
                bail!("provide element_id or x/y, not both");
            }
            let button = input.mouse_button.unwrap_or(MouseButton::Left);
            if button == MouseButton::Middle
                || input.click_count.is_some_and(|c| c != 1)
                || input.key.is_some()
                || input.duration.is_some()
            {
                bail!(
                    "element click supports one left or right click without key or duration; use coordinates for other mouse options"
                );
            }
            return self.element_click(window.id, element, button);
        }
        let position = match (input.x, input.y) {
            (Some(x), Some(y)) => Some((x, y)),
            (None, None) if input.window.is_some() => bail!("window click requires coordinates or an element"),
            (None, None) => None,
            _ => bail!("coordinate click requires both x and y"),
        };
        let button = input.mouse_button.unwrap_or(MouseButton::Left).button();
        let count = input.click_count.unwrap_or(1);
        let hold = input.duration.map(Duration::from_millis).unwrap_or(CLICK_HOLD);
        let Engine { x, inputs, .. } = self;
        inputs.with_route(x, Target::of(input.window), |x, route, _| {
            let at = match position {
                Some((px, py)) => {
                    let (rx, ry) = route.root_point(x, px, py)?;
                    route.place(x, rx, ry)?;
                    Some((rx, ry))
                }
                None => None,
            };
            for _ in 0..count {
                click_once(x, route, &keycodes, at, button, hold)?;
            }
            Ok(())
        })?;
        Ok(Value::Null)
    }

    /// `move`: the chord pressed, the pointer placed (the background `move_to`, or the desktop's path), the chord
    /// released (behaviour §10.2). The chord is parsed inside the target, as the vendor's (a bad one still costs a
    /// window its FocusIn and FocusOut pair, traced).
    pub(super) fn move_pointer(&mut self, input: Option<Value>) -> Result<Value> {
        let input: MoveInput = parse_input(input)?;
        let Engine { x, inputs, .. } = self;
        inputs.with_route(x, Target::of(input.window), |x, route, _| {
            let (rx, ry) = route.root_point(x, input.x, input.y)?;
            let keycodes = chord(x, input.key.as_deref())?;
            let held = route.acquire(x, &keycodes)?;
            let moved = route.place(x, rx, ry);
            moved.and(route.release(x, &held))
        })?;
        Ok(Value::Null)
    }

    /// `move_relative`: desktop only, one relative XTEST motion inside the chord.
    pub(super) fn move_relative(&mut self, input: Option<Value>) -> Result<Value> {
        let input: MoveRelativeInput = parse_input(input)?;
        let keycodes = chord(&self.x, input.key.as_deref())?;
        let Engine { x, inputs, .. } = self;
        inputs.with_route(x, Target::Desktop, |x, route, _| {
            let held = route.acquire(x, &keycodes)?;
            let moved = Desktop::relative(x, input.dx, input.dy);
            moved.and(route.release(x, &held))
        })?;
        Ok(Value::Null)
    }

    /// `scroll`: wheel steps at an element, a point, the window's centre, or (on the desktop) the pointer. Element
    /// and mixed-input refusals come before the target is opened, the others inside it, as the vendor's (traced).
    pub(super) fn scroll(&mut self, input: Option<Value>) -> Result<Value> {
        let input: ScrollInput = parse_input(input)?;
        if let Some(element) = &input.element_id {
            let Some(window) = input.window else {
                bail!("element scroll requires window")
            };
            if input.x.is_some() || input.y.is_some() {
                bail!("provide element_id or x/y, not both");
            }
            return self.element_scroll(window.id, element, &input);
        }
        let Engine { x, inputs, .. } = self;
        inputs.with_route(x, Target::of(input.window), |x, route, _| {
            let at = match (input.x, input.y, input.window) {
                (Some(px), Some(py), _) => Some(route.root_point(x, px, py)?),
                (None, None, Some(window)) => {
                    let info = x.get_window(window.id)?;
                    Some((
                        info.x.saturating_add((info.width >> 1) as i16),
                        info.y.saturating_add((info.height >> 1) as i16),
                    ))
                }
                (None, None, None) => None,
                _ => bail!("x and y must be provided together"),
            };
            wheel(x, route, at, &input)
        })?;
        Ok(Value::Null)
    }

    /// `drag`: the path translated to the root (inside the window's session, which is opened first), checked, the
    /// pointer placed at its start, then the chord parsed and pressed, the button pressed, the path walked and
    /// everything released (behaviour §10.4; the chord's place traced).
    pub(super) fn drag(&mut self, input: Option<Value>) -> Result<Value> {
        let input: DragInput = parse_input(input)?;
        // the target's family decides the waits: the window named, or on the desktop the window under the start
        let window = match input.window {
            Some(target) => Some(target.id),
            None => input.path.first().and_then(|p| self.x.client_at(p.x, p.y)),
        };
        let pacing = self.drag_pacing_for(window);
        let Engine { x, inputs, .. } = self;
        inputs.with_route(x, Target::of(input.window), |x, route, _| {
            let points = input
                .path
                .iter()
                .map(|p| route.root_point(x, p.x, p.y))
                .collect::<Result<Vec<_>>>()?;
            if points.len() < 2 {
                bail!("drag path must contain at least two points");
            }
            route.place(x, points[0].0, points[0].1)?;
            let keycodes = chord(x, input.key.as_deref())?;
            drag_along(x, route, &keycodes, &points, &pacing)
        })?;
        Ok(Value::Null)
    }

    /// `drag_handle`: desktop only and stateless here; start, move and end are the JavaScript's to order
    /// (behaviour §10.5).
    pub(super) fn drag_handle(&mut self, input: Option<Value>) -> Result<Value> {
        let input: DragHandleInput = parse_input(input)?;
        let x = &self.x;
        match input {
            DragHandleInput::Start { x: px, y: py } => {
                Desktop::move_path(x, px, py)?;
                Desktop::motion(x, px, py)?;
                Desktop::button(x, 1, true)?;
            }
            DragHandleInput::MoveTo { x: px, y: py } => Desktop::move_path(x, px, py)?,
            DragHandleInput::End => Desktop::button(x, 1, false)?,
        }
        Ok(Value::Null)
    }
}

/// The wheel once its point is known: `pixels` checked, the chord parsed, the pointer placed, then the chord
/// pressed, each step pressed, held and released, and the chord released (behaviour §10.3).
pub(super) fn wheel(x: &X11, route: &mut Route, at: Option<(i16, i16)>, input: &ScrollInput) -> Result<()> {
    let pixels = input.pixels.unwrap_or(DEFAULT_PIXELS);
    if pixels == 0 {
        bail!("pixels must be non-zero");
    }
    let keycodes = chord(x, input.key.as_deref())?;
    if let Some((rx, ry)) = at {
        route.place(x, rx, ry)?;
    }
    let button = input.direction.button();
    let held = route.acquire(x, &keycodes)?;
    let mut scrolled = Ok(());
    for _ in 0..scroll_steps(pixels) {
        scrolled = route.button(x, button, true).and_then(|()| {
            std::thread::sleep(WHEEL_HOLD);
            route.button(x, button, false)
        });
        if scrolled.is_err() {
            break;
        }
    }
    let keys_released = route.release(x, &held);
    scrolled.and(keys_released)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wheel_steps_round_half_away_from_zero_with_one_at_least() {
        for (pixels, steps) in [
            (50, 1),
            (150, 2),
            (120, 1),
            (240, 2),
            (800, 8),
            (1, 1),
            (149, 1),
            (65535, 655),
        ] {
            assert_eq!(scroll_steps(pixels), steps, "{pixels} px");
        }
    }

    #[test]
    fn a_forty_pixel_drag_visits_forty_one_points() {
        // traced: a 40 px drag gave 41 MotionNotify, x 200…240 (behaviour §10.4)
        let samples = drag_samples(&[(200, 300), (240, 300)]);
        assert_eq!(samples.len(), 41);
        assert_eq!(samples.first(), Some(&(200, 300)));
        assert_eq!(samples.last(), Some(&(240, 300)));
    }

    #[test]
    fn drag_samples_truncate_toward_zero_and_repeat_the_joint() {
        // 3,4 → n = 5; x = 3i/5 → 0,0,1,1,2,3; y = 4i/5 → 0,0,1,2,3,4
        let samples = drag_samples(&[(0, 0), (3, 4), (3, 2)]);
        assert_eq!(
            samples,
            vec![(0, 0), (0, 0), (1, 1), (1, 2), (2, 3), (3, 4), (3, 4), (3, 3), (3, 2)]
        );
        // a negative step truncates toward zero, not down: y = −i/3 is 0, 0, 0, −1
        assert_eq!(
            drag_samples(&[(0, 0), (-3, -1)]),
            vec![(0, 0), (-1, 0), (-2, 0), (-3, -1)]
        );
        assert_eq!(drag_samples(&[(0, 0), (-1, -1)]), vec![(0, 0), (-1, -1)]);
        assert_eq!(
            drag_samples(&[(5, 5), (5, 5)]),
            vec![(5, 5), (5, 5)],
            "a zero-length segment: n = 1"
        );
    }
}
