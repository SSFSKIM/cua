//! The send boundary is the only way out to the bus (#268). `Bus::send` (`src/dbus.rs`) refuses `EditableText`'s text
//! mutators before anything is sent; its hermetic tests are in `dbus.rs`. Two things make it the only way out:
//!
//! 1. **Module privacy.** The marshalling (`encode_call`), the METHOD_CALL type code and the connection's socket and
//!    output buffer are private to `dbus`, so code outside it that marshals or writes a method call through them does
//!    not compile.
//! 2. **This source assertion**, for what privacy cannot express. Privacy does not stop `dbus.rs` itself from growing
//!    a second writer (a public `raw_send`), nor another module from opening a socket of its own and marshalling a
//!    call by hand. So, from the lexed source (comments, strings and char literals removed; `dbus.rs`'s unit-test module
//!    excluded):
//!    - the private items stay private, and `Bus::send` refuses before it marshals, which it alone does;
//!    - inside `dbus.rs`, every write to the socket sits in the two functions that own one today (`connect`, for the
//!      authentication, and `flush`, which writes only what `send` queued), the socket type appears only in `connect`
//!      and `over` and in the module's imports and `Bus`'s field, and nothing hands the socket's descriptor out;
//!    - no other file in `src/` opens or adopts a socket or a raw descriptor (`EGRESS`), except the explicit
//!      allowances (`ALLOWED`), each with its reason.
//!
//! The crate is a binary with no library target, so no `compile_fail` doctest can show the privacy, and a
//! compile-fail harness would be a new dependency. Every rule has a negative control below.

#[path = "support/source.rs"]
mod source;

use source::{engine_sources, lex};
use std::path::PathBuf;

/// Identifiers no file but `dbus.rs` may use: the routes from engine code to a socket or a raw descriptor that could
/// reach the bus, with the dbus module's own private items. Matched as whole identifiers in code, so a path segment
/// counts wherever it appears (`std::net`, `std::os::unix::net`, `rustix::net`, `use rustix::{fs, net}`).
const EGRESS: [(&str, &str); 25] = [
    ("encode_call", "dbus's private marshalling"),
    ("METHOD_CALL", "dbus's private call type code"),
    ("UnixStream", "a Unix socket (std)"),
    ("UnixListener", "a Unix socket (std)"),
    ("UnixDatagram", "a Unix socket (std)"),
    ("TcpStream", "a TCP socket (std; D-Bus also listens on TCP)"),
    ("TcpListener", "a TCP socket (std)"),
    ("UdpSocket", "a UDP socket (std)"),
    ("net", "a socket module (std::net, std::os::unix::net, rustix::net)"),
    ("socket", "a socket call (rustix, libc, nix)"),
    ("socketpair", "a socket call (rustix, libc, nix)"),
    ("socket_with", "a socket call (rustix)"),
    (
        "libc",
        "the C library's socket and write calls (not linked; listed so adding it does not slip through)",
    ),
    ("nix", "nix's socket calls (not linked; listed likewise)"),
    ("from_raw_fd", "adopting a raw descriptor"),
    ("FromRawFd", "adopting a raw descriptor"),
    ("from_raw_socket", "adopting a raw socket"),
    ("pidfd_getfd", "taking another process's descriptor"),
    ("dup2", "duplicating a descriptor onto a chosen number"),
    ("dup3", "duplicating a descriptor onto a chosen number"),
    ("asm", "raw system calls"),
    ("global_asm", "raw system calls"),
    ("syscall", "raw system calls"),
    ("connect_to_stream", "x11rb adopting an arbitrary stream"),
    (
        "DefaultStream",
        "x11rb's raw stream, which writes bytes anywhere it is connected",
    ),
];

/// Process spawning, a route to the bus through a child (`busctl`, `dbus-send`): allowed only where named.
const SPAWN: &str = "Command";
/// Explicit allowances: (file, identifier, why it cannot carry a call to the bus).
const ALLOWED: [(&str, &str, &str); 5] = [
    (
        "apps.rs",
        SPAWN,
        "launch_app runs the argv of an installed desktop entry the agent chose, never an argv the engine writes",
    ),
    (
        "engine/identity_faults.rs",
        SPAWN,
        "test-only identity hooks: starts python3 with the GTK 3 twins fixture (tests/support/gtk3-twins.py)",
    ),
    (
        "engine/paste_faults.rs",
        SPAWN,
        "test-only fault injection: starts yad, a GTK 3 window, as its paste target",
    ),
    (
        "engine/targets_faults.rs",
        SPAWN,
        "test-only TARGETS hooks: starts python3 with the GTK 3 target that keeps its targets \
         (tests/support/targets-refresh.py)",
    ),
    (
        "main.rs",
        SPAWN,
        "the CLI's own `enum Command`; `Command::new` is checked separately",
    ),
];

/// Writes to a socket. Inside `dbus.rs` they may appear only in `WRITERS`.
const WRITES: [&str; 13] = [
    "write",
    "write_all",
    "write_vectored",
    "write_all_vectored",
    "write_fmt",
    "writeln",
    "Write",
    "writev",
    "sendmsg",
    "sendto",
    "send_to",
    "sendfile",
    "splice",
];
/// The functions of `dbus.rs` that own a write: `connect` (EXTERNAL authentication and BEGIN, before `Hello` goes
/// through `call`) and `flush` (the bytes `send` queued, nothing else).
const WRITERS: [&str; 2] = ["connect", "flush"];
/// Ways to hand the socket's descriptor out of `dbus.rs`: allowed nowhere.
const FD_ESCAPES: [&str; 10] = [
    "try_clone",
    "as_raw_fd",
    "as_fd",
    "into_raw_fd",
    "AsRawFd",
    "AsFd",
    "IntoRawFd",
    "OwnedFd",
    "BorrowedFd",
    "from_raw_fd",
];
/// The functions of `dbus.rs` that may name the socket type or its module: `connect` opens it, `over` adopts it.
const SOCKET_OWNERS: [&str; 2] = ["connect", "over"];

fn is_word(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_'
}

/// The byte offsets where `ident` occurs as a whole identifier.
fn idents(code: &str, ident: &str) -> Vec<usize> {
    code.match_indices(ident)
        .filter(|(at, _)| {
            let before = code[..*at].bytes().last();
            let after = code[at + ident.len()..].bytes().next();
            !before.is_some_and(is_word) && !after.is_some_and(is_word)
        })
        .map(|(at, _)| at)
        .collect()
}

/// Every `fn <name>` in `code` with the span from `fn` to its body's closing brace (signature included).
fn functions(code: &str) -> Vec<(String, usize, usize)> {
    let b = code.as_bytes();
    let mut out = Vec::new();
    for at in idents(code, "fn") {
        let rest = code[at + 2..].trim_start();
        let name: String = rest.bytes().take_while(|c| is_word(*c)).map(char::from).collect();
        if name.is_empty() {
            continue; // a `fn(` pointer type
        }
        let Some(open) = (at..b.len()).find(|&i| b[i] == b'{' || b[i] == b';') else {
            continue;
        };
        if b[open] == b';' {
            continue; // a declaration without a body
        }
        let mut depth = 0;
        let mut end = b.len();
        for (i, &c) in b.iter().enumerate().skip(open) {
            match c {
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        end = i + 1;
                        break;
                    }
                }
                _ => {}
            }
        }
        out.push((name, at, end));
    }
    out
}

/// The innermost named function around offset `at`, if any.
fn enclosing(fns: &[(String, usize, usize)], at: usize) -> Option<&str> {
    fns.iter()
        .filter(|(_, start, end)| *start <= at && at < *end)
        .min_by_key(|(_, start, end)| end - start)
        .map(|(name, ..)| name.as_str())
}

/// The trimmed line of `code` around offset `at`.
fn line_at(code: &str, at: usize) -> &str {
    let start = code[..at].rfind('\n').map_or(0, |i| i + 1);
    let end = code[at..].find('\n').map_or(code.len(), |i| at + i);
    code[start..end].trim()
}

/// The trimmed line of `code` that holds `needle`.
fn line_of<'a>(code: &'a str, needle: &str) -> Option<&'a str> {
    code.lines().find(|l| l.contains(needle)).map(str::trim)
}

/// What breaks the boundary in these sources (paths relative to `src/`).
fn leaks(files: &[(PathBuf, String)]) -> Vec<String> {
    let mut found = Vec::new();
    let mut dbus = None;
    for (path, text) in files {
        let code = lex(text).code;
        let file = path.to_string_lossy().into_owned();
        if file == "dbus.rs" {
            dbus = Some(code);
            continue;
        }
        for (ident, what) in EGRESS {
            if let Some(&at) = idents(&code, ident).first() {
                found.push(format!("{file}: uses {ident} ({what}): {}", line_at(&code, at)));
            }
        }
        let allowed = ALLOWED.iter().any(|(f, i, _)| *f == file && *i == SPAWN);
        if let Some(&at) = idents(&code, SPAWN).first()
            && !allowed
        {
            found.push(format!(
                "{file}: uses {SPAWN} (spawning a process): {}",
                line_at(&code, at)
            ));
        }
        if file == "main.rs" && code.contains("Command::new") {
            found.push("main.rs: spawns a process (Command::new)".into());
        }
        if code.contains("x11rb::connect(Some") {
            found.push(format!(
                "{file}: x11rb::connect to an explicit address (only the DISPLAY's X server, None, is allowed)"
            ));
        }
    }
    let Some(code) = dbus else {
        return vec!["no src/dbus.rs".into()];
    };
    // the module's own unit tests (compiled only under test) may exercise the marshalling and the socket directly
    let code = match code.find("#[cfg(test)]\nmod tests {") {
        Some(at) => code[..at].to_string(),
        None => code,
    };
    dbus_leaks(&code, &mut found);
    found
}

fn dbus_leaks(code: &str, found: &mut Vec<String>) {
    // the private items stay private
    for (needle, what) in [("fn encode_call(", "encode_call"), ("const METHOD_CALL", "METHOD_CALL")] {
        match line_of(code, needle) {
            Some(line) if line.starts_with("pub") => found.push(format!("dbus.rs: {what} is public: {line}")),
            Some(_) => {}
            None => found.push(format!("dbus.rs: no {what} to check")),
        }
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
    // send refuses before it marshals, and nothing else marshals
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
    let marshals = code.matches("encode_call(").count();
    if marshals != 2 {
        found.push(format!(
            "dbus.rs: encode_call( appears {marshals} times; only its declaration and Bus::send may"
        ));
    }
    let fns = functions(code);
    // every write in a function that owns one
    for ident in WRITES {
        for at in idents(code, ident) {
            let line = line_at(code, at);
            match enclosing(&fns, at) {
                Some(name) if WRITERS.contains(&name) => {}
                // `use std::io::{…, Write}`: the trait imported for the owners' write_all
                None if ident == "Write" && line.starts_with("use ") => {}
                Some(name) => found.push(format!("dbus.rs: {ident} in {name}, which owns no write: {line}")),
                None => found.push(format!("dbus.rs: {ident} outside any function: {line}")),
            }
        }
    }
    // nothing hands the descriptor out
    for ident in FD_ESCAPES {
        if let Some(&at) = idents(code, ident).first() {
            found.push(format!(
                "dbus.rs: {ident} would hand the socket out: {}",
                line_at(code, at)
            ));
        }
    }
    // the socket type and its modules only where the socket is opened or adopted, the imports and Bus's field
    for ident in [
        "UnixStream",
        "net",
        "socket",
        "socketpair",
        "TcpStream",
        "libc",
        "asm",
        "syscall",
    ] {
        for at in idents(code, ident) {
            let line = line_at(code, at);
            match enclosing(&fns, at) {
                Some(name) if SOCKET_OWNERS.contains(&name) => {}
                None if line.starts_with("use ") || line == "stream: UnixStream," => {}
                Some(name) => found.push(format!("dbus.rs: {ident} in {name}: {line}")),
                None => found.push(format!("dbus.rs: {ident} outside any function: {line}")),
            }
        }
    }
    // the owners are where the assertion expects them
    for name in WRITERS.iter().chain(&SOCKET_OWNERS) {
        if !fns.iter().any(|(n, ..)| n == name) {
            found.push(format!("dbus.rs: no fn {name} to check"));
        }
    }
}

#[test]
fn only_the_send_boundary_reaches_the_bus() {
    let found = leaks(&engine_sources());
    assert!(found.is_empty(), "the send boundary leaks:\n{}", found.join("\n"));
}

/// The real sources with `edit` applied (a file changed or added); what the assertion finds.
fn with(edit: impl Fn(&mut Vec<(PathBuf, String)>)) -> Vec<String> {
    let mut files = engine_sources();
    edit(&mut files);
    leaks(&files)
}

fn file_mut<'a>(files: &'a mut [(PathBuf, String)], name: &str) -> &'a mut String {
    &mut files.iter_mut().find(|(p, _)| p.as_os_str() == name).unwrap().1
}

/// `dbus.rs` with `text` added inside `impl Bus`, before `flush`.
fn in_bus(text: &str) -> Vec<String> {
    let text = text.to_string();
    with(move |files| {
        let dbus = file_mut(files, "dbus.rs");
        *dbus = dbus.replacen("    pub fn flush(", &format!("{text}\n\n    pub fn flush("), 1);
    })
}

/// A new file `side.rs` holding `text`.
fn side(text: &str) -> Vec<String> {
    let text = text.to_string();
    with(move |files| files.push(("side.rs".into(), text.clone())))
}

fn caught(found: &[String], needle: &str, case: &str) {
    assert!(found.iter().any(|l| l.contains(needle)), "{case} passed: {found:?}");
}

#[test]
fn the_reviewers_two_ways_out_are_caught() {
    caught(
        &in_bus(
            "    pub fn raw_send(&mut self, bytes: &[u8]) -> Result<()> {\n        self.stream.write_all(bytes)?;\n        Ok(())\n    }",
        ),
        "write_all in raw_send",
        "a public raw writer in dbus.rs",
    );
    caught(
        &side(
            "use rustix::net::{AddressFamily, SocketType, socket};\nfn f() { let _ = socket(AddressFamily::UNIX, SocketType::STREAM, None); }",
        ),
        "side.rs: uses net",
        "a rustix socket in another module",
    );
}

#[test]
fn every_way_out_of_another_module_is_caught() {
    for (ident, _) in EGRESS {
        caught(
            &side(&format!("fn f() {{ let _ = {ident}; }}")),
            &format!("side.rs: uses {ident} "),
            ident,
        );
    }
    // the grouped import spelling of a socket module, and a real marshalling of an EditableText call
    caught(
        &side("use std::os::unix::{fs, net};"),
        "side.rs: uses net",
        "a grouped net import",
    );
    caught(
        &side(
            "fn paste() -> Vec<u8> { crate::dbus::encode_call(7, &MethodCall { dest: \"\", path: \"\", iface: \"org.a11y.atspi.EditableText\", member: concat!(\"Paste\", \"Text\"), args: &[] }) }",
        ),
        "side.rs: uses encode_call",
        "another module marshalling a call",
    );
    // spawning a process: caught outside the allowances, allowed where named
    caught(
        &side("use std::process::Command;\nfn f() { Command::new(\"busctl\"); }"),
        "side.rs: uses Command",
        "a spawn",
    );
    let main = with(|files| {
        let main = file_mut(files, "main.rs");
        main.push_str("\nfn f() { std::process::Command::new(\"busctl\"); }\n");
    });
    caught(&main, "main.rs: spawns a process", "a spawn in main.rs");
    assert!(
        side("fn f() { let _ = x11rb::connect(None); }").is_empty(),
        "the DISPLAY's X connection is not a way to the bus"
    );
    caught(
        &side("fn f() { let _ = x11rb::connect(Some(\"/run/user/501/bus\")); }"),
        "x11rb::connect to an explicit address",
        "an X connection to an explicit address",
    );
}

#[test]
fn every_new_way_out_inside_dbus_rs_is_caught() {
    for ident in WRITES {
        let call = if ident == "writeln" || ident == "write" {
            format!("{ident}!(self.stream, \"\").ok();")
        } else if ident == "Write" {
            "let _w: &mut dyn Write = &mut self.stream;".to_string()
        } else {
            format!("let _ = self.stream.{ident}(&[]);")
        };
        caught(
            &in_bus(&format!("    pub fn sneak(&mut self) {{\n        {call}\n    }}")),
            &format!("{ident} in sneak"),
            ident,
        );
    }
    for ident in FD_ESCAPES {
        caught(
            &in_bus(&format!("    pub fn sneak(&self) {{\n        let _ = {ident};\n    }}")),
            &format!("{ident} would hand the socket out"),
            ident,
        );
    }
    caught(
        &in_bus("    pub fn raw(&mut self) -> &mut UnixStream {\n        &mut self.stream\n    }"),
        "UnixStream in raw",
        "the socket handed out by reference",
    );
    caught(
        &in_bus("    pub fn other(&mut self) {\n        let _ = rustix::net::socket;\n    }"),
        "net in other",
        "a second socket inside dbus.rs",
    );
    let impl_write = with(|files| {
        let dbus = file_mut(files, "dbus.rs");
        *dbus = dbus.replacen(
            "impl Bus {",
            "impl Write for Bus {\n    fn write(&mut self, b: &[u8]) -> std::io::Result<usize> { self.stream.write(b) }\n    fn flush(&mut self) -> std::io::Result<()> { Ok(()) }\n}\n\nimpl Bus {",
            1,
        );
    });
    caught(&impl_write, "Write outside any function", "Write implemented for Bus");
    // the earlier privacy rules
    let edit = |from: &'static str, to: &'static str| {
        with(move |files| {
            let dbus = file_mut(files, "dbus.rs");
            *dbus = dbus.replacen(from, to, 1);
        })
    };
    caught(
        &edit("\nfn encode_call(", "\npub fn encode_call("),
        "encode_call is public",
        "public marshalling",
    );
    caught(
        &edit("    stream: UnixStream,", "    pub stream: UnixStream,"),
        "stream: field is public",
        "a public socket",
    );
    caught(
        &edit(
            "        refuse_text_mutator(call)?;\n        let serial",
            "        let serial",
        ),
        "does not refuse before it marshals",
        "the refusal dropped",
    );
    caught(
        &edit(
            "#[cfg(test)]\nmod tests {",
            "fn raw(c: &MethodCall) -> Vec<u8> { encode_call(1, c) }\n\n#[cfg(test)]\nmod tests {",
        ),
        "appears 3 times",
        "a second marshalling path",
    );
}

#[test]
fn functions_are_spanned_from_fn_to_their_closing_brace() {
    let code =
        lex("impl A {\n    fn a(&self) -> u8 { if x { b'{' } else { 0 } }\n    fn b() {}\n}\nfn c(f: fn(u8) -> u8);\n")
            .code;
    let fns = functions(&code);
    let names: Vec<&str> = fns.iter().map(|(n, ..)| n.as_str()).collect();
    assert_eq!(names, ["a", "b"]);
    let b_at = code.find("fn b").unwrap();
    assert_eq!(enclosing(&fns, b_at + 5), Some("b"));
    assert_eq!(enclosing(&fns, code.find("impl").unwrap()), None);
}
