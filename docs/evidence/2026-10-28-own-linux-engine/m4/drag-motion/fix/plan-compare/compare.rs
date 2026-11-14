#![allow(dead_code)]
mod old {
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

/// How sharply a path must turn at a joint for a resting drag to rest there (`drag_plan`). A browser takes the pointer
/// once a frame, so a stroke drawn from what it took cuts a corner by up to half a frame's travel times the cosine of
/// half the corner's angle; at a turn below this the cut stays a few pixels even at a fast pace.
const CORNER_TURN_DEG: f64 = 30.0;

/// The samples a drag sends after its press, and where it rests.
#[derive(Debug, PartialEq, Eq)]
pub struct DragPlan {
    pub samples: Vec<(i16, i16)>,
    /// The indices of the samples that go out only after a rest at the point before them.
    pub rests: Vec<usize>,
}

/// A drag's motions (`families.rs` `DragPacing.rest`): the pinned build's samples ([`drag_samples`]) and, for a
/// family that rests, a rest at each joint that turns by [`CORNER_TURN_DEG`] or more, between the joint's two visits,
/// and a rest at the end, which is then visited once more. A browser takes pointer input once a frame: Chromium and
/// Gecko hand a page one move a frame (the latest), so a corner the pointer passes within a frame is cut, and
/// Chromium's scrollbar takes at most one move a frame and drops the rest, so a thumb stops where the last frame's
/// first move left it and the release, which carries no position for it, does not move it on (`cc/input/
/// scrollbar_controller.cc`, `drag_processed_for_current_frame_`; evidence `m4/drag-motion/`). A rest of a frame at a
/// point puts it in a frame of its own, and the second visit after it reaches a scrollbar that took nothing since.
pub fn drag_plan(points: &[(i16, i16)], rests: bool) -> DragPlan {
    let mut samples = Vec::new();
    let mut at = Vec::new();
    for (j, pair) in points.windows(2).enumerate() {
        if rests && j > 0 && turn_deg(points[j - 1], points[j], points[j + 1]) >= CORNER_TURN_DEG {
            at.push(samples.len());
        }
        samples.extend(drag_samples(pair));
    }
    if rests && let Some(&last) = samples.last() {
        at.push(samples.len());
        samples.push(last);
    }
    DragPlan { samples, rests: at }
}

/// The turn at `b` between a→b and b→c, in degrees (0 straight on, 180 straight back); a zero-length side has no
/// direction, so no turn.
fn turn_deg(a: (i16, i16), b: (i16, i16), c: (i16, i16)) -> f64 {
    let (ux, uy) = (b.0 as f64 - a.0 as f64, b.1 as f64 - a.1 as f64);
    let (vx, vy) = (c.0 as f64 - b.0 as f64, c.1 as f64 - b.1 as f64);
    let (nu, nv) = (ux.hypot(uy), vx.hypot(vy));
    if nu == 0.0 || nv == 0.0 {
        return 0.0;
    }
    ((ux * vx + uy * vy) / (nu * nv)).clamp(-1.0, 1.0).acos().to_degrees()
}


}
mod new {
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

/// How sharply a path must turn at a joint for a resting drag to rest there (`drag_plan`). A browser takes the pointer
/// once a frame, so a stroke drawn from what it took cuts a corner by up to half a frame's travel times the cosine of
/// half the corner's angle; at a turn below this the cut stays a few pixels even at a fast pace.
const CORNER_TURN_DEG: f64 = 30.0;

/// The samples a drag sends after its press, and where it rests.
#[derive(Debug, PartialEq, Eq)]
pub struct DragPlan {
    pub samples: Vec<(i16, i16)>,
    /// The indices of the samples that go out only after a rest at the point before them.
    pub rests: Vec<usize>,
}

/// A drag's motions (`families.rs` `DragPacing.rest`): the pinned build's samples ([`drag_samples`]) and, for a
/// family that rests, a rest at each joint that turns by [`CORNER_TURN_DEG`] or more ([`corner_at`]), between the
/// joint's first two visits, and a rest at the end, which is then visited once more. A browser takes pointer input once a frame: Chromium and
/// Gecko hand a page one move a frame (the latest), so a corner the pointer passes within a frame is cut, and
/// Chromium's scrollbar takes at most one move a frame and drops the rest, so a thumb stops where the last frame's
/// first move left it and the release, which carries no position for it, does not move it on (`cc/input/
/// scrollbar_controller.cc`, `drag_processed_for_current_frame_`; evidence `m4/drag-motion/`). A rest of a frame at a
/// point puts it in a frame of its own, and the second visit after it reaches a scrollbar that took nothing since.
pub fn drag_plan(points: &[(i16, i16)], rests: bool) -> DragPlan {
    let mut samples = Vec::new();
    let mut at = Vec::new();
    for (j, pair) in points.windows(2).enumerate() {
        if rests && corner_at(points, j) {
            at.push(samples.len());
        }
        samples.extend(drag_samples(pair));
    }
    if rests && let Some(&last) = samples.last() {
        at.push(samples.len());
        samples.push(last);
    }
    DragPlan { samples, rests: at }
}

/// Whether a path turns by [`CORNER_TURN_DEG`] or more at its point `j` on arriving there: the turn between the
/// position it came from and the next one it goes to, a point the path repeats counted once, so a repeat neither
/// hides the corner (each turn around it would have a zero-length side) nor puts a second rest there.
fn corner_at(points: &[(i16, i16)], j: usize) -> bool {
    let at = points[j];
    if j == 0 || points[j - 1] == at {
        return false;
    }
    points[j + 1..]
        .iter()
        .find(|&&p| p != at)
        .is_some_and(|&next| turn_deg(points[j - 1], at, next) >= CORNER_TURN_DEG)
}

/// The turn at `b` between a→b and b→c, in degrees (0 straight on, 180 straight back); a zero-length side has no
/// direction, so no turn.
fn turn_deg(a: (i16, i16), b: (i16, i16), c: (i16, i16)) -> f64 {
    let (ux, uy) = (b.0 as f64 - a.0 as f64, b.1 as f64 - a.1 as f64);
    let (vx, vy) = (c.0 as f64 - b.0 as f64, c.1 as f64 - b.1 as f64);
    let (nu, nv) = (ux.hypot(uy), vx.hypot(vy));
    if nu == 0.0 || nv == 0.0 {
        return 0.0;
    }
    ((ux * vx + uy * vy) / (nu * nv)).clamp(-1.0, 1.0).acos().to_degrees()
}


}
use std::io::BufRead;
fn main() {
    let (mut paths, mut differ) = (0, 0);
    for line in std::io::stdin().lock().lines() {
        let line = line.unwrap();
        let (label, pts) = line.split_once('\t').unwrap();
        let points: Vec<(i16, i16)> = pts
            .split(' ')
            .map(|p| {
                let (x, y) = p.split_once(',').unwrap();
                (x.parse().unwrap(), y.parse().unwrap())
            })
            .collect();
        paths += 1;
        let mut same = true;
        for rests in [false, true] {
            let (a, b) = (old::drag_plan(&points, rests), new::drag_plan(&points, rests));
            if a.samples != b.samples || a.rests != b.rests {
                same = false;
            }
        }
        let p = new::drag_plan(&points, true);
        println!(
            "{}\t{label}\t{pts}\tsamples {}\trests {:?}",
            if same { "same" } else { "DIFFER" },
            p.samples.len(),
            p.rests
        );
        if !same {
            differ += 1;
        }
    }
    println!("{paths} distinct paths, {differ} with a different plan");
    std::process::exit(if differ == 0 { 0 } else { 1 });
}
