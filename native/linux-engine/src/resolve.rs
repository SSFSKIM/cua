//! Element resolution (behaviour §6.2): finding a native element id in a window's tree for an element request.
//!
//! The first walk is a preorder walk from the frame with one `GetChildren` per node before the target. When it does
//! not find the id (its limit included), the vendor's second walk runs: it reads each node's role and, for a
//! `table` with more than 5,000 children, samples the visible cells (`table.rs`) instead of listing them, so a cell
//! the tree read returned from a large table resolves. A second walk that finds the id wins over the first walk's
//! limit.

use anyhow::Result;

use crate::dbus::{CallResult, Value};
use crate::table::{self, Need, Progress, Sampler};
use crate::tree::{self, Field, NODE_LIMIT, ObjRef, Transport};

pub const TREE_LIMIT: &str = "AT-SPI element search exceeded its tree limit";
pub const TRAVERSAL_LIMIT: &str = "AT-SPI element search exceeded its traversal limit";
pub const NOT_FOUND: &str = "element is not in this window's AT-SPI tree; refresh get_window_state()";

/// The element and its ancestors, nearest first and ending with the frame.
pub type Found = (ObjRef, Vec<ObjRef>);

/// Finds `element_id` under `frame`; the error is the vendor's sentence for why it is not there.
pub fn element<T: Transport>(
    t: &mut T,
    frame: &ObjRef,
    element_id: &str,
) -> Result<std::result::Result<Found, String>> {
    let first = walk(t, frame, element_id, false)?;
    if let Walk::Found(found) = first {
        return Ok(Ok(found));
    }
    let second = walk(t, frame, element_id, true)?;
    Ok(match (second, first) {
        (Walk::Found(found), _) => Ok(found),
        (_, Walk::Limit) => Err(TREE_LIMIT.into()),
        (Walk::Limit, _) => Err(TRAVERSAL_LIMIT.into()),
        _ => Err(NOT_FOUND.into()),
    })
}

enum Walk {
    Found(Found),
    Limit,
    Missing,
}

/// One call, awaited alone (the walks are sequential, so nothing else is in flight).
fn call<T: Transport>(t: &mut T, obj: &ObjRef, field: Field) -> Result<CallResult> {
    let token = t.send(obj, field)?;
    loop {
        let (got, result) = t.recv()?;
        if got == token {
            return Ok(result);
        }
    }
}

/// Several calls sent together, their results in order.
fn call_together<T: Transport>(t: &mut T, calls: &[(&ObjRef, Field)]) -> Result<Vec<CallResult>> {
    let tokens: Vec<u32> = calls.iter().map(|(obj, f)| t.send(obj, *f)).collect::<Result<_>>()?;
    let mut results: Vec<Option<CallResult>> = vec![None; tokens.len()];
    while results.iter().any(Option::is_none) {
        let (got, result) = t.recv()?;
        if let Some(i) = tokens.iter().position(|t| *t == got) {
            results[i] = Some(result);
        }
    }
    Ok(results.into_iter().map(|r| r.expect("every result arrived")).collect())
}

/// A preorder walk: depth below 64 and fewer than 5,000 visits, else the walk's limit; the id compared byte for
/// byte at each visit, before any call for that node.
fn walk<T: Transport>(t: &mut T, frame: &ObjRef, element_id: &str, table_aware: bool) -> Result<Walk> {
    let mut visits = 0u32;
    // (node, depth, a sampled cell, the ancestors from the frame down)
    let mut stack: Vec<(ObjRef, u32, bool, Vec<ObjRef>)> = vec![(frame.clone(), 0, false, Vec::new())];
    while let Some((node, depth, leaf, ancestors)) = stack.pop() {
        if depth >= 64 || visits >= NODE_LIMIT {
            return Ok(Walk::Limit);
        }
        let before = visits;
        visits += 1;
        if format!("{}:{}", node.bus, node.path) == element_id {
            let mut nearest_first = ancestors;
            nearest_first.reverse();
            return Ok(Walk::Found((node, nearest_first)));
        }
        if leaf {
            continue;
        }
        let (children, leaves) = if table_aware {
            table_aware_children(t, &node, before)?
        } else {
            (tree::children_of(&call(t, &node, Field::Children)?), false)
        };
        let mut chain = ancestors;
        chain.push(node);
        for child in children.into_iter().rev() {
            stack.push((child, depth + 1, leaves, chain.clone()));
        }
    }
    Ok(Walk::Missing)
}

/// The second walk's children of a node: a table over 5,000 children gives its sampled cells (leaves), when the
/// scan succeeds; anything else its listed children. A node whose role cannot be read is listed.
fn table_aware_children<T: Transport>(t: &mut T, node: &ObjRef, before: u32) -> Result<(Vec<ObjRef>, bool)> {
    let role = call(t, node, Field::Role)?;
    if tree::role_of(&role).as_deref() == Some("table") {
        let count = tree::child_count_of(&call(t, node, Field::ChildCount)?);
        if count.is_some_and(|n| n > table::SAMPLE_OVER)
            && let Some(cells) = sample(t, node, (NODE_LIMIT - 1).saturating_sub(before))?
        {
            return Ok((cells, true));
        }
    }
    Ok((tree::children_of(&call(t, node, Field::Children)?), false))
}

/// A table's scan driven on its own, with the hit object's three reads sent together: the cells, or None when
/// the scan failed.
fn sample<T: Transport>(t: &mut T, table: &ObjRef, budget: u32) -> Result<Option<Vec<ObjRef>>> {
    let ifaces = call(t, table, Field::Interfaces)?;
    let implements_table = matches!(ifaces.as_ref().ok().and_then(|v| v.first()), Some(Value::Array(items))
        if items.iter().any(|i| i.as_str() == Some(tree::TABLE)));
    let states = tree::states_of(&call(t, table, Field::State)?).unwrap_or_default();
    let (mut sampler, mut progress) = Sampler::start(table.clone(), budget, implements_table, &states);
    loop {
        progress = match progress {
            Progress::Need(Need::TableExtents) => sampler.table_extents(&call(t, table, Field::Extents)?),
            Progress::Need(Need::HitTest { x, y }) => sampler.hit(&call(t, table, Field::AtPoint(x, y))?),
            Progress::Need(Need::Cell(cell)) => {
                let [role, state, extents]: [CallResult; 3] = call_together(
                    t,
                    &[(&cell, Field::Role), (&cell, Field::State), (&cell, Field::Extents)],
                )?
                .try_into()
                .expect("three results");
                sampler.cell_role(role);
                sampler.cell_state(state);
                sampler
                    .cell_extents(extents)
                    .expect("the third reply moves the scan on")
            }
            Progress::Done(cells) => return Ok(Some(cells)),
            Progress::Failed(_) => return Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::table::tests::Grid;
    use crate::tree::tests::{FakeBus, mixed, root, with_table};

    fn obj(path: &str) -> ObjRef {
        ObjRef {
            bus: ":1.2".into(),
            path: path.into(),
        }
    }

    #[test]
    fn the_first_walk_finds_an_element_with_its_ancestors() {
        let mut bus = FakeBus::new(mixed(), tree::WINDOW);
        let (found, ancestors) = element(&mut bus, &root(), ":1.2:/7").unwrap().unwrap();
        assert_eq!(found, obj("/7"));
        assert_eq!(
            ancestors,
            vec![obj("/4"), obj("/0")],
            "nearest first, ending with the frame"
        );
        assert!(
            bus.calls.iter().all(|(_, f)| *f == Field::Children),
            "the first walk lists children only"
        );
        let (frame, none) = element(&mut bus, &root(), ":1.2:/0").unwrap().unwrap();
        assert_eq!((frame, none), (obj("/0"), vec![]), "the frame itself is a valid target");
    }

    #[test]
    fn a_missing_element_is_searched_twice_and_refused() {
        let mut bus = FakeBus::new(mixed(), tree::WINDOW);
        assert_eq!(element(&mut bus, &root(), ":1.2:/99").unwrap(), Err(NOT_FOUND.into()));
        assert!(
            bus.calls.iter().any(|(_, f)| *f == Field::Role),
            "the second walk reads roles"
        );
        // an id that is not even shaped like one walks and is not found
        let mut bus = FakeBus::new(mixed(), tree::WINDOW);
        assert_eq!(element(&mut bus, &root(), "").unwrap(), Err(NOT_FOUND.into()));
    }

    /// A table whose visible cells are its last listed children, out of the first walk's reach.
    fn late_cells() -> (std::collections::HashMap<String, crate::tree::tests::Fake>, Grid) {
        let mut grid = Grid::uniform((0, 100), (300, 100), (100, 25), 0);
        for (i, cell) in grid.cells.iter_mut().enumerate() {
            cell.0 = format!("/c{}", 5990 + i);
        }
        (with_table(3, 6002, 6002, &grid), grid)
    }

    #[test]
    fn a_sampled_cell_past_the_first_walk_s_limit_resolves_through_the_second() {
        let (objects, grid) = late_cells();
        let mut bus = FakeBus::new(objects, tree::WINDOW).with_grid(grid);
        let (found, ancestors) = element(&mut bus, &root(), ":1.2:/c5995").unwrap().unwrap();
        assert_eq!(found, obj("/c5995"));
        assert_eq!(ancestors, vec![obj("/t"), obj("/0")]);
        assert_eq!(
            bus.calls.iter().filter(|(_, f)| *f == Field::Children).count(),
            5000 + 4,
            "the first walk's 5,000 listings, then the frame's and the labels' in the second"
        );
        assert!(bus.calls_to("/t").contains(&Field::ChildCount));
    }

    #[test]
    fn the_first_walk_s_limit_is_the_answer_when_the_second_misses_too() {
        let (objects, grid) = late_cells();
        let mut bus = FakeBus::new(objects, tree::WINDOW).with_grid(grid);
        assert_eq!(
            element(&mut bus, &root(), ":1.2:/c5000").unwrap(),
            Err(TREE_LIMIT.into())
        );
    }

    #[test]
    fn a_table_whose_scan_fails_is_listed_in_the_second_walk() {
        let (objects, mut grid) = late_cells();
        grid.cells.remove(1);
        let mut bus = FakeBus::new(objects, tree::WINDOW).with_grid(grid);
        // listed again, the second walk meets its own limit before the cell
        assert_eq!(
            element(&mut bus, &root(), ":1.2:/c5995").unwrap(),
            Err(TREE_LIMIT.into())
        );
        assert!(bus.calls_to("/t").iter().filter(|f| **f == Field::Children).count() == 2);
    }
}
