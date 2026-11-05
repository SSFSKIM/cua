//! The waits that follow keys (M4's T7, as the design session ruled on task 59's measurement, 2026-11-04). A background
//! session's `FocusOut` goes as its request's input ends, the window's redirect kept (`route.rs`): with the redirect
//! held, a `FocusOut` at once cut and reordered no key on any family, idle or at twice the load (task 59; task 58 on
//! `:0`). Two things still follow a window's last key, and wait for time to pass since it:
//!
//! - **The exit's settle.** The exit drops every redirect the engine holds, and a covered Chromium window whose redirect
//!   goes while it still has keys queued cuts them and delivers them only with its next `FocusIn` (task 56). So the exit
//!   waits until `EXIT_SETTLE` has passed since the last key to a window it still holds redirected.
//! - **The paste's settle.** A paste observes its field before it acts, and keys sent just before it may not have landed
//!   yet: the observation then reads the field short, and the paste is refused with nothing sent or lands at a caret
//!   the confirmation did not expect (task 59: Chrome, Electron, Firefox and gnome-terminal at 0). So a paste whose
//!   window took keys within `PASTE_SETTLE` waits, before its observation and before the clipboard lock, until that long
//!   has passed since the last of them (`engine/paste.rs`), never between its observation and its dispatch.

use std::time::{Duration, Instant};

/// The exit's settle (the design session's ruling on T7's escalation, 2026-11-04): the smallest value that held 30
/// consecutive independent SIGTERM runs at twice the load on Chrome and on Electron, in 50 ms steps (0: 24/30 and
/// 17/30; 200: 26/30 and 28/30; 250: 30/30 both in its step, then 29/30 on Chrome in a full sitting, one whole burst
/// cut; 300: 30/30 both, and in the full sitting; task 56's exit-settle steps). The unredirect cut no click at any step
/// (10/10 each), so the settle follows keys only.
pub const EXIT_SETTLE: Duration = Duration::from_millis(300);

/// The paste's settle: the smallest of 25, 50, 75 and 100 ms that held 30 consecutive independent key-then-paste runs
/// on all 8 families, idle and at twice the load (task 60's sittings; evidence `m4/paste-settle/`).
pub const PASTE_SETTLE: Duration = Duration::from_millis(100);

/// When a settle of `settle` after the latest of `last_keys` ends: None when there is no key.
pub fn until(last_keys: impl IntoIterator<Item = Instant>, settle: Duration) -> Option<Instant> {
    last_keys.into_iter().max().map(|at| at + settle)
}

/// What a paste's settle waits, given the last key to its window (None: none) and the time now: the rest of the settle
/// since that key, zero once it has passed.
pub fn paste_wait(last_key: Option<Instant>, settle: Duration, now: Instant) -> Duration {
    until(last_key, settle).map_or(Duration::ZERO, |end| end.saturating_duration_since(now))
}

/// Sleeps until `until`, if it is still ahead; the time slept.
pub fn wait(until: Option<Instant>) -> Duration {
    let wait = until.map_or(Duration::ZERO, |end| end.saturating_duration_since(Instant::now()));
    if !wait.is_zero() {
        std::thread::sleep(wait);
    }
    wait
}

#[cfg(test)]
mod tests {
    use super::*;

    const MS: Duration = Duration::from_millis(1);

    #[test]
    fn a_settle_ends_its_length_after_the_latest_key() {
        let start = Instant::now();
        assert_eq!(until([start, start + 50 * MS], 300 * MS), Some(start + 350 * MS));
        assert_eq!(until(std::iter::empty(), 300 * MS), None, "no key, no settle");
    }

    #[test]
    fn a_paste_waits_the_rest_of_its_settle_since_its_window_s_last_key_and_nothing_after_it() {
        let key = Instant::now();
        let settle = 60 * MS;
        assert_eq!(paste_wait(Some(key), settle, key), settle, "straight after the key");
        assert_eq!(paste_wait(Some(key), settle, key + 25 * MS), 35 * MS, "only the rest");
        assert_eq!(paste_wait(Some(key), settle, key + settle), Duration::ZERO);
        assert_eq!(
            paste_wait(Some(key), settle, key + 2 * settle),
            Duration::ZERO,
            "long past"
        );
        assert_eq!(paste_wait(None, settle, key), Duration::ZERO, "no key to its window");
        assert_eq!(
            paste_wait(Some(key), Duration::ZERO, key),
            Duration::ZERO,
            "no settle set"
        );
    }

    #[test]
    fn a_wait_already_past_sleeps_nothing() {
        assert_eq!(wait(None), Duration::ZERO);
        assert_eq!(wait(Some(Instant::now() - 10 * MS)), Duration::ZERO);
        let started = Instant::now();
        let slept = wait(Some(started + 20 * MS));
        assert!(slept <= 20 * MS && started.elapsed() >= 20 * MS, "{slept:?}");
    }

    #[test]
    fn the_settles_hold_their_measured_values() {
        assert_eq!(EXIT_SETTLE, 300 * MS);
        assert!(
            [25, 50, 75, 100].map(|ms| ms * MS).contains(&PASTE_SETTLE),
            "one of the steps measured"
        );
    }
}
