//! The focus a toolkit must have taken before a background press reaches it (M4, task 61; the design session's ruling,
//! 2026-11-05: in shared mode cua never changes the person's desktop, and the active window is part of it).
//!
//! Qt's xcb backend asks the window manager to activate a window when it handles a button press while its own focus
//! window is not that window (`QXcbWindow::handleButtonPressEvent`, Qt 5.15 and 6.4 alike: `requestActivate`, a
//! `_NET_ACTIVE_WINDOW` client message with source 1, which Openbox grants; with no window manager, `SetInputFocus`).
//! It makes the window its focus window only when it delivers the window-system event the window's `FocusIn` queued
//! (`doFocusIn`, `handleWindowActivated`), after the whole batch of X events it read that `FocusIn` in. A synthetic
//! `FocusIn` and the press that follows it a few milliseconds later arrive in one batch whenever Qt's main thread is
//! late, which twice the gate's load makes likely: the press then finds no focus window, and the window is activated
//! (task 60's fix: the front window lost its active state in 27 of 30 kate and 28 of 30 qtcreator click runs; this
//! task's X trace of kate's own connection, evidence `m4/qt-activation/`, shows the press read in the same batch as
//! the `FocusIn`, then the request naming no focus window).
//!
//! So before the first press of a background session that synthesized the focus, in shared mode, a press to a family
//! whose press activates such a window (`families.rs` `activates_on_press`) waits until the window's AT-SPI frame reports
//! `active`. That is Qt's own state, not a time: Qt reports the frame active from its active window, which it sets in
//! the same delivery that makes the window its focus window, so once the frame reads active the press finds the window
//! focused. A press with no such report within the bound is refused with nothing sent.
//!
//! One state of Qt's reads `active` with no `FocusIn` of the session's: after a `FocusOut`, Qt keeps the window its
//! focus window for 100 ms (its `focusInTimer`) in case a `FocusIn` follows, and a late timer can still fire before Qt
//! reads the next session's `FocusIn`, leaving no focus window when the press is handled. So a press to a window whose
//! frame already reads active before its session opens (an earlier session's `FocusOut` counting down) first waits,
//! before the session's `FocusIn`, until the frame reads inactive: then the `active` that follows is the session's own.
//!
//! Two more things decide whether a press is safe (the review of task 61 and the design session's rulings, 2026-11-05):
//!
//! - **Its recipient.** The press goes to the deepest X window under the point (`input.rs`), and Qt compares that
//!   window's own `QWindow` with its focus window, which is the top-level's. A native child window (a widget with
//!   `WA_NativeWindow`, or one Qt made native for it) is therefore never Qt's focus window, so Qt asks to focus it on
//!   every press (`requestActivate` on a child sets the X input focus to it), however long the top-level's focus was
//!   waited for. The frame's `active` cannot show a child's state, so a press whose recipient is not the target
//!   window itself is refused. Across the Qt applications on the #171 VM no press lands on one (task 61 fix's
//!   measurement: 0 of 10,800 grid points over 9 windows of 8 applications).
//! - **The real focus now, not when the session opened.** A session kept open by a hold is reused, and one opened
//!   while the real focus was within the window synthesized no `FocusIn`; the person may have moved the focus away
//!   since. So the focus is read before every press: if it has left a session that holds no synthetic focus, the
//!   session takes one now, as a fresh session would (the earlier focus let go first, then the `FocusIn`, then its
//!   `active` waited for), and its end sends the `FocusOut`.

use std::time::{Duration, Instant};

use anyhow::Result;
use serde_json::{Value, json};

use crate::atspi;
use crate::dbus::Bus;
use crate::input::focus_is_within;
use crate::route::Route;
use crate::tree::ObjRef;
use crate::x11::X11;

/// How long a background press waits for the toolkit to report the session's focus taken (`--focus-ack-ms`, for
/// measurement): the smallest of 25, 50, 100 and 200 ms that held 30 consecutive independent click runs on kate (Qt
/// 5.15) and qtcreator (Qt 6.4) at twice the gate's load, by the wait rule (evidence `m4/qt-activation/`). Every step
/// held, none refused and none activated; the wait itself took a median of 4 to 8 ms and at most 23.6 ms. With no wait
/// the same clicks activated the window 9 and 5 times in 30. A wait that reaches its bound refuses the press with
/// nothing sent, never sends it.
pub const FOCUS_ACK: Duration = Duration::from_millis(25);

/// How long Qt keeps a window its focus window after a `FocusOut` (`QXcbConnection`'s `focusInDelay`, 100 ms in Qt
/// 5.15 and 6.4): the earlier focus a press waits to see let go, beside the bound.
pub const TOOLKIT_LINGER: Duration = Duration::from_millis(100);

/// Between two reads of the frame's state.
pub const POLL: Duration = Duration::from_millis(2);

/// Reads `active()` until it answers `want`, every `poll`, for at most `bound` after the first read: the time it took,
/// zero when the first read answers it, or None when the bound passed first. A read that fails is the error.
pub fn until_state(
    want: bool,
    bound: Duration,
    poll: Duration,
    mut active: impl FnMut() -> Result<bool>,
) -> Result<Option<Duration>> {
    let started = Instant::now();
    loop {
        if active()? == want {
            return Ok(Some(started.elapsed()));
        }
        if started.elapsed() >= bound {
            return Ok(None);
        }
        std::thread::sleep(poll);
    }
}

/// The refusal when the toolkit did not report the session's focus taken within the bound.
pub fn not_taken(app: &str, bound: Duration) -> String {
    format!(
        "{app} did not take the background focus within {} ms, so a press could have activated its window",
        bound.as_millis()
    )
}

/// The refusal when the toolkit still held an earlier background focus at the bound.
pub fn not_released(app: &str, bound: Duration) -> String {
    format!(
        "{app} still held an earlier background focus after {} ms, so a press could have activated its window",
        bound.as_millis()
    )
}

/// The refusal when the press would go to a native child window of the target rather than to the target itself.
pub fn native_child(app: &str) -> String {
    format!(
        "{app} gives a native child window of its own the input focus on a press at that point, so a background press \
         there would move the desktop's focus (use an element action, or a dedicated desktop)"
    )
}

/// The refusal for a Qt window with no accessibility tree to wait on (found by its `_XEMBED_INFO` mark or its
/// process's map, `families::qt_mark`).
pub fn no_frame(app: &str) -> String {
    format!(
        "{app} is a Qt application with no accessibility tree on the bus, so cua cannot see it take the background \
         focus, and a press could activate its window (turn its accessibility on and restart it, or use a dedicated \
         desktop)"
    )
}

/// What a coordinate press's refusal ends with: nothing of the request's input went out.
pub fn nothing_pressed(cause: String) -> String {
    format!("{cause}; nothing was sent, so it is safe to retry")
}

/// What a refusal of one press of a multi-click ends with once `sent` of its `count` clicks have gone to the window:
/// they may have changed it, so a retry is not safe blind (the bounded re-review's P1; as a paste refused after its
/// focusing click says, `paste::AFTER_CLICK`).
pub fn after_clicks(cause: String, sent: u32, count: u32) -> String {
    format!(
        "{cause}; the request's next click was not sent, but {sent} of its {count} clicks already reached the window, \
         so read the window before retrying"
    )
}

/// A coordinate press's refusal, worded by how many of the request's `count` clicks were already `sent`.
pub fn refused_press(cause: String, sent: u32, count: u32) -> String {
    if sent == 0 {
        nothing_pressed(cause)
    } else {
        after_clicks(cause, sent, count)
    }
}

/// What a press needs once its recipient is the target window itself (`FocusAck::before_press`), from the real focus
/// read just before it and whether the session synthesized a focus of its own.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Need {
    /// The real focus is within the window: Qt's focus window is the window's own, nothing to wait for.
    Nothing,
    /// The session's synthetic focus: its `active` reported, once per request.
    Taken,
    /// The session holds no synthetic focus (it opened with the real focus within) and the real focus has left: an
    /// earlier focus let go, a `FocusIn` taken now, then its `active` reported.
    Refocus,
}

/// [`Need`] from the real focus now and the session's synthetic focus.
pub fn need(within_now: bool, synthesized: bool) -> Need {
    match (within_now, synthesized) {
        (true, _) => Need::Nothing,
        (false, true) => Need::Taken,
        (false, false) => Need::Refocus,
    }
}

/// One request's wait for a window's focus (`Engine::focus_ack_for`): its frame, the bound, and what it waited.
#[derive(Debug)]
pub struct FocusAck {
    frame: ObjRef,
    app: String,
    bound: Duration,
    /// Before the session opened: how long the toolkit took to let an earlier focus go, None when not looked at (a
    /// session already open, or the real focus within the window).
    released: Option<Duration>,
    /// After the session's `FocusIn`: how long the toolkit took to report it, None until looked at.
    taken: Option<Duration>,
    /// The session's synthetic focus reported taken in this request: not waited for again.
    settled: bool,
    /// A press found the real focus gone from a session that held no synthetic focus, and took one (`Need::Refocus`).
    refocused: bool,
    /// A press was refused because it would have gone to a native child window.
    native_child: bool,
}

impl FocusAck {
    pub fn new(frame: ObjRef, app: String, bound: Duration) -> FocusAck {
        FocusAck {
            frame,
            app,
            bound,
            released: None,
            taken: None,
            settled: false,
            refocused: false,
            native_child: false,
        }
    }

    /// Before the request's session opens: an earlier focus the toolkit still holds let go, at most the toolkit's linger
    /// and the bound. The inner error is the refusal's cause when it is still held then; the outer, a failed read.
    pub fn released(&mut self, bus: &mut Bus) -> Result<std::result::Result<(), String>> {
        let frame = &self.frame;
        let bound = TOOLKIT_LINGER + self.bound;
        Ok(
            match until_state(false, bound, POLL, || atspi::frame_active(bus, frame))? {
                Some(waited) => {
                    self.released = Some(waited);
                    Ok(())
                }
                None => Err(not_released(&self.app, bound)),
            },
        )
    }

    /// Just before a press at root point `at`, on the request's route: the press's recipient the target window itself,
    /// then the focus it needs (`need`), read now. The inner error is the refusal's cause, for the caller to word; the
    /// outer, a failed read or send. Nothing to check on a route that is not a background session.
    pub fn before_press(
        &mut self,
        bus: &mut Bus,
        x: &X11,
        route: &mut Route,
        at: (i16, i16),
    ) -> Result<std::result::Result<(), String>> {
        let Some(session) = route.session_mut() else {
            return Ok(Ok(()));
        };
        if session.recipient(x, at.0, at.1)? != session.target {
            self.native_child = true;
            return Ok(Err(native_child(&self.app)));
        }
        match need(focus_is_within(x, session.target)?, !session.focus_was_within()) {
            Need::Nothing => Ok(Ok(())),
            Need::Refocus => {
                if let Err(cause) = self.released(bus)? {
                    return Ok(Err(cause));
                }
                self.refocused = session.refocus(x)?;
                self.settled = false;
                self.taken(bus)
            }
            Need::Taken => self.taken(bus),
        }
    }

    /// The session's synthetic focus reported taken, at most the bound, once per request.
    fn taken(&mut self, bus: &mut Bus) -> Result<std::result::Result<(), String>> {
        if self.settled {
            return Ok(Ok(()));
        }
        let frame = &self.frame;
        Ok(
            match until_state(true, self.bound, POLL, || atspi::frame_active(bus, frame))? {
                Some(waited) => {
                    self.taken = Some(waited);
                    self.settled = true;
                    Ok(())
                }
                None => Err(not_taken(&self.app, self.bound)),
            },
        )
    }

    /// The record on the `--stats` line: the bound and each wait, in ms (null where none was looked at), and whether
    /// the press took a fresh synthetic focus or was refused for a native child.
    pub fn record(&self) -> Value {
        let ms = |d: Option<Duration>| d.map(|d| (d.as_secs_f64() * 1000.0 * 1000.0).round() / 1000.0);
        json!({
            "bound_ms": self.bound.as_millis() as u64,
            "released_ms": ms(self.released),
            "waited_ms": ms(self.taken),
            "refocused": self.refocused,
            "native_child": self.native_child,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn the_wait_ends_at_the_first_read_that_answers_the_state_wanted() {
        let reads = Cell::new(0);
        let waited = until_state(true, Duration::from_secs(1), Duration::from_millis(1), || {
            reads.set(reads.get() + 1);
            Ok(reads.get() >= 3)
        })
        .unwrap();
        assert_eq!(reads.get(), 3);
        assert!(waited.is_some_and(|w| w < Duration::from_secs(1)));
        let at_once = until_state(false, Duration::ZERO, Duration::from_millis(1), || Ok(false)).unwrap();
        assert!(
            at_once.is_some(),
            "a state already as wanted waits nothing, even with no bound"
        );
    }

    #[test]
    fn a_state_that_never_comes_ends_the_wait_at_the_bound_with_none() {
        let started = Instant::now();
        let reads = Cell::new(0);
        let waited = until_state(true, Duration::from_millis(30), Duration::from_millis(2), || {
            reads.set(reads.get() + 1);
            Ok(false)
        })
        .unwrap();
        assert_eq!(waited, None);
        assert!(started.elapsed() >= Duration::from_millis(30));
        assert!(started.elapsed() < Duration::from_millis(500));
        assert!(reads.get() > 1, "read again until the bound");
    }

    #[test]
    fn a_read_that_fails_is_the_wait_s_error() {
        let failed = until_state(true, Duration::from_secs(1), POLL, || {
            anyhow::bail!("org.freedesktop.DBus.Error.NoReply")
        });
        assert!(format!("{:#}", failed.unwrap_err()).contains("NoReply"));
    }

    #[test]
    fn the_refusals_name_the_application_the_bound_and_why_a_press_was_withheld() {
        assert_eq!(
            nothing_pressed(not_taken("org.kde.kate", Duration::from_millis(100))),
            "org.kde.kate did not take the background focus within 100 ms, so a press could have activated its \
             window; nothing was sent, so it is safe to retry"
        );
        assert_eq!(
            not_released("org.qt-project.qtcreator", Duration::from_millis(200)),
            "org.qt-project.qtcreator still held an earlier background focus after 200 ms, so a press could have \
             activated its window"
        );
    }

    #[test]
    fn the_record_carries_the_bound_and_each_wait_looked_at() {
        let mut ack = FocusAck::new(
            ObjRef {
                bus: ":1.7".into(),
                path: "/org/a11y/atspi/accessible/9".into(),
            },
            "org.kde.kate".into(),
            FOCUS_ACK,
        );
        assert_eq!(
            ack.record(),
            json!({"bound_ms": 25, "released_ms": null, "waited_ms": null, "refocused": false, "native_child": false})
        );
        ack.released = Some(Duration::from_micros(1500));
        ack.taken = Some(Duration::from_micros(12_345));
        ack.refocused = true;
        assert_eq!(
            ack.record(),
            json!({"bound_ms": 25, "released_ms": 1.5, "waited_ms": 12.345, "refocused": true, "native_child": false})
        );
    }

    #[test]
    fn a_press_needs_the_focus_as_it_is_now_not_as_the_session_found_it() {
        // the real focus within the window: Qt's own focus window is it
        assert_eq!(need(true, true), Need::Nothing);
        assert_eq!(need(true, false), Need::Nothing);
        // the session's synthetic focus: its report waited for
        assert_eq!(need(false, true), Need::Taken);
        // the review's case: a hold kept a session opened with the real focus within, and the focus has left since,
        // so the session holds no focus at all: it takes one, as a fresh session would
        assert_eq!(need(false, false), Need::Refocus);
    }

    #[test]
    fn a_press_refused_after_earlier_clicks_of_its_request_says_they_were_sent() {
        // the bounded re-review's P1: the check runs before every press of a multi-click; once a click has gone, a
        // refusal of the next must not say that nothing was sent
        assert_eq!(
            after_clicks(not_taken("org.kde.kate", FOCUS_ACK), 1, 2),
            "org.kde.kate did not take the background focus within 25 ms, so a press could have activated its \
             window; the request's next click was not sent, but 1 of its 2 clicks already reached the window, so read \
             the window before retrying"
        );
        assert_eq!(
            refused_press(native_child("kate"), 0, 3),
            nothing_pressed(native_child("kate")),
            "before the first click, nothing was sent"
        );
        assert_eq!(
            refused_press(native_child("kate"), 2, 3),
            after_clicks(native_child("kate"), 2, 3)
        );
    }

    #[test]
    fn the_native_child_and_no_frame_refusals_say_why_and_what_to_do() {
        assert_eq!(
            nothing_pressed(native_child("org.kde.kate")),
            "org.kde.kate gives a native child window of its own the input focus on a press at that point, so a \
             background press there would move the desktop's focus (use an element action, or a dedicated desktop); \
             nothing was sent, so it is safe to retry"
        );
        assert_eq!(
            nothing_pressed(no_frame("qtcreator")),
            "qtcreator is a Qt application with no accessibility tree on the bus, so cua cannot see it take the \
             background focus, and a press could activate its window (turn its accessibility on and restart it, or use \
             a dedicated desktop); nothing was sent, so it is safe to retry"
        );
    }
}
