//! Why a state read's tree is not there (#228 task 3; the pre-flight
//! `docs/doperpowers/specs/2026-11-27-electron-a11y-preflight.md`, §E3, and its Decision Log's ruling 1251): the one
//! field `get_window_state`'s answer gains, `tree_unavailable: {reason}`, for an Electron window alone, from what
//! association and the wait already tell apart. cua's facade renders each reason as one sentence after the tree
//! (`src/cua-api/bind-linux-app.mjs`); the tree and its source stay as they are.
//!
//! - `no_provider`: association found no application on the accessibility bus for the window's process
//!   (`atspi::Fallback::no_provider`), and the window's `WM_WINDOW_ROLE` is Electron's own. Such an app joins the bus
//!   only as it starts, so a restart through `launch_app` is the remedy.
//! - `asked`: the engine asked the application to turn its accessibility on (`ask.rs`), and the wait (`wait.rs`)
//!   reached its bound with the frame still alone. The next observation reads again, with no wait.
//!
//! Every other window has no field, so its answer is what it was before: NW.js and CEF (other roles, or none), a
//! window of an application that is on the bus but has no frame for it (a GTK dialog of a Chromium app), a window
//! whose process the bus could not name, a screenshot, and every other toolkit.

use crate::ask::ELECTRON_ROLE;
use crate::wait::{End, Shape, Summary};

/// Why the tree is not there.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reason {
    /// An Electron window whose process has no application on the accessibility bus.
    NoProvider,
    /// An Electron application asked to turn its accessibility on, whose frame was still alone at the wait's bound.
    Asked,
}

impl Reason {
    /// The field's word for it, as the facade reads it.
    pub fn name(self) -> &'static str {
        match self {
            Reason::NoProvider => "no_provider",
            Reason::Asked => "asked",
        }
    }

    /// The answer's `tree_unavailable`.
    pub fn field(self) -> serde_json::Value {
        serde_json::json!({ "reason": self.name() })
    }
}

/// What association and the wait report of a state read.
#[derive(Debug, Clone, Copy)]
pub struct Report<'a> {
    /// Whether the caller wants the tree (false for a screenshot, which throws it away).
    pub tree_wanted: bool,
    /// Whether association found no application on the bus for the window's process, every application's process
    /// named (`atspi::Fallback::no_provider`).
    pub no_provider: bool,
    /// The wait after the request, when the request went out on this read (`ask::Outcome::waited`).
    pub waited: Option<&'a Summary>,
}

/// The reason for `report`, if it has one; `role` reads the window's `WM_WINDOW_ROLE`, only for a window whose process
/// is not on the bus.
pub fn reason(report: &Report, role: impl FnOnce() -> Option<String>) -> Option<Reason> {
    if !report.tree_wanted {
        return None;
    }
    if report.no_provider {
        return (role().as_deref() == Some(ELECTRON_ROLE)).then_some(Reason::NoProvider);
    }
    report
        .waited
        .is_some_and(|w| w.end == End::Bound && w.shape == Shape::Bare)
        .then_some(Reason::Asked)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::time::Duration;

    const ROLES: [Option<&str>; 6] = [
        Some("browser-window"),
        Some("browser"),
        Some("pop-up"),
        Some("dialog"),
        Some("GtkFileChooserDialog"),
        None,
    ];
    const ENDS: [End; 4] = [End::Page, End::NoPage, End::Bound, End::Failed];
    const SHAPES: [Shape; 5] = [Shape::Bare, Shape::Pending, Shape::Page, Shape::NoPage, Shape::Views];

    fn waited(end: End, shape: Shape) -> Summary {
        Summary {
            end,
            shape,
            reads: 94,
            took: Duration::from_millis(1990),
            content_after: None,
            nodes: 1,
        }
    }

    /// The reason, and how many times the role was read.
    fn run(report: Report, role: Option<&str>) -> (Option<Reason>, u32) {
        let reads = Cell::new(0);
        let found = reason(&report, || {
            reads.set(reads.get() + 1);
            role.map(str::to_string)
        });
        (found, reads.get())
    }

    #[test]
    fn each_reason_is_its_field_as_the_facade_reads_it() {
        assert_eq!(Reason::NoProvider.field().to_string(), r#"{"reason":"no_provider"}"#);
        assert_eq!(Reason::Asked.field().to_string(), r#"{"reason":"asked"}"#);
    }

    #[test]
    fn a_window_whose_process_is_not_on_the_bus_is_told_so_only_when_its_role_is_electrons() {
        for role in ROLES {
            let report = Report {
                tree_wanted: true,
                no_provider: true,
                waited: None,
            };
            let expected = (role == Some("browser-window")).then_some(Reason::NoProvider);
            // NW.js (`pop-up`), Chrome (`browser`), CEF (no role) and every other toolkit: nothing
            assert_eq!(run(report, role), (expected, 1), "{role:?}");
        }
    }

    #[test]
    fn a_window_whose_process_is_on_the_bus_or_unnamed_is_never_told_it_is_not_and_its_role_is_not_read() {
        // association's every other outcome (a frame; no frame of an application on the bus, as a GTK dialog of a
        // Chromium app; a process the bus could not name; no `_NET_WM_PID`; the vendor's errors) reports no_provider
        // false
        for role in ROLES {
            let report = Report {
                tree_wanted: true,
                no_provider: false,
                waited: None,
            };
            assert_eq!(run(report, role), (None, 0), "{role:?}");
        }
    }

    #[test]
    fn an_application_asked_is_told_so_only_when_the_bound_passed_with_its_frame_still_alone() {
        for end in ENDS {
            for shape in SHAPES {
                let summary = waited(end, shape);
                let report = Report {
                    tree_wanted: true,
                    no_provider: false,
                    waited: Some(&summary),
                };
                let expected = (end == End::Bound && shape == Shape::Bare).then_some(Reason::Asked);
                assert_eq!(run(report, Some("browser-window")), (expected, 0), "{end:?} {shape:?}");
            }
        }
    }

    #[test]
    fn an_application_not_asked_on_this_read_has_no_reason() {
        // asked before on this connection, left by the rule, or a send that failed: no wait, so nothing to say
        let report = Report {
            tree_wanted: true,
            no_provider: false,
            waited: None,
        };
        assert_eq!(run(report, Some("browser-window")), (None, 0));
    }

    #[test]
    fn a_screenshot_has_no_reason_and_reads_no_role() {
        let summary = waited(End::Bound, Shape::Bare);
        for (no_provider, waited) in [(true, None), (false, Some(&summary))] {
            let report = Report {
                tree_wanted: false,
                no_provider,
                waited,
            };
            assert_eq!(run(report, Some("browser-window")), (None, 0));
        }
    }
}
