//! A text field through AT-SPI, as the paste route reads and restores it (Design, Text and clipboard: steps 1, 2, 4
//! and 5): its focus, its editability and, when it implements `Text`, its character count, caret and selection; the
//! vendor's restore of a caret or selection after the focusing click (behaviour §7.4); and the read of the offsets the
//! paste should have filled. `PasteText`, `InsertText` and `SetTextContents` are never called (Constraints).

use anyhow::Result;

use crate::atspi::call_all;
use crate::dbus::{Arg, Bus, CallResult, MethodCall, Value};
use crate::paste::TextState;
use crate::tree::{self, ObjRef};

const ACCESSIBLE: &str = "org.a11y.atspi.Accessible";
const TEXT: &str = "org.a11y.atspi.Text";
const PROPERTIES: &str = "org.freedesktop.DBus.Properties";
const COUNT: [Arg<'static>; 2] = [Arg::Str(TEXT), Arg::Str("CharacterCount")];
const CARET: [Arg<'static>; 2] = [Arg::Str(TEXT), Arg::Str("CaretOffset")];

/// What one observation of the field saw. Two observations are equal when nothing the paste depends on changed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Observation {
    pub focused: bool,
    pub editable: bool,
    pub showing: bool,
    /// None when the element has no `Text` or it cannot be read.
    pub text: Option<TextState>,
}

fn call<'a>(obj: &'a ObjRef, iface: &'a str, member: &'a str, args: &'a [Arg<'a>]) -> MethodCall<'a> {
    MethodCall {
        dest: &obj.bus,
        path: &obj.path,
        iface,
        member,
        args,
    }
}

fn int_of(result: &CallResult) -> Option<i32> {
    match result.as_ref().ok()?.first()?.unvariant() {
        Value::I32(n) => Some(*n),
        _ => None,
    }
}

fn bool_of(result: &CallResult) -> Option<bool> {
    match result.as_ref().ok()?.first()? {
        Value::Bool(b) => Some(*b),
        _ => None,
    }
}

/// Reads the field: its state and interfaces, and its text state, with every call sent together.
pub fn observe(bus: &mut Bus, element: &ObjRef) -> Result<std::result::Result<Observation, String>> {
    let calls = [
        call(element, ACCESSIBLE, "GetState", &[]),
        call(element, ACCESSIBLE, "GetInterfaces", &[]),
        call(element, PROPERTIES, "Get", &COUNT),
        call(element, PROPERTIES, "Get", &CARET),
        call(element, TEXT, "GetNSelections", &[]),
    ];
    let results = call_all(bus, &calls)?;
    let states = match results[0].as_ref().ok().and_then(|v| v.first()) {
        Some(Value::Array(words)) => tree::decode_states(words).unwrap_or_default(),
        _ => {
            return Ok(Err(
                "AT-SPI element did not return its state; refresh get_window_state()".into(),
            ));
        }
    };
    let has_text = matches!(results[1].as_ref().ok().and_then(|v| v.first()),
        Some(Value::Array(items)) if items.iter().any(|i| i.as_str() == Some(TEXT)));
    let text = match (has_text, int_of(&results[2]), int_of(&results[3]), int_of(&results[4])) {
        (true, Some(count), Some(caret), Some(selections)) => {
            let selection = if selections > 0 {
                let range = bus.call(&call(element, TEXT, "GetSelection", &[Arg::I32(0)]))?;
                match range.as_ref().ok().map(Vec::as_slice) {
                    Some([Value::I32(a), Value::I32(b), ..]) => Some((*a, *b)),
                    _ => None,
                }
            } else {
                None
            };
            (selections == 0 || selection.is_some()).then_some(TextState {
                count,
                caret,
                selection,
                selections,
            })
        }
        _ => None,
    };
    Ok(Ok(Observation {
        focused: states.contains(&"focused"),
        editable: states.contains(&"editable"),
        showing: states.contains(&"showing") && states.contains(&"visible"),
        text,
    }))
}

/// Puts back what the focusing click may have moved (behaviour §7.4 step 7): `AddSelection` for a remembered
/// selection, else `SetCaretOffset` for a valid caret. Whether the element took it: GTK 4 answers `NotSupported`,
/// and the paste then goes on with the caret where the click left it.
pub fn restore(bus: &mut Bus, element: &ObjRef, before: &TextState) -> Result<bool> {
    let result = match before.selected() {
        Some((start, end)) => bus.call(&call(element, TEXT, "AddSelection", &[Arg::I32(start), Arg::I32(end)]))?,
        None if (0..=before.count).contains(&before.caret) => {
            bus.call(&call(element, TEXT, "SetCaretOffset", &[Arg::I32(before.caret)]))?
        }
        None => return Ok(false),
    };
    Ok(bool_of(&result) == Some(true))
}

/// The field's character count and its text at offsets `at..at + len`, read together; None when either cannot be
/// read.
pub fn read(bus: &mut Bus, element: &ObjRef, at: i32, len: i32) -> Result<Option<(i32, String)>> {
    let range = [Arg::I32(at), Arg::I32(at.saturating_add(len))];
    let calls = [
        call(element, PROPERTIES, "Get", &COUNT),
        call(element, TEXT, "GetText", &range),
    ];
    let results = call_all(bus, &calls)?;
    let text = match results[1].as_ref().ok().and_then(|v| v.first()) {
        Some(Value::Str(s)) => Some(s.clone()),
        _ => None,
    };
    Ok(int_of(&results[0]).zip(text))
}
