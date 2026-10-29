//! The visible-table path (behaviour §5.4): a `table` with more than 5,000 children is not listed; its visible cells
//! are found by hit tests across its on-screen bounds, row by row, and become leaf children.
//!
//! [`Sampler`] is the scan as a state machine: it says which call it needs next ([`Need`]) and takes the answers,
//! so the tree read can interleave it with its other calls and the element search can drive it on its own. The
//! scan's rules are the vendor's (the hit points, the row and column steps, the checks and their sentences); the
//! three reads of a hit object (role, state, extents) are asked for together, where the vendor sends them one by
//! one, which changes the round trips and not the outcome.

use std::collections::HashSet;

use crate::dbus::{CallResult, Value};
use crate::tree::ObjRef;

/// A table is sampled when its `ChildCount` is greater than this.
pub const SAMPLE_OVER: i32 = 5000;
/// The scan stops after this many hit tests.
pub const MAX_HIT_TESTS: u32 = 5000;
/// The object path AT-SPI answers for "nothing here".
pub const NULL_PATH: &str = "/org/a11y/atspi/null";

/// The next call the scan needs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Need {
    /// `Component.GetExtents(0)` of the table.
    TableExtents,
    /// `Component.GetAccessibleAtPoint(x, y, 0)` on the table.
    HitTest { x: i32, y: i32 },
    /// `GetRoleName`, `GetState` and `Component.GetExtents(0)` of the object hit.
    Cell(ObjRef),
}

/// What the scan concluded, or the call it needs next.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Progress {
    Need(Need),
    /// The cells found, in row-major discovery order, each once.
    Done(Vec<ObjRef>),
    /// Sampling is abandoned with this reason; the caller lists the table's children instead.
    Failed(String),
}

/// `Component.GetExtents` as `(x1, y1, x2, y2)`, from its `(x, y, width, height)` reply.
pub fn extents_of(result: &CallResult) -> Result<(i32, i32, i32, i32), String> {
    let values = result.as_ref().map_err(Clone::clone)?;
    match values.first() {
        Some(Value::Struct(parts)) => match parts.as_slice() {
            [Value::I32(x), Value::I32(y), Value::I32(w), Value::I32(h)] => {
                Ok((*x, *y, x.saturating_add(*w), y.saturating_add(*h)))
            }
            _ => Err("AT-SPI element did not return valid bounds".into()),
        },
        _ => Err("AT-SPI element did not return bounds".into()),
    }
}

fn showing_and_visible(states: &[&str]) -> bool {
    states.contains(&"showing") && states.contains(&"visible")
}

#[derive(Debug)]
enum Step {
    Extents,
    Hit,
    Cell {
        obj: ObjRef,
        role: Option<CallResult>,
        state: Option<CallResult>,
        extents: Option<CallResult>,
    },
    Over,
}

#[derive(Debug)]
pub struct Sampler {
    table: ObjRef,
    budget: u32,
    bounds: (i32, i32, i32, i32),
    x: i32,
    y: i32,
    next_y: i32,
    hits: u32,
    cells: Vec<ObjRef>,
    seen: HashSet<ObjRef>,
    step: Step,
}

impl Sampler {
    /// Starts a scan of `table`, whose interfaces (`implements_table`) and states the caller has read; `budget` is
    /// how many cells admission could still take (4,999 minus the nodes before the table). A larger budget than
    /// the true one finds the same cells first, so a caller that knows only an upper bound gets the vendor's cells
    /// followed by cells admission then refuses.
    pub fn start(table: ObjRef, budget: u32, implements_table: bool, states: &[&str]) -> (Sampler, Progress) {
        let mut sampler = Sampler {
            table,
            budget,
            bounds: (0, 0, 0, 0),
            x: 0,
            y: 0,
            next_y: 0,
            hits: 0,
            cells: Vec::new(),
            seen: HashSet::new(),
            step: Step::Over,
        };
        let progress = if budget == 0 {
            Progress::Done(Vec::new())
        } else if !implements_table {
            Progress::Failed("AT-SPI table does not implement Table".into())
        } else if !showing_and_visible(states) {
            Progress::Failed("AT-SPI table is not visible".into())
        } else {
            sampler.step = Step::Extents;
            Progress::Need(Need::TableExtents)
        };
        (sampler, progress)
    }

    /// The table's own extents.
    pub fn table_extents(&mut self, result: &CallResult) -> Progress {
        debug_assert!(matches!(self.step, Step::Extents));
        let (x1, y1, x2, y2) = match extents_of(result) {
            Ok(bounds) => bounds,
            Err(error) => return self.fail(error),
        };
        if x2 <= x1 || y2 <= y1 {
            return self.fail("AT-SPI table has no visible bounds".into());
        }
        self.bounds = (x1, y1, x2, y2);
        self.y = y1;
        self.start_row()
    }

    /// The reply of the hit test the scan asked for.
    pub fn hit(&mut self, result: &CallResult) -> Progress {
        debug_assert!(matches!(self.step, Step::Hit));
        let values = match result {
            Ok(values) => values,
            Err(error) => return self.fail(error.clone()),
        };
        let obj = match values.first() {
            Some(Value::Struct(parts)) => match parts.as_slice() {
                [Value::Str(bus), Value::Path(path)] => ObjRef {
                    bus: if bus.is_empty() {
                        self.table.bus.clone()
                    } else {
                        bus.clone()
                    },
                    path: path.clone(),
                },
                _ => return self.fail("AT-SPI table hit test did not return an object reference".into()),
            },
            _ => return self.fail("AT-SPI table hit test did not return an object reference".into()),
        };
        if obj.path == NULL_PATH {
            return self.fail("AT-SPI table hit test found no cell".into());
        }
        if obj == self.table {
            return self.fail("AT-SPI table hit test returned the table".into());
        }
        self.step = Step::Cell {
            obj: obj.clone(),
            role: None,
            state: None,
            extents: None,
        };
        Progress::Need(Need::Cell(obj))
    }

    /// The hit object's `GetRoleName`, `GetState` and `GetExtents`, in any order; the scan moves on once all three
    /// are in, checking them in the vendor's order.
    pub fn cell_role(&mut self, result: CallResult) -> Option<Progress> {
        self.cell_reply(|role, _, _| *role = Some(result))
    }

    pub fn cell_state(&mut self, result: CallResult) -> Option<Progress> {
        self.cell_reply(|_, state, _| *state = Some(result))
    }

    pub fn cell_extents(&mut self, result: CallResult) -> Option<Progress> {
        self.cell_reply(|_, _, extents| *extents = Some(result))
    }

    fn cell_reply(
        &mut self,
        put: impl FnOnce(&mut Option<CallResult>, &mut Option<CallResult>, &mut Option<CallResult>),
    ) -> Option<Progress> {
        let Step::Cell {
            role, state, extents, ..
        } = &mut self.step
        else {
            debug_assert!(false, "a cell reply outside a cell step");
            return None;
        };
        put(role, state, extents);
        if role.is_none() || state.is_none() || extents.is_none() {
            return None;
        }
        let Step::Cell {
            obj,
            role: Some(role),
            state: Some(state),
            extents: Some(extents),
        } = std::mem::replace(&mut self.step, Step::Over)
        else {
            unreachable!("checked above")
        };
        Some(self.judge_cell(obj, role, state, extents))
    }

    fn judge_cell(&mut self, obj: ObjRef, role: CallResult, state: CallResult, extents: CallResult) -> Progress {
        let role = match role {
            Ok(values) => values.first().and_then(Value::as_str).unwrap_or("unknown").to_string(),
            Err(error) => return self.fail(error),
        };
        if role != "table cell" {
            return self.fail("AT-SPI table hit test returned a non-cell object".into());
        }
        let states = match &state {
            Ok(values) => match values.first() {
                Some(Value::Array(words)) => crate::tree::decode_states(words).unwrap_or_default(),
                _ => Vec::new(),
            },
            Err(error) => return self.fail(error.clone()),
        };
        if !showing_and_visible(&states) {
            return self.fail("AT-SPI table hit test returned a cell without visible bounds".into());
        }
        let (cx1, cy1, cx2, cy2) = match extents_of(&extents) {
            Ok(bounds) => bounds,
            Err(error) => return self.fail(error),
        };
        let (x1, y1, x2, y2) = self.bounds;
        if cy2 <= self.y {
            // The cell ends at or above this row: the row is over, and the next starts one pixel lower.
            self.next_y = self.y + 1;
            return self.end_row();
        }
        if cx2 > self.x {
            if !(cx1 < x2 && cx2 > x1 && cy1 < y2 && cy2 > y1) {
                return self.fail("AT-SPI table hit test returned a cell outside the table bounds".into());
            }
            if self.seen.insert(obj.clone()) {
                self.cells.push(obj);
            }
            self.x = cx2.min(x2);
        } else {
            self.x += 1;
        }
        self.next_y = self.next_y.min(cy2);
        self.next_hit()
    }

    fn start_row(&mut self) -> Progress {
        if self.y >= self.bounds.3 {
            return self.done();
        }
        self.x = self.bounds.0;
        self.next_y = self.bounds.3;
        self.next_hit()
    }

    fn next_hit(&mut self) -> Progress {
        if self.cells.len() as u32 >= self.budget || self.hits >= MAX_HIT_TESTS {
            return self.done();
        }
        if self.x >= self.bounds.2 {
            return self.end_row();
        }
        self.hits += 1;
        self.step = Step::Hit;
        Progress::Need(Need::HitTest { x: self.x, y: self.y })
    }

    fn end_row(&mut self) -> Progress {
        self.y = self.next_y;
        self.start_row()
    }

    fn done(&mut self) -> Progress {
        self.step = Step::Over;
        Progress::Done(std::mem::take(&mut self.cells))
    }

    fn fail(&mut self, reason: String) -> Progress {
        self.step = Step::Over;
        Progress::Failed(reason)
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;

    pub const SHOWING: [u32; 2] = [(1 << 25) | (1 << 30), 0];

    /// A grid of cells with extents, and hit boxes that may be wider than the extents (GTK 3's tree view answers
    /// a hit test one or two pixels past a cell's reported right and bottom edges).
    pub struct Grid {
        pub table: (i32, i32, i32, i32),
        /// (path, extents x, y, w, h, hit box x1, y1, x2, y2 exclusive)
        pub cells: Vec<(String, [i32; 4], [i32; 4])>,
        pub role: &'static str,
        pub states: [u32; 2],
    }

    impl Grid {
        /// `rows` × `cols` cells of `w` × `h` from the table's origin; hit boxes extend `slack` pixels right and down.
        pub fn uniform(origin: (i32, i32), size: (i32, i32), cell: (i32, i32), slack: i32) -> Grid {
            let (ox, oy) = origin;
            let (tw, th) = size;
            let (w, h) = cell;
            let mut cells = Vec::new();
            let mut n = 0;
            let mut y = oy;
            while y < oy + th {
                let mut x = ox;
                while x < ox + tw {
                    let cw = w.min(ox + tw - x);
                    cells.push((format!("/c{n}"), [x, y, cw, h], [x, y, x + cw + slack, y + h + slack]));
                    n += 1;
                    x += w;
                }
                y += h;
            }
            Grid {
                table: (ox, oy, tw, th),
                cells,
                role: "table cell",
                states: SHOWING,
            }
        }

        pub fn at(&self, x: i32, y: i32) -> CallResult {
            let hit = self
                .cells
                .iter()
                .find(|(_, _, b)| x >= b[0] && x < b[2] && y >= b[1] && y < b[3]);
            let path = hit.map_or(NULL_PATH.to_string(), |c| c.0.clone());
            Ok(vec![Value::Struct(vec![Value::Str(String::new()), Value::Path(path)])])
        }

        pub fn extents(&self, path: &str) -> CallResult {
            let e = if path == "/t" {
                let (x, y, w, h) = self.table;
                [x, y, w, h]
            } else {
                self.cells.iter().find(|c| c.0 == path).expect("a known cell").1
            };
            Ok(vec![Value::Struct(e.iter().map(|v| Value::I32(*v)).collect())])
        }
    }

    pub fn table() -> ObjRef {
        ObjRef {
            bus: ":1.9".into(),
            path: "/t".into(),
        }
    }

    /// Runs a scan against `grid`, recording the hit points.
    pub fn run(grid: &Grid, budget: u32) -> (Progress, Vec<(i32, i32)>) {
        let (mut sampler, mut progress) = Sampler::start(table(), budget, true, &["showing", "visible"]);
        let mut hits = Vec::new();
        loop {
            progress = match progress {
                Progress::Need(Need::TableExtents) => sampler.table_extents(&grid.extents("/t")),
                Progress::Need(Need::HitTest { x, y }) => {
                    hits.push((x, y));
                    sampler.hit(&grid.at(x, y))
                }
                Progress::Need(Need::Cell(obj)) => {
                    assert_eq!(obj.bus, ":1.9", "an empty bus name is the table's");
                    let words = Value::Array(vec![Value::U32(grid.states[0]), Value::U32(grid.states[1])]);
                    assert!(sampler.cell_extents(grid.extents(&obj.path)).is_none());
                    assert!(sampler.cell_state(Ok(vec![words])).is_none());
                    sampler
                        .cell_role(Ok(vec![Value::Str(grid.role.into())]))
                        .expect("the third reply moves the scan on")
                }
                other => return (other, hits),
            }
        }
    }

    fn paths(progress: &Progress) -> Vec<String> {
        match progress {
            Progress::Done(cells) => cells.iter().map(|c| c.path.clone()).collect(),
            other => panic!("expected Done, got {other:?}"),
        }
    }

    #[test]
    fn the_scan_walks_rows_and_columns_as_the_vendor_does() {
        // The pinned vendor's hit points on a GTK 3 tree view, 500 px wide from x 1, rows 22 px high from y 395,
        // columns of 58 and 440 px, whose hit boxes reach two pixels past each cell's right edge and one past its
        // bottom (W/m1a1 trace of `get_window_state` on a 10,000-row list).
        let mut grid = Grid {
            table: (1, 395, 500, 66),
            cells: Vec::new(),
            role: "table cell",
            states: SHOWING,
        };
        for (r, y) in [395, 417, 439].into_iter().enumerate() {
            let bottom = if r == 0 { 417 } else { y + 22 };
            let hit_bottom = bottom + 1;
            let top = if r == 0 { 395 } else { y + 1 };
            grid.cells
                .push((format!("/r{r}c0"), [1, y, 58, bottom - y], [1, top, 61, hit_bottom]));
            grid.cells
                .push((format!("/r{r}c1"), [59, y, 440, bottom - y], [61, top, 501, hit_bottom]));
        }
        let (progress, hits) = run(&grid, 4996);
        assert_eq!(
            &hits[..9],
            &[
                (1, 395),
                (59, 395),
                (60, 395),
                (61, 395),
                (499, 395),
                (500, 395),
                (1, 417),
                (1, 418),
                (59, 418)
            ],
            "the vendor's first hit points"
        );
        assert_eq!(paths(&progress), ["/r0c0", "/r0c1", "/r1c0", "/r1c1", "/r2c0", "/r2c1"]);
    }

    #[test]
    fn cells_are_kept_once_in_discovery_order() {
        let grid = Grid::uniform((10, 20), (300, 100), (100, 25), 0);
        let (progress, hits) = run(&grid, 4996);
        let expected: Vec<String> = (0..12).map(|n| format!("/c{n}")).collect();
        assert_eq!(paths(&progress), expected);
        assert_eq!(hits.len(), 12, "one hit per cell when the hit boxes are the extents");
    }

    #[test]
    fn the_budget_and_the_hit_limit_end_the_scan_with_the_cells_found() {
        let grid = Grid::uniform((0, 0), (300, 100), (100, 25), 0);
        let (progress, hits) = run(&grid, 5);
        assert_eq!(paths(&progress), ["/c0", "/c1", "/c2", "/c3", "/c4"]);
        assert_eq!(hits.len(), 5);
        // a larger budget finds the same cells first
        let (more, _) = run(&grid, 7);
        assert_eq!(paths(&more)[..5], paths(&progress)[..]);
        // a budget of nothing asks for nothing
        let (_, progress) = Sampler::start(table(), 0, true, &["showing", "visible"]);
        assert_eq!(progress, Progress::Done(vec![]));
        // one-pixel cells: the hit tests run out first
        let tiny = Grid::uniform((0, 0), (100, 100), (1, 1), 0);
        let (progress, hits) = run(&tiny, 10_000);
        assert_eq!(hits.len(), MAX_HIT_TESTS as usize);
        assert_eq!(paths(&progress).len(), MAX_HIT_TESTS as usize);
    }

    #[test]
    fn the_table_s_preconditions_carry_the_vendor_sentences() {
        let failed = |p: Progress| match p {
            Progress::Failed(reason) => reason,
            other => panic!("expected Failed, got {other:?}"),
        };
        assert_eq!(
            failed(Sampler::start(table(), 10, false, &["showing", "visible"]).1),
            "AT-SPI table does not implement Table"
        );
        assert_eq!(
            failed(Sampler::start(table(), 10, true, &["showing"]).1),
            "AT-SPI table is not visible"
        );
        let (mut sampler, _) = Sampler::start(table(), 10, true, &["visible", "showing"]);
        let empty = Ok(vec![Value::Struct(vec![
            Value::I32(5),
            Value::I32(5),
            Value::I32(0),
            Value::I32(9),
        ])]);
        assert_eq!(
            failed(sampler.table_extents(&empty)),
            "AT-SPI table has no visible bounds"
        );
    }

    #[test]
    fn a_bad_hit_abandons_the_scan_with_its_reason() {
        let failed = |grid: &Grid| match run(grid, 100).0 {
            Progress::Failed(reason) => reason,
            other => panic!("expected Failed, got {other:?}"),
        };
        // a blank spot: the first row's second half is not covered
        let mut grid = Grid::uniform((0, 0), (200, 50), (100, 25), 0);
        grid.cells.remove(1);
        assert_eq!(failed(&grid), "AT-SPI table hit test found no cell");
        let mut grid = Grid::uniform((0, 0), (200, 50), (100, 25), 0);
        grid.role = "table column header";
        assert_eq!(failed(&grid), "AT-SPI table hit test returned a non-cell object");
        let mut grid = Grid::uniform((0, 0), (200, 50), (100, 25), 0);
        grid.states = [1 << 25, 0];
        assert_eq!(
            failed(&grid),
            "AT-SPI table hit test returned a cell without visible bounds"
        );
        let mut grid = Grid::uniform((0, 0), (200, 50), (100, 25), 0);
        grid.cells[0].1 = [500, 500, 10, 10];
        assert_eq!(
            failed(&grid),
            "AT-SPI table hit test returned a cell outside the table bounds"
        );
        // the table itself, and a D-Bus error
        let (mut sampler, _) = Sampler::start(table(), 10, true, &["showing", "visible"]);
        let grid = Grid::uniform((0, 0), (200, 50), (100, 25), 0);
        sampler.table_extents(&grid.extents("/t"));
        let me = Ok(vec![Value::Struct(vec![
            Value::Str(":1.9".into()),
            Value::Path("/t".into()),
        ])]);
        assert_eq!(
            sampler.hit(&me),
            Progress::Failed("AT-SPI table hit test returned the table".into())
        );
        let (mut sampler, _) = Sampler::start(table(), 10, true, &["showing", "visible"]);
        sampler.table_extents(&grid.extents("/t"));
        assert_eq!(
            sampler.hit(&Err(
                "D-Bus org.a11y.atspi.Component.GetAccessibleAtPoint failed: x: y".into()
            )),
            Progress::Failed("D-Bus org.a11y.atspi.Component.GetAccessibleAtPoint failed: x: y".into())
        );
    }

    #[test]
    fn a_cell_ending_above_the_row_moves_one_pixel_down() {
        // The second row's hit boxes start one pixel late: a hit on its first pixel row still finds a first-row
        // cell, which ends at or above that row.
        let mut grid = Grid::uniform((0, 0), (100, 40), (100, 20), 0);
        grid.cells[0].2[3] = 21;
        grid.cells[1].2[1] = 21;
        let (progress, hits) = run(&grid, 100);
        assert_eq!(hits, [(0, 0), (0, 20), (0, 21)]);
        assert_eq!(paths(&progress), ["/c0", "/c1"]);
    }
}
