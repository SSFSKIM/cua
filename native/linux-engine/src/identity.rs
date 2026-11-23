//! Telling same-title accessibility frames apart (Design, Window association; M4's T5, the design session's rulings F5
//! and C14). Where the vendor's association gives up on frames that share a title and size, and answers a one-node X11
//! tree that looks like an empty window, cua compares each frame's screen extents with where the X11 window is, then
//! the frame's `active` state with `_NET_ACTIVE_WINDOW`; what still leaves more than one, or none, answers
//! `duplicates_sentence` on every request. A wrong association is worse than the sentence: it would read another
//! window's tree, or send its input there. The decisions here are pure; `atspi::associate` reads what they decide on.

use crate::families::Toolkit;

/// The sentence for an X11 window whose accessibility frame cannot be told apart from its duplicates'.
pub fn duplicates_sentence(window: u32) -> String {
    format!("Window {window} matches several accessibility windows; close or retitle the duplicates")
}

/// A rectangle on the screen.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

impl Rect {
    /// From `Component.GetExtents`' corners (`table::extents_of`).
    pub fn from_corners((x0, y0, x1, y1): (i32, i32, i32, i32)) -> Rect {
        Rect {
            x: x0,
            y: y0,
            width: x1.saturating_sub(x0),
            height: y1.saturating_sub(y0),
        }
    }
}

/// Where an X11 window is: its client's rectangle (the translated origin and its size, as `list_windows` describes it)
/// and, when its window manager publishes `_NET_FRAME_EXTENTS`, the frame's around it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Placement {
    pub client: Rect,
    pub frame: Option<Rect>,
}

impl Placement {
    /// `extents`: `_NET_FRAME_EXTENTS`, `[left, right, top, bottom]`.
    pub fn new(client: Rect, extents: Option<[u32; 4]>) -> Placement {
        let frame = extents.map(|[left, right, top, bottom]| {
            let (left, right, top, bottom) = (left as i32, right as i32, top as i32, bottom as i32);
            Rect {
                x: client.x - left,
                y: client.y - top,
                width: client.width + left + right,
                height: client.height + top + bottom,
            }
        });
        Placement { client, frame }
    }

    /// Whether a frame whose screen extents are `extents` is at this window. Toolkits report one of two rectangles,
    /// measured under Openbox: the client's (Chromium, Qt 5 and 6) or the window manager frame's (GTK 3); exactly
    /// equal, since both come from the same server's geometry.
    pub fn holds(&self, extents: Rect) -> bool {
        extents == self.client || Some(extents) == self.frame
    }
}

/// Whether a toolkit's frames report their extents in screen coordinates, as measured on the #171 VM (M4's T5 probes):
/// Chromium, GTK 3, Qt 5 and Qt 6 do, and GTK 4 reports (0, 0) wherever its window is. A frame's extents are evidence
/// of whose it is only where they are known to say where the window is, so an unmeasured toolkit, or one whose name or
/// version cannot be read, counts as not: its duplicates answer the sentence, and the caption rule leaves it unmatched.
pub fn screen_extents(toolkit: Option<&Toolkit>) -> bool {
    let Some(toolkit) = toolkit else { return false };
    let named = |name: &str| toolkit.name.eq_ignore_ascii_case(name);
    match toolkit.major() {
        _ if named("Chromium") => true,
        Some(3) => named("GTK"),
        Some(5 | 6) => named("Qt"),
        _ => false,
    }
}

/// The caption rule's last check (kate, M0.4): the one frame named for the title's caption is the window's only when
/// its provider reports screen extents (`screen_extents`) and they put it at the window. Window-relative extents put a
/// frame at the origin wherever its window is, so they would match a window there that is not its own.
pub fn caption_holds(target: &Placement, screen: bool, extents: Option<Rect>) -> bool {
    screen && extents.is_some_and(|at| target.holds(at))
}

/// A candidate frame as the tie-break sees it: its screen extents (None when they could not be read) and whether its
/// states include `active`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Seen {
    pub extents: Option<Rect>,
    pub active: bool,
}

/// What told the frame apart.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum By {
    Position,
    Active,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TieBreak {
    /// The candidate at this index is the window's.
    Frame(usize, By),
    /// None of the candidates, or more than one, can be said to be the window's.
    Several,
}

/// Which of `seen` (the frames whose Name matched the window's title) is the frame of `target`, an X11 window among
/// same-title `siblings` of its process:
///
/// 1. **Position.** The one frame at the target's place, provided no sibling is at that place too.
/// 2. **The active state.** Where the position leaves frames at the target's place, and the target is the active window
///    (`_NET_ACTIVE_WINDOW`), the one frame among them whose states include `active`, provided it is the only active
///    frame among the candidates: a toolkit marks the active window's frame, so the active frame is the target's.
///    A toolkit that never marks it (Chrome, measured) leaves its stacked duplicates several.
///
/// Anything else is several, never a guess.
pub fn tie_break(seen: &[Seen], target: &Placement, siblings: &[Placement], target_active: bool) -> TieBreak {
    let here: Vec<usize> = (0..seen.len())
        .filter(|&i| seen[i].extents.is_some_and(|e| target.holds(e)))
        .collect();
    if let [only] = here.as_slice() {
        let at = seen[*only].extents.expect("filtered on extents");
        if !siblings.iter().any(|s| s.holds(at)) {
            return TieBreak::Frame(*only, By::Position);
        }
    }
    if target_active {
        let active: Vec<usize> = (0..seen.len()).filter(|&i| seen[i].active).collect();
        if let [only] = active.as_slice()
            && here.contains(only)
        {
            return TieBreak::Frame(*only, By::Active);
        }
    }
    TieBreak::Several
}

/// The caption of a title that ends with ` — ` and the application's name, as KDE applications title their windows
/// (kate: `<file>  — Kate`), trimmed: the text before the last ` — `. None for a title without it, or an empty caption.
pub fn caption(title: &str) -> Option<&str> {
    let (before, _) = title.rsplit_once(" \u{2014} ")?;
    Some(before.trim()).filter(|c| !c.is_empty())
}

/// Whether a frame's Name names a caption: equal once trimmed, ASCII case aside, as the vendor's title match compares
/// (kate names its frame `<file> `, where its title is `<file>  — Kate`).
pub fn names_caption(name: &str, caption: &str) -> bool {
    let name = name.trim();
    name.len() == caption.len() && name.eq_ignore_ascii_case(caption)
}

#[cfg(test)]
mod tests {
    use super::*;

    const fn rect(x: i32, y: i32, width: i32, height: i32) -> Rect {
        Rect { x, y, width, height }
    }

    /// An undecorated window (Chrome) at a point: the window manager's frame is the client.
    fn bare(x: i32, y: i32) -> Placement {
        Placement::new(rect(x, y, 600, 380), Some([0, 0, 0, 0]))
    }

    fn seen(x: i32, y: i32, active: bool) -> Seen {
        Seen {
            extents: Some(rect(x, y, 600, 380)),
            active,
        }
    }

    #[test]
    fn the_duplicates_sentence() {
        assert_eq!(
            duplicates_sentence(77),
            "Window 77 matches several accessibility windows; close or retitle the duplicates"
        );
    }

    #[test]
    fn a_frame_holds_its_window_by_the_client_or_the_window_managers_frame() {
        // GTK 3 under Openbox: the client at (1, 20), the frame's extents are the window manager's frame (1, 1, 20, 5)
        let gtk3 = Placement::new(rect(1, 20, 600, 380), Some([1, 1, 20, 5]));
        assert_eq!(gtk3.frame, Some(rect(0, 0, 602, 405)));
        assert!(gtk3.holds(rect(0, 0, 602, 405)), "GTK 3 reports the frame");
        assert!(gtk3.holds(rect(1, 20, 600, 380)), "Chromium and Qt report the client");
        assert!(
            !gtk3.holds(rect(0, 0, 600, 380)),
            "the frame's origin with the client's size is neither"
        );
        assert!(!gtk3.holds(rect(1, 20, 602, 405)));
        // no _NET_FRAME_EXTENTS: the client alone
        let unknown = Placement::new(rect(1, 20, 600, 380), None);
        assert_eq!(unknown.frame, None);
        assert!(unknown.holds(rect(1, 20, 600, 380)));
        assert!(!unknown.holds(rect(0, 0, 602, 405)));
    }

    #[test]
    fn placed_apart_each_window_takes_the_frame_at_its_position() {
        let frames = [seen(0, 0, false), seen(640, 0, false), seen(0, 400, false)];
        let windows = [bare(0, 0), bare(640, 0), bare(0, 400)];
        for (i, target) in windows.iter().enumerate() {
            let siblings: Vec<Placement> = windows
                .iter()
                .enumerate()
                .filter(|(j, _)| *j != i)
                .map(|(_, w)| *w)
                .collect();
            assert_eq!(
                tie_break(&frames, target, &siblings, false),
                TieBreak::Frame(i, By::Position),
                "window {i}"
            );
            assert_eq!(
                tie_break(&frames, target, &siblings, true),
                TieBreak::Frame(i, By::Position),
                "window {i}, active"
            );
        }
    }

    #[test]
    fn stacked_with_another_window_active_every_duplicate_is_several() {
        let frames = [seen(0, 0, false), seen(0, 0, false), seen(0, 0, false)];
        let siblings = [bare(0, 0), bare(0, 0)];
        assert_eq!(tie_break(&frames, &bare(0, 0), &siblings, false), TieBreak::Several);
    }

    #[test]
    fn stacked_with_one_duplicate_active_only_that_one_is_told_apart() {
        let frames = [seen(0, 0, false), seen(0, 0, true), seen(0, 0, false)];
        let siblings = [bare(0, 0), bare(0, 0)];
        assert_eq!(
            tie_break(&frames, &bare(0, 0), &siblings, true),
            TieBreak::Frame(1, By::Active),
            "the active window"
        );
        assert_eq!(
            tie_break(&frames, &bare(0, 0), &siblings, false),
            TieBreak::Several,
            "an inactive one"
        );
    }

    #[test]
    fn the_active_state_counts_only_when_it_names_one_frame_at_the_windows_position() {
        let siblings = [bare(0, 0), bare(0, 0)];
        // a toolkit that never reports the state (Chrome): several, even for the active window
        let none = [seen(0, 0, false), seen(0, 0, false), seen(0, 0, false)];
        assert_eq!(tie_break(&none, &bare(0, 0), &siblings, true), TieBreak::Several);
        // two frames active at once: a stale state, never a guess
        let two = [seen(0, 0, true), seen(0, 0, true), seen(0, 0, false)];
        assert_eq!(tie_break(&two, &bare(0, 0), &siblings, true), TieBreak::Several);
        // the one active frame is elsewhere: it is not this window's
        let elsewhere = [seen(0, 0, false), seen(0, 0, false), seen(640, 0, true)];
        assert_eq!(tie_break(&elsewhere, &bare(0, 0), &siblings, true), TieBreak::Several);
    }

    #[test]
    fn a_frame_at_the_windows_position_that_a_sibling_shares_is_not_told_apart_by_position() {
        // one frame, two windows on one spot (the other's frame not exposed): whose it is, the position cannot say
        let frames = [seen(0, 0, false)];
        assert_eq!(tie_break(&frames, &bare(0, 0), &[bare(0, 0)], false), TieBreak::Several);
        // the active state can: the target is the active window and the frame is active
        let active = [seen(0, 0, true)];
        assert_eq!(
            tie_break(&active, &bare(0, 0), &[bare(0, 0)], true),
            TieBreak::Frame(0, By::Active)
        );
        // a sibling elsewhere leaves the position decisive
        assert_eq!(
            tie_break(&frames, &bare(0, 0), &[bare(640, 0)], false),
            TieBreak::Frame(0, By::Position)
        );
    }

    #[test]
    fn no_frame_at_the_windows_position_is_several() {
        // stale frames of closed windows elsewhere, and a frame whose extents could not be read
        let frames = [
            seen(640, 0, false),
            Seen {
                extents: None,
                active: true,
            },
        ];
        assert_eq!(tie_break(&frames, &bare(0, 0), &[], true), TieBreak::Several);
        assert_eq!(tie_break(&[], &bare(0, 0), &[], true), TieBreak::Several);
    }

    #[test]
    fn window_relative_extents_place_every_frame_at_the_origin() {
        // GTK 4's frames report (0, 0) wherever their windows are: at the origin a window would take every frame,
        // which is why GTK 4 never reaches the tie-break (`associate`)
        let frames = [seen(0, 0, false), seen(0, 0, false)];
        assert_eq!(
            tie_break(&frames, &bare(0, 0), &[bare(640, 0)], false),
            TieBreak::Several
        );
        assert_eq!(
            tie_break(&frames, &bare(640, 0), &[bare(0, 0)], false),
            TieBreak::Several
        );
    }

    fn toolkit(name: &str, version: Option<&str>) -> Toolkit {
        Toolkit {
            name: name.into(),
            version: version.map(str::to_string),
        }
    }

    #[test]
    fn extents_are_screen_coordinates_only_for_the_toolkits_measured_to_report_them() {
        for (name, version) in [
            ("Chromium", Some("142.0.7444.59")),
            ("GTK", Some("3.24.41")),
            ("gtk", Some("3.24.41")),
            ("Qt", Some("5.15.13")),
            ("Qt", Some("6.4.2")),
        ] {
            assert!(screen_extents(Some(&toolkit(name, version))), "{name} {version:?}");
        }
        // GTK 4 reports (0, 0) wherever its window is; the rest were never measured, or cannot be read
        for (name, version) in [
            ("GTK", Some("4.14.5")),
            ("GTK", None),
            ("Qt", Some("4.8.7")),
            ("Gecko", Some("128.0")),
            ("VCL", Some("24.2")),
        ] {
            assert!(!screen_extents(Some(&toolkit(name, version))), "{name} {version:?}");
        }
        assert!(!screen_extents(None), "no toolkit read");
    }

    #[test]
    fn a_caption_frame_is_the_windows_only_by_screen_extents_at_its_place() {
        // kate (Qt 5): the frame's screen extents are its window's client rectangle
        let kate = bare(0, 0);
        assert!(caption_holds(&kate, true, Some(rect(0, 0, 600, 380))));
        assert!(!caption_holds(&kate, true, Some(rect(640, 0, 600, 380))), "elsewhere");
        assert!(!caption_holds(&kate, true, None), "no extents read");
        // the counterexample: a GTK 4 frame named for the caption belongs to a window displaced to (300, 200), yet
        // reports (0, 0, w, h), which is exactly where the target is; window-relative extents prove nothing
        assert!(!caption_holds(&bare(0, 0), false, Some(rect(0, 0, 600, 380))));
    }

    #[test]
    fn the_caption_before_the_applications_name() {
        assert_eq!(caption("notes.txt  — Kate"), Some("notes.txt"));
        assert_eq!(caption("a — b.txt  — Kate"), Some("a — b.txt"), "the last separator");
        assert_eq!(caption("notes.txt - gedit"), None, "a hyphen is not the separator");
        assert_eq!(caption("notes.txt"), None);
        assert_eq!(caption(" — Kate"), None, "an empty caption");
    }

    #[test]
    fn a_frame_is_named_for_a_caption_when_its_trimmed_name_equals_it() {
        assert!(names_caption("notes.txt ", "notes.txt"));
        assert!(
            names_caption("Notes.TXT", "notes.txt"),
            "ASCII case, as the title match"
        );
        assert!(!names_caption("notes.txt  — Kate", "notes.txt"));
        assert!(!names_caption("notes.txt2", "notes.txt"));
    }
}
