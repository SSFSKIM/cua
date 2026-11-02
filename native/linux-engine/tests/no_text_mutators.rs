//! An early warning, not the guarantee (#268). It catches literal spellings only: a string literal in `src/` that
//! names `PasteText`, `CutText`, `InsertText`, `DeleteText` or `SetTextContents` as a whole word. A name built any
//! other way (`concat!`, `stringify!`, an escape such as `\x73`) passes it. The guarantee is the send boundary:
//! `Bus::send` refuses those `EditableText` members before anything is sent, and module privacy makes it the only way
//! a method call reaches the bus (`src/dbus.rs`; its tests, and `send_boundary.rs`). This scan only fails earlier, at
//! the spelling, where the boundary would fail at the call.
//!
//! Why the members are refused: text reaches an application only as a key chord through the route, and GTK 3's
//! text-view `PasteText` hands its clipboard request a pointer to its own stack, so when another process owns
//! CLIPBOARD the callback reads freed stack (nothing inserted on x86-64; gedit crashed on arm64).
//!
//! Comments and doc attributes (`#[doc = "…"]`) are documentation and do not count; the boundary's own list,
//! `TEXT_MUTATORS` in `src/dbus.rs`, is the one place the names are spelled.

#[path = "support/source.rs"]
mod source;

use source::{engine_sources, lex};

const FORBIDDEN: [&str; 5] = ["PasteText", "CutText", "InsertText", "DeleteText", "SetTextContents"];
/// The send boundary's own list (`src/dbus.rs`), cut out before the scan.
const BOUNDARY_LIST: &str = "const TEXT_MUTATORS";

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

/// `dbus.rs` without the boundary's list, from `const TEXT_MUTATORS` to the `];` that ends its array.
fn without_boundary_list(text: &str) -> String {
    let start = text
        .find(BOUNDARY_LIST)
        .expect("src/dbus.rs declares the send boundary's TEXT_MUTATORS");
    let end = start + text[start..].find("];").expect("the declaration ends") + 2;
    format!("{}{}", &text[..start], &text[end..])
}

#[test]
fn the_engine_source_names_no_atspi_text_mutator() {
    let mut found = Vec::new();
    for (path, text) in engine_sources() {
        let text = if path.as_os_str() == "dbus.rs" {
            without_boundary_list(&text)
        } else {
            text
        };
        for literal in lex(&text).literals {
            for name in named(&literal) {
                found.push(format!("{}: \"{literal}\" names {name}", path.display()));
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
fn the_scan_sees_literals_and_skips_comments_and_doc_attributes() {
    let src = r##"
        //! `PasteText`, "PasteText" and InsertText are never called
        /* "DeleteText" in a block /* nested "CutText" */ still a comment */
        const A: &str = "org.a11y.atspi.Text"; // "SetTextContents" after code
        let q = '"'; let l: &'a str = "ok"; let esc = "a \"quoted\" PasteTextual";
        call(EDITABLE, "PasteText", &[]);
        let raw = r#"x "InsertText" y"#;
        #[doc = "documents that CutText is never sent"]
        #![doc= r"nor DeleteText"]
        #[cfg_attr(test, doc = "nor SetTextContents")]
        let doc = "DeleteText";
    "##;
    let literals = lex(src).literals;
    let hits: Vec<&str> = literals.iter().flat_map(|l| named(l)).collect();
    assert_eq!(hits, ["PasteText", "InsertText", "DeleteText"], "{literals:?}");
    assert!(named("org.a11y.atspi.EditableText.DeleteText").contains(&"DeleteText"));
    assert!(named("CopyText").is_empty());
}

#[test]
fn only_the_boundary_list_is_cut_out_of_dbus_rs() {
    let text = "const X: &str = \"a\";\nconst TEXT_MUTATORS: [&str; 1] = [\"PasteText\"];\nlet y = \"CutText\";";
    let hits: Vec<&str> = lex(&without_boundary_list(text))
        .literals
        .iter()
        .flat_map(|l| named(l))
        .collect();
    assert_eq!(hits, ["CutText"]);
}
