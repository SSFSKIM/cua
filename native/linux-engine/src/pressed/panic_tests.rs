//! The panic hook's release, in a child process: the test runs its own binary again, where the engine's hook is installed
//! and a send panics with the ledger's lock held (the re-review of M4 T7b's fix). Test-only, and the one place in
//! `pressed` that starts a process (`tests/send_boundary.rs` allows it here).

use super::*;

/// The child half of [`a_panic_inside_a_send_releases_every_key_before_its_diagnostics`]: it runs only in the
/// child process that test starts, with the engine's own ledger and hook.
#[test]
fn panic_inside_a_send_child() {
    if std::env::var_os(PANIC_CHILD).is_none() {
        return;
    }
    fn record(keys: &[Pressed]) {
        eprintln!("released {keys:?}");
    }
    release_first_at_panic(record);
    // the engine aborts once its hook has run (`panic = "abort"`); the test profile unwinds, so the process ends here,
    // the send's lock never given back (an exit rather than an abort: no core dump)
    let engine_s = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        engine_s(info);
        eprintln!("the hook returned");
        std::process::exit(134);
    }));
    let _ = desktop_key(38, true, || Ok::<_, ()>(()));
    let _ = desktop_key(50, true, || -> Result<(), ()> { panic!("inside the send") });
}

const PANIC_CHILD: &str = "CUA_ENGINE_PANIC_CHILD";

#[test]
fn a_panic_inside_a_send_releases_every_key_before_its_diagnostics() {
    // the panicking thread holds the ledger's lock inside the send: the release must not wait for it, and must not
    // wait for the diagnostics either (the re-review of M4 T7b's fix)
    let out = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "pressed::panic_tests::panic_inside_a_send_child",
            "--nocapture",
            "--test-threads",
            "1",
        ])
        .env(PANIC_CHILD, "1")
        .output()
        .unwrap();
    let stderr = String::from_utf8_lossy(&out.stderr);
    let released = stderr.find("released [Desktop(50), Desktop(38)]");
    let diagnostics = stderr.find("panicked at");
    let aborted = stderr.find("the hook returned");
    assert!(
        released.is_some(),
        "both keys released, the one being pressed too:\n{stderr}"
    );
    assert!(diagnostics.is_some() && aborted.is_some(), "{stderr}");
    assert!(released < diagnostics, "the release before the diagnostics:\n{stderr}");
}
