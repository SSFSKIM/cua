//! Stamps `cua-engine --version` with the commit it was built from: `CUA_ENGINE_GIT_SHA` when the build sets it
//! (a hermetic release build), else `git rev-parse`, else `unknown`.

fn main() {
    println!("cargo:rerun-if-env-changed=CUA_ENGINE_GIT_SHA");
    let sha = std::env::var("CUA_ENGINE_GIT_SHA")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| {
            let out = std::process::Command::new("git")
                .args(["rev-parse", "--short=12", "HEAD"])
                .output()
                .ok()?;
            out.status
                .success()
                .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
        });
    println!(
        "cargo:rustc-env=CUA_ENGINE_GIT_SHA={}",
        sha.unwrap_or_else(|| "unknown".into())
    );
}
