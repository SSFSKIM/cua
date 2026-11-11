//! LibreOffice's positions on its gtk3 plugin (#171 M4, T16; LibreOffice 24.2, `vcl/unx/gtk3/gtkframe.cxx`). VCL draws a
//! window's content into one GTK widget below the native menu bar and reports that content's AT-SPI extents from its
//! frame's own idea of where the widget is. A ConfigureNotify (a move, a raise) sets that idea to the client's origin, and
//! each pointer event sets it to the widget's true origin (`UpdateGeometryFromEvent`), so after a configure and until the
//! next pointer event every VCL extent is too high by the menu bar's height (27 px on the #171 VM), in Writer, Calc and
//! Impress alike. The GTK side reports the truth meanwhile: the panel hosting VCL's root pane keeps its true rectangle.
//! A point taken from VCL extents is corrected by the difference between the host and the root pane where the two show
//! that offset, and refused where the structure is not that one, since a point known to be off is a false success.

/// `Component.GetExtents` corners, (x0, y0, x1, y1), as `atspi::extents` answers them.
pub type Rect = (i32, i32, i32, i32);

/// The refusal of a point-based element action whose LibreOffice position cannot be corrected.
pub const UNTRUSTED: &str = "LibreOffice's reported position for this element can't be trusted until the pointer has moved over its window; nothing was sent";

/// Whether a window is LibreOffice's, by the class part of its `WM_CLASS` (`libreoffice-writer`, `libreoffice-calc`,
/// `libreoffice-impress`, and `libreoffice` itself on the start centre).
pub fn is_libreoffice(class: Option<&str>) -> bool {
    class.is_some_and(|c| {
        let c = c.to_ascii_lowercase();
        c == "libreoffice" || c.starts_with("libreoffice-")
    })
}

/// The shift to add to a LibreOffice element's VCL extents, from the element and then its ancestors nearest first (each
/// role and extents, ending with the frame): none for an element outside VCL's root pane (GTK's own widgets, the host
/// panel among them, report true extents), none where the host panel and the root pane agree (after a pointer event),
/// the host's offset where the root pane sits at the client's origin with the host's size (after a configure), and
/// `UNTRUSTED` for anything else. The root pane may be the element itself. Also answers the root pane's index in the
/// chain, which is how many of the element's ancestors are VCL's and take the shift too (none for the root pane).
pub fn shift(chain: &[(String, Option<Rect>)]) -> Result<Option<(usize, (i32, i32))>, &'static str> {
    let Some(k) = chain.iter().position(|(role, _)| role == "root pane") else {
        return Ok(None);
    };
    let level = |i: usize| match chain.get(i) {
        Some((role, Some(rect))) if role == "panel" || i == k => Some(*rect),
        _ => None,
    };
    let (Some(root), Some(host), Some(client)) = (level(k), level(k + 1), level(k + 2)) else {
        return Err(UNTRUSTED);
    };
    if root == host {
        return Ok(Some((k, (0, 0))));
    }
    let size = |(x0, y0, x1, y1): Rect| (x1 - x0, y1 - y0);
    let known = size(root) == size(host)
        && root.0 == host.0
        && root.0 == client.0
        && root.1 == client.1
        && host.1 > root.1
        && host.3 <= client.3;
    if !known {
        return Err(UNTRUSTED);
    }
    Ok(Some((k, (host.0 - root.0, host.1 - root.1))))
}

/// A rectangle moved by a shift.
pub fn moved((x0, y0, x1, y1): Rect, (dx, dy): (i32, i32)) -> Rect {
    (x0 + dx, y0 + dy, x1 + dx, y1 + dy)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Writer's path on the #171 VM (task 72's hierarchy sitting), a paragraph and then its ancestors nearest first: the
    /// document text and two VCL panels, the root pane, the host panel, the client panel, the frame. `root_y` is where
    /// the root pane says it is: 21 after a configure, 48 after a pointer event.
    fn writer(root_y: i32) -> Vec<(String, Option<Rect>)> {
        let d = root_y - 48;
        vec![
            ("paragraph".into(), Some((207, 247 + d, 1000, 262 + d))),
            ("document text".into(), Some((0, 152 + d, 1207, 775 + d))),
            ("panel".into(), Some((0, 126 + d, 1221, 775 + d))),
            ("panel".into(), Some((0, 126 + d, 1280, 775 + d))),
            ("root pane".into(), Some((0, root_y, 1280, root_y + 752))),
            ("panel".into(), Some((0, 48, 1280, 800))),
            ("panel".into(), Some((0, 21, 1280, 800))),
            ("frame".into(), Some((0, 0, 1280, 800))),
        ]
    }

    /// The root pane named itself: the chain from it up (task 72's review, finding 1).
    fn root_pane(root_y: i32) -> Vec<(String, Option<Rect>)> {
        writer(root_y).split_off(4)
    }

    #[test]
    fn after_a_configure_vcl_extents_are_shifted_down_by_the_menu_bar() {
        // the paragraph and its three VCL ancestors up to the root pane take the shift
        assert_eq!(shift(&writer(21)), Ok(Some((4, (0, 27)))));
        assert_eq!(
            moved((207, 220, 1000, 235), (0, 27)),
            (207, 247, 1000, 262),
            "the paragraph lands where it is drawn"
        );
    }

    #[test]
    fn after_a_pointer_event_the_host_and_the_root_pane_agree_and_nothing_moves() {
        assert_eq!(shift(&writer(48)), Ok(Some((4, (0, 0)))));
    }

    #[test]
    fn the_root_pane_named_itself_is_shifted_and_none_of_its_ancestors() {
        assert_eq!(shift(&root_pane(21)), Ok(Some((0, (0, 27)))), "after a configure");
        assert_eq!(shift(&root_pane(48)), Ok(Some((0, (0, 0)))), "after a pointer event");
        let mut odd = root_pane(21);
        odd[0].1 = Some((0, 10, 1280, 762));
        assert_eq!(
            shift(&odd),
            Err(UNTRUSTED),
            "another shape is refused for the root pane too"
        );
    }

    #[test]
    fn the_host_panel_named_itself_is_gtk_s_own() {
        assert_eq!(shift(&writer(21).split_off(5)), Ok(None));
    }

    #[test]
    fn an_element_outside_the_root_pane_is_gtk_s_own_and_keeps_its_extents() {
        // the native menu bar's items: under the menu-bar panel, no root pane above them
        let menu = vec![
            ("menu bar".into(), Some((0, 21, 1256, 48))),
            ("viewport".into(), Some((0, 21, 1256, 48))),
            ("scroll pane".into(), Some((0, 21, 1256, 48))),
            ("panel".into(), Some((0, 21, 1280, 48))),
            ("panel".into(), Some((0, 21, 1280, 800))),
            ("frame".into(), Some((0, 0, 1280, 800))),
        ];
        assert_eq!(shift(&menu), Ok(None));
    }

    #[test]
    fn a_structure_without_the_menu_bar_offset_s_shape_is_refused() {
        // the root pane above its host's top
        let mut above = writer(21);
        above[4].1 = Some((0, 10, 1280, 762));
        assert_eq!(shift(&above), Err(UNTRUSTED), "not at the client's origin");
        // a root pane of another size than its host
        let mut size = writer(21);
        size[4].1 = Some((0, 21, 1280, 700));
        assert_eq!(shift(&size), Err(UNTRUSTED));
        // shifted sideways
        let mut side = writer(21);
        side[4].1 = Some((5, 21, 1285, 773));
        assert_eq!(shift(&side), Err(UNTRUSTED));
        // the host not a panel, or missing extents
        let mut role = writer(21);
        role[5].0 = "filler".into();
        assert_eq!(shift(&role), Err(UNTRUSTED));
        let mut none = writer(21);
        none[5].1 = None;
        assert_eq!(shift(&none), Err(UNTRUSTED));
        // the root pane the frame's own child
        let short: Vec<_> = writer(21).into_iter().take(6).collect();
        assert_eq!(shift(&short), Err(UNTRUSTED));
    }

    #[test]
    fn libreoffice_is_told_by_its_window_class() {
        assert!(is_libreoffice(Some("libreoffice-writer")));
        assert!(is_libreoffice(Some("libreoffice-calc")));
        assert!(is_libreoffice(Some("LibreOffice-Impress")));
        assert!(is_libreoffice(Some("libreoffice")));
        assert!(!is_libreoffice(Some("gedit")));
        assert!(!is_libreoffice(Some("libreofficeish")));
        assert!(!is_libreoffice(None));
    }
}
