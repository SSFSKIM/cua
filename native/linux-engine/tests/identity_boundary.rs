//! The X11 fallback stays the vendor's (M4's T5; F5): a window whose association met duplicates never answers the
//! one-node X11 tree, whatever happens after. The types carry most of it:
//!
//! - `X11::fallback_tree` takes an `atspi::Fallback`, whose only field is private to `atspi`;
//! - `atspi::associate` answers cua's own routes (duplicates told apart, the caption) with `Association::Identity` or a
//!   frame, never with an error or leave (`own_route`), and `Associated::fallback` gives no leave for a frame they
//!   found;
//! - `engine.rs`'s `own_route_read`, which reads such a frame and confirms it, returns no `Result` and holds no leave.
//!
//! What the types cannot say, this source assertion pins, on the lexed source (comments and strings removed): leave is
//! made only in `atspi.rs`; its one public constructor, for an error the vendor's own steps raised, is called once, in
//! the state read's arm for an error from the bus; `fallback_tree` is called only by the state read; and
//! `own_route_read` names no `Fallback`. Each rule has a negative control.

#[path = "support/source.rs"]
mod source;

use source::{engine_sources, lex};
use std::path::{Path, PathBuf};

/// How often `needle` appears in `code` as whole identifiers (or a token sequence starting and ending with one).
fn count(code: &str, needle: &str) -> usize {
    let ident = |b: u8| b.is_ascii_alphanumeric() || b == b'_';
    code.match_indices(needle)
        .filter(|(at, _)| {
            let before = code.as_bytes()[..*at].last().copied();
            let after = code.as_bytes().get(at + needle.len()).copied();
            !before.is_some_and(ident) && !after.is_some_and(ident)
        })
        .count()
}

/// The body of `fn name` in `code`, up to its closing brace at the start of a line.
fn body<'a>(code: &'a str, name: &str) -> Option<&'a str> {
    let start = code.find(&format!("fn {name}("))?;
    let end = code[start..].find("\n}\n")?;
    Some(&code[start..start + end])
}

/// Every rule broken by `files` (paths relative to `src/`, code lexed).
fn violations(files: &[(PathBuf, String)]) -> Vec<String> {
    let mut found = Vec::new();
    let mut constructor_calls = 0;
    let mut tree_calls = 0;
    for (path, code) in files {
        let name = path.to_string_lossy();
        let is = |p: &str| Path::new(p) == path;
        if !is("atspi.rs") && count(code, "Fallback(())") > 0 {
            found.push(format!("{name} makes leave for the X11 fallback"));
        }
        let constructor = count(code, "after_vendor_error");
        if is("atspi.rs") {
            if constructor != 1 {
                found.push(format!(
                    "atspi.rs names after_vendor_error {constructor} times, not once (its definition)"
                ));
            }
        } else if is("engine.rs") {
            constructor_calls += constructor;
        } else if constructor > 0 {
            found.push(format!("{name} calls after_vendor_error"));
        }
        let trees = count(code, "fallback_tree");
        if is("engine.rs") {
            tree_calls += trees;
        } else if !is("x11.rs") && trees > 0 {
            found.push(format!("{name} builds the X11 fallback tree"));
        }
        if is("engine.rs") {
            match body(code, "own_route_read") {
                Some(read) if count(read, "Fallback") > 0 || count(read, "after_vendor_error") > 0 => {
                    found.push("own_route_read names the X11 fallback".into())
                }
                Some(_) => {}
                None => found.push("engine.rs has no own_route_read".into()),
            }
        }
    }
    if constructor_calls != 1 {
        found.push(format!(
            "engine.rs calls after_vendor_error {constructor_calls} times, not once"
        ));
    }
    if tree_calls != 2 {
        found.push(format!(
            "engine.rs builds the X11 fallback tree in {tree_calls} places, not the state read's two arms"
        ));
    }
    found
}

fn lexed() -> Vec<(PathBuf, String)> {
    engine_sources()
        .into_iter()
        .map(|(path, src)| (path, lex(&src).code))
        .collect()
}

#[test]
fn leave_for_the_x11_fallback_comes_only_from_the_vendors_own_failures() {
    assert_eq!(violations(&lexed()), Vec::<String>::new());
}

#[test]
fn each_rule_fails_where_it_should() {
    let files = lexed();
    let with = |file: &str, edit: &dyn Fn(&str) -> String| -> Vec<String> {
        let edited: Vec<(PathBuf, String)> = files
            .iter()
            .map(|(p, c)| (p.clone(), if p == Path::new(file) { edit(c) } else { c.clone() }))
            .collect();
        violations(&edited)
    };
    let own_read = |c: &str| {
        c.replacen(
            "fn own_route_read(",
            "fn own_route_read(\n let _ = atspi::Fallback::after_vendor_error();",
            1,
        )
    };
    let found = with("engine.rs", &own_read);
    assert!(
        found.iter().any(|v| v == "own_route_read names the X11 fallback"),
        "{found:?}"
    );
    assert!(found.iter().any(|v| v.contains("2 times, not once")), "{found:?}");
    let found = with("engine/paste.rs", &|c| {
        format!("{c}\nfn leak() {{ let _ = Fallback(()); }}\n")
    });
    assert!(found.iter().any(|v| v.contains("makes leave")), "{found:?}");
    let found = with("engine/elements.rs", &|c| {
        format!("{c}\nfn leak(x: &X11) {{ x.fallback_tree(1, atspi::Fallback::after_vendor_error()); }}\n")
    });
    assert!(
        found.iter().any(|v| v.contains("builds the X11 fallback tree")),
        "{found:?}"
    );
    assert!(
        found.iter().any(|v| v.contains("calls after_vendor_error")),
        "{found:?}"
    );
}
