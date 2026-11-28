//! The wait after the request (#228 task 2; the pre-flight `docs/doperpowers/specs/2026-11-27-electron-a11y-preflight.md`,
//! §E1): once `ask.rs` has asked a bare Electron frame's application to turn its accessibility on, the frame is read
//! again until its content is there or the bound passes, so the observation that asked answers with the page.
//!
//! What a Chromium window shows after the request (the task's own probe, `docs/evidence/2026-11-27-electron-a11y/t2-wait/`):
//! its views come first, within some 20 ms, and a window that has a page shows a `document web` among them at once,
//! empty until the renderer sends the page's tree; a window with no page (Electron's `BaseWindow`, a Chromium dialog) has
//! no `document web` at all. So the wait ends ([`shape`]):
//! - on a page: a `document web` with children;
//! - promptly on a window with no page: content and no `document web`;
//! - at the bound, with the last whole read: the frame still alone, or a page that has not come.
//!
//! The bound is wall time and covers the reads themselves: each read is made no later than the bound's deadline, and a
//! read the deadline cuts is abandoned for the read before it ([`Frame::read_by`]).

use std::time::{Duration, Instant};

use anyhow::Result;

use crate::tree::{AxNode, ReadStats};

/// How long the wait may take, from the request's reply to the answer, its reads included.
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
}

impl Shape {
    pub fn name(self) -> &'static str {
        match self {
            Shape::Bare => "bare",
            Shape::Pending => "pending",
            Shape::Page => "page",
            Shape::NoPage => "no_page",
        }
    }
}

const DOCUMENT: &str = "document web";

/// What a read of the frame (`tree`, its root the frame) shows: one `document web` with children anywhere in it is a
/// page, an empty one a page still to come.
pub fn shape(tree: &AxNode) -> Shape {
    if tree.children.is_empty() {
        return Shape::Bare;
    }
    let mut document = false;
    let mut stack = vec![tree];
    while let Some(node) = stack.pop() {
        if node.role == DOCUMENT {
            if !node.children.is_empty() {
                return Shape::Page;
            }
            document = true;
        }
        stack.extend(&node.children);
    }
    if document { Shape::Pending } else { Shape::NoPage }
}

/// Why the wait ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum End {
    Page,
    NoPage,
    /// The bound passed first: the answer is the last whole read, which is still [`Shape::Bare`] or
    /// [`Shape::Pending`].
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
            Ok(Some((Some(read), read_stats))) => {
                (tree, stats) = (read, read_stats);
                let found = shape(&tree);
                if found != Shape::Bare && content_after.is_none() {
                    content_after = Some(frame.now() - started);
                }
                match found {
                    Shape::Page => break End::Page,
                    Shape::NoPage => break End::NoPage,
                    Shape::Bare | Shape::Pending => {}
                }
            }
            Ok(Some((None, _))) | Err(_) => break End::Failed,
            Ok(None) => break End::Bound,
        }
    };
    let summary = Summary {
        end,
        shape: shape(&tree),
        reads,
        took: frame.now() - started,
        content_after,
        nodes: nodes(&tree),
    };
    Waited { tree, stats, summary }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A tree written as the probe printed it: one node a line, indented two spaces a level, `role "name"`.
    fn recorded(text: &str) -> AxNode {
        let mut lines: Vec<(usize, AxNode)> = Vec::new();
        for line in text.lines().filter(|l| !l.trim().is_empty()) {
            let depth = (line.len() - line.trim_start().len()) / 2;
            let line = line.trim();
            let (role, name) = match line.find(" \"") {
                Some(at) => (&line[..at], line[at + 2..].trim_end_matches('"')),
                None => (line, ""),
            };
            let node = AxNode {
                actions: None,
                children: vec![],
                description: None,
                id: lines.len().to_string(),
                name: (!name.is_empty()).then(|| name.to_string()),
                role: role.to_string(),
                states: None,
                value: None,
            };
            lines.push((depth, node));
        }
        // fold each node into the last node above it one level up
        while lines.len() > 1 {
            let deepest = lines.iter().map(|(d, _)| *d).max().unwrap();
            let at = lines.iter().position(|(d, _)| *d == deepest).unwrap();
            let (_, node) = lines.remove(at);
            lines[at - 1].1.children.push(node);
        }
        lines.remove(0).1
    }

    // The engine's frames as the probe read them (`t2-wait/out/shapes.jsonl`), from the frame down.

    const BARE: &str = r#"frame "cua Electron fixture""#;

    /// VS Code 1.148, 48 ms after the request: its views, its window controls and an empty document.
    const VSCODE_PENDING: &str = r#"
frame "Visual Studio Code"
  panel
    panel
      panel
      panel
      push button "Close"
      push button "Minimize"
      push button "Maximize"
      push button "Restore"
      panel
        panel
          panel
            panel
              panel
                panel
              document web
            panel
"#;

    /// The fixture, 41 ms after the request.
    const FIXTURE_PAGE: &str = r#"
frame "cua Electron fixture"
  panel
    panel
      panel
        panel
          menu bar
            push button "File"
            push button "Edit"
            push button "View"
            push button "Window"
          panel
            panel
              panel
                panel
              document web "cua Electron fixture"
                landmark
                  entry "Fixture text"
                  list box "Fixture list"
                    list item "Alpha"
                  push button "Fixture button"
                  statusbar "Fixture status"
                    static "Pressed 0 times"
            panel
"#;

    /// CEF 152's terms dialog, 20 ms after the request: controls, no document.
    const CEF_DIALOG: &str = r#"
dialog "Chromium Additional Terms of Service"
  panel
    panel
      panel
        panel
          entry "Chromium Additional Terms of Service"
        panel
          panel
          push button "Cancel"
          push button "Accept"
"#;

    /// An Electron `BaseWindow` with its controls drawn by Chromium, 18 ms after the request: no web contents at all.
    const BASE_WINDOW: &str = r#"
frame "t180 base window"
  panel
    panel
      panel
      panel
      push button "Close"
      push button "Minimize"
      push button "Maximize"
      push button "Restore"
      panel
        panel
          panel
            panel
"#;

    /// An Electron window on `about:blank`: a page with nothing in it.
    const BLANK_PAGE: &str = r#"
frame "t180 blank"
  panel
    panel
      panel
        panel
          menu bar
            push button "File"
          panel
            panel
              panel
                panel
              document web
            panel
"#;

    #[test]
    fn the_wait_ends_on_a_page_or_on_content_with_no_document_and_not_before() {
        assert_eq!(shape(&recorded(BARE)), Shape::Bare, "the frame alone");
        assert_eq!(
            shape(&recorded(VSCODE_PENDING)),
            Shape::Pending,
            "panels without a document"
        );
        assert_eq!(shape(&recorded(FIXTURE_PAGE)), Shape::Page, "a document with children");
        assert_eq!(
            shape(&recorded(CEF_DIALOG)),
            Shape::NoPage,
            "a dialog with controls and no document"
        );
        assert_eq!(
            shape(&recorded(BASE_WINDOW)),
            Shape::NoPage,
            "a window with no web contents"
        );
        assert_eq!(
            shape(&recorded(BLANK_PAGE)),
            Shape::Pending,
            "an empty page waits for the bound"
        );
    }

    #[test]
    fn one_document_with_children_is_a_page_wherever_it_is() {
        // VS Code's own webviews are documents inside its page; an empty one elsewhere does not hold the end back
        let mut tree = recorded(FIXTURE_PAGE);
        tree.children.push(recorded("document web"));
        assert_eq!(shape(&tree), Shape::Page);
    }

    /// A frame scripted read by read: each read's length and what it finds, on a clock of its own.
    struct Scripted {
        clock: Instant,
        start: Instant,
        /// Each read in turn: how long it takes, and its tree (None: the frame's role failed), or an error.
        reads: Vec<(Duration, Result<Option<AxNode>, &'static str>)>,
        /// When each read began, from the start.
        began: Vec<Duration>,
    }

    impl Scripted {
        fn new(reads: Vec<(u64, Result<Option<&str>, &'static str>)>) -> Scripted {
            let start = Instant::now();
            Scripted {
                clock: start,
                start,
                reads: reads
                    .into_iter()
                    .map(|(ms, read)| (Duration::from_millis(ms), read.map(|t| t.map(recorded))))
                    .collect(),
                began: vec![],
            }
        }
    }

    impl Frame for Scripted {
        fn now(&self) -> Instant {
            self.clock
        }
        fn pause(&mut self, length: Duration) {
            self.clock += length;
        }
        fn read_by(&mut self, deadline: Instant) -> Result<Option<(Option<AxNode>, ReadStats)>> {
            self.began.push(self.clock - self.start);
            let (length, read) = self.reads.remove(0);
            if self.clock + length > deadline {
                self.clock = deadline;
                return Ok(None);
            }
            self.clock += length;
            match read {
                Ok(tree) => Ok(Some((tree, ReadStats::default()))),
                Err(error) => Err(anyhow::anyhow!(error)),
            }
        }
    }

    fn bare() -> AxNode {
        recorded(BARE)
    }

    #[test]
    fn the_wait_answers_the_page_from_the_read_that_found_it() {
        let mut frame = Scripted::new(vec![
            (1, Ok(Some(BARE))),
            (3, Ok(Some(VSCODE_PENDING))),
            (3, Ok(Some(VSCODE_PENDING))),
            (40, Ok(Some(FIXTURE_PAGE))),
        ]);
        let waited = wait(&mut frame, bare(), ReadStats::default());
        assert_eq!(
            (waited.summary.end, waited.summary.shape, waited.summary.reads),
            (End::Page, Shape::Page, 4)
        );
        assert_eq!(waited.tree, recorded(FIXTURE_PAGE));
        // a gap before each read, and each read's own length
        let ms = Duration::from_millis;
        assert_eq!(frame.began, [ms(20), ms(41), ms(64), ms(87)]);
        assert_eq!(waited.summary.took, ms(127));
        assert_eq!(waited.summary.content_after, Some(ms(44)));
        assert!(frame.reads.is_empty());
    }

    #[test]
    fn a_window_with_no_page_ends_the_wait_at_its_first_read_with_content() {
        for no_page in [CEF_DIALOG, BASE_WINDOW] {
            let mut frame = Scripted::new(vec![(1, Ok(Some(BARE))), (2, Ok(Some(no_page)))]);
            let waited = wait(&mut frame, bare(), ReadStats::default());
            assert_eq!(
                (waited.summary.end, waited.summary.shape, waited.summary.reads),
                (End::NoPage, Shape::NoPage, 2)
            );
            assert_eq!(waited.summary.took, Duration::from_millis(43));
        }
    }

    #[test]
    fn the_bound_covers_the_reads_and_the_answer_is_the_last_whole_read() {
        // reads that take 300 ms each: the bound counts them, and the one the deadline cuts is abandoned
        let mut reads = vec![(300, Ok(Some(BARE))), (300, Ok(Some(VSCODE_PENDING)))];
        reads.extend((0..10).map(|_| (300, Ok(Some(VSCODE_PENDING)))));
        let mut frame = Scripted::new(reads);
        let waited = wait(&mut frame, bare(), ReadStats::default());
        assert_eq!(waited.summary.end, End::Bound);
        assert_eq!(waited.summary.shape, Shape::Pending);
        assert_eq!(waited.tree, recorded(VSCODE_PENDING));
        assert_eq!(waited.summary.took, BOUND, "no later than the bound");
        // 20 + 300, six times, is 1,920 ms; the seventh read, begun at 1,940 ms, is cut at 2,000
        assert_eq!(waited.summary.reads, 7);
    }

    #[test]
    fn a_frame_that_stays_bare_is_answered_bare_at_the_bound() {
        let mut frame = Scripted::new((0..200).map(|_| (1, Ok(Some(BARE)))).collect());
        let waited = wait(&mut frame, bare(), ReadStats::default());
        assert_eq!((waited.summary.end, waited.summary.shape), (End::Bound, Shape::Bare));
        assert_eq!(waited.tree, bare());
        assert!(waited.summary.took <= BOUND, "{:?}", waited.summary.took);
        assert!(waited.summary.took > BOUND - GAP, "{:?}", waited.summary.took);
        assert_eq!(waited.summary.content_after, None);
        // a read only while a gap's worth of time is left before the deadline: 95 of 21 ms each, the last ending at 1,995 ms
        assert_eq!(waited.summary.reads, 95);
    }

    #[test]
    fn a_read_that_fails_ends_the_wait_with_the_read_before_it() {
        let mut frame = Scripted::new(vec![(1, Ok(Some(VSCODE_PENDING))), (1, Err("the connection broke"))]);
        let waited = wait(&mut frame, bare(), ReadStats::default());
        assert_eq!(
            (waited.summary.end, waited.summary.shape, waited.summary.reads),
            (End::Failed, Shape::Pending, 2)
        );
        let mut gone = Scripted::new(vec![(1, Ok(None))]);
        let waited = wait(&mut gone, bare(), ReadStats::default());
        assert_eq!(
            (waited.summary.end, waited.summary.shape),
            (End::Failed, Shape::Bare),
            "the frame's role no longer reads"
        );
        assert_eq!(waited.tree, bare());
    }

    #[test]
    fn the_record_says_how_the_wait_ended() {
        let mut frame = Scripted::new(vec![(1, Ok(Some(BARE))), (4, Ok(Some(FIXTURE_PAGE)))]);
        let waited = wait(&mut frame, bare(), ReadStats::default());
        assert_eq!(
            waited.summary.record(),
            serde_json::json!({"end": "page", "shape": "page", "ms": 45.0, "reads": 2, "content_ms": 45.0, "nodes": 23})
        );
    }
}
