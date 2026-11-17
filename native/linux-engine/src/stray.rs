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
//! those routes. A crossing that ends a grab (mode `Ungrab`) after the drag's release is the target's release of its own
//! capture; one before the release is another client's grab ending, which crosses into the window with no button as
//! any crossing does, so the watch reads what arrived up to just before the release apart from what came after it.
//!
//! A `drag_handle` has its own watch ([`HoldWatch`], T17): its press and motions are XTEST on the real pointer, whose
//! button every event during the hold carries, so no stray resets it; what cuts a hold is another client's pointer grab,
//! read from the target's crossings in mode `Grab` or `Ungrab` before the release.

use anyhow::{Context, Result};
use x11rb::connection::Connection;
use x11rb::protocol::Event;
use x11rb::protocol::xinput::{self, ConnectionExt as _};
use x11rb::protocol::xproto::{
    ChangeWindowAttributesAux, ConnectionExt as _, EventMask, NotifyDetail, NotifyMode, Window,
};
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

/// When the watch read an event: by a round trip just before the drag's release, or after it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    /// Read up to just before the release: the server sent it before the release went out.
    Press,
    /// Read after the release.
    Released,
}

/// Whether an event the watch saw is one that did not come from the drag and can reach the target as a move with no
/// button: raw motion from any device but the drag's own (`own_source`, the XTEST pointer on the XTEST routes), and any
/// crossing of the target window but the end of a grab after the release (the target's release of its own capture).
pub fn is_stray(seen: Seen, target: Window, own_source: Option<u16>, phase: Phase) -> bool {
    match seen {
        Seen::RawMotion { source } => Some(source) != own_source,
        Seen::Crossing { window, mode, .. } => {
            window == target && !(mode == NotifyMode::UNGRAB && phase == Phase::Released)
        }
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
    /// `XdndSelection`, interned once the first Gecko request watched its owner changes (XFixes asked for then).
    xdnd_selection: Option<u32>,
    /// One of its requests failed: the engine opens a new connection for the next drag.
    broken: bool,
}

/// The watch during one drag: what it selected, on which route, and the strays read so far.
pub struct Watching {
    target: Window,
    own_source: Option<u16>,
    strays: Strays,
    /// A Gecko request's watch (`StrayWatch::begin_leaves`): only the target's crossings and its own client's takes of
    /// `XdndSelection` are kept, in the server's order, not every stray.
    crossed: Option<Vec<Crossed>>,
}

/// Whether a crossing the watch saw is the real pointer leaving `target` itself (T19, Gecko's drags): a `LeaveNotify`
/// of the target whose pointer went to no window inside it, in any mode, since a grab that takes the pointer from the
/// window takes it out as surely as a motion does ([`leaves`] excuses only the target's own drag and drop's grab). A
/// move into one of its own child windows is not a leave.
pub fn left_window(target: Window, event: Window, detail: NotifyDetail) -> bool {
    event == target && detail != NotifyDetail::INFERIOR
}

/// What a Gecko request's watch saw that bears on whether the real pointer left the target, in the server's order.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Crossed {
    /// The pointer left the target to no window inside it ([`left_window`]), in this mode.
    Left(NotifyMode),
    /// It entered the target, in this mode.
    Entered(NotifyMode),
    /// The target's own X client took `XdndSelection` (`dnd::taken_by_target`): its drag and drop began.
    OwnDragAndDrop,
}

/// The leaves a Gecko request's watch counts ([`leaves`]).
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Leaves {
    /// The real pointer leaving the target: the request answers that the application may not have taken it.
    pub left: usize,
    /// Grabs excused as the target's own drag and drop's.
    pub own_drag_grabs: usize,
}

/// The leaves among what a Gecko request's watch saw, in order (ffdnd-fix; the design session's ruling on T19,
/// 2026-11-12). Every leave counts, in any mode, but one: a leave in mode `Grab` during whose grab (up to the next
/// crossing of the target in mode `Ungrab`, or the next leave) the target's own client took `XdndSelection`. That grab
/// is its own drag and drop's: GTK's drag source grabs the pointer as Gecko's HTML5 drag and drop begins and takes the
/// selection once it holds the grab, and the pointer crosses out of the window without moving. Another client's grab, a
/// grab with no take while it held, or a take before the grab, is a leave.
pub fn leaves(crossed: &[Crossed]) -> Leaves {
    let mut out = Leaves::default();
    for (i, seen) in crossed.iter().enumerate() {
        let Crossed::Left(mode) = *seen else {
            continue;
        };
        let own = mode == NotifyMode::GRAB
            && crossed[i + 1..]
                .iter()
                .take_while(|c| !matches!(c, Crossed::Entered(NotifyMode::UNGRAB) | Crossed::Left(_)))
                .any(|c| *c == Crossed::OwnDragAndDrop);
        if own {
            out.own_drag_grabs += 1;
        } else {
            out.left += 1;
        }
    }
    out
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
            xdnd_selection: None,
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
            strays: Strays::default(),
            crossed: None,
        })
    }

    /// Starts watching a background request into `target` for the real pointer leaving it (T19): the owner changes of
    /// `XdndSelection` selected, then [`StrayWatch::begin`]'s selections and round trip, so a take before the request is
    /// dropped with everything else; of what follows, only the target's crossings (its leaves by `left_window`) and its
    /// own client's takes of the selection are kept ([`leaves`]).
    pub fn begin_leaves(&mut self, target: Window) -> Result<Watching> {
        let selected = self.select_owners(true);
        self.broken |= selected.is_err();
        selected.context("the drag's pointer watch could not start")?;
        let mut watching = self.begin(target, false)?;
        watching.crossed = Some(Vec::new());
        Ok(watching)
    }

    /// Ends a Gecko request's watch as [`StrayWatch::finish`] ends a drag's (a round trip, then its selections dropped,
    /// the selection's owner changes with them), answering the leaves it counts.
    pub fn finish_leaves(&mut self, mut watching: Watching) -> Result<Leaves> {
        let finished = self.read(&mut watching, Phase::Released).and_then(|()| {
            self.select(watching.target, false)?;
            self.select_owners(false)?;
            self.conn.flush()?;
            Ok(())
        });
        self.broken |= finished.is_err();
        finished.map(|()| leaves(watching.crossed.as_deref().unwrap_or_default()))
    }

    /// The owner changes of `XdndSelection` selected on the root, or no longer; XFixes and the atom asked for the first
    /// time.
    fn select_owners(&mut self, on: bool) -> Result<()> {
        use x11rb::protocol::xfixes::{ConnectionExt as _, SelectionEventMask};
        let selection = match self.xdnd_selection {
            Some(selection) => selection,
            None => {
                self.conn
                    .xfixes_query_version(4, 0)?
                    .reply()
                    .context("the drag's pointer watch needs the XFixes extension")?;
                let selection = self.conn.intern_atom(false, b"XdndSelection")?.reply()?.atom;
                *self.xdnd_selection.insert(selection)
            }
        };
        let owners = if on {
            SelectionEventMask::SET_SELECTION_OWNER
        } else {
            SelectionEventMask::default()
        };
        let selected = self.conn.xfixes_select_selection_input(self.root, selection, owners)?;
        if on {
            selected.check()?;
        }
        Ok(())
    }

    /// Reads what reached the watch up to now, just before the drag's release: a round trip, so every event the server
    /// sent before it has arrived. A grab's end among them is another client's, not the target's cleanup.
    pub fn before_release(&mut self, watching: &mut Watching) -> Result<()> {
        let read = self.read(watching, Phase::Press);
        self.broken |= read.is_err();
        read
    }

    /// Ends one drag's watch, right after its release: a round trip, so every event the server sent before it has
    /// arrived, the strays among them, and the selections dropped (no round trip waits for that: anything that arrives
    /// later is dropped by the next drag's start).
    pub fn finish(&mut self, mut watching: Watching) -> Result<Strays> {
        let finished = self.read(&mut watching, Phase::Released).and_then(|()| {
            self.select(watching.target, false)?;
            self.conn.flush()?;
            Ok(())
        });
        self.broken |= finished.is_err();
        finished.map(|()| watching.strays)
    }

    fn read(&mut self, watching: &mut Watching, phase: Phase) -> Result<()> {
        self.conn.get_input_focus()?.reply()?;
        let mask = self.conn.setup().resource_id_mask;
        while let Some(event) = self.conn.poll_for_event()? {
            if let Some(crossed) = watching.crossed.as_mut() {
                let target = watching.target;
                match event {
                    Event::LeaveNotify(e) if left_window(target, e.event, e.detail) => {
                        crossed.push(Crossed::Left(e.mode));
                    }
                    Event::EnterNotify(e) if e.event == target => crossed.push(Crossed::Entered(e.mode)),
                    Event::XfixesSelectionNotify(e)
                        if Some(e.selection) == self.xdnd_selection
                            && crate::dnd::taken_by_target(e.owner, target, mask) =>
                    {
                        crossed.push(Crossed::OwnDragAndDrop);
                    }
                    _ => {}
                }
                continue;
            }
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
            if is_stray(seen, watching.target, watching.own_source, phase) {
                watching.strays.0.push(seen);
            }
        }
        Ok(())
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

/// Whether a crossing of `event_window` in `mode` cuts a `drag_handle`'s hold on `target` (T17; the design session's
/// ruling, 2026-11-10): a crossing of the target that a grab begins or ends. A handle's press and motions go through
/// XTEST on the real pointer, so every crossing and motion that reaches the page during the hold carries the button and
/// none resets the press (evidence `m4/drag-handle/`); what takes the hold is another client's pointer grab, whose
/// start crosses the pointer out of the target (`Grab`) and whose end crosses it back (`Ungrab`).
pub fn cuts_hold(target: Window, event_window: Window, mode: NotifyMode) -> bool {
    event_window == target && (mode == NotifyMode::GRAB || mode == NotifyMode::UNGRAB)
}

/// The answer to a `drag_handle`'s end whose hold another client's grab cut before the release, with no drag and drop
/// begun (T17): never success, since the button the page saw may have been the other client's.
pub fn hold_cut(app: &str) -> String {
    format!(
        "{app} may not have received your drag: another application took the pointer while the handle was held. Read \
         the window to see what happened before dragging again"
    )
}

/// The answer to a `drag_handle`'s end whose hold watch failed before it could say whether the hold was cut.
pub fn hold_watch_failed(app: &str, why: &str) -> String {
    format!(
        "the pointer watch on your drag handle into {app} failed ({why}), so whether {app} received the drag cannot be \
         told. Read the window to see what happened before dragging again"
    )
}

/// What a `drag_handle`'s hold watch saw from the press to just before the release.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Held {
    /// A grab crossed the target ([`cuts_hold`]).
    pub cut: bool,
    /// The target's client took `XdndSelection`: a drag and drop began, which takes the pointer itself, so a grab's
    /// crossing then is the drag and drop's own.
    pub taken: bool,
    /// The server's time of that take, the first seen: Electron's drop confirmation tells the drag loop's cursor by it
    /// (`drop_cursor.rs`).
    pub take_time: Option<u32>,
}

impl Held {
    /// The end's answer: None, or the sentence when the hold was cut and no drag and drop began.
    pub fn answer(self, app: &str) -> Option<String> {
        (self.cut && !self.taken).then(|| hold_cut(app))
    }
}

/// The watch on a `drag_handle`'s hold (T17): a connection of its own, kept for the engine's life once a handle opened
/// it, on which a handle selects its target's crossings and the root's `XdndSelection` owner changes from just before
/// its press, and reads them once, with a round trip, just before its release. Nothing reads it between, so the agent's
/// moves pay nothing for it, and only those events are selected, so nothing piles up across the agent's round trips.
pub struct HoldWatch {
    conn: RustConnection,
    root: Window,
    selection: u32,
    /// One of its requests failed: the engine opens a new connection for the next handle.
    broken: bool,
}

/// The watch during one handle: its target and what was seen so far.
pub struct Holding {
    target: Window,
    held: Held,
}

impl HoldWatch {
    /// Connected, with XFixes (the selection's owner changes) and `XdndSelection` interned.
    pub fn connect() -> Result<HoldWatch> {
        use x11rb::protocol::xfixes::ConnectionExt as _;
        let (conn, screen) = x11rb::connect(None).context("the drag handle's pointer watch could not connect")?;
        let root = conn.setup().roots[screen].root;
        conn.xfixes_query_version(4, 0)?
            .reply()
            .context("the drag handle's pointer watch needs the XFixes extension")?;
        let selection = conn.intern_atom(false, b"XdndSelection")?.reply()?.atom;
        Ok(HoldWatch {
            conn,
            root,
            selection,
            broken: false,
        })
    }

    /// Whether every request so far went through, so the connection can serve the next handle.
    pub fn healthy(&self) -> bool {
        !self.broken
    }

    /// Starts watching one handle on `target`, before its press: the target's crossings and the selection's owner
    /// changes selected, then a round trip, and everything that arrived before it dropped.
    pub fn begin(&mut self, target: Window) -> Result<Holding> {
        let begun = (|| -> Result<()> {
            self.select(target, true)?;
            self.conn.get_input_focus()?.reply()?;
            while self.conn.poll_for_event()?.is_some() {}
            Ok(())
        })();
        self.broken |= begun.is_err();
        begun.context("the drag handle's pointer watch could not start")?;
        Ok(Holding {
            target,
            held: Held::default(),
        })
    }

    /// What reached the watch up to now, just before the handle's release: a round trip, so every event the server sent
    /// before it has arrived. A grab's crossing after the release is the target's release of its own capture, which is
    /// why the read comes first.
    pub fn before_release(&mut self, holding: &mut Holding) -> Result<Held> {
        let read = (|| -> Result<()> {
            self.conn.get_input_focus()?.reply()?;
            let mask = self.conn.setup().resource_id_mask;
            while let Some(event) = self.conn.poll_for_event()? {
                match event {
                    Event::EnterNotify(e) => holding.held.cut |= cuts_hold(holding.target, e.event, e.mode),
                    Event::LeaveNotify(e) => holding.held.cut |= cuts_hold(holding.target, e.event, e.mode),
                    Event::XfixesSelectionNotify(e)
                        if e.selection == self.selection
                            && crate::dnd::taken_by_target(e.owner, holding.target, mask) =>
                    {
                        holding.held.taken = true;
                        holding.held.take_time.get_or_insert(e.timestamp);
                    }
                    _ => {}
                }
            }
            Ok(())
        })();
        self.broken |= read.is_err();
        read.map(|()| holding.held)
    }

    /// Ends one handle's watch: its selections dropped (no round trip waits for that; anything that arrives later is
    /// dropped by the next handle's start).
    pub fn finish(&mut self, holding: Holding) {
        let finished = self.select(holding.target, false).and_then(|()| Ok(self.conn.flush()?));
        self.broken |= finished.is_err();
    }

    fn select(&self, target: Window, on: bool) -> Result<()> {
        use x11rb::protocol::xfixes::{ConnectionExt as _, SelectionEventMask};
        let (events, owners) = if on {
            (
                EventMask::ENTER_WINDOW | EventMask::LEAVE_WINDOW,
                SelectionEventMask::SET_SELECTION_OWNER,
            )
        } else {
            (EventMask::NO_EVENT, SelectionEventMask::default())
        };
        self.conn
            .xfixes_select_selection_input(self.root, self.selection, owners)?;
        // the target may be gone by the handle's end: its error is the handle's to report, not the watch's
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

    #[test]
    fn the_pointer_leaves_a_gecko_window_only_to_no_window_inside_it() {
        for detail in [
            NotifyDetail::ANCESTOR,
            NotifyDetail::VIRTUAL,
            NotifyDetail::NONLINEAR,
            NotifyDetail::NONLINEAR_VIRTUAL,
        ] {
            assert!(left_window(TARGET, TARGET, detail), "{detail:?}");
        }
        assert!(
            !left_window(TARGET, TARGET, NotifyDetail::INFERIOR),
            "into one of its own children: still inside"
        );
        assert!(
            !left_window(TARGET, TARGET + 1, NotifyDetail::NONLINEAR),
            "another window's leave"
        );
    }

    #[test]
    fn a_grab_is_a_leave_unless_the_target_s_own_drag_and_drop_began_while_it_held() {
        use Crossed::{Entered, Left, OwnDragAndDrop};
        let (grab, ungrab, normal) = (NotifyMode::GRAB, NotifyMode::UNGRAB, NotifyMode::NORMAL);
        let counted = |left, own_drag_grabs| Leaves { left, own_drag_grabs };
        // Firefox's dnd cell, as traced (ffdnd-fix): its drag source's grab, its take, its ungrab after or past the end
        assert_eq!(leaves(&[Left(grab), OwnDragAndDrop, Entered(ungrab)]), counted(0, 1));
        assert_eq!(
            leaves(&[Left(grab), OwnDragAndDrop]),
            counted(0, 1),
            "the ungrab after the watch's end"
        );
        assert_eq!(leaves(&[]), counted(0, 0));
        assert_eq!(leaves(&[Left(grab)]), counted(1, 0), "another client's grab: no take");
        assert_eq!(
            leaves(&[Left(grab), Entered(ungrab), Left(grab), OwnDragAndDrop]),
            counted(1, 1),
            "another client's grab, ended, then the target's own"
        );
        assert_eq!(
            leaves(&[Left(grab), OwnDragAndDrop, Entered(ungrab), Left(grab)]),
            counted(1, 1),
            "the target's own, ended, then another client's"
        );
        assert_eq!(
            leaves(&[OwnDragAndDrop, Left(grab)]),
            counted(1, 0),
            "a take before the grab is not the grab's"
        );
        assert_eq!(leaves(&[Left(normal), OwnDragAndDrop]), counted(1, 0), "a real leave");
        assert_eq!(
            leaves(&[Left(grab), Left(normal), OwnDragAndDrop]),
            counted(2, 0),
            "the take came after another leave"
        );
        for mode in [NotifyMode::NORMAL, NotifyMode::WHILE_GRABBED, NotifyMode::UNGRAB] {
            assert_eq!(leaves(&[Left(mode), OwnDragAndDrop]), counted(1, 0), "{mode:?}");
        }
        assert_eq!(
            leaves(&[Entered(normal), Left(grab), Entered(normal), OwnDragAndDrop]),
            counted(0, 1),
            "an enter in another mode does not end the grab"
        );
    }

    fn crossing(window: Window, enter: bool, mode: NotifyMode) -> Seen {
        Seen::Crossing { window, enter, mode }
    }

    #[test]
    fn real_motion_is_a_stray_unless_it_is_the_xtest_route_s_own() {
        for phase in [Phase::Press, Phase::Released] {
            assert!(
                is_stray(Seen::RawMotion { source: 9 }, TARGET, None, phase),
                "the background route: any motion"
            );
            assert!(
                is_stray(Seen::RawMotion { source: XTEST }, TARGET, None, phase),
                "another client's XTEST nudge on the background route"
            );
            assert!(
                !is_stray(Seen::RawMotion { source: XTEST }, TARGET, Some(XTEST), phase),
                "the XTEST route's own motion"
            );
            assert!(
                is_stray(Seen::RawMotion { source: 9 }, TARGET, Some(XTEST), phase),
                "a mouse on the XTEST route"
            );
        }
    }

    #[test]
    fn a_crossing_of_the_target_is_a_stray_but_a_grab_s_end_after_the_release() {
        for phase in [Phase::Press, Phase::Released] {
            assert!(
                is_stray(crossing(TARGET, true, NotifyMode::GRAB), TARGET, None, phase),
                "Chrome's own grab, pointer outside"
            );
            assert!(
                is_stray(crossing(TARGET, true, NotifyMode::NORMAL), TARGET, None, phase),
                "a popup gone from under the pointer"
            );
            assert!(
                is_stray(crossing(TARGET, false, NotifyMode::NORMAL), TARGET, None, phase),
                "a popup mapped under the pointer"
            );
            assert!(
                !is_stray(crossing(0x0820_0001, true, NotifyMode::NORMAL), TARGET, None, phase),
                "another window"
            );
        }
        // a grab that ends before the release is not the target's cleanup: another client's grab, held when the drag
        // began, released during it, crosses into the window with no button (task 20 review)
        assert!(is_stray(
            crossing(TARGET, true, NotifyMode::UNGRAB),
            TARGET,
            None,
            Phase::Press
        ));
        assert!(is_stray(
            crossing(TARGET, false, NotifyMode::UNGRAB),
            TARGET,
            None,
            Phase::Press
        ));
        // after the release, the target's release of its own capture
        assert!(
            !is_stray(
                crossing(TARGET, false, NotifyMode::UNGRAB),
                TARGET,
                None,
                Phase::Released
            ),
            "the target's release of its capture"
        );
        assert!(!is_stray(
            crossing(TARGET, true, NotifyMode::UNGRAB),
            TARGET,
            None,
            Phase::Released
        ));
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
    fn only_a_grab_s_crossing_of_the_target_cuts_a_handle_s_hold() {
        assert!(
            cuts_hold(TARGET, TARGET, NotifyMode::GRAB),
            "another client's grab begins"
        );
        assert!(
            cuts_hold(TARGET, TARGET, NotifyMode::UNGRAB),
            "another client's grab ends"
        );
        assert!(
            !cuts_hold(TARGET, TARGET, NotifyMode::NORMAL),
            "the held pointer moving out of the window, or a popup under it: the button still held"
        );
        assert!(
            !cuts_hold(TARGET, TARGET, NotifyMode::WHILE_GRABBED),
            "a crossing under the target's own capture"
        );
        assert!(!cuts_hold(TARGET, TARGET + 1, NotifyMode::GRAB), "another window's");
    }

    #[test]
    fn a_cut_hold_answers_unless_a_drag_and_drop_began() {
        let app = "Google-chrome";
        assert_eq!(Held::default().answer(app), None, "nothing seen");
        assert_eq!(
            Held {
                cut: true,
                ..Held::default()
            }
            .answer(app),
            Some(hold_cut(app))
        );
        assert_eq!(
            Held {
                cut: true,
                taken: true,
                take_time: Some(7)
            }
            .answer(app),
            None,
            "the drag and drop's own grab"
        );
        assert_eq!(
            hold_cut(app),
            "Google-chrome may not have received your drag: another application took the pointer while the handle \
             was held. Read the window to see what happened before dragging again"
        );
        assert!(hold_watch_failed(app, "lost").contains("whether Google-chrome received the drag cannot be told"));
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
