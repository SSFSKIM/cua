//! The engine asks an Electron application whose tree came back bare to turn its accessibility on (#228; the
//! pre-flight `docs/doperpowers/specs/2026-11-27-electron-a11y-preflight.md`, §E1, and its Decision Log's rulings 1251
//! and 1261).
//!
//! A Chromium application on the accessibility bus answers a structural read with its frame alone until something
//! sets its accessibility mode, and the reads the engine makes (role, name, children, states, text, actions) set
//! nothing. One `org.a11y.atspi.Accessible.GetAttributes` from any client sets it, for the whole process and for as
//! long as it runs. So after a state read the engine sends that one request to the frame's application root, and only
//! when all of these hold (`decide`):
//!
//! - a tree was asked for: never for a screenshot (`get_window_state`'s `tree_wanted: false`);
//! - the frame's read came back bare: the frame alone ([`bare`]), its own child listing having answered (a frame whose
//!   `GetChildren` failed is not known to be bare, [`after_read`]);
//! - the application has not been asked before on this bus connection ([`Asked`]);
//! - the application's `ToolkitName` is `Chromium`, read only in this bare case and once per application;
//! - the window's `WM_WINDOW_ROLE` is exactly `browser-window` (`X11::role_exactly`), Electron's own role: Chrome's
//!   windows are `browser` and `pop-up`, and CEF's sample sets none, so a browser and other embedders are left as they
//!   are (taste call 3);
//! - right before the request, the window's association, run again on every route, the vendor's title match included,
//!   still names this frame of this application, unambiguously (`Application::confirm`, `Associated::confirm_for_ask`).
//!
//! A request not written, one the application refused, and one skipped because the association changed are not
//! remembered, so the next observation tries again; one written and left unanswered is, since it may have changed the
//! application, which a request cannot undo. Any other window gets no new call, beyond the one `ToolkitName` read for
//! a bare frame.
//!
//! A request the application answered is followed by the wait (`wait.rs`, [`after_read`]): the frame is read again until its
//! content comes or the bound passes, so the observation that asked answers with the page. It comes with the request,
//! once per application per connection, and nothing else waits.

use std::collections::{HashMap, HashSet};

use crate::tree::{AxNode, ReadStats};
use crate::wait::{Frame, Summary};

/// The toolkit name every Chromium application gives its accessible application, Electron's and Chrome's alike.
pub const CHROMIUM_TOOLKIT: &str = "Chromium";

/// The `WM_WINDOW_ROLE` Electron gives every window it makes (Electron `native_window_views.cc`; the pre-flight's §B).
pub const ELECTRON_ROLE: &str = "browser-window";

/// Whether a state read came back bare: the frame alone, which is how every Chromium window without the
/// accessibility mode reads (its one child fails to read).
pub fn bare(tree: &AxNode) -> bool {
    tree.children.is_empty()
}

/// A fact the engine looks up only when the rule needs it: not looked up yet, or what the lookup found (None: absent
/// or unreadable).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fact<'a> {
    Unread,
    Read(Option<&'a str>),
}

/// What the engine knows of a state read when it decides.
#[derive(Debug, Clone, Copy)]
pub struct Known<'a> {
    /// Whether the caller wants the tree (false for a screenshot, which throws it away).
    pub tree_wanted: bool,
    /// Whether the frame's read came back bare ([`bare`]).
    pub bare: bool,
    /// Whether the frame's application has been asked before on this bus connection.
    pub asked_before: bool,
    /// The application's `ToolkitName`.
    pub toolkit: Fact<'a>,
    /// The window's `WM_WINDOW_ROLE`.
    pub role: Fact<'a>,
}

/// What [`decide`] concludes: look a fact up and decide again, send the request, or leave the application alone.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    ReadToolkit,
    ReadRole,
    Ask,
    Leave(Left),
}

/// Why an application is left unasked.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Left {
    NoTreeWanted,
    NotBare,
    AskedBefore,
    Toolkit,
    Role,
    /// The frame's own child listing failed: a frame with no children whose `GetChildren` timed out or failed is not
    /// known to be bare (fix of the whole-change review, P1).
    Unlisted,
    /// Right before the request, the window's association no longer named this frame, or could not be confirmed
    /// (the same review, P1): nothing was sent, and the next observation asks again.
    Changed,
}

impl Left {
    /// The `--stats` line's word for it.
    pub fn name(self) -> &'static str {
        match self {
            Left::NoTreeWanted => "no_tree_wanted",
            Left::NotBare => "not_bare",
            Left::AskedBefore => "asked_before",
            Left::Toolkit => "toolkit",
            Left::Role => "role",
            Left::Unlisted => "unlisted",
            Left::Changed => "changed",
        }
    }
}

/// The rule, over what the engine knows: the checks that cost nothing first, then the application's toolkit (one bus
/// call), then the window's role (one X property). A fact is asked for only when every check before it holds.
pub fn decide(known: &Known) -> Decision {
    if !known.tree_wanted {
        return Decision::Leave(Left::NoTreeWanted);
    }
    if !known.bare {
        return Decision::Leave(Left::NotBare);
    }
    if known.asked_before {
        return Decision::Leave(Left::AskedBefore);
    }
    match known.toolkit {
        Fact::Unread => return Decision::ReadToolkit,
        Fact::Read(Some(CHROMIUM_TOOLKIT)) => {}
        Fact::Read(_) => return Decision::Leave(Left::Toolkit),
    }
    match known.role {
        Fact::Unread => Decision::ReadRole,
        Fact::Read(Some(ELECTRON_ROLE)) => Decision::Ask,
        Fact::Read(_) => Decision::Leave(Left::Role),
    }
}

/// What the engine remembers of its applications on one bus connection, keyed by each application's bus name:
/// which it has asked, and each one's toolkit name, read once. Forgotten with the connection.
#[derive(Debug, Default)]
pub struct Asked {
    asked: HashSet<String>,
    toolkits: HashMap<String, Option<String>>,
}

impl Asked {
    pub fn asked_before(&self, app: &str) -> bool {
        self.asked.contains(app)
    }

    /// The application's toolkit name as read before on this connection, if it was.
    pub fn known_toolkit(&self, app: &str) -> Option<Option<&str>> {
        self.toolkits.get(app).map(Option::as_deref)
    }

    pub fn keep_toolkit(&mut self, app: &str, name: Option<String>) {
        self.toolkits.insert(app.to_string(), name);
    }

    /// Records the request's outcome: an application is remembered once its request was written and not refused, so
    /// a request that was not written, or that the application answered with an error, is tried again at the next
    /// observation, and one written and unanswered (which may have changed the application) is never sent twice.
    pub fn sent(&mut self, app: &str, outcome: &anyhow::Result<Delivery>) {
        if matches!(outcome, Ok(Delivery::Answered | Delivery::Unanswered(_))) {
            self.asked.insert(app.to_string());
        }
    }

    /// The connection ended: every application's bus name is unknown again.
    pub fn forget(&mut self) {
        self.asked.clear();
        self.toolkits.clear();
    }
}

/// What became of a request that was written (`Application::send`; its error is a request not written).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Delivery {
    /// The application answered without error.
    Answered,
    /// The application answered with an error: it did not take the request.
    Rejected(String),
    /// No answer came in time: the application may have taken the request.
    Unanswered(String),
}

/// What [`ask_if_due`]'s request came to.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Sent {
    Answered,
    Rejected(String),
    Unanswered(String),
    /// Not written: the connection failed before the request was on it.
    Unwritten(String),
}

/// The application of a frame just read, as [`ask_if_due`] reaches it: the engine's memory, the lookups and the
/// request, each on the engine's own connections; and, once asked, the frame as the wait reads it again
/// (`wait::Frame`).
pub trait Application: Frame {
    /// The application's bus name, which keys the memory.
    fn bus_name(&self) -> &str;
    fn asked(&mut self) -> &mut Asked;
    /// One `Properties.Get` of the application root's `ToolkitName`: None when absent or not a string, an error when
    /// the bus failed it (then read again at the next bare observation).
    fn read_toolkit(&mut self) -> anyhow::Result<Option<String>>;
    /// The window's `WM_WINDOW_ROLE`: None when absent or unreadable.
    fn read_role(&mut self) -> Option<String>;
    /// Whether the window's association still names this frame, confirmed right before the request on the
    /// connection that found it: an error when it cannot be told.
    fn confirm(&mut self) -> anyhow::Result<bool>;
    /// One `Accessible.GetAttributes` to the application root: an error when it was not written.
    fn send(&mut self) -> anyhow::Result<Delivery>;
}

/// What [`ask_if_due`] did, for the `--stats` line.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Outcome {
    /// Why the application was left unasked; None when the request went out.
    pub left: Option<Left>,
    /// The toolkit name, when the rule needed it (read now or before on this connection).
    pub toolkit: Option<Option<String>>,
    /// The window's role, when the rule needed it.
    pub role: Option<Option<String>>,
    /// The request's outcome when it was sent.
    pub sent: Option<Sent>,
    /// The wait for the frame's content, which follows a request that went out (`wait.rs`).
    pub waited: Option<Summary>,
}

impl Outcome {
    /// The `--stats` line's record: nothing for a state read the rule passed over before any lookup (a screenshot, a
    /// frame with content), so those lines are as they were.
    pub fn record(&self) -> Option<serde_json::Value> {
        if matches!(self.left, Some(Left::NoTreeWanted | Left::NotBare)) {
            return None;
        }
        let mut record = serde_json::Map::new();
        if let Some(left) = self.left {
            record.insert("left".into(), left.name().into());
        }
        if let Some(toolkit) = &self.toolkit {
            record.insert("toolkit".into(), toolkit.clone().into());
        }
        if let Some(role) = &self.role {
            record.insert("role".into(), role.clone().into());
        }
        if let Some(sent) = &self.sent {
            record.insert("sent".into(), (*sent == Sent::Answered).into());
            match sent {
                Sent::Answered => {}
                Sent::Rejected(error) | Sent::Unwritten(error) => {
                    record.insert("failed".into(), error.clone().into());
                }
                Sent::Unanswered(error) => {
                    record.insert("failed".into(), error.clone().into());
                    record.insert("unanswered".into(), true.into());
                }
            }
        }
        if let Some(waited) = &self.waited {
            record.insert("wait".into(), waited.record());
        }
        Some(record.into())
    }
}

/// After a state read of a frame of `app`: the rule ([`decide`]), each fact looked up only when it needs it, and the
/// request when it concludes so, its outcome remembered as [`Asked::sent`] says.
pub fn ask_if_due(tree_wanted: bool, bare: bool, app: &mut impl Application) -> Outcome {
    let name = app.bus_name().to_string();
    let mut outcome = Outcome::default();
    loop {
        let known = Known {
            tree_wanted,
            bare,
            asked_before: app.asked().asked_before(&name),
            toolkit: fact(&outcome.toolkit),
            role: fact(&outcome.role),
        };
        match decide(&known) {
            Decision::ReadToolkit => {
                let kept = app.asked().known_toolkit(&name).map(|t| t.map(str::to_owned));
                let toolkit = kept.unwrap_or_else(|| match app.read_toolkit() {
                    Ok(read) => {
                        app.asked().keep_toolkit(&name, read.clone());
                        read
                    }
                    Err(_) => None,
                });
                outcome.toolkit = Some(toolkit);
            }
            Decision::ReadRole => outcome.role = Some(app.read_role()),
            Decision::Ask => {
                // the association again, right before the effect: the frame was chosen before the lookups above, and
                // a request to the wrong application cannot be taken back
                if !matches!(app.confirm(), Ok(true)) {
                    outcome.left = Some(Left::Changed);
                    return outcome;
                }
                let sent = app.send();
                app.asked().sent(&name, &sent);
                outcome.sent = Some(match sent {
                    Ok(Delivery::Answered) => Sent::Answered,
                    Ok(Delivery::Rejected(error)) => Sent::Rejected(error),
                    Ok(Delivery::Unanswered(error)) => Sent::Unanswered(error),
                    Err(error) => Sent::Unwritten(format!("{error:#}")),
                });
                return outcome;
            }
            Decision::Leave(left) => {
                outcome.left = Some(left);
                return outcome;
            }
        }
    }
}

/// After a state read of a frame of `app` (`tree`, read with `stats`): [`ask_if_due`], and when its request went out,
/// the wait for the frame's content (`wait::wait`), whose last whole read becomes the answer. The request goes out once
/// per application per connection, and so does the wait: an application asked before is answered from the read it
/// gave, with no wait.
pub fn after_read(
    tree_wanted: bool,
    tree: AxNode,
    stats: ReadStats,
    app: &mut impl Application,
) -> (AxNode, ReadStats, Outcome) {
    // a frame with no children whose own listing failed is not known to be bare (the measured bare frame lists its one
    // child, whose role fails): it is left as it was read
    if tree_wanted && bare(&tree) && stats.listings_failed > 0 {
        let outcome = Outcome {
            left: Some(Left::Unlisted),
            ..Default::default()
        };
        return (tree, stats, outcome);
    }
    let mut outcome = ask_if_due(tree_wanted, bare(&tree), app);
    if outcome.sent != Some(Sent::Answered) {
        return (tree, stats, outcome);
    }
    let waited = crate::wait::wait(app, tree, stats);
    outcome.waited = Some(waited.summary);
    (waited.tree, waited.stats, outcome)
}

fn fact(looked: &Option<Option<String>>) -> Fact<'_> {
    match looked {
        None => Fact::Unread,
        Some(found) => Fact::Read(found.as_deref()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOOLKITS: [Option<&str>; 4] = [Some("Chromium"), Some("GTK"), Some("Qt"), None];
    const ROLES: [Option<&str>; 5] = [
        Some("browser-window"),
        Some("browser"),
        Some("pop-up"),
        Some("dialog"),
        None,
    ];

    /// Runs the rule as the engine does, looking each fact up when asked for it, and returns the conclusion with the
    /// facts it looked up.
    fn run(
        tree_wanted: bool,
        bare: bool,
        asked_before: bool,
        toolkit: Option<&str>,
        role: Option<&str>,
    ) -> (Decision, Vec<&'static str>) {
        let mut known = Known {
            tree_wanted,
            bare,
            asked_before,
            toolkit: Fact::Unread,
            role: Fact::Unread,
        };
        let mut looked = Vec::new();
        loop {
            match decide(&known) {
                Decision::ReadToolkit => {
                    assert_eq!(known.toolkit, Fact::Unread, "the toolkit is looked up once");
                    looked.push("toolkit");
                    known.toolkit = Fact::Read(toolkit);
                }
                Decision::ReadRole => {
                    assert_eq!(known.role, Fact::Unread, "the role is looked up once");
                    looked.push("role");
                    known.role = Fact::Read(role);
                }
                end => return (end, looked),
            }
        }
    }

    #[test]
    fn only_a_bare_electron_window_never_asked_whose_tree_is_wanted_is_asked() {
        let mut asks = 0;
        for tree_wanted in [true, false] {
            for bare in [true, false] {
                for asked_before in [true, false] {
                    for toolkit in TOOLKITS {
                        for role in ROLES {
                            let (decision, looked) = run(tree_wanted, bare, asked_before, toolkit, role);
                            let case = format!("{tree_wanted} {bare} {asked_before} {toolkit:?} {role:?}");
                            let expected = if !tree_wanted {
                                Decision::Leave(Left::NoTreeWanted)
                            } else if !bare {
                                Decision::Leave(Left::NotBare)
                            } else if asked_before {
                                Decision::Leave(Left::AskedBefore)
                            } else if toolkit != Some("Chromium") {
                                Decision::Leave(Left::Toolkit)
                            } else if role != Some("browser-window") {
                                Decision::Leave(Left::Role)
                            } else {
                                Decision::Ask
                            };
                            assert_eq!(decision, expected, "{case}");
                            asks += (decision == Decision::Ask) as u32;
                            // the toolkit is read only for a bare frame of a wanted tree not asked before, and the
                            // role only for a Chromium one of those
                            let free = tree_wanted && bare && !asked_before;
                            let expected_looked: Vec<&str> = match (free, toolkit == Some("Chromium")) {
                                (false, _) => vec![],
                                (true, false) => vec!["toolkit"],
                                (true, true) => vec!["toolkit", "role"],
                            };
                            assert_eq!(looked, expected_looked, "{case}");
                        }
                    }
                }
            }
        }
        assert_eq!(asks, 1, "one combination of the 160 asks");
    }

    #[test]
    fn a_screenshot_reads_nothing_and_asks_nothing() {
        for bare in [true, false] {
            assert_eq!(
                run(false, bare, false, Some("Chromium"), Some("browser-window")),
                (Decision::Leave(Left::NoTreeWanted), vec![])
            );
        }
    }

    #[test]
    fn the_toolkit_name_must_be_chromium_exactly() {
        for other in ["chromium", "Chromium ", "Electron", "CEF", ""] {
            assert_eq!(
                run(true, true, false, Some(other), Some("browser-window")).0,
                Decision::Leave(Left::Toolkit),
                "{other:?}"
            );
        }
    }

    fn node(children: Vec<AxNode>) -> AxNode {
        AxNode {
            actions: None,
            children,
            description: None,
            id: "0".into(),
            name: Some("cua Electron fixture".into()),
            role: "frame".into(),
            states: None,
            value: None,
        }
    }

    #[test]
    fn a_frame_alone_is_bare_and_a_frame_with_children_is_not() {
        assert!(bare(&node(vec![])));
        assert!(!bare(&node(vec![node(vec![])])));
    }

    #[test]
    fn an_application_is_remembered_once_its_request_was_written_and_not_refused() {
        let mut asked = Asked::default();
        asked.sent(":1.7", &Err(anyhow::anyhow!("broken connection")));
        assert!(!asked.asked_before(":1.7"), "a send that was not written");
        asked.sent(
            ":1.7",
            &Ok(Delivery::Rejected("org.freedesktop.DBus.Error.UnknownObject".into())),
        );
        assert!(!asked.asked_before(":1.7"), "an error reply");
        asked.sent(":1.7", &Ok(Delivery::Answered));
        assert!(asked.asked_before(":1.7"));
        // the whole-change review, P2: written, and no answer came; the application may have taken it
        asked.sent(":1.9", &Ok(Delivery::Unanswered("timed out".into())));
        assert!(asked.asked_before(":1.9"), "a written request whose answer never came");
        assert!(!asked.asked_before(":1.8"), "another application");
        asked.forget();
        assert!(!asked.asked_before(":1.7"), "a new connection");
    }

    #[test]
    fn an_application_s_toolkit_is_kept_per_connection() {
        let mut asked = Asked::default();
        assert_eq!(asked.known_toolkit(":1.7"), None);
        asked.keep_toolkit(":1.7", Some("GTK".into()));
        assert_eq!(asked.known_toolkit(":1.7"), Some(Some("GTK")));
        asked.keep_toolkit(":1.8", None);
        assert_eq!(
            asked.known_toolkit(":1.8"),
            Some(None),
            "an answer that is not a name is kept too"
        );
        asked.forget();
        assert_eq!(asked.known_toolkit(":1.7"), None, "read again on a new connection");
    }

    /// An application as the engine reaches it, scripted: its toolkit, its window's role and its requests' outcomes,
    /// with every lookup and request counted.
    struct Scripted {
        asked: Asked,
        toolkit: Option<&'static str>,
        role: Option<&'static str>,
        /// Each request's outcome in turn: true answered, false not written.
        sends: Vec<bool>,
        /// When set, each request's delivery in turn instead (written requests that were refused or not answered).
        deliveries: Vec<Delivery>,
        /// Each confirmation right before a request, in turn; once they run out, confirmed.
        confirms: Vec<Result<bool, &'static str>>,
        /// How many toolkit reads fail on the bus before one answers.
        toolkit_failures: usize,
        calls: Vec<&'static str>,
        /// The frame's reads in the wait, in turn, each taking 1 ms of the clock; once they run out, the frame alone.
        frame_reads: Vec<AxNode>,
        clock: std::time::Instant,
    }

    impl Scripted {
        fn new(toolkit: Option<&'static str>, role: Option<&'static str>) -> Scripted {
            Scripted {
                asked: Asked::default(),
                toolkit,
                role,
                sends: vec![],
                deliveries: vec![],
                confirms: vec![],
                toolkit_failures: 0,
                calls: vec![],
                frame_reads: vec![],
                clock: std::time::Instant::now(),
            }
        }

        fn count(&self, call: &str) -> usize {
            self.calls.iter().filter(|c| **c == call).count()
        }
    }

    impl Application for Scripted {
        fn bus_name(&self) -> &str {
            ":1.7"
        }
        fn asked(&mut self) -> &mut Asked {
            &mut self.asked
        }
        fn read_toolkit(&mut self) -> anyhow::Result<Option<String>> {
            self.calls.push("ToolkitName");
            if self.toolkit_failures > 0 {
                self.toolkit_failures -= 1;
                anyhow::bail!("the connection broke");
            }
            Ok(self.toolkit.map(str::to_owned))
        }
        fn read_role(&mut self) -> Option<String> {
            self.calls.push("WM_WINDOW_ROLE");
            self.role.map(str::to_owned)
        }
        fn confirm(&mut self) -> anyhow::Result<bool> {
            self.calls.push("confirm");
            match self.confirms.is_empty() {
                true => Ok(true),
                false => self.confirms.remove(0).map_err(|e| anyhow::anyhow!(e)),
            }
        }
        fn send(&mut self) -> anyhow::Result<Delivery> {
            self.calls.push("GetAttributes");
            if !self.deliveries.is_empty() {
                return Ok(self.deliveries.remove(0));
            }
            match self.sends.remove(0) {
                true => Ok(Delivery::Answered),
                false => Err(anyhow::anyhow!("the connection broke")),
            }
        }
    }

    impl Frame for Scripted {
        fn now(&self) -> std::time::Instant {
            self.clock
        }
        fn pause(&mut self, length: std::time::Duration) {
            self.calls.push("pause");
            self.clock += length;
        }
        fn read_by(&mut self, _deadline: std::time::Instant) -> anyhow::Result<Option<(Option<AxNode>, ReadStats)>> {
            self.calls.push("read");
            self.clock += std::time::Duration::from_millis(1);
            let tree = match self.frame_reads.is_empty() {
                true => node(vec![]),
                false => self.frame_reads.remove(0),
            };
            Ok(Some((Some(tree), ReadStats::default())))
        }
    }

    /// The fixture's frame once its page has come: a document with children among its views.
    fn page() -> AxNode {
        let document = AxNode {
            role: "document web".into(),
            ..node(vec![node(vec![])])
        };
        node(vec![node(vec![document])])
    }

    #[test]
    fn a_bare_electron_frame_is_waited_for_once_and_answered_with_its_page() {
        let mut app = Scripted::new(Some("Chromium"), Some("browser-window"));
        app.sends = vec![true];
        app.frame_reads = vec![node(vec![]), page()];
        let (tree, _, outcome) = after_read(true, node(vec![]), ReadStats::default(), &mut app);
        assert_eq!(tree, page(), "the answer is the wait's read");
        let waited = outcome.waited.clone().expect("the request went out, so the wait came");
        assert_eq!((waited.end, waited.reads), (crate::wait::End::Page, 2));
        assert_eq!(
            app.calls,
            [
                "ToolkitName",
                "WM_WINDOW_ROLE",
                "confirm",
                "GetAttributes",
                "pause",
                "read",
                "pause",
                "read"
            ]
        );
        let record = outcome.record().unwrap();
        assert_eq!(record["sent"], true);
        assert_eq!(record["wait"]["end"], "page");
    }

    #[test]
    fn an_application_asked_before_is_never_waited_for_again() {
        // the frame stays bare: the first observation waits out the bound, and the next ones read nothing more
        let mut app = Scripted::new(Some("Chromium"), Some("browser-window"));
        app.sends = vec![true];
        let (tree, _, first) = after_read(true, node(vec![]), ReadStats::default(), &mut app);
        assert_eq!(first.waited.as_ref().map(|w| w.end), Some(crate::wait::End::Bound));
        assert!(bare(&tree));
        let reads = app.count("read");
        assert!(reads > 1);
        let clock = app.clock;
        for _ in 0..3 {
            let (tree, _, again) = after_read(true, node(vec![]), ReadStats::default(), &mut app);
            assert_eq!(again.left, Some(Left::AskedBefore));
            assert_eq!(again.waited, None);
            assert!(bare(&tree), "answered from the read it gave");
        }
        assert_eq!(app.count("read"), reads, "no read after the first observation's wait");
        assert_eq!(app.clock, clock, "and no pause");
        assert_eq!(app.count("GetAttributes"), 1);
    }

    #[test]
    fn nothing_else_waits() {
        // a frame with content, a screenshot, and every window the rule does not ask
        for toolkit in TOOLKITS {
            for role in ROLES {
                let case = format!("{toolkit:?} {role:?}");
                let mut app = Scripted::new(toolkit, role);
                app.sends = vec![true];
                let clock = app.clock;
                after_read(true, page(), ReadStats::default(), &mut app);
                after_read(false, node(vec![]), ReadStats::default(), &mut app);
                after_read(false, page(), ReadStats::default(), &mut app);
                assert!(app.calls.is_empty(), "{case}");
                if (toolkit, role) != (Some("Chromium"), Some("browser-window")) {
                    let (_, _, outcome) = after_read(true, node(vec![]), ReadStats::default(), &mut app);
                    assert_eq!(outcome.waited, None, "{case}");
                    assert_eq!((app.count("read"), app.count("pause")), (0, 0), "{case}");
                    assert_eq!(app.clock, clock, "{case}");
                }
            }
        }
    }

    #[test]
    fn a_request_that_failed_to_send_waits_for_nothing_and_its_retry_waits() {
        let mut app = Scripted::new(Some("Chromium"), Some("browser-window"));
        app.sends = vec![false, true];
        let (_, _, failed) = after_read(true, node(vec![]), ReadStats::default(), &mut app);
        assert_eq!(failed.waited, None);
        assert_eq!(app.count("read"), 0);
        app.frame_reads = vec![page()];
        let (tree, _, sent) = after_read(true, node(vec![]), ReadStats::default(), &mut app);
        assert_eq!(sent.waited.map(|w| w.end), Some(crate::wait::End::Page));
        assert_eq!(tree, page());
    }

    #[test]
    fn the_request_goes_out_once_to_a_bare_electron_window_whose_tree_is_wanted() {
        let mut app = Scripted::new(Some("Chromium"), Some("browser-window"));
        app.sends = vec![true];
        let first = ask_if_due(true, true, &mut app);
        assert_eq!(first.left, None);
        assert_eq!(first.sent, Some(Sent::Answered));
        assert_eq!(app.calls, ["ToolkitName", "WM_WINDOW_ROLE", "confirm", "GetAttributes"]);
        assert_eq!(
            first.record(),
            Some(serde_json::json!({"toolkit": "Chromium", "role": "browser-window", "sent": true}))
        );
        // a second observation, still bare: asked before, so no lookup and no request
        let again = ask_if_due(true, true, &mut app);
        assert_eq!(again.left, Some(Left::AskedBefore));
        assert_eq!(app.calls.len(), 4);
        assert_eq!(again.record(), Some(serde_json::json!({"left": "asked_before"})));
    }

    #[test]
    fn a_request_that_failed_to_send_is_sent_again_at_the_next_observation() {
        let mut app = Scripted::new(Some("Chromium"), Some("browser-window"));
        app.sends = vec![false, true];
        let failed = ask_if_due(true, true, &mut app);
        assert_eq!(failed.sent, Some(Sent::Unwritten("the connection broke".into())));
        assert_eq!(
            failed.record(),
            Some(
                serde_json::json!({"toolkit": "Chromium", "role": "browser-window", "sent": false,
                "failed": "the connection broke"})
            )
        );
        assert_eq!(ask_if_due(true, true, &mut app).sent, Some(Sent::Answered));
        assert_eq!(ask_if_due(true, true, &mut app).left, Some(Left::AskedBefore));
        assert_eq!(app.count("GetAttributes"), 2);
        assert_eq!(app.count("ToolkitName"), 1, "the toolkit is read once");
    }

    #[test]
    fn a_toolkit_read_the_bus_failed_is_not_kept_and_is_read_again_at_the_next_bare_observation() {
        let mut app = Scripted::new(Some("Chromium"), Some("browser-window"));
        app.toolkit_failures = 1;
        app.sends = vec![true];
        let failed = ask_if_due(true, true, &mut app);
        assert_eq!(failed.left, Some(Left::Toolkit));
        assert_eq!(app.count("GetAttributes"), 0);
        assert_eq!(ask_if_due(true, true, &mut app).sent, Some(Sent::Answered));
        assert_eq!(app.count("ToolkitName"), 2);
    }

    #[test]
    fn no_other_window_gets_a_request_and_a_bare_one_gets_one_toolkit_read() {
        for toolkit in TOOLKITS {
            for role in ROLES {
                if (toolkit, role) == (Some("Chromium"), Some("browser-window")) {
                    continue;
                }
                let case = format!("{toolkit:?} {role:?}");
                let mut app = Scripted::new(toolkit, role);
                ask_if_due(true, false, &mut app);
                ask_if_due(false, false, &mut app);
                ask_if_due(false, true, &mut app);
                assert!(app.calls.is_empty(), "{case}: a frame with content, or a screenshot");
                for _ in 0..3 {
                    assert!(ask_if_due(true, true, &mut app).left.is_some(), "{case}");
                }
                assert_eq!(app.count("GetAttributes"), 0, "{case}");
                assert_eq!(app.count("ToolkitName"), 1, "{case}");
            }
        }
    }

    /// The whole-change review, P1: the association is confirmed again right before the request, so a frame chosen on
    /// evidence that changed while its toolkit and role were read (focus moving between same-title duplicates) is
    /// never asked; the skip is not remembered, and the next observation asks.
    #[test]
    fn the_frame_is_confirmed_right_before_the_request_and_a_changed_one_is_not_asked() {
        let mut app = Scripted::new(Some("Chromium"), Some("browser-window"));
        app.confirms = vec![Ok(false), Err("the association timed out")];
        app.sends = vec![true];
        for _ in 0..2 {
            let skipped = ask_if_due(true, true, &mut app);
            assert_eq!((skipped.left, &skipped.sent), (Some(Left::Changed), &None));
            assert_eq!(skipped.record().unwrap()["left"], "changed");
        }
        assert_eq!(
            app.count("GetAttributes"),
            0,
            "nothing sent on a changed or unconfirmed frame"
        );
        assert_eq!(ask_if_due(true, true, &mut app).sent, Some(Sent::Answered));
        assert_eq!(
            app.calls[app.calls.len() - 2..],
            ["confirm", "GetAttributes"],
            "the confirmation is last"
        );
        assert_eq!(app.count("ToolkitName"), 1);
        // a skipped request waits for nothing
        let mut skipped = Scripted::new(Some("Chromium"), Some("browser-window"));
        skipped.confirms = vec![Ok(false)];
        let (_, _, outcome) = after_read(true, node(vec![]), ReadStats::default(), &mut skipped);
        assert_eq!((outcome.waited, skipped.count("read")), (None, 0));
    }

    /// The whole-change review, P1: a frame with no children because its own `GetChildren` failed is not known to be
    /// bare, so it is not asked; the measured bare case (the frame listed one child, whose role failed) still is.
    #[test]
    fn a_frame_whose_own_child_listing_failed_is_not_asked_and_the_measured_bare_frame_is() {
        let unlisted = ReadStats {
            listings_failed: 1,
            ..Default::default()
        };
        let mut app = Scripted::new(Some("Chromium"), Some("browser-window"));
        app.sends = vec![true];
        let (tree, stats, outcome) = after_read(true, node(vec![]), unlisted.clone(), &mut app);
        assert_eq!((tree, stats), (node(vec![]), unlisted), "the read as it was");
        assert_eq!(outcome.left, Some(Left::Unlisted));
        assert_eq!(outcome.record(), Some(serde_json::json!({"left": "unlisted"})));
        assert!(app.calls.is_empty(), "no lookup, no request, no wait");
        let mut measured = ReadStats::default();
        measured.truncated.failed = 1;
        let (_, _, asked) = after_read(true, node(vec![]), measured, &mut app);
        assert_eq!(asked.sent, Some(Sent::Answered));
        // a screenshot with a failed listing writes nothing, as any screenshot
        let mut shot = Scripted::new(Some("Chromium"), Some("browser-window"));
        let (_, _, quiet) = after_read(
            false,
            node(vec![]),
            ReadStats {
                listings_failed: 1,
                ..Default::default()
            },
            &mut shot,
        );
        assert_eq!(quiet.record(), None);
    }

    /// The whole-change review, P2: a request written and left unanswered may already have changed the application,
    /// so it is remembered and never sent twice, and nothing waits on it; one the application refused is sent again.
    #[test]
    fn an_unanswered_request_is_never_sent_twice_and_a_refused_one_is_sent_again() {
        let mut app = Scripted::new(Some("Chromium"), Some("browser-window"));
        app.deliveries = vec![Delivery::Rejected("org.freedesktop.DBus.Error.UnknownMethod".into())];
        let refused = ask_if_due(true, true, &mut app);
        assert!(matches!(refused.sent, Some(Sent::Rejected(_))));
        app.deliveries = vec![Delivery::Unanswered("timed out".into())];
        let (_, _, unanswered) = after_read(true, node(vec![]), ReadStats::default(), &mut app);
        assert!(matches!(unanswered.sent, Some(Sent::Unanswered(_))));
        assert_eq!(unanswered.waited, None, "no wait on a request that was not answered");
        let record = unanswered.record().unwrap();
        assert_eq!((&record["sent"], &record["unanswered"]), (&false.into(), &true.into()));
        for _ in 0..3 {
            assert_eq!(ask_if_due(true, true, &mut app).left, Some(Left::AskedBefore));
        }
        assert_eq!(
            app.count("GetAttributes"),
            2,
            "the refused one and the unanswered one, never a third"
        );
    }

    #[test]
    fn a_screenshot_or_a_frame_with_content_writes_nothing_on_the_stats_line() {
        let mut app = Scripted::new(Some("Chromium"), Some("browser-window"));
        assert_eq!(ask_if_due(false, true, &mut app).record(), None);
        assert_eq!(ask_if_due(true, false, &mut app).record(), None);
        let mut gtk = Scripted::new(Some("GTK"), Some("dialog"));
        assert_eq!(
            ask_if_due(true, true, &mut gtk).record(),
            Some(serde_json::json!({"left": "toolkit", "toolkit": "GTK"}))
        );
    }
}
