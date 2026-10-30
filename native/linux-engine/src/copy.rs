//! The application's own Copy, through AT-SPI (behaviour §12.1 step 6, §13.1), for `clipboard_read`: the window's
//! focused element, then the vendor's route choice for it. An element with `EditableText` copies its one selected
//! range with `CopyText`; one with a `showContextMenu` action opens its context menu and activates the item labelled
//! Copy. `PasteText`, `InsertText` and `SetTextContents` are never called (Constraints).

use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

use anyhow::Result;

use crate::dbus::{Arg, Bus, CallResult, MethodCall, Value};
use crate::tree::{self, Field, MAX_DEPTH, NODE_LIMIT, ObjRef, Transport};

const EDITABLE_TEXT: &str = "org.a11y.atspi.EditableText";
const TEXT: &str = "org.a11y.atspi.Text";
const PROPERTIES: &str = "org.freedesktop.DBus.Properties";
const ROOT_PATH: &str = "/org/a11y/atspi/accessible/root";
/// The `focused` state bit (AT-SPI's `ATSPI_STATE_FOCUSED`).
const FOCUSED: u32 = 12;
/// Calls in flight at most while the focus is looked for: the tree read's W.
const IN_FLIGHT: usize = 32;
/// How long a context menu may take to open and list its items.
const MENU_WAIT: Duration = Duration::from_secs(1);
const MENU_POLL: Duration = Duration::from_millis(20);
/// A context menu's own tree is small; these bound the search in a frame that is not one.
const MENU_NODES: usize = 500;
const MENU_DEPTH: u32 = 16;

/// Sends `calls` with at most [`IN_FLIGHT`] outstanding and returns their results in order.
fn call_all<T: Transport>(t: &mut T, calls: &[(&ObjRef, Field)]) -> Result<Vec<CallResult>> {
    let mut results: Vec<Option<CallResult>> = vec![None; calls.len()];
    let mut pending: HashMap<u32, usize> = HashMap::new();
    let mut next = 0;
    while next < calls.len() || !pending.is_empty() {
        while next < calls.len() && pending.len() < IN_FLIGHT {
            let (obj, field) = calls[next];
            pending.insert(t.send(obj, field)?, next);
            next += 1;
        }
        let (serial, result) = t.recv()?;
        if let Some(i) = pending.remove(&serial) {
            results[i] = Some(result);
        }
    }
    Ok(results.into_iter().map(|r| r.expect("every call answered")).collect())
}

fn children_of(result: &CallResult) -> Vec<ObjRef> {
    let Ok(values) = result else { return Vec::new() };
    let Some(Value::Array(items)) = values.first() else {
        return Vec::new();
    };
    items
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
        .collect()
}

fn is_focused(result: &CallResult) -> bool {
    match result {
        Ok(values) => match values.first() {
            Some(Value::Array(words)) => matches!(words.first(), Some(Value::U32(w)) if w & (1 << FOCUSED) != 0),
            _ => false,
        },
        Err(_) => false,
    }
}

/// A node seen by the focus search: its children and whether it has focus.
struct Seen {
    children: Vec<ObjRef>,
    focused: bool,
}

/// Each object's children and focus, fetched together.
fn fetch<T: Transport>(t: &mut T, objs: &[ObjRef]) -> Result<Vec<Seen>> {
    let calls: Vec<(&ObjRef, Field)> = objs
        .iter()
        .flat_map(|o| [(o, Field::Children), (o, Field::State)])
        .collect();
    let results = call_all(t, &calls)?;
    Ok(results
        .chunks(2)
        .map(|pair| Seen {
            children: children_of(&pair[0]),
            focused: is_focused(&pair[1]),
        })
        .collect())
}

/// The window's focused element, as the vendor finds it: the first node with the `focused` state in a post-order
/// walk of the frame (children before their parent, so the deepest focused node wins), within the tree read's
/// limits. Siblings are fetched together, a few at a time, so a node costs no round trip of its own.
pub fn focused<T: Transport>(t: &mut T, frame: &ObjRef) -> Result<Option<ObjRef>> {
    let mut visited = 1;
    let root = fetch(t, std::slice::from_ref(frame))?.pop().expect("one");
    visit(t, frame, root, 0, &mut visited)
}

fn visit<T: Transport>(t: &mut T, obj: &ObjRef, seen: Seen, depth: u32, visited: &mut u32) -> Result<Option<ObjRef>> {
    if depth < MAX_DEPTH {
        for batch in seen.children.chunks(IN_FLIGHT / 2) {
            if *visited >= NODE_LIMIT {
                break;
            }
            let fetched = fetch(t, batch)?;
            for (child, child_seen) in batch.iter().zip(fetched) {
                if *visited >= NODE_LIMIT {
                    break;
                }
                *visited += 1;
                if let Some(found) = visit(t, child, child_seen, depth + 1, visited)? {
                    return Ok(Some(found));
                }
            }
        }
    }
    Ok(seen.focused.then(|| obj.clone()))
}

/// Whether a menu item's accessible name is `label`: the label alone, or followed by its shortcut as one token with
/// a `+` (`Copy Ctrl+C`), never by other words (`Copy link address`, `Paste and search for …`).
pub fn menu_item_is(name: &str, label: &str) -> bool {
    let name = name.trim();
    let Some(rest) = name.strip_prefix(label) else {
        return false;
    };
    if rest.is_empty() {
        return true;
    }
    let shortcut = rest.trim_start();
    shortcut.len() < rest.len() && !shortcut.contains(char::is_whitespace) && shortcut.contains('+')
}

fn call(bus: &mut Bus, obj: &ObjRef, iface: &str, member: &str, args: &[Arg]) -> Result<CallResult> {
    bus.call(&MethodCall {
        dest: &obj.bus,
        path: &obj.path,
        iface,
        member,
        args,
    })
}

fn int_of(result: &CallResult) -> Option<i32> {
    match result.as_ref().ok()?.first()?.unvariant() {
        Value::I32(n) => Some(*n),
        _ => None,
    }
}

/// Copies from the focused element by the vendor's route choice; the sentence when it cannot.
pub fn copy(bus: &mut Bus, element: &ObjRef) -> Result<std::result::Result<(), String>> {
    let interfaces = tree::with_call(element, Field::Interfaces, |c| bus.call(c))?;
    let interfaces: Vec<String> = match interfaces.as_ref().ok().and_then(|v| v.first()) {
        Some(Value::Array(items)) => items.iter().filter_map(|v| v.as_str().map(str::to_string)).collect(),
        _ => Vec::new(),
    };
    if interfaces.iter().any(|i| i == EDITABLE_TEXT) {
        return editable_copy(bus, element);
    }
    if interfaces.iter().any(|i| i == tree::ACTION)
        && let Ok(names) = crate::atspi::action_names(bus, element)?
    {
        let menus: Vec<usize> = names
            .iter()
            .enumerate()
            .filter(|(_, n)| n.eq_ignore_ascii_case("showcontextmenu"))
            .map(|(i, _)| i)
            .collect();
        if let [index] = menus.as_slice() {
            return context_menu_item(bus, element, *index as u32, "Copy");
        }
    }
    Ok(Err(
        "focused element offers no Copy: it has no editable text and no context menu".into(),
    ))
}

/// `EditableText.CopyText` of the element's one selected range.
fn editable_copy(bus: &mut Bus, element: &ObjRef) -> Result<std::result::Result<(), String>> {
    let count = call(
        bus,
        element,
        PROPERTIES,
        "Get",
        &[Arg::Str(TEXT), Arg::Str("CharacterCount")],
    )?;
    let selections = call(bus, element, TEXT, "GetNSelections", &[])?;
    let Some(count) = int_of(&count) else {
        return Ok(Err("editable element did not return a character count".into()));
    };
    match int_of(&selections) {
        Some(0) => return Ok(Err("editable element has no selected text to Copy".into())),
        Some(1) => {}
        Some(_) => {
            return Ok(Err(
                "editable element has more than one text selection; select one range to Copy".into(),
            ));
        }
        None => return Ok(Err("editable element did not return valid selection offsets".into())),
    }
    let range = call(bus, element, TEXT, "GetSelection", &[Arg::I32(0)])?;
    let (start, end) = match range.as_ref().ok().map(Vec::as_slice) {
        Some([Value::I32(a), Value::I32(b), ..]) => (*a.min(b), *a.max(b)),
        _ => return Ok(Err("editable element did not return valid selection offsets".into())),
    };
    if start == end {
        return Ok(Err("editable element has no selected text to Copy".into()));
    }
    if start < 0 || end > count {
        return Ok(Err(
            "editable element returned selection offsets outside its text".into()
        ));
    }
    Ok(call(
        bus,
        element,
        EDITABLE_TEXT,
        "CopyText",
        &[Arg::I32(start), Arg::I32(end)],
    )?
    .map(|_| ()))
}

/// Opens the element's context menu and activates its item labelled `label`: the menu is a new child of the
/// element's application, searched for a `menu item` of that name until it appears or the wait ends.
fn context_menu_item(
    bus: &mut Bus,
    element: &ObjRef,
    action: u32,
    label: &str,
) -> Result<std::result::Result<(), String>> {
    let app = ObjRef {
        bus: element.bus.clone(),
        path: ROOT_PATH.into(),
    };
    let app_children = |bus: &mut Bus| -> Result<Vec<ObjRef>> {
        Ok(children_of(&tree::with_call(&app, Field::Children, |c| bus.call(c))?))
    };
    let before: HashSet<ObjRef> = app_children(bus)?.into_iter().collect();
    if let Err(e) = crate::atspi::do_action(bus, element, action)? {
        return Ok(Err(e));
    }
    let deadline = Instant::now() + MENU_WAIT;
    let mut opened = false;
    loop {
        for frame in app_children(bus)?.into_iter().filter(|c| !before.contains(c)) {
            let (item, items) = find_menu_item(bus, &frame, label)?;
            opened |= items > 0;
            if let Some(item) = item {
                return crate::atspi::do_action(bus, &item, 0);
            }
        }
        if Instant::now() >= deadline {
            return Ok(Err(if opened {
                format!("native menu opened without an available {label}; no clipboard action was sent")
            } else {
                "context menu did not open; no clipboard action was sent".to_string()
            }));
        }
        std::thread::sleep(MENU_POLL);
    }
}

/// A preorder search of `frame` for a `menu item` named `label`; also how many menu items it saw.
fn find_menu_item(bus: &mut Bus, frame: &ObjRef, label: &str) -> Result<(Option<ObjRef>, usize)> {
    let mut stack = vec![(frame.clone(), 0u32)];
    let mut seen = 0;
    let mut items = 0;
    while let Some((obj, depth)) = stack.pop() {
        seen += 1;
        if seen > MENU_NODES {
            break;
        }
        if crate::atspi::role_name(bus, &obj)?.as_deref() == Some("menu item") {
            items += 1;
            let name = tree::with_call(&obj, Field::Name, |c| bus.call(c))?;
            if let Some(Value::Str(name)) = name.as_ref().ok().and_then(|v| v.first()).map(Value::unvariant)
                && menu_item_is(name, label)
            {
                return Ok((Some(obj), items));
            }
            continue;
        }
        if depth < MENU_DEPTH {
            let children = children_of(&tree::with_call(&obj, Field::Children, |c| bus.call(c))?);
            stack.extend(children.into_iter().rev().map(|c| (c, depth + 1)));
        }
    }
    Ok((None, items))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;

    #[test]
    fn a_menu_item_is_its_label_alone_or_with_its_shortcut() {
        assert!(menu_item_is("Copy", "Copy"));
        assert!(menu_item_is("Copy Ctrl+C", "Copy"));
        assert!(menu_item_is("  Copy  Shift+Ctrl+C ", "Copy"));
        assert!(menu_item_is("Paste Ctrl+V", "Paste"));
        assert!(!menu_item_is("Paste and search for “a+b”", "Paste"));
        assert!(!menu_item_is("Copy link address", "Copy"));
        assert!(
            !menu_item_is("Copy image", "Copy"),
            "one word without a + is not a shortcut"
        );
        assert!(!menu_item_is("Copying", "Copy"));
        assert!(!menu_item_is("Cut Ctrl+X", "Copy"));
    }

    /// A fake bus answering `GetChildren` and `GetState` from a map; every wait answers all calls sent before it.
    struct Fake {
        nodes: HashMap<String, (Vec<&'static str>, bool)>,
        sent: VecDeque<(u32, String, Field)>,
        next: u32,
        waits: u32,
        max_in_flight: usize,
        calls: u32,
    }

    impl Fake {
        fn new(nodes: &[(&'static str, &[&'static str], bool)]) -> Fake {
            Fake {
                nodes: nodes
                    .iter()
                    .map(|(p, c, f)| (p.to_string(), (c.to_vec(), *f)))
                    .collect(),
                sent: VecDeque::new(),
                next: 1,
                waits: 0,
                max_in_flight: 0,
                calls: 0,
            }
        }
    }

    impl Transport for Fake {
        fn send(&mut self, obj: &ObjRef, field: Field) -> Result<u32> {
            let serial = self.next;
            self.next += 1;
            self.calls += 1;
            self.sent.push_back((serial, obj.path.clone(), field));
            self.max_in_flight = self.max_in_flight.max(self.sent.len());
            Ok(serial)
        }

        fn recv(&mut self) -> Result<(u32, CallResult)> {
            self.waits += 1;
            let (serial, path, field) = self.sent.pop_front().expect("a call is outstanding");
            let (children, focused) = self.nodes.get(&path).cloned().unwrap_or_default();
            let result: CallResult = match field {
                Field::Children => Ok(vec![Value::Array(
                    children
                        .iter()
                        .map(|c| Value::Struct(vec![Value::Str(":1.2".into()), Value::Path(c.to_string())]))
                        .collect(),
                )]),
                Field::State => Ok(vec![Value::Array(vec![
                    Value::U32(if focused { 1 << FOCUSED } else { 0 }),
                    Value::U32(0),
                ])]),
                other => panic!("unexpected {other:?}"),
            };
            Ok((serial, result))
        }

        fn try_recv(&mut self) -> Result<Option<(u32, CallResult)>> {
            Ok(None)
        }

        fn in_flight(&self) -> usize {
            self.sent.len()
        }

        fn staged_bytes(&self) -> usize {
            0
        }
    }

    fn obj(path: &str) -> ObjRef {
        ObjRef {
            bus: ":1.2".into(),
            path: path.into(),
        }
    }

    #[test]
    fn the_focus_is_the_first_focused_node_in_post_order() {
        // /f(focused) has children /a(focused) and /b; /a has child /c (focused): post-order visits /c first.
        let mut t = Fake::new(&[
            ("/f", &["/a", "/b"], true),
            ("/a", &["/c"], true),
            ("/c", &[], true),
            ("/b", &[], false),
        ]);
        assert_eq!(focused(&mut t, &obj("/f")).unwrap(), Some(obj("/c")));
        let mut t = Fake::new(&[
            ("/f", &["/a", "/b"], false),
            ("/a", &["/c"], false),
            ("/c", &[], false),
            ("/b", &["/d"], false),
            ("/d", &[], true),
        ]);
        assert_eq!(focused(&mut t, &obj("/f")).unwrap(), Some(obj("/d")));
        let mut t = Fake::new(&[("/f", &["/a"], false), ("/a", &[], false)]);
        assert_eq!(focused(&mut t, &obj("/f")).unwrap(), None);
    }

    #[test]
    fn siblings_are_fetched_together_within_the_window() {
        let wide: Vec<&'static str> = (0..100)
            .map(|i| &*Box::leak(format!("/w{i}").into_boxed_str()))
            .collect();
        let mut nodes: Vec<(&'static str, &[&'static str], bool)> = vec![("/f", &wide, false)];
        for (i, w) in wide.iter().enumerate() {
            nodes.push((w, &[], i == 99));
        }
        let mut t = Fake::new(&nodes);
        assert_eq!(focused(&mut t, &obj("/f")).unwrap(), Some(obj("/w99")));
        assert!(t.max_in_flight <= IN_FLIGHT, "{}", t.max_in_flight);
        assert_eq!(t.calls, 2 + 200, "children and state for the frame and each child");
        let mut early = Fake::new(&[("/f", &wide, false), ("/w0", &[], true)]);
        assert_eq!(focused(&mut early, &obj("/f")).unwrap(), Some(obj("/w0")));
        assert_eq!(
            early.calls,
            2 + 2 * 16,
            "a focus found early stops fetching after its batch"
        );
    }

    #[test]
    fn the_search_stops_at_the_depth_limit() {
        let paths: Vec<&'static str> = (0..70)
            .map(|i| &*Box::leak(format!("/d{i}").into_boxed_str()))
            .collect();
        let mut nodes: Vec<(&'static str, &[&'static str], bool)> = Vec::new();
        for i in 0..70 {
            let child: &'static [&'static str] = if i + 1 < 70 {
                Box::leak(Box::new([paths[i + 1]]))
            } else {
                &[]
            };
            nodes.push((paths[i], child, i == 69));
        }
        let mut t = Fake::new(&nodes);
        assert_eq!(
            focused(&mut t, &obj("/d0")).unwrap(),
            None,
            "a focus deeper than 63 is not reached"
        );
    }
}
