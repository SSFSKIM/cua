//! A small lexer over the engine's Rust source, for the static source tests (`no_text_mutators.rs`,
//! `send_boundary.rs`): comments dropped, string literals collected, the rest kept as code. A string that is the value
//! of a `doc` attribute (`#[doc = "…"]`, `#![doc = "…"]`, `doc = "…"` inside `cfg_attr`) is documentation, like a doc
//! comment: neither a literal nor code.

#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};

pub struct Lexed {
    /// Every string literal's contents (escapes left as written), doc strings excluded.
    pub literals: Vec<String>,
    /// The source with comments removed and every string literal replaced by `""`.
    pub code: String,
}

fn is_ident(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_'
}

/// Whether the code before a string makes it a `doc` attribute's value: `doc` `=` directly before it.
fn is_doc_value(code: &str) -> bool {
    let Some(before_eq) = code.trim_end().strip_suffix('=') else {
        return false;
    };
    let Some(before_doc) = before_eq.trim_end().strip_suffix("doc") else {
        return false;
    };
    // an attribute's `doc`: right after `[` (`#[doc`, `#![doc`), `(` or `,` (inside `cfg_attr`), never `let doc =`
    matches!(before_doc.trim_end().bytes().last(), Some(b'[' | b'(' | b','))
}

pub fn lex(src: &str) -> Lexed {
    let b = src.as_bytes();
    let mut literals = Vec::new();
    let mut code = String::with_capacity(src.len());
    let take = |code: &mut String, literals: &mut Vec<String>, text: &str| {
        if !is_doc_value(code) {
            literals.push(text.to_string());
        }
        code.push_str("\"\"");
    };
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
            b'r' if matches!(b.get(i + 1), Some(b'"') | Some(b'#'))
                && (i == 0 || !is_ident(b[i - 1]) || (b[i - 1] == b'b' && (i < 2 || !is_ident(b[i - 2])))) =>
            {
                let mut j = i + 1;
                let mut hashes = 0;
                while b.get(j) == Some(&b'#') {
                    hashes += 1;
                    j += 1;
                }
                if b.get(j) != Some(&b'"') {
                    code.push('r');
                    i += 1;
                    continue;
                }
                let start = j + 1;
                let close: Vec<u8> = std::iter::once(b'"').chain(std::iter::repeat_n(b'#', hashes)).collect();
                let end = (start..b.len())
                    .find(|&k| b[k..].starts_with(&close))
                    .unwrap_or(b.len());
                take(&mut code, &mut literals, &src[start..end]);
                i = end + close.len();
            }
            b'"' => {
                let start = i + 1;
                let mut j = start;
                while j < b.len() && b[j] != b'"' {
                    j += if b[j] == b'\\' { 2 } else { 1 };
                }
                take(&mut code, &mut literals, &src[start..j.min(b.len())]);
                i = j + 1;
            }
            b'\'' => {
                // a char literal ('x', '\n', '"', '\''), else a lifetime ('a): only a literal is stepped over
                let end = if b.get(i + 1) == Some(&b'\\') {
                    let mut j = i + 2;
                    while j < b.len() && b[j] != b'\'' {
                        j += 1;
                    }
                    j + 1
                } else if b.get(i + 2) == Some(&b'\'') {
                    i + 3
                } else {
                    i + 1
                };
                code.push_str(&src[i..end.min(b.len())]);
                i = end;
            }
            _ => {
                let len = src[i..].chars().next().map_or(1, char::len_utf8);
                code.push_str(&src[i..i + len]);
                i += len;
            }
        }
    }
    Lexed { literals, code }
}

/// Every `.rs` file under `dir`, with its path relative to `dir`.
pub fn rust_files(dir: &Path) -> Vec<(PathBuf, String)> {
    fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
        for entry in fs::read_dir(dir).expect("the directory is readable") {
            let path = entry.expect("a directory entry").path();
            if path.is_dir() {
                walk(&path, out);
            } else if path.extension().is_some_and(|e| e == "rs") {
                out.push(path);
            }
        }
    }
    let mut paths = Vec::new();
    walk(dir, &mut paths);
    paths.sort();
    paths
        .into_iter()
        .map(|p| {
            let text = fs::read_to_string(&p).expect("a source file reads");
            (p.strip_prefix(dir).unwrap().to_path_buf(), text)
        })
        .collect()
}

/// The engine's sources, relative to `src/`.
pub fn engine_sources() -> Vec<(PathBuf, String)> {
    let files = rust_files(&Path::new(env!("CARGO_MANIFEST_DIR")).join("src"));
    assert!(files.len() > 10, "the walk found the engine's sources: {}", files.len());
    files
}
