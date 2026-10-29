//! Per-family settings (Design, Device mode and the foreground route; Clicks, scroll, drag, move): what an
//! application family needs that the engine's defaults do not give it, keyed by its AT-SPI `Application.ToolkitName`
//! or its X11 class (`WM_CLASS`'s class part), each entry with the evidence run that showed it. M1a.4 starts it with
//! the drag pacing; M2 adds each family's paste chord, M3 the input kinds a family ignores and their conditions.
//!
//! A drag sends the pinned build's events (one motion per pixel of the path, behaviour §10.4) with no wait after a
//! sample, after the press or before the release, unless the target's family is listed here.

use std::time::Duration;

/// A drag's waits: after each interpolated sample, after the press, before the release.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DragPacing {
    pub step: Duration,
    pub press: Duration,
    pub release: Duration,
}

impl DragPacing {
    /// No wait at all: what an unlisted family gets.
    pub const NONE: DragPacing = DragPacing {
        step: Duration::ZERO,
        press: Duration::ZERO,
        release: Duration::ZERO,
    };
}

/// One family's entry.
#[derive(Debug)]
pub struct Family {
    /// What the evidence calls it.
    pub name: &'static str,
    /// `Application.ToolkitName`, compared without regard to ASCII case.
    pub toolkit: Option<&'static str>,
    /// X11 classes, compared without regard to ASCII case: the family where no toolkit can be read.
    pub classes: &'static [&'static str],
    pub drag: DragPacing,
    /// The run that showed it (`docs/evidence/2026-10-28-own-linux-engine/`).
    pub evidence: &'static str,
}

impl Family {
    fn by_class(&self, class: &str) -> bool {
        self.classes.iter().any(|c| c.eq_ignore_ascii_case(class))
    }

    fn by_toolkit(&self, toolkit: &str) -> bool {
        self.toolkit.is_some_and(|t| t.eq_ignore_ascii_case(toolkit))
    }
}

pub const FAMILIES: &[Family] = &[
    // The browsers' engines merge motions that arrive faster than they handle them: with no wait a canvas stroke loses
    // the path's corners and an HTML5 drop can fail, in Chromium also a scrollbar thumb's drag falls short and a text
    // selection can end early. A wait after each sample matched the pinned build's effect in every run (Chromium needed
    // 500 µs for the thumb, Gecko 250 µs); a dwell after the press or before the release did not help. The other
    // families of M0.4's matrix matched the pinned build with no wait at all.
    Family {
        name: "Chromium",
        toolkit: Some("Chromium"),
        classes: &["Google-chrome", "Chromium", "Chromium-browser"],
        drag: DragPacing {
            step: Duration::from_micros(500),
            press: Duration::ZERO,
            release: Duration::ZERO,
        },
        evidence: "m1a/ run m1a4-drag",
    },
    Family {
        name: "Gecko",
        toolkit: Some("Gecko"),
        classes: &["firefox"],
        drag: DragPacing {
            step: Duration::from_micros(250),
            press: Duration::ZERO,
            release: Duration::ZERO,
        },
        evidence: "m1a/ run m1a4-drag",
    },
];

/// Whether any entry is keyed by toolkit, so a lookup that found no class needs the application's `ToolkitName`.
pub fn needs_toolkit() -> bool {
    FAMILIES.iter().any(|f| f.toolkit.is_some())
}

/// The family of a window: by its X11 class first (no accessibility-bus call), else by its toolkit.
pub fn family<'a>(table: &'a [Family], class: Option<&str>, toolkit: Option<&str>) -> Option<&'a Family> {
    class
        .and_then(|c| table.iter().find(|f| f.by_class(c)))
        .or_else(|| toolkit.and_then(|t| table.iter().find(|f| f.by_toolkit(t))))
}

#[cfg(test)]
mod tests {
    use super::*;

    const PACED: DragPacing = DragPacing {
        step: Duration::from_micros(500),
        press: Duration::ZERO,
        release: Duration::ZERO,
    };
    const TABLE: &[Family] = &[
        Family {
            name: "Chromium",
            toolkit: Some("Chromium"),
            classes: &["Google-chrome", "Chromium"],
            drag: PACED,
            evidence: "test",
        },
        Family {
            name: "xterm",
            toolkit: None,
            classes: &["XTerm"],
            drag: DragPacing::NONE,
            evidence: "test",
        },
    ];

    #[test]
    fn a_family_is_found_by_class_then_by_toolkit_without_regard_to_case() {
        assert_eq!(
            family(TABLE, Some("google-chrome"), None).map(|f| f.name),
            Some("Chromium")
        );
        assert_eq!(
            family(TABLE, Some("Electron"), Some("chromium")).map(|f| f.name),
            Some("Chromium")
        );
        assert_eq!(
            family(TABLE, Some("xterm"), Some("Chromium")).map(|f| f.name),
            Some("xterm"),
            "the class decides first"
        );
        assert!(family(TABLE, Some("Gedit"), Some("gtk")).is_none());
        assert!(family(TABLE, None, None).is_none());
    }

    #[test]
    fn every_entry_is_keyed_and_names_its_evidence() {
        for f in FAMILIES {
            assert!(f.toolkit.is_some() || !f.classes.is_empty(), "{} has no key", f.name);
            assert!(!f.evidence.is_empty(), "{} names no evidence", f.name);
        }
    }
}
