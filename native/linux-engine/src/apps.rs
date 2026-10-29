//! Applications (behaviour §15): the XDG desktop entries `list_apps` answers with, each with the listed windows
//! that belong to it, and the `Exec` line's tokenizing that the listing's filter and `launch_app` share.

use std::collections::HashSet;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::x11::WindowInfo;

/// A launchable desktop entry.
#[derive(Debug, Clone, PartialEq)]
pub struct Entry {
    /// The root-relative path's components joined with `-`, `.desktop` kept (`org.gnome.gedit.desktop`).
    pub id: String,
    pub name: String,
    /// The `Exec` line tokenized, field codes expanded or dropped.
    pub argv: Vec<String>,
    pub startup_wm_class: Option<String>,
    pub path: PathBuf,
}

/// One `list_apps` answer; keys in alphabetical order, as the vendor serializes them.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct App {
    pub id: String,
    pub name: String,
    pub windows: Vec<WindowInfo>,
}

/// The directories searched, in order: `$XDG_DATA_HOME/applications` when the variable is set (even empty), else
/// `$HOME/.local/share/applications`; then each non-empty piece of `$XDG_DATA_DIRS` with `applications`, the
/// default `/usr/local/share:/usr/share` only when the variable is unset or not UTF-8.
pub fn roots(var: impl Fn(&str) -> Option<OsString>) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    match var("XDG_DATA_HOME") {
        Some(home) => roots.push(PathBuf::from(home).join("applications")),
        None => {
            if let Some(home) = var("HOME") {
                roots.push(PathBuf::from(home).join(".local/share/applications"));
            }
        }
    }
    let dirs = var("XDG_DATA_DIRS")
        .and_then(|v| v.into_string().ok())
        .unwrap_or_else(|| "/usr/local/share:/usr/share".into());
    roots.extend(
        dirs.split(':')
            .filter(|p| !p.is_empty())
            .map(|p| Path::new(p).join("applications")),
    );
    roots
}

/// Every desktop entry under `roots` that passes the filter, in discovery order. The first id seen wins before
/// its entry is parsed, so an entry that is later filtered out still hides one of the same id further on.
pub fn discover(roots: &[PathBuf], path_var: Option<&str>) -> Vec<Entry> {
    let mut seen = HashSet::new();
    let mut entries = Vec::new();
    for root in roots {
        for (id, path) in desktop_files(root) {
            if !seen.insert(id.clone()) {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(&path) else {
                continue;
            };
            if let Some(entry) = entry_of(&id, &path, &text, path_var) {
                entries.push(entry);
            }
        }
    }
    entries
}

/// The `.desktop` files under `root` with their ids: depth first, a directory's files in `readdir` order before
/// its subdirectories, which are taken last-found first.
fn desktop_files(root: &Path) -> Vec<(String, PathBuf)> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(read) = std::fs::read_dir(&dir) else { continue };
        for item in read.flatten() {
            let path = item.path();
            // A directory is descended only when it is one itself, not through a symlink, so a link cycle cannot
            // hold the walk; a symlinked entry file is read like any other.
            if item.file_type().is_ok_and(|t| t.is_dir()) {
                stack.push(path);
            } else if path.extension().is_some_and(|e| e == "desktop") {
                let Ok(relative) = path.strip_prefix(root) else {
                    continue;
                };
                let id = relative
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy())
                    .collect::<Vec<_>>()
                    .join("-");
                out.push((id, path));
            }
        }
    }
    out
}

/// The `[Desktop Entry]` group's keys: lines trimmed, `#` comments skipped, split at the first `=` with key and
/// value trimmed, no unescaping, the last occurrence of a key winning.
fn desktop_group(text: &str) -> std::collections::HashMap<&str, &str> {
    let mut keys = std::collections::HashMap::new();
    let mut inside = false;
    for line in text.lines().map(str::trim) {
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if line.starts_with('[') {
            inside = line == "[Desktop Entry]";
            continue;
        }
        if inside && let Some((key, value)) = line.split_once('=') {
            keys.insert(key.trim(), value.trim());
        }
    }
    keys
}

/// The entry, when it is a launchable application: not hidden, not for a terminal, of type `Application`, its
/// `TryExec` and its `Exec` program present, with a name.
fn entry_of(id: &str, path: &Path, text: &str, path_var: Option<&str>) -> Option<Entry> {
    let keys = desktop_group(text);
    let truthy = |key: &str| keys.get(key).is_some_and(|v| v.eq_ignore_ascii_case("true"));
    if truthy("Hidden") || truthy("NoDisplay") || truthy("Terminal") || keys.get("Type") != Some(&"Application") {
        return None;
    }
    if let Some(try_exec) = keys.get("TryExec")
        && !executable_exists(try_exec, path_var)
    {
        return None;
    }
    let name = keys.get("Name")?.to_string();
    let exec = keys.get("Exec")?;
    let argv = expand_exec(id, exec, &name, keys.get("Icon").copied(), path).ok()?;
    if !executable_exists(&argv[0], path_var) {
        return None;
    }
    Some(Entry {
        id: id.to_string(),
        name,
        argv,
        startup_wm_class: keys.get("StartupWMClass").map(|s| s.to_string()),
        path: path.to_path_buf(),
    })
}

/// A program path with more than one component is checked directly, else each `$PATH` directory: a regular file
/// with any execute bit.
pub fn executable_exists(program: &str, path_var: Option<&str>) -> bool {
    use std::os::unix::fs::PermissionsExt;
    let runnable = |p: &Path| std::fs::metadata(p).is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0);
    let program = Path::new(program);
    if program.components().count() > 1 {
        return runnable(program);
    }
    if program.as_os_str().is_empty() {
        return false;
    }
    path_var
        .unwrap_or("")
        .split(':')
        .filter(|d| !d.is_empty())
        .any(|dir| runnable(&Path::new(dir).join(program)))
}

/// `Exec` split into arguments: whitespace separates outside quotes, `"` and `'` quote, a backslash escapes the
/// next character except inside single quotes.
pub fn tokenize_exec(exec: &str) -> Result<Vec<String>, String> {
    let unfinished = || "desktop Exec contains an unfinished quote or escape".to_string();
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_token = false;
    let mut quote: Option<char> = None;
    let mut chars = exec.chars();
    while let Some(c) = chars.next() {
        match (quote, c) {
            (Some('\''), '\'') => quote = None,
            (Some('\''), c) => current.push(c),
            (Some(_), '"') => quote = None,
            (_, '\\') => current.push(chars.next().ok_or_else(unfinished)?),
            (Some(_), c) => current.push(c),
            (None, c) if c.is_whitespace() => {
                if in_token {
                    tokens.push(std::mem::take(&mut current));
                    in_token = false;
                }
                continue;
            }
            (None, '"' | '\'') => quote = Some(c),
            (None, c) => current.push(c),
        }
        in_token = true;
    }
    if quote.is_some() {
        return Err(unfinished());
    }
    if in_token {
        tokens.push(current);
    }
    Ok(tokens)
}

/// The argument vector `Exec` gives: standalone `%f %F %u %U %d %D %n %N %v %m` dropped, a standalone `%i`
/// becoming `--icon <Icon>` (dropped without an icon), and in other arguments `%%` → `%`, then `%c` → the name,
/// then `%k` → the entry's path.
pub fn expand_exec(id: &str, exec: &str, name: &str, icon: Option<&str>, path: &Path) -> Result<Vec<String>, String> {
    let mut argv = Vec::new();
    for token in tokenize_exec(exec)? {
        match token.as_str() {
            "%f" | "%F" | "%u" | "%U" | "%d" | "%D" | "%n" | "%N" | "%v" | "%m" => {}
            "%i" => {
                if let Some(icon) = icon {
                    argv.push("--icon".into());
                    argv.push(icon.to_string());
                }
            }
            _ => argv.push(
                token
                    .replace("%%", "%")
                    .replace("%c", name)
                    .replace("%k", &path.to_string_lossy()),
            ),
        }
    }
    if argv.is_empty() {
        return Err(format!("desktop entry {id:?} has no executable"));
    }
    Ok(argv)
}

/// The entry `launch_app` starts (behaviour §15): `app` trimmed, then the first entry in discovery order whose id,
/// name or id without `.desktop` equals it ASCII case-insensitively.
pub fn find_launchable<'e>(entries: &'e [Entry], app: &str) -> Result<&'e Entry, String> {
    let app = app.trim();
    if app.is_empty() {
        return Err("app must be a non-empty string".into());
    }
    entries
        .iter()
        .find(|e| {
            let stem = e.id.strip_suffix(".desktop").unwrap_or(&e.id);
            [e.id.as_str(), e.name.as_str(), stem]
                .iter()
                .any(|n| n.eq_ignore_ascii_case(app))
        })
        .ok_or_else(|| format!("launchable application {app:?} was not found"))
}

/// Starts the entry's program with its arguments, its standard streams on `/dev/null`, in the engine's directory and
/// environment; the answer does not wait for it. The caller reaps the child once it has exited (`Launched`).
pub fn launch(entry: &Entry) -> std::io::Result<std::process::Child> {
    use std::process::{Command, Stdio};
    Command::new(&entry.argv[0])
        .args(&entry.argv[1..])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
}

/// The launched programs not yet reaped: each one's exit status is collected, without waiting, before every later
/// request, so no exited program stays a zombie for long and a launch costs no thread.
#[derive(Default)]
pub struct Launched(Vec<std::process::Child>);

impl Launched {
    pub fn add(&mut self, child: std::process::Child) {
        self.0.push(child);
    }

    /// Collects the programs that have exited.
    pub fn reap(&mut self) {
        self.0.retain_mut(|child| matches!(child.try_wait(), Ok(None)));
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.0.len()
    }
}

/// `list_apps`: every entry with the listed windows whose `app` equals, ASCII case-insensitively, its
/// `StartupWMClass`, its name, its id without `.desktop`, or that stem's last `.`-segment, each window's `app`
/// replaced by the entry's id; stably sorted by the ASCII-lowercased name. A window may belong to several
/// entries; one that belongs to none is left out, and an entry without windows is kept.
pub fn list_apps(entries: &[Entry], windows: &[WindowInfo]) -> Vec<App> {
    let mut apps: Vec<App> = entries
        .iter()
        .map(|entry| {
            let stem = entry.id.strip_suffix(".desktop").unwrap_or(&entry.id);
            let last = stem.rsplit('.').next().unwrap_or(stem);
            let names: Vec<&str> = entry
                .startup_wm_class
                .as_deref()
                .into_iter()
                .chain([entry.name.as_str(), stem, last])
                .collect();
            let windows = windows
                .iter()
                .filter(|w| names.iter().any(|n| w.app.eq_ignore_ascii_case(n)))
                .map(|w| WindowInfo {
                    app: entry.id.clone(),
                    ..w.clone()
                })
                .collect();
            App {
                id: entry.id.clone(),
                name: entry.name.clone(),
                windows,
            }
        })
        .collect();
    apps.sort_by_key(|app| app.name.to_ascii_lowercase());
    apps
}

#[cfg(test)]
mod launched_tests {
    use super::*;

    #[test]
    fn an_exited_program_is_reaped_without_waiting_and_a_running_one_is_kept() {
        let mut launched = Launched::default();
        let entry = |argv: &[&str]| Entry {
            id: "probe.desktop".into(),
            name: "probe".into(),
            argv: argv.iter().map(|s| s.to_string()).collect(),
            startup_wm_class: None,
            path: PathBuf::new(),
        };
        launched.add(launch(&entry(&["/bin/true"])).unwrap());
        launched.add(launch(&entry(&["/bin/sleep", "5"])).unwrap());
        std::thread::sleep(std::time::Duration::from_millis(300));
        launched.reap();
        assert_eq!(launched.len(), 1, "the sleeper runs on");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    struct Tree {
        root: PathBuf,
    }

    impl Tree {
        fn new(tag: &str) -> Tree {
            let root = std::env::temp_dir().join(format!("cua-engine-apps-{tag}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&root);
            std::fs::create_dir_all(root.join("bin")).unwrap();
            Tree { root }
        }

        fn file(&self, rel: &str, text: &str) -> PathBuf {
            let path = self.root.join(rel);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, text).unwrap();
            path
        }

        fn program(&self, name: &str) -> String {
            let path = self.file(&format!("bin/{name}"), "#!/bin/sh\n");
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
            path.to_string_lossy().into_owned()
        }

        fn path_var(&self) -> String {
            self.root.join("bin").to_string_lossy().into_owned()
        }
    }

    impl Drop for Tree {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    fn app(name: &str, exec: &str, extra: &str) -> String {
        format!("[Desktop Entry]\nType=Application\nName={name}\nExec={exec}\n{extra}")
    }

    #[test]
    fn roots_follow_the_xdg_variables() {
        let env = |pairs: &'static [(&'static str, &'static str)]| {
            move |k: &str| pairs.iter().find(|(n, _)| *n == k).map(|(_, v)| OsString::from(*v))
        };
        assert_eq!(
            roots(env(&[("HOME", "/h")])),
            [
                "/h/.local/share/applications",
                "/usr/local/share/applications",
                "/usr/share/applications"
            ]
            .map(PathBuf::from)
        );
        assert_eq!(
            roots(env(&[
                ("HOME", "/h"),
                ("XDG_DATA_HOME", "/d"),
                ("XDG_DATA_DIRS", "/a::/b")
            ])),
            ["/d/applications", "/a/applications", "/b/applications"].map(PathBuf::from)
        );
        assert_eq!(
            roots(env(&[("XDG_DATA_HOME", ""), ("XDG_DATA_DIRS", "")])),
            [PathBuf::from("applications")],
            "an empty XDG_DATA_HOME still counts; an empty XDG_DATA_DIRS gives no system roots"
        );
    }

    #[test]
    fn discovery_filters_entries_and_the_first_id_wins() {
        let t = Tree::new("discover");
        let tool = t.program("tool");
        let user = t.root.join("user");
        let system = t.root.join("system");
        t.file("user/hidden.desktop", &app("Hidden", &tool, "NoDisplay=true\n"));
        t.file("system/hidden.desktop", &app("Shown", &tool, ""));
        t.file("system/kde/sub.desktop", &app("Sub", "tool --flag", ""));
        t.file("system/term.desktop", &app("Term", &tool, "Terminal=TRUE\n"));
        t.file(
            "system/link.desktop",
            &app("Link", &tool, "").replace("Application", "Link"),
        );
        t.file("system/try.desktop", &app("Try", &tool, "TryExec=/nonexistent/tool\n"));
        t.file(
            "system/noname.desktop",
            "[Desktop Entry]\nType=Application\nExec=tool\n",
        );
        t.file("system/quote.desktop", &app("Quote", "tool \"unfinished", ""));
        t.file("system/missing.desktop", &app("Missing", "no-such-program-171", ""));
        t.file("system/fields.desktop", &app("Fields", "tool %U", ""));
        t.file("system/other.txt", &app("Other", &tool, ""));
        t.file(
            "system/groups.desktop",
            "[Desktop Action new]\nName=Wrong\n[Desktop Entry]\n# a comment\n Type = Application \nName=First\nName = Groups \nExec=tool\n",
        );
        let entries = discover(&[user, system], Some(&t.path_var()));
        let mut ids: Vec<&str> = entries.iter().map(|e| e.id.as_str()).collect();
        ids.sort();
        assert_eq!(ids, ["fields.desktop", "groups.desktop", "kde-sub.desktop"]);
        let groups = entries.iter().find(|e| e.id == "groups.desktop").unwrap();
        assert_eq!(
            groups.name, "Groups",
            "trimmed, the last occurrence wins, other groups ignored"
        );
        let sub = entries.iter().find(|e| e.id == "kde-sub.desktop").unwrap();
        assert_eq!(sub.argv, ["tool", "--flag"]);
        let fields = entries.iter().find(|e| e.id == "fields.desktop").unwrap();
        assert_eq!(fields.argv, ["tool"], "a standalone field code is dropped");
    }

    #[test]
    fn a_directory_s_files_come_before_its_subdirectories() {
        let t = Tree::new("order");
        let tool = t.program("tool");
        t.file("r/z.desktop", &app("Z", &tool, ""));
        t.file("r/a/a.desktop", &app("A", &tool, ""));
        let entries = discover(&[t.root.join("r")], None);
        assert_eq!(entries[0].id, "z.desktop");
        assert_eq!(entries[1].id, "a-a.desktop");
    }

    #[test]
    fn launch_finds_the_first_entry_by_id_name_or_stem_ignoring_case() {
        let entry = |id: &str, name: &str| Entry {
            id: id.into(),
            name: name.into(),
            argv: vec!["/bin/true".into()],
            startup_wm_class: None,
            path: PathBuf::from(format!("/apps/{id}")),
        };
        let entries = [
            entry("org.gnome.gedit.desktop", "Text Editor"),
            entry("editor.desktop", "text editor"),
        ];
        let found = |app: &str| find_launchable(&entries, app).map(|e| e.id.as_str());
        assert_eq!(found("ORG.GNOME.GEDIT.DESKTOP"), Ok("org.gnome.gedit.desktop"));
        assert_eq!(found("org.gnome.gedit"), Ok("org.gnome.gedit.desktop"));
        assert_eq!(
            found("TEXT EDITOR"),
            Ok("org.gnome.gedit.desktop"),
            "the first in discovery order"
        );
        assert_eq!(found("  editor  "), Ok("editor.desktop"), "trimmed");
        assert_eq!(
            found("gedit"),
            Err(r#"launchable application "gedit" was not found"#.into())
        );
        assert_eq!(found(" \t"), Err("app must be a non-empty string".into()));
    }

    #[test]
    fn exec_lines_tokenize_with_quotes_and_escapes() {
        assert_eq!(
            tokenize_exec(r#"a "b c" 'd \e' f\ g"#).unwrap(),
            ["a", "b c", r"d \e", "f g"]
        );
        assert_eq!(tokenize_exec(r#"x"y"z ''"#).unwrap(), ["xyz", ""]);
        assert_eq!(tokenize_exec(r#""a\"b""#).unwrap(), [r#"a"b"#]);
        assert_eq!(tokenize_exec("  a   b  ").unwrap(), ["a", "b"]);
        for bad in ["a \"b", "a 'b", "a \\"] {
            assert_eq!(
                tokenize_exec(bad),
                Err("desktop Exec contains an unfinished quote or escape".into()),
                "{bad}"
            );
        }
    }

    #[test]
    fn field_codes_expand_as_the_vendor_expands_them() {
        let path = Path::new("/apps/x.desktop");
        assert_eq!(
            expand_exec("x.desktop", "run %i --name=%c %k 100%% %f", "Name", Some("icon"), path).unwrap(),
            ["run", "--icon", "icon", "--name=Name", "/apps/x.desktop", "100%"]
        );
        assert_eq!(expand_exec("x.desktop", "run %i", "N", None, path).unwrap(), ["run"]);
        assert_eq!(
            expand_exec("x.desktop", "%%c", "N", None, path).unwrap(),
            ["N"],
            "%% first, then %c: the vendor's order"
        );
        assert_eq!(
            expand_exec("x.desktop", "%U %F", "N", None, path),
            Err(r#"desktop entry "x.desktop" has no executable"#.into())
        );
    }

    #[test]
    fn programs_are_found_by_path_or_in_path() {
        let t = Tree::new("exists");
        let tool = t.program("tool");
        t.file("bin/plain", "not executable");
        let path_var = t.path_var();
        assert!(executable_exists(&tool, None));
        assert!(executable_exists("tool", Some(&path_var)));
        assert!(!executable_exists("tool", None), "no PATH, no search");
        assert!(!executable_exists("plain", Some(&path_var)));
        assert!(!executable_exists(&t.path_var(), None), "a directory is not a program");
        assert!(!executable_exists("", Some(&path_var)));
    }

    fn window(id: u32, app: &str) -> WindowInfo {
        WindowInfo {
            app: app.into(),
            focused: false,
            height: 10,
            id,
            modal: false,
            title: Some(format!("w{id}")),
            width: 10,
            window_type: Some("normal".into()),
            x: 0,
            y: 0,
        }
    }

    fn entry(id: &str, name: &str, class: Option<&str>) -> Entry {
        Entry {
            id: id.into(),
            name: name.into(),
            argv: vec!["x".into()],
            startup_wm_class: class.map(str::to_string),
            path: PathBuf::from(format!("/apps/{id}")),
        }
    }

    #[test]
    fn windows_join_their_apps_and_apps_sort_by_name() {
        let entries = [
            entry("org.gnome.gedit.desktop", "Text Editor", None),
            entry("google-chrome.desktop", "Google Chrome", Some("Google-chrome")),
            entry("xterm.desktop", "xterm", None),
            entry("b.desktop", "beta", None),
            entry("a.desktop", "Beta", None),
        ];
        let windows = [
            window(1, "org.gnome.gedit"),
            window(2, "google-chrome"),
            window(3, "XTerm"),
            window(4, "x11:4"),
            window(5, "gedit"),
        ];
        let apps = list_apps(&entries, &windows);
        let ids: Vec<&str> = apps.iter().map(|a| a.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "b.desktop",
                "a.desktop",
                "google-chrome.desktop",
                "org.gnome.gedit.desktop",
                "xterm.desktop"
            ],
            "stable by lowercased name"
        );
        let gedit = &apps[3];
        assert_eq!(
            gedit.windows.iter().map(|w| w.id).collect::<Vec<_>>(),
            [1, 5],
            "stem and last segment"
        );
        assert!(gedit.windows.iter().all(|w| w.app == "org.gnome.gedit.desktop"));
        assert_eq!(apps[2].windows.len(), 1, "StartupWMClass, case-insensitively");
        assert_eq!(apps[4].windows.len(), 1, "the name, case-insensitively");
        assert!(apps[0].windows.is_empty(), "an app without windows is kept");
        let line = serde_json::to_string(&apps[4]).unwrap();
        assert!(
            line.starts_with(r#"{"id":"xterm.desktop","name":"xterm","windows":[{"app":"xterm.desktop","#),
            "{line}"
        );
    }
}
