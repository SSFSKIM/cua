//! The press boundary (#171 M4, task 61's fix 3; the design session's ruling, 2026-11-05): no acknowledgement outlives
//! the press it was taken for. Every button press on a route (every background press, and the desktop route's but
//! `drag_handle`'s, which is desktop-only) spends a `PressAck` (`src/focus_ack.rs`), which only `focus_ack::press_ack`
//! issues, reading Qt's state (and the press's recipient) again just before that press. Two things make it hold by
//! construction:
//!
//! 1. **The types.** `PressAck`'s field is private to `focus_ack`, so no other module can build one; it is neither
//!    `Clone` nor `Copy`, so a press spends it; `Session::press` and `Route::press`, the only ways to press, take it by
//!    value, and `Session::press` refuses one issued for another window, point or press (the session's press count).
//!    A press without a fresh acknowledgement does not compile, and a stale one is refused.
//! 2. **This source assertion**, for what the types cannot say:
//!    - a synthetic `ButtonPress` is built only in `input.rs`'s `send_button`, whose pressing call sits in
//!      `Session::press` alone (`release_button` releases); XTEST's press type is `desktop.rs`'s;
//!    - `Session::press` and `Route::press` take a `PressAck`, and the session's press count moves only in
//!      `Session::press`;
//!    - `PressAck` is built only in `press_ack`, derives neither `Clone` nor `Copy`, and has no `Clone` or `Copy` impl;
//!    - outside `focus_ack.rs` the type is named only in imports and in function signatures, so no struct, static,
//!      collection or binding outside a call's argument keeps one past its press;
//!    - the check that reads the state is private to `focus_ack`, and the old per-request wait (`before_press`) is gone.
//!
//! The crate is a binary with no library target, so no `compile_fail` doctest can show the privacy, and a compile-fail
//! harness would be a new dependency. Every rule has a negative control below.

#[path = "support/source.rs"]
mod source;

use source::{engine_sources, functions, idents, lex};
use std::path::PathBuf;

/// The trimmed line of `code` around offset `at`.
fn line_at(code: &str, at: usize) -> &str {
    source::line_at(code, at)
}

/// The function whose signature (from `fn` to its body's opening brace) holds offset `at`, if any.
fn in_signature(code: &str, fns: &[(String, usize, usize)], at: usize) -> Option<String> {
    fns.iter()
        .find(|(_, start, end)| {
            let open = code[*start..*end].find('{').map_or(*end, |i| start + i);
            *start <= at && at < open
        })
        .map(|(name, ..)| name.clone())
}

/// The innermost function whose body holds offset `at`.
fn in_body(fns: &[(String, usize, usize)], at: usize) -> Option<String> {
    source::enclosing(fns, at).map(str::to_string)
}

/// What breaks the boundary in these sources (paths relative to `src/`).
fn breaches(files: &[(PathBuf, String)]) -> Vec<String> {
    let mut found = Vec::new();
    let mut seen_press = false;
    for (path, text) in files {
        let code = lex(text).code;
        let file = path.to_string_lossy().into_owned();
        let fns = functions(&code);
        // a synthetic ButtonPress is built in send_button alone; XTEST's press type is desktop.rs's
        for at in idents(&code, "BUTTON_PRESS_EVENT") {
            let line = line_at(&code, at);
            let allowed = match file.as_str() {
                "input.rs" => line.starts_with("use ") || in_body(&fns, at).as_deref() == Some("send_button"),
                "desktop.rs" => true,
                _ => false,
            };
            if !allowed {
                found.push(format!("{file}: a ButtonPress built outside send_button: {line}"));
            }
        }
        if file == "input.rs" {
            for at in idents(&code, "send_button") {
                if in_signature(&code, &fns, at).as_deref() == Some("send_button") {
                    continue;
                }
                let line = line_at(&code, at);
                match in_body(&fns, at).as_deref() {
                    Some("press") if line.contains("true") => seen_press = true,
                    Some("release_button") if line.contains("false") => {}
                    other => found.push(format!("input.rs: send_button called in {other:?}: {line}")),
                }
            }
            for at in idents(&code, "presses") {
                let line = line_at(&code, at);
                let moves = line.contains("presses +=") || line.contains("presses =");
                if moves && in_body(&fns, at).as_deref() != Some("press") {
                    found.push(format!(
                        "input.rs: the press count moved outside Session::press: {line}"
                    ));
                }
            }
        }
        if file == "input.rs" || file == "route.rs" {
            let takes = fns.iter().filter(|(name, ..)| name == "press").all(|(_, start, end)| {
                let open = code[*start..*end].find('{').map_or(*end, |i| start + i);
                code[*start..open].contains("PressAck")
            });
            if !takes {
                found.push(format!("{file}: a press that takes no PressAck"));
            }
        }
        for at in idents(&code, "PressAck") {
            let line = line_at(&code, at);
            if file == "focus_ack.rs" {
                let body = in_body(&fns, at);
                let signature = in_signature(&code, &fns, at);
                let allowed = line.starts_with("pub struct PressAck")
                    || line.starts_with("impl PressAck")
                    || line.starts_with("pub fn issued_for")
                    || signature.as_deref() == Some("press_ack")
                    || body.as_deref() == Some("press_ack") && line.contains("PressAck {");
                if !allowed {
                    found.push(format!("focus_ack.rs: PressAck named outside press_ack: {line}"));
                }
            } else if !line.starts_with("use ") && in_signature(&code, &fns, at).is_none() {
                found.push(format!(
                    "{file}: a PressAck kept outside a function's signature: {line}"
                ));
            }
            if file != "focus_ack.rs" && code[at..].trim_start_matches("PressAck").trim_start().starts_with('{') {
                found.push(format!("{file}: a PressAck built outside focus_ack.rs: {line}"));
            }
        }
        if file == "focus_ack.rs" {
            let Some(def) = code.find("pub struct PressAck") else {
                found.push("focus_ack.rs: no PressAck".to_string());
                continue;
            };
            // the attributes since the item before it ended
            let attrs_start = code[..def].rfind([';', '}']).unwrap_or(0);
            let attrs = &code[attrs_start..def];
            if attrs.contains("Clone") || attrs.contains("Copy") {
                found.push("focus_ack.rs: PressAck derives Clone or Copy".to_string());
            }
            for imp in ["impl Clone for PressAck", "impl Copy for PressAck"] {
                if code.contains(imp) {
                    found.push(format!("focus_ack.rs: {imp}"));
                }
            }
            if code.contains("pub fn check") || code.contains("pub(crate) fn check") {
                found.push("focus_ack.rs: the state's check is reachable without press_ack".to_string());
            }
        }
        // XTEST's presses are the desktop route's: through Route::press, and drag_handle's, which is desktop-only by
        // design (its start, moves and end name no window; its lifecycle is T17's, #250)
        for (at, _) in code.match_indices("Desktop::button(") {
            let line = line_at(&code, at);
            if !line.contains("true") {
                continue;
            }
            let allowed = matches!(
                (file.as_str(), in_body(&fns, at).as_deref()),
                ("route.rs", Some("press")) | ("engine/handle.rs", Some("start_drag_handle"))
            );
            if !allowed {
                found.push(format!(
                    "{file}: an XTEST press outside Route::press and drag_handle: {line}"
                ));
            }
        }
        if !idents(&code, "before_press").is_empty() {
            found.push(format!(
                "{file}: the per-request acknowledgement (before_press) is back"
            ));
        }
    }
    if !seen_press {
        found.push("input.rs: Session::press does not press".to_string());
    }
    found
}

#[test]
fn every_press_spends_its_own_acknowledgement() {
    let found = breaches(&engine_sources());
    assert!(found.is_empty(), "{found:#?}");
}

fn with(edit: impl Fn(&mut Vec<(PathBuf, String)>)) -> Vec<String> {
    let mut files = engine_sources();
    edit(&mut files);
    breaches(&files)
}

fn file_mut<'a>(files: &'a mut [(PathBuf, String)], name: &str) -> &'a mut String {
    &mut files
        .iter_mut()
        .find(|(p, _)| p.to_string_lossy() == name)
        .expect(name)
        .1
}

fn replace(files: &mut [(PathBuf, String)], name: &str, from: &str, to: &str) {
    let text = file_mut(files, name);
    assert!(text.contains(from), "{name} holds {from}");
    *text = text.replacen(from, to, 1);
}

fn caught(found: &[String], needle: &str, case: &str) {
    assert!(found.iter().any(|f| f.contains(needle)), "{case}: {found:#?}");
}

#[test]
fn a_press_without_a_fresh_acknowledgement_is_caught() {
    // a second pressing call, in release_button
    let found = with(|files| {
        replace(
            files,
            "input.rs",
            "self.send_button(x, button, false)",
            "self.send_button(x, button, true)",
        )
    });
    caught(
        &found,
        "send_button called in Some(\"release_button\")",
        "a press through release_button",
    );
    // a ButtonPress built elsewhere
    let found = with(|files| {
        file_mut(files, "engine/pointer.rs")
            .push_str("\nfn sneak() -> u8 { x11rb::protocol::xproto::BUTTON_PRESS_EVENT }\n")
    });
    caught(
        &found,
        "engine/pointer.rs: a ButtonPress built outside",
        "a ButtonPress in pointer.rs",
    );
    // an acknowledgement kept in a struct, or a binding, past its press
    let found = with(|files| {
        file_mut(files, "engine/pointer.rs").push_str("\nstruct Kept { ack: crate::focus_ack::PressAck }\n")
    });
    caught(&found, "a PressAck kept outside", "a PressAck in a struct");
    let found = with(|files| {
        file_mut(files, "engine/pointer.rs").push_str("\nfn keep() { let _kept: Vec<PressAck> = Vec::new(); }\n")
    });
    caught(&found, "a PressAck kept outside", "a PressAck in a collection");
    // built outside focus_ack.rs, or copied
    let found = with(|files| {
        file_mut(files, "route.rs").push_str("\nfn forge(ack: PressAck) -> PressAck { PressAck { on: None } }\n")
    });
    caught(
        &found,
        "route.rs: a PressAck built outside",
        "a PressAck built in route.rs",
    );
    let found = with(|files| {
        replace(
            files,
            "focus_ack.rs",
            "#[derive(Debug)]\npub struct PressAck",
            "#[derive(Debug, Clone)]\npub struct PressAck",
        )
    });
    caught(&found, "derives Clone or Copy", "a Clone PressAck");
    let found = with(|files| file_mut(files, "focus_ack.rs").push_str("\nimpl Copy for PressAck {}\n"));
    caught(&found, "impl Copy for PressAck", "a Copy PressAck");
    // a press that takes none, the count moved elsewhere, the check made public, the old wait back
    let found = with(|files| {
        replace(
            files,
            "route.rs",
            "pub fn press(&mut self, x: &X11, button: u8, ack: crate::focus_ack::PressAck)",
            "pub fn press(&mut self, x: &X11, button: u8, ack: Option<u8>)",
        )
    });
    caught(
        &found,
        "route.rs: a press that takes no PressAck",
        "Route::press without a PressAck",
    );
    let found = with(|files| {
        replace(
            files,
            "input.rs",
            "        self.send_button(x, button, false)\n",
            "        self.presses += 1;\n        self.send_button(x, button, false)\n",
        )
    });
    caught(&found, "the press count moved outside", "the count bumped by a release");
    let found = with(|files| replace(files, "focus_ack.rs", "    fn check(", "    pub fn check("));
    caught(&found, "reachable without press_ack", "a public check");
    let found = with(|files| file_mut(files, "engine/pointer.rs").push_str("\nfn before_press() {}\n"));
    caught(&found, "before_press", "the old wait");
    // an XTEST press past Route::press
    let found = with(|files| {
        file_mut(files, "engine/elements.rs").push_str("\nfn sneak(x: &X11) { let _ = Desktop::button(x, 3, true); }\n")
    });
    caught(
        &found,
        "engine/elements.rs: an XTEST press outside",
        "an XTEST press in elements.rs",
    );
}
