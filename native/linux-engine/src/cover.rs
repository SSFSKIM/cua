//! Whether a window is fully unobscured (Design, Retention and the fixed waits): the whole window is on the screen
//! and inside every ancestor, and no window above it (or above any of its ancestors) in `QueryTree`'s stacking
//! order overlaps it. Overlap is judged by each window's outer rectangle, so a shaped or translucent window above
//! counts as covering whatever its shape; any doubt counts as obscured.

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

    #[test]
    fn doubt_counts_as_obscured() {
        assert!(!fully_unobscured(rect(0, 0, 10, 10), &[]));
        let (_, levels) = framed(rect(10, 30, 900, 700), vec![]);
        assert!(!fully_unobscured(rect(10, 30, 0, 700), &levels));
    }
}
