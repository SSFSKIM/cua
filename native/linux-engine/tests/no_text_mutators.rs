//! The engine never asks an application to change its text through AT-SPI (Constraints; #268): no string literal in
//! `src/` names `PasteText`, `CutText`, `InsertText`, `DeleteText` or `SetTextContents`, the members a D-Bus call
//! would have to spell. GTK 3's text-view `PasteText` hands its clipboard request a pointer to its own stack, so when
//! another process owns CLIPBOARD the callback reads freed stack: nothing is inserted on x86-64, and gedit crashed on
//! arm64. Comments that say these are never called are not code and do not count. Text reaches an application only
//! as a key chord through the route; the one `EditableText` member the engine sends is `CopyText` (`copy.rs`).
//!
//! Static, display-free: it runs in every `cargo test`, so the engine-linux gate checks each change to `src/`, where
//! the harness's bus pass sees only the paths a run exercises.

use std::fs;
use std::path::{Path, PathBuf};

const FORBIDDEN: [&str; 5] = ["PasteText", "CutText", "InsertText", "DeleteText", "SetTextContents"];

/// The contents of every string literal in Rust source, comments skipped: `"…"` with escapes, raw `r"…"` and
/// `r#"…"#`, byte strings alike; char literals are stepped over so `'"'` opens no string.
fn string_literals(src: &str) -> Vec<String> {
    let b = src.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'/' if b.get(i + 1) == Some(&b'/') => {
                while i < b.len() && b[i] != b'\n' {
                    i += 1;
                }
            }
            b'/' if b.get(i + 1) == Some(&b'*') => {
                let mut depth = 1;
                i += 2;
                while i < b.len() && depth > 0 {
                    if b[i] == b'/' && b.get(i + 1) == Some(&b'*') {
                        depth += 1;
                        i += 2;
                    } else if b[i] == b'*' && b.get(i + 1) == Some(&b'/') {
                        depth -= 1;
                        i += 2;
                    } else {
                        i += 1;
                    }
                }
            }
            b'r' if matches!(b.get(i + 1), Some(b'"') | Some(b'#')) && (i == 0 || !is_ident(b[i - 1])) => {
                let mut j = i + 1;
                let mut hashes = 0;
                while b.get(j) == Some(&b'#') {
                    hashes += 1;
                    j += 1;
                }
                if b.get(j) != Some(&b'"') {
                    i += 1;
                    continue;
                }
                let start = j + 1;
                let close: Vec<u8> = std::iter::once(b'"').chain(std::iter::repeat_n(b'#', hashes)).collect();
                let end = (start..b.len())
                    .find(|&k| b[k..].starts_with(&close))
                    .unwrap_or(b.len());
                out.push(src[start..end].to_string());
                i = end + close.len();
            }
            b'"' => {
                let start = i + 1;
                let mut j = start;
                while j < b.len() && b[j] != b'"' {
                    j += if b[j] == b'\\' { 2 } else { 1 };
                }
                out.push(src[start..j.min(b.len())].to_string());
                i = j + 1;
            }
            b'\'' => {
                // a char literal ('x', '\n', '"', '\''), else a lifetime ('a): only a literal is stepped over
                if b.get(i + 1) == Some(&b'\\') {
                    i += 2;
                    while i < b.len() && b[i] != b'\'' {
                        i += 1;
                    }
                    i += 1;
                } else if b.get(i + 2) == Some(&b'\'') {
                    i += 3;
                } else {
                    i += 1;
                }
            }
            _ => i += 1,
        }
    }
    out
}

fn is_ident(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_'
}

/// The forbidden members a literal names as a whole word (`"PasteText"`, `"…EditableText.PasteText"`).
fn named(literal: &str) -> Vec<&'static str> {
    FORBIDDEN
        .iter()
        .copied()
        .filter(|name| {
            literal.match_indices(name).any(|(at, _)| {
                let before = literal[..at].bytes().last();
                let after = literal[at + name.len()..].bytes().next();
                !before.is_some_and(is_ident) && !after.is_some_and(is_ident)
            })
        })
        .collect()
}

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(dir).expect("src/ is readable") {
        let path = entry.expect("a directory entry").path();
        if path.is_dir() {
            rust_files(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

#[test]
fn the_engine_source_names_no_atspi_text_mutator() {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = Vec::new();
    rust_files(&src, &mut files);
    assert!(files.len() > 10, "the walk found the engine's sources: {}", files.len());
    let mut found = Vec::new();
    for file in &files {
        let text = fs::read_to_string(file).expect("a source file reads");
        for literal in string_literals(&text) {
            for name in named(&literal) {
                found.push(format!(
                    "{}: \"{literal}\" names {name}",
                    file.strip_prefix(&src).unwrap().display()
                ));
            }
        }
    }
    assert!(
        found.is_empty(),
        "the engine must never call these AT-SPI members (GTK 3's PasteText reads freed stack, #268):\n{}",
        found.join("\n")
    );
}

#[test]
fn the_scan_sees_literals_and_skips_comments() {
    let src = r##"
        //! `PasteText`, "PasteText" and InsertText are never called
        /* "DeleteText" in a block /* nested "CutText" */ still a comment */
        const A: &str = "org.a11y.atspi.Text"; // "SetTextContents" after code
        let q = '"'; let l: &'a str = "ok"; let esc = "a \"quoted\" PasteTextual";
        call(EDITABLE, "PasteText", &[]);
        let raw = r#"x "InsertText" y"#;
    "##;
    let literals = string_literals(src);
    let hits: Vec<&str> = literals.iter().flat_map(|l| named(l)).collect();
    assert_eq!(hits, ["PasteText", "InsertText"], "{literals:?}");
    assert!(named("org.a11y.atspi.EditableText.DeleteText").contains(&"DeleteText"));
    assert!(named("CopyText").is_empty());
}
