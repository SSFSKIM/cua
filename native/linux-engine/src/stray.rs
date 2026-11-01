//! The watch on a Chromium drag's press (task 20, evidence `m3/drop-misses/task20/`; the design session's rulings of
//! 2026-11-01). Blink resets its press state on any mouse move that carries no button (`event_handler.cc`, "Mouse states
//! need to be reset when mouse move with no button down", crbug 527582), and Chrome turns real pointer events into such
//! moves: a crossing of its window (its own capture grab's included, when the real pointer is outside the window at the
//! press) and the real pointer's XInput 2 motion. One that reaches the window after the press and before the drag has
//! started kills the drag: the later motions start nothing and the release becomes a click. A drag that never starts a
//! drag and drop (a text selection) is in that window until its release.
//!
//! The watch sees those events on a connection of its own, kept for the engine's life: XInput 2 raw motion on the root,
//! which the server sends to every client that selects it whoever holds a grab, and the core crossings of the target
//! window. The drag's own events are never among them: the background route's are synthetic (`SendEvent` reaches only
//! the window's client) and the XTEST routes' motions come from the XTEST pointer device, which the watch leaves out on
//! those routes. A crossing that ends a grab (mode `Ungrab`) is the target's release of its own capture, after the
//! drag's release.

use anyhow::{Context, Result};
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xinput::{self, ConnectionExt as _};
use x11rb::protocol::xproto::{ChangeWindowAttributesAux, ConnectionExt as _, EventMask, NotifyMode, Window};
use x11rb::rust_connection::RustConnection;

/// A pointer event the watch saw, as it bears on the drag.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Seen {
    /// XInput 2 raw motion from this slave device.
    RawMotion { source: u16 },
    /// A core crossing of this window.
    Crossing {
        window: Window,
        enter: bool,
        mode: NotifyMode,
    },
}

/// Whether an event the watch saw is one that did not come from the drag and can reach the target as a move with no
/// button: raw motion from any device but the drag's own (`own_source`, the XTEST pointer on the XTEST routes), and any
/// crossing of the target window but the end of a grab.
pub fn is_stray(seen: Seen, target: Window, own_source: Option<u16>) -> bool {
    match seen {
        Seen::RawMotion { source } => Some(source) != own_source,
        Seen::Crossing { window, mode, .. } => window == target && mode != NotifyMode::UNGRAB,
    }
}

/// The answer to a Chromium drag whose watch saw a stray event and whose target took no drag and drop by the release
/// (the design session's ruling, 2026-11-01): never success, since the page may have taken the press as a click.
pub fn may_not_have_started(app: &str) -> String {
    format!(
        "{app} may not have started the drag, and the page may have taken the press as a click: the desktop pointer \
         was outside the window, or entered or moved in it during the press. Read the window to see what happened \
         before dragging again"
    )
}

/// The answer to a Chromium drag whose watch failed before it could say what reached the window, and whose target took
/// no drag and drop: whether the drag started cannot be told.
pub fn watch_failed(app: &str, why: &str) -> String {
    format!(
        "the pointer watch on your drag into {app} failed ({why}), so whether the drag started cannot be told: the page \
         may have taken the press as a click. Read the window to see what happened before dragging again"
    )
}

/// The answer the watch gives a drag that otherwise succeeded: None, or the sentence when a stray event was seen and
/// no take came by the release. A take means the drag and drop started, after which a stray changes nothing.
pub fn answer(strays: usize, taken: bool, app: &str) -> Option<String> {
    (strays > 0 && !taken).then(|| may_not_have_started(app))
}

/// The stray events of one drag, for the `--stats` line: each kind's count and the first few in order.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Strays(pub Vec<Seen>);

impl Strays {
    pub fn count(&self) -> usize {
        self.0.len()
    }

    pub fn stats(&self) -> serde_json::Value {
        let name = |seen: &Seen| match seen {
            Seen::RawMotion { .. } => "raw_motion".to_string(),
            Seen::Crossing { enter, mode, .. } => {
                let mode = match *mode {
                    NotifyMode::NORMAL => "normal",
                    NotifyMode::GRAB => "grab",
                    NotifyMode::UNGRAB => "ungrab",
                    _ => "while_grabbed",
                };
                format!("{}_{mode}", if *enter { "enter" } else { "leave" })
            }
        };
        serde_json::json!({
            "count": self.count(),
            "first": self.0.iter().take(8).map(name).collect::<Vec<_>>(),
        })
    }
}

/// The watch's connection, kept for the engine's life once a Chromium drag opened it.
pub struct StrayWatch {
    conn: RustConnection,
    root: Window,
    /// The XTEST pointer device, whose motion is the drag's own on the XTEST routes.
    xtest_pointer: Option<u16>,
    /// One of its requests failed: the engine opens a new connection for the next drag.
    broken: bool,
}

/// The watch during one drag: what it selected, and on which route.
pub struct Watching {
    target: Window,
    own_source: Option<u16>,
}

impl StrayWatch {
    /// Connected, with XInput 2.2 (raw events reach every client that selects them, whoever holds a grab, from 2.1),
    /// and the XTEST pointer device found.
    pub fn connect() -> Result<StrayWatch> {
        let (conn, screen) = x11rb::connect(None).context("the drag's pointer watch could not connect")?;
        let root = conn.setup().roots[screen].root;
        let version = conn
            .xinput_xi_query_version(2, 2)
            .map_err(anyhow::Error::from)
            .and_then(|c| Ok(c.reply()?))
            .context("the drag's pointer watch needs the XInput 2 extension")?;
        anyhow::ensure!(
            (version.major_version, version.minor_version) >= (2, 1),
            "the drag's pointer watch needs XInput 2.1 or later; the server has {}.{}",
            version.major_version,
            version.minor_version
        );
        let devices = conn.xinput_xi_query_device(u16::from(xinput::Device::ALL))?.reply()?;
        let xtest_pointer = devices
            .infos
            .iter()
            .find(|d| d.type_ == xinput::DeviceType::SLAVE_POINTER && d.name.ends_with(b"XTEST pointer"))
            .map(|d| d.deviceid);
        Ok(StrayWatch {
            conn,
            root,
            xtest_pointer,
            broken: false,
        })
    }

    /// Whether every request so far went through, so the connection can serve the next drag.
    pub fn healthy(&self) -> bool {
        !self.broken
    }

    /// Starts watching for one drag into `target`, before its press: raw motion on the root and the target's
    /// crossings selected, then a round trip, and everything that arrived before it dropped, so what is seen from here
    /// on came after. `xtest_route`: the drag goes through XTEST, whose pointer's motion is its own.
    pub fn begin(&mut self, target: Window, xtest_route: bool) -> Result<Watching> {
        let begun = (|| -> Result<()> {
            self.select(target, true)?;
            self.conn.get_input_focus()?.reply()?;
            while self.conn.poll_for_event()?.is_some() {}
            Ok(())
        })();
        self.broken |= begun.is_err();
        begun.context("the drag's pointer watch could not start")?;
        Ok(Watching {
            target,
            own_source: if xtest_route { self.xtest_pointer } else { None },
        })
    }

    /// Ends one drag's watch, right after its release: a round trip, so every event the server sent before it has
    /// arrived, the strays among them, and the selections dropped (no round trip waits for that: anything that arrives
    /// later is dropped by the next drag's start).
    pub fn finish(&mut self, watching: Watching) -> Result<Strays> {
        let finished = self.read(&watching);
        self.broken |= finished.is_err();
        finished
    }

    fn read(&mut self, watching: &Watching) -> Result<Strays> {
        self.conn.get_input_focus()?.reply()?;
        let mut strays = Strays::default();
        while let Some(event) = self.conn.poll_for_event()? {
            let seen = match event {
                Event::XinputRawMotion(e) => Seen::RawMotion { source: e.sourceid },
                Event::EnterNotify(e) => Seen::Crossing {
                    window: e.event,
                    enter: true,
                    mode: e.mode,
                },
                Event::LeaveNotify(e) => Seen::Crossing {
                    window: e.event,
                    enter: false,
                    mode: e.mode,
                },
                _ => continue,
            };
            if is_stray(seen, watching.target, watching.own_source) {
                strays.0.push(seen);
            }
        }
        self.select(watching.target, false)?;
        self.conn.flush()?;
        Ok(strays)
    }

    fn select(&self, target: Window, on: bool) -> Result<()> {
        let mask = if on {
            vec![xinput::XIEventMask::RAW_MOTION]
        } else {
            vec![0u32.into()]
        };
        self.conn.xinput_xi_select_events(
            self.root,
            &[xinput::EventMask {
                deviceid: u16::from(xinput::Device::ALL_MASTER),
                mask,
            }],
        )?;
        let events = if on {
            EventMask::ENTER_WINDOW | EventMask::LEAVE_WINDOW
        } else {
            EventMask::NO_EVENT
        };
        // the target may be gone by the drag's end: its error is the drag's to report, not the watch's
        let changed = self
            .conn
            .change_window_attributes(target, &ChangeWindowAttributesAux::new().event_mask(events))?;
        if on {
            changed.check()?;
        } else {
            changed.ignore_error();
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TARGET: Window = 0x0640_0003;
    const XTEST: u16 = 4;

    fn crossing(window: Window, enter: bool, mode: NotifyMode) -> Seen {
        Seen::Crossing { window, enter, mode }
    }

    #[test]
    fn real_motion_is_a_stray_unless_it_is_the_xtest_route_s_own() {
        assert!(
            is_stray(Seen::RawMotion { source: 9 }, TARGET, None),
            "the background route: any motion"
        );
        assert!(
            is_stray(Seen::RawMotion { source: XTEST }, TARGET, None),
            "another client's XTEST nudge on the background route"
        );
        assert!(
            !is_stray(Seen::RawMotion { source: XTEST }, TARGET, Some(XTEST)),
            "the XTEST route's own motion"
        );
        assert!(
            is_stray(Seen::RawMotion { source: 9 }, TARGET, Some(XTEST)),
            "a mouse on the XTEST route"
        );
    }

    #[test]
    fn a_crossing_of_the_target_is_a_stray_but_the_end_of_a_grab() {
        assert!(
            is_stray(crossing(TARGET, true, NotifyMode::GRAB), TARGET, None),
            "Chrome's own grab, pointer outside"
        );
        assert!(
            is_stray(crossing(TARGET, true, NotifyMode::NORMAL), TARGET, None),
            "a popup gone from under the pointer"
        );
        assert!(
            is_stray(crossing(TARGET, false, NotifyMode::NORMAL), TARGET, None),
            "a popup mapped under the pointer"
        );
        assert!(
            !is_stray(crossing(TARGET, false, NotifyMode::UNGRAB), TARGET, None),
            "the target's release of its capture"
        );
        assert!(!is_stray(crossing(TARGET, true, NotifyMode::UNGRAB), TARGET, None));
        assert!(
            !is_stray(crossing(0x0820_0001, true, NotifyMode::NORMAL), TARGET, None),
            "another window"
        );
    }

    #[test]
    fn a_stray_without_a_take_is_never_success() {
        assert_eq!(
            answer(0, false, "Google-chrome"),
            None,
            "nothing stray: the drag stands"
        );
        assert_eq!(
            answer(3, true, "Google-chrome"),
            None,
            "the drag and drop started: strays after change nothing"
        );
        assert_eq!(answer(0, true, "Google-chrome"), None);
        assert_eq!(
            answer(1, false, "Google-chrome"),
            Some(may_not_have_started("Google-chrome"))
        );
    }

    #[test]
    fn the_answer_says_what_may_have_happened_why_and_to_look_before_dragging_again() {
        assert_eq!(
            may_not_have_started("Google-chrome"),
            "Google-chrome may not have started the drag, and the page may have taken the press as a click: the \
             desktop pointer was outside the window, or entered or moved in it during the press. Read the window to \
             see what happened before dragging again"
        );
    }

    #[test]
    fn the_stats_count_the_strays_and_name_the_first() {
        let strays = Strays(vec![
            crossing(TARGET, true, NotifyMode::GRAB),
            Seen::RawMotion { source: 9 },
            crossing(TARGET, false, NotifyMode::NORMAL),
        ]);
        assert_eq!(
            strays.stats(),
            serde_json::json!({"count": 3, "first": ["enter_grab", "raw_motion", "leave_normal"]})
        );
    }
}
