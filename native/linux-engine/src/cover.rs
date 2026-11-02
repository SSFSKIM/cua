//! Whether a window is fully unobscured (Design, Retention and the fixed waits): the whole window is on the screen
//! and inside every ancestor, and no window above it (or above any of its ancestors) in `QueryTree`'s stacking
//! order overlaps it. Overlap is judged by each window's outer rectangle, so a shaped or translucent window above
//! counts as covering whatever its shape; any doubt counts as obscured. A drag's path is judged the same way, point by
//! point (M3.1, Chromium's drags): every point the drag visits must be visible in the window.

/// A rectangle in root coordinates; `x2`, `y2` exclusive.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Rect {
    fn is_empty(&self) -> bool {
        self.w <= 0 || self.h <= 0
    }

    fn contains(&self, other: &Rect) -> bool {
        other.x >= self.x
            && other.y >= self.y
            && other.x + other.w <= self.x + self.w
            && other.y + other.h <= self.y + self.h
    }

    fn contains_point(&self, (px, py): (i32, i32)) -> bool {
        px >= self.x && py >= self.y && px < self.x + self.w && py < self.y + self.h
    }

    fn overlaps(&self, other: &Rect) -> bool {
        !self.is_empty()
            && !other.is_empty()
            && self.x < other.x + other.w
            && other.x < self.x + self.w
            && self.y < other.y + other.h
            && other.y < self.y + self.h
    }
}

/// A sibling stacked above the window or one of its ancestors: its outer rectangle (border included), whether it
/// is viewable, and whether it is InputOnly (which draws nothing).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Above {
    pub rect: Rect,
    pub viewable: bool,
    pub input_only: bool,
}

/// One level of the window's ancestry: the parent's inside rectangle, which clips its children (the root's is the
/// screen), and the parent's children stacked above this level's window.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Level {
    pub clip: Rect,
    pub above: Vec<Above>,
}

/// `levels` run from the window's parent up to the root; a window with no levels (the root itself) is in doubt.
pub fn fully_unobscured(window: Rect, levels: &[Level]) -> bool {
    !window.is_empty()
        && !levels.is_empty()
        && levels.iter().all(|level| {
            level.clip.contains(&window)
                && !level
                    .above
                    .iter()
                    .any(|a| a.viewable && !a.input_only && a.rect.overlaps(&window))
        })
}

/// Whether every point of `points` (root coordinates; a drag's every sample, so its vertices and the segments between
/// them, `pointer.rs`' `drag_samples`) lies in the window, inside every ancestor, and under no window above it or above
/// an ancestor, judged by outer rectangles as `fully_unobscured` judges the window. No levels or no points is doubt.
pub fn points_unobscured(window: Rect, levels: &[Level], points: &[(i32, i32)]) -> bool {
    !levels.is_empty()
        && !points.is_empty()
        && points.iter().all(|&p| {
            window.contains_point(p)
                && levels.iter().all(|level| {
                    level.clip.contains_point(p)
                        && !level
                            .above
                            .iter()
                            .any(|a| a.viewable && !a.input_only && a.rect.contains_point(p))
                })
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: Rect = Rect {
        x: 0,
        y: 0,
        w: 1280,
        h: 800,
    };

    fn rect(x: i32, y: i32, w: i32, h: i32) -> Rect {
        Rect { x, y, w, h }
    }

    fn above(r: Rect) -> Above {
        Above {
            rect: r,
            viewable: true,
            input_only: false,
        }
    }

    /// A client inside a frame under the root (the frame 5 px wider on each side and 25 px taller above it, so it
    /// always contains the client), with these windows above the frame.
    fn framed(client: Rect, over_frame: Vec<Above>) -> (Rect, Vec<Level>) {
        let frame = rect(client.x - 5, client.y - 25, client.w + 10, client.h + 30);
        (
            client,
            vec![
                Level {
                    clip: frame,
                    above: vec![],
                },
                Level {
                    clip: SCREEN,
                    above: over_frame,
                },
            ],
        )
    }

    #[test]
    fn a_window_alone_on_the_screen_is_unobscured() {
        let (w, levels) = framed(rect(10, 30, 900, 700), vec![]);
        assert!(fully_unobscured(w, &levels));
        // windows above that do not overlap, are unmapped, or are InputOnly do not cover it
        let (w, levels) = framed(
            rect(10, 30, 900, 700),
            vec![
                above(rect(1000, 0, 200, 200)),
                above(rect(-100, -100, 1, 1)),
                Above {
                    viewable: false,
                    ..above(SCREEN)
                },
                Above {
                    input_only: true,
                    ..above(SCREEN)
                },
            ],
        );
        assert!(fully_unobscured(w, &levels));
    }

    #[test]
    fn any_overlap_above_obscures_it() {
        // an override-redirect menu, a shaped or translucent window: judged by the outer rectangle
        let (w, levels) = framed(rect(10, 30, 900, 700), vec![above(rect(909, 729, 50, 50))]);
        assert!(!fully_unobscured(w, &levels), "one pixel of overlap");
        let (w, levels) = framed(rect(10, 30, 900, 700), vec![above(rect(910, 30, 50, 50))]);
        assert!(fully_unobscured(w, &levels), "touching edges do not overlap");
        // a sibling above inside the frame covers it too
        let (w, mut levels) = framed(rect(10, 30, 900, 700), vec![]);
        levels[0].above.push(above(rect(20, 40, 5, 5)));
        assert!(!fully_unobscured(w, &levels));
    }

    /// A window directly under the root, so the screen is the only boundary that can cut it.
    fn on_root(window: Rect) -> (Rect, Vec<Level>) {
        (
            window,
            vec![Level {
                clip: SCREEN,
                above: vec![],
            }],
        )
    }

    #[test]
    fn a_window_partly_off_the_screen_or_its_parent_is_obscured() {
        let (w, levels) = on_root(rect(380, 30, 900, 700));
        assert!(fully_unobscured(w, &levels), "flush with the screen's right edge");
        let (w, levels) = on_root(rect(381, 30, 900, 700));
        assert!(!fully_unobscured(w, &levels), "one pixel past the screen's right edge");
        let (w, levels) = on_root(rect(-1, 30, 100, 100));
        assert!(!fully_unobscured(w, &levels), "one pixel past the left edge");
        let (w, levels) = on_root(rect(0, 0, 1280, 800));
        assert!(fully_unobscured(w, &levels), "the whole screen");
        let (w, levels) = on_root(rect(0, 1, 1280, 800));
        assert!(!fully_unobscured(w, &levels), "past the bottom edge");
        let levels = vec![Level {
            clip: rect(0, 0, 50, 50),
            above: vec![],
        }];
        assert!(
            !fully_unobscured(rect(10, 10, 50, 50), &levels),
            "clipped by its parent"
        );
    }

    /// The points a straight segment visits, one per pixel along its longer side (as a drag samples it).
    fn segment((ax, ay): (i32, i32), (bx, by): (i32, i32)) -> Vec<(i32, i32)> {
        let n = (bx - ax).abs().max((by - ay).abs()).max(1);
        (0..=n)
            .map(|i| (ax + (bx - ax) * i / n, ay + (by - ay) * i / n))
            .collect()
    }

    #[test]
    fn a_path_in_the_visible_part_of_a_partly_covered_window_is_unobscured() {
        // the bottom half covered: a path across the top half is visible, though the window is not
        let (w, levels) = framed(rect(0, 20, 1000, 780), vec![above(rect(0, 410, 1280, 390))]);
        assert!(!fully_unobscured(w, &levels));
        assert!(points_unobscured(w, &levels, &segment((200, 150), (600, 240))));
        assert!(
            points_unobscured(w, &levels, &[(10, 409)]),
            "the last row above the cover"
        );
        assert!(!points_unobscured(w, &levels, &[(10, 410)]), "the cover's first row");
    }

    #[test]
    fn a_covered_vertex_or_a_segment_crossing_a_cover_obscures_the_path() {
        let (w, levels) = framed(rect(0, 20, 1000, 780), vec![above(rect(300, 100, 50, 50))]);
        assert!(
            !points_unobscured(w, &levels, &segment((320, 120), (600, 300))),
            "a vertex under it"
        );
        // both ends visible, the segment between them through the cover
        let path = segment((100, 125), (600, 125));
        assert!(
            points_unobscured(w, &levels, &[path[0], *path.last().unwrap()]),
            "its ends alone are visible"
        );
        assert!(!points_unobscured(w, &levels, &path), "a segment through it");
        assert!(
            points_unobscured(w, &levels, &segment((100, 200), (600, 200))),
            "a segment below it"
        );
    }

    #[test]
    fn a_path_under_an_override_redirect_or_shaped_window_or_outside_the_window_is_obscured() {
        // a menu or a tooltip (override-redirect) is a root child above like any other; a shaped window by its outer
        // rectangle, whatever it draws
        let (w, levels) = framed(rect(0, 20, 1000, 780), vec![above(rect(500, 200, 120, 300))]);
        assert!(!points_unobscured(w, &levels, &segment((400, 300), (700, 300))));
        let (w, levels) = framed(rect(0, 20, 1000, 780), vec![]);
        assert!(
            !points_unobscured(w, &levels, &segment((900, 300), (1100, 300))),
            "out of the window"
        );
        let (w, levels) = on_root(rect(800, 20, 600, 400));
        assert!(
            !points_unobscured(w, &levels, &segment((900, 300), (1300, 300))),
            "off the screen"
        );
        // windows above that are unmapped or InputOnly draw nothing
        let (w, levels) = framed(
            rect(0, 20, 1000, 780),
            vec![
                Above {
                    viewable: false,
                    ..above(SCREEN)
                },
                Above {
                    input_only: true,
                    ..above(SCREEN)
                },
            ],
        );
        assert!(points_unobscured(w, &levels, &segment((100, 100), (200, 200))));
    }

    #[test]
    fn doubt_counts_as_obscured() {
        assert!(
            !points_unobscured(rect(0, 0, 10, 10), &[], &[(1, 1)]),
            "no stacking read"
        );
        let (w, levels) = framed(rect(10, 30, 900, 700), vec![]);
        assert!(!points_unobscured(w, &levels, &[]), "no path");
        assert!(!fully_unobscured(rect(0, 0, 10, 10), &[]));
        let (_, levels) = framed(rect(10, 30, 900, 700), vec![]);
        assert!(!fully_unobscured(rect(10, 30, 0, 700), &levels));
    }
}
