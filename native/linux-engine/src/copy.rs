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
pub const MENU_WAIT: Duration = Duration::from_secs(1);
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

/// `walk` (a [`focused`] walk) again every `poll` while it finds nothing, for at most `bound` after the first: what it
/// found, or None once the bound has passed, and the time it took. A zero bound walks once. A walk that fails is the
/// error.
pub fn until_focused<F>(
    bound: Duration,
    poll: Duration,
    mut walk: impl FnMut() -> Result<Option<F>>,
) -> Result<(Option<F>, Duration)> {
    let started = Instant::now();
    loop {
        if let Some(found) = walk()? {
            return Ok((Some(found), started.elapsed()));
        }
        if started.elapsed() >= bound {
            return Ok((None, started.elapsed()));
        }
        std::thread::sleep(poll);
    }
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

/// Why nothing was copied: the sentence, and whether a context menu the Copy opened is still open, which the caller
/// closes (with Escape) so the request leaves no menu behind, its answer then saying what the Escape did
/// ([`after_escape`]).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Refused {
    pub sentence: String,
    pub menu_open: bool,
}

/// A refusal that left the Copy's context menu open, with what was done to close it: an Escape sent, which is all
/// that is known (whether the menu then closed is not observed), or an Escape that could not be sent.
pub fn after_escape(sentence: &str, escape: std::result::Result<(), &anyhow::Error>) -> String {
    match escape {
        Ok(()) => format!("{sentence}; an Escape was sent to close the menu the Copy opened"),
        Err(error) => format!(
            "{sentence}; the menu the Copy opened may still be open: an Escape to close it could not be sent \
             ({error:#})"
        ),
    }
}

impl From<String> for Refused {
    fn from(sentence: String) -> Refused {
        Refused {
            sentence,
            menu_open: false,
        }
    }
}

/// Asked just before `CopyText`: whether the window's association still names the frame the element was found in
/// (`atspi::Associated::confirm`).
pub type Confirm<'a> = dyn FnMut(&mut Bus) -> Result<bool> + 'a;

/// What the Copy may do for X11 window `window`: `confirm` refuses `CopyText` once the association has changed, and
/// `menu_refused`, when given, refuses the context-menu route before it opens a menu, since a menu cannot be bound
/// to the window (`atspi::Associated::context_menu_refusal`).
pub struct Guard<'a, 'c> {
    pub window: u32,
    pub confirm: &'a mut Confirm<'c>,
    pub menu_refused: Option<String>,
}

/// The route a Copy took: the element's own `CopyText`, or its context menu's Copy item.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CopyRoute {
    Text,
    Menu,
}

/// The answer to a Copy whose clipboard change did not come within `COPY_WAIT`. The application may still serve it
/// later; and after a context-menu Copy, Chrome's menus on that window have been seen to stay unresponsive (task 77's
/// L3a: every later Copy then found no menu). Nothing is sent to recover, since no recovery is proven harmless to the
/// page (an Escape with no menu up reaches it).
pub fn timed_out(route: CopyRoute) -> &'static str {
    match route {
        CopyRoute::Text => "clipboard update timed out",
        CopyRoute::Menu => {
            "clipboard update timed out; the application may still complete the Copy later, and its menus on this \
             window may stay unresponsive"
        }
    }
}

/// Copies from the focused element by the vendor's route choice, answering the route it took; why not when it cannot,
/// or when `guard` refuses.
pub fn copy(bus: &mut Bus, element: &ObjRef, guard: Guard) -> Result<std::result::Result<CopyRoute, Refused>> {
    let Guard {
        window,
        confirm,
        menu_refused,
    } = guard;
    let interfaces = tree::with_call(element, Field::Interfaces, |c| bus.call(c))?;
    let interfaces: Vec<String> = match interfaces.as_ref().ok().and_then(|v| v.first()) {
        Some(Value::Array(items)) => items.iter().filter_map(|v| v.as_str().map(str::to_string)).collect(),
        _ => Vec::new(),
    };
    if interfaces.iter().any(|i| i == EDITABLE_TEXT) {
        return Ok(editable_copy(bus, element, window, confirm)?
            .map(|()| CopyRoute::Text)
            .map_err(Refused::from));
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
            if let Some(sentence) = menu_refused {
                return Ok(Err(sentence.into()));
            }
            return Ok(
                context_menu_item(bus, element, *index as u32, "Copy", crate::atspi::do_action)?
                    .map(|()| CopyRoute::Menu),
            );
        }
    }
    Ok(Err(Refused::from(
        "focused element offers no Copy: it has no editable text and no context menu".to_string(),
    )))
}

/// `EditableText.CopyText` of the element's one selected range.
fn editable_copy(
    bus: &mut Bus,
    element: &ObjRef,
    window: u32,
    confirm: &mut Confirm,
) -> Result<std::result::Result<(), String>> {
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
    #[cfg(test)]
    crate::fault::identity(crate::fault::Identity::CopyText);
    if !confirm(bus)? {
        return Ok(Err(crate::atspi::changed_before_acting(window)));
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

/// Opens the element's context menu and activates its item labelled `label` ([`open_menu`]). Which window opened a
/// menu the application's children do not say, so only the vendor's own association takes this route.
fn context_menu_item<T: Transport>(
    t: &mut T,
    element: &ObjRef,
    action: u32,
    label: &str,
    do_action: impl Fn(&mut T, &ObjRef, u32) -> Result<std::result::Result<(), String>>,
) -> Result<std::result::Result<(), Refused>> {
    let menu = open_menu(t, element, Some(label), MENU_WAIT, |t| do_action(t, element, action))?;
    Ok(match menu {
        Err(sentence) => Err(sentence.into()),
        // the menu is open: a refusal now says so, and the caller closes it
        Ok(Menu::Item(item)) => do_action(t, &item, 0)?.map_err(|sentence| Refused {
            sentence,
            menu_open: true,
        }),
        Ok(Menu::Opened) => Err(Refused {
            sentence: format!("native menu opened without an available {label}; no clipboard action was sent"),
            menu_open: true,
        }),
        // A menu that opens after the wait is not seen, and so not closed: an Escape sent without one open would
        // reach the application itself.
        Ok(Menu::Absent) => Err("context menu did not open; no clipboard action was sent"
            .to_string()
            .into()),
    })
}

/// What a context menu asked for showed ([`open_menu`]).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Menu {
    /// A menu appeared, holding the item asked for.
    Item(ObjRef),
    /// A menu appeared; when an item was asked for, it holds none of that label.
    Opened,
    /// No menu appeared within the wait.
    Absent,
}

/// Asks for `element`'s context menu with `open` (its `showContextMenu` action) and watches for it: the detection
/// every caller of that action shares. A menu is a child of the element's application that was not among its
/// children just before `open`, holding at least one `menu item`. Without `label` the first such menu confirms; with
/// one, the new children are searched for the item of that name until it is found or the wait ends. A menu already
/// open when the action is asked for is among the children before, so it confirms nothing by itself: only a menu
/// that appears beside it, or replaces it as a new child, does. `open`'s refusal is the answer, with no wait.
///
/// The wait is one deadline over every read after `open`, the search included: a read it cuts off is abandoned, not
/// waited for, and none starts after it. So an application that answers slowly or not at all is answered at the
/// wait's end, and a menu not seen by then counts as none, whatever a later read would have shown.
pub fn open_menu<T: Transport>(
    t: &mut T,
    element: &ObjRef,
    label: Option<&str>,
    wait: Duration,
    open: impl FnOnce(&mut T) -> Result<std::result::Result<(), String>>,
) -> Result<std::result::Result<Menu, String>> {
    let app = ObjRef {
        bus: element.bus.clone(),
        path: ROOT_PATH.into(),
    };
    let before: HashSet<ObjRef> = children_of(&call_one(t, &app, Field::Children)?).into_iter().collect();
    if let Err(sentence) = open(t)? {
        return Ok(Err(sentence));
    }
    #[cfg(test)]
    crate::fault::identity(crate::fault::Identity::MenuLookup);
    let deadline = Instant::now() + wait;
    let mut opened = false;
    while let Some(listed) = call_by(t, &app, Field::Children, deadline)? {
        for frame in children_of(&listed).into_iter().filter(|c| !before.contains(c)) {
            match search_menu(t, &frame, label, deadline)? {
                Search::Item(item) => return Ok(Ok(Menu::Item(item))),
                Search::Items if label.is_none() => return Ok(Ok(Menu::Opened)),
                Search::Items => opened = true,
                Search::Nothing => {}
            }
        }
        std::thread::sleep(MENU_POLL.min(deadline.saturating_duration_since(Instant::now())));
    }
    Ok(Ok(if opened { Menu::Opened } else { Menu::Absent }))
}

/// One call, awaited alone: nothing else is in flight while a menu is looked for.
fn call_one<T: Transport>(t: &mut T, obj: &ObjRef, field: Field) -> Result<CallResult> {
    let token = t.send(obj, field)?;
    loop {
        let (got, result) = t.recv()?;
        if got == token {
            return Ok(result);
        }
    }
}

/// One call, awaited alone no later than `deadline`; None once the deadline has passed, with nothing sent after it.
fn call_by<T: Transport>(t: &mut T, obj: &ObjRef, field: Field, deadline: Instant) -> Result<Option<CallResult>> {
    if Instant::now() >= deadline {
        return Ok(None);
    }
    t.call_until(obj, field, deadline)
}

/// What a search of a new child found: the item asked for, menu items but not it, or no menu item at all.
enum Search {
    Item(ObjRef),
    Items,
    Nothing,
}

/// A preorder search of `frame` for a `menu item`: the first one when `label` is None, else one named `label`. The
/// deadline ends it as it ends the wait, with what it had found by then.
fn search_menu<T: Transport>(t: &mut T, frame: &ObjRef, label: Option<&str>, deadline: Instant) -> Result<Search> {
    let mut stack = vec![(frame.clone(), 0u32)];
    let mut seen = 0;
    let mut items = false;
    while let Some((obj, depth)) = stack.pop() {
        seen += 1;
        if seen > MENU_NODES {
            break;
        }
        let Some(role) = call_by(t, &obj, Field::Role, deadline)? else {
            break;
        };
        if role.as_ref().ok().and_then(|v| v.first()).and_then(Value::as_str) == Some("menu item") {
            let Some(label) = label else {
                return Ok(Search::Items);
            };
            items = true;
            let Some(name) = call_by(t, &obj, Field::Name, deadline)? else {
                break;
            };
            if let Some(Value::Str(name)) = name.as_ref().ok().and_then(|v| v.first()).map(Value::unvariant)
                && menu_item_is(name, label)
            {
                return Ok(Search::Item(obj));
            }
            continue;
        }
        if depth < MENU_DEPTH {
            let Some(children) = call_by(t, &obj, Field::Children, deadline)? else {
                break;
            };
            stack.extend(children_of(&children).into_iter().rev().map(|c| (c, depth + 1)));
        }
    }
    Ok(if items { Search::Items } else { Search::Nothing })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::collections::VecDeque;

    #[test]
    fn a_menu_left_open_is_said_to_have_had_an_escape_sent_never_to_have_closed() {
        let open = "native menu opened without an available Copy; no clipboard action was sent";
        assert_eq!(
            after_escape(open, Ok(())),
            "native menu opened without an available Copy; no clipboard action was sent; an Escape was sent to close \
             the menu the Copy opened"
        );
        assert_eq!(
            after_escape(open, Err(&anyhow::anyhow!("BadWindow"))),
            "native menu opened without an available Copy; no clipboard action was sent; the menu the Copy opened may \
             still be open: an Escape to close it could not be sent (BadWindow)"
        );
    }

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

        fn call_until(&mut self, obj: &ObjRef, field: Field, _deadline: Instant) -> Result<Option<CallResult>> {
            let serial = self.send(obj, field)?;
            let (got, result) = self.recv()?;
            assert_eq!(got, serial, "nothing else is in flight");
            Ok(Some(result))
        }
    }

    pub(crate) fn obj(path: &str) -> ObjRef {
        ObjRef {
            bus: ":1.2".into(),
            path: path.into(),
        }
    }

    #[test]
    fn a_focus_found_late_is_found_by_walking_again_and_none_found_ends_at_the_bound() {
        let poll = Duration::from_millis(1);
        let bound = Duration::from_millis(40);
        // found on the first walk: one walk, no wait
        let mut walks = 0;
        let (found, took) = until_focused(bound, poll, || {
            walks += 1;
            Ok(Some("entry"))
        })
        .unwrap();
        assert_eq!((found, walks), (Some("entry"), 1));
        assert!(took < bound, "{took:?}");
        // reported on the third walk: found then, before the bound
        let mut walks = 0;
        let (found, took) = until_focused(bound, poll, || {
            walks += 1;
            Ok((walks == 3).then_some("entry"))
        })
        .unwrap();
        assert_eq!((found, walks), (Some("entry"), 3));
        assert!(took < bound, "{took:?}");
        // never reported: None once the bound has passed, in short steps
        let mut walks = 0;
        let (found, took) = until_focused(bound, poll, || {
            walks += 1;
            Ok(None::<&str>)
        })
        .unwrap();
        assert_eq!(found, None);
        assert!(took >= bound && took < bound * 5, "{took:?}");
        assert!(walks > 2, "walked again in steps: {walks}");
        // a zero bound walks once
        let mut walks = 0;
        let (found, _) = until_focused(Duration::ZERO, poll, || {
            walks += 1;
            Ok(None::<&str>)
        })
        .unwrap();
        assert_eq!((found, walks), (None, 1));
        // a walk that fails is the error
        let failed = until_focused(bound, poll, || Err::<Option<&str>, _>(anyhow::anyhow!("bus gone")));
        assert_eq!(failed.unwrap_err().to_string(), "bus gone");
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

    /// A fake bus for the context-menu detection: objects with a role, a name and children, answering `GetRoleName`,
    /// the name and `GetChildren` one call at a time. `appear` holds children the application gains at its `n`th
    /// read of its children after the action, as a menu that takes a few polls to open; `appear_after` one it gains
    /// at its first read that long after the action. After the action, `latency` delays each reply, and `hung` stops
    /// the application answering at all, so a wait without a deadline ends only at the bus's silence timeout.
    #[derive(Default)]
    pub(crate) struct MenuBus {
        nodes: HashMap<String, (&'static str, &'static str, Vec<String>)>,
        pub(crate) appear: Vec<(u32, String)>,
        pub(crate) appear_after: Option<(Duration, String)>,
        pub(crate) latency: Option<fn(&str, Field) -> Duration>,
        pub(crate) hung: bool,
        pub(crate) app_reads: u32,
        pub(crate) acted: bool,
        acted_at: Option<Instant>,
        sent: VecDeque<(u32, String, Field)>,
        /// The calls sent so far.
        pub(crate) next: u32,
    }

    const APP: &str = "/org/a11y/atspi/accessible/root";

    impl MenuBus {
        fn node(mut self, path: &str, role: &'static str, name: &'static str, children: &[&str]) -> MenuBus {
            self.nodes.insert(
                path.into(),
                (role, name, children.iter().map(|c| c.to_string()).collect()),
            );
            self
        }

        /// A menu of `items` (menu item names) under a window `path`, not yet the application's child.
        fn menu(self, path: &str, items: &[&'static str]) -> MenuBus {
            let menu = format!("{path}/menu");
            let paths: Vec<String> = (0..items.len()).map(|i| format!("{menu}/{i}")).collect();
            let refs: Vec<&str> = paths.iter().map(String::as_str).collect();
            let mut bus = self.node(path, "window", "", &[&menu]).node(&menu, "menu", "", &refs);
            for (p, name) in paths.iter().zip(items) {
                bus = bus.node(p, "menu item", name, &[]);
            }
            bus
        }

        pub(crate) fn app_children(&mut self) -> &mut Vec<String> {
            &mut self.nodes.get_mut(APP).expect("the application").2
        }

        /// The action: the children `appear` and `appear_after` list from their read on.
        pub(crate) fn act(&mut self) -> Result<std::result::Result<(), String>> {
            self.acted = true;
            self.acted_at = Some(Instant::now());
            Ok(Ok(()))
        }

        /// How long the reply to a call sent now takes; None when it never comes.
        fn delay(&self, path: &str, field: Field) -> Option<Duration> {
            match (self.acted, self.hung, self.latency) {
                (true, true, _) => None,
                (true, false, Some(latency)) => Some(latency(path, field)),
                _ => Some(Duration::ZERO),
            }
        }

        fn answer(&mut self, path: &str, field: Field) -> CallResult {
            if path == APP
                && field == Field::Children
                && let Some(acted_at) = self.acted_at
            {
                self.app_reads += 1;
                let reads = self.app_reads;
                let mut due: Vec<String> = self
                    .appear
                    .iter()
                    .filter(|(n, _)| *n == reads)
                    .map(|(_, c)| c.clone())
                    .collect();
                if let Some((after, child)) = self.appear_after.clone()
                    && acted_at.elapsed() >= after
                    && !self.app_children().contains(&child)
                {
                    due.push(child);
                }
                self.app_children().extend(due);
            }
            let Some((role, name, children)) = self.nodes.get(path).cloned() else {
                return Err("unknown object".into());
            };
            match field {
                Field::Role => Ok(vec![Value::Str(role.into())]),
                Field::Name => Ok(vec![Value::Variant(Box::new(Value::Str(name.into())))]),
                Field::Children => Ok(vec![Value::Array(
                    children
                        .iter()
                        .map(|c| Value::Struct(vec![Value::Str(":1.2".into()), Value::Path(c.clone())]))
                        .collect(),
                )]),
                other => panic!("unexpected {other:?}"),
            }
        }
    }

    impl Transport for MenuBus {
        fn send(&mut self, obj: &ObjRef, field: Field) -> Result<u32> {
            let serial = self.next;
            self.next += 1;
            self.sent.push_back((serial, obj.path.clone(), field));
            Ok(serial)
        }

        /// Waits as `Bus::recv` does: a reply that has not come within the bus's silence timeout fails its call.
        fn recv(&mut self) -> Result<(u32, CallResult)> {
            let (serial, path, field) = self.sent.pop_front().expect("a call is outstanding");
            match self.delay(&path, field) {
                Some(delay) if delay < crate::dbus::IO_TIMEOUT => {
                    std::thread::sleep(delay);
                    Ok((serial, self.answer(&path, field)))
                }
                _ => {
                    std::thread::sleep(crate::dbus::IO_TIMEOUT);
                    Ok((serial, Err("Resource temporarily unavailable (os error 11)".into())))
                }
            }
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

        /// Waits as `Bus::calls_until` does: until the reply or the deadline, whichever is first, and a reply that
        /// would come after the deadline is abandoned.
        fn call_until(&mut self, obj: &ObjRef, field: Field, deadline: Instant) -> Result<Option<CallResult>> {
            self.next += 1;
            let left = deadline.saturating_duration_since(Instant::now());
            match self.delay(&obj.path, field) {
                Some(delay) if delay <= left => {
                    std::thread::sleep(delay);
                    Ok(Some(self.answer(&obj.path, field)))
                }
                _ => {
                    std::thread::sleep(left);
                    Ok(None)
                }
            }
        }
    }

    /// The application holding its main window, with `/m` and `/m2` menus ready to appear.
    pub(crate) fn app() -> MenuBus {
        MenuBus::default()
            .node(APP, "application", "app", &["/main"])
            .node("/main", "frame", "main", &[])
            .menu("/m", &["Back", "Copy Ctrl+C", "Inspect"])
            .menu("/m2", &["Back", "Inspect"])
    }

    pub(crate) const WAIT: Duration = Duration::from_millis(100);
    /// How long past the deadline an answer may come: the call in flight then is abandoned, not waited for, so this
    /// is a wake-up's time, far under the bus's 2 s silence timeout that an unbounded read waits.
    pub(crate) const ABANDON: Duration = Duration::from_millis(50);

    fn open(bus: &mut MenuBus, label: Option<&str>) -> std::result::Result<Menu, String> {
        open_menu(bus, &obj("/main/button"), label, WAIT, MenuBus::act).unwrap()
    }

    #[test]
    fn a_menu_that_appears_as_a_new_child_of_the_application_confirms_the_request() {
        let mut bus = app();
        bus.appear = vec![(1, "/m".into())];
        assert_eq!(open(&mut bus, None), Ok(Menu::Opened));
        // a menu that takes a few polls to open is still seen
        let mut bus = app();
        bus.appear = vec![(4, "/m".into())];
        let started = Instant::now();
        assert_eq!(open(&mut bus, None), Ok(Menu::Opened));
        assert!(started.elapsed() < WAIT + MENU_POLL * 2, "{:?}", started.elapsed());
    }

    #[test]
    fn no_new_menu_within_the_wait_is_absent() {
        // nothing appears
        let mut bus = app();
        let started = Instant::now();
        assert_eq!(open(&mut bus, None), Ok(Menu::Absent));
        assert!(bus.acted, "the action was asked for");
        assert!(started.elapsed() >= WAIT, "{:?}", started.elapsed());
        // a new child that holds no menu item (a tooltip's window) is no menu
        let mut bus = app()
            .node("/tip", "window", "", &["/tip/label"])
            .node("/tip/label", "label", "tip", &[]);
        bus.appear = vec![(1, "/tip".into())];
        assert_eq!(open(&mut bus, None), Ok(Menu::Absent));
        // a menu that opens only after the wait is not seen
        let mut bus = app();
        bus.appear = vec![(1000, "/m".into())];
        assert_eq!(open(&mut bus, None), Ok(Menu::Absent));
    }

    #[test]
    fn a_menu_already_open_when_asked_for_confirms_nothing_by_itself() {
        // the menu is open before the action, and the action leaves it as it was: no new menu, absent
        let mut bus = app();
        bus.app_children().push("/m".into());
        assert_eq!(open(&mut bus, None), Ok(Menu::Absent));
        // the action replaces it with a new one, a new child of the application: confirmed
        let mut bus = app();
        bus.app_children().push("/m".into());
        bus.appear = vec![(2, "/m2".into())];
        assert_eq!(open(&mut bus, None), Ok(Menu::Opened));
    }

    #[test]
    fn an_action_refused_is_the_answer_with_no_wait() {
        let mut bus = app();
        let started = Instant::now();
        let refused = open_menu(&mut bus, &obj("/main/button"), None, Duration::from_secs(5), |_| {
            Ok(Err(
                "AT-SPI element refused action 1; refresh get_window_state() to check its state".into(),
            ))
        })
        .unwrap();
        assert_eq!(
            refused,
            Err("AT-SPI element refused action 1; refresh get_window_state() to check its state".into())
        );
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn a_labelled_search_finds_its_item_or_says_a_menu_opened_without_it() {
        let mut bus = app();
        bus.appear = vec![(1, "/m".into())];
        assert_eq!(open(&mut bus, Some("Copy")), Ok(Menu::Item(obj("/m/menu/1"))));
        // a menu without the item: opened, said at the wait's end
        let mut bus = app();
        bus.appear = vec![(1, "/m2".into())];
        let started = Instant::now();
        assert_eq!(open(&mut bus, Some("Copy")), Ok(Menu::Opened));
        assert!(started.elapsed() >= WAIT, "{:?}", started.elapsed());
        // the item found in a second menu that appears after a first without it
        let mut bus = app();
        bus.appear = vec![(1, "/m2".into()), (3, "/m".into())];
        assert_eq!(open(&mut bus, Some("Copy")), Ok(Menu::Item(obj("/m/menu/1"))));
        // no menu at all
        let mut bus = app();
        assert_eq!(open(&mut bus, Some("Copy")), Ok(Menu::Absent));
    }

    /// `open_menu` on `bus` for `label`, with how long it took from just before the action.
    fn timed(bus: &mut MenuBus, label: Option<&str>) -> (std::result::Result<Menu, String>, Duration) {
        let started = Instant::now();
        let menu = open(bus, label);
        (menu, started.elapsed())
    }

    #[test]
    fn a_reply_that_would_come_after_the_deadline_is_no_menu_and_is_not_waited_for() {
        for label in [None, Some("Copy")] {
            // the application's children, read after the action, answer 500 ms late, with the menu among them
            let mut bus = app();
            bus.appear = vec![(1, "/m".into())];
            bus.latency = Some(|path, field| {
                if path == APP && field == Field::Children {
                    Duration::from_millis(500)
                } else {
                    Duration::ZERO
                }
            });
            let (menu, took) = timed(&mut bus, label);
            assert_eq!(menu, Ok(Menu::Absent), "{label:?}");
            assert!(took >= WAIT && took < WAIT + ABANDON, "{label:?}: {took:?}");
        }
    }

    #[test]
    fn a_menu_first_visible_after_the_deadline_is_no_menu() {
        for label in [None, Some("Copy")] {
            let mut bus = app();
            bus.appear_after = Some((WAIT, "/m".into()));
            let (menu, took) = timed(&mut bus, label);
            assert_eq!(menu, Ok(Menu::Absent), "{label:?}");
            assert!(took >= WAIT && took < WAIT + ABANDON, "{label:?}: {took:?}");
        }
    }

    #[test]
    fn a_search_the_deadline_cuts_off_is_no_menu() {
        for label in [None, Some("Copy")] {
            // the menu is a new child at once, but each role in it takes 40 ms: the deadline comes before its items
            let mut bus = app();
            bus.appear = vec![(1, "/m".into())];
            bus.latency = Some(|_, field| {
                if field == Field::Role {
                    Duration::from_millis(40)
                } else {
                    Duration::ZERO
                }
            });
            let (menu, took) = timed(&mut bus, label);
            assert_eq!(menu, Ok(Menu::Absent), "{label:?}");
            assert!(took >= WAIT && took < WAIT + ABANDON, "{label:?}: {took:?}");
        }
    }

    #[test]
    fn an_application_that_stops_answering_after_the_action_is_answered_at_the_wait_s_end() {
        // the context-menu Copy: refused as no menu, at MENU_WAIT plus one call's abandonment, not after the bus's
        // silence timeout
        let mut bus = app();
        bus.hung = true;
        let started = Instant::now();
        let copied = context_menu_item(&mut bus, &obj("/main/button"), 1, "Copy", |bus, _, _| bus.act()).unwrap();
        let took = started.elapsed();
        assert_eq!(
            copied,
            Err(Refused::from(
                "context menu did not open; no clipboard action was sent".to_string()
            ))
        );
        assert!(bus.acted, "the action was sent");
        assert!(took >= MENU_WAIT && took < MENU_WAIT + ABANDON, "{took:?}");
    }

    #[test]
    fn a_timed_out_copy_names_its_risks_by_its_route() {
        assert_eq!(timed_out(CopyRoute::Text), "clipboard update timed out");
        assert_eq!(
            timed_out(CopyRoute::Menu),
            "clipboard update timed out; the application may still complete the Copy later, and its menus on this \
             window may stay unresponsive"
        );
    }
}
