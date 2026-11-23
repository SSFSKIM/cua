//! Chromium's drag-and-drop cursors as the installed Xcursor themes draw them, which is how an Electron drop's accept
//! is told by its own image (`drop_cursor.rs`; the design session's ruling on task 73's second review, 2026-11-11).
//!
//! Chromium's drag loop shows its target's last status as a cursor of its own making: `kDndNone`, `kDndMove`,
//! `kDndCopy` or `kDndLink` for the negotiated operation (`DesktopDragDropClientOzoneLinux::OnDragOperationChanged`),
//! after `kGrabbing` at the drag's start (`DesktopDragDropClientOzone::StartDragAndDrop`). Each type's cursor is the
//! first of its names (`CursorNamesFromType`: `dnd-none`, `dnd-move`, `dnd-copy`, `dnd-link`, each then `hand2`;
//! `closedhand`, `grabbing`, `hand2`; then `left_ptr` for every type) found in the toolkit's theme, `Xcursor.theme` or
//! `default`, each with the themes it inherits, under the Xcursor search path, and its images are the file's, pixels
//! and hotspot unchanged (`ui/base/x/x11_cursor_loader.cc`). So the images an accept can show are known before any
//! drag: the `dnd-move`, `dnd-copy` and `dnd-link` cursors' in the installed themes. The engine cannot know which
//! theme Electron chose, and a theme may draw two types alike (breeze_cursors draws `dnd-move` as `dnd-none`, task 73's
//! second fix wave), so an image counts as an accept only when it is an accepting cursor's in some theme and in no
//! theme a refusing one's: `dnd-none`, the grabbing hand, and the fallbacks every type shares, `hand2` and `left_ptr`,
//! which tell an accepting type neither from the others nor from the page's own cursors. A move under breeze_cursors
//! is never confirmed, and a copy is.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use crate::accept::{Image, fingerprint};

/// The accepting types' own cursors (`CursorNamesFromType`'s first names for `kDndMove`, `kDndCopy`, `kDndLink`).
const ACCEPTING: [&str; 3] = ["dnd-move", "dnd-copy", "dnd-link"];
/// The no-drop and grabbing types' cursors, and the fallbacks every type shares.
const REFUSING: [&str; 5] = ["dnd-none", "closedhand", "grabbing", "hand2", "left_ptr"];

/// Libxcursor's search path, which Chromium uses when `XCURSOR_PATH` is unset.
const DEFAULT_PATH: &str = "~/.local/share/icons:~/.icons:/usr/share/icons:/usr/share/pixmaps:/usr/X11R6/lib/X11/icons";

/// The images of Chromium's accepting drag cursors and of its refusing ones, over every installed theme.
#[derive(Debug, Default)]
pub struct DragImages {
    accepting: HashSet<Image>,
    refusing: HashSet<Image>,
}

impl DragImages {
    /// Every theme under `dirs` (an Xcursor search path), and `default`, each with the themes it inherits.
    pub fn load(dirs: &[PathBuf]) -> DragImages {
        let mut images = DragImages::default();
        let mut themes: Vec<String> = dirs
            .iter()
            .filter_map(|dir| std::fs::read_dir(dir).ok())
            .flatten()
            .filter_map(|entry| entry.ok()?.file_name().into_string().ok())
            .filter(|name| valid_theme(name))
            .collect();
        themes.push("default".into());
        themes.sort();
        themes.dedup();
        let images_of = |theme: &str, name: &str| -> Vec<Image> {
            read_cursor(dirs, theme, name, &mut Vec::new())
                .map(|bytes| parse(&bytes))
                .unwrap_or_default()
        };
        for theme in &themes {
            images
                .accepting
                .extend(ACCEPTING.iter().flat_map(|name| images_of(theme, name)));
            images
                .refusing
                .extend(REFUSING.iter().flat_map(|name| images_of(theme, name)));
        }
        images
    }

    /// The installed themes, read once for the engine's life, from `XCURSOR_PATH` or libXcursor's default path.
    pub fn installed() -> &'static DragImages {
        static INSTALLED: OnceLock<DragImages> = OnceLock::new();
        INSTALLED.get_or_init(|| DragImages::load(&search_path(std::env::var("XCURSOR_PATH").ok().as_deref())))
    }

    /// Whether `image` is an accept: an accepting cursor's image in some theme, and no refusing cursor's in any.
    pub fn accepts(&self, image: Image) -> bool {
        self.accepting.contains(&image) && !self.refusing.contains(&image)
    }

    /// Whether any image can be told for an accept at all (no theme draws one apart from its no-drop: nothing can).
    pub fn any_accept(&self) -> bool {
        self.accepting.iter().any(|image| !self.refusing.contains(image))
    }

    /// Images given directly, for the judge's tests.
    #[cfg(test)]
    pub fn of(accepting: &[Image], refusing: &[Image]) -> DragImages {
        DragImages {
            accepting: accepting.iter().copied().collect(),
            refusing: refusing.iter().copied().collect(),
        }
    }
}

/// The Xcursor search path: `XCURSOR_PATH` when set and not empty, else libXcursor's default, `~` the home directory.
pub fn search_path(env: Option<&str>) -> Vec<PathBuf> {
    let path = env.filter(|p| !p.is_empty()).unwrap_or(DEFAULT_PATH);
    let home = std::env::var_os("HOME").map(PathBuf::from);
    path.split(':')
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .filter_map(|p| match p.strip_prefix('~') {
            Some(rest) => home.as_ref().map(|h| h.join(rest.trim_start_matches('/'))),
            None => Some(PathBuf::from(p)),
        })
        .collect()
}

/// A theme name Chromium accepts: one path component, not `.` or `..`.
fn valid_theme(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains('/')
}

/// The file of the cursor `name` in `theme` (`ReadCursorFromThemeImpl`): the first directory of the path whose
/// `<theme>/cursors/<name>` reads, else the same in each theme the first `index.theme` found inherits, depth first.
fn read_cursor(dirs: &[PathBuf], theme: &str, name: &str, seen: &mut Vec<String>) -> Option<Vec<u8>> {
    if !valid_theme(theme) || seen.iter().any(|t| t == theme) {
        return None;
    }
    seen.push(theme.to_string());
    let mut bases = Vec::new();
    for dir in dirs {
        let theme_dir = dir.join(theme);
        if let Ok(bytes) = std::fs::read(theme_dir.join("cursors").join(name)) {
            return Some(bytes);
        }
        if bases.is_empty() {
            bases = inherits(&theme_dir.join("index.theme"));
        }
    }
    bases.iter().find_map(|base| read_cursor(dirs, base, name, seen))
}

/// The themes an `index.theme` inherits (`GetBaseThemes`): its `Inherits` line, split on commas and semicolons.
fn inherits(index: &Path) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(index) else {
        return Vec::new();
    };
    text.lines()
        .filter_map(|line| line.split_once('='))
        .find(|(key, _)| key.trim() == "Inherits")
        .map(|(_, value)| {
            value
                .split([',', ';'])
                .map(str::trim)
                .filter(|t| !t.is_empty())
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}

/// Every image of an Xcursor file, of every nominal size (Chromium keeps the size nearest its own, which the engine
/// cannot know), as `accept.rs` fingerprints what XFixes answers for a cursor: its size, hotspot and ARGB pixels.
pub fn parse(bytes: &[u8]) -> Vec<Image> {
    const IMAGE: u32 = 0xfffd_0002;
    let word = |at: usize| -> Option<u32> {
        bytes
            .get(at..at + 4)
            .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    };
    let (Some(b"Xcur"), Some(header), Some(entries)) = (bytes.get(..4), word(4), word(12)) else {
        return Vec::new();
    };
    let mut images = Vec::new();
    for entry in 0..entries as usize {
        let at = header as usize + entry * 12;
        let (Some(kind), Some(position)) = (word(at), word(at + 8)) else {
            break;
        };
        if kind != IMAGE {
            continue;
        }
        let p = position as usize;
        let (Some(width), Some(height), Some(xhot), Some(yhot)) =
            (word(p + 16), word(p + 20), word(p + 24), word(p + 28))
        else {
            continue;
        };
        if width == 0 || height == 0 || width > 8192 || height > 8192 {
            continue;
        }
        let pixels: Option<Vec<u32>> = (0..(width * height) as usize).map(|i| word(p + 36 + i * 4)).collect();
        if let Some(pixels) = pixels {
            images.push(fingerprint(
                width as u16,
                height as u16,
                xhot as u16,
                yhot as u16,
                &pixels,
            ));
        }
    }
    images
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An Xcursor file of one image per `(nominal size, pixel)`, each `size` square, its hotspot at 1, 1, filled.
    fn xcursor(images: &[(u32, u32)]) -> Vec<u8> {
        let word = |out: &mut Vec<u8>, w: u32| out.extend_from_slice(&w.to_le_bytes());
        let mut out = b"Xcur".to_vec();
        let header = 16;
        word(&mut out, header);
        word(&mut out, 0x1_0000);
        word(&mut out, images.len() as u32);
        let mut position = header + 12 * images.len() as u32;
        for &(size, _) in images {
            word(&mut out, 0xfffd_0002);
            word(&mut out, size);
            word(&mut out, position);
            position += 36 + 4 * size * size;
        }
        for &(size, pixel) in images {
            for w in [36, 0xfffd_0002, size, 1, size, size, 1, 1, 0] {
                word(&mut out, w);
            }
            for _ in 0..size * size {
                word(&mut out, pixel);
            }
        }
        out
    }

    fn image(size: u32, pixel: u32) -> Image {
        fingerprint(size as u16, size as u16, 1, 1, &vec![pixel; (size * size) as usize])
    }

    /// A fixture theme: its name, its `Inherits`, and its cursors by name, each its images as `xcursor` takes them.
    type Theme<'a> = (&'a str, Option<&'a str>, &'a [(&'a str, &'a [(u32, u32)])]);

    /// A search path of one directory holding `themes`.
    fn path_of(tag: &str, themes: &[Theme]) -> Vec<PathBuf> {
        let dir = std::env::temp_dir().join(format!("cua-engine-drag-cursors-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        for (theme, inherits, cursors) in themes {
            let cursor_dir = dir.join(theme).join("cursors");
            std::fs::create_dir_all(&cursor_dir).unwrap();
            if let Some(base) = inherits {
                std::fs::write(
                    dir.join(theme).join("index.theme"),
                    format!("[Icon Theme]\nInherits={base}\n"),
                )
                .unwrap();
            }
            for (name, images) in *cursors {
                std::fs::write(cursor_dir.join(name), xcursor(images)).unwrap();
            }
        }
        vec![dir]
    }

    const NONE: u32 = 0xff00_0001;
    const COPY: u32 = 0xff00_0002;
    const MOVE: u32 = 0xff00_0003;
    const ARROW: u32 = 0xff00_0004;
    const HAND: u32 = 0xff00_0005;

    #[test]
    fn a_theme_s_accepting_cursors_are_accepts_unless_it_draws_them_as_its_no_drop() {
        // breeze_cursors: dnd-move and grabbing drawn as dnd-none, dnd-copy apart, at two sizes
        let dirs = path_of(
            "breeze",
            &[(
                "breeze",
                None,
                &[
                    ("dnd-none", &[(24, NONE), (32, NONE)]),
                    ("dnd-move", &[(24, NONE), (32, NONE)]),
                    ("grabbing", &[(24, NONE)]),
                    ("dnd-copy", &[(24, COPY), (32, COPY)]),
                    ("left_ptr", &[(24, ARROW)]),
                ],
            )],
        );
        let images = DragImages::load(&dirs);
        assert!(
            images.accepts(image(24, COPY)) && images.accepts(image(32, COPY)),
            "a copy, at either size"
        );
        assert!(!images.accepts(image(24, NONE)), "no drop, and a move drawn as no drop");
        assert!(images.any_accept());
        // dnd-link is missing, and so is hand2: Chromium's link cursor is left_ptr, which tells nothing
        assert!(
            !images.accepts(image(24, ARROW)),
            "the link's fallback, the plain arrow"
        );
    }

    #[test]
    fn an_image_any_theme_draws_as_no_drop_or_grabbing_is_never_an_accept() {
        // one theme's move is another's no drop; a third's copy is its own grabbing hand
        let dirs = path_of(
            "cross",
            &[
                (
                    "one",
                    None,
                    &[
                        ("dnd-none", &[(24, NONE)]),
                        ("dnd-move", &[(24, MOVE)]),
                        ("dnd-copy", &[(24, COPY)]),
                    ],
                ),
                ("two", None, &[("dnd-none", &[(24, MOVE)]), ("dnd-copy", &[(24, COPY)])]),
                (
                    "three",
                    None,
                    &[("dnd-copy", &[(24, HAND)]), ("closedhand", &[(24, HAND)])],
                ),
            ],
        );
        let images = DragImages::load(&dirs);
        assert!(images.accepts(image(24, COPY)));
        assert!(!images.accepts(image(24, MOVE)), "no drop in theme two");
        assert!(!images.accepts(image(24, HAND)), "grabbing in theme three");
        assert!(!images.accepts(image(24, NONE)));
    }

    #[test]
    fn a_theme_s_inherited_drag_cursors_count_and_the_shared_fallbacks_never_do() {
        // child inherits base's dnd-copy and dnd-move; bare has only hand2, which every type falls back to
        let dirs = path_of(
            "inherit",
            &[
                ("base", None, &[("dnd-copy", &[(24, COPY)])]),
                (
                    "child",
                    Some("base"),
                    &[("dnd-none", &[(24, NONE)]), ("hand2", &[(24, HAND)])],
                ),
                ("bare", None, &[("hand2", &[(24, HAND)])]),
                ("moves", Some("missing, base"), &[]),
            ],
        );
        let images = DragImages::load(&dirs);
        assert!(images.accepts(image(24, COPY)), "inherited");
        assert!(
            !images.accepts(image(24, HAND)),
            "in bare every type is hand2: nothing tells them apart"
        );
        let lone = path_of("lone", &[("lone", None, &[("hand2", &[(24, HAND)])])]);
        assert!(
            !DragImages::load(&lone).any_accept(),
            "a theme with no drag cursors of its own tells no accept"
        );
    }

    #[test]
    fn with_no_theme_installed_nothing_is_an_accept() {
        let images = DragImages::load(&[PathBuf::from("/nonexistent/cua-engine-drag-cursors")]);
        assert!(!images.any_accept());
        assert!(!images.accepts(image(24, COPY)));
    }

    #[test]
    fn a_malformed_file_has_no_image() {
        assert!(parse(b"").is_empty());
        assert!(parse(b"Xcur").is_empty());
        let mut cut = xcursor(&[(24, COPY)]);
        cut.truncate(cut.len() - 4);
        assert!(parse(&cut).is_empty(), "its pixels cut short");
        assert_eq!(
            parse(&xcursor(&[(24, COPY), (32, COPY)])),
            [image(24, COPY), image(32, COPY)]
        );
    }

    #[test]
    fn the_search_path_is_xcursor_path_s_else_libxcursor_s_default() {
        assert_eq!(search_path(Some("/a:/b")), [PathBuf::from("/a"), PathBuf::from("/b")]);
        let default = search_path(Some(""));
        assert!(default.contains(&PathBuf::from("/usr/share/icons")));
        assert_eq!(default, search_path(None));
    }
}
