//! The X11 fallback stays the vendor's (M4's T5; F5): a window whose association met duplicates never answers the
//! one-node X11 tree, whatever happens after. The types carry most of it:
//!
//! - `X11::fallback_tree` takes an `atspi::Fallback`, whose only field (`Why`, which says whether the window's process
//!   has no application on the bus, #228) is private to `atspi`;
//! - `atspi::associate` answers cua's own routes (duplicates told apart, the caption) with `Association::Identity` or a
//!   frame, never with an error or leave (`own_route`), and `Associated::fallback` gives no leave for a frame they
//!   found;
//! - `engine.rs`'s `own_route_read`, which reads such a frame and confirms it, returns no `Result` and holds no leave.
//!
//! What the types cannot say, this source assertion pins, on the lexed source (comments and strings removed): the leave's
//! field stays private, and leave is made only in `atspi.rs` (any `Fallback(..)` but the engine's `Observed::Fallback`,
//! whatever its argument); its one public constructor, for an error the vendor's own steps raised, is called once, in
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

/// How often `code` constructs leave: the identifier `Fallback` called as a tuple struct, whatever its argument and
/// however it is spelled (`Fallback(..)`, `atspi::Fallback (..)`), except the engine's own `Observed::Fallback`, its
/// variant's declaration included.
fn leave_made(code: &str) -> usize {
    let ident = |b: u8| b.is_ascii_alphanumeric() || b == b'_';
    let observed = code.find("enum Observed {").and_then(|start| {
        let end = code[start..].find("\n}\n")?;
        Some(start..start + end)
    });
    code.match_indices("Fallback")
        .filter(|(at, _)| !observed.as_ref().is_some_and(|block| block.contains(at)))
        .filter(|(at, needle)| {
            let before = &code[..*at];
            let after = &code[at + needle.len()..];
            !before.as_bytes().last().copied().is_some_and(ident)
                && after.trim_start().starts_with('(')
                && !before.ends_with("Observed::")
        })
        .count()
}

/// Whether atspi.rs declares the leave's field private: `struct Fallback(<field>)` with no `pub` in it.
fn field_private(atspi: &str) -> bool {
    atspi
        .find("struct Fallback(")
        .map(|at| &atspi[at + "struct Fallback(".len()..])
        .and_then(|rest| rest.find(')').map(|end| &rest[..end]))
        .is_some_and(|field| count(field, "pub") == 0)
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
        if !is("atspi.rs") && leave_made(code) > 0 {
            found.push(format!("{name} makes leave for the X11 fallback"));
        }
        if is("atspi.rs") && !field_private(code) {
            found.push("atspi.rs's Fallback field is public".into());
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
    // leave made outside atspi.rs, whatever the constructor's argument or spelling (#228 T3's review)
    for leak in [
        "Fallback(())",
        "Fallback(Why::NoProvider)",
        "Fallback(if every_one_named { Why::NoProvider } else { Why::Other })",
        "atspi::Fallback(Why::Other)",
        "Fallback (Why::Other)",
    ] {
        let found = with("engine/paste.rs", &|c| {
            format!("{c}\nfn leak() {{ let _ = {leak}; }}\n")
        });
        assert!(found.iter().any(|v| v.contains("makes leave")), "{leak}: {found:?}");
    }
    // the engine's own `Observed::Fallback` is not leave
    let found = with("engine/paste.rs", &|c| {
        format!("{c}\nfn seen(leave: atspi::Fallback) -> Observed {{ Observed::Fallback(leave) }}\n")
    });
    assert!(!found.iter().any(|v| v.contains("makes leave")), "{found:?}");
    // the leave's field public, which would let any module make it
    let found = with("atspi.rs", &|c| {
        c.replacen("struct Fallback(Why)", "struct Fallback(pub Why)", 1)
    });
    assert!(found.iter().any(|v| v.contains("field is public")), "{found:?}");
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
