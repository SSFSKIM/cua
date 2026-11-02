//! The send boundary is the only way out to the bus (#268). `Bus::send` (`src/dbus.rs`) refuses `EditableText`'s text
//! mutators before anything is sent (its hermetic tests are in `dbus.rs`). Rust's module privacy makes it the only way
//! a method call reaches a bus: the marshalling (`encode_call`), the METHOD_CALL type code and the connection's socket
//! and output buffer are private to `dbus`, so code outside it that builds or writes a method call does not compile.
//!
//! The crate is a binary with no library target, so a `compile_fail` doctest cannot express that, and a compile-fail
//! harness would be a new dependency. This test asserts the privacy the guarantee rests on, from the source: a change
//! that makes any of it public, reaches the marshalling from another module, opens a second socket, or moves the
//! refusal behind the marshalling fails here. Its negative controls show each such change is caught.

#[path = "support/source.rs"]
mod source;

use source::{engine_sources, lex};
use std::path::PathBuf;

/// Identifiers that only `dbus.rs` may use: the marshalling, the call's type code, and the socket type a second
/// connection would need.
const DBUS_ONLY: [&str; 3] = ["encode_call", "METHOD_CALL", "UnixStream"];

fn has_ident(code: &str, ident: &str) -> bool {
    code.match_indices(ident).any(|(at, _)| {
        let before = code[..at].bytes().last();
        let after = code[at + ident.len()..].bytes().next();
        let word = |c: Option<u8>| c.is_some_and(|c| c.is_ascii_alphanumeric() || c == b'_');
        !word(before) && !word(after)
    })
}

/// The line of `code` that holds `needle`, trimmed.
fn line_of<'a>(code: &'a str, needle: &str) -> Option<&'a str> {
    code.lines().find(|l| l.contains(needle)).map(str::trim)
}

/// What breaks the boundary in these sources (path relative to `src/`, code with comments and strings removed).
fn leaks(files: &[(PathBuf, String)]) -> Vec<String> {
    let mut found = Vec::new();
    let mut dbus = None;
    for (path, text) in files {
        let code = lex(text).code;
        if path.as_os_str() == "dbus.rs" {
            dbus = Some(code);
            continue;
        }
        for ident in DBUS_ONLY {
            if has_ident(&code, ident) {
                found.push(format!("{}: uses {ident}, which only dbus.rs may", path.display()));
            }
        }
    }
    let Some(code) = dbus else {
        return vec!["no src/dbus.rs".into()];
    };
    // the module's own unit tests (compiled only under test) may exercise the marshalling directly
    let code = match code.find("#[cfg(test)]\nmod tests {") {
        Some(at) => code[..at].to_string(),
        None => code,
    };
    match line_of(&code, "fn encode_call(") {
        Some(line) if line.starts_with("pub") => found.push(format!("dbus.rs: encode_call is public: {line}")),
        Some(_) => {}
        None => found.push("dbus.rs: no encode_call to check".into()),
    }
    match line_of(&code, "const METHOD_CALL") {
        Some(line) if line.starts_with("pub") => found.push(format!("dbus.rs: METHOD_CALL is public: {line}")),
        Some(_) => {}
        None => found.push("dbus.rs: no METHOD_CALL to check".into()),
    }
    let bus = code
        .find("pub struct Bus {")
        .map(|at| &code[at..at + code[at..].find("\n}").unwrap_or(code.len() - at)]);
    match bus {
        Some(fields) => {
            for field in ["stream:", "out:"] {
                match line_of(fields, field) {
                    Some(line) if line.starts_with("pub") => {
                        found.push(format!("dbus.rs: Bus's {field} field is public: {line}"))
                    }
                    Some(_) => {}
                    None => found.push(format!("dbus.rs: Bus has no {field} field to check")),
                }
            }
        }
        None => found.push("dbus.rs: no Bus to check".into()),
    }
    // the refusal comes before the marshalling in the one function that marshals
    match code.find("pub fn send(") {
        Some(at) => {
            let body = &code[at..at + code[at..].find("\n    }\n").unwrap_or(code.len() - at)];
            match (body.find("refuse_text_mutator("), body.find("encode_call(")) {
                (Some(refuse), Some(encode)) if refuse < encode => {}
                _ => found.push("dbus.rs: Bus::send does not refuse before it marshals".into()),
            }
        }
        None => found.push("dbus.rs: no Bus::send to check".into()),
    }
    // and nothing else in dbus.rs marshals a call
    if code.matches("encode_call(").count() != 2 {
        found.push(format!(
            "dbus.rs: encode_call( appears {} times; only its declaration and Bus::send may",
            code.matches("encode_call(").count()
        ));
    }
    found
}

#[test]
fn only_the_send_boundary_reaches_the_bus() {
    let found = leaks(&engine_sources());
    assert!(found.is_empty(), "the send boundary leaks:\n{}", found.join("\n"));
}

/// The real sources with `edit` applied to one file (or a file added).
fn with(edit: impl Fn(&mut Vec<(PathBuf, String)>)) -> Vec<String> {
    let mut files = engine_sources();
    edit(&mut files);
    leaks(&files)
}

fn dbus_mut(files: &mut [(PathBuf, String)]) -> &mut String {
    &mut files.iter_mut().find(|(p, _)| p.as_os_str() == "dbus.rs").unwrap().1
}

#[test]
fn an_editable_text_call_built_any_other_way_fails_this_test() {
    // another module marshalling its own EditableText call: it would need dbus's private marshalling
    let marshal = with(|files| {
        files.push((
            "paste_text.rs".into(),
            r#"pub fn paste(bus: &mut Bus) -> Vec<u8> {
                crate::dbus::encode_call(7, &MethodCall { dest: ":1.2", path: "/p",
                    iface: "org.a11y.atspi.EditableText", member: concat!("Paste", "Text"), args: &[] })
            }"#
            .into(),
        ))
    });
    assert!(
        marshal.iter().any(|l| l.contains("paste_text.rs: uses encode_call")),
        "{marshal:?}"
    );
    // or a second connection of its own
    let socket = with(|files| {
        files.push((
            "side.rs".into(),
            "use std::os::unix::net::UnixStream; fn f(a: &str) { let _ = UnixStream::connect(a); }".into(),
        ))
    });
    assert!(
        socket.iter().any(|l| l.contains("side.rs: uses UnixStream")),
        "{socket:?}"
    );
    // or the marshalling made public
    let public = with(|files| {
        let dbus = dbus_mut(files);
        *dbus = dbus.replacen("\nfn encode_call(", "\npub fn encode_call(", 1);
    });
    assert!(public.iter().any(|l| l.contains("encode_call is public")), "{public:?}");
    // or the socket
    let stream = with(|files| {
        let dbus = dbus_mut(files);
        *dbus = dbus.replacen("    stream: UnixStream,", "    pub stream: UnixStream,", 1);
    });
    assert!(
        stream.iter().any(|l| l.contains("stream: field is public")),
        "{stream:?}"
    );
    // or the refusal dropped from the send
    let unguarded = with(|files| {
        let dbus = dbus_mut(files);
        *dbus = dbus.replacen(
            "        refuse_text_mutator(call)?;\n        let serial",
            "        let serial",
            1,
        );
    });
    assert!(
        unguarded
            .iter()
            .any(|l| l.contains("does not refuse before it marshals")),
        "{unguarded:?}"
    );
    // or a second marshalling path inside dbus.rs
    let second = with(|files| {
        let dbus = dbus_mut(files);
        *dbus = dbus.replacen(
            "#[cfg(test)]\nmod tests {",
            "fn raw(c: &MethodCall) -> Vec<u8> { encode_call(1, c) }\n\n#[cfg(test)]\nmod tests {",
            1,
        );
    });
    assert!(second.iter().any(|l| l.contains("appears 3 times")), "{second:?}");
}
