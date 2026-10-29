//! The accessibility side (behaviour §4, §6, §7, §19): finding the bus, associating an X11 window with its
//! AT-SPI frame, resolving element ids, and element actions.

use std::collections::HashMap;

use anyhow::{Result, anyhow, bail};

use crate::dbus::{Arg, Bus, CallResult, MethodCall, Value};
use crate::tree::{self, Field, ObjRef, Transport};
use crate::x11::{WindowInfo, X11};

const REGISTRY: &str = "org.a11y.atspi.Registry";
const ROOT_PATH: &str = "/org/a11y/atspi/accessible/root";
const ACCESSIBLE: &str = "org.a11y.atspi.Accessible";
const PROPERTIES: &str = "org.freedesktop.DBus.Properties";

/// The bus as a tree-read transport.
impl Transport for Bus {
    fn send(&mut self, obj: &ObjRef, field: Field) -> Result<u32> {
        Ok(tree::with_call(obj, field, |call| Bus::send(self, call)))
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
fn call_all(bus: &mut Bus, calls: &[MethodCall]) -> Result<Vec<CallResult>> {
    let serials: Vec<u32> = calls.iter().map(|c| bus.send(c)).collect();
    let mut results: HashMap<u32, CallResult> = HashMap::new();
    while results.len() < serials.len() {
        let (serial, result) = bus.recv()?;
        results.insert(serial, result);
    }
    Ok(serials.iter().map(|s| results.remove(s).unwrap()).collect())
}

/// The `Application.ToolkitName` of a process's accessible application (the first the registry lists for the PID),
/// or None when the process has none on the bus or the name cannot be read (`families.rs`).
pub fn toolkit_of(bus: &mut Bus, pid: u32) -> Result<Option<String>> {
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
    const ARGS: [Arg<'static>; 2] = [Arg::Str("org.a11y.atspi.Application"), Arg::Str("ToolkitName")];
    let result = bus.call(&MethodCall {
        dest: &app.bus,
        path: &app.path,
        iface: PROPERTIES,
        member: "Get",
        args: &ARGS,
    })?;
    Ok(first_str(&result))
}

/// What association concluded (behaviour §4): a frame, no match, or a sentence.
pub enum Association {
    Frame(ObjRef),
    NoMatch,
    Refused(String),
}

/// Associates X11 window `window` (already described as `info`) with its AT-SPI frame, step by step as the vendor
/// does, sending independent calls together.
pub fn associate(bus: &mut Bus, x: &mut X11, info: &WindowInfo) -> Result<Association> {
    let id = info.id;
    let Some(pid) = x.pid(id) else {
        return Ok(Association::Refused(format!(
            "X11 window {id} has no usable _NET_WM_PID"
        )));
    };
    let wm_name = x.wm_name(id);
    let title = info.title.clone();

    let registry = ObjRef {
        bus: REGISTRY.into(),
        path: ROOT_PATH.into(),
    };
    let apps = match refs_of(&bus.call(&children_call(&registry))?) {
        Ok(apps) => apps,
        Err(error) => return Ok(Association::Refused(error)),
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
        return Ok(Association::Refused(format!(
            "AT-SPI provider with process ID {pid} is unavailable for X11 window {id}"
        )));
    }
    let mut frames: Vec<(ObjRef, String)> = Vec::new();
    for app in matching {
        let children = match refs_of(&bus.call(&children_call(app))?) {
            Ok(children) => children,
            Err(error) => return Ok(Association::Refused(error)),
        };
        let calls: Vec<MethodCall> = children.iter().map(name_call).collect();
        for (child, result) in children.iter().zip(call_all(bus, &calls)?) {
            match first_str(&result) {
                Some(name) => frames.push((child.clone(), name)),
                None => return Ok(Association::Refused("AT-SPI window identity is unavailable".into())),
            }
        }
    }
    let same = |a: &str, b: &str| a.len() == b.len() && a.eq_ignore_ascii_case(b);
    let by_title: Vec<&(ObjRef, String)> = match &title {
        Some(t) => frames.iter().filter(|(_, n)| same(n, t)).collect(),
        None => frames.iter().collect(),
    };
    let by_wm_name: Vec<&(ObjRef, String)> = match &wm_name {
        Some(t) => frames.iter().filter(|(_, n)| same(n, t)).collect(),
        None => Vec::new(),
    };
    let candidates = if by_title.is_empty() { by_wm_name } else { by_title };
    if candidates.is_empty() {
        return Ok(Association::NoMatch);
    }

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
        let matches_title = title.is_none()
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
        Association::Refused(format!(
            "ambiguous AT-SPI window identity for X11 window {id}: {reason}"
        ))
    };
    let mut size_used = None;
    let frame = if candidates.len() == 1 && siblings.is_empty() {
        candidates[0].clone()
    } else if title.is_none() {
        return Ok(ambiguous(format!(
            "multiple windows in process {pid} match the available identity"
        )));
    } else if let Some(s) = siblings
        .iter()
        .find(|s| s.width == info.width && s.height == info.height)
    {
        return Ok(ambiguous(format!("X11 window {} has the same title and size", s.id)));
    } else {
        let mut kept = Vec::new();
        for candidate in &candidates {
            match size_of(bus, &candidate.0)? {
                Ok((w, h)) if w == info.width as i32 && h == info.height as i32 => kept.push((*candidate).clone()),
                Ok(_) => {}
                Err(cause) => return Ok(ambiguous(format!("window size is unavailable: {cause}"))),
            }
        }
        if kept.len() != 1 {
            return Ok(ambiguous("matching titles do not have one matching size".into()));
        }
        size_used = Some((info.width, info.height));
        kept.remove(0)
    };

    // Re-verification (behaviour §4 step 8).
    let changed = || {
        Association::Refused(format!(
            "window identity changed while resolving X11 window {id}; retry the operation"
        ))
    };
    let again = match x.get_window(id) {
        Ok(again) => again,
        Err(_) => return Ok(changed()),
    };
    if again.title != title || x.pid(id) != Some(pid) || x.wm_name(id) != wm_name {
        return Ok(changed());
    }
    if let Some((w, h)) = size_used
        && (again.width != w
            || again.height != h
            || !matches!(size_of(bus, &frame.0)?, Ok((sw, sh)) if sw == w as i32 && sh == h as i32))
    {
        return Ok(changed());
    }
    if first_str(&bus.call(&name_call(&frame.0))?).as_deref() != Some(frame.1.as_str()) {
        return Ok(changed());
    }
    Ok(Association::Frame(frame.0))
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
