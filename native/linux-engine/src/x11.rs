//! The X server side (behaviour §3, §5.7, §9, §16): windows and their properties, the X11 fallback tree,
//! retention through Composite, and window and desktop capture. Requests are pipelined where the vendor sends them one by
//! one; the answers are the vendor's.

use std::collections::{HashMap, HashSet};
use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};
use serde::Serialize;
use x11rb::connection::Connection;
use x11rb::cookie::Cookie;
use x11rb::protocol::Event;
use x11rb::protocol::composite::{ConnectionExt as _, Redirect};
use x11rb::protocol::xfixes::ConnectionExt as _;
use x11rb::protocol::xproto::*;
use x11rb::rust_connection::RustConnection;

use crate::readiness::{CaptureWait, Readiness, Waited};
use crate::tree::AxNode;

/// `GetProperty`'s length, in 32-bit units, as the vendor asks (behaviour §3).
const PROPERTY_LONGS: u32 = 0x1000;
/// The walk of the window tree stops silently at this many ids (behaviour §3).
const MAX_WINDOW_IDS: usize = 10_000;

/// How long input and capture wait on a window's retention (Design, Retention and the fixed waits).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Retention {
    /// The vendor's: redirect at the start of each request, unredirect at its end.
    PerRequest,
    /// cua's candidate: redirect on a window's first targeted request, keep it until it is destroyed.
    Session,
    /// No redirection at all.
    None,
}

/// A window as `list_windows` describes it; keys in alphabetical order, as the vendor serializes them.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct WindowInfo {
    pub app: String,
    pub focused: bool,
    pub height: u16,
    pub id: u32,
    /// `Some(true)` for an iconified window (`WM_STATE` Iconic), which the vendor leaves out of `list_windows`
    /// (Design, Minimized windows; M4): an additive field the vendor JavaScript passes through.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimized: Option<bool>,
    pub modal: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub width: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_type: Option<String>,
    pub x: i16,
    pub y: i16,
}

const ATOM_NAMES: &[&str] = &[
    "_NET_ACTIVE_WINDOW",
    "_NET_CLIENT_LIST_STACKING",
    "_NET_CLIENT_LIST",
    "_NET_WM_WINDOW_TYPE",
    "WM_STATE",
    "_NET_WM_NAME",
    "_GTK_APPLICATION_ID",
    "_NET_WM_STATE",
    "_NET_WM_STATE_MODAL",
    "_NET_WM_PID",
    "AT_SPI_BUS",
    "XdndSelection",
    "_NET_FRAME_EXTENTS",
    "_XEMBED_INFO",
];

pub struct X11 {
    pub conn: RustConnection,
    pub root: Window,
    atoms: HashMap<&'static str, Atom>,
    atom_names: HashMap<Atom, String>,
    composite_ready: bool,
    xfixes_ready: bool,
    retained: HashSet<Window>,
    pub retention: Retention,
    /// The wait after a window's redirect before input to it: none by default (Design, Retention and the fixed
    /// waits); `--settle-ms` sets it for measurements.
    pub settle: Duration,
    /// Opened at the first redirect (its connection and thread cost the start of every engine otherwise, the
    /// desktop-only requests' included).
    readiness: Option<Readiness>,
    capture_wait: CaptureWait,
    /// How long the last window capture waited for its pixmap, and why.
    pub last_capture_wait: Option<Waited>,
    /// The desktop screenshot's MIT-SHM segment (`shm.rs`).
    shm: crate::shm::Shm,
    /// How the last desktop screenshot was read: `shm` or `get_image`.
    pub last_desktop_read: Option<&'static str>,
    /// While a drag's watch on `XdndSelection` runs (`dnd.rs`): the selection-owner reports read by anything on this
    /// connection, kept for the watch, so a reader that drains events for its own reply (the server-time probe)
    /// cannot lose one.
    selection_reports: Option<Vec<x11rb::protocol::xfixes::SelectionNotifyEvent>>,
}

/// Lossy UTF-8, trailing NULs stripped, Unicode-trimmed, empty as None (behaviour §3, `property_text`).
pub fn property_text(bytes: &[u8]) -> Option<String> {
    let mut end = bytes.len();
    while end > 0 && bytes[end - 1] == 0 {
        end -= 1;
    }
    let text = String::from_utf8_lossy(&bytes[..end]);
    let text = text.trim();
    (!text.is_empty()).then(|| text.to_string())
}

/// The class from `WM_CLASS`: the last NUL-separated segment after trimming.
pub fn wm_class_app(bytes: &[u8]) -> Option<String> {
    let text = property_text(bytes)?;
    let last = text.rsplit('\0').next().unwrap_or("").trim();
    (!last.is_empty()).then(|| last.to_string())
}

/// `_NET_WM_WINDOW_TYPE`'s name without its prefix, lowercased; a foreign atom lowercased whole.
pub fn window_type_name(atom_name: &str) -> String {
    atom_name
        .strip_prefix("_NET_WM_WINDOW_TYPE_")
        .unwrap_or(atom_name)
        .to_ascii_lowercase()
}

fn values32(reply: &GetPropertyReply) -> Vec<u32> {
    reply.value32().map(|v| v.collect()).unwrap_or_default()
}

/// ICCCM's `WM_STATE` value for an iconified window.
const ICONIC_STATE: u32 = 3;

/// Whether a window is minimized: not viewable, and its `WM_STATE` (ICCCM 4.1.3.1) says Iconic. A window manager also
/// marks a shaded window or one on another desktop Iconic; each is out of sight, and activating it brings it back.
pub fn iconic(map_state: MapState, wm_state: &[u32]) -> bool {
    map_state != MapState::VIEWABLE && wm_state.first() == Some(&ICONIC_STATE)
}

/// Whether a window's properties make it a modal transient that can take another window's focus (task 61's fix):
/// `_NET_WM_STATE` names `_NET_WM_STATE_MODAL`, `WM_TRANSIENT_FOR` names a window (its parent, or its group's leader for
/// an application-modal dialog), and it is shown: viewable, or iconic, since a toolkit still counts a minimized dialog
/// as blocking and its activation would bring it back.
pub fn modal_transient(
    state: &[u32],
    modal: Atom,
    transient_for: &[u32],
    map_state: MapState,
    wm_state: &[u32],
) -> bool {
    state.contains(&modal)
        && transient_for.first().is_some_and(|w| *w != x11rb::NONE)
        && (map_state == MapState::VIEWABLE || iconic(map_state, wm_state))
}

/// One window of the target's own X client, as the modal lookup reads it (`X11::modal_transient_of`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Candidate {
    pub window: Window,
    /// Its `WM_TRANSIENT_FOR`, when it names a window.
    pub transient_for: Option<Window>,
    /// Whether it is a modal transient that is shown (`modal_transient`).
    pub modal_shown: bool,
}

/// The first of `candidates` (the other windows of the target's X client) that blocks the target, whose own
/// `WM_TRANSIENT_FOR` is `transient_for`: a shown modal transient that is not one of the target's ancestors along the
/// transient chain. A dialog's own modal parent does not block it: a modal D1 that opened a modal D2 leaves D2 the
/// dialog the person can use (the bounded re-review's P2), while D2 still blocks D1 and both block the window below.
pub fn blocking_dialog(transient_for: Option<Window>, candidates: &[Candidate]) -> Option<Window> {
    let mut ancestors = Vec::new();
    let mut next = transient_for;
    while let Some(w) = next {
        if ancestors.contains(&w) {
            break;
        }
        ancestors.push(w);
        next = candidates.iter().find(|c| c.window == w).and_then(|c| c.transient_for);
    }
    candidates
        .iter()
        .find(|c| c.modal_shown && !ancestors.contains(&c.window))
        .map(|c| c.window)
}

/// The pending replies for one window's description.
struct Describe<'c> {
    attributes: Cookie<'c, RustConnection, GetWindowAttributesReply>,
    geometry: Cookie<'c, RustConnection, GetGeometryReply>,
    origin: Cookie<'c, RustConnection, TranslateCoordinatesReply>,
    net_wm_name: Cookie<'c, RustConnection, GetPropertyReply>,
    wm_name: Cookie<'c, RustConnection, GetPropertyReply>,
    gtk_app: Cookie<'c, RustConnection, GetPropertyReply>,
    wm_class: Cookie<'c, RustConnection, GetPropertyReply>,
    window_type: Cookie<'c, RustConnection, GetPropertyReply>,
    wm_state: Cookie<'c, RustConnection, GetPropertyReply>,
    icccm_state: Cookie<'c, RustConnection, GetPropertyReply>,
}

/// A described window before its type atom is named.
struct Described {
    info: WindowInfo,
    type_atom: Option<Atom>,
}

impl X11 {
    pub fn connect(retention: Retention, settle: Duration, capture_wait: CaptureWait) -> Result<X11> {
        let (conn, screen) = x11rb::connect(None).context("failed to connect to the X server")?;
        let setup_screen = &conn.setup().roots[screen];
        let root = setup_screen.root;
        let cookies: Vec<_> = ATOM_NAMES
            .iter()
            .map(|name| conn.intern_atom(false, name.as_bytes()))
            .collect::<Result<_, _>>()?;
        let mut atoms = HashMap::new();
        for (name, cookie) in ATOM_NAMES.iter().zip(cookies) {
            atoms.insert(*name, cookie.reply()?.atom);
        }
        Ok(X11 {
            conn,
            root,
            atoms,
            atom_names: HashMap::new(),
            composite_ready: false,
            xfixes_ready: false,
            retained: HashSet::new(),
            retention,
            settle,
            readiness: None,
            capture_wait,
            last_capture_wait: None,
            shm: crate::shm::Shm::new(),
            last_desktop_read: None,
            selection_reports: None,
        })
    }

    pub fn atom(&self, name: &'static str) -> Atom {
        self.atoms[name]
    }

    fn property(&self, window: Window, property: Atom) -> Result<Cookie<'_, RustConnection, GetPropertyReply>> {
        Ok(self
            .conn
            .get_property(false, window, property, AtomEnum::ANY, 0, PROPERTY_LONGS)?)
    }

    pub fn get_property(&self, window: Window, property: Atom) -> Result<GetPropertyReply> {
        Ok(self.property(window, property)?.reply()?)
    }

    /// The accessibility bus address the root window publishes, if any (behaviour §19).
    pub fn at_spi_bus_address(&self) -> Option<String> {
        let reply = self.get_property(self.root, self.atom("AT_SPI_BUS")).ok()?;
        property_text(&reply.value)
    }

    fn describe_start(&self, id: Window) -> Result<Describe<'_>> {
        Ok(Describe {
            attributes: self.conn.get_window_attributes(id)?,
            geometry: self.conn.get_geometry(id)?,
            origin: self.conn.translate_coordinates(id, self.root, 0, 0)?,
            net_wm_name: self.property(id, self.atom("_NET_WM_NAME"))?,
            wm_name: self.property(id, AtomEnum::WM_NAME.into())?,
            gtk_app: self.property(id, self.atom("_GTK_APPLICATION_ID"))?,
            wm_class: self.property(id, AtomEnum::WM_CLASS.into())?,
            window_type: self.property(id, self.atom("_NET_WM_WINDOW_TYPE"))?,
            wm_state: self.property(id, self.atom("_NET_WM_STATE"))?,
            icccm_state: self.property(id, self.atom("WM_STATE"))?,
        })
    }

    /// `describe_window` (behaviour §3): None when the window has no size, or is not Viewable unless it is minimized
    /// (`iconic`), which the vendor leaves out and cua lists with `minimized: true` (M4).
    fn describe_finish(&self, id: Window, pending: Describe<'_>, focus: Window) -> Result<Option<Described>> {
        let attributes = pending.attributes.reply()?;
        let geometry = pending.geometry.reply()?;
        let origin = pending.origin.reply()?;
        let net_wm_name = pending.net_wm_name.reply()?;
        let wm_name = pending.wm_name.reply()?;
        let gtk_app = pending.gtk_app.reply()?;
        let wm_class = pending.wm_class.reply();
        let window_type = pending.window_type.reply().ok();
        let wm_state = pending.wm_state.reply()?;
        let icccm_state = pending.icccm_state.reply().map(|r| values32(&r)).unwrap_or_default();
        let minimized = iconic(attributes.map_state, &icccm_state);
        if (attributes.map_state != MapState::VIEWABLE && !minimized) || geometry.width == 0 || geometry.height == 0 {
            return Ok(None);
        }
        let title = property_text(&net_wm_name.value).or_else(|| property_text(&wm_name.value));
        let app = property_text(&gtk_app.value)
            .or_else(|| wm_class.ok().and_then(|c| wm_class_app(&c.value)))
            .unwrap_or_else(|| format!("x11:{id}"));
        let type_atom = window_type
            .filter(|r| r.format == 32)
            .and_then(|r| values32(&r).first().copied());
        let modal = values32(&wm_state).contains(&self.atom("_NET_WM_STATE_MODAL"));
        Ok(Some(Described {
            info: WindowInfo {
                app,
                focused: focus == id,
                height: geometry.height,
                id,
                minimized: minimized.then_some(true),
                modal,
                title,
                width: geometry.width,
                window_type: None,
                x: origin.dst_x,
                y: origin.dst_y,
            },
            type_atom,
        }))
    }

    /// Names the window types, caching atom names (atoms are the server's and never change meaning).
    fn name_types(&mut self, described: &mut [Described]) -> Result<()> {
        let unknown: Vec<Atom> = {
            let mut seen = HashSet::new();
            described
                .iter()
                .filter_map(|d| d.type_atom)
                .filter(|a| !self.atom_names.contains_key(a) && seen.insert(*a))
                .collect()
        };
        let cookies: Vec<_> = unknown
            .iter()
            .map(|a| self.conn.get_atom_name(*a))
            .collect::<Result<_, _>>()?;
        for (atom, cookie) in unknown.iter().zip(cookies) {
            if let Ok(reply) = cookie.reply() {
                self.atom_names
                    .insert(*atom, String::from_utf8_lossy(&reply.name).into_owned());
            }
        }
        for d in described.iter_mut() {
            d.info.window_type = d
                .type_atom
                .and_then(|a| self.atom_names.get(&a))
                .map(|n| window_type_name(n));
        }
        Ok(())
    }

    /// The window `get_window_state` and window requests act on: `X11 window <id> is not mapped` when it does
    /// not describe (unmapped and zero-size windows alike); a minimized window describes, with `minimized` set;
    /// X errors propagate.
    pub fn get_window(&mut self, id: Window) -> Result<WindowInfo> {
        let focus = self.focus()?;
        let pending = self.describe_start(id)?;
        let Some(described) = self.describe_finish(id, pending, focus)? else {
            bail!("X11 window {id} is not mapped");
        };
        let mut one = [described];
        self.name_types(&mut one)?;
        let [described] = one;
        Ok(described.info)
    }

    /// The focus `list_windows` reports: `_NET_ACTIVE_WINDOW`, else `GetInputFocus` when the property is absent.
    fn focus(&self) -> Result<Window> {
        let active = self.get_property(self.root, self.atom("_NET_ACTIVE_WINDOW"))?;
        if active.value.is_empty() {
            return Ok(self.conn.get_input_focus()?.reply()?.focus);
        }
        Ok(values32(&active).first().copied().unwrap_or(0))
    }

    /// `list_windows` (behaviour §3): the stacking list, the client list, then a depth-first walk of the window
    /// tree, each id described; a window that does not describe is skipped, one whose description fails dropped.
    pub fn list_windows(&mut self) -> Result<Vec<WindowInfo>> {
        let focus = self.focus()?;
        let stacking = self.property(self.root, self.atom("_NET_CLIENT_LIST_STACKING"))?;
        let clients = self.property(self.root, self.atom("_NET_CLIENT_LIST"))?;
        let mut ids: Vec<Window> = Vec::new();
        let mut seen = HashSet::new();
        for reply in [stacking.reply(), clients.reply()].into_iter().flatten() {
            for id in values32(&reply) {
                if seen.insert(id) {
                    ids.push(id);
                }
            }
        }
        for id in self.walk()? {
            if ids.len() >= MAX_WINDOW_IDS {
                break;
            }
            if seen.insert(id) {
                ids.push(id);
            }
        }
        ids.truncate(MAX_WINDOW_IDS);
        let pending: Vec<_> = ids.iter().map(|&id| self.describe_start(id)).collect::<Result<_>>()?;
        let mut described = Vec::new();
        for (&id, p) in ids.iter().zip(pending) {
            if let Ok(Some(d)) = self.describe_finish(id, p, focus) {
                described.push(d);
            }
        }
        self.name_types(&mut described)?;
        Ok(described.into_iter().map(|d| d.info).collect())
    }

    /// The window tree's listable windows, depth first, topmost first. Level by level, the requests of a level
    /// are sent together.
    fn walk(&self) -> Result<Vec<Window>> {
        struct Info {
            viewable: bool,
            listed: bool,
            children: Vec<Window>,
        }
        let mut info: HashMap<Window, Info> = HashMap::new();
        let root_children = self.conn.query_tree(self.root)?.reply()?.children;
        let mut level: Vec<(Window, bool)> = root_children.iter().map(|&w| (w, true)).collect();
        let marks = [
            self.atom("_NET_WM_WINDOW_TYPE"),
            self.atom("WM_STATE"),
            AtomEnum::WM_TRANSIENT_FOR.into(),
            AtomEnum::WM_CLASS.into(),
        ];
        let names = [self.atom("_NET_WM_NAME"), AtomEnum::WM_NAME.into()];
        while !level.is_empty() {
            let mut pending = Vec::with_capacity(level.len());
            for &(w, top) in &level {
                let attributes = self.conn.get_window_attributes(w)?;
                let tree = self.conn.query_tree(w)?;
                let props: Vec<_> = marks.iter().map(|&a| self.property(w, a)).collect::<Result<_>>()?;
                let name_props: Vec<_> = if top {
                    names.iter().map(|&a| self.property(w, a)).collect::<Result<_>>()?
                } else {
                    Vec::new()
                };
                pending.push((w, top, attributes, tree, props, name_props));
            }
            let mut next = Vec::new();
            for (w, top, attributes, tree, props, name_props) in pending {
                let Ok(attributes) = attributes.reply() else { continue };
                let viewable = attributes.map_state == MapState::VIEWABLE;
                let non_empty = |c: Cookie<'_, RustConnection, GetPropertyReply>| {
                    c.reply().map(|r| !r.value.is_empty()).unwrap_or(false)
                };
                let mut listed = false;
                for c in props {
                    listed |= non_empty(c);
                }
                for c in name_props {
                    listed |= non_empty(c);
                }
                if top && attributes.override_redirect {
                    listed = true;
                }
                let children = tree.reply().map(|t| t.children).unwrap_or_default();
                if viewable {
                    next.extend(children.iter().map(|&c| (c, false)));
                }
                info.insert(
                    w,
                    Info {
                        viewable,
                        listed,
                        children,
                    },
                );
            }
            level = next;
        }
        let mut out = Vec::new();
        let mut stack: Vec<Window> = root_children;
        while let Some(w) = stack.pop() {
            let Some(i) = info.get(&w) else { continue };
            if !i.viewable {
                continue;
            }
            if i.listed {
                out.push(w);
                if out.len() >= MAX_WINDOW_IDS {
                    break;
                }
            }
            stack.extend(i.children.iter().copied());
        }
        Ok(out)
    }

    /// Whether `window` is minimized (`iconic`) now: one round trip, its two requests together. A window that cannot be
    /// read is not minimized here; the request that names it answers its own error.
    pub fn minimized(&self, window: Window) -> bool {
        let attributes = self.conn.get_window_attributes(window);
        let state = self.property(window, self.atom("WM_STATE"));
        let (Ok(attributes), Ok(state)) = (attributes, state) else {
            return false;
        };
        match (attributes.reply(), state.reply()) {
            (Ok(attributes), Ok(state)) => iconic(attributes.map_state, &values32(&state)),
            _ => false,
        }
    }

    /// A modal transient of `window`'s own X client that is shown (`modal_transient`) and blocks it
    /// (`blocking_dialog`: not one of its own ancestors), if any. The candidates are the window manager's client list,
    /// else, with no window manager, the root's children, of the same client (its resource-id base): a toolkit's
    /// dialogs share its connection. Two round trips, the candidates' requests and the window's own `WM_TRANSIENT_FOR`
    /// pipelined. A dialog that blocks a sibling window of the same application, not this one, counts too (X11 does
    /// not tell window-modal from application-modal), which refuses more, never less.
    pub fn modal_transient_of(&self, window: Window) -> Result<Option<Window>> {
        let mask = self.conn.setup().resource_id_mask;
        let listed = values32(&self.get_property(self.root, self.atom("_NET_CLIENT_LIST"))?);
        let candidates = if listed.is_empty() {
            self.conn.query_tree(self.root)?.reply()?.children
        } else {
            listed
        };
        let own = self.property(window, AtomEnum::WM_TRANSIENT_FOR.into())?;
        let pending = candidates
            .into_iter()
            .filter(|&w| w != window && w & !mask == window & !mask)
            .map(|w| {
                Ok((
                    w,
                    self.property(w, self.atom("_NET_WM_STATE"))?,
                    self.property(w, AtomEnum::WM_TRANSIENT_FOR.into())?,
                    self.conn.get_window_attributes(w)?,
                    self.property(w, self.atom("WM_STATE"))?,
                ))
            })
            .collect::<Result<Vec<_>>>()?;
        let modal = self.atom("_NET_WM_STATE_MODAL");
        let named = |reply: &GetPropertyReply| values32(reply).first().copied().filter(|w| *w != x11rb::NONE);
        let mut read = Vec::new();
        for (w, state, transient_for, attributes, wm_state) in pending {
            // a window gone meanwhile blocks nothing
            let (Ok(state), Ok(transient_for), Ok(attributes), Ok(wm_state)) = (
                state.reply(),
                transient_for.reply(),
                attributes.reply(),
                wm_state.reply(),
            ) else {
                continue;
            };
            read.push(Candidate {
                window: w,
                transient_for: named(&transient_for),
                modal_shown: modal_transient(
                    &values32(&state),
                    modal,
                    &values32(&transient_for),
                    attributes.map_state,
                    &values32(&wm_state),
                ),
            });
        }
        Ok(blocking_dialog(named(&own.reply()?), &read))
    }

    /// Whether `window` carries `_XEMBED_INFO`, Qt's mark on every window it creates (`families::QtMark::Xembed`). A
    /// window that cannot be read carries nothing here; the request that names it answers its own error.
    pub fn xembed_marked(&self, window: Window) -> bool {
        self.get_property(window, self.atom("_XEMBED_INFO"))
            .is_ok_and(|reply| reply.type_ != x11rb::NONE)
    }

    /// `_NET_WM_PID` when it is exactly one non-zero value.
    pub fn pid(&self, window: Window) -> Option<u32> {
        let reply = self.get_property(window, self.atom("_NET_WM_PID")).ok()?;
        match values32(&reply).as_slice() {
            [pid] if *pid != 0 => Some(*pid),
            _ => None,
        }
    }

    /// `_NET_WM_PID` as the sibling check reads it: None when absent or 0.
    pub fn pid_any(&self, window: Window) -> Option<u32> {
        let reply = self.get_property(window, self.atom("_NET_WM_PID")).ok()?;
        values32(&reply).first().copied().filter(|p| *p != 0)
    }

    pub fn wm_name(&self, window: Window) -> Option<String> {
        self.get_property(window, AtomEnum::WM_NAME.into())
            .ok()
            .and_then(|r| property_text(&r.value))
    }

    /// `_NET_FRAME_EXTENTS` (`[left, right, top, bottom]`), the window manager's frame around the window, when it
    /// publishes exactly four values (`identity::Placement`).
    pub fn frame_extents(&self, window: Window) -> Option<[u32; 4]> {
        let reply = self.get_property(window, self.atom("_NET_FRAME_EXTENTS")).ok()?;
        values32(&reply).try_into().ok()
    }

    /// The class part of `WM_CLASS` (`families.rs`).
    pub fn wm_class(&self, window: Window) -> Option<String> {
        self.get_property(window, AtomEnum::WM_CLASS.into())
            .ok()
            .and_then(|r| wm_class_app(&r.value))
    }

    /// The client window at a root point: the top-level under it, then the first window holding `WM_STATE` in its
    /// subtree (a reparenting window manager's frame holds the client).
    pub fn client_at(&self, rx: i16, ry: i16) -> Option<Window> {
        let top = self
            .conn
            .translate_coordinates(self.root, self.root, rx, ry)
            .ok()?
            .reply()
            .ok()?
            .child;
        if top == x11rb::NONE {
            return None;
        }
        self.client_in(top, 0)
    }

    /// The window's parent (the root, or a reparenting window manager's frame).
    pub fn parent(&self, window: Window) -> Result<Window> {
        Ok(self.conn.query_tree(window)?.reply()?.parent)
    }

    /// Whether the real pointer is in `window` (whose parent is `parent`) or one of its inferiors, as the server sees it:
    /// the deepest window under the pointer is the window or below it, so a window over it, or the pointer elsewhere,
    /// is outside. A client's pointer grab on the window then crosses nothing (task 20: Chrome's capture grab crosses
    /// into its window, with no button held, when the pointer is outside it).
    pub fn pointer_in(&self, window: Window, parent: Window) -> Result<bool> {
        let reply = self.conn.query_pointer(parent)?.reply()?;
        Ok(reply.same_screen && reply.child == window)
    }

    fn client_in(&self, window: Window, depth: u32) -> Option<Window> {
        if depth > 8 {
            return None;
        }
        let state = self.get_property(window, self.atom("WM_STATE")).ok()?;
        if state.type_ != x11rb::NONE {
            return Some(window);
        }
        let children = self.conn.query_tree(window).ok()?.reply().ok()?.children;
        children.iter().rev().find_map(|&c| self.client_in(c, depth + 1))
    }

    /// The window-relative point in root coordinates (behaviour §3, `desktop_position`).
    pub fn desktop_position(&self, window: Window, x: i16, y: i16) -> Result<(i16, i16)> {
        let reply = (|| -> Result<TranslateCoordinatesReply> {
            Ok(self.conn.translate_coordinates(window, self.root, x, y)?.reply()?)
        })()
        .with_context(|| format!("failed to translate coordinates for X11 window {window}"))?;
        if !reply.same_screen {
            bail!("X11 window {window} is on another screen");
        }
        Ok((reply.dst_x, reply.dst_y))
    }

    // -----------------------------------------------------------------------------------------------------------
    // Retention

    fn ensure_composite(&mut self) -> Result<()> {
        if !self.composite_ready {
            let version = self
                .conn
                .composite_query_version(0, 4)
                .map_err(anyhow::Error::from)
                .and_then(|c| Ok(c.reply()?));
            version.context("background window rendering requires the X Composite extension")?;
            self.composite_ready = true;
        }
        Ok(())
    }

    /// Whether `window`'s redirect is held past its request (session retention), so the engine's exit drops it.
    pub fn holds_redirect(&self, window: Window) -> bool {
        self.retained.contains(&window)
    }

    /// Drops retained windows that were destroyed (their redirection ended with them).
    pub fn drain_events(&mut self) {
        while let Ok(Some(event)) = self.conn.poll_for_event() {
            self.note_event(event);
        }
    }

    pub fn note_event(&mut self, event: Event) {
        if let Event::DestroyNotify(e) = &event {
            self.retained.remove(&e.window);
        }
        if let (Event::XfixesSelectionNotify(e), Some(reports)) = (&event, self.selection_reports.as_mut()) {
            reports.push(*e);
        }
        if let Some(readiness) = &self.readiness {
            readiness.note(&event);
        }
    }

    /// Capture readiness, its connection opened on first use.
    fn readiness(&mut self) -> &Readiness {
        let rule = self.capture_wait;
        self.readiness.get_or_insert_with(|| Readiness::connect(rule))
    }

    /// Whether `window` is fully unobscured now, as a family's `unless_unobscured` condition reads it (`families.rs`).
    pub fn unobscured(&self, window: Window) -> bool {
        let geometry = self.conn.get_geometry(window).ok().and_then(|c| c.reply().ok());
        geometry.is_some_and(|g| self.fully_unobscured(window, &g))
    }

    /// The client window holding the X input focus: the focus window or the nearest ancestor with `WM_STATE`, else
    /// (no window manager has set one) the top-level window it is in; None when the focus is on no window (None,
    /// PointerRoot or the root).
    pub fn focused_client(&self) -> Result<Option<Window>> {
        let mut window = self.conn.get_input_focus()?.reply()?.focus;
        for _ in 0..100 {
            if window == x11rb::NONE || window == 1 || window == self.root {
                return Ok(None);
            }
            if self.get_property(window, self.atom("WM_STATE"))?.type_ != x11rb::NONE {
                return Ok(Some(window));
            }
            let parent = self.conn.query_tree(window)?.reply()?.parent;
            if parent == self.root {
                return Ok(Some(window));
            }
            window = parent;
        }
        Ok(None)
    }

    /// The window's standing on the desktop now (`dnd.rs`): the active window, the X input focus within it, on top of
    /// the window manager's stacking order. A property or reply that cannot be read counts as not.
    pub fn standing(&self, window: Window) -> crate::dnd::Standing {
        let last = |name| {
            self.property(self.root, self.atom(name))
                .ok()
                .and_then(|c| c.reply().ok())
                .and_then(|r| values32(&r).last().copied())
        };
        crate::dnd::Standing {
            active: last("_NET_ACTIVE_WINDOW") == Some(window),
            focused: crate::input::focus_is_within(self, window).unwrap_or(false),
            top: last("_NET_CLIENT_LIST_STACKING") == Some(window),
        }
    }

    /// Whether every root point of `points` is visible in `window` now (`cover.rs`); any X error is doubt, obscured.
    pub fn points_unobscured(&self, window: Window, points: &[(i16, i16)]) -> bool {
        let points: Vec<(i32, i32)> = points.iter().map(|&(x, y)| (x as i32, y as i32)).collect();
        let geometry = self.conn.get_geometry(window).ok().and_then(|c| c.reply().ok());
        geometry
            .and_then(|g| self.cover(window, &g).ok())
            .is_some_and(|(rect, levels)| crate::cover::points_unobscured(rect, &levels, &points))
    }

    /// Where real pointer input at root `points` would go now (`cover.rs` `reach`): the X errors of the stacking read are
    /// the caller's, since a window gone or its ancestry changing is not a judgement of the points.
    pub fn reach(&self, window: Window, points: &[(i16, i16)]) -> Result<crate::cover::Reach> {
        let points: Vec<(i32, i32)> = points.iter().map(|&(x, y)| (x as i32, y as i32)).collect();
        let geometry = self.conn.get_geometry(window)?.reply()?;
        let (rect, levels) = self.cover(window, &geometry)?;
        Ok(crate::cover::reach(rect, &levels, &points))
    }

    /// Whether `window` is fully unobscured now (`cover.rs`); any X error is doubt, and doubt is obscured.
    fn fully_unobscured(&self, window: Window, geometry: &GetGeometryReply) -> bool {
        self.cover(window, geometry)
            .map(|(rect, levels)| crate::cover::fully_unobscured(rect, &levels))
            .unwrap_or(false)
    }

    /// The window's rectangle in root coordinates and its ancestry's stacking, from its parent up to the root.
    fn cover(
        &self,
        window: Window,
        geometry: &GetGeometryReply,
    ) -> Result<(crate::cover::Rect, Vec<crate::cover::Level>)> {
        use crate::cover::{Above, Level, Rect};
        let origin = self.conn.translate_coordinates(window, self.root, 0, 0)?.reply()?;
        let rect = Rect {
            x: origin.dst_x as i32,
            y: origin.dst_y as i32,
            w: geometry.width as i32,
            h: geometry.height as i32,
        };
        let mut levels = Vec::new();
        let mut current = window;
        while current != self.root {
            let parent = self.conn.query_tree(current)?.reply()?.parent;
            let siblings = self.conn.query_tree(parent)?.reply()?.children;
            let position = siblings
                .iter()
                .position(|w| *w == current)
                .ok_or_else(|| anyhow!("window {current} is not among its parent's children"))?;
            let above = &siblings[position + 1..];
            let parent_geometry = self.conn.get_geometry(parent)?;
            let parent_origin = self.conn.translate_coordinates(parent, self.root, 0, 0)?;
            let pending: Vec<_> = above
                .iter()
                .map(|&w| Ok((self.conn.get_window_attributes(w)?, self.conn.get_geometry(w)?)))
                .collect::<Result<_>>()?;
            let parent_geometry = parent_geometry.reply()?;
            let parent_origin = parent_origin.reply()?;
            let (px, py) = (parent_origin.dst_x as i32, parent_origin.dst_y as i32);
            let mut level = Level {
                clip: Rect {
                    x: px,
                    y: py,
                    w: parent_geometry.width as i32,
                    h: parent_geometry.height as i32,
                },
                above: Vec::with_capacity(pending.len()),
            };
            for (attributes, geometry) in pending {
                let (attributes, g) = (attributes.reply()?, geometry.reply()?);
                let border = 2 * g.border_width as i32;
                level.above.push(Above {
                    rect: Rect {
                        x: px + g.x as i32,
                        y: py + g.y as i32,
                        w: g.width as i32 + border,
                        h: g.height as i32 + border,
                    },
                    viewable: attributes.map_state == MapState::VIEWABLE,
                    input_only: attributes.class == WindowClass::INPUT_ONLY,
                });
            }
            levels.push(level);
            current = parent;
        }
        Ok((rect, levels))
    }

    /// Makes `window`'s contents available offscreen, as `retention` says: redirected through Composite, the
    /// Damage tracking set up first so readiness misses nothing. Returns whether this request redirected it
    /// (`fresh`) and whether it must unredirect it at its end (`undo`).
    fn redirect(&mut self, window: Window) -> Result<(bool, bool)> {
        let attributes = self.conn.get_window_attributes(window)?.reply()?;
        if attributes.map_state != MapState::VIEWABLE {
            bail!("window {window} is not mapped; restore it before using background input or taking a screenshot");
        }
        match self.retention {
            Retention::None => Ok((false, false)),
            Retention::Session if self.retained.contains(&window) => Ok((false, false)),
            mode => {
                self.ensure_composite()?;
                let geometry = self.conn.get_geometry(window)?.reply()?;
                let unobscured = self.fully_unobscured(window, &geometry);
                self.readiness().watch(window, (geometry.width, geometry.height))?;
                let redirect = self
                    .conn
                    .composite_redirect_window(window, Redirect::AUTOMATIC)
                    .map_err(anyhow::Error::from);
                let redirected = redirect
                    .and_then(|c| Ok(c.check()?))
                    .context("failed to retain the target window's rendering buffer");
                if let Err(error) = redirected {
                    self.readiness().forget(window);
                    return Err(error);
                }
                self.readiness().redirected(window, unobscured)?;
                if mode == Retention::Session {
                    // Our own event selection on the window, so its destruction ends the retention record.
                    let aux = ChangeWindowAttributesAux::new().event_mask(EventMask::STRUCTURE_NOTIFY);
                    self.conn.change_window_attributes(window, &aux)?.check()?;
                    self.retained.insert(window);
                }
                Ok((true, mode == Retention::PerRequest))
            }
        }
    }

    /// Retention for input: the redirect, then the input wait after a fresh one. Returns whether this request
    /// must unredirect the window at its end.
    pub fn retain(&mut self, window: Window) -> Result<bool> {
        let (fresh, undo) = self.redirect(window)?;
        if fresh {
            std::thread::sleep(self.settle);
        }
        Ok(undo)
    }

    pub fn release(&mut self, window: Window, redirected: bool) {
        if redirected {
            let _ = self
                .conn
                .composite_unredirect_window(window, Redirect::AUTOMATIC)
                .map(|c| c.check());
            self.readiness().forget(window);
        }
    }

    // -----------------------------------------------------------------------------------------------------------
    // Capture

    /// The window's own drawable as RGB (behaviour §16), once its pixmap is ready (`readiness.rs`).
    pub fn capture_window(&mut self, window: Window) -> Result<(Vec<u8>, u16, u16)> {
        let (_, redirected) = self.redirect(window)?;
        self.last_capture_wait = Some(self.readiness().wait(window));
        let result = (|| {
            let geometry = self
                .conn
                .get_geometry(window)
                .map_err(anyhow::Error::from)
                .and_then(|c| Ok(c.reply()?))
                .with_context(|| format!("failed to read screenshot geometry for X11 window {window}"))?;
            let image = self
                .conn
                .get_image(ImageFormat::Z_PIXMAP, window, 0, 0, geometry.width, geometry.height, !0)?
                .reply()?;
            let rgb =
                crate::capture::bgrx_to_rgb(&image.data, geometry.width, geometry.height).map_err(|e| anyhow!(e))?;
            Ok((rgb, geometry.width, geometry.height))
        })();
        self.release(window, redirected);
        result
    }

    /// The desktop: the root window at its current size as RGB, with the pointer stamped when `mouse_size_px`
    /// is positive (behaviour §16). No retention: the root is never redirected. The pixels come through MIT-SHM where
    /// the display allows it (Design, Screenshots), else through `GetImage`.
    pub fn capture_desktop(&mut self, mouse_size_px: u32) -> Result<(Vec<u8>, u16, u16)> {
        let geometry = self.conn.get_geometry(self.root)?.reply()?;
        let (width, height) = (geometry.width, geometry.height);
        let shared = self
            .shm
            .read(&self.conn, self.root, width, height)
            .map(|data| crate::capture::bgrx_to_rgb(data, width, height));
        self.last_desktop_read = Some(if shared.is_some() { "shm" } else { "get_image" });
        let rgb = match shared {
            Some(rgb) => rgb,
            None => {
                let image = self
                    .conn
                    .get_image(ImageFormat::Z_PIXMAP, self.root, 0, 0, width, height, !0)?
                    .reply()?;
                crate::capture::bgrx_to_rgb(&image.data, width, height)
            }
        };
        let mut rgb = rgb.map_err(|e| anyhow!(e))?;
        if mouse_size_px > 0 {
            match self.cursor_image() {
                Ok(cursor) => crate::capture::stamp_cursor(&mut rgb, width, height, &cursor),
                Err(_) => {
                    let pointer = self.conn.query_pointer(self.root)?.reply()?;
                    crate::capture::stamp_arrow(&mut rgb, width, height, pointer.root_x, pointer.root_y, mouse_size_px);
                }
            }
        }
        Ok((rgb, width, height))
    }

    /// After a desktop screenshot's answer: the MIT-SHM segment for the next one, where the display allows it.
    pub fn prepare_desktop(&mut self) {
        self.shm.prepare(&self.conn);
    }

    /// Selection-owner reports are kept from now on for [`X11::take_selection_reports`], until
    /// [`X11::stop_selection_reports`].
    pub fn keep_selection_reports(&mut self) {
        self.selection_reports = Some(Vec::new());
    }

    /// Every selection-owner report that arrived since the last call: the events read meanwhile are noted first.
    pub fn take_selection_reports(&mut self) -> Vec<x11rb::protocol::xfixes::SelectionNotifyEvent> {
        self.drain_events();
        self.selection_reports.as_mut().map(std::mem::take).unwrap_or_default()
    }

    pub fn stop_selection_reports(&mut self) {
        self.selection_reports = None;
    }

    /// XFixes, its version negotiated once per connection.
    pub fn ensure_xfixes(&mut self) -> Result<()> {
        if !self.xfixes_ready {
            self.conn.xfixes_query_version(4, 0)?.reply()?;
            self.xfixes_ready = true;
        }
        Ok(())
    }

    /// The pointer's current image through XFixes.
    fn cursor_image(&mut self) -> Result<crate::capture::Cursor> {
        self.ensure_xfixes()?;
        let reply = self.conn.xfixes_get_cursor_image()?.reply()?;
        let expected = reply.width as usize * reply.height as usize;
        if reply.cursor_image.len() != expected {
            bail!(
                "xfixes cursor image {} pixels, expected {expected}",
                reply.cursor_image.len()
            );
        }
        Ok(crate::capture::Cursor {
            x: reply.x,
            y: reply.y,
            width: reply.width,
            height: reply.height,
            xhot: reply.xhot,
            yhot: reply.yhot,
            pixels: reply.cursor_image,
        })
    }

    // -----------------------------------------------------------------------------------------------------------
    // The X11 fallback tree (behaviour §5.7)

    /// The vendor's X11 tree for a window whose association failed. It takes the leave only the vendor's own failures
    /// give (`atspi::Fallback`), so a window whose association met duplicates never answers it.
    pub fn fallback_tree(&self, window: Window, _leave: crate::atspi::Fallback) -> Result<AxNode> {
        let mut count = 0u32;
        self.fallback_node(window, 0, &mut count)
    }

    fn fallback_node(&self, window: Window, depth: u32, count: &mut u32) -> Result<AxNode> {
        if *count >= crate::tree::NODE_LIMIT {
            bail!("X11 window tree exceeded its node limit");
        }
        if depth > 64 {
            bail!("X11 window tree exceeded its depth limit");
        }
        *count += 1;
        let name = self.property(window, self.atom("_NET_WM_NAME"))?;
        let wm_name = self.property(window, AtomEnum::WM_NAME.into())?;
        let class = self.property(window, AtomEnum::WM_CLASS.into())?;
        let transient = self.property(window, AtomEnum::WM_TRANSIENT_FOR.into())?;
        let tree = self.conn.query_tree(window)?;
        let name = name
            .reply()
            .ok()
            .and_then(|r| property_text(&r.value))
            .or_else(|| wm_name.reply().ok().and_then(|r| property_text(&r.value)));
        let description = class
            .reply()
            .ok()
            .and_then(|r| property_text(&r.value))
            .map(|c| c.replace('\0', " / "));
        let transient = transient.reply().map(|r| !r.value.is_empty()).unwrap_or(false);
        let role = if transient {
            "dialog"
        } else if depth == 0 {
            "window"
        } else {
            "container"
        };
        let mut children = Vec::new();
        for child in tree.reply()?.children {
            let Ok(attributes) = self
                .conn
                .get_window_attributes(child)
                .map_err(anyhow::Error::from)
                .and_then(|c| Ok(c.reply()?))
            else {
                continue;
            };
            if attributes.class == WindowClass::INPUT_ONLY || attributes.map_state != MapState::VIEWABLE {
                continue;
            }
            match self.fallback_node(child, depth + 1, count) {
                Ok(node) => children.push(node),
                Err(error) if error.to_string().starts_with("X11 window tree exceeded") => return Err(error),
                Err(_) => {}
            }
        }
        Ok(AxNode {
            actions: None,
            children,
            description,
            id: format!("x11:0x{window:x}"),
            name,
            role: role.to_string(),
            states: None,
            value: None,
        })
    }

    pub fn flush(&self) -> Result<()> {
        self.conn.flush()?;
        Ok(())
    }

    /// A round trip: once it returns, the server has handled every request sent before it (the exit's last
    /// `FocusOut` included, so the engine never exits with one still unread in its socket).
    pub fn sync(&self) -> Result<()> {
        self.conn.get_input_focus()?.reply()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_modal_transient_is_modal_transient_for_a_window_and_shown() {
        const MODAL: Atom = 401;
        const ABOVE: Atom = 402;
        let (iconic_state, normal_state) = ([3u32, 0], [1u32, 0]);
        // a Qt dialog: modal, transient for its parent (or its group's leader), mapped
        assert!(modal_transient(
            &[ABOVE, MODAL],
            MODAL,
            &[0x600006],
            MapState::VIEWABLE,
            &normal_state
        ));
        // minimized, it still blocks: its activation would bring it back
        assert!(modal_transient(
            &[MODAL],
            MODAL,
            &[0x600006],
            MapState::UNMAPPED,
            &iconic_state
        ));
        assert!(
            !modal_transient(&[MODAL], MODAL, &[0x600006], MapState::UNMAPPED, &[]),
            "a hidden (withdrawn) dialog blocks nothing"
        );
        assert!(
            !modal_transient(&[ABOVE], MODAL, &[0x600006], MapState::VIEWABLE, &normal_state),
            "a transient that is not modal"
        );
        assert!(
            !modal_transient(&[MODAL], MODAL, &[], MapState::VIEWABLE, &normal_state),
            "a modal window transient for nothing is a top-level of its own"
        );
        assert!(!modal_transient(
            &[MODAL],
            MODAL,
            &[0],
            MapState::VIEWABLE,
            &normal_state
        ));
    }

    #[test]
    fn a_dialog_s_modal_ancestors_do_not_block_it_and_a_modal_dialog_above_a_window_does() {
        // the bounded re-review's P2: modal D1 over the main window opens modal D2; D2 is the dialog the person can
        // use, so input to it goes, while input to D1 or to the main window is refused (each blocked by a dialog
        // above it)
        const MAIN: Window = 0x600006;
        const D1: Window = 0x600010;
        const D2: Window = 0x600020;
        const LEADER: Window = 0x600001;
        let shown = |w, transient_for| Candidate {
            window: w,
            transient_for,
            modal_shown: true,
        };
        let nested = [
            Candidate {
                window: MAIN,
                transient_for: None,
                modal_shown: false,
            },
            shown(D1, Some(MAIN)),
            shown(D2, Some(D1)),
        ];
        let others = |of: Window| {
            nested
                .iter()
                .filter(move |c| c.window != of)
                .copied()
                .collect::<Vec<_>>()
        };
        assert_eq!(
            blocking_dialog(Some(D1), &others(D2)),
            None,
            "D2 is not blocked by its ancestor D1"
        );
        assert_eq!(
            blocking_dialog(Some(MAIN), &others(D1)),
            Some(D2),
            "D1 is blocked by D2"
        );
        assert_eq!(
            blocking_dialog(None, &others(MAIN)),
            Some(D1),
            "the main window is blocked"
        );
        // two dialogs transient for their group's leader (application-modal, the leader a window no list holds):
        // neither is the other's ancestor, so the other one blocks, which refuses more, never less
        let leader = [shown(D1, Some(LEADER))];
        assert_eq!(
            blocking_dialog(Some(LEADER), &leader),
            Some(D1),
            "a sibling dialog blocks"
        );
        assert_eq!(blocking_dialog(Some(LEADER), &[]), None);
        // a window transient for a tool window that is not modal, itself transient for modal D1: D1 is still the
        // window's ancestor, so it does not block it, while D2, a modal dialog of D1's, does
        const TOOL: Window = 0x600030;
        let through = [
            Candidate {
                window: TOOL,
                transient_for: Some(D1),
                modal_shown: false,
            },
            shown(D1, Some(MAIN)),
        ];
        assert_eq!(
            blocking_dialog(Some(TOOL), &through),
            None,
            "an ancestor along a chain through a window that is not modal"
        );
        let with_d2 = [through[0], through[1], shown(D2, Some(D1))];
        assert_eq!(blocking_dialog(Some(TOOL), &with_d2), Some(D2));
        // a cycle of transients ends
        let cycle = [shown(D1, Some(D2)), shown(D2, Some(D1))];
        assert_eq!(blocking_dialog(Some(D1), &cycle), None);
    }

    #[test]
    fn property_text_is_lossy_trimmed_and_drops_trailing_nuls() {
        assert_eq!(property_text(b"  gedit \0\0"), Some("gedit".into()));
        assert_eq!(property_text(b"\0"), None);
        assert_eq!(property_text(b"caf\xe9"), Some("caf\u{fffd}".into()));
    }

    #[test]
    fn the_class_is_the_last_wm_class_segment() {
        assert_eq!(
            wm_class_app(b"google-chrome\0Google-chrome\0"),
            Some("Google-chrome".into())
        );
        assert_eq!(wm_class_app(b"gedit\0"), Some("gedit".into()));
        assert_eq!(wm_class_app(b""), None);
    }

    #[test]
    fn window_types_lose_their_prefix_and_case() {
        assert_eq!(window_type_name("_NET_WM_WINDOW_TYPE_NORMAL"), "normal");
        assert_eq!(window_type_name("_NET_WM_WINDOW_TYPE_POPUP_MENU"), "popup_menu");
        assert_eq!(
            window_type_name("_KDE_NET_WM_WINDOW_TYPE_OVERRIDE"),
            "_kde_net_wm_window_type_override"
        );
    }

    #[test]
    fn windows_serialize_with_alphabetical_keys_and_skip_absent_ones() {
        let w = WindowInfo {
            app: "x11:4194591".into(),
            focused: false,
            height: 1,
            id: 4194591,
            minimized: None,
            modal: false,
            title: Some("Openbox".into()),
            width: 1,
            window_type: None,
            x: -100,
            y: -100,
        };
        assert_eq!(
            serde_json::to_string(&w).unwrap(),
            r#"{"app":"x11:4194591","focused":false,"height":1,"id":4194591,"modal":false,"title":"Openbox","width":1,"x":-100,"y":-100}"#
        );
        let minimized = WindowInfo {
            minimized: Some(true),
            ..w
        };
        assert_eq!(
            serde_json::to_string(&minimized).unwrap(),
            r#"{"app":"x11:4194591","focused":false,"height":1,"id":4194591,"minimized":true,"modal":false,"title":"Openbox","width":1,"x":-100,"y":-100}"#,
            "the additive field, in its alphabetical place"
        );
    }

    #[test]
    fn a_window_is_minimized_when_it_is_not_viewable_and_its_wm_state_is_iconic() {
        assert!(iconic(MapState::UNMAPPED, &[3, 0]));
        assert!(iconic(MapState::UNVIEWABLE, &[3]));
        assert!(
            !iconic(MapState::VIEWABLE, &[3, 0]),
            "a mapped window is not minimized, whatever it says"
        );
        assert!(!iconic(MapState::UNMAPPED, &[1, 0]), "NormalState");
        assert!(!iconic(MapState::UNMAPPED, &[0, 0]), "WithdrawnState");
        assert!(!iconic(MapState::UNMAPPED, &[]), "no WM_STATE");
    }
}
