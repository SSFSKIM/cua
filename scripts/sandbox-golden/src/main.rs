// The golden generator for cua's seatbelt port (#115, M0). It runs the original's own profile generation, from
// openai/codex rust-v0.159.2 (ff6aec96948b70d94983af2641a6b67c94faeff5, Apache-2.0), on one fixture input and
// prints what `codex sandbox` would hand /usr/bin/sandbox-exec for it, as JSON:
//
//   stdin  {"cwd": <absolute>, "profile": <permission profile JSON>, "command": [...], "env": {name: value}}
//   stdout {"argsSymbolic": [...], "argsNumeric": [...], "env": {name: value}}  or  {"error": <the original's message>}
//
// The path is the one cli/src/debug_sandbox.rs takes for cua's `-c default_permissions=...` input once the config is
// compiled: the profile's `:workspace_roots` entry is materialized to the cwd (core/src/config/mod.rs
// effective_permission_profile, workspace roots = [cwd]), the profile becomes the runtime filesystem and network
// policies, and sandboxing/src/seatbelt.rs create_seatbelt_command_args renders the argv. debug_sandbox.rs:414-419
// then appends the TIOCSTI deny: `argsSymbolic` carries the tag's symbolic form, `argsNumeric` upstream's later numeric
// form (openai/codex f817e16905), which cua's port emits as a recorded deviation.
//
// The environment is debug_sandbox.rs's: create_env over the given variables with the default shell environment
// policy (inherit all, default excludes ignored; protocol/src/shell_environment.rs strips its non-inheritable names),
// then CODEX_SANDBOX=seatbelt and, with the network restricted, CODEX_SANDBOX_NETWORK_DISABLED=1. What the CLI adds
// beyond that (its config stack, $CODEX_HOME/.env, the arg0 PATH entry) is deliberately absent: cua's port reads none
// of it (spec, "Deviations from the original").
//
// `:tmpdir` resolves against this process's own TMPDIR (protocol/src/permissions.rs resolve_file_system_special_path),
// so the driver (generate.mjs) sets it per fixture.
use std::collections::BTreeMap;
use std::io::Read;

use codex_protocol::config_types::ShellEnvironmentPolicy;
use codex_protocol::models::PermissionProfile;
use codex_protocol::shell_environment::create_env_from_vars;
use codex_sandboxing::seatbelt::CreateSeatbeltCommandArgsParams;
use codex_sandboxing::seatbelt::create_seatbelt_command_args;
use codex_utils_absolute_path::AbsolutePathBuf;
use serde::Deserialize;
use serde_json::json;

const TIOCSTI_SYMBOLIC: &str = "\n(deny file-ioctl (ioctl-command TIOCSTI))";
// libc::TIOCSTI on macOS, 0x80017472.
const TIOCSTI_NUMERIC: &str = "\n(deny file-ioctl (ioctl-command 2147578994))";

#[derive(Deserialize)]
struct Input {
    cwd: String,
    profile: PermissionProfile,
    command: Vec<String>,
    env: BTreeMap<String, String>,
}

fn with_policy_suffix(args: &[String], suffix: &str) -> Result<Vec<String>, String> {
    let mut args = args.to_vec();
    match args.as_mut_slice() {
        [flag, policy, ..] if flag.as_str() == "-p" => {
            policy.push_str(suffix);
            Ok(args)
        }
        _ => Err("Seatbelt command is missing its generated policy".to_string()),
    }
}

fn generate(input: Input) -> Result<serde_json::Value, String> {
    let cwd = AbsolutePathBuf::from_absolute_path(&input.cwd).map_err(|err| err.to_string())?;
    let profile = input
        .profile
        .materialize_project_roots_with_workspace_roots(std::slice::from_ref(&cwd));
    let (file_system, network) = profile.to_runtime_permissions();
    let args = create_seatbelt_command_args(CreateSeatbeltCommandArgsParams {
        command: input.command,
        file_system_sandbox_policy: &file_system,
        network_sandbox_policy: network,
        sandbox_policy_cwd: cwd.as_path(),
        enforce_managed_network: false,
        managed_network: None,
        environment_id: None,
        network: None,
        extra_allow_unix_sockets: &[],
    })?;
    let mut env: BTreeMap<String, String> =
        create_env_from_vars(input.env, &ShellEnvironmentPolicy::default(), None)
            .into_iter()
            .collect();
    env.insert("CODEX_SANDBOX".to_string(), "seatbelt".to_string());
    if !network.is_enabled() {
        env.insert("CODEX_SANDBOX_NETWORK_DISABLED".to_string(), "1".to_string());
    }
    Ok(json!({
        "argsSymbolic": with_policy_suffix(&args, TIOCSTI_SYMBOLIC)?,
        "argsNumeric": with_policy_suffix(&args, TIOCSTI_NUMERIC)?,
        "env": env,
    }))
}

fn main() {
    let mut text = String::new();
    if let Err(err) = std::io::stdin().read_to_string(&mut text) {
        eprintln!("cua-sandbox-golden: cannot read stdin: {err}");
        std::process::exit(2);
    }
    let input: Input = match serde_json::from_str(&text) {
        Ok(input) => input,
        Err(err) => {
            eprintln!("cua-sandbox-golden: invalid input: {err}");
            std::process::exit(2);
        }
    };
    let output = generate(input).unwrap_or_else(|error| json!({"error": error}));
    println!("{output}");
}
