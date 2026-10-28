//! Stamps `cua-engine --version` with the commit it was built from: `CUA_ENGINE_GIT_SHA` when the build sets it
//! (a hermetic release build), else `git rev-parse`, else `unknown`. The script reruns when HEAD, the ref it
//! resolves to or the packed refs change, so a cached binary never reports an older commit.

use std::process::Command;

fn git(args: &[&str]) -> Option<String> {
    let out = Command::new("git").args(args).output().ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn main() {
    println!("cargo:rerun-if-env-changed=CUA_ENGINE_GIT_SHA");
    if let Some(sha) = std::env::var("CUA_ENGINE_GIT_SHA").ok().filter(|s| !s.is_empty()) {
        println!("cargo:rustc-env=CUA_ENGINE_GIT_SHA={sha}");
        return;
    }
    // `--git-path` resolves each file in a worktree too (HEAD in the worktree's git dir, refs in the common one).
    let mut watched = vec!["HEAD".to_string(), "packed-refs".to_string()];
    if let Some(reference) = git(&["symbolic-ref", "-q", "HEAD"]) {
        watched.push(reference);
    }
    for name in watched {
        if let Some(path) = git(&["rev-parse", "--path-format=absolute", "--git-path", &name]) {
            println!("cargo:rerun-if-changed={path}");
        }
    }
    let sha = git(&["rev-parse", "--short=12", "HEAD"]).unwrap_or_else(|| "unknown".into());
    println!("cargo:rustc-env=CUA_ENGINE_GIT_SHA={sha}");
}
