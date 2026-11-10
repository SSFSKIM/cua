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

    fn intersection(&self, other: &Rect) -> Rect {
        let (x, y) = (self.x.max(other.x), self.y.max(other.y));
        let (x2, y2) = (
            (self.x + self.w).min(other.x + other.w),
            (self.y + self.h).min(other.y + other.h),
        );
        Rect {
            x,
            y,
            w: (x2 - x).max(0),
            h: (y2 - y).max(0),
        }
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
/// is viewable, whether it is InputOnly (which draws nothing), and whether it belongs to the window's own X client (its
/// resource-id base: the application's own popups and menus, which take its input as the window would).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Above {
    pub id: u32,
    pub rect: Rect,
    pub viewable: bool,
    pub input_only: bool,
    pub own: bool,
    pub override_redirect: bool,
}

/// One level of the window's ancestry: the parent's inside rectangle, which clips its children (the root's is the
/// screen), the parent's depth, and the parent's children stacked above this level's window.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Level {
    pub clip: Rect,
    pub depth: u8,
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

/// Whether the server already keeps the window's whole contents in an offscreen pixmap, complete whatever covers it on
/// the screen (M4's T9 and its review, capture readiness): the window, or the nearest ancestor of another depth than its
/// own parent (an ARGB frame on the 24-bit root), can be shown only from a pixmap of its own (Composite's implicit
/// redirection). A window that is that ancestor owns the pixmap. A window inside it has its contents there only where
/// they are drawn: the whole window inside every ancestor up to it, and no sibling stacked above the window, or above an
/// ancestor inside it, overlapping the window, judged by outer rectangles as [`fully_unobscured`] judges the screen.
/// Otherwise the window's own new pixmap is filled from that ancestor's (`compNewPixmap` copies the parent with its
/// inferiors), the sibling's pixels or nothing where they fall, and only the window's repaint can mend it. `depth` is
/// the window's; no change of depth up to the root, or no levels read, is doubt.
pub fn complete_offscreen(window: Rect, depth: u8, levels: &[Level]) -> bool {
    let mut below = depth;
    for (i, level) in levels.iter().enumerate() {
        if level.depth != below {
            return i == 0 || fully_unobscured(window, &levels[..i]);
        }
        below = level.depth;
    }
    false
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

/// Where real pointer input at a window's points would go (task 63: the foreground route's pointer input after the
/// window is activated). XTEST events go to the topmost window under each point, whatever holds the focus, so input
/// meant for the window reaches it only where nothing is stacked above it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reach {
    /// No point inside the window lies under another client's window: the input reaches the window wherever it lands
    /// in it. Points outside the window, an ancestor or the screen go where they would go, as before the wait (the
    /// design session's ruling on task 63, 2026-11-06: a drag from the window into another window is sent).
    Window,
    /// A point inside the window lies under another client's window stacked above it or above an ancestor, judged by
    /// outer rectangles as `points_unobscured` judges a drag's path, InputOnly windows included, since they take
    /// pointer input though they draw nothing; or there is no stacking to judge by. The window's own client's windows
    /// (its popups and menus) take the input for the application and do not count. A window manager's raise can still
    /// change this.
    Covered,
}

/// Whether a window stacked above takes pointer input that would go to the window under it.
fn takes_input(a: &Above) -> bool {
    a.viewable && !a.own
}

/// [`Reach`] of real pointer input at `points` (root coordinates) into `window`.
pub fn reach(window: Rect, levels: &[Level], points: &[(i32, i32)]) -> Reach {
    let inside = |p| window.contains_point(p) && levels.iter().all(|level| level.clip.contains_point(p));
    let under_another = |p| {
        levels
            .iter()
            .any(|level| level.above.iter().any(|a| takes_input(a) && a.rect.contains_point(p)))
    };
    let mut inside = points.iter().copied().filter(|&p| inside(p)).peekable();
    if inside.peek().is_some() && (levels.is_empty() || inside.any(under_another)) {
        Reach::Covered
    } else {
        Reach::Window
    }
}

/// The windows that may hold `activate_window`'s answer (task 63): every window stacked above `window` or an ancestor
/// that overlaps the part of it inside every ancestor and the screen and could be a managed window of another client:
/// viewable, InputOutput, not override-redirect (a notification bubble's or a menu's), not the window's own. Which of
/// them is in the normal layer is the window manager's to say (`X11::on_top`). A window with nothing on the screen has
/// nothing to cover; None is doubt (no stacking read).
pub fn covers(window: Rect, levels: &[Level]) -> Option<Vec<Above>> {
    if levels.is_empty() {
        return None;
    }
    let visible = levels.iter().fold(window, |r, level| r.intersection(&level.clip));
    if visible.is_empty() {
        return Some(Vec::new());
    }
    let managed = |a: &&Above| takes_input(a) && !a.input_only && !a.override_redirect;
    Some(
        levels
            .iter()
            .flat_map(|level| level.above.iter().filter(managed))
            .filter(|a| a.rect.overlaps(&visible))
            .copied()
            .collect(),
    )
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
            id: 0,
            rect: r,
            viewable: true,
            input_only: false,
            own: false,
            override_redirect: false,
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
                    depth: 24,
                    above: vec![],
                },
                Level {
                    clip: SCREEN,
                    depth: 24,
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
                depth: 24,
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
            depth: 24,
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

    /// GTK 4 under Openbox: a 32-bit client in a 32-bit frame on the 24-bit root, the screen over the frame covered.
    fn argb_framed(client: Rect) -> (Rect, Vec<Level>) {
        let (w, mut levels) = framed(client, vec![above(SCREEN)]);
        levels[0].depth = 32;
        (w, levels)
    }

    #[test]
    fn a_window_inside_a_frame_of_another_depth_is_complete_offscreen_where_nothing_inside_the_frame_covers_it() {
        let (w, levels) = argb_framed(rect(10, 30, 900, 700));
        assert!(!fully_unobscured(w, &levels), "covered on the screen");
        assert!(complete_offscreen(w, 32, &levels), "whole in its frame's pixmap");
        // what covers the frame on the screen never reaches the frame's pixmap; InputOnly and unmapped siblings draw
        // nothing there, and a sibling beside it nothing over it
        let (w, mut levels) = argb_framed(rect(10, 30, 900, 700));
        levels[0].above.extend([
            Above {
                input_only: true,
                ..above(rect(10, 30, 900, 700))
            },
            Above {
                viewable: false,
                ..above(rect(10, 30, 900, 700))
            },
            above(rect(5, 5, 905, 25)),
        ]);
        assert!(complete_offscreen(w, 32, &levels));
    }

    #[test]
    fn a_same_depth_sibling_over_it_or_a_frame_that_cuts_it_leaves_its_pixmap_to_its_repaint() {
        // the review's case: ancestry depths [32, 32, 24] and a same-depth sibling over it inside the frame, whose
        // pixels the frame's pixmap holds there
        let (w, mut levels) = argb_framed(rect(10, 30, 900, 700));
        levels[0].above.push(above(rect(500, 400, 20, 20)));
        assert!(!complete_offscreen(w, 32, &levels), "one sibling over a corner");
        // a sibling over an ancestor inside the frame covers it as well
        let middle = rect(10, 30, 900, 700);
        let levels = vec![
            Level {
                clip: middle,
                depth: 32,
                above: vec![],
            },
            Level {
                clip: rect(5, 5, 910, 730),
                depth: 32,
                above: vec![above(rect(100, 100, 10, 10))],
            },
            Level {
                clip: SCREEN,
                depth: 24,
                above: vec![],
            },
        ];
        assert!(!complete_offscreen(rect(10, 30, 900, 700), 32, &levels));
        // the window reaching past its frame: the part outside was never drawn in the frame's pixmap
        let (_, levels) = argb_framed(rect(10, 30, 900, 700));
        assert!(
            complete_offscreen(rect(10, 30, 905, 700), 32, &levels),
            "flush with the frame's edge"
        );
        assert!(
            !complete_offscreen(rect(10, 30, 906, 700), 32, &levels),
            "one pixel past it"
        );
    }

    #[test]
    fn a_window_of_another_depth_than_its_parent_owns_its_pixmap() {
        // an ARGB top-level, and a 24-bit window in an ARGB frame: whatever lies over them, their own pixmap
        let (w, mut levels) = on_root(rect(10, 30, 900, 700));
        levels[0].above.push(above(SCREEN));
        assert!(complete_offscreen(w, 32, &levels));
        let (w, mut levels) = argb_framed(rect(10, 30, 900, 700));
        levels[0].above.push(above(rect(10, 30, 900, 700)));
        assert!(complete_offscreen(w, 24, &levels));
    }

    #[test]
    fn one_depth_all_the_way_or_no_ancestry_is_doubt() {
        let (w, levels) = framed(rect(10, 30, 900, 700), vec![]);
        assert!(fully_unobscured(w, &levels));
        assert!(
            !complete_offscreen(w, 24, &levels),
            "the screen shows it: its fully unobscured shortcut is another rule's"
        );
        assert!(!complete_offscreen(w, 32, &[]), "no levels read");
    }

    #[test]
    fn pointer_input_reaches_the_window_only_where_nothing_is_stacked_above_it() {
        // the front window over the window's bottom half, as before a window manager's raise
        let (w, levels) = framed(rect(0, 20, 1000, 780), vec![above(rect(0, 410, 1280, 390))]);
        assert_eq!(
            reach(w, &levels, &[(300, 103)]),
            Reach::Window,
            "a point above the cover"
        );
        assert_eq!(reach(w, &levels, &[(300, 500)]), Reach::Covered, "a point under it");
        assert_eq!(
            reach(w, &levels, &segment((300, 100), (300, 600))),
            Reach::Covered,
            "a drag path running under it"
        );
        // raised: the cover is below it now, among the levels' windows above it no more
        let (w, levels) = framed(rect(0, 20, 1000, 780), vec![]);
        assert_eq!(reach(w, &levels, &segment((300, 100), (300, 600))), Reach::Window);
        // a sibling above inside the frame takes the input too
        let (w, mut levels) = framed(rect(0, 20, 1000, 780), vec![]);
        levels[0].above.push(above(rect(290, 90, 20, 20)));
        assert_eq!(reach(w, &levels, &[(300, 100)]), Reach::Covered);
    }

    #[test]
    fn an_input_only_window_above_takes_the_input_though_it_draws_nothing() {
        let input_only = Above {
            input_only: true,
            ..above(rect(250, 50, 100, 100))
        };
        let (w, levels) = framed(rect(0, 20, 1000, 780), vec![input_only]);
        assert!(
            points_unobscured(w, &levels, &[(300, 100)]),
            "nothing drawn over the point"
        );
        assert_eq!(
            reach(w, &levels, &[(300, 100)]),
            Reach::Covered,
            "but it would take the press"
        );
        // unmapped windows take nothing
        let unmapped = Above {
            viewable: false,
            ..above(SCREEN)
        };
        let (w, levels) = framed(rect(0, 20, 1000, 780), vec![unmapped]);
        assert_eq!(reach(w, &levels, &[(300, 100)]), Reach::Window);
    }

    #[test]
    fn the_window_s_own_popup_above_it_takes_the_input_for_the_application() {
        let menu = Above {
            own: true,
            ..above(rect(250, 50, 100, 100))
        };
        let (w, levels) = framed(rect(0, 20, 1000, 780), vec![menu, above(rect(600, 50, 100, 100))]);
        assert!(!points_unobscured(w, &levels, &[(300, 100)]), "its pixels are covered");
        assert_eq!(
            reach(w, &levels, &[(300, 100)]),
            Reach::Window,
            "a menu item of its own"
        );
        assert_eq!(
            reach(w, &levels, &[(650, 100)]),
            Reach::Covered,
            "another client's window"
        );
    }

    #[test]
    fn only_the_points_inside_the_window_are_waited_for_and_a_drag_into_another_window_reaches_it() {
        // a drag from the window into another window beside it (dedicated mode's cross-window drag): before the raise
        // the cover above the window's part of the path holds it; once raised, the part in the other window goes as it
        // would have, and the drag is sent
        let path = segment((300, 100), (1200, 100));
        let (w, levels) = framed(rect(0, 20, 1000, 780), vec![above(rect(0, 0, 1280, 800))]);
        assert_eq!(
            reach(w, &levels, &path),
            Reach::Covered,
            "the window's own part still covered"
        );
        let other = above(rect(1010, 0, 270, 800));
        let (w, levels) = framed(rect(0, 20, 1000, 780), vec![other]);
        assert_eq!(
            reach(w, &levels, &path),
            Reach::Window,
            "raised: sent, the rest into the other window"
        );
        // points outside the window, an ancestor or the screen go as before, whatever is stacked there
        let (w, levels) = framed(rect(0, 20, 1000, 780), vec![above(rect(0, 0, 1280, 800))]);
        assert_eq!(
            reach(w, &levels, &[(1100, 100)]),
            Reach::Window,
            "past the window's right edge"
        );
        assert_eq!(
            reach(w, &levels, &[(300, 10)]),
            Reach::Window,
            "on the frame's title bar"
        );
        let (w, levels) = on_root(rect(800, 20, 600, 400));
        assert_eq!(reach(w, &levels, &[(1300, 100)]), Reach::Window, "off the screen");
        assert_eq!(reach(w, &levels, &[]), Reach::Window, "no point");
        assert_eq!(reach(w, &[], &[(900, 100)]), Reach::Covered, "no stacking read: doubt");
    }

    #[test]
    fn the_activation_waits_only_for_managed_windows_overlapping_the_part_on_the_screen() {
        let ids = |c: Option<Vec<Above>>| c.map(|c| c.iter().map(|a| a.id).collect::<Vec<_>>());
        let (w, levels) = framed(rect(0, 20, 1000, 780), vec![]);
        assert_eq!(ids(covers(w, &levels)), Some(vec![]), "nothing above it");
        let corner = Above {
            id: 7,
            ..above(rect(990, 700, 50, 50))
        };
        let (w, levels) = framed(rect(0, 20, 1000, 780), vec![corner]);
        assert_eq!(
            ids(covers(w, &levels)),
            Some(vec![7]),
            "a corner of it covered: its layer decides"
        );
        let (w, levels) = framed(rect(0, 20, 1000, 780), vec![above(rect(1010, 0, 200, 200))]);
        assert_eq!(
            ids(covers(w, &levels)),
            Some(vec![]),
            "a window above that does not overlap it"
        );
        // none of these is a managed window: its own popup, another client's override-redirect window (a notification
        // bubble, a menu), an InputOnly window
        let over = |a: Above| framed(rect(0, 20, 1000, 780), vec![a]);
        for (a, what) in [
            (
                Above {
                    own: true,
                    ..above(rect(250, 50, 100, 100))
                },
                "its own popup",
            ),
            (
                Above {
                    override_redirect: true,
                    ..above(rect(250, 50, 100, 100))
                },
                "another client's override-redirect window",
            ),
            (
                Above {
                    input_only: true,
                    ..above(rect(250, 50, 100, 100))
                },
                "an InputOnly window",
            ),
        ] {
            let (w, levels) = over(a);
            assert_eq!(ids(covers(w, &levels)), Some(vec![]), "{what}");
        }
        // only the part on the screen counts: a window above the off-screen part covers nothing
        let (w, mut levels) = on_root(rect(800, 20, 600, 400));
        levels[0].above.push(above(rect(1280, 20, 200, 200)));
        assert_eq!(ids(covers(w, &levels)), Some(vec![]), "above its off-screen part only");
        let (w, levels) = on_root(rect(1300, 20, 600, 400));
        assert_eq!(ids(covers(w, &levels)), Some(vec![]), "wholly off the screen");
        assert_eq!(ids(covers(rect(0, 0, 10, 10), &[])), None, "no stacking read: doubt");
    }
}
