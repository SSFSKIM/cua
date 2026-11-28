//! The wait after the request (#228 task 2; the pre-flight
//! `docs/doperpowers/specs/2026-11-27-electron-a11y-preflight.md`, §E1): once `ask.rs` has asked a bare Electron
//! frame's application to turn its accessibility on, the frame is read again until its content is there or the bound
//! passes, so the observation that asked answers with the page.
//!
//! What a Chromium window shows after the request (the task's own probes,
//! `docs/evidence/2026-11-27-electron-a11y/t2-wait/`): its views come first, within some 20 ms, and a window that has
//! a page shows a `document web` among them at once, empty until the renderer sends the page's tree; a window with no
//! page (Electron's `BaseWindow`, a Chromium dialog) has no `document web` at all. So the wait ends ([`shape`]):
//! - on a page: a `document web` with children;
//! - promptly on a window with no page: no `document web`, something beyond panels (a control), and no node lost;
//! - at the bound, with the last whole read: the frame still alone, a page that has not come, or views that tell
//!   nothing yet (panels alone, or a read that lost a subtree: a node whose role or child listing failed).
//!
//! The bound is wall time and covers the reads themselves: each read is made by the bound's deadline, and a read the
//! deadline cuts, or whose tree is built only after it, is abandoned for the read before it ([`Frame::read_by`]). On
//! cua's own association routes each read is the answer only once its association is confirmed again
//! (`engine.rs`, `confirmed_by`).
//!
//! What the bound covers: the pauses, and every call on the accessibility bus, the confirmation's included. It does not
//! cover the X server's own replies (the window's properties the confirmation reads again), which block unbounded
//! everywhere in the engine, the first read's association included; a server grabbed by another client stalls every
//! observation, not this wait alone (`tech-debt-tracker.md`, #228 T2 review).

use std::time::{Duration, Instant};

use anyhow::Result;

use crate::tree::{AxNode, ReadStats};

/// How long the wait may take, from the request's reply to the answer: its pauses and every call it makes on the
/// accessibility bus. The X server's replies the confirmation reads are not inside it (the module's doc).
pub const BOUND: Duration = Duration::from_millis(2000);

/// The pause before each read: a bare frame's read costs a few calls, a frame with views a few hundred.
pub const GAP: Duration = Duration::from_millis(20);

/// What one read of the frame shows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Shape {
    /// The frame alone: the application has not turned its accessibility on yet.
    Bare,
    /// The window's views and an empty `document web`: its page has not come yet.
    Pending,
    /// A `document web` with children: the page.
    Page,
    /// Content, and no `document web`: a window with no page.
    NoPage,
    /// Views and nothing that tells yet: panels alone, or a read that lost a subtree ([`lost`]).
    Views,
}

impl Shape {
    pub fn name(self) -> &'static str {
        match self {
            Shape::Bare => "bare",
            Shape::Pending => "pending",
            Shape::Page => "page",
            Shape::NoPage => "no_page",
            Shape::Views => "views",
        }
    }
}

const DOCUMENT: &str = "document web";

/// The roles that only hold other nodes: Chromium's views read as `panel` (its `kClient`, `kWebView`, an unknown view),
/// and these say nothing of what a window shows until something else is among them.
const STRUCTURE: [&str; 5] = ["panel", "filler", "redundant object", "unknown", "section"];

/// What a read of the frame (`tree`, its root the frame) shows, `lost` the places where the read may have lost a
/// subtree ([`lost`]):
/// - one `document web` with children anywhere in it is a page, and an empty one a page still to come;
/// - with no document, a window with no page only when the read lost nothing and has something beyond structure (a
///   control, text): panels alone, or a read that lost a subtree (which may have held the document), tell nothing yet.
pub fn shape(tree: &AxNode, lost: u32) -> Shape {
    if tree.children.is_empty() {
        return Shape::Bare;
    }
    let (mut document, mut beyond_structure) = (false, false);
    let mut stack: Vec<&AxNode> = tree.children.iter().collect();
    while let Some(node) = stack.pop() {
        if node.role == DOCUMENT {
            if !node.children.is_empty() {
                return Shape::Page;
            }
            document = true;
        } else if !STRUCTURE.contains(&node.role.as_str()) {
            beyond_structure = true;
        }
        stack.extend(&node.children);
    }
    match (document, lost == 0 && beyond_structure) {
        (true, _) => Shape::Pending,
        (false, true) => Shape::NoPage,
        (false, false) => Shape::Views,
    }
}

/// Where a read may have lost a subtree: a node whose role failed, which the read leaves out with its subtree; a node
/// whose `GetChildren` failed, which it shows with no children (fix wave 2); and the nodes the element and depth limits
/// left out (the whole-change review, P2). None changes the tree the engine answers; the wait only takes such a read
/// for one that tells nothing yet, unless it holds a populated document.
pub fn lost(stats: &ReadStats) -> u32 {
    let cut = &stats.truncated;
    cut.failed + cut.nodes + cut.depth + stats.listings_failed
}

/// Why the wait ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum End {
    Page,
    NoPage,
    /// The bound passed first: the answer is the last whole read, which is still [`Shape::Bare`], [`Shape::Pending`]
    /// or [`Shape::Views`].
    Bound,
    /// A read failed (the connection broke, or the frame's own role no longer reads): the answer is the read before it.
    Failed,
}

impl End {
    pub fn name(self) -> &'static str {
        match self {
            End::Page => "page",
            End::NoPage => "no_page",
            End::Bound => "bound",
            End::Failed => "failed",
        }
    }
}

/// The frame of an application just asked, as [`wait`] reaches it: the clock, and the frame's read by a deadline.
pub trait Frame {
    fn now(&self) -> Instant;
    fn pause(&mut self, length: Duration);
    /// The frame read again, done by `deadline`: None when the deadline cut the read. Its tree is None when the
    /// frame's own role failed to read (`tree::read`).
    fn read_by(&mut self, deadline: Instant) -> Result<Option<(Option<AxNode>, ReadStats)>>;
}

/// The wait's answer: the frame's last whole read, and what the wait did.
#[derive(Debug)]
pub struct Waited {
    pub tree: AxNode,
    pub stats: ReadStats,
    pub summary: Summary,
}

/// What the wait did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Summary {
    pub end: End,
    /// What the answer shows.
    pub shape: Shape,
    /// The reads made, a cut one included.
    pub reads: u32,
    /// From the wait's start to its end.
    pub took: Duration,
    /// When the first read with content (anything but the frame alone) came, from the wait's start.
    pub content_after: Option<Duration>,
    /// The answer's nodes.
    pub nodes: u32,
}

impl Summary {
    /// The `--stats` line's record.
    pub fn record(&self) -> serde_json::Value {
        let ms = |d: Duration| (d.as_secs_f64() * 10_000.0).round() / 10.0;
        serde_json::json!({
            "end": self.end.name(),
            "shape": self.shape.name(),
            "ms": ms(self.took),
            "reads": self.reads,
            "content_ms": self.content_after.map(ms),
            "nodes": self.nodes,
        })
    }
}

fn nodes(tree: &AxNode) -> u32 {
    1 + tree.children.iter().map(nodes).sum::<u32>()
}

/// Reads `frame` again, a [`GAP`] before each read, until [`shape`] ends the wait or [`BOUND`] passes, from the bare
/// read `tree` that came before the request.
pub fn wait(frame: &mut impl Frame, tree: AxNode, stats: ReadStats) -> Waited {
    let started = frame.now();
    let deadline = started + BOUND;
    let (mut tree, mut stats) = (tree, stats);
    let mut reads = 0;
    let mut content_after = None;
    let end = loop {
        // a read only while more than a gap is left before the deadline
        if frame.now() + GAP >= deadline {
            break End::Bound;
        }
        frame.pause(GAP);
        reads += 1;
        match frame.read_by(deadline) {
            // a read whose tree was built only after the deadline is not the answer
            Ok(Some(_)) if frame.now() > deadline => break End::Bound,
            Ok(Some((Some(read), read_stats))) => {
                (tree, stats) = (read, read_stats);
                let found = shape(&tree, lost(&stats));
                if found != Shape::Bare && content_after.is_none() {
                    content_after = Some(frame.now() - started);
                }
                match found {
                    Shape::Page => break End::Page,
                    Shape::NoPage => break End::NoPage,
                    Shape::Bare | Shape::Pending | Shape::Views => {}
                }
            }
            Ok(Some((None, _))) | Err(_) => break End::Failed,
            Ok(None) => break End::Bound,
        }
    };
    let summary = Summary {
        end,
        shape: shape(&tree, lost(&stats)),
        reads,
        took: frame.now() - started,
        content_after,
        nodes: nodes(&tree),
    };
    Waited { tree, stats, summary }
}

#[cfg(test)]
mod tests;
