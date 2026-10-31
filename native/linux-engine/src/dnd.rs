//! A drag that becomes a drag and drop (#171 M3.1; Plan of Work, M3, "Open, decided on measurement"): an XDND source
//! takes the `XdndSelection` selection when its drag and drop starts, so a background-route drag into a window whose
//! family's drop changes the desktop (`families.rs`: Chrome activates, focuses and raises its window on a drop) watches
//! that selection through XFixes, from the drag's start through `SETTLE` after its release; a take by the target's own
//! X client (its windows share the resource-id base, as the paste route attributes its requests) means a drag and drop
//! began. In shared mode the answer follows the order of what the engine saw and sent ([`Outcome`], the design
//! session's ruling of 2026-10-31): a take seen before the release is cancelled before the drop (Escape on the
//! background route, then the release), so nothing was dropped; a take seen only after the release may have dropped; no
//! take within the settle is an ordinary drag; anything the order cannot tell gets the answer that the drop cannot be
//! confirmed. The drop's signature (the window newly active, focused or on top) cross-checks an in-time cancel where it
//! can see a change. A window already active, focused and fully unobscured is not watched: its drop changes nothing the
//! person sees.

use std::time::{Duration, Instant};

use anyhow::Result;
use x11rb::connection::Connection;
use x11rb::protocol::xfixes::{ConnectionExt as _, SelectionEventMask};
use x11rb::protocol::xproto::Window;

use crate::x11::X11;

/// How long after an in-time cancel the drop's signature is looked for, and how long after a drag's release a late take
/// of `XdndSelection` is still watched for: Chrome's activation follows its drop within milliseconds (M3.1's
/// late-cancel runs measured it).
pub const SETTLE: Duration = Duration::from_millis(300);
const SETTLE_POLL: Duration = Duration::from_millis(10);

/// The refusal of a drag cancelled before its drop, naming the application (`list_windows`' `app`).
pub fn cancelled(app: &str) -> String {
    format!(
        "{app} began a drag and drop, which changes the desktop; it was cancelled before the drop, so nothing was \
         dropped. Use a dedicated desktop, or activate the window first"
    )
}

/// The answer when the cancel came too late: the take was seen only after the release, or the drop's signature showed.
pub fn may_have_dropped(app: &str) -> String {
    format!(
        "{app} began a drag and drop, which changes the desktop, and it could not be cancelled in time: the drop may \
         have happened and the desktop changed. Use a dedicated desktop, or activate the window first"
    )
}

/// The answer when a drag and drop began and the order of events cannot tell whether the cancel came in time.
pub fn cannot_confirm(app: &str) -> String {
    format!(
        "{app} began a drag and drop, which changes the desktop; it was cancelled, but whether the drop landed cannot \
         be confirmed. Use a dedicated desktop, or activate the window first"
    )
}

/// What the order of a watched drag's events says about its drop.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// The target's client took `XdndSelection` before the release, and Escape went out before the release: cancelled
    /// in time.
    InTime,
    /// The take was seen only after the release went out, or (the measurement option that holds the Escape) the
    /// Escape followed the release: the drop may have happened.
    Late,
    /// No take within `SETTLE` after the release: no drag and drop began, an ordinary drag.
    NoStart,
    /// A take was seen and the cancel's own sends failed before the release went out, so the order cannot tell.
    Undecided,
}

impl Outcome {
    pub fn name(self) -> &'static str {
        match self {
            Outcome::InTime => "in_time",
            Outcome::Late => "late",
            Outcome::NoStart => "no_start",
            Outcome::Undecided => "undecided",
        }
    }
}

/// The answer to a watched drag: None for success (no drag and drop began), else the sentence it is refused with.
/// `signature` is whether the drop's signature showed after an in-time cancel, the cross-check.
pub fn answer(outcome: Outcome, signature: bool, app: &str) -> Option<String> {
    match outcome {
        Outcome::NoStart => None,
        Outcome::InTime if !signature => Some(cancelled(app)),
        Outcome::InTime | Outcome::Late => Some(may_have_dropped(app)),
        Outcome::Undecided => Some(cannot_confirm(app)),
    }
}

/// What a drop changes in a window's standing on the desktop: whether it is the active window, holds the X input
/// focus, and is on top of the stacking order.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Standing {
    pub active: bool,
    pub focused: bool,
    pub top: bool,
}

impl Standing {
    /// Whether `after` shows the drop's signature against `self`: the window became active, focused or on top.
    pub fn changed_to(self, after: Standing) -> bool {
        (after.active && !self.active) || (after.focused && !self.focused) || (after.top && !self.top)
    }

    /// Whether any part of the signature already holds, so a drop could not show it.
    pub fn any(self) -> bool {
        self.active || self.focused || self.top
    }
}

/// Whether the drop's signature shows within `SETTLE` after a cancel, read through `now`.
pub fn signature_within(before: Standing, mut now: impl FnMut() -> Standing) -> (bool, Duration) {
    let started = Instant::now();
    loop {
        if before.changed_to(now()) {
            return (true, started.elapsed());
        }
        if started.elapsed() >= SETTLE {
            return (false, started.elapsed());
        }
        std::thread::sleep(SETTLE_POLL);
    }
}

/// Whether a new owner of `XdndSelection` is the target's X client: the same resource-id base.
pub fn taken_by_target(owner: Window, target: Window, resource_id_mask: u32) -> bool {
    owner != x11rb::NONE && (owner & !resource_id_mask) == (target & !resource_id_mask)
}

/// The watch on `XdndSelection` for one drag. It owns the selection's reports while it runs: whatever else reads the
/// connection's events meanwhile (the server-time probe, the input session) keeps them for it
/// (`X11::take_selection_reports`).
pub struct DndWatch {
    selection: u32,
    target: Window,
    mask: u32,
    started: bool,
}

impl DndWatch {
    pub fn start(x: &mut X11, target: Window) -> Result<DndWatch> {
        x.ensure_xfixes()?;
        let selection = x.atom("XdndSelection");
        x.keep_selection_reports();
        x.conn
            .xfixes_select_selection_input(x.root, selection, SelectionEventMask::SET_SELECTION_OWNER)?
            .check()?;
        Ok(DndWatch {
            selection,
            target,
            mask: x.conn.setup().resource_id_mask,
            started: false,
        })
    }

    /// Whether the target has begun a drag and drop, from the reports that have arrived so far.
    pub fn started(&mut self, x: &mut X11) -> bool {
        for report in x.take_selection_reports() {
            if report.selection == self.selection {
                self.started |= taken_by_target(report.owner, self.target, self.mask);
            }
        }
        self.started
    }

    /// Whether a drag and drop was seen to start.
    pub fn is_started(&self) -> bool {
        self.started
    }

    /// The watch ended: the selection no longer watched, its reports no longer kept.
    pub fn stop(self, x: &mut X11) {
        let _ = x
            .conn
            .xfixes_select_selection_input(x.root, self.selection, SelectionEventMask::default());
        let _ = x.conn.flush();
        x.stop_selection_reports();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_take_counts_only_from_the_target_s_own_client() {
        let mask = 0x1f_ffff;
        assert!(taken_by_target(0x0640_0012, 0x0640_0003, mask));
        assert!(!taken_by_target(0x0820_0012, 0x0640_0003, mask), "another client");
        assert!(
            !taken_by_target(x11rb::NONE, 0x0640_0003, mask),
            "the selection given up"
        );
    }

    #[test]
    fn the_refusal_names_the_application_and_says_nothing_was_dropped_only_when_cancelled_in_time() {
        assert_eq!(
            cancelled("Google-chrome"),
            "Google-chrome began a drag and drop, which changes the desktop; it was cancelled before the drop, so \
             nothing was dropped. Use a dedicated desktop, or activate the window first"
        );
        assert_eq!(
            may_have_dropped("Google-chrome"),
            "Google-chrome began a drag and drop, which changes the desktop, and it could not be cancelled in time: \
             the drop may have happened and the desktop changed. Use a dedicated desktop, or activate the window first"
        );
        assert_eq!(
            cannot_confirm("Google-chrome"),
            "Google-chrome began a drag and drop, which changes the desktop; it was cancelled, but whether the drop \
             landed cannot be confirmed. Use a dedicated desktop, or activate the window first"
        );
    }

    #[test]
    fn the_answer_follows_the_order_of_the_take_the_escape_and_the_release() {
        let app = "Google-chrome";
        assert_eq!(answer(Outcome::NoStart, false, app), None, "no drag and drop: a drag");
        assert_eq!(answer(Outcome::InTime, false, app), Some(cancelled(app)));
        assert_eq!(
            answer(Outcome::InTime, true, app),
            Some(may_have_dropped(app)),
            "the signature contradicts an in-time cancel"
        );
        assert_eq!(answer(Outcome::Late, false, app), Some(may_have_dropped(app)));
        assert_eq!(answer(Outcome::Undecided, false, app), Some(cannot_confirm(app)));
    }

    const BACK: Standing = Standing {
        active: false,
        focused: false,
        top: false,
    };

    #[test]
    fn a_window_newly_active_focused_or_on_top_is_the_drop_s_signature() {
        assert!(!BACK.changed_to(BACK));
        assert!(BACK.changed_to(Standing { active: true, ..BACK }));
        assert!(BACK.changed_to(Standing { focused: true, ..BACK }));
        assert!(BACK.changed_to(Standing { top: true, ..BACK }), "raised alone");
        let front = Standing {
            active: true,
            focused: true,
            top: true,
        };
        assert!(!front.changed_to(front), "already in front: nothing to see");
        assert!(!front.changed_to(BACK), "losing the front is not a drop's doing");
        assert!(!BACK.any() && front.any() && Standing { top: true, ..BACK }.any());
    }

    #[test]
    fn the_signature_is_looked_for_until_it_shows_or_the_settle_ends() {
        let (seen, waited) = signature_within(BACK, || BACK);
        assert!(!seen && waited >= SETTLE);
        let mut reads = 0;
        let (seen, waited) = signature_within(BACK, || {
            reads += 1;
            Standing {
                active: reads >= 3,
                ..BACK
            }
        });
        assert!(seen && waited < SETTLE, "the third read shows it");
    }
}
