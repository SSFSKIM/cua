//! `type_text` and `clipboard_write`: one verified paste route (Design, Text and clipboard), on the clipboard core
//! (`clipboard/`). It observes the field before it acts, focuses it only if needed, holds the display's clipboard lock
//! from the snapshot through the cleanup, revalidates the field and the desktop focus, sends the family's paste chord
//! once, confirms the inserted segment, and ends through the core's guarded cleanup on every path. The answer is
//! applied (success), not applied (a refusal before dispatch, or the chord rejected outright), or unconfirmed (anything
//! else after dispatch); nothing is ever sent a second time.
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
use super::windows::activate;
use crate::atspi::{self, Association};
use crate::clipboard::{Clipboard, Payload, TRANSFER_WAIT};
use crate::copy;
use crate::engine::DesktopMode;
use crate::families::{DEFAULT_PASTE, Kind, PasteRoute, When};
use crate::field::{self, Observation};
use crate::input::{chord_keycodes, focus_is_within};
use crate::paste::{self, CHANGED, Expected, Transfer, UNCONFIRMED};
use crate::route::{Route, Target};
use crate::tree::ObjRef;
use crate::wire::{ClipboardWriteInput, TypeTextInput, parse_input};
use crate::x11::X11;

/// How long a clicked element may take to report the focus, and the poll.
const FOCUS_WAIT: Duration = Duration::from_millis(500);
const FOCUS_POLL: Duration = Duration::from_millis(10);
/// How long an activated window may take to hold the X input focus (the foreground route).
const ACTIVATION_WAIT: Duration = Duration::from_secs(1);

const LOST: &str = "another program took the clipboard before the paste was sent; nothing was sent";
const UNKNOWN_HANDLE: &str = "unknown clipboard handle; copy again in this Linux helper";

/// Which route the chord takes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Way {
    /// `SendEvent` to the window, with the session's synthetic focus.
    Background,
    /// The window activated, then XTEST (dedicated mode, a family that ignores the background route).
    Foreground,
    /// XTEST into the focused client (no window named).
    Desktop,
}

impl Way {
    fn name(self) -> &'static str {
        match self {
            Way::Background => "background",
            Way::Foreground => "foreground",
            Way::Desktop => "desktop",
        }
    }
}

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
    clicked: bool,
    restored: Option<bool>,
    confirmed: bool,
    transfer: Option<&'static str>,
    requests: u32,
    attributed: u32,
    confirm_ms: Option<f64>,
    /// The field's text state when observed, and the offsets the confirmation reads.
    observed: Option<String>,
    expected: Option<(i32, i32)>,
    /// The requests the paste's owner saw: whose, which target atom, the outcome, the timestamp and when.
    log: Vec<String>,
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
        let mut report = Report::default();
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
                "observed": report.observed,
                "expected": report.expected,
                "log": report.log,
            }),
        );
        result
    }

    fn paste_with(&mut self, request: &Request, report: &mut Report) -> Result<Value> {
        // A conversion of an earlier unconfirmed paste may still come: nothing new is served meanwhile.
        if let Some(wait) = self.clipboard()?.current_time_refusal() {
            bail!(paste::previous_unconfirmed(wait));
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
        let ignored = match family.and_then(|f| f.ignores(Kind::Paste)) {
            Some(When::Always) => true,
            Some(When::UnlessUnobscured) => !self.x.unobscured(window),
            None => false,
        };
        let way = match (request.window, ignored, self.cfg.desktop) {
            (None, _, _) => Way::Desktop,
            (Some(_), false, _) => Way::Background,
            (Some(_), true, DesktopMode::Dedicated) => Way::Foreground,
            (Some(_), true, DesktopMode::Shared) => bail!(paste::no_background_input(&info.app)),
        };
        self.extra.insert(
            "paste_route".into(),
            json!({"way": way.name(), "family": family.map(|f| f.name), "chord": chord}),
        );
        let keycodes = chord_keycodes(&self.x, chord)?;
        if way == Way::Foreground {
            activate(&self.x, window)?;
            let deadline = Instant::now() + ACTIVATION_WAIT;
            while !focus_is_within(&self.x, window)? {
                if Instant::now() >= deadline {
                    bail!("window {window} did not take the input focus when activated; nothing was sent");
                }
                std::thread::sleep(FOCUS_POLL);
            }
        }
        // The element: the one named, resolved with its ancestors for the focusing click's point; else the window's
        // focused element, looked for once the session's synthetic focus is in (a background Chrome reports its
        // address bar focused only then).
        let named = match &request.element_id {
            Some(id) => Ok(self.resolve_element(window, id)?),
            None => Err(self
                .with_bus(|bus, x| {
                    Ok(match atspi::associate(bus, x, &info)? {
                        Association::Frame(frame) => Ok(frame),
                        Association::NoMatch => Err("window has no AT-SPI accessibility tree".to_string()),
                        Association::Refused(sentence) => Err(sentence),
                    })
                })?
                .map_err(anyhow::Error::msg)?),
        };
        let feff = family.is_some_and(|f| f.feff_after_astral);
        let target = match way {
            Way::Background => Target::Window(window),
            Way::Foreground | Way::Desktop => Target::Desktop,
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
        inputs.with_route(x, target, |x, route, _| {
            let (element, named) = match &named {
                Ok(element) => (element.clone(), true),
                Err(frame) => {
                    let focused = copy::focused(bus, frame)?.ok_or_else(|| {
                        anyhow!("window {window} has no focused element to paste into; nothing was sent")
                    })?;
                    let element = Element {
                        info: info.clone(),
                        target: focused,
                        ancestors: Vec::new(),
                    };
                    (element, false)
                }
            };
            // 1. Observe.
            let mut seen = observe(bus, &element.target)?;
            if named && !seen.editable {
                bail!("element is not editable; refresh get_window_state() and choose an editable element");
            }
            // 2. Focus only if needed, then put back the caret or selection the click moved.
            if named && !seen.focused {
                let (rx, ry) = visible_point(bus, &element, "typing")?;
                route.place(x, rx, ry)?;
                route.button(x, 1, true)?;
                std::thread::sleep(CLICK_HOLD);
                route.button(x, 1, false)?;
                report.clicked = true;
                let deadline = Instant::now() + FOCUS_WAIT;
                let mut after = observe(bus, &element.target)?;
                while !after.focused && Instant::now() < deadline {
                    std::thread::sleep(FOCUS_POLL);
                    after = observe(bus, &element.target)?;
                }
                if !after.focused {
                    bail!("element did not take the focus when clicked; nothing was sent");
                }
                if let Some(before) = &seen.text {
                    report.restored = Some(field::restore(bus, &element.target, before)?);
                }
                seen = observe(bus, &element.target)?;
            }
            if !seen.focused {
                bail!(CHANGED);
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
                    field::read(bus, &element.target, at, len)?.map(|(_, before)| Expected {
                        text: text.to_string(),
                        at,
                        len,
                        feff_after_astral: feff,
                        count_before: state.count,
                        before,
                    })
                }
                None => None,
            };
            report.observed = Some(format!("{:?}", seen.text));
            report.expected = expected.as_ref().map(|e| (e.at, e.len));
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
            };
            dispatch_and_confirm(x, route, bus, clipboard, field, delivery, report)
        })?;
        Ok(Value::Null)
    }
}

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
}

/// Steps 3 to 6: the lock, the snapshot and the ownership; the revalidation; the chord, once; the confirmation and
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
    if !desktop_focus_holds(x, route, window)? {
        bail!(CHANGED);
    }
    // 3. Lock, snapshot, own. The lock is released after the paste's cleanup (dropped in reverse order).
    let _lock = clipboard.lock()?;
    let restore = clipboard
        .snapshot()
        .map_err(|e| anyhow!(paste::nothing_sent(format!("{e:#}"))))?;
    let pasted = clipboard
        .take(delivery.payload.clone(), restore)
        .map_err(|e| anyhow!(paste::nothing_sent(format!("{e:#}"))))?;
    // 4. Revalidate, then dispatch once.
    if observe(bus, &element.target)? != seen || !desktop_focus_holds(x, route, window)? {
        pasted.settled();
        bail!(CHANGED);
    }
    if pasted.lost() {
        pasted.settled();
        bail!(LOST);
    }
    let time = match route.session() {
        Some(session) => session.now(),
        None => clipboard.server_time()?,
    };
    pasted.dispatched(time);
    // Before the press goes out, so a request the press causes is never earlier than it.
    let dispatched_at = Instant::now();
    let held = match route.acquire(x, delivery.keycodes) {
        Ok(held) => held,
        Err(error) => {
            // The X server refused the chord's press: nothing reached the window.
            pasted.settled();
            bail!("the X server refused the paste chord ({error:#}); nothing was pasted");
        }
    };
    // A release that fails after the press went out changes nothing about what was sent: the answer is the field's.
    let _ = route.release(x, &held);
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
            && let Ok(Some((count, read))) = field::read(bus, &element.target, e.at, e.len)
            && e.confirmed_by(count, &read)
        {
            report.confirmed = true;
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
            let at = s.at.saturating_duration_since(dispatched_at).as_millis();
            format!("{whose} {} {:?} t{} +{at}ms", s.target, s.outcome, s.time)
        })
        .collect();
    report.transfer = Some(match transfer {
        Transfer::Open => "open",
        Transfer::Served => "served",
        Transfer::Ended => "ended",
    });
    // 6. Answer, after the cleanup.
    if report.confirmed {
        pasted.confirmed();
        return Ok(());
    }
    if transfer == Transfer::Served {
        pasted.settled();
    } else {
        drop(pasted);
    }
    bail!(UNCONFIRMED)
}
