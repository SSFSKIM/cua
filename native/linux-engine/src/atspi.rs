//! The accessibility side (behaviour §4, §6, §7, §19): finding the bus, associating an X11 window with its
//! AT-SPI frame, resolving element ids, element actions, and the `Cache.GetItems` experiment's seed.

use std::collections::{BTreeMap, HashMap};

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

/// Sends `calls` and returns their results in order: all in flight at once, or one after another.
fn call_all(bus: &mut Bus, calls: &[MethodCall], pipelined: bool) -> Result<Vec<CallResult>> {
    if !pipelined {
        return calls.iter().map(|c| bus.call(c)).collect();
    }
    let serials: Vec<u32> = calls.iter().map(|c| bus.send(c)).collect();
    let mut results: HashMap<u32, CallResult> = HashMap::new();
    while results.len() < serials.len() {
        let (serial, result) = bus.recv()?;
        results.insert(serial, result);
    }
    Ok(serials.iter().map(|s| results.remove(s).unwrap()).collect())
}

/// What association concluded (behaviour §4): a frame, no match, or a sentence.
pub enum Association {
    Frame(ObjRef),
    NoMatch,
    Refused(String),
}

/// Associates X11 window `window` (already described as `info`) with its AT-SPI frame, step by step as the vendor
/// does; `pipelined` sends independent calls together.
pub fn associate(bus: &mut Bus, x: &mut X11, info: &WindowInfo, pipelined: bool) -> Result<Association> {
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
    let pids = call_all(bus, &pid_calls, pipelined)?;
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
        for (child, result) in children.iter().zip(call_all(bus, &calls, pipelined)?) {
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

/// Finds `element_id` in the frame's tree with ancestors (nearest first, ending with the frame), walking preorder
/// with one `GetChildren` per node before the target.
pub fn resolve_element(
    bus: &mut Bus,
    frame: &ObjRef,
    element_id: &str,
) -> Result<std::result::Result<(ObjRef, Vec<ObjRef>), String>> {
    let mut visits = 0u32;
    // (node, depth, ancestors' indices into `path`)
    let mut stack: Vec<(ObjRef, u32, Vec<ObjRef>)> = vec![(frame.clone(), 0, Vec::new())];
    while let Some((node, depth, ancestors)) = stack.pop() {
        if depth >= 64 || visits >= tree::NODE_LIMIT {
            return Ok(Err("AT-SPI element search exceeded its tree limit".into()));
        }
        visits += 1;
        if format!("{}:{}", node.bus, node.path) == element_id {
            let mut nearest_first = ancestors.clone();
            nearest_first.reverse();
            return Ok(Ok((node, nearest_first)));
        }
        let children = refs_of(&bus.call(&children_call(&node))?).unwrap_or_default();
        let mut chain = ancestors.clone();
        chain.push(node.clone());
        for child in children.into_iter().rev() {
            stack.push((child, depth + 1, chain.clone()));
        }
    }
    // The vendor's second, table-aware walk (behaviour §5.4) is not in the spike.
    Ok(Err(
        "element is not in this window's AT-SPI tree; refresh get_window_state()".into(),
    ))
}

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
    Ok(match result {
        Ok(values) => match values.first() {
            Some(Value::Struct(parts)) => match parts.as_slice() {
                [Value::I32(x), Value::I32(y), Value::I32(w), Value::I32(h)] => {
                    Ok((*x, *y, x.saturating_add(*w), y.saturating_add(*h)))
                }
                _ => Err("AT-SPI element did not return valid bounds".into()),
            },
            _ => Err("AT-SPI element did not return bounds".into()),
        },
        Err(e) => Err(e),
    })
}

pub fn role_name(bus: &mut Bus, obj: &ObjRef) -> Result<Option<String>> {
    let result = tree::with_call(obj, Field::Role, |c| bus.call(c))?;
    Ok(result
        .ok()
        .and_then(|v| v.first().and_then(Value::as_str).map(str::to_string)))
}

// ---------------------------------------------------------------------------------------------------------------
// The Cache.GetItems experiment

/// What `GetItems` answered, for the stats line.
#[derive(Debug, Default, Clone)]
pub struct CacheReport {
    pub answered: bool,
    pub error: Option<String>,
    pub shape: Option<String>,
    pub items: usize,
    pub seeded: usize,
    pub children_fallbacks: usize,
    pub role_lookups: usize,
}

struct CacheItem {
    parent: ObjRef,
    index: Option<i32>,
    child_count: Option<i32>,
    children: Option<Vec<ObjRef>>,
    interfaces: Vec<String>,
    name: String,
    role: u32,
    description: String,
    states: Vec<Value>,
}

fn obj_of(value: &Value) -> Option<ObjRef> {
    match value {
        Value::Struct(parts) => match parts.as_slice() {
            [Value::Str(bus), Value::Path(path)] => Some(ObjRef {
                bus: bus.clone(),
                path: path.clone(),
            }),
            _ => None,
        },
        _ => None,
    }
}

fn shape(value: &Value) -> String {
    match value {
        Value::Byte(_) => "y".into(),
        Value::Bool(_) => "b".into(),
        Value::I16(_) => "n".into(),
        Value::U16(_) => "q".into(),
        Value::I32(_) => "i".into(),
        Value::U32(_) => "u".into(),
        Value::I64(_) => "x".into(),
        Value::U64(_) => "t".into(),
        Value::F64(_) => "d".into(),
        Value::Str(_) => "s".into(),
        Value::Path(_) => "o".into(),
        Value::Sig(_) => "g".into(),
        Value::Fd(_) => "h".into(),
        Value::Variant(_) => "v".into(),
        Value::Array(items) => format!("a{}", items.first().map(shape).unwrap_or_else(|| "?".into())),
        Value::Struct(parts) => format!("({})", parts.iter().map(shape).collect::<String>()),
        Value::Dict(k, v) => format!("{{{}{}}}", shape(k), shape(v)),
    }
}

/// Seeds the frontier from the frame's application cache: role (through one `GetRoleName` per distinct role
/// number), name, description, states, interfaces and children where the cache's index and count are usable.
pub fn cache_seed(bus: &mut Bus, frame: &ObjRef) -> Result<(tree::Seed, CacheReport)> {
    let mut report = CacheReport::default();
    let call = MethodCall {
        dest: &frame.bus,
        path: "/org/a11y/atspi/cache",
        iface: "org.a11y.atspi.Cache",
        member: "GetItems",
        args: &[],
    };
    let values = match bus.call(&call)? {
        Ok(values) => values,
        Err(error) => {
            report.error = Some(error);
            return Ok((tree::Seed::default(), report));
        }
    };
    report.answered = true;
    report.shape = values.first().map(shape);
    let Some(Value::Array(rows)) = values.first() else {
        return Ok((tree::Seed::default(), report));
    };
    report.items = rows.len();
    let mut items: HashMap<ObjRef, CacheItem> = HashMap::new();
    for row in rows {
        let Value::Struct(f) = row else { continue };
        let strs = |v: &Value| match v {
            Value::Array(items) => items.iter().filter_map(|i| i.as_str().map(str::to_string)).collect(),
            _ => Vec::new(),
        };
        let parsed = match f.as_slice() {
            // modern: (so)(so)(so) i i as s u s au
            [
                obj,
                _app,
                parent,
                Value::I32(index),
                Value::I32(count),
                ifaces,
                Value::Str(name),
                Value::U32(role),
                Value::Str(desc),
                Value::Array(states),
            ] => obj_of(obj).zip(obj_of(parent)).map(|(o, p)| {
                (
                    o,
                    CacheItem {
                        parent: p,
                        index: Some(*index),
                        child_count: Some(*count),
                        children: None,
                        interfaces: strs(ifaces),
                        name: name.clone(),
                        role: *role,
                        description: desc.clone(),
                        states: states.clone(),
                    },
                )
            }),
            // legacy: (so)(so)(so) a(so) as s u s au
            [
                obj,
                _app,
                parent,
                Value::Array(children),
                ifaces,
                Value::Str(name),
                Value::U32(role),
                Value::Str(desc),
                Value::Array(states),
            ] => obj_of(obj).zip(obj_of(parent)).map(|(o, p)| {
                let kids = children.iter().filter_map(obj_of).collect();
                (
                    o,
                    CacheItem {
                        parent: p,
                        index: None,
                        child_count: None,
                        children: Some(kids),
                        interfaces: strs(ifaces),
                        name: name.clone(),
                        role: *role,
                        description: desc.clone(),
                        states: states.clone(),
                    },
                )
            }),
            _ => None,
        };
        if let Some((obj, item)) = parsed {
            items.insert(obj, item);
        }
    }
    // Children from parent links and indices.
    let mut by_parent: HashMap<ObjRef, Vec<(i32, ObjRef)>> = HashMap::new();
    for (obj, item) in &items {
        if let Some(index) = item.index {
            by_parent
                .entry(item.parent.clone())
                .or_default()
                .push((index, obj.clone()));
        }
    }
    // Role names: one GetRoleName for a representative of each role number.
    let mut representatives: BTreeMap<u32, ObjRef> = BTreeMap::new();
    for (obj, item) in &items {
        representatives.entry(item.role).or_insert_with(|| obj.clone());
    }
    let reps: Vec<(u32, ObjRef)> = representatives.into_iter().collect();
    let calls: Vec<MethodCall> = reps
        .iter()
        .map(|(_, o)| MethodCall {
            dest: &o.bus,
            path: &o.path,
            iface: ACCESSIBLE,
            member: "GetRoleName",
            args: &[],
        })
        .collect();
    report.role_lookups = calls.len();
    let mut role_names: HashMap<u32, String> = HashMap::new();
    for ((number, _), result) in reps.iter().zip(call_all(bus, &calls, true)?) {
        if let Ok(values) = result
            && let Some(name) = values.first().and_then(Value::as_str)
        {
            role_names.insert(*number, name.to_string());
        }
    }
    let mut seed = tree::Seed::default();
    for (obj, item) in &items {
        let children = match (&item.children, item.child_count) {
            (Some(kids), _) => Some(kids.clone()),
            (None, Some(count)) if count >= 0 => {
                let mut kids = by_parent.get(obj).cloned().unwrap_or_default();
                kids.sort_by_key(|(i, _)| *i);
                if kids.len() == count as usize && kids.iter().all(|(i, _)| *i >= 0) {
                    Some(kids.into_iter().map(|(_, o)| o).collect())
                } else {
                    None
                }
            }
            _ => None,
        };
        if children.is_none() {
            report.children_fallbacks += 1;
        }
        seed.nodes.insert(
            obj.clone(),
            tree::SeedNode {
                role: role_names.get(&item.role).cloned(),
                name: Some(item.name.clone()).filter(|s| !s.is_empty()),
                description: Some(item.description.clone()).filter(|s| !s.is_empty()),
                states: tree::decode_states(&item.states),
                has_action: Some(item.interfaces.iter().any(|i| i == tree::ACTION)),
                children,
            },
        );
    }
    report.seeded = seed.nodes.len();
    Ok((seed, report))
}
