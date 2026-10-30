//! Per-family settings (Design, Device mode and the foreground route; Text and clipboard; Clicks, scroll, drag, move):
//! what an application family needs that the engine's defaults do not give it, keyed by its X11 class (`WM_CLASS`'s
//! class part) or its AT-SPI `Application.ToolkitName` (with the toolkit's major version where it matters), each entry
//! with the evidence runs that showed it. M1a.4 started it with the drag pacing; M2 adds each family's paste route
//! and how its Text reports characters beyond the BMP; the input kinds it ignores on the background route, with their
//! conditions, came with M2 (the paste chord, `type_characters`' keys) and M3 (coordinate and right clicks, and the
//! keys of `press_key`, `key_down` and `key_up`).
//!
//! An unlisted family takes everything on the background route: a drag sends the pinned build's events (one motion per
//! pixel of the path, behaviour §10.4) with no wait after a sample, after the press or before the release, and text
//! pastes with one Ctrl+V.

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

/// An input kind a family can ignore on the background route (Design, Device mode and the foreground route). Element
/// actions through AT-SPI take effect everywhere and are never a kind here.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// The paste chord of `type_text` and `clipboard_write`.
    Paste,
    /// Synthetic keys: `press_key`, `key_down`, `key_up` and `type_characters`.
    Keys,
    /// Synthetic button presses at a point: a coordinate `click` into a window (its chord included) and an element's
    /// right click, which presses button 3 at the element's visible point. An element's primary click is its action.
    Clicks,
}

/// When a listed kind is ignored.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum When {
    Always,
    /// Unless the window is fully unobscured (`cover.rs`; any doubt counts as obscured).
    UnlessUnobscured,
}

/// One kind a family ignores, and when.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Ignored {
    pub kind: Kind,
    pub when: When,
}

/// How a family takes pasted text (Design, Device mode: a family with no verified paste route refuses text).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PasteRoute {
    /// This chord, sent once, pastes CLIPBOARD (`keys.rs`' grammar).
    Chord(&'static str),
    /// No route has been verified: text is refused with nothing sent.
    Unverified,
}

/// What an unlisted family pastes with.
pub const DEFAULT_PASTE: PasteRoute = PasteRoute::Chord("ctrl+v");

/// One family's entry.
#[derive(Debug)]
pub struct Family {
    /// What the evidence calls it.
    pub name: &'static str,
    /// `Application.ToolkitName`, compared without regard to ASCII case.
    pub toolkit: Option<&'static str>,
    /// The toolkit's major version (the first number of `Application.Version`), where only that one is the family.
    pub toolkit_major: Option<u32>,
    /// X11 classes, compared without regard to ASCII case: the family where no toolkit can be read.
    pub classes: &'static [&'static str],
    pub drag: DragPacing,
    pub paste: PasteRoute,
    /// The input kinds the background route does not reach, and when.
    pub ignores: &'static [Ignored],
    /// Its `Text` follows each character beyond the BMP with a U+FEFF, one offset more (Gecko, M0.4's matrix).
    pub feff_after_astral: bool,
    /// The runs that showed it (`docs/evidence/2026-10-28-own-linux-engine/`).
    pub evidence: &'static str,
}

impl Family {
    fn by_class(&self, class: &str) -> bool {
        self.classes.iter().any(|c| c.eq_ignore_ascii_case(class))
    }

    fn by_toolkit(&self, toolkit: &Toolkit) -> bool {
        self.toolkit.is_some_and(|t| t.eq_ignore_ascii_case(&toolkit.name))
            && self.toolkit_major.is_none_or(|major| toolkit.major() == Some(major))
    }

    /// When the background route does not reach this kind, if ever.
    pub fn ignores(&self, kind: Kind) -> Option<When> {
        self.ignores.iter().find(|i| i.kind == kind).map(|i| i.when)
    }
}

/// An application's `Application.ToolkitName` and `Application.Version` (its toolkit's version).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Toolkit {
    pub name: String,
    pub version: Option<String>,
}

impl Toolkit {
    /// The version's first number: `4` of `4.14.2`.
    pub fn major(&self) -> Option<u32> {
        let version = self.version.as_deref()?.trim();
        let digits: String = version.chars().take_while(char::is_ascii_digit).collect();
        digits.parse().ok()
    }
}

pub const FAMILIES: &[Family] = &[
    // The browsers' engines merge motions that arrive faster than they handle them: with no wait a canvas stroke loses
    // the path's corners and an HTML5 drop can fail, in Chromium also a scrollbar thumb's drag falls short and a text
    // selection can end early, and a dwell after the press or before the release alone does not help. Chromium takes
    // every kind with 500 µs after each sample (less leaves canvas strokes and thumb drags short; a dwell before the
    // release adds nothing); Gecko takes canvas strokes with 300 µs and HTML5 drops only with 30 ms before the release
    // as well. The other families of M0.4's matrix matched the pinned build with no wait at all.
    Family {
        name: "Chromium",
        toolkit: Some("Chromium"),
        toolkit_major: None,
        classes: &["Google-chrome", "Chromium", "Chromium-browser"],
        drag: DragPacing {
            step: Duration::from_micros(500),
            press: Duration::ZERO,
            release: Duration::ZERO,
        },
        paste: DEFAULT_PASTE,
        ignores: &[],
        feff_after_astral: false,
        evidence: "m1a/ runs m1a4-drag, m1a4-drag-tune, m1a4-drag-scroller",
    },
    // Gecko's Text answers a U+FEFF after each character beyond the BMP (M0.4), which the paste's confirmation strips
    // there and only there, so a real U+FEFF still counts. Gecko ignores synthetic coordinate clicks while any of its
    // window is covered or off the screen, by a rule that is neither the click point nor the visible area (M0.4 at
    // 1280×781; M1a.3 at 800×600), and takes them while it is fully unobscured.
    Family {
        name: "Gecko",
        toolkit: Some("Gecko"),
        toolkit_major: None,
        classes: &["firefox"],
        drag: DragPacing {
            step: Duration::from_micros(300),
            press: Duration::ZERO,
            release: Duration::from_millis(30),
        },
        paste: DEFAULT_PASTE,
        ignores: &[Ignored {
            kind: Kind::Clicks,
            when: When::UnlessUnobscured,
        }],
        feff_after_astral: true,
        evidence: "m1a/ runs m1a4-drag, m1a4-drag-tune, m1a4-drag-scroller; m0/matrix/ README (Text), runs \
                   m04-matrix-covered, m04-matrix-visible, m04-partial-cover; m1a/ run m1a3-cover-800x600",
    },
    // GTK 4 reads input only as XInput 2 events: a synthetic key or click never arrives, covered or visible, in every
    // engine (M0.4), so its paste chord, its keys and its clicks take the foreground route in dedicated mode and are
    // refused in shared mode. Its element actions through AT-SPI take effect (M0.4's element-click run).
    Family {
        name: "GTK 4",
        toolkit: Some("GTK"),
        toolkit_major: Some(4),
        classes: &[],
        drag: DragPacing::NONE,
        paste: DEFAULT_PASTE,
        ignores: &[
            Ignored {
                kind: Kind::Paste,
                when: When::Always,
            },
            Ignored {
                kind: Kind::Keys,
                when: When::Always,
            },
            Ignored {
                kind: Kind::Clicks,
                when: When::Always,
            },
        ],
        feff_after_astral: false,
        evidence: "m0/matrix/ runs m04-matrix-covered, m04-matrix-visible",
    },
    // A VTE terminal pastes with Ctrl+Shift+V; Ctrl+V inserts the next key literally in a shell.
    Family {
        name: "VTE",
        toolkit: None,
        toolkit_major: None,
        classes: &["Gnome-terminal"],
        drag: DragPacing::NONE,
        paste: PasteRoute::Chord("ctrl+shift+v"),
        ignores: &[],
        feff_after_astral: false,
        evidence: "M2.2's terminal paste (task-14 report; m2/ from M2.3)",
    },
    // xterm pastes PRIMARY, not CLIPBOARD, by default, and ignores synthetic keys (`allowSendEvents` false, M0.4): no
    // paste route is verified, so text is refused.
    Family {
        name: "xterm",
        toolkit: None,
        toolkit_major: None,
        classes: &["XTerm"],
        drag: DragPacing::NONE,
        paste: PasteRoute::Unverified,
        ignores: &[Ignored {
            kind: Kind::Keys,
            when: When::Always,
        }],
        feff_after_astral: false,
        evidence: "m0/matrix/ runs m04-matrix-covered, m04-matrix-visible",
    },
];

/// Whether any entry is keyed by toolkit, so a lookup that found no class needs the application's `ToolkitName`.
pub fn needs_toolkit() -> bool {
    FAMILIES.iter().any(|f| f.toolkit.is_some())
}

/// The family of a window: by its X11 class first (no accessibility-bus call), else by its toolkit.
pub fn family<'a>(table: &'a [Family], class: Option<&str>, toolkit: Option<&Toolkit>) -> Option<&'a Family> {
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
            toolkit_major: None,
            classes: &["Google-chrome", "Chromium"],
            drag: PACED,
            paste: DEFAULT_PASTE,
            ignores: &[],
            feff_after_astral: false,
            evidence: "test",
        },
        Family {
            name: "xterm",
            toolkit: None,
            toolkit_major: None,
            classes: &["XTerm"],
            drag: DragPacing::NONE,
            paste: PasteRoute::Unverified,
            ignores: &[],
            feff_after_astral: false,
            evidence: "test",
        },
    ];

    fn toolkit(name: &str, version: Option<&str>) -> Toolkit {
        Toolkit {
            name: name.into(),
            version: version.map(Into::into),
        }
    }

    #[test]
    fn a_family_is_found_by_class_then_by_toolkit_without_regard_to_case() {
        assert_eq!(
            family(TABLE, Some("google-chrome"), None).map(|f| f.name),
            Some("Chromium")
        );
        assert_eq!(
            family(TABLE, Some("Electron"), Some(&toolkit("chromium", None))).map(|f| f.name),
            Some("Chromium")
        );
        assert_eq!(
            family(TABLE, Some("xterm"), Some(&toolkit("Chromium", None))).map(|f| f.name),
            Some("xterm"),
            "the class decides first"
        );
        assert!(family(TABLE, Some("Gedit"), Some(&toolkit("gtk", Some("3.24.41")))).is_none());
        assert!(family(TABLE, None, None).is_none());
    }

    #[test]
    fn gtk_4_is_its_toolkit_at_major_version_4_and_gtk_3_is_unlisted() {
        let gtk = |version| family(FAMILIES, Some("gnome-text-editor"), Some(&toolkit("GTK", version)));
        assert_eq!(gtk(Some("4.14.2")).map(|f| f.name), Some("GTK 4"));
        assert_eq!(gtk(Some(" 4")).map(|f| f.name), Some("GTK 4"));
        assert!(
            gtk(Some("3.24.41")).is_none(),
            "gedit's GTK 3 takes the background route"
        );
        assert!(gtk(Some("40.1")).is_none());
        assert!(gtk(None).is_none(), "no version: not known to be GTK 4");
        assert_eq!(
            gtk(Some("4.14.2")).and_then(|f| f.ignores(Kind::Paste)),
            Some(When::Always)
        );
        assert_eq!(
            gtk(Some("4.14.2")).and_then(|f| f.ignores(Kind::Keys)),
            Some(When::Always)
        );
    }

    #[test]
    fn each_family_pastes_by_its_own_route() {
        let paste = |class| family(FAMILIES, Some(class), None).map_or(DEFAULT_PASTE, |f| f.paste);
        assert_eq!(paste("Gedit"), PasteRoute::Chord("ctrl+v"), "unlisted: Ctrl+V");
        assert_eq!(paste("Google-chrome"), PasteRoute::Chord("ctrl+v"));
        assert_eq!(paste("Gnome-terminal"), PasteRoute::Chord("ctrl+shift+v"));
        assert_eq!(paste("XTerm"), PasteRoute::Unverified);
        let keys = |class| family(FAMILIES, Some(class), None).and_then(|f| f.ignores(Kind::Keys));
        assert_eq!(keys("XTerm"), Some(When::Always), "xterm ignores synthetic keys");
        assert_eq!(keys("Gnome-terminal"), None);
        assert_eq!(keys("Google-chrome"), None);
        assert!(family(FAMILIES, Some("firefox"), None).is_some_and(|f| f.feff_after_astral));
        assert!(
            FAMILIES
                .iter()
                .filter(|f| f.feff_after_astral)
                .all(|f| f.name == "Gecko"),
            "the U+FEFF rule is Gecko's alone"
        );
    }

    #[test]
    fn coordinate_clicks_are_ignored_by_gtk_4_always_and_by_gecko_unless_unobscured() {
        let clicks = |class, toolkit: Option<Toolkit>| {
            family(FAMILIES, Some(class), toolkit.as_ref()).and_then(|f| f.ignores(Kind::Clicks))
        };
        assert_eq!(
            clicks("gnome-text-editor", Some(toolkit("GTK", Some("4.14.2")))),
            Some(When::Always)
        );
        assert_eq!(clicks("firefox", None), Some(When::UnlessUnobscured));
        assert_eq!(clicks("XTerm", None), None, "xterm takes synthetic clicks");
        assert_eq!(clicks("Google-chrome", None), None);
        assert_eq!(clicks("Gedit", Some(toolkit("GTK", Some("3.24.41")))), None);
        let keys = |class| family(FAMILIES, Some(class), None).and_then(|f| f.ignores(Kind::Keys));
        assert_eq!(keys("firefox"), None, "Gecko takes synthetic keys, covered or not");
    }

    #[test]
    fn every_entry_is_keyed_and_names_its_evidence() {
        for f in FAMILIES {
            assert!(f.toolkit.is_some() || !f.classes.is_empty(), "{} has no key", f.name);
            assert!(!f.evidence.is_empty(), "{} names no evidence", f.name);
            if let PasteRoute::Chord(chord) = f.paste {
                assert!(crate::keys::parse_chord(chord).is_ok(), "{}: {chord}", f.name);
            }
        }
    }
}
