//! The accessibility side (behaviour §4, §6, §7, §19): finding the bus, associating an X11 window with its
//! AT-SPI frame, resolving element ids, and element actions.

use std::collections::HashMap;

use anyhow::{Result, anyhow, bail};

use crate::dbus::{Arg, Bus, CallResult, MethodCall, Value};
use crate::identity::{self, By, Placement, Rect, Seen, TieBreak};
use crate::tree::{self, Field, ObjRef, Transport};
use crate::x11::{WindowInfo, X11};

const REGISTRY: &str = "org.a11y.atspi.Registry";
const ROOT_PATH: &str = "/org/a11y/atspi/accessible/root";
const ACCESSIBLE: &str = "org.a11y.atspi.Accessible";
const PROPERTIES: &str = "org.freedesktop.DBus.Properties";

/// The bus as a tree-read transport.
impl Transport for Bus {
    fn send(&mut self, obj: &ObjRef, field: Field) -> Result<u32> {
        tree::with_call(obj, field, |call| Bus::send(self, call))
    }

    fn recv(&mut self) -> Result<(u32, CallResult)> {
        Bus::recv(self)
    }

    fn try_recv(&mut self) -> Result<Option<(u32, CallResult)>> {
        Bus::try_recv(self)
    }

    fn in_flight(&self) -> usize {
        Bus::in_flight(self)
    }

    fn staged_bytes(&self) -> usize {
        Bus::staged_bytes(self)
    }
}

/// The accessibility bus address: the root window's `AT_SPI_BUS` property, else `org.a11y.Bus.GetAddress` on the
/// session bus (`$DBUS_SESSION_BUS_ADDRESS`, else `unix:path=$XDG_RUNTIME_DIR/bus`), behaviour §19.
pub fn bus_address(x: &X11) -> Result<String> {
    if let Some(address) = x.at_spi_bus_address() {
        return Ok(address);
    }
    let session = match std::env::var("DBUS_SESSION_BUS_ADDRESS") {
        Ok(address) => address,
        Err(_) => match std::env::var("XDG_RUNTIME_DIR") {
            Ok(dir) => format!("unix:path={dir}/bus"),
            Err(_) => bail!("AT-SPI accessibility bus is unavailable"),
        },
    };
    let mut bus = Bus::connect(&session)?;
    let reply = bus
        .call(&MethodCall {
            dest: "org.a11y.Bus",
            path: "/org/a11y/bus",
            iface: "org.a11y.Bus",
            member: "GetAddress",
            args: &[],
        })?
        .map_err(|e| anyhow!(e))?;
    match reply.first() {
        Some(Value::Str(address)) => Ok(address.clone()),
        _ => bail!("AT-SPI bus did not return a socket address"),
    }
}

fn first_str(result: &CallResult) -> Option<String> {
    match result.as_ref().ok()?.first()?.unvariant() {
        Value::Str(s) => Some(s.clone()),
        _ => None,
    }
}

fn refs_of(result: &CallResult) -> std::result::Result<Vec<ObjRef>, String> {
    let values = result.as_ref().map_err(Clone::clone)?;
    let Some(Value::Array(items)) = values.first() else {
        return Err("AT-SPI GetChildren did not return object references".into());
    };
    Ok(items
        .iter()
        .filter_map(|item| match item {
            Value::Struct(parts) => match parts.as_slice() {
                [Value::Str(bus), Value::Path(path)] => Some(ObjRef {
                    bus: bus.clone(),
                    path: path.clone(),
                }),
                _ => None,
            },
            _ => None,
        })
        .collect())
}

fn children_call(obj: &ObjRef) -> MethodCall<'_> {
    MethodCall {
        dest: &obj.bus,
        path: &obj.path,
        iface: ACCESSIBLE,
        member: "GetChildren",
        args: &[],
    }
}

const NAME_ARGS: [Arg<'static>; 2] = [Arg::Str(ACCESSIBLE), Arg::Str("Name")];

fn name_call(obj: &ObjRef) -> MethodCall<'_> {
    MethodCall {
        dest: &obj.bus,
        path: &obj.path,
        iface: PROPERTIES,
        member: "Get",
        args: &NAME_ARGS,
    }
}

/// Sends `calls` together and returns their results in order.
pub fn call_all(bus: &mut Bus, calls: &[MethodCall]) -> Result<Vec<CallResult>> {
    let serials = calls.iter().map(|c| bus.send(c)).collect::<Result<Vec<u32>>>()?;
    let mut results: HashMap<u32, CallResult> = HashMap::new();
    while results.len() < serials.len() {
        let (serial, result) = bus.recv()?;
        results.insert(serial, result);
    }
    Ok(serials.iter().map(|s| results.remove(s).unwrap()).collect())
}

/// The `Application.ToolkitName` and `Version` (the toolkit's) of a process's accessible application (the first the
/// registry lists for the PID), or None when the process has none on the bus or the name cannot be read
/// (`families.rs`).
pub fn toolkit_of(bus: &mut Bus, pid: u32) -> Result<Option<crate::families::Toolkit>> {
    let registry = ObjRef {
        bus: REGISTRY.into(),
        path: ROOT_PATH.into(),
    };
    let Ok(apps) = refs_of(&bus.call(&children_call(&registry))?) else {
        return Ok(None);
    };
    let pid_args: Vec<[Arg; 1]> = apps.iter().map(|app| [Arg::Str(&app.bus)]).collect();
    let pid_calls: Vec<MethodCall> = pid_args
        .iter()
        .map(|args| MethodCall {
            dest: "org.freedesktop.DBus",
            path: "/org/freedesktop/DBus",
            iface: "org.freedesktop.DBus",
            member: "GetConnectionUnixProcessID",
            args,
        })
        .collect();
    let pids = call_all(bus, &pid_calls)?;
    let Some(app) = apps
        .iter()
        .zip(&pids)
        .find(|(_, r)| matches!(r.as_ref().ok().and_then(|v| v.first()), Some(Value::U32(p)) if *p == pid))
        .map(|(a, _)| a)
    else {
        return Ok(None);
    };
    const NAME: [Arg<'static>; 2] = [Arg::Str("org.a11y.atspi.Application"), Arg::Str("ToolkitName")];
    const VERSION: [Arg<'static>; 2] = [Arg::Str("org.a11y.atspi.Application"), Arg::Str("Version")];
    let get = |args| MethodCall {
        dest: &app.bus,
        path: &app.path,
        iface: PROPERTIES,
        member: "Get",
        args,
    };
    let results = call_all(bus, &[get(&NAME), get(&VERSION)])?;
    Ok(first_str(&results[0]).map(|name| crate::families::Toolkit {
        name,
        version: first_str(&results[1]),
    }))
}

/// What association concluded (behaviour §4): a frame with the proof that found it, one of the vendor's own failures,
/// or what cua's own routes answer when they find no frame.
pub enum Association {
    Frame(Associated),
    /// No frame of the title or `WM_NAME` (and none by the caption): a read answers the vendor's X11 tree, any other
    /// request `window has no AT-SPI accessibility tree`.
    NoMatch(Fallback),
    /// The vendor's other failures, with their sentence (behaviour §4): a read answers the X11 tree.
    Refused(String, Fallback),
    /// Once association has entered one of cua's own routes (duplicates told apart, or the caption): duplicates
    /// nothing tells apart, a frame whose evidence changed before it was accepted, or an error on the way. Every
    /// request answers it, an observation's included, never with the X11 fallback (Design, Window association; M4's
    /// T5; F5).
    Identity(Unassociated),
}

/// Leave to answer a state read with the vendor's one-node X11 tree (`X11::fallback_tree` takes one). Only the
/// vendor's own failures make one: none of cua's own association routes ever does, whatever follows, so a window whose
/// association met duplicates can never end in a tree that looks like an empty window (F5; Acceptance 7).
#[derive(Debug)]
pub struct Fallback(());

impl Fallback {
    /// For an error the vendor's own steps raised (no bus, a broken connection, a failed call before any route of cua's
    /// own): the vendor answers it with the X11 tree. cua's own routes never return an error to be taken for one of
    /// these: they answer [`Association::Identity`] instead, and a read on their frame refuses (`engine.rs`).
    pub fn after_vendor_error() -> Fallback {
        Fallback(())
    }
}

/// Why one of cua's own routes found no frame it can stand behind.
#[derive(Debug)]
pub enum Unassociated {
    /// Several frames match the window and nothing tells them apart (`identity.rs`).
    Duplicates(u32),
    /// The evidence that told the frame apart changed while it was being associated or read: a retry may succeed.
    Changed(u32),
    /// An error on the way, answered as itself.
    Failed(anyhow::Error),
}

impl Unassociated {
    pub fn into_error(self) -> anyhow::Error {
        match self {
            Unassociated::Duplicates(window) => anyhow!(identity::duplicates_sentence(window)),
            Unassociated::Changed(window) => anyhow!(identity_changed(window)),
            Unassociated::Failed(error) => error,
        }
    }

    /// The `--stats` tree record's `identity` for a read that ends here.
    pub fn name(&self) -> &'static str {
        match self {
            Unassociated::Duplicates(_) => "duplicates",
            Unassociated::Changed(_) => "changed",
            Unassociated::Failed(_) => "failed",
        }
    }
}

/// Runs one of cua's own association routes: an error on it is the route's answer, never an error the caller could
/// take for one of the vendor's (which fall back).
fn own_route(route: impl FnOnce() -> Result<Association>) -> Association {
    route().unwrap_or_else(|error| Association::Identity(Unassociated::Failed(error)))
}

/// A window's frame with what found it, carried from the association to every effect the request makes, so the
/// association can be confirmed again just before each one.
#[derive(Debug, Clone)]
pub struct Associated {
    pub frame: ObjRef,
    pub told: Told,
    window: u32,
}

impl Associated {
    /// Whether one of cua's own routes found the frame: duplicates told apart, or the caption.
    fn own_route(&self) -> bool {
        self.told != Told::Title
    }

    /// Leave for the X11 fallback when the frame's tree cannot be read: only on the vendor's own match.
    pub fn fallback(&self) -> Option<Fallback> {
        (!self.own_route()).then_some(Fallback(()))
    }

    /// Whether the window's association still names this frame, on what the server and the bus say now. Run just
    /// before each effect of a request (an element action, the right click, the element scroll, the Copy's `CopyText`
    /// (its context menu is refused on these routes, `context_menu_refusal`), a paste's focusing clicks, its selection
    /// restore and its chord) and after a read, so a frame chosen on evidence that has since changed (an `active` state the toolkit corrected) neither receives the effect nor answers the read. The
    /// whole association is run again and must name the same frame. The vendor's own match is confirmed by nothing:
    /// it is the only frame of the title, with no sibling of it, and the vendor's path stays as it is. What is left
    /// open is the gap between the last confirmation and the effect itself.
    pub fn confirm(&self, bus: &mut Bus, x: &mut X11) -> Result<bool> {
        if !self.own_route() {
            return Ok(true);
        }
        #[cfg(test)]
        crate::fault::identity(crate::fault::Identity::Confirm);
        let Ok(info) = x.get_window(self.window) else {
            return Ok(false);
        };
        match associate(bus, x, &info)? {
            Association::Frame(again) => Ok(again.frame == self.frame),
            Association::Identity(Unassociated::Failed(error)) => Err(error),
            _ => Ok(false),
        }
    }

    /// Why the Copy may not go through a context menu for this window, on one of cua's own routes. The route finds
    /// the menu it opened as a new child of the application, not of the window: Chrome's (the elements that take this
    /// route) is a frame under the application root with no relation to the element or the browser frame, and its X11
    /// menu window names no `WM_TRANSIENT_FOR` (evidence `m4/identity/probes/menu-ownership/`). A menu found after this
    /// window's Copy opened one may therefore be a same-title duplicate's, opened meanwhile, which no confirmation of
    /// this window's association can tell, and its Copy would copy that window's selection as this one's. The vendor's
    /// own match keeps the vendor's route.
    pub fn context_menu_refusal(&self) -> Option<String> {
        let how = match self.told {
            Told::Title => return None,
            Told::Position => "its position among same-title duplicates",
            Told::Active => "its active state among same-title duplicates",
            Told::Caption => "its caption",
        };
        Some(format!(
            "the focused element of X11 window {} copies only through a context menu, and a context menu cannot be \
             shown to belong to this window, whose accessibility frame was found by {how}; nothing was sent",
            self.window
        ))
    }

    /// `confirm`, as an effect's refusal: the sentence that nothing was sent.
    pub fn confirm_before_acting(&self, bus: &mut Bus, x: &mut X11) -> Result<()> {
        if !self.confirm(bus, x)? {
            bail!(changed_before_acting(self.window));
        }
        Ok(())
    }
}

/// The sentence for a request refused because its window's association changed after some of its input was sent
/// (`sent` says what it was and what was not): not safe to repeat blind, so the window is to be read first.
pub fn changed_after_input(window: u32, sent: &str) -> String {
    format!(
        "window identity changed during the request for X11 window {window}; {sent}, so read the window before retrying"
    )
}

/// The sentence for a request refused because its window's association changed before any of its input was sent.
pub fn changed_before_acting(window: u32) -> String {
    format!(
        "window identity changed during the request for X11 window {window}; nothing was sent, so it is safe to retry"
    )
}

/// How association found a window's frame.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Told {
    /// The vendor's own match: the one frame of the title, or the one of the X11 size.
    Title,
    /// Among same-title duplicates, the one frame at the window's place (`identity::tie_break`).
    Position,
    /// Among same-title duplicates stacked on one place, the one `active` frame of the active window: a state the
    /// toolkit may update a moment after the activation, so a read checks it again once it has read the tree.
    Active,
    /// No frame of the title, and the one frame of the process named for the title's caption, at the window's place:
    /// kate's frame (`identity::caption`).
    Caption,
}

impl Told {
    pub fn name(self) -> &'static str {
        match self {
            Told::Title => "title",
            Told::Position => "position",
            Told::Active => "active",
            Told::Caption => "caption",
        }
    }
}

/// Whether an application's frames report their extents in screen coordinates (`identity::screen_extents`): GTK 4's
/// are relative to the window (M0.4), and an unmeasured toolkit's are not trusted, so neither a position nor the
/// caption rule can stand on them.
fn screen_extents(bus: &mut Bus, app: &ObjRef) -> Result<bool> {
    const NAME: [Arg<'static>; 2] = [Arg::Str("org.a11y.atspi.Application"), Arg::Str("ToolkitName")];
    const VERSION: [Arg<'static>; 2] = [Arg::Str("org.a11y.atspi.Application"), Arg::Str("Version")];
    let get = |args| MethodCall {
        dest: &app.bus,
        path: &app.path,
        iface: PROPERTIES,
        member: "Get",
        args,
    };
    let results = call_all(bus, &[get(&NAME), get(&VERSION)])?;
    let toolkit = first_str(&results[0]).map(|name| crate::families::Toolkit {
        name,
        version: first_str(&results[1]),
    });
    Ok(identity::screen_extents(toolkit.as_ref()))
}

/// Where an X11 window is (`identity::Placement`): its described client rectangle and its window manager's frame.
fn placement(x: &X11, info: &WindowInfo) -> Placement {
    let client = Rect {
        x: info.x.into(),
        y: info.y.into(),
        width: info.width.into(),
        height: info.height.into(),
    };
    Placement::new(client, x.frame_extents(info.id))
}

const SCREEN: [Arg<'static>; 1] = [Arg::U32(0)];

fn extents_call(obj: &ObjRef) -> MethodCall<'_> {
    MethodCall {
        dest: &obj.bus,
        path: &obj.path,
        iface: "org.a11y.atspi.Component",
        member: "GetExtents",
        args: &SCREEN,
    }
}

fn state_call(obj: &ObjRef) -> MethodCall<'_> {
    MethodCall {
        dest: &obj.bus,
        path: &obj.path,
        iface: ACCESSIBLE,
        member: "GetState",
        args: &[],
    }
}

/// AT-SPI's `ACTIVE` state, bit 1 of `GetState`'s first word: not among the vendor's state names (the tree's
/// `states` never carry it), so it is read from the words themselves.
const ACTIVE_BIT: u32 = 1 << 1;

/// Whether a `GetState` reply says `active`; a failed or malformed reply says not.
fn is_active(result: &CallResult) -> bool {
    let Ok(values) = result else { return false };
    match values.first() {
        Some(Value::Array(words)) => {
            matches!(words.as_slice(), [Value::U32(low), Value::U32(_)] if low & ACTIVE_BIT != 0)
        }
        _ => false,
    }
}

/// Whether a frame's states include `active` now (`focus_ack.rs`): one `GetState`; a failed or malformed reply reads
/// not active, and only a broken connection is an error.
pub fn frame_active(bus: &mut Bus, frame: &ObjRef) -> Result<bool> {
    Ok(is_active(&bus.call(&state_call(frame))?))
}

fn rect_of(result: &CallResult) -> Option<Rect> {
    crate::table::extents_of(result).ok().map(Rect::from_corners)
}

/// A frame matched by name: its object, its Name and the index of its application in the process's list.
type Named = (ObjRef, String, usize);

/// Tells same-title duplicates apart (`identity::tie_break`): the frame and how, or None when nothing does, which a
/// provider without screen extents (GTK 4) always is. Its extents and states are read together, one round trip.
fn tell_apart(
    bus: &mut Bus,
    x: &X11,
    info: &WindowInfo,
    apps: &[&ObjRef],
    candidates: &[&Named],
    siblings: &[WindowInfo],
) -> Result<Option<(Named, Told, Rect)>> {
    let mut asked = Vec::new();
    for (_, _, app) in candidates {
        if !asked.contains(app) {
            asked.push(*app);
            if !screen_extents(bus, apps[*app])? {
                return Ok(None);
            }
        }
    }
    let calls: Vec<MethodCall> = candidates
        .iter()
        .flat_map(|(frame, _, _)| [extents_call(frame), state_call(frame)])
        .collect();
    let results = call_all(bus, &calls)?;
    let seen: Vec<Seen> = results
        .chunks(2)
        .map(|pair| Seen {
            extents: rect_of(&pair[0]),
            active: is_active(&pair[1]),
        })
        .collect();
    let target = placement(x, info);
    let places: Vec<Placement> = siblings.iter().map(|s| placement(x, s)).collect();
    Ok(match identity::tie_break(&seen, &target, &places, info.focused) {
        TieBreak::Frame(i, by) => Some((
            candidates[i].clone(),
            match by {
                By::Position => Told::Position,
                By::Active => Told::Active,
            },
            seen[i].extents.expect("a frame at the window's place has extents"),
        )),
        TieBreak::Several => None,
    })
}

/// The caption rule (kate, M0.4): where no frame of the process is named for the window's title, the one frame whose
/// trimmed Name is the title's caption (`identity::caption`), when it is the only such frame of the process, its
/// application reports screen extents, and they put it at the window (`identity::caption_holds`). None otherwise: no
/// match, as before.
fn by_caption(
    bus: &mut Bus,
    x: &X11,
    info: &WindowInfo,
    apps: &[&ObjRef],
    frames: &[Named],
) -> Result<Option<(Named, Rect)>> {
    let Some(caption) = info.title.as_deref().and_then(identity::caption) else {
        return Ok(None);
    };
    let named: Vec<&Named> = frames
        .iter()
        .filter(|(_, n, _)| identity::names_caption(n, caption))
        .collect();
    let [only] = named.as_slice() else {
        return Ok(None);
    };
    let screen = screen_extents(bus, apps[only.2])?;
    let at = rect_of(&bus.call(&extents_call(&only.0))?);
    Ok(identity::caption_holds(&placement(x, info), screen, at).then(|| ((*only).clone(), at.expect("held"))))
}

/// The window being associated, as association first described it: what re-verification compares with.
struct Subject<'a> {
    info: &'a WindowInfo,
    pid: u32,
    title: Option<String>,
    wm_name: Option<String>,
}

/// Associates X11 window `window` (already described as `info`) with its AT-SPI frame, step by step as the vendor
/// does, sending independent calls together. The vendor's steps answer its failures with leave for the X11 fallback,
/// and an error on them is the vendor's too. Once one of cua's own routes is entered (duplicates of the title, or the
/// caption where no frame has the title), it answers a frame or [`Association::Identity`], never an error and never
/// leave for the fallback.
pub fn associate(bus: &mut Bus, x: &mut X11, info: &WindowInfo) -> Result<Association> {
    let id = info.id;
    let refused = |sentence: String| Ok(Association::Refused(sentence, Fallback(())));
    let Some(pid) = x.pid(id) else {
        return refused(format!("X11 window {id} has no usable _NET_WM_PID"));
    };
    let subject = Subject {
        info,
        pid,
        title: info.title.clone(),
        wm_name: x.wm_name(id),
    };

    let registry = ObjRef {
        bus: REGISTRY.into(),
        path: ROOT_PATH.into(),
    };
    let apps = match refs_of(&bus.call(&children_call(&registry))?) {
        Ok(apps) => apps,
        Err(error) => return refused(error),
    };
    let pid_args: Vec<[Arg; 1]> = apps.iter().map(|app| [Arg::Str(&app.bus)]).collect();
    let pid_calls: Vec<MethodCall> = pid_args
        .iter()
        .map(|args| MethodCall {
            dest: "org.freedesktop.DBus",
            path: "/org/freedesktop/DBus",
            iface: "org.freedesktop.DBus",
            member: "GetConnectionUnixProcessID",
            args,
        })
        .collect();
    let pids = call_all(bus, &pid_calls)?;
    let matching: Vec<&ObjRef> = apps
        .iter()
        .zip(&pids)
        .filter(|(_, r)| matches!(r.as_ref().ok().and_then(|v| v.first()), Some(Value::U32(p)) if *p == pid))
        .map(|(a, _)| a)
        .collect();
    if matching.is_empty() {
        return refused(format!(
            "AT-SPI provider with process ID {pid} is unavailable for X11 window {id}"
        ));
    }
    let mut frames: Vec<Named> = Vec::new();
    for (index, app) in matching.iter().enumerate() {
        let children = match refs_of(&bus.call(&children_call(app))?) {
            Ok(children) => children,
            Err(error) => return refused(error),
        };
        let calls: Vec<MethodCall> = children.iter().map(name_call).collect();
        for (child, result) in children.iter().zip(call_all(bus, &calls)?) {
            match first_str(&result) {
                Some(name) => frames.push((child.clone(), name, index)),
                None => return refused("AT-SPI window identity is unavailable".into()),
            }
        }
    }
    let same = |a: &str, b: &str| a.len() == b.len() && a.eq_ignore_ascii_case(b);
    let by_title: Vec<&Named> = match &subject.title {
        Some(t) => frames.iter().filter(|(_, n, _)| same(n, t)).collect(),
        None => frames.iter().collect(),
    };
    let by_wm_name: Vec<&Named> = match &subject.wm_name {
        Some(t) => frames.iter().filter(|(_, n, _)| same(n, t)).collect(),
        None => Vec::new(),
    };
    let candidates = if by_title.is_empty() { by_wm_name } else { by_title };
    if candidates.is_empty() {
        return Ok(own_route(|| match by_caption(bus, x, info, &matching, &frames)? {
            Some((frame, at)) => verify(bus, x, &subject, frame, Told::Caption, None, Some(at)),
            None => Ok(Association::NoMatch(Fallback(()))),
        }));
    }
    pick(bus, x, &subject, &matching, &candidates)
}

/// `associate` for a request that acts on the window: its frame with the proof, or the sentence that refuses it (a
/// request that acts never falls back). An error on cua's own routes is the request's error.
pub fn associated(bus: &mut Bus, x: &mut X11, info: &WindowInfo) -> Result<std::result::Result<Associated, String>> {
    Ok(match associate(bus, x, info)? {
        Association::Frame(associated) => Ok(associated),
        Association::NoMatch(_) => Err("window has no AT-SPI accessibility tree".to_string()),
        Association::Refused(sentence, _) => Err(sentence),
        Association::Identity(Unassociated::Failed(error)) => return Err(error),
        Association::Identity(unassociated) => Err(unassociated.into_error().to_string()),
    })
}

/// Behaviour §4 steps 6–7, the vendor's decision among the frames named for the title, except where it gives up on
/// duplicates (a sibling of the same title and size, or several frames of the X11 size), which `duplicates` decides.
fn pick(bus: &mut Bus, x: &mut X11, subject: &Subject, apps: &[&ObjRef], candidates: &[&Named]) -> Result<Association> {
    let info = subject.info;
    let (id, pid) = (info.id, subject.pid);

    // Same-title X11 siblings: another listed window of the same process whose title or WM_NAME is the first
    // candidate's Name.
    let first_name = candidates[0].1.clone();
    let mut siblings = Vec::new();
    for other in x.list_windows()? {
        if other.id == id {
            continue;
        }
        let other_pid = x.pid_any(other.id);
        if matches!(other_pid, Some(p) if p != pid) {
            continue;
        }
        let matches_title = subject.title.is_none()
            || other
                .title
                .as_deref()
                .is_some_and(|t| t.eq_ignore_ascii_case(&first_name))
            || x.wm_name(other.id).is_some_and(|t| t.eq_ignore_ascii_case(&first_name));
        if matches_title {
            siblings.push(other);
        }
    }
    let ambiguous = |reason: String| {
        Ok(Association::Refused(
            format!("ambiguous AT-SPI window identity for X11 window {id}: {reason}"),
            Fallback(()),
        ))
    };
    if candidates.len() == 1 && siblings.is_empty() {
        return verify(bus, x, subject, candidates[0].clone(), Told::Title, None, None);
    }
    if subject.title.is_none() {
        return ambiguous(format!(
            "multiple windows in process {pid} match the available identity"
        ));
    }
    // the vendor's "X11 window <sibling> has the same title and size": duplicates
    if siblings
        .iter()
        .any(|s| s.width == info.width && s.height == info.height)
    {
        return Ok(duplicates(bus, x, subject, apps, candidates, &siblings));
    }
    let mut kept = Vec::new();
    for candidate in candidates {
        match size_of(bus, &candidate.0)? {
            Ok((w, h)) if w == info.width as i32 && h == info.height as i32 => kept.push(*candidate),
            Ok(_) => {}
            Err(cause) => return ambiguous(format!("window size is unavailable: {cause}")),
        }
    }
    match kept.as_slice() {
        [only] => verify(
            bus,
            x,
            subject,
            (*only).clone(),
            Told::Title,
            Some((info.width, info.height)),
            None,
        ),
        [] => ambiguous("matching titles do not have one matching size".into()),
        // the vendor's "matching titles do not have one matching size" with several of the size: duplicates
        several => Ok(duplicates(bus, x, subject, apps, several, &siblings)),
    }
}

/// cua's own route where the vendor gives up on duplicates: the frame `tell_apart` finds, re-verified, or the
/// duplicates sentence.
fn duplicates(
    bus: &mut Bus,
    x: &mut X11,
    subject: &Subject,
    apps: &[&ObjRef],
    candidates: &[&Named],
    siblings: &[WindowInfo],
) -> Association {
    own_route(|| match tell_apart(bus, x, subject.info, apps, candidates, siblings)? {
        Some((frame, by, at)) => verify(bus, x, subject, frame, by, None, Some(at)),
        None => Ok(Association::Identity(Unassociated::Duplicates(subject.info.id))),
    })
}

/// The sentence for a window whose identity changed while it was being associated (behaviour §4 step 8).
pub fn identity_changed(window: u32) -> String {
    format!("window identity changed while resolving X11 window {window}; retry the operation")
}

/// Re-verification before a frame is accepted (behaviour §4 step 8): the window's title, PID and `WM_NAME`, the X11
/// size and the frame's size where the size decided, the window's place and the frame's extents where the place did,
/// the window still active and its frame still `active` where the active state did, and the frame's Name, each as it
/// was. Any change is `window identity changed while resolving X11 window <id>; retry the operation`: on the vendor's
/// own match its refusal, which a read answers with the X11 tree as the vendor does; on cua's own routes
/// [`Unassociated::Changed`], which every request answers as an error.
fn verify(
    bus: &mut Bus,
    x: &mut X11,
    subject: &Subject,
    frame: Named,
    told: Told,
    size_used: Option<(u16, u16)>,
    extents_used: Option<Rect>,
) -> Result<Association> {
    #[cfg(test)]
    crate::fault::identity(crate::fault::Identity::Verify);
    let info = subject.info;
    let id = info.id;
    let changed = || {
        Ok(if told == Told::Title {
            Association::Refused(identity_changed(id), Fallback(()))
        } else {
            Association::Identity(Unassociated::Changed(id))
        })
    };
    let again = match x.get_window(id) {
        Ok(again) => again,
        Err(_) => return changed(),
    };
    if again.title != info.title || x.pid(id) != Some(subject.pid) || x.wm_name(id) != subject.wm_name {
        return changed();
    }
    if let Some((w, h)) = size_used
        && (again.width != w
            || again.height != h
            || !matches!(size_of(bus, &frame.0)?, Ok((sw, sh)) if sw == w as i32 && sh == h as i32))
    {
        return changed();
    }
    if let Some(at) = extents_used
        && ((again.x, again.y, again.width, again.height) != (info.x, info.y, info.width, info.height)
            || rect_of(&bus.call(&extents_call(&frame.0))?) != Some(at))
    {
        return changed();
    }
    if told == Told::Active && (!again.focused || !is_active(&bus.call(&state_call(&frame.0))?)) {
        return changed();
    }
    if first_str(&bus.call(&name_call(&frame.0))?).as_deref() != Some(frame.1.as_str()) {
        return changed();
    }
    Ok(Association::Frame(Associated {
        frame: frame.0,
        told,
        window: id,
    }))
}

/// `Component.GetSize`: two int32 > 0.
fn size_of(bus: &mut Bus, obj: &ObjRef) -> Result<std::result::Result<(i32, i32), String>> {
    let result = bus.call(&MethodCall {
        dest: &obj.bus,
        path: &obj.path,
        iface: "org.a11y.atspi.Component",
        member: "GetSize",
        args: &[],
    })?;
    Ok(match result {
        Ok(values) => match values.as_slice() {
            [Value::I32(w), Value::I32(h)] if *w > 0 && *h > 0 => Ok((*w, *h)),
            _ => Err("AT-SPI window did not return a valid size".into()),
        },
        Err(error) => Err(error),
    })
}

// ---------------------------------------------------------------------------------------------------------------
// Element resolution and actions (behaviour §6.2, §7.1, §7.2)

/// The element's action names, or the sentence for why they cannot be read (behaviour §7.1 step 2).
pub fn action_names(bus: &mut Bus, obj: &ObjRef) -> Result<std::result::Result<Vec<String>, String>> {
    let interfaces = bus.call(&MethodCall {
        dest: &obj.bus,
        path: &obj.path,
        iface: ACCESSIBLE,
        member: "GetInterfaces",
        args: &[],
    })?;
    let wrap = |cause: String| format!("AT-SPI element does not expose actions; refresh get_window_state(): {cause}");
    let names = match interfaces {
        Err(e) => return Ok(Err(wrap(e))),
        Ok(values) => match values.first() {
            Some(Value::Array(items)) => items
                .iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect::<Vec<_>>(),
            _ => return Ok(Err(wrap("AT-SPI GetInterfaces did not return an array".into()))),
        },
    };
    if !names.iter().any(|n| n == tree::ACTION) {
        return Ok(Err(wrap("AT-SPI element does not implement Action".into())));
    }
    let n = match tree::with_call(obj, Field::NActions, |c| bus.call(c))? {
        Err(e) => return Ok(Err(wrap(e))),
        Ok(values) => match values.first() {
            Some(Value::Variant(inner)) => match inner.as_ref() {
                Value::I32(n) if *n >= 0 => *n as u32,
                Value::I32(_) => return Ok(Err(wrap("AT-SPI NActions returned a negative count".into()))),
                _ => return Ok(Err(wrap("AT-SPI NActions did not return an integer".into()))),
            },
            _ => return Ok(Err(wrap("AT-SPI NActions did not return a variant".into()))),
        },
    };
    let mut out = Vec::new();
    for i in 0..n {
        match tree::with_call(obj, Field::ActionName(i), |c| bus.call(c))? {
            Ok(values) => match values.first() {
                Some(Value::Str(s)) => out.push(s.clone()),
                _ => return Ok(Err(wrap("AT-SPI action has no name".into()))),
            },
            Err(e) => return Ok(Err(wrap(e))),
        }
    }
    Ok(Ok(out))
}

pub fn do_action(bus: &mut Bus, obj: &ObjRef, index: u32) -> Result<std::result::Result<(), String>> {
    let args = [Arg::I32(index as i32)];
    let result = bus.call(&MethodCall {
        dest: &obj.bus,
        path: &obj.path,
        iface: tree::ACTION,
        member: "DoAction",
        args: &args,
    })?;
    Ok(match result {
        Ok(values) if matches!(values.first(), Some(Value::Bool(true))) => Ok(()),
        Ok(_) => Err(format!(
            "AT-SPI element refused action {index}; refresh get_window_state() to check its state"
        )),
        Err(e) => Err(e),
    })
}

pub fn state_words(bus: &mut Bus, obj: &ObjRef) -> Result<Option<Vec<&'static str>>> {
    let result = tree::with_call(obj, Field::State, |c| bus.call(c))?;
    Ok(match result {
        Ok(values) => match values.first() {
            Some(Value::Array(words)) => tree::decode_states(words),
            _ => None,
        },
        Err(_) => None,
    })
}

/// `Component.GetExtents(0)` in screen coordinates as (x0, y0, x1, y1).
pub fn extents(bus: &mut Bus, obj: &ObjRef) -> Result<std::result::Result<(i32, i32, i32, i32), String>> {
    let args = [Arg::U32(0)];
    let result = bus.call(&MethodCall {
        dest: &obj.bus,
        path: &obj.path,
        iface: "org.a11y.atspi.Component",
        member: "GetExtents",
        args: &args,
    })?;
    Ok(crate::table::extents_of(&result))
}

pub fn role_name(bus: &mut Bus, obj: &ObjRef) -> Result<Option<String>> {
    let result = tree::with_call(obj, Field::Role, |c| bus.call(c))?;
    Ok(result
        .ok()
        .and_then(|v| v.first().and_then(Value::as_str).map(str::to_string)))
}

#[cfg(test)]
mod tests {
    use super::{Associated, Association, Told, Unassociated, changed_before_acting, is_active, own_route};
    use crate::dbus::Value;

    #[test]
    fn the_active_state_is_read_from_the_state_words_themselves() {
        let state = |low: u32| Ok(vec![Value::Array(vec![Value::U32(low), Value::U32(0)])]);
        // GTK 3's active frame: active enabled resizable sensitive showing visible
        assert!(is_active(&state(0x4320_0102)));
        // Chrome's frames, active or not: enabled sensitive showing visible
        assert!(!is_active(&state(0x4300_0100)));
        assert!(!is_active(&Ok(vec![Value::Array(vec![Value::U32(2)])])), "one word");
        assert!(!is_active(&Ok(vec![Value::U32(2)])), "not an array");
        assert!(!is_active(&Err("org.freedesktop.DBus.Error.UnknownObject".into())));
    }

    #[test]
    fn how_a_frame_was_told_is_named_for_the_stats_line() {
        let names: Vec<&str> = [Told::Title, Told::Position, Told::Active, Told::Caption]
            .iter()
            .map(|t| t.name())
            .collect();
        assert_eq!(names, ["title", "position", "active", "caption"]);
    }

    fn associated(told: Told) -> Associated {
        Associated {
            frame: crate::tree::ObjRef {
                bus: ":1.2".into(),
                path: "/frame".into(),
            },
            told,
            window: 7,
        }
    }

    #[test]
    fn a_context_menu_copy_is_refused_on_every_route_of_cuas_own() {
        assert_eq!(associated(Told::Title).context_menu_refusal(), None);
        let refusal = |told| associated(told).context_menu_refusal().unwrap();
        let sentence = |how: &str| {
            format!(
                "the focused element of X11 window 7 copies only through a context menu, and a context menu cannot \
                 be shown to belong to this window, whose accessibility frame was found by {how}; nothing was sent"
            )
        };
        assert_eq!(
            refusal(Told::Position),
            sentence("its position among same-title duplicates")
        );
        assert_eq!(
            refusal(Told::Active),
            sentence("its active state among same-title duplicates")
        );
        assert_eq!(refusal(Told::Caption), sentence("its caption"));
    }

    #[test]
    fn only_the_vendors_own_match_falls_back_when_its_tree_cannot_be_read() {
        assert!(associated(Told::Title).fallback().is_some());
        for told in [Told::Position, Told::Active, Told::Caption] {
            assert!(associated(told).fallback().is_none(), "{told:?}");
        }
    }

    #[test]
    fn an_error_on_cuas_own_routes_is_their_answer_never_an_error_that_falls_back() {
        let answered = own_route(|| anyhow::bail!("AT-SPI call timed out"));
        assert!(
            matches!(&answered, Association::Identity(Unassociated::Failed(e)) if e.to_string() == "AT-SPI call timed out"),
            "an error, carried as the route's answer"
        );
        assert!(matches!(
            own_route(|| Ok(Association::Identity(Unassociated::Duplicates(7)))),
            Association::Identity(Unassociated::Duplicates(7))
        ));
    }

    #[test]
    fn what_cuas_own_routes_answer_reads_as_their_sentences() {
        assert_eq!(
            Unassociated::Duplicates(7).into_error().to_string(),
            "Window 7 matches several accessibility windows; close or retitle the duplicates"
        );
        assert_eq!(
            Unassociated::Changed(7).into_error().to_string(),
            "window identity changed while resolving X11 window 7; retry the operation"
        );
        assert_eq!(
            changed_before_acting(7),
            "window identity changed during the request for X11 window 7; nothing was sent, so it is safe to retry"
        );
    }
}
