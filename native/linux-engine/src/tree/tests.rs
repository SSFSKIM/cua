//! The frontier read against a model of the vendor's read: the vendor's calls one by one, in the vendor's order
//! (behaviour §5.1–5.4), over a fake bus. The model is the reference for the tree and for the calls the
//! frontier may spend; it is test code only, as the sequential read left the engine in M1a.

use super::*;
use crate::table::tests::Grid;
use std::collections::{HashMap, VecDeque};

// -------------------------------------------------------------------------------------------------------------
// The vendor's read, one call at a time

fn call<T: Transport>(t: &mut T, obj: &ObjRef, field: Field) -> Result<CallResult> {
    let token = t.send(obj, field)?;
    loop {
        let (got, result) = t.recv()?;
        if got == token {
            return Ok(result);
        }
    }
}

/// The vendor's tree read: None when the root's role fails; the counter is the nodes admitted.
fn read_vendor<T: Transport>(t: &mut T, root: &ObjRef) -> Result<(Option<AxNode>, u32)> {
    let mut counter = 0;
    let tree = visit_vendor(t, root, 0, &mut counter, false)?;
    Ok((tree, counter))
}

fn visit_vendor<T: Transport>(
    t: &mut T,
    obj: &ObjRef,
    depth: u32,
    counter: &mut u32,
    leaf: bool,
) -> Result<Option<AxNode>> {
    if *counter >= NODE_LIMIT || depth > MAX_DEPTH {
        return Ok(None);
    }
    let before = *counter;
    *counter += 1;
    let mut data = Data::default();
    data.store(Field::Role, &call(t, obj, Field::Role)?);
    let Some(role) = data.role().map(str::to_string) else {
        return Ok(None);
    };
    for field in [Field::Name, Field::Description] {
        data.store(field, &call(t, obj, field)?);
    }
    if needs_text(&role, leaf) {
        data.store(Field::Text, &call(t, obj, Field::Text)?);
    }
    for field in [Field::State, Field::Interfaces] {
        data.store(field, &call(t, obj, field)?);
    }
    if data.has_action() {
        data.store(Field::NActions, &call(t, obj, Field::NActions)?);
        if let Some(Some(n)) = data.nactions {
            for i in 0..n {
                data.store(Field::ActionName(i), &call(t, obj, Field::ActionName(i))?);
                if !matches!(data.action_names[i as usize], Some(Some(_))) {
                    break;
                }
            }
        }
    }
    if leaf {
        return Ok(Some(data.into_node(obj, Vec::new(), true)));
    }
    if role == "table" {
        data.store(Field::ChildCount, &call(t, obj, Field::ChildCount)?);
    }
    let mut cells = None;
    if data.samples(false) {
        // the vendor reads the table's interfaces and states again before its scan
        let ifaces = ifaces_of(&call(t, obj, Field::Interfaces)?);
        let states = states_of(&call(t, obj, Field::State)?).unwrap_or_default();
        let budget = (NODE_LIMIT - 1).saturating_sub(before);
        let (mut sampler, mut progress) = Sampler::start(obj.clone(), budget, ifaces.is_some_and(|i| i.table), &states);
        loop {
            progress = match progress {
                Progress::Need(Need::TableExtents) => sampler.table_extents(&call(t, obj, Field::Extents)?),
                Progress::Need(Need::HitTest { x, y }) => sampler.hit(&call(t, obj, Field::AtPoint(x, y))?),
                Progress::Need(Need::Cell(cell)) => {
                    sampler.cell_role(call(t, &cell, Field::Role)?);
                    sampler.cell_state(call(t, &cell, Field::State)?);
                    sampler
                        .cell_extents(call(t, &cell, Field::Extents)?)
                        .expect("three replies")
                }
                Progress::Done(found) => break cells = Some(found),
                Progress::Failed(_) => break,
            }
        }
    }
    let (refs, leaves) = match cells {
        Some(cells) => (cells, true),
        None => {
            data.store(Field::Children, &call(t, obj, Field::Children)?);
            (data.children.clone().unwrap_or_default(), false)
        }
    };
    let mut children = Vec::new();
    for child in refs {
        if let Some(node) = visit_vendor(t, &child, depth + 1, counter, leaves)? {
            children.push(node);
        }
    }
    Ok(Some(data.into_node(obj, children, false)))
}

// -------------------------------------------------------------------------------------------------------------
// The fake bus

/// One fake accessible object.
#[derive(Clone, Default)]
pub(crate) struct Fake {
    role: Option<&'static str>,
    name: Option<String>,
    text: Option<String>,
    states: [u32; 2],
    actions: Option<Vec<&'static str>>,
    children: Vec<String>,
    child_count: i32,
    table: bool,
}

/// A fake bus: a reply becomes available only when the engine waits, and a wait answers everything sent before
/// it (one round trip). It checks the window's bounds at every send. The object `/t`, when present, is a table
/// whose geometry and hit tests `grid` answers.
pub(crate) struct FakeBus {
    objects: HashMap<String, Fake>,
    grid: Option<Grid>,
    next: u32,
    sent: VecDeque<(u32, String, Field)>,
    ready: VecDeque<(u32, CallResult, usize)>,
    window: Window,
    pub(crate) calls: Vec<(String, Field)>,
    waits: u64,
    max_in_flight: usize,
    violations: u32,
}

impl FakeBus {
    pub(crate) fn new(objects: HashMap<String, Fake>, window: Window) -> Self {
        FakeBus {
            objects,
            grid: None,
            next: 1,
            sent: VecDeque::new(),
            ready: VecDeque::new(),
            window,
            calls: vec![],
            waits: 0,
            max_in_flight: 0,
            violations: 0,
        }
    }

    pub(crate) fn with_grid(mut self, grid: Grid) -> Self {
        self.grid = Some(grid);
        self
    }

    fn answer(&self, path: &str, field: Field) -> CallResult {
        let o = self
            .objects
            .get(path)
            .ok_or("D-Bus org.a11y.atspi.Accessible.X failed: unknown object")?;
        let s = |v: &str| Value::Str(v.to_string());
        let var = |v: Value| Value::Variant(Box::new(v));
        Ok(match field {
            Field::Role => vec![s(o
                .role
                .ok_or("D-Bus org.a11y.atspi.Accessible.GetRoleName failed: defunct")?)],
            Field::Name => vec![var(s(o.name.as_deref().unwrap_or("")))],
            Field::Description => vec![var(s(""))],
            Field::Text => vec![s(o.text.as_deref().unwrap_or(""))],
            Field::State => vec![Value::Array(vec![Value::U32(o.states[0]), Value::U32(o.states[1])])],
            Field::Interfaces => {
                let mut i = vec![s("org.a11y.atspi.Accessible")];
                if o.actions.is_some() {
                    i.push(s(ACTION));
                }
                if o.table {
                    i.push(s(TABLE));
                }
                vec![Value::Array(i)]
            }
            Field::NActions => vec![var(Value::I32(o.actions.as_ref().map_or(0, |a| a.len() as i32)))],
            Field::ActionName(n) => vec![s(o.actions.as_ref().unwrap()[n as usize])],
            Field::ChildCount => vec![var(Value::I32(o.child_count))],
            Field::Children => vec![Value::Array(
                o.children
                    .iter()
                    .map(|c| Value::Struct(vec![s(":1.2"), Value::Path(c.clone())]))
                    .collect(),
            )],
            Field::Extents => return self.grid.as_ref().expect("a grid").extents(path),
            Field::AtPoint(x, y) => {
                assert_eq!(path, "/t", "hit tests go to the table");
                return self.grid.as_ref().expect("a grid").at(x, y);
            }
        })
    }

    fn size(result: &CallResult) -> usize {
        match result {
            Ok(values) => {
                values
                    .iter()
                    .map(|v| match v {
                        Value::Str(s) => s.len(),
                        Value::Array(items) => 40 * items.len(),
                        _ => 16,
                    })
                    .sum::<usize>()
                    + 64
            }
            Err(_) => 64,
        }
    }

    fn staged(&self) -> usize {
        self.ready.iter().map(|r| r.2).sum()
    }

    pub(crate) fn calls_to(&self, path: &str) -> Vec<Field> {
        self.calls.iter().filter(|(p, _)| p == path).map(|(_, f)| *f).collect()
    }
}

impl Transport for FakeBus {
    fn send(&mut self, obj: &ObjRef, field: Field) -> Result<u32> {
        if self.in_flight() >= self.window.calls
            || self.staged() + self.window.reservation * self.in_flight() >= self.window.bytes
        {
            self.violations += 1;
        }
        let token = self.next;
        self.next += 1;
        self.sent.push_back((token, obj.path.clone(), field));
        self.calls.push((obj.path.clone(), field));
        self.max_in_flight = self.max_in_flight.max(self.in_flight());
        Ok(token)
    }

    fn recv(&mut self) -> Result<(u32, CallResult)> {
        if self.ready.is_empty() {
            self.waits += 1;
            while let Some((token, path, field)) = self.sent.pop_front() {
                let result = self.answer(&path, field);
                let size = Self::size(&result);
                self.ready.push_back((token, result, size));
            }
        }
        let (token, result, _) = self.ready.pop_front().expect("a call is outstanding");
        Ok((token, result))
    }

    fn try_recv(&mut self) -> Result<Option<(u32, CallResult)>> {
        Ok(self.ready.pop_front().map(|(t, r, _)| (t, r)))
    }

    fn in_flight(&self) -> usize {
        self.sent.len() + self.ready.len()
    }

    fn staged_bytes(&self) -> usize {
        self.staged()
    }
}

const W64: Window = Window { calls: 64, ..WINDOW };
const SHOWING: [u32; 2] = [(1 << 8) | (1 << 24) | (1 << 25) | (1 << 30), 0];

pub(crate) fn root() -> ObjRef {
    ObjRef {
        bus: ":1.2".into(),
        path: "/0".into(),
    }
}

/// A tree with text and entry nodes, actions, a table and a node whose role fails.
pub(crate) fn mixed() -> HashMap<String, Fake> {
    let mut objects = HashMap::new();
    let mut add = |path: &str, fake: Fake| {
        objects.insert(path.to_string(), fake);
    };
    add(
        "/0",
        Fake {
            role: Some("frame"),
            name: Some("Window".into()),
            states: SHOWING,
            children: vec!["/1".into(), "/2".into(), "/3".into(), "/4".into()],
            ..Default::default()
        },
    );
    add(
        "/1",
        Fake {
            role: Some("push button"),
            name: Some("Open".into()),
            actions: Some(vec!["click"]),
            states: SHOWING,
            ..Default::default()
        },
    );
    add(
        "/2",
        Fake {
            role: Some("entry"),
            text: Some(String::new()),
            states: [1 << 7, 1 << 9],
            actions: Some(vec![]),
            ..Default::default()
        },
    );
    add(
        "/3",
        Fake {
            role: None,
            children: vec!["/5".into()],
            ..Default::default()
        },
    );
    add(
        "/4",
        Fake {
            role: Some("table"),
            child_count: 2,
            children: vec!["/6".into(), "/7".into()],
            ..Default::default()
        },
    );
    add(
        "/5",
        Fake {
            role: Some("label"),
            name: Some("never read".into()),
            ..Default::default()
        },
    );
    add(
        "/6",
        Fake {
            role: Some("table cell"),
            name: Some("a".into()),
            ..Default::default()
        },
    );
    add(
        "/7",
        Fake {
            role: Some("text"),
            text: Some("body\nline".into()),
            actions: Some(vec!["showContextMenu", "doDefault"]),
            ..Default::default()
        },
    );
    objects
}

/// `branching` children per node down to `depth` levels below the root (paths are unique).
fn uniform(branching: usize, depth: usize) -> HashMap<String, Fake> {
    let mut objects = HashMap::new();
    fn build(objects: &mut HashMap<String, Fake>, path: String, level: usize, branching: usize, depth: usize) {
        let children: Vec<String> = if level < depth {
            (0..branching).map(|i| format!("{path}/{i}")).collect()
        } else {
            vec![]
        };
        objects.insert(
            path.clone(),
            Fake {
                role: Some(if level % 3 == 2 { "text" } else { "panel" }),
                name: Some(path.clone()),
                states: SHOWING,
                children: children.clone(),
                ..Default::default()
            },
        );
        for c in children {
            build(objects, c, level + 1, branching, depth);
        }
    }
    build(&mut objects, "/0".into(), 0, branching, depth);
    objects
}

fn count(node: &AxNode) -> usize {
    1 + node.children.iter().map(count).sum::<usize>()
}

fn ids(node: &AxNode, out: &mut Vec<String>) {
    out.push(node.id.clone());
    for c in &node.children {
        ids(c, out);
    }
}

fn sorted_calls(mut calls: Vec<(String, Field)>) -> Vec<(String, String)> {
    let mut v: Vec<(String, String)> = calls.drain(..).map(|(p, f)| (p, format!("{f:?}"))).collect();
    v.sort();
    v
}

fn vendor(objects: HashMap<String, Fake>, grid: Option<Grid>) -> (Option<AxNode>, FakeBus) {
    let mut bus = FakeBus::new(objects, Window { calls: 1, ..WINDOW });
    bus.grid = grid;
    let (tree, _) = read_vendor(&mut bus, &root()).unwrap();
    (tree, bus)
}

#[test]
fn the_query_keeps_matches_and_their_ancestors_only() {
    let mut bus = FakeBus::new(mixed(), WINDOW);
    let tree = read(&mut bus, &root(), WINDOW).unwrap().0.unwrap();
    let filtered = filter(tree.clone(), "  LINE ");
    assert_eq!(filtered.children.len(), 1);
    assert_eq!(filtered.children[0].id, ":1.2:/4");
    assert_eq!(filtered.children[0].children.len(), 1);
    assert_eq!(filtered.children[0].children[0].value.as_deref(), Some("body\nline"));
    assert_eq!(filter(tree.clone(), "   "), tree);
    assert_eq!(
        count(&filter(tree.clone(), ":1.2")),
        count(&tree),
        "the id is matched too"
    );
    assert!(filter(tree, "nothing matches this").children.is_empty());
}

#[test]
fn states_keep_the_vendor_table_and_order() {
    let words = [Value::U32(0x4320_0102), Value::U32(0)];
    assert_eq!(
        decode_states(&words),
        Some(vec!["enabled", "sensitive", "showing", "visible"])
    );
    let all = [Value::U32(u32::MAX), Value::U32(u32::MAX)];
    assert_eq!(
        decode_states(&all),
        Some(vec![
            "checked",
            "defunct",
            "editable",
            "enabled",
            "expanded",
            "focusable",
            "focused",
            "selected",
            "sensitive",
            "showing",
            "visible",
            "indeterminate",
            "checkable"
        ])
    );
    assert_eq!(decode_states(&[Value::U32(0), Value::U32(0)]), Some(vec![]));
    assert_eq!(decode_states(&[Value::U32(1)]), None);
}

#[test]
fn the_read_gives_the_vendor_fields() {
    let mut bus = FakeBus::new(mixed(), WINDOW);
    let (tree, stats) = read(&mut bus, &root(), WINDOW).unwrap();
    let tree = tree.unwrap();
    let json = serde_json::to_value(&tree).unwrap();
    assert_eq!(json["id"], ":1.2:/0");
    assert_eq!(json["role"], "frame");
    assert_eq!(json["name"], "Window");
    assert!(json.get("description").is_none(), "an empty description is omitted");
    assert!(json.get("actions").is_none(), "no Action interface, no key");
    let kids = json["children"].as_array().unwrap();
    assert_eq!(kids.len(), 3, "the node whose role fails drops with its subtree");
    assert_eq!(kids[0]["actions"], serde_json::json!(["click"]));
    assert_eq!(kids[1]["value"], "", "an entry's empty text is kept");
    assert_eq!(kids[1]["actions"], serde_json::json!([]));
    assert_eq!(kids[1]["states"], serde_json::json!(["editable", "checkable"]));
    assert!(
        kids[2]["children"][0].get("value").is_none(),
        "a listed table cell gets no text"
    );
    assert_eq!(kids[2]["children"][1]["value"], "body\nline");
    assert_eq!(
        kids[2]["children"][1]["actions"],
        serde_json::json!(["showContextMenu", "doDefault"])
    );
    // key order is alphabetical, absent keys skipped
    let line = serde_json::to_string(&kids[0]).unwrap();
    assert!(
        line.starts_with(
            r#"{"actions":["click"],"children":[],"id":":1.2:/1","name":"Open","role":"push button","states":"#
        ),
        "{line}"
    );
    assert_eq!(
        stats.admitted, 7,
        "the failed node consumes its count; its child is never visited"
    );
    // no calls after a failed GetRoleName but the ones sent with it; no ChildCount but for a table
    let (expected, model) = vendor(mixed(), None);
    assert_eq!(Some(tree), expected);
    assert_eq!(model.calls_to("/2").len(), bus.calls_to("/2").len());
    assert!(!bus.calls_to("/3").contains(&Field::Name) || bus.calls_to("/3").len() <= ALWAYS.len());
    assert!(
        !bus.calls_to("/5").contains(&Field::Role),
        "a failed node's child is never read"
    );
    assert!(bus.calls_to("/4").contains(&Field::ChildCount));
    assert!(!bus.calls_to("/1").contains(&Field::ChildCount));
}

#[test]
fn the_model_sends_the_vendor_calls_in_the_vendor_order() {
    let (_, model) = vendor(mixed(), None);
    assert_eq!(
        model.calls_to("/2"),
        vec![
            Field::Role,
            Field::Name,
            Field::Description,
            Field::Text,
            Field::State,
            Field::Interfaces,
            Field::NActions,
            Field::Children
        ]
    );
    assert_eq!(model.calls_to("/3"), vec![Field::Role]);
    assert_eq!(
        model.calls_to("/4"),
        vec![
            Field::Role,
            Field::Name,
            Field::Description,
            Field::State,
            Field::Interfaces,
            Field::ChildCount,
            Field::Children
        ]
    );
    assert_eq!(model.waits as usize, model.calls.len(), "one wait per call");
}

#[test]
fn the_frontier_returns_the_vendor_tree_with_the_same_calls_and_far_fewer_waits() {
    let objects = uniform(6, 3); // 259 nodes
    let (expected, model) = vendor(objects.clone(), None);
    let mut bus = FakeBus::new(objects, W64);
    let (got, stats) = read(&mut bus, &root(), W64).unwrap();
    assert_eq!(got, expected);
    assert_eq!(
        sorted_calls(bus.calls.clone()),
        sorted_calls(model.calls.clone()),
        "exactly the vendor's calls"
    );
    assert_eq!(stats.wasted_calls, 0);
    assert_eq!(bus.violations, 0);
    assert!(
        bus.max_in_flight <= 64 && bus.max_in_flight > 32,
        "max in flight {}",
        bus.max_in_flight
    );
    assert!(
        bus.waits * 20 < model.waits,
        "frontier waits {} vs vendor {}",
        bus.waits,
        model.waits
    );
}

#[test]
fn m0_s_window_is_the_default() {
    assert_eq!(
        (WINDOW.calls, WINDOW.bytes, WINDOW.reservation, WINDOW.slack),
        (32, 4 << 20, 4 << 10, 8)
    );
    let objects = uniform(6, 3);
    let mut bus = FakeBus::new(objects, WINDOW);
    read(&mut bus, &root(), WINDOW).unwrap();
    assert_eq!(bus.max_in_flight, 32);
    assert_eq!(bus.violations, 0);
}

#[test]
fn the_frontier_matches_the_vendor_on_failures_tables_and_actions() {
    let (expected, _) = vendor(mixed(), None);
    for calls in [1, 2, 3, 7, 64] {
        let window = Window { calls, ..WINDOW };
        let mut bus = FakeBus::new(mixed(), window);
        let (got, _) = read(&mut bus, &root(), window).unwrap();
        assert_eq!(got, expected, "W={calls}");
        assert_eq!(bus.violations, 0);
        assert!(bus.max_in_flight <= calls);
    }
}

#[test]
fn depth_is_limited_to_63_below_the_root() {
    let mut objects = HashMap::new();
    for d in 0..70 {
        let children = if d < 69 { vec![format!("/{}", d + 1)] } else { vec![] };
        objects.insert(
            format!("/{d}"),
            Fake {
                role: Some("panel"),
                children,
                ..Default::default()
            },
        );
    }
    let (expected, _) = vendor(objects.clone(), None);
    assert_eq!(count(expected.as_ref().unwrap()), 64);
    let mut bus = FakeBus::new(objects, WINDOW);
    let (got, _) = read(&mut bus, &root(), WINDOW).unwrap();
    assert_eq!(got, expected);
    assert!(
        !bus.calls.iter().any(|(p, _)| p == "/64"),
        "no call for a node deeper than 63"
    );
}

#[test]
fn the_root_failing_reads_nothing() {
    let mut objects = mixed();
    objects.get_mut("/0").unwrap().role = None;
    let mut bus = FakeBus::new(objects.clone(), WINDOW);
    assert_eq!(read(&mut bus, &root(), WINDOW).unwrap().0, None);
    assert_eq!(vendor(objects, None).0, None);
}

/// Over budget, deep first: a long chain of wide levels whose preorder fills the budget before the later wide
/// siblings, which a careless frontier would fetch.
fn over_budget() -> HashMap<String, Fake> {
    let mut objects = HashMap::new();
    let mut top = Vec::new();
    // the deep branch: 40 levels of 150 children each, the first child of each level continuing
    let mut parent = "/0/deep".to_string();
    top.push(parent.clone());
    for level in 0..40 {
        let children: Vec<String> = (0..150).map(|i| format!("{parent}/{i}")).collect();
        objects.insert(
            parent.clone(),
            Fake {
                role: Some("panel"),
                children: children.clone(),
                ..Default::default()
            },
        );
        for c in &children[1..] {
            objects.insert(
                c.clone(),
                Fake {
                    role: Some(if level % 2 == 0 { "label" } else { "entry" }),
                    name: Some(c.clone()),
                    ..Default::default()
                },
            );
        }
        parent = children[0].clone();
    }
    objects.insert(
        parent,
        Fake {
            role: Some("label"),
            ..Default::default()
        },
    );
    // the wide branch: 20,000 leaves
    let wide: Vec<String> = (0..20_000).map(|i| format!("/0/wide/{i}")).collect();
    for c in &wide {
        objects.insert(
            c.clone(),
            Fake {
                role: Some("push button"),
                actions: Some(vec!["click"]),
                ..Default::default()
            },
        );
    }
    objects.insert(
        "/0/wide".into(),
        Fake {
            role: Some("list"),
            children: wide,
            ..Default::default()
        },
    );
    top.push("/0/wide".into());
    objects.insert(
        "/0".into(),
        Fake {
            role: Some("frame"),
            children: top,
            ..Default::default()
        },
    );
    objects
}

#[test]
fn over_budget_keeps_the_preorder_node_set_and_bounds_extra_calls() {
    let objects = over_budget();
    let (expected, model) = vendor(objects.clone(), None);
    let expected = expected.unwrap();
    assert_eq!(count(&expected), 5000);
    let mut bus = FakeBus::new(objects, WINDOW);
    let (got, stats) = read(&mut bus, &root(), WINDOW).unwrap();
    let got = got.unwrap();
    let (mut a, mut b) = (vec![], vec![]);
    ids(&expected, &mut a);
    ids(&got, &mut b);
    assert_eq!(a, b, "the retained native ids are the vendor's exactly");
    assert_eq!(got, expected);
    assert_eq!(stats.admitted, 5000);
    let extra = bus.calls.len() as i64 - model.calls.len() as i64;
    assert!(
        extra >= 0 && extra as u64 == stats.wasted_calls,
        "extra {extra}, wasted {}",
        stats.wasted_calls
    );
    // This shape is harsher than the harness's over-budget page, where the spec's bound (the vendor's calls plus
    // 256) is judged: W 32 and slack 8 waste 318 calls here and at most 188 there (M1a.1's runs). The guard is
    // against a regression of the speculation rule (without any bound, M0.2 measured 1,510 here at W 64).
    assert!(
        stats.wasted_calls <= 12 * WINDOW.calls as u64,
        "wasted {} calls",
        stats.wasted_calls
    );
    assert_eq!(bus.violations, 0);
    assert!(
        bus.waits * 10 < model.waits,
        "frontier waits {} vs vendor {}",
        bus.waits,
        model.waits
    );
}

#[test]
fn a_deep_first_branch_under_the_limit_reads_at_full_speed() {
    // the over-budget shape cut to 20 levels of 150 (3,021 nodes): nothing is refused, nothing may crawl
    let mut objects = over_budget();
    objects.retain(|path, _| !path.starts_with("/0/wide"));
    let deep_limit = (0..20).fold("/0/deep".to_string(), |p, _| format!("{p}/0"));
    objects.retain(|path, _| !path.starts_with(&format!("{deep_limit}/")));
    objects.get_mut(&deep_limit).unwrap().children.clear();
    objects.get_mut("/0").unwrap().children = vec!["/0/deep".into()];
    let (expected, model) = vendor(objects.clone(), None);
    let mut bus = FakeBus::new(objects, WINDOW);
    let (got, stats) = read(&mut bus, &root(), WINDOW).unwrap();
    assert_eq!(got, expected);
    assert_eq!(stats.wasted_calls, 0);
    assert!(
        bus.waits * 25 < model.waits,
        "frontier waits {} vs vendor {}",
        bus.waits,
        model.waits
    );
}

#[test]
fn a_wide_container_fetches_attributes_only_inside_the_admission_window() {
    let mut objects = HashMap::new();
    let wide: Vec<String> = (0..20_000).map(|i| format!("/w/{i}")).collect();
    for c in &wide {
        objects.insert(
            c.clone(),
            Fake {
                role: Some("list item"),
                ..Default::default()
            },
        );
    }
    objects.insert(
        "/0".into(),
        Fake {
            role: Some("list"),
            children: wide,
            ..Default::default()
        },
    );
    let (expected, model) = vendor(objects.clone(), None);
    let mut bus = FakeBus::new(objects, WINDOW);
    let (got, stats) = read(&mut bus, &root(), WINDOW).unwrap();
    assert_eq!(got, expected);
    assert_eq!(count(got.as_ref().unwrap()), 5000);
    assert_eq!(stats.wasted_calls, 0);
    assert_eq!(bus.calls.len(), model.calls.len());
}

#[test]
fn the_byte_budget_bounds_calls_in_flight_and_a_reply_over_it_is_read_whole() {
    let mut objects = mixed();
    let big = "é".repeat(2 * 1024 * 1024 + 7); // over 4 MiB of UTF-8
    objects.get_mut("/7").unwrap().text = Some(big.clone());
    let window = Window {
        calls: 64,
        bytes: 3 * 4096,
        reservation: 4096,
        ..WINDOW
    };
    let mut bus = FakeBus::new(objects.clone(), window);
    let (got, _) = read(&mut bus, &root(), window).unwrap();
    assert!(
        bus.max_in_flight <= 3,
        "R / reservation = 3 calls, got {}",
        bus.max_in_flight
    );
    assert_eq!(bus.violations, 0);
    let (expected, _) = vendor(objects.clone(), None);
    assert_eq!(got, expected);
    let cell = &got.unwrap().children[2].children[1];
    assert_eq!(
        cell.value.as_deref(),
        Some(big.as_str()),
        "the 4 MiB text is read exactly"
    );
    let mut bus = FakeBus::new(objects, WINDOW);
    let (got, _) = read(&mut bus, &root(), WINDOW).unwrap();
    assert_eq!(got, expected);
    assert_eq!(bus.violations, 0);
}

// -------------------------------------------------------------------------------------------------------------
// The visible-table path (behaviour §5.4)

/// A frame holding `before` labels, a table of `listed` children of which `grid` is the visible part, and a
/// button after it.
pub(crate) fn with_table(before: usize, listed: usize, child_count: i32, grid: &Grid) -> HashMap<String, Fake> {
    let mut objects = HashMap::new();
    let mut top: Vec<String> = (0..before).map(|i| format!("/l{i}")).collect();
    for path in &top {
        objects.insert(
            path.clone(),
            Fake {
                role: Some("label"),
                name: Some(path.clone()),
                states: SHOWING,
                ..Default::default()
            },
        );
    }
    top.push("/t".into());
    top.push("/after".into());
    objects.insert(
        "/after".into(),
        Fake {
            role: Some("push button"),
            actions: Some(vec!["click"]),
            ..Default::default()
        },
    );
    let children: Vec<String> = (0..listed).map(|i| format!("/c{i}")).collect();
    for (i, path) in children.iter().enumerate() {
        objects.insert(
            path.clone(),
            Fake {
                role: Some("table cell"),
                name: Some(format!("cell {i}")),
                text: Some(format!("text {i}")),
                states: SHOWING,
                actions: Some(vec!["activate"]),
                ..Default::default()
            },
        );
    }
    for (path, _, _) in &grid.cells {
        assert!(objects.contains_key(path), "every visible cell is also a listed child");
    }
    objects.insert(
        "/t".into(),
        Fake {
            role: Some("table"),
            states: SHOWING,
            children,
            child_count,
            table: true,
            ..Default::default()
        },
    );
    objects.insert(
        "/0".into(),
        Fake {
            role: Some("frame"),
            states: SHOWING,
            children: top,
            ..Default::default()
        },
    );
    objects
}

fn table_node(tree: &AxNode) -> &AxNode {
    tree.children
        .iter()
        .find(|c| c.id == ":1.2:/t")
        .expect("the table is admitted")
}

#[test]
fn a_table_over_5000_children_reads_its_visible_cells_as_leaves() {
    let grid = Grid::uniform((0, 100), (300, 100), (100, 25), 0);
    let objects = with_table(3, 6000, 6000, &grid);
    let (expected, model) = vendor(objects.clone(), Some(Grid::uniform((0, 100), (300, 100), (100, 25), 0)));
    let mut bus = FakeBus::new(objects, WINDOW).with_grid(grid);
    let (got, stats) = read(&mut bus, &root(), WINDOW).unwrap();
    assert_eq!(got, expected);
    let got = got.unwrap();
    let table = table_node(&got);
    assert_eq!(table.children.len(), 12, "the visible cells, not the listed children");
    assert_eq!(
        table.children[0].value.as_deref(),
        Some("text 0"),
        "a sampled cell's text is read"
    );
    assert_eq!(table.children[0].actions, Some(vec!["activate".to_string()]));
    assert!(table.children.iter().all(|c| c.children.is_empty()));
    assert_eq!(
        got.children.last().unwrap().id,
        ":1.2:/after",
        "the walk goes on after the table"
    );
    assert_eq!((stats.tables_sampled, stats.tables_listed, stats.hit_tests), (1, 0, 12));
    // a cell is read as a leaf: no GetChildren, and its role and state read again after the scan's reads
    assert!(!bus.calls_to("/c0").contains(&Field::Children));
    assert_eq!(bus.calls_to("/c0").iter().filter(|f| **f == Field::Role).count(), 2);
    // the table's 6,000 children are never listed, and the frontier spends no call the vendor does not (the
    // vendor reads the table's interfaces and states again before its scan)
    assert!(!bus.calls_to("/t").contains(&Field::Children));
    assert_eq!(stats.wasted_calls, 0);
    assert_eq!(bus.calls.len() + 2, model.calls.len());
    assert!(
        bus.waits * 2 < model.waits,
        "frontier waits {} vs vendor {}",
        bus.waits,
        model.waits
    );
}

#[test]
fn a_table_whose_scan_fails_lists_its_children() {
    // a blank spot in the first row: the hit test finds no cell
    let blank = || {
        let mut grid = Grid::uniform((0, 100), (300, 100), (100, 25), 0);
        grid.cells.remove(1);
        grid
    };
    let grid = blank();
    let objects = with_table(3, 6000, 6000, &grid);
    let (expected, _) = vendor(objects.clone(), Some(blank()));
    let mut bus = FakeBus::new(objects, WINDOW).with_grid(grid);
    let (got, stats) = read(&mut bus, &root(), WINDOW).unwrap();
    let (got, expected) = (got.unwrap(), expected.unwrap());
    let (mut a, mut b) = (vec![], vec![]);
    ids(&expected, &mut a);
    ids(&got, &mut b);
    assert_eq!(b, a, "the listed children, admitted by the vendor's preorder");
    assert_eq!(got, expected);
    assert_eq!(count(&got), 5000);
    assert!(
        table_node(&got).children[0].value.is_none(),
        "a listed cell gets no text"
    );
    assert_eq!((stats.tables_sampled, stats.tables_listed), (0, 1));
}

#[test]
fn a_late_table_takes_only_the_cells_admission_leaves() {
    // 4,990 labels before the table: the table is node 4,992 and admission leaves it 8 cells of 12
    let grid = Grid::uniform((0, 100), (300, 100), (100, 25), 0);
    let objects = with_table(4990, 6000, 6000, &grid);
    let (expected, _) = vendor(objects.clone(), Some(Grid::uniform((0, 100), (300, 100), (100, 25), 0)));
    let mut bus = FakeBus::new(objects, WINDOW).with_grid(grid);
    let (got, stats) = read(&mut bus, &root(), WINDOW).unwrap();
    let got = got.unwrap();
    assert_eq!(Some(&got), expected.as_ref());
    assert_eq!(count(&got), 5000);
    assert_eq!(table_node(&got).children.len(), 8);
    assert!(stats.wasted_calls <= 256, "wasted {}", stats.wasted_calls);
}

#[test]
fn a_table_of_5000_children_or_fewer_is_listed() {
    let grid = Grid::uniform((0, 100), (300, 100), (100, 25), 0);
    let objects = with_table(0, 40, 5000, &grid);
    let (expected, _) = vendor(objects.clone(), None);
    let mut bus = FakeBus::new(objects, WINDOW).with_grid(grid);
    let (got, stats) = read(&mut bus, &root(), WINDOW).unwrap();
    assert_eq!(got, expected);
    assert_eq!(table_node(got.as_ref().unwrap()).children.len(), 40);
    assert_eq!(stats.hit_tests, 0);
    assert!(
        !bus.calls
            .iter()
            .any(|(_, f)| matches!(f, Field::AtPoint(..) | Field::Extents))
    );
}

#[test]
fn a_table_after_a_large_nested_subtree_scans_with_the_exact_budget() {
    // A nested earlier subtree of 4,997 nodes leaves the table one cell of budget. The only visible cell is
    // `/c100`; a hit test past it finds a blank spot. The vendor stops after `/c100` (its budget is spent before
    // that hit); a scan started on an underestimate of the nodes before the table would make that hit, fail, and
    // list `/c0` instead.
    fn grid() -> Grid {
        let mut g = Grid::uniform((0, 100), (300, 100), (100, 25), 0);
        g.cells.truncate(1);
        g.cells[0].0 = "/c100".into();
        g
    }
    let mut objects = with_table(0, 6000, 6000, &grid());
    let labels: Vec<String> = (0..4987).map(|i| format!("/prefix/label{i}")).collect();
    for p in &labels {
        objects.insert(
            p.clone(),
            Fake {
                role: Some("label"),
                ..Default::default()
            },
        );
    }
    for i in 0..10 {
        objects.insert(
            format!("/prefix{i}"),
            Fake {
                role: Some("panel"),
                children: if i == 9 {
                    labels.clone()
                } else {
                    vec![format!("/prefix{}", i + 1)]
                },
                ..Default::default()
            },
        );
    }
    objects.get_mut("/0").unwrap().children.insert(0, "/prefix0".into());
    let (expected, _) = vendor(objects.clone(), Some(grid()));
    let expected = expected.unwrap();
    let cells = &table_node(&expected).children;
    assert_eq!(cells.len(), 1);
    assert_eq!(
        (cells[0].id.as_str(), cells[0].value.as_deref()),
        (":1.2:/c100", Some("text 100"))
    );
    for window in [WINDOW, Window { calls: 64, ..WINDOW }, Window { calls: 4, ..WINDOW }] {
        let mut bus = FakeBus::new(objects.clone(), window).with_grid(grid());
        let (got, stats) = read(&mut bus, &root(), window).unwrap();
        assert_eq!(got.as_ref(), Some(&expected), "W {}", window.calls);
        assert_eq!((stats.tables_sampled, stats.tables_listed), (1, 0));
    }
}
