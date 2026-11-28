//! The wait's tests: its end on recorded trees, and the loop on a scripted clock.

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

/// An Electron `BaseWindow` with no menu and no controls (`no-page/`, `--t180-panels`), 10 to 12 ms after the request
/// (`t2-wait/out/shapes-panels.jsonl`): Chromium's views, panels alone.
const PANELS_ONLY: &str = r#"
frame "t180 base window"
  panel
    panel
      panel
        panel
          panel
            panel
"#;

/// What a read shows, with no node of it failed.
fn shown(text: &str) -> Shape {
    shape(&recorded(text), 0)
}

#[test]
fn the_wait_ends_on_a_page_or_on_controls_with_no_document_and_not_before() {
    assert_eq!(shown(BARE), Shape::Bare, "the frame alone");
    assert_eq!(shown(VSCODE_PENDING), Shape::Pending, "views with an empty document");
    assert_eq!(shown(FIXTURE_PAGE), Shape::Page, "a document with children");
    assert_eq!(
        shown(CEF_DIALOG),
        Shape::NoPage,
        "a dialog with controls and no document"
    );
    assert_eq!(shown(BASE_WINDOW), Shape::NoPage, "no web contents, with its controls");
    assert_eq!(shown(BLANK_PAGE), Shape::Pending, "an empty page waits for the bound");
    assert_eq!(
        shown(PANELS_ONLY),
        Shape::Views,
        "panels without a document or a control"
    );
}

#[test]
fn a_read_with_a_failed_node_is_not_a_window_without_a_page() {
    // a node whose role failed is left out of the tree with its subtree (`tree.rs`): a document, or the page's controls
    for no_page in [CEF_DIALOG, BASE_WINDOW] {
        assert_eq!(shape(&recorded(no_page), 1), Shape::Views, "{no_page}");
    }
    // the fixture's views with its document lost: the menu bar's buttons are controls, and the failed node is the doubt
    let mut lost = recorded(FIXTURE_PAGE);
    lost.children[0].children[0].children[0].children[0]
        .children
        .truncate(1);
    assert_eq!(shape(&lost, 0), Shape::NoPage);
    assert_eq!(shape(&lost, 1), Shape::Views);
    // a page is a page whatever else failed, and an empty document still waits
    assert_eq!(shape(&recorded(FIXTURE_PAGE), 3), Shape::Page);
    assert_eq!(shape(&recorded(VSCODE_PENDING), 1), Shape::Pending);
}

#[test]
fn one_document_with_children_is_a_page_wherever_it_is() {
    // VS Code's own webviews are documents inside its page; an empty one elsewhere does not hold the end back
    let mut tree = recorded(FIXTURE_PAGE);
    tree.children.push(recorded("document web"));
    assert_eq!(shape(&tree, 0), Shape::Page);
}

/// One read the scripted frame gives: how long it takes, its tree (None: the frame's role failed) or an error, its
/// failed nodes and failed child listings, and whether it completes only after the deadline (its processing overran
/// it).
struct Read {
    length: Duration,
    tree: Result<Option<AxNode>, &'static str>,
    failed: u32,
    listings_failed: u32,
    late: bool,
}

/// A frame scripted read by read, on a clock of its own.
struct Scripted {
    clock: Instant,
    start: Instant,
    reads: Vec<Read>,
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
                .map(|(ms, read)| Read {
                    length: Duration::from_millis(ms),
                    tree: read.map(|t| t.map(recorded)),
                    failed: 0,
                    listings_failed: 0,
                    late: false,
                })
                .collect(),
            began: vec![],
        }
    }

    fn failing(mut self, read: usize, failed: u32) -> Scripted {
        self.reads[read].failed = failed;
        self
    }

    fn listing_failed(mut self, read: usize) -> Scripted {
        self.reads[read].listings_failed = 1;
        self
    }

    fn late(mut self, read: usize) -> Scripted {
        self.reads[read].late = true;
        self
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
        let read = self.reads.remove(0);
        if read.late {
            // the read's replies came in time, and its tree was built after the deadline
            self.clock = deadline + Duration::from_millis(3);
        } else if self.clock + read.length > deadline {
            self.clock = deadline;
            return Ok(None);
        } else {
            self.clock += read.length;
        }
        let mut stats = ReadStats::default();
        stats.truncated.failed = read.failed;
        stats.listings_failed = read.listings_failed;
        match read.tree {
            Ok(tree) => Ok(Some((tree, stats))),
            Err(error) => Err(anyhow::anyhow!(error)),
        }
    }
}

fn bare() -> AxNode {
    recorded(BARE)
}

#[test]
fn panels_alone_wait_on_for_the_page() {
    let mut frame = Scripted::new(vec![(1, Ok(Some(PANELS_ONLY))), (1, Ok(Some(FIXTURE_PAGE)))]);
    let waited = wait(&mut frame, bare(), ReadStats::default());
    assert_eq!((waited.summary.end, waited.summary.reads), (End::Page, 2));
    let mut stays = Scripted::new((0..200).map(|_| (1, Ok(Some(PANELS_ONLY)))).collect());
    let waited = wait(&mut stays, bare(), ReadStats::default());
    assert_eq!((waited.summary.end, waited.summary.shape), (End::Bound, Shape::Views));
    assert_eq!(waited.tree, recorded(PANELS_ONLY), "answered with the last whole read");
}

#[test]
fn a_read_that_lost_nodes_waits_on() {
    // the window's controls with a failed node, which may have been its document: the next read has the page
    let mut frame = Scripted::new(vec![(1, Ok(Some(BASE_WINDOW))), (1, Ok(Some(FIXTURE_PAGE)))]).failing(0, 1);
    let waited = wait(&mut frame, bare(), ReadStats::default());
    assert_eq!((waited.summary.end, waited.summary.reads), (End::Page, 2));
}

/// Fix wave 2: a `GetChildren` that failed leaves its node with no children, so the panel that holds the document can
/// read as empty while the window's controls read whole: that read tells nothing yet, and the next has the page.
#[test]
fn a_read_whose_child_listing_failed_waits_on_for_the_page() {
    let mut frame = Scripted::new(vec![(1, Ok(Some(BASE_WINDOW))), (1, Ok(Some(FIXTURE_PAGE)))]).listing_failed(0);
    let waited = wait(&mut frame, bare(), ReadStats::default());
    assert_eq!((waited.summary.end, waited.summary.reads), (End::Page, 2));
    assert_eq!(waited.tree, recorded(FIXTURE_PAGE));
    // and at the bound it is answered as views, not as a window with no page
    let mut stays = Scripted::new((0..200).map(|_| (1, Ok(Some(BASE_WINDOW)))).collect()).listing_failed(0);
    for read in 1..stays.reads.len() {
        stays.reads[read].listings_failed = 1;
    }
    let waited = wait(&mut stays, bare(), ReadStats::default());
    assert_eq!((waited.summary.end, waited.summary.shape), (End::Bound, Shape::Views));
}

#[test]
fn a_read_completed_after_the_deadline_is_not_the_answer() {
    // the page, built only after the deadline: the answer is the read before it, at the bound
    let mut frame = Scripted::new(vec![(1, Ok(Some(VSCODE_PENDING))), (1, Ok(Some(FIXTURE_PAGE)))]).late(1);
    let waited = wait(&mut frame, bare(), ReadStats::default());
    assert_eq!((waited.summary.end, waited.summary.shape), (End::Bound, Shape::Pending));
    assert_eq!(waited.tree, recorded(VSCODE_PENDING));
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
    // a read only while a gap's worth of time is left before the deadline: 95 of 21 ms each, the last ending at 1,995
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
