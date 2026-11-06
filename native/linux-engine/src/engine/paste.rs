//! `type_text` and `clipboard_write`: one verified paste route (Design, Text and clipboard), on the clipboard core
//! (`clipboard/`). It observes the field before it acts (once its settle has passed when its window took keys or a
//! click just before, `settle.rs`), focuses it only if needed, holds the display's clipboard lock
//! from the snapshot through the cleanup, has the target's `TARGETS` request answered first (task 56, fix 3),
//! revalidates the field and the desktop focus, sends the family's paste chord once, confirms the inserted segment,
//! and ends through the core's guarded cleanup on every path. The answer is applied (success), not applied (a refusal
//! before dispatch, or the chord rejected outright), or unconfirmed (anything else after dispatch); nothing is ever
//! sent a second time.
//!
//! The chord goes through the background route; for a family that ignores it there (`families.rs`), the foreground
//! route in dedicated mode (the window activated, then the desktop route) and a refusal in shared mode; a request
//! without a window is desktop input into the focused client.

use std::time::{Duration, Instant};

use anyhow::{Result, anyhow, bail};
use serde_json::{Value, json};
use x11rb::connection::Connection;
use x11rb::protocol::xproto::Window;

use super::Engine;
use super::elements::{Element, visible_point};
use super::pointer::CLICK_HOLD;
use super::way::Way;
use crate::atspi;
use crate::clipboard::{Clipboard, Payload, TRANSFER_WAIT};
use crate::copy;
use crate::families::{DEFAULT_PASTE, Family, Kind, PasteRoute};
use crate::field::{self, Observation};
use crate::focus_ack::press_ack;
use crate::input::{chord_keycodes, focus_is_within};
use crate::paste::{self, CHANGED_CAUSE, Expected, Transfer, UNCONFIRMED};
use crate::route::Route;
use crate::tree::ObjRef;
use crate::wire::{ClipboardWriteInput, TypeTextInput, parse_input};
use crate::x11::X11;

/// How long a clicked element may take to report the focus, and the poll.
const FOCUS_WAIT: Duration = Duration::from_millis(500);
const FOCUS_POLL: Duration = Duration::from_millis(10);
/// How many focusing clicks at most (`click_for_focus`).
const FOCUS_CLICKS: u32 = 2;

/// The largest field observed whole for the scrolled-field confirmation, in characters, and in lines (a terminal's
/// screen is far smaller: 20 rows of 69 on the harness's).
const WHOLE_LIMIT: i32 = 65_536;
const WHOLE_LINES: usize = 512;

/// Why a paste is refused when another program took CLIPBOARD after the engine had (`paste::not_dispatched` ends it).
const LOST: &str = "another program took the clipboard before the paste was sent";
const UNKNOWN_HANDLE: &str = "unknown clipboard handle; copy again in this Linux helper";

/// One paste: where it goes and what it serves.
struct Request {
    window: Option<u32>,
    element_id: Option<String>,
    payload: Payload,
    /// The text the field should show where the paste lands; None when it cannot be known (a snapshot with no text).
    text: Option<String>,
    /// `type_text` of empty text pastes nothing once the field is focused, as the vendor's does (behaviour §12.1).
    empty_is_nothing: bool,
}

/// What the route found and did, for the `--stats` line.
#[derive(Default)]
struct Report {
    /// A focusing click went to the window: from the moment its pointer was placed.
    clicked: bool,
    /// The chord's first press was about to go out: from here on the answer is the dispatch's own.
    dispatched: bool,
    restored: Option<bool>,
    confirmed: bool,
    transfer: Option<&'static str>,
    requests: u32,
    attributed: u32,
    confirm_ms: Option<f64>,
    /// Which rule confirmed it: the inserted segment, or the whole field scrolled.
    confirm_rule: Option<&'static str>,
    /// How many confirming looks the paste took, and the scrolled-field rule's part in them.
    confirm_looks: u32,
    scrolled: Scrolled,
    /// The field observed whole (a family whose text scrolls): its characters and its lines, and how long that took.
    observed_whole: Option<(usize, usize)>,
    observed_whole_ms: Option<f64>,
    /// The field's text state when observed, and the offsets the confirmation reads.
    observed: Option<String>,
    expected: Option<(i32, i32)>,
    /// The requests the paste's owner saw: whose, which target atom, the outcome, the timestamp and when, in ms from
    /// the chord's dispatch (negative before it).
    log: Vec<String>,
    /// Before the chord: whether the target's `TARGETS` request since the take was answered, how long that took, and
    /// the wait's bound (`await_targets`).
    targets: Option<(bool, f64, u64)>,
    /// A press of the chord whose delivery is unknown.
    delivery: Option<String>,
    /// The settle before the observation (`settle.rs`): how long after its window's last key and last click the paste
    /// came (null: none yet), what it waited, and the settles, in ms.
    settle: Option<Value>,
    /// How long a clicked element took to report the focus (or the wait, when it did not), and the clicks it took.
    focus_ms: Option<f64>,
    clicks: u32,
    /// Under `--stats`, what the confirmation is judged against: the field's count and the text around the insertion
    /// point when observed, and again once an unconfirmed paste's confirmation has ended (`trace_around`).
    trace: bool,
    observed_around: Option<(i32, String)>,
    unconfirmed_around: Option<(i32, String)>,
}

/// How much text around the insertion point a `--stats` trace reads, before it and after it.
const TRACE_BEFORE: i32 = 24;
const TRACE_AFTER: i32 = 24;

/// The field's count and its text from `TRACE_BEFORE` before `at` to `TRACE_AFTER` past `at + len`, for the trace.
fn trace_around(bus: &mut crate::dbus::Bus, element: &ObjRef, at: i32, len: i32) -> Option<(i32, String)> {
    let from = (at - TRACE_BEFORE).max(0);
    let until = Instant::now() + crate::dbus::IO_TIMEOUT;
    field::read(bus, element, from, at - from + len + TRACE_AFTER, until)
        .ok()
        .flatten()
}

/// The text a snapshot holds, as a field would show it pasted: its UTF-8 formats first, then `STRING` (Latin-1).
fn snapshot_text(payload: &Payload, clipboard: &Clipboard) -> Option<String> {
    let atoms = clipboard.text_atoms();
    for target in [atoms.utf8_string, atoms.text_plain_utf8, atoms.text_plain] {
        if let Some(text) = payload.get(target).and_then(|f| std::str::from_utf8(&f.data).ok()) {
            return Some(text.to_string());
        }
    }
    let latin1 = payload.get(atoms.string)?;
    Some(latin1.data.iter().map(|&b| char::from(b)).collect())
}

impl Engine {
    pub(super) fn type_text(&mut self, input: Option<Value>) -> Result<Value> {
        let input: TypeTextInput = parse_input(input)?;
        if input.element_id.is_some() && input.window.is_none() {
            bail!("element typing requires window");
        }
        if input.text.len() > paste::MAX_TEXT_BYTES {
            bail!(paste::TOO_LONG);
        }
        let payload = Payload::text(&input.text, &self.clipboard()?.text_atoms());
        self.paste(Request {
            window: input.window.map(|w| w.id),
            element_id: input.element_id,
            payload,
            empty_is_nothing: true,
            text: Some(input.text),
        })
    }

    /// Pastes a `clipboard_read` snapshot into the window's focused element; the handle stays (behaviour §13.1).
    pub(super) fn clipboard_write(&mut self, input: Option<Value>) -> Result<Value> {
        let input: ClipboardWriteInput = parse_input(input)?;
        let Some(snapshot) = self.handles.get(&input.handle) else {
            bail!(UNKNOWN_HANDLE);
        };
        let text = snapshot_text(&snapshot, self.clipboard()?);
        self.paste(Request {
            window: Some(input.window.id),
            element_id: None,
            payload: (*snapshot).clone(),
            text,
            empty_is_nothing: false,
        })
    }

    fn paste(&mut self, request: Request) -> Result<Value> {
        let mut report = Report {
            trace: self.cfg.stats,
            ..Report::default()
        };
        let result = self.paste_with(&request, &mut report);
        self.extra.insert(
            "paste".into(),
            json!({
                "clicked": report.clicked,
                "restored": report.restored,
                "confirmed": report.confirmed,
                "transfer": report.transfer,
                "requests": report.requests,
                "attributed": report.attributed,
                "confirm_ms": report.confirm_ms,
                "confirm_rule": report.confirm_rule,
                "confirm_looks": report.confirm_looks,
                "scrolled": {
                    "checks": report.scrolled.checks,
                    "unchanged": report.scrolled.unchanged,
                    "check_ms": report.scrolled.check_time.as_secs_f64() * 1000.0,
                },
                "observed_whole": report.observed_whole,
                "observed_whole_ms": report.observed_whole_ms,
                "observed": report.observed,
                "expected": report.expected,
                "log": report.log,
                "targets": report.targets.map(|(answered, waited_ms, bound_ms)| json!({
                    "answered": answered,
                    "waited_ms": waited_ms,
                    "bound_ms": bound_ms,
                })),
                "delivery": report.delivery,
                "settle": report.settle,
                "focus_ms": report.focus_ms,
                "clicks": report.clicks,
                "observed_around": report.observed_around,
                "unconfirmed_around": report.unconfirmed_around,
            }),
        );
        result
    }

    fn paste_with(&mut self, request: &Request, report: &mut Report) -> Result<Value> {
        // A conversion of an earlier unconfirmed paste, this engine's or another cua engine's, may still come: nothing
        // new is served meanwhile. Read early so a refusal comes before anything is done; read again under the lock,
        // where it decides.
        if let Some(wait) = self.clipboard()?.quarantine()? {
            bail!(paste::previous_unconfirmed(wait, false));
        }
        let window = match request.window {
            Some(id) => id,
            None => self
                .x
                .focused_client()?
                .ok_or_else(|| anyhow!("no window has the input focus to type into; nothing was sent"))?,
        };
        let info = self.x.get_window(window)?;
        let family = self.family_of(window);
        let chord = match family.map_or(DEFAULT_PASTE, |f| f.paste) {
            PasteRoute::Chord(chord) => chord,
            PasteRoute::Unverified => bail!(paste::no_paste_route(&info.app)),
        };
        // the route chosen first (a refusal before anything else), the window activated only once the chord and the
        // element are known good, so a request refused for its input activates nothing
        let way = self.route_for(request.window.map(|_| window), Kind::Paste)?;
        self.extra.insert(
            "paste_route".into(),
            json!({
                "family": family.map(|f| f.name),
                "chord": chord,
                "window": format!("{window:#x}"),
                "resource_id_mask": format!("{:#x}", self.x.conn.setup().resource_id_mask),
            }),
        );
        let keycodes = chord_keycodes(&self.x, chord)?;
        // A paste observes its field before it acts, and keys or a click its window took just before may not have
        // landed: the settle waits until it has passed since the last of them, here, before the observation and the
        // clipboard lock and never between the observation and the dispatch (`settle.rs`; the design session,
        // 2026-11-04, and its ruling on task 60, 2026-11-05)
        let settled = self.inputs.settle_paste(window);
        let ms = |d: Duration| d.as_secs_f64() * 1000.0;
        report.settle = Some(json!({
            "after_key_ms": settled.after_key.map(ms),
            "after_click_ms": settled.after_click.map(ms),
            "waited_ms": ms(settled.waited),
            "settle_ms": ms(self.inputs.pacing.paste_settle),
            "click_settle_ms": ms(self.inputs.pacing.paste_click_settle),
        }));
        // The element: the one named, resolved with its ancestors for the focusing click's point; else the window's
        // focused element, looked for once the session's synthetic focus is in (a background Chrome reports its
        // address bar focused only then).
        let named = match &request.element_id {
            Some(id) => Ok(self.resolve_element(window, id)?),
            None => Err(self
                .with_bus(|bus, x| atspi::associated(bus, x, &info))?
                .map_err(anyhow::Error::msg)?),
        };
        // on the foreground route the named element must be editable before the window is activated; the observation
        // inside the route (step 1) still decides, as on the background route
        if way == Way::Foreground
            && let Ok(element) = &named
        {
            let bus = self
                .bus
                .as_mut()
                .ok_or_else(|| anyhow!("AT-SPI accessibility bus is unavailable"))?;
            if !observe(bus, &element.target)?.editable {
                bail!(NOT_EDITABLE);
            }
        }
        self.enter_checked(way, request.window.map(|_| window), |_| Ok(()))?;
        let feff = family.is_some_and(|f| f.feff_after_astral);
        let scrolls = family.is_some_and(|f| f.text_scrolls);
        let targets_wait = targets_wait(family, self.cfg.targets_wait);
        let target = way.target(window);
        // a focusing click presses button 1, and only a named element is ever clicked: for a family whose press
        // activates a window it has not focused, the session's focus is waited for before it (`focus_ack.rs`)
        let mut ack = match &named {
            Ok(element) => self.focus_ack_for(target, Some(element.associated.frame.clone()))?,
            Err(_) => None,
        };
        let resource_id_mask = self.x.conn.setup().resource_id_mask;
        let Engine {
            x,
            inputs,
            bus,
            clipboard,
            ..
        } = self;
        let bus = bus
            .as_mut()
            .ok_or_else(|| anyhow!("AT-SPI accessibility bus is unavailable"))?;
        let clipboard = clipboard.as_mut().expect("connected above");
        let pasted = inputs
            .with_route(x, target, |x, route, _| {
                let (element, named) = match &named {
                    Ok(element) => (element.clone(), true),
                    Err(associated) => {
                        let focused = copy::focused(bus, &associated.frame)?.ok_or_else(|| {
                            anyhow!("window {window} has no focused element to paste into; nothing was sent")
                        })?;
                        let element = Element {
                            info: info.clone(),
                            target: focused,
                            ancestors: Vec::new(),
                            associated: associated.clone(),
                        };
                        (element, false)
                    }
                };
                // 1. Observe.
                let mut seen = observe(bus, &element.target)?;
                if named && !seen.editable {
                    bail!(NOT_EDITABLE);
                }
                // 2. Focus only if needed, then put back the caret or selection the click moved. Each click and the restore
                // is an effect on what association chose, so the association is confirmed again just before each.
                if named && !seen.focused {
                    let (rx, ry) = visible_point(bus, &element, "typing")?;
                    let clicked_at = Instant::now();
                    let shared = std::cell::RefCell::new(&mut *bus);
                    let clicked = &mut report.clicked;
                    let (after, clicks) = click_for_focus(
                        || {
                            confirmed(&element, &mut shared.borrow_mut(), x, *clicked)?;
                            // the foreground route's window on top at the point before the click (task 63)
                            route
                                .on_top_at(x, &[(rx, ry)])?
                                .map_err(|cause| refused(&cause, *clicked))?;
                            let pressing =
                                press_ack(ack.as_mut(), Some(&mut **shared.borrow_mut()), x, route, Some((rx, ry)))?
                                    .map_err(|cause| refused(&cause, *clicked))?;
                            // sent from the moment the pointer is placed, so no later refusal says nothing was
                            *clicked = true;
                            route.place(x, rx, ry)?;
                            route.press(x, 1, pressing)?;
                            std::thread::sleep(CLICK_HOLD);
                            route.release_button(x, 1)
                        },
                        || observe(&mut shared.borrow_mut(), &element.target),
                        FOCUS_WAIT,
                        FOCUS_POLL,
                    )?;
                    report.clicks = clicks;
                    report.focus_ms = Some(clicked_at.elapsed().as_secs_f64() * 1000.0);
                    if !after.focused {
                        return Err(refused("element did not take the focus when clicked", true));
                    }
                    if let Some(before) = &seen.text {
                        #[cfg(test)]
                        crate::fault::identity(crate::fault::Identity::Restore);
                        confirmed(&element, bus, x, true)?;
                        report.restored = Some(field::restore(bus, &element.target, before)?);
                    }
                    seen = observe(bus, &element.target)?;
                }
                if !seen.focused {
                    return Err(refused(CHANGED_CAUSE, report.clicked));
                }
                let text = request.text.as_deref().unwrap_or_default();
                if text.is_empty() && request.empty_is_nothing {
                    // Nothing to paste: the field is focused, and no clipboard work is done.
                    return Ok(());
                }
                let insertion = seen.text.as_ref().and_then(|t| t.insertion_point().map(|at| (t, at)));
                let expected = match insertion.filter(|_| request.text.is_some()) {
                    Some((state, at)) => {
                        let len = paste::offsets(text, feff);
                        let until = Instant::now() + crate::dbus::IO_TIMEOUT;
                        let before = field::read(bus, &element.target, at, len, until)?;
                        // a field whose text scrolls away at its start is observed whole as well, so a paste the
                        // scroll moved can still be confirmed (`Expected::confirmed_scrolled`): never over a
                        // selection, whose replacement the whole text could not foresee
                        let whole = (scrolls && !feff && state.selected().is_none() && state.count <= WHOLE_LIMIT)
                            .then(|| {
                                let started = Instant::now();
                                let read = field::read_lines(bus, &element.target, state.count, WHOLE_LINES);
                                report.observed_whole_ms = Some(started.elapsed().as_secs_f64() * 1000.0);
                                read.ok().flatten()
                            })
                            .flatten()
                            .map(|(text, line_starts)| paste::Whole { text, line_starts });
                        report.observed_whole = whole.as_ref().map(|w| (w.text.chars().count(), w.line_starts.len()));
                        before.map(|(_, before)| Expected {
                            text: text.to_string(),
                            at,
                            len,
                            feff_after_astral: feff,
                            count_before: state.count,
                            before,
                            whole,
                        })
                    }
                    None => None,
                };
                report.observed = Some(format!("{:?}", seen.text));
                report.expected = expected.as_ref().map(|e| (e.at, e.len));
                if report.trace
                    && let Some(e) = &expected
                {
                    report.observed_around = trace_around(bus, &element.target, e.at, e.len);
                }
                let field = Prepared {
                    element,
                    seen,
                    expected,
                };
                let delivery = Delivery {
                    window,
                    resource_id_mask,
                    keycodes: &keycodes,
                    payload: &request.payload,
                    targets_wait,
                };
                dispatch_and_confirm(x, route, bus, clipboard, field, delivery, report)
            })
            .map_err(|error| said_after_click(error, report));
        self.record_focus_ack(ack.as_ref());
        pasted.map(|()| Value::Null)
    }
}

/// A refusal before the chord whose sentence already says what the request had sent by then (`refused`, an identity
/// refusal): answered as it is.
#[derive(Debug)]
struct Said(String);

impl std::fmt::Display for Said {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Said {}

/// A refusal before the chord: `cause`, and whether a focusing click had already gone to the window
/// (`paste::not_dispatched`).
fn refused(cause: &str, clicked: bool) -> anyhow::Error {
    Said(paste::not_dispatched(cause, clicked)).into()
}

/// Any other error that ended a paste after its focusing click and before its chord (a busy clipboard lock, a failed
/// call): it says that the click reached the window and no paste was dispatched, so the caller reads the window before
/// a retry. "Nothing was sent" is said only when nothing was (the design session, M4's T5 round 3).
fn said_after_click(error: anyhow::Error, report: &Report) -> anyhow::Error {
    if !report.clicked || report.dispatched || error.is::<Said>() {
        return error;
    }
    anyhow!(paste::not_dispatched(format!("{error:#}"), true))
}

/// The focusing click: clicks, then observes every `poll` for up to `wait` until the element reports the focus. A click
/// whose focus never showed is made once more, the wait past any double-click time: background Chrome drops the first
/// synthetic click into one window's address bar after the vendor build's pastes into another of its windows (M2.3's
/// harness, reproduced in every sitting; the focus never came within 3 s), and takes the next. Nothing has been sent
/// yet, so the second click risks nothing a first one would not. Returns the last observation and the clicks made.
fn click_for_focus(
    mut click: impl FnMut() -> Result<()>,
    mut observe: impl FnMut() -> Result<Observation>,
    wait: Duration,
    poll: Duration,
) -> Result<(Observation, u32)> {
    let mut clicks = 0;
    loop {
        click()?;
        clicks += 1;
        let deadline = Instant::now() + wait;
        let mut after = observe()?;
        while !after.focused && Instant::now() < deadline {
            std::thread::sleep(poll);
            after = observe()?;
        }
        if after.focused || clicks == FOCUS_CLICKS {
            return Ok((after, clicks));
        }
    }
}

/// The window's association confirmed again just before one of a paste's effects (a focusing click, the selection
/// restore). A change refuses, saying whether a focusing click had already been sent (`identity_refusal`).
fn confirmed(element: &Element, bus: &mut crate::dbus::Bus, x: &mut X11, clicked: bool) -> Result<()> {
    if !element.associated.confirm(bus, x)? {
        return Err(Said(identity_refusal(element.info.id, clicked)).into());
    }
    Ok(())
}

/// A paste refused because its window's association changed: safe to retry only when no focusing click preceded it,
/// since a click that reached the window may have moved its focus or its caret.
fn identity_refusal(window: Window, clicked: bool) -> String {
    if clicked {
        atspi::changed_after_input(
            window,
            "no paste was dispatched, but a focusing click already reached the window",
        )
    } else {
        atspi::changed_before_acting(window)
    }
}

/// A named target that implements no editable text.
const NOT_EDITABLE: &str = "element is not editable; refresh get_window_state() and choose an editable element";

fn observe(bus: &mut crate::dbus::Bus, element: &ObjRef) -> Result<Observation> {
    field::observe(bus, element)?.map_err(anyhow::Error::msg)
}

/// Whether the desktop focus is as the paste found it: on the background route, the X input focus is within the
/// window exactly when it was at the session's start (the synthetic-focus state the session holds); on the desktop
/// route, the X input focus is within the window.
fn desktop_focus_holds(x: &X11, route: &Route, window: Window) -> Result<bool> {
    let within = focus_is_within(x, window)?;
    Ok(match route.session() {
        Some(session) => within == session.focus_was_within(),
        None => within,
    })
}

/// The field as steps 1 and 2 left it: the element, what was observed, and what the confirmation looks for.
struct Prepared {
    element: Element,
    seen: Observation,
    expected: Option<Expected>,
}

/// What the dispatch sends and to whom: the window (whose X client's requests are the paste's target's), the chord's
/// keycodes and the payload to serve.
struct Delivery<'a> {
    window: Window,
    resource_id_mask: u32,
    keycodes: &'a [u8],
    payload: &'a Payload,
    /// How long the target may take to ask for `TARGETS` after the take (`targets_wait`).
    targets_wait: Duration,
}

/// How long a paste waits after the take for its target to ask for `TARGETS` (task 56, fix 3): the bound for a family
/// that asks at every owner change, none for any other, whose request is answered before the chord only if it has
/// already come; `measured` (`--targets-wait-ms`, measurement only) for every family.
fn targets_wait(family: Option<&Family>, measured: Option<Duration>) -> Duration {
    measured.unwrap_or(if family.is_some_and(|f| f.refreshes_targets) {
        paste::TARGETS_REFRESH_WAIT
    } else {
        Duration::ZERO
    })
}

/// The end of step 3 (task 56, fix 3): asks whether the target's `TARGETS` request since the take has been answered
/// (`answered`, which syncs the owner so a yes means the answer has been delivered), once; while it has not and `wait`
/// has not passed, again every `poll`, `waiting` running before each pause. Answers whether it was, and how long it
/// took.
fn await_targets(
    mut answered: impl FnMut() -> Result<bool>,
    mut waiting: impl FnMut(),
    wait: Duration,
    poll: Duration,
) -> Result<(bool, Duration)> {
    let started = Instant::now();
    let deadline = started + wait;
    loop {
        if answered()? {
            return Ok((true, started.elapsed()));
        }
        if Instant::now() >= deadline {
            return Ok((false, started.elapsed()));
        }
        waiting();
        std::thread::sleep(poll);
    }
}

/// Steps 3 to 6: the lock, the snapshot and the ownership; the target's `TARGETS` answer; the revalidation; the chord, once; the confirmation and
/// the transfer, within their bounds; the guarded cleanup on every path, and the answer.
fn dispatch_and_confirm(
    x: &mut X11,
    route: &mut Route,
    bus: &mut crate::dbus::Bus,
    clipboard: &mut Clipboard,
    field: Prepared,
    delivery: Delivery,
    report: &mut Report,
) -> Result<()> {
    let Prepared {
        element,
        seen,
        expected,
    } = field;
    let window = delivery.window;
    // Every refusal before the chord says whether the focusing click had gone to the window (`refused`); any other
    // error here is told so by `said_after_click`.
    let clicked = report.clicked;
    if !desktop_focus_holds(x, route, window)? {
        return Err(refused(CHANGED_CAUSE, clicked));
    }
    // 3. Lock, snapshot, own. The lock is released after the paste's cleanup (dropped in reverse order).
    let _lock = clipboard.lock()?;
    if let Some(wait) = clipboard.quarantine()? {
        return Err(Said(paste::previous_unconfirmed(wait, clicked)).into());
    }
    let restore = clipboard.snapshot().map_err(|e| refused(&format!("{e:#}"), clicked))?;
    #[cfg(test)]
    crate::fault::identity(crate::fault::Identity::Snapshot);
    let pasted = clipboard
        .take(delivery.payload.clone(), restore)
        .map_err(|e| refused(&format!("{e:#}"), clicked))?;
    #[cfg(test)]
    crate::fault::identity(crate::fault::Identity::Taken);
    // The target's view of the new owner (task 56, fix 3): a client that keeps CLIPBOARD's targets learns the new
    // owner's from its own TARGETS request, and gnome-terminal drops a paste chord that comes before that answer. A
    // request the target has already made is answered and delivered before the chord, in every family; one a family
    // makes at every owner change is waited for, bounded. Under the lock; the revalidation comes after it.
    let (answered, waited) = await_targets(
        || pasted.answered_targets(window, delivery.resource_id_mask),
        || {
            #[cfg(test)]
            crate::fault::identity(crate::fault::Identity::TargetsWait);
        },
        delivery.targets_wait,
        paste::TARGETS_POLL,
    )
    .map_err(|e| refused(&format!("{e:#}"), clicked))?;
    report.targets = Some((
        answered,
        waited.as_secs_f64() * 1000.0,
        delivery.targets_wait.as_millis() as u64,
    ));
    // 4. Revalidate, then dispatch once.
    if observe(bus, &element.target)? != seen || !desktop_focus_holds(x, route, window)? {
        pasted.settled();
        return Err(refused(CHANGED_CAUSE, clicked));
    }
    if pasted.lost() {
        pasted.settled();
        return Err(refused(LOST, clicked));
    }
    // The field was observed in the frame association chose: confirmed again just before the chord.
    if !element.associated.confirm(bus, x)? {
        pasted.settled();
        return Err(Said(identity_refusal(window, clicked)).into());
    }
    let time = match route.session() {
        Some(session) => session.now(),
        None => clipboard.server_time()?,
    };
    pasted.dispatched(time, window & !delivery.resource_id_mask);
    // Before the press goes out, so a request the press causes is never earlier than it.
    let dispatched_at = Instant::now();
    report.dispatched = true;
    let chord = send_chord(x, route, delivery.keycodes);
    let release_failure = chord.release_failed.as_ref().map(|error| {
        format!(
            "a key of the paste chord could not be released ({error:#}) and may still be held; inspect the window \
             before retrying"
        )
    });
    report.delivery = chord
        .uncertain
        .as_ref()
        .map(|error| format!("unacknowledged: {error:#}"));
    if let Some(error) = chord.rejected {
        // The server named a press of the chord as an error, so its last key, the one that pastes, never arrived.
        pasted.settled();
        match release_failure {
            Some(failure) => bail!("the X server refused the paste chord ({error:#}); nothing was pasted; {failure}"),
            None => bail!("the X server refused the paste chord ({error:#}); nothing was pasted"),
        }
    }
    // 5. Confirm, while the transfer is served within its bounds.
    let is_target = |requestor: u32| paste::same_client(requestor, window, delivery.resource_id_mask);
    let confirm_deadline = dispatched_at + paste::CONFIRM_WAIT;
    let hard_deadline = dispatched_at + TRANSFER_WAIT + Duration::from_secs(1);
    let mut transfer;
    loop {
        let now = Instant::now();
        if !report.confirmed
            && now < confirm_deadline
            && let Some(e) = &expected
            && let Some(rule) = {
                report.confirm_looks += 1;
                confirmed_before(
                    |bus: &mut crate::dbus::Bus, until| field::read(bus, &element.target, e.at, e.len, until),
                    |bus: &mut crate::dbus::Bus, until| field::read_whole(bus, &element.target, until),
                    bus,
                    e,
                    &mut report.scrolled,
                    confirm_deadline,
                )
            }
        {
            report.confirmed = true;
            report.confirm_rule = Some(rule.name());
            report.confirm_ms = Some(dispatched_at.elapsed().as_secs_f64() * 1000.0);
        }
        let confirm_done = report.confirmed || expected.is_none() || Instant::now() >= confirm_deadline;
        transfer = paste::transfer(
            &pasted.watch().log,
            is_target,
            dispatched_at,
            pasted.lost(),
            Instant::now(),
        );
        if (confirm_done && transfer != Transfer::Open) || Instant::now() >= hard_deadline {
            break;
        }
        std::thread::sleep(paste::CONFIRM_POLL);
    }
    let watch = pasted.watch();
    report.requests = watch.requests;
    report.attributed = watch.log.iter().filter(|s| is_target(s.requestor)).count() as u32;
    report.log = watch
        .log
        .iter()
        .map(|s| {
            let whose = if is_target(s.requestor) { "target" } else { "other" };
            let at = match s.at.checked_duration_since(dispatched_at) {
                Some(after) => after.as_millis() as i128,
                None => -(dispatched_at.duration_since(s.at).as_millis() as i128),
            };
            format!(
                "{whose} {:#x} {} {:?} t{} {at:+}ms",
                s.requestor, s.target, s.outcome, s.time
            )
        })
        .collect();
    report.transfer = Some(match transfer {
        Transfer::Open => "open",
        Transfer::Served => "served",
        Transfer::Ended => "ended",
    });
    // 6. Answer, after the cleanup. A key left held is reported whatever the field shows.
    if report.confirmed {
        pasted.confirmed();
        return match release_failure {
            Some(failure) => bail!("Paste was applied, but {failure}"),
            None => Ok(()),
        };
    }
    if report.trace
        && let Some(e) = &expected
    {
        report.unconfirmed_around = trace_around(bus, &element.target, e.at, e.len);
    }
    if transfer == Transfer::Served {
        pasted.settled();
    } else {
        drop(pasted);
    }
    match release_failure {
        Some(failure) => bail!("{UNCONFIRMED}; also, {failure}"),
        None => bail!(UNCONFIRMED),
    }
}

/// What sending the paste chord did.
#[derive(Default)]
struct Chord {
    /// The server answered a press with an X error naming it: that key, and the chord's last (the one that pastes),
    /// were not delivered.
    rejected: Option<anyhow::Error>,
    /// A press whose delivery is unknown: the acknowledgement never came (a lost connection, for one). The paste may
    /// have been sent.
    uncertain: Option<anyhow::Error>,
    /// A key that could not be released, after one retry.
    release_failed: Option<anyhow::Error>,
}

/// Whether a send's error is the server's rejection of that request, proof that it was not delivered.
fn rejected_by_server(error: &anyhow::Error) -> bool {
    matches!(
        error.downcast_ref::<x11rb::errors::ReplyError>(),
        Some(x11rb::errors::ReplyError::X11Error(_))
    )
}

/// Presses the chord's keys in order, one at a time, stopping at the first that fails; then releases what may be down,
/// last first: a key whose press went unacknowledged (not in the bookkeeping, so released alone), then every key
/// pressed. Each release is attempted, and one that fails is tried once more; no press is ever sent again.
fn send_chord(x: &X11, route: &mut Route, keycodes: &[u8]) -> Chord {
    let mut chord = Chord::default();
    let mut held = Vec::new();
    let mut unacknowledged = None;
    for &keycode in keycodes {
        match route.acquire(x, &[keycode]) {
            Ok(acquired) => held.extend(acquired),
            Err(error) if rejected_by_server(&error) => {
                chord.rejected = Some(error);
                break;
            }
            Err(error) => {
                chord.uncertain = Some(error);
                unacknowledged = Some(keycode);
                break;
            }
        }
    }
    if let Some(keycode) = unacknowledged
        && let Err(error) = route
            .release_unheld(x, keycode)
            .or_else(|_| route.release_unheld(x, keycode))
    {
        chord.release_failed = Some(error);
    }
    let (released, unreleased) = route.release_tracked(x, &held);
    if released.is_err() {
        let (again, _) = route.release_tracked(x, &unreleased);
        if let Err(error) = again
            && chord.release_failed.is_none()
        {
            chord.release_failed = Some(error);
        }
    }
    chord
}

/// Which rule a confirming look proved the paste by (`--stats` `confirm_rule`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Rule {
    /// The inserted segment at its offsets (`Expected::confirmed_by`).
    Segment,
    /// The whole field, scrolled (`Expected::confirmed_scrolled`).
    Scrolled,
}

impl Rule {
    fn name(self) -> &'static str {
        match self {
            Rule::Segment => "segment",
            Rule::Scrolled => "scrolled",
        }
    }
}

/// One confirming look, bounded by the confirmation's deadline: the inserted segment at its offsets (`read`); else, in a
/// field observed whole whose count shows that text has left it (a scroll takes text from the field's start, so it
/// holds fewer characters than the paste alone would make), the whole field as it reads now (`read_whole`), under the
/// scrolled-field rule. Each read waits no later than the deadline, and its result counts only if it came before it,
/// so a reply that arrives late never confirms a paste that applied late. A whole read that is the same text as the
/// last one the scrolled-field rule left unconfirmed is not judged again (`Scrolled`).
fn confirmed_before<C>(
    read: impl FnOnce(&mut C, Instant) -> Result<Option<(i32, String)>>,
    read_whole: impl FnOnce(&mut C, Instant) -> Result<Option<String>>,
    on: &mut C,
    expected: &Expected,
    scrolled: &mut Scrolled,
    deadline: Instant,
) -> Option<Rule> {
    if Instant::now() >= deadline {
        return None;
    }
    let (count, text) = read(on, deadline).ok().flatten()?;
    if expected.confirmed_by(count, &text) {
        return (Instant::now() < deadline).then_some(Rule::Segment);
    }
    if expected.whole.is_none() || count >= expected.count_before + expected.len || Instant::now() >= deadline {
        return None;
    }
    let after = read_whole(on, deadline).ok().flatten()?;
    if scrolled.unconfirmed.as_deref() == Some(after.as_str()) {
        scrolled.unchanged += 1;
        return None;
    }
    let started = Instant::now();
    let confirmed = expected.confirmed_scrolled(&after);
    scrolled.checks += 1;
    scrolled.check_time += started.elapsed();
    if confirmed {
        return (Instant::now() < deadline).then_some(Rule::Scrolled);
    }
    scrolled.unconfirmed = Some(after);
    None
}

/// The scrolled-field rule over one paste's confirmation (`confirmed_before`): the last whole read it left
/// unconfirmed, and, for `--stats`, how many reads it judged, how many it did not judge again because they read the
/// same, and the time its judging took. The rule's answer depends on the whole read's text alone, and a terminal left
/// unconfirmed reads the same at each of the confirmation's looks, up to 100 in its 2 s. One judging at the route's
/// limits (a field of `WHOLE_LIMIT` characters in `WHOLE_LINES` lines and a 64 KiB paste) took 11 to 24 ms, and
/// judging every look of a paste left unconfirmed there took 0.83 s of CPU over the 2 s (task 56, fix 4); compared in
/// place, one judging takes about 3 ms (fix 5).
#[derive(Default)]
struct Scrolled {
    unconfirmed: Option<String>,
    checks: u32,
    unchanged: u32,
    check_time: Duration,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_family_that_asks_at_every_owner_change_waits_for_its_targets() {
        let vte = crate::families::family(crate::families::FAMILIES, Some("Gnome-terminal"), None);
        let chrome = crate::families::family(crate::families::FAMILIES, Some("Google-chrome"), None);
        assert_eq!(targets_wait(vte, None), paste::TARGETS_REFRESH_WAIT);
        assert_eq!(targets_wait(chrome, None), Duration::ZERO);
        assert_eq!(targets_wait(None, None), Duration::ZERO, "an unlisted family");
        let measured = Some(Duration::from_millis(1000));
        assert_eq!(
            targets_wait(chrome, measured),
            Duration::from_millis(1000),
            "measurement: every family"
        );
        assert_eq!(targets_wait(vte, measured), Duration::from_millis(1000));
    }

    #[test]
    fn with_no_wait_the_target_s_answer_is_asked_about_once() {
        let mut asked = 0;
        let mut waited = 0;
        let (answered, _) = await_targets(
            || {
                asked += 1;
                Ok(false)
            },
            || waited += 1,
            Duration::ZERO,
            Duration::from_millis(1),
        )
        .unwrap();
        assert_eq!((answered, asked, waited), (false, 1, 0));
    }

    #[test]
    fn a_wait_ends_at_the_target_s_answer_or_at_its_bound() {
        let mut answers = [false, false, true].into_iter();
        let mut waited = 0;
        let (answered, took) = await_targets(
            || Ok(answers.next().unwrap()),
            || waited += 1,
            Duration::from_secs(5),
            Duration::from_millis(1),
        )
        .unwrap();
        assert!(answered && took < Duration::from_secs(1), "{took:?}");
        assert_eq!(waited, 2, "a pause between the asks, none after the answer");
        let (answered, took) =
            await_targets(|| Ok(false), || {}, Duration::from_millis(30), Duration::from_millis(2)).unwrap();
        assert!(
            !answered && took >= Duration::from_millis(30) && took < Duration::from_millis(500),
            "{took:?}"
        );
        let failed = await_targets(
            || Err(anyhow!("clipboard owner stopped during paste")),
            || {},
            Duration::from_secs(5),
            Duration::from_millis(1),
        );
        assert!(failed.is_err());
    }

    fn seen(focused: bool) -> Observation {
        Observation {
            focused,
            editable: true,
            showing: true,
            text: None,
        }
    }

    #[test]
    fn an_identity_refusal_says_safe_to_retry_only_before_any_focusing_click() {
        assert_eq!(
            identity_refusal(7, false),
            "window identity changed during the request for X11 window 7; nothing was sent, so it is safe to retry"
        );
        // before a second focusing click, the selection restore or the chord: the first click reached the window
        assert_eq!(
            identity_refusal(7, true),
            "window identity changed during the request for X11 window 7; no paste was dispatched, but a focusing \
             click already reached the window, so read the window before retrying"
        );
    }

    #[test]
    fn an_error_after_the_focusing_click_and_before_the_chord_says_the_click_reached_the_window() {
        let said = |error: anyhow::Error, clicked, dispatched| {
            let report = Report {
                clicked,
                dispatched,
                ..Report::default()
            };
            format!("{:#}", said_after_click(error, &report))
        };
        assert_eq!(
            said(anyhow!("clipboard busy"), false, false),
            "clipboard busy",
            "no click"
        );
        assert_eq!(
            said(anyhow!("clipboard busy"), true, false),
            "clipboard busy; no paste was dispatched, but a focusing click already reached the window, so read the \
             window before retrying"
        );
        assert_eq!(
            said(anyhow!(UNCONFIRMED), true, true),
            UNCONFIRMED,
            "after the chord the answer is the dispatch's"
        );
        assert_eq!(
            said(refused(CHANGED_CAUSE, false), true, false),
            paste::CHANGED,
            "a sentence that already says what was sent is kept"
        );
    }

    #[test]
    fn a_focusing_click_the_application_dropped_is_made_once_more_past_the_double_click_time() {
        // background Chrome drops the first click into an address bar in some states and takes the next (M2.3)
        let started = Instant::now();
        let clicks_at = std::cell::RefCell::new(Vec::new());
        let (after, clicks) = click_for_focus(
            || {
                clicks_at.borrow_mut().push(started.elapsed());
                Ok(())
            },
            || Ok(seen(clicks_at.borrow().len() >= 2)),
            Duration::from_millis(450),
            Duration::from_millis(5),
        )
        .unwrap();
        assert!(after.focused);
        assert_eq!(clicks, 2);
        let clicks_at = clicks_at.into_inner();
        assert!(
            clicks_at[1] - clicks_at[0] >= Duration::from_millis(450),
            "no double click: {clicks_at:?}"
        );
    }

    #[test]
    fn the_focusing_click_stops_at_its_second_try_or_at_the_focus() {
        let mut made = 0;
        let (after, clicks) = click_for_focus(
            || {
                made += 1;
                Ok(())
            },
            || Ok(seen(false)),
            Duration::from_millis(20),
            Duration::from_millis(5),
        )
        .unwrap();
        assert!(!after.focused);
        assert_eq!((clicks, made), (2, 2), "never a third click");
        let mut made = 0;
        let (after, clicks) = click_for_focus(
            || {
                made += 1;
                Ok(())
            },
            || Ok(seen(true)),
            Duration::from_millis(20),
            Duration::from_millis(5),
        )
        .unwrap();
        assert!(after.focused);
        assert_eq!((clicks, made), (1, 1), "a click that focused is not repeated");
        // a click the X server refuses ends the request there
        assert!(
            click_for_focus(
                || anyhow::bail!("BadWindow"),
                || Ok(seen(false)),
                Duration::from_millis(5),
                Duration::from_millis(1)
            )
            .is_err()
        );
    }

    fn expected() -> Expected {
        Expected {
            text: "cua171".into(),
            at: 0,
            len: 6,
            feff_after_astral: false,
            count_before: 0,
            before: String::new(),
            whole: None,
        }
    }

    /// The inserted segment's rule alone: a field not observed whole is never read whole.
    fn segment(read: impl FnOnce(Instant) -> Result<Option<(i32, String)>>, deadline: Instant) -> Option<Rule> {
        confirmed_before(
            |_: &mut (), until| read(until),
            |_: &mut (), _| panic!("a field not observed whole is read whole"),
            &mut (),
            &expected(),
            &mut Scrolled::default(),
            deadline,
        )
    }

    #[test]
    fn a_confirming_reply_that_arrives_after_the_deadline_does_not_confirm() {
        let deadline = Instant::now() + Duration::from_millis(50);
        let late = |_: Instant| {
            // the provider delays its confirming GetText past the deadline
            std::thread::sleep(Duration::from_millis(80));
            Ok(Some((6, "cua171".to_string())))
        };
        assert_eq!(segment(late, deadline), None);
    }

    #[test]
    fn a_confirming_reply_in_time_confirms_and_the_read_is_given_the_deadline() {
        let deadline = Instant::now() + Duration::from_millis(500);
        let mut given = None;
        let read = |until: Instant| {
            given = Some(until);
            Ok(Some((6, "cua171".to_string())))
        };
        assert_eq!(segment(read, deadline), Some(Rule::Segment));
        assert_eq!(
            given,
            Some(deadline),
            "the read waits no later than the confirmation's deadline"
        );
        assert_eq!(segment(|_| Ok(Some((6, "cua17".into()))), deadline), None);
        assert_eq!(segment(|_| Ok(None), deadline), None, "a read the deadline cut short");
        let past = Instant::now() - Duration::from_millis(1);
        let mut read_at_all = false;
        assert_eq!(
            segment(
                |_| {
                    read_at_all = true;
                    Ok(Some((6, "cua171".into())))
                },
                past
            ),
            None
        );
        assert!(!read_at_all, "no read starts after the deadline");
    }

    /// A terminal's full screen observed whole: two rows and a partial one, the caret before VTE's closing newline.
    fn screen() -> Expected {
        Expected {
            text: "Pasted".into(),
            at: 16,
            len: 6,
            feff_after_astral: false,
            count_before: 17,
            before: "\n".into(),
            whole: Some(paste::Whole {
                text: "0123456789KLMNOP\n".into(),
                line_starts: vec![0, 10],
            }),
        }
    }

    #[test]
    fn a_field_observed_whole_is_read_whole_only_once_text_has_left_it_and_confirms_scrolled() {
        let deadline = Instant::now() + Duration::from_millis(500);
        let look = |wholes: &mut i32, count: i32, segment: &str, whole: &str| {
            confirmed_before(
                |_: &mut i32, _| Ok(Some((count, segment.to_string()))),
                |n: &mut i32, _| {
                    *n += 1;
                    Ok(Some(whole.to_string()))
                },
                wholes,
                &screen(),
                &mut Scrolled::default(),
                deadline,
            )
        };
        let mut wholes = 0;
        assert_eq!(
            look(&mut wholes, 23, "Pasted", ""),
            Some(Rule::Segment),
            "no scroll: the segment's rule"
        );
        assert_eq!(
            look(&mut wholes, 23, "\n", ""),
            None,
            "as many characters as the paste makes: nothing left the field, no whole read"
        );
        assert_eq!(wholes, 0);
        assert_eq!(
            look(&mut wholes, 17, "\n", "0123456789KLMNOP\n"),
            None,
            "not landed yet"
        );
        // the screen scrolled by its first row as the paste wrapped the last: the segment's offsets read past the end
        assert_eq!(look(&mut wholes, 13, "", "KLMNOPPasted\n"), Some(Rule::Scrolled));
        assert_eq!(look(&mut wholes, 13, "", "KLMNOPPastex\n"), None);
        assert_eq!(wholes, 3);
        // a whole read that the deadline cut short, or that came after it, confirms nothing
        let cut = confirmed_before(
            |_: &mut (), _| Ok(Some((13, String::new()))),
            |_: &mut (), _| Ok(None),
            &mut (),
            &screen(),
            &mut Scrolled::default(),
            deadline,
        );
        assert_eq!(cut, None);
        let soon = Instant::now() + Duration::from_millis(30);
        let late = confirmed_before(
            |_: &mut (), _| Ok(Some((13, String::new()))),
            |_: &mut (), _| {
                std::thread::sleep(Duration::from_millis(50));
                Ok(Some("KLMNOPPasted\n".into()))
            },
            &mut (),
            &screen(),
            &mut Scrolled::default(),
            soon,
        );
        assert_eq!(late, None);
    }

    /// The scrolled rule's largest input (task 56, fix 4): a field of `WHOLE_LIMIT` characters in `WHOLE_LINES` rows of
    /// 128, the caret before VTE's closing newline, a paste of `pasted` characters, and the field read after it
    /// scrolled by all but its last row, so that every other row's start is a reading short of the paste to compare.
    /// `field` and `paste` give each position's character.
    fn maximal(pasted: usize, field: impl Fn(usize) -> char, paste: impl Fn(usize) -> char) -> (Expected, String) {
        let count = WHOLE_LIMIT as usize;
        let row = count / WHOLE_LINES;
        let at = count - 1;
        let text: String = (0..at).map(field).chain(['\n']).collect();
        let pasted: String = (0..pasted).map(paste).collect();
        let prefix = count - row;
        let after: String = text[prefix..at].chars().chain(pasted.chars()).chain(['\n']).collect();
        let expected = Expected {
            len: paste::offsets(&pasted, false),
            text: pasted,
            at: at as i32,
            feff_after_astral: false,
            count_before: count as i32,
            before: "\n".into(),
            whole: Some(paste::Whole {
                text,
                line_starts: (0..count).step_by(row).map(|start| start as i32).collect(),
            }),
        };
        (expected, after)
    }

    /// The thread's time on a CPU so far (`/proc/thread-self/schedstat`).
    fn cpu_time() -> Duration {
        let stat = std::fs::read_to_string("/proc/thread-self/schedstat").unwrap();
        Duration::from_nanos(stat.split_whitespace().next().unwrap().parse().unwrap())
    }

    /// The confirmation's looks as the route makes them (`dispatch_and_confirm`), every read the same: how many, whether
    /// one confirmed, the scrolled rule's part, and the thread's CPU time and the wall time they took.
    fn polled(expected: &Expected, after: &str) -> (u32, Option<Rule>, Scrolled, Duration, Duration) {
        let count = after.chars().count() as i32;
        let started = Instant::now();
        let deadline = started + paste::CONFIRM_WAIT;
        let cpu = cpu_time();
        let mut looks = 0;
        let mut scrolled = Scrolled::default();
        let rule = loop {
            looks += 1;
            let rule = confirmed_before(
                |_: &mut (), _| Ok(Some((count, String::new()))),
                |_: &mut (), _| Ok(Some(after.to_string())),
                &mut (),
                expected,
                &mut scrolled,
                deadline,
            );
            if rule.is_some() || Instant::now() >= deadline {
                break rule;
            }
            std::thread::sleep(paste::CONFIRM_POLL);
        };
        (looks, rule, scrolled, cpu_time() - cpu, started.elapsed())
    }

    /// The maximal input that confirms, its paste `pasted` characters long: every reading short of the paste reads as
    /// the field does until the paste's last character.
    fn maximal_confirming(pasted: usize) -> (Expected, String) {
        maximal(pasted, |_| 'a', |i| if i == pasted - 1 { 'b' } else { 'a' })
    }

    /// The maximal input that stays unconfirmed: the row start before the screen's last is a reading short of the paste
    /// that reads the same, and every earlier one meets the field's `b` first, later the earlier it starts.
    fn maximal_ambiguous() -> (Expected, String) {
        let b = WHOLE_LIMIT as usize - 2 * (WHOLE_LIMIT as usize / WHOLE_LINES) - 1;
        maximal(65_536, |i| if i == b { 'b' } else { 'a' }, |_| 'a')
    }

    /// The largest paste the route serves into the largest field observed whole, the read after it a field of the same
    /// size again, which cannot hold the paste whole (a terminal's screen after a long paste).
    fn maximal_field_largest_paste() -> (Expected, String) {
        let (expected, _) = maximal(crate::paste::MAX_TEXT_BYTES, |_| 'a', |_| 'a');
        (expected, "a".repeat(WHOLE_LIMIT as usize - 1) + "\n")
    }

    /// The scrolled rule's cost at the route's limits (`cargo test --release --bin cua-engine -- --ignored
    /// --nocapture the_scrolled_rule_s_cost`): one check, its largest single allocation, and, for the 64 KiB pastes,
    /// every look of a confirmation. The inputs: the 64 KiB paste that confirms after comparing every reading short of
    /// it almost to its end, and the one that stays unconfirmed; the paste that confirms raised to 4 MiB and to 64 MiB
    /// (`MAX_TEXT_BYTES`), its read holding it whole; and the 64 MiB paste whose read cannot hold it.
    #[test]
    #[ignore = "a measurement"]
    fn the_scrolled_rule_s_cost_at_the_route_s_limits() {
        let ms = |d: Duration| d.as_secs_f64() * 1e3;
        // each input: its name, how to make it, how many checks to time, and whether to run the confirmation's looks
        type Input = (&'static str, fn() -> (Expected, String), usize, bool);
        let inputs: [Input; 5] = [
            ("64 KiB, confirms", || maximal_confirming(65_536), 5, true),
            ("64 KiB, stays unconfirmed", maximal_ambiguous, 5, true),
            ("4 MiB, confirms", || maximal_confirming(4 << 20), 1, false),
            (
                "64 MiB, confirms",
                || maximal_confirming(crate::paste::MAX_TEXT_BYTES),
                1,
                false,
            ),
            ("64 MiB, the read a field again", maximal_field_largest_paste, 5, true),
        ];
        for (name, input, checks, poll) in inputs {
            let (expected, after) = input();
            let whole = expected.whole.as_ref().unwrap();
            let mut wall = Vec::new();
            let mut cpu = Vec::new();
            let mut largest = 0;
            let mut verdict = false;
            for _ in 0..checks {
                let (from, started) = (cpu_time(), Instant::now());
                let (answer, allocated) =
                    crate::alloc_watch::largest_allocation(|| expected.confirmed_scrolled(&after));
                wall.push(started.elapsed());
                cpu.push(cpu_time() - from);
                verdict = answer;
                largest = largest.max(allocated);
            }
            wall.sort();
            cpu.sort();
            let polls = if poll {
                let (looks, rule, scrolled, looks_cpu, looks_wall) = polled(&expected, &after);
                format!(
                    "; the confirmation: {looks} looks, {rule:?}, {} checks ({:.1} ms), {} unchanged, cpu {:.1} ms, \
                     wall {:.1} ms",
                    scrolled.checks,
                    ms(scrolled.check_time),
                    scrolled.unchanged,
                    ms(looks_cpu),
                    ms(looks_wall),
                )
            } else {
                String::new()
            };
            println!(
                "{name}: field {} chars in {} lines, paste {} chars, read {} chars; {checks} checks {verdict}: wall \
                 median {:.1} ms (min {:.1}, max {:.1}), cpu median {:.1} ms; largest allocation {} bytes{polls}",
                whole.text.chars().count(),
                whole.line_starts.len(),
                expected.text.chars().count(),
                after.chars().count(),
                ms(wall[checks / 2]),
                ms(wall[0]),
                ms(wall[checks - 1]),
                ms(cpu[checks / 2]),
                largest,
            );
        }
    }

    #[test]
    fn a_whole_read_the_scrolled_rule_left_unconfirmed_is_judged_once_while_it_reads_the_same() {
        let (expected, after) = maximal_ambiguous();
        let count = after.chars().count() as i32;
        let deadline = Instant::now() + Duration::from_secs(60);
        let look = |scrolled: &mut Scrolled, whole: &str| {
            confirmed_before(
                |_: &mut (), _| Ok(Some((count, String::new()))),
                |_: &mut (), _| Ok(Some(whole.to_string())),
                &mut (),
                &expected,
                scrolled,
                deadline,
            )
        };
        let mut scrolled = Scrolled::default();
        for _ in 0..10 {
            assert_eq!(look(&mut scrolled, &after), None);
        }
        assert_eq!((scrolled.checks, scrolled.unchanged), (1, 9));
        assert_eq!(scrolled.unconfirmed.as_deref(), Some(after.as_str()));
        // a read that differs is judged: the field scrolled by one row less, which only the whole paste explains (every
        // reading short of it still holds the field's `b`)
        let whole = &expected.whole.as_ref().unwrap().text;
        let row = WHOLE_LIMIT as usize / WHOLE_LINES;
        let one_row_less = whole[whole.len() - 2 * row..whole.len() - 1].to_string() + &expected.text + "\n";
        assert_eq!(look(&mut scrolled, &one_row_less), Some(Rule::Scrolled));
        assert_eq!((scrolled.checks, scrolled.unchanged), (2, 9));
    }
}
