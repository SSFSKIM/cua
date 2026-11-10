//! The real pointer's watch for a family that takes background pointer input only while the pointer is in its window
//! (Gecko, `unless_pointer_within`; T19, evidence `m4/pointer-route/`). The route reads the pointer once, before
//! anything is sent; the person may move it out between that read and the application's handling of the events, and
//! the application then ignores them. So a background click, scroll, move or drag into such a window is watched, on
//! the press watch's connection (`stray.rs`), from just before a second read of the pointer until a round trip after
//! its events went out, and the pointer is read again at the end: a request the pointer left the window during, or
//! ended outside it, answers that the application may not have taken it, never success.
//!
//! Known limit: the watch ends a round trip after the events reached the server, so they are in the application's queue
//! ahead of any later crossing; an application that reads the pointer's state again when it handles them, after a later
//! leave, is not seen.

use anyhow::{Result, anyhow};
use serde_json::json;
use x11rb::protocol::xproto::Window;

use super::Engine;
use super::way::Way;
use crate::families::{Kind, When};
use crate::stray::{StrayWatch, Watching};

/// A request's watch on the real pointer leaving its window.
pub(super) struct WithinWatch {
    watch: StrayWatch,
    watching: Watching,
    window: Window,
}

/// The answer to a background request into a family that takes pointer input only while the real pointer is in its
/// window, when the pointer left the window during it (T19): never success, since the family stopped taking the
/// request's events once the pointer was out. `what`: the request, as the sentence names it (`click`, `drag`, ...).
pub(super) fn pointer_left(app: &str, what: &str) -> String {
    format!(
        "{app} may not have taken the {what}: the desktop pointer left its window during the {what}, and {app} takes \
         background pointer input only while the pointer is in its window. Read the window to see what happened before \
         trying again"
    )
}

/// The answer to such a request whose pointer watch failed before it could say whether the pointer stayed in the window.
pub(super) fn pointer_watch_failed(app: &str, what: &str, why: &str) -> String {
    format!(
        "the pointer watch on your {what} into {app} failed ({why}), so whether {app} took the {what} cannot be told: it \
         takes background pointer input only while the desktop pointer is in its window. Read the window to see what \
         happened before trying again"
    )
}

impl Engine {
    /// The route `way` (just chosen for `kind` into `window`) with its pointer watch: on the background route into a
    /// family listed `unless_pointer_within` (and without `--ignore-pointer`), the watch begins and the pointer is read
    /// again, so a leave after the route's own read is seen; a pointer already gone by then is judged outside, with no
    /// third read (refused in shared mode, the foreground route in dedicated mode), nothing sent. Otherwise `way`,
    /// unwatched.
    pub(super) fn watch_within(
        &mut self,
        window: Option<Window>,
        kind: Kind,
        way: Way,
    ) -> Result<(Way, Option<WithinWatch>)> {
        // every pointer request's route passes here: through XTEST it would end a held drag handle (`handle.rs`)
        self.refuse_while_held(way)?;
        let Some(window) = window.filter(|_| way == Way::Background && !self.cfg.ignore_pointer) else {
            return Ok((way, None));
        };
        if self.family_of(window).and_then(|f| f.ignores(kind)) != Some(When::UnlessPointerWithin) {
            return Ok((way, None));
        }
        let mut watch = match self.stray_watch.take() {
            Some(watch) => watch,
            None => StrayWatch::connect()?,
        };
        let watching = watch.begin_leaves(window)?;
        if self.pointer_within(window) {
            return Ok((
                way,
                Some(WithinWatch {
                    watch,
                    watching,
                    window,
                }),
            ));
        }
        let _ = watch.finish(watching);
        self.stray_watch = Some(watch).filter(StrayWatch::healthy);
        // judged outside on this read, never read a third time: a pointer back by then would take the background
        // route with no watch, and a leave during the request would answer success
        let way = self.route_judged(window, true)?;
        self.refuse_while_held(way)?;
        Ok((way, None))
    }

    /// The watch's word once the request's events went out (`what` names the request): None when the pointer stayed
    /// in the window, else the answer, the pointer having left during the request, being outside now, or the watch
    /// having failed. The watch's connection is kept for the next request; `--stats` `pointer_watch` records it.
    pub(super) fn within_answer(&mut self, watch: Option<WithinWatch>, what: &str) -> Option<anyhow::Error> {
        let WithinWatch {
            mut watch,
            watching,
            window,
        } = watch?;
        // test builds only: the desktop changed between the events' sending and the watch's reading
        #[cfg(test)]
        crate::fault::identity(crate::fault::Identity::PointerSent);
        let seen = watch.finish(watching);
        let inside_at_end = self.pointer_within(window);
        self.stray_watch = Some(watch).filter(StrayWatch::healthy);
        let app = self
            .x
            .get_window(window)
            .map_or_else(|_| format!("window {window}"), |w| w.app);
        let (leaves, answer) = match seen {
            Ok(leaves) => (
                json!(leaves.count()),
                (leaves.count() > 0 || !inside_at_end).then(|| anyhow!(pointer_left(&app, what))),
            ),
            Err(error) => {
                let why = format!("{error:#}");
                (json!(why), Some(anyhow!(pointer_watch_failed(&app, what, &why))))
            }
        };
        self.extra.insert(
            "pointer_watch".into(),
            json!({ "leaves": leaves, "inside_at_end": inside_at_end }),
        );
        answer
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_pointer_s_sentences_name_the_request_and_never_say_it_was_taken() {
        assert_eq!(
            pointer_left("firefox", "click"),
            concat!(
                "firefox may not have taken the click: the desktop pointer left its window during the click, and ",
                "firefox takes background pointer input only while the pointer is in its window. Read the window to ",
                "see what happened before trying again"
            )
        );
        assert!(
            pointer_watch_failed("firefox", "scroll", "lost")
                .contains("whether firefox took the scroll cannot be told")
        );
    }
}
