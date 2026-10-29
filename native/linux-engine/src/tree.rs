//! The tree read (behaviour §5; Design, Observation): the vendor's per-element calls for the vendor's field set,
//! sent many at a time along the preorder frontier inside a window of W calls and R bytes, and admitted by the
//! vendor's preorder with one shared counter (5,000 nodes, depths 0–63). A `table` with more than 5,000 children
//! has its visible cells sampled (`table.rs`) and read as leaves, as the vendor does (behaviour §5.4).

use anyhow::Result;
use serde::Serialize;

use crate::dbus::{Arg, CallResult, MethodCall, Value};
use crate::table::{self, Need, Progress, Sampler};

pub const NODE_LIMIT: u32 = 5000;
pub const MAX_DEPTH: u32 = 63;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ObjRef {
    pub bus: String,
    pub path: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Field {
    Role,
    Name,
    Description,
    Text,
    State,
    Interfaces,
    NActions,
    ActionName(u32),
    ChildCount,
    Children,
    /// `Component.GetExtents(0)`, screen coordinates.
    Extents,
    /// `Component.GetAccessibleAtPoint(x, y, 0)`, screen coordinates.
    AtPoint(i32, i32),
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AxNode {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actions: Option<Vec<String>>,
    pub children: Vec<AxNode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub states: Option<Vec<&'static str>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
}

/// The query filter (behaviour §5.5): after the walk, keep a node when the lowercased form of its id, role,
/// name, description or value contains the trimmed, lowercased query, or when a descendant is kept; a matching
/// node's other descendants are pruned. The root is always kept. An empty query is no filter.
pub fn filter(mut root: AxNode, query: &str) -> AxNode {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return root;
    }
    fn keep(mut node: AxNode, query: &str) -> Option<AxNode> {
        let hit = [
            Some(&node.id),
            Some(&node.role),
            node.name.as_ref(),
            node.description.as_ref(),
            node.value.as_ref(),
        ]
        .into_iter()
        .flatten()
        .any(|field| field.to_lowercase().contains(query));
        node.children = std::mem::take(&mut node.children)
            .into_iter()
            .filter_map(|c| keep(c, query))
            .collect();
        (hit || !node.children.is_empty()).then_some(node)
    }
    root.children = std::mem::take(&mut root.children)
        .into_iter()
        .filter_map(|c| keep(c, &query))
        .collect();
    root
}

pub trait Transport {
    fn send(&mut self, obj: &ObjRef, field: Field) -> Result<u32>;
    fn recv(&mut self) -> Result<(u32, CallResult)>;
    fn try_recv(&mut self) -> Result<Option<(u32, CallResult)>>;
    fn in_flight(&self) -> usize;
    fn staged_bytes(&self) -> usize;
}

#[derive(Debug, Clone, Copy)]
pub struct Window {
    /// W: calls in flight at most.
    pub calls: usize,
    /// R: reply bytes received and not consumed, plus `reservation` per call in flight, stay under it.
    pub bytes: usize,
    pub reservation: usize,
    /// Where admission is not yet certain, a node starts only while fewer than this many such started nodes
    /// precede it (see `Frontier::scan`).
    pub slack: u32,
}

/// M0's choice (Decision Log, M0.3): W 32, R 4 MiB, 4 KiB reserved per call in flight; slack 8, halved from M0's
/// 16 when `GetChildren` moved behind the role (see `ALWAYS`), which keeps the over-budget page's extra calls near
/// where M0 measured them.
pub const WINDOW: Window = Window {
    calls: 32,
    bytes: 4 * 1024 * 1024,
    reservation: 4 * 1024,
    slack: 8,
};

#[derive(Debug, Default, Clone, PartialEq)]
pub struct ReadStats {
    pub admitted: u32,
    pub discovered: usize,
    pub wasted_calls: u64,
    /// Tables over 5,000 children whose visible cells were sampled, and those whose sampling failed and whose
    /// children were listed instead.
    pub tables_sampled: u32,
    pub tables_listed: u32,
    pub hit_tests: u32,
}

// ---------------------------------------------------------------------------------------------------------------
// The calls, and what each reply means (behaviour §5.1)

const ACCESSIBLE: &str = "org.a11y.atspi.Accessible";
const PROPERTIES: &str = "org.freedesktop.DBus.Properties";
const COMPONENT: &str = "org.a11y.atspi.Component";
pub const ACTION: &str = "org.a11y.atspi.Action";
pub const TABLE: &str = "org.a11y.atspi.Table";

/// The D-Bus call for `field` of `obj`, handed to `with`.
pub fn with_call<R>(obj: &ObjRef, field: Field, with: impl FnOnce(&MethodCall) -> R) -> R {
    let index;
    let point;
    let (iface, member, args): (&str, &str, &[Arg]) = match field {
        Field::Role => (ACCESSIBLE, "GetRoleName", &[]),
        Field::Name => (PROPERTIES, "Get", &[Arg::Str(ACCESSIBLE), Arg::Str("Name")]),
        Field::Description => (PROPERTIES, "Get", &[Arg::Str(ACCESSIBLE), Arg::Str("Description")]),
        Field::Text => ("org.a11y.atspi.Text", "GetText", &[Arg::I32(0), Arg::I32(-1)]),
        Field::State => (ACCESSIBLE, "GetState", &[]),
        Field::Interfaces => (ACCESSIBLE, "GetInterfaces", &[]),
        Field::NActions => (PROPERTIES, "Get", &[Arg::Str(ACTION), Arg::Str("NActions")]),
        Field::ActionName(i) => {
            index = [Arg::I32(i as i32)];
            (ACTION, "GetName", &index)
        }
        Field::ChildCount => (PROPERTIES, "Get", &[Arg::Str(ACCESSIBLE), Arg::Str("ChildCount")]),
        Field::Children => (ACCESSIBLE, "GetChildren", &[]),
        Field::Extents => (COMPONENT, "GetExtents", &[Arg::U32(0)]),
        Field::AtPoint(x, y) => {
            point = [Arg::I32(x), Arg::I32(y), Arg::U32(0)];
            (COMPONENT, "GetAccessibleAtPoint", &point)
        }
    };
    with(&MethodCall {
        dest: &obj.bus,
        path: &obj.path,
        iface,
        member,
        args,
    })
}

/// `GetText(0, -1)` is read for `text` and `entry` roles, and for a sampled table cell (behaviour §5.1, §5.4).
fn needs_text(role: &str, leaf: bool) -> bool {
    role == "text" || role == "entry" || (leaf && role == "table cell")
}

/// `GetRoleName`: the string verbatim, `unknown` when the reply is not a string; a failure drops the node.
pub(crate) fn role_of(result: &CallResult) -> Option<String> {
    match result {
        Ok(values) => Some(values.first().and_then(Value::as_str).unwrap_or("unknown").to_string()),
        Err(_) => None,
    }
}

/// `Properties.Get` of `Name` or `Description`: omitted when it fails, is not a string or is empty.
fn label_of(result: &CallResult) -> Option<String> {
    match result.as_ref().ok()?.first()?.unvariant() {
        Value::Str(s) if !s.is_empty() => Some(s.clone()),
        _ => None,
    }
}

/// `GetText(0, -1)`: verbatim, the empty string included.
fn text_of(result: &CallResult) -> Option<String> {
    match result.as_ref().ok()?.first()? {
        Value::Str(s) => Some(s.clone()),
        _ => None,
    }
}

const STATE_BITS: [(u32, &str); 13] = [
    (4, "checked"),
    (6, "defunct"),
    (7, "editable"),
    (8, "enabled"),
    (10, "expanded"),
    (11, "focusable"),
    (12, "focused"),
    (23, "selected"),
    (24, "sensitive"),
    (25, "showing"),
    (30, "visible"),
    (32, "indeterminate"),
    (41, "checkable"),
];

/// `GetState`'s two words to the vendor's state names, in the vendor's order; None unless exactly two u32.
pub fn decode_states(words: &[Value]) -> Option<Vec<&'static str>> {
    let [Value::U32(low), Value::U32(high)] = words else {
        return None;
    };
    let bits = (*high as u64) << 32 | *low as u64;
    Some(
        STATE_BITS
            .iter()
            .filter(|(bit, _)| bits & (1u64 << bit) != 0)
            .map(|(_, name)| *name)
            .collect(),
    )
}

pub(crate) fn states_of(result: &CallResult) -> Option<Vec<&'static str>> {
    match result.as_ref().ok()?.first()? {
        Value::Array(words) => decode_states(words),
        _ => None,
    }
}

/// What `GetInterfaces` says the tree read needs: whether Action and Table are among them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Ifaces {
    action: bool,
    table: bool,
}

/// None when the call fails or is not an array.
fn ifaces_of(result: &CallResult) -> Option<Ifaces> {
    match result.as_ref().ok()?.first()? {
        Value::Array(items) => Some(Ifaces {
            action: items.iter().any(|i| i.as_str() == Some(ACTION)),
            table: items.iter().any(|i| i.as_str() == Some(TABLE)),
        }),
        _ => None,
    }
}

/// `NActions`: a variant int32 ≥ 0.
fn count_of(result: &CallResult) -> Option<u32> {
    match result.as_ref().ok()?.first()? {
        Value::Variant(inner) => match inner.as_ref() {
            Value::I32(n) if *n >= 0 => Some(*n as u32),
            _ => None,
        },
        _ => None,
    }
}

pub(crate) fn child_count_of(result: &CallResult) -> Option<i32> {
    match result.as_ref().ok()?.first()?.unvariant() {
        Value::I32(n) => Some(*n),
        _ => None,
    }
}

/// `GetChildren`: the `(string, object path)` pairs in reply order; `[]` when it fails or is not an array.
pub(crate) fn children_of(result: &CallResult) -> Vec<ObjRef> {
    let Ok(values) = result else { return Vec::new() };
    let Some(Value::Array(items)) = values.first() else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| match item {
            Value::Struct(parts) => match parts.as_slice() {
                [Value::Str(bus), Value::Path(path)] => Some(ObjRef {
                    bus: bus.clone(),
                    path: path.clone(),
                }),
                _ => None,
            },
            _ => None,
        })
        .collect()
}

/// What the replies for one node said; `None` is "not answered yet".
#[derive(Debug, Default)]
struct Data {
    role: Option<Option<String>>,
    name: Option<Option<String>>,
    description: Option<Option<String>>,
    text: Option<Option<String>>,
    states: Option<Option<Vec<&'static str>>>,
    ifaces: Option<Option<Ifaces>>,
    nactions: Option<Option<u32>>,
    action_names: Vec<Option<Option<String>>>,
    child_count: Option<Option<i32>>,
    children: Option<Vec<ObjRef>>,
}

impl Data {
    fn store(&mut self, field: Field, result: &CallResult) {
        match field {
            Field::Role => self.role = Some(role_of(result)),
            Field::Name => self.name = Some(label_of(result)),
            Field::Description => self.description = Some(label_of(result)),
            Field::Text => self.text = Some(text_of(result)),
            Field::State => self.states = Some(states_of(result)),
            Field::Interfaces => self.ifaces = Some(ifaces_of(result)),
            Field::NActions => {
                let n = count_of(result);
                self.action_names = vec![None; n.unwrap_or(0) as usize];
                self.nactions = Some(n);
            }
            Field::ActionName(i) => {
                if let Some(slot) = self.action_names.get_mut(i as usize) {
                    *slot = Some(text_of(result));
                }
            }
            Field::ChildCount => self.child_count = Some(child_count_of(result)),
            Field::Children => self.children = Some(children_of(result)),
            Field::Extents | Field::AtPoint(..) => debug_assert!(false, "not a node field"),
        }
    }

    fn role(&self) -> Option<&str> {
        self.role.as_ref()?.as_deref()
    }

    fn role_failed(&self) -> bool {
        matches!(self.role, Some(None))
    }

    fn has_action(&self) -> bool {
        matches!(self.ifaces, Some(Some(Ifaces { action: true, .. })))
    }

    /// A table whose children the vendor samples instead of listing (behaviour §5.4).
    fn samples(&self, leaf: bool) -> bool {
        !leaf && self.role() == Some("table") && matches!(self.child_count, Some(Some(n)) if n > table::SAMPLE_OVER)
    }

    /// Every attribute the vendor reads for this node has its answer (the children are the node's own matter).
    fn complete(&self, leaf: bool) -> bool {
        let Some(role) = &self.role else { return false };
        let Some(role) = role else { return true };
        let actions_done = match self.ifaces {
            None => false,
            Some(Some(Ifaces { action: true, .. })) => match self.nactions {
                None => false,
                Some(None) => true,
                Some(Some(_)) => self.action_names.iter().all(Option::is_some),
            },
            Some(_) => true,
        };
        self.name.is_some()
            && self.description.is_some()
            && self.states.is_some()
            && actions_done
            && (!needs_text(role, leaf) || self.text.is_some())
            && (leaf || role != "table" || self.child_count.is_some())
    }

    /// The `actions` key: omitted without Action, `[]` for none, and omitted whole when any read failed.
    fn actions(&self) -> Option<Vec<String>> {
        if !self.has_action() {
            return None;
        }
        self.nactions??;
        self.action_names.iter().map(|n| n.clone().flatten()).collect()
    }

    fn into_node(self, obj: &ObjRef, children: Vec<AxNode>, leaf: bool) -> AxNode {
        let role = self.role.clone().flatten().unwrap_or_default();
        AxNode {
            actions: self.actions(),
            children,
            description: self.description.flatten(),
            id: format!("{}:{}", obj.bus, obj.path),
            name: self.name.flatten(),
            value: if needs_text(&role, leaf) {
                self.text.flatten()
            } else {
                None
            },
            states: self.states.flatten(),
            role,
        }
    }
}

// ---------------------------------------------------------------------------------------------------------------
// The frontier read: the vendor's calls, many in flight, along the preorder frontier inside the admission window

/// How many more calls the window allows: at most `calls` in flight, and a new call only while the reply bytes
/// received and not consumed plus `reservation` per call in flight are under `bytes` (Design, Observation).
fn room(in_flight: usize, staged: usize, window: Window) -> usize {
    if in_flight >= window.calls || staged >= window.bytes {
        return 0;
    }
    let by_bytes = (window.bytes - staged).div_ceil(window.reservation.max(1));
    window.calls.min(by_bytes).saturating_sub(in_flight)
}

/// The calls every node gets first, together. `GetChildren` follows once the role is known, and for a `table`
/// once its child count says it is listed: the vendor never lists a table over 5,000 children (it samples its
/// cells), and listing one can hold its application for seconds (LibreOffice Calc's sheet) or make it build every
/// cell's accessible (GTK's tree view), so the frontier does not send it ahead.
const ALWAYS: [Field; 5] = [
    Field::Role,
    Field::Interfaces,
    Field::Name,
    Field::Description,
    Field::State,
];

/// One call of the frontier: one of the node's own fields, or a call of its table scan.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Call {
    Own(Field),
    TableExtents,
    HitTest(i32, i32),
    CellRole,
    CellState,
    CellExtents,
}

/// A table's scan inside the frontier.
struct Sampling {
    sampler: Sampler,
    /// The object the current cell step reads.
    cell: Option<ObjRef>,
    /// The current step's calls not yet sent.
    queue: Vec<Call>,
    /// The current step's calls sent and not yet answered.
    outstanding: u32,
    outcome: Option<std::result::Result<Vec<ObjRef>, String>>,
}

impl Sampling {
    fn apply(&mut self, progress: Progress) {
        match progress {
            Progress::Need(Need::TableExtents) => self.queue = vec![Call::TableExtents],
            Progress::Need(Need::HitTest { x, y }) => self.queue = vec![Call::HitTest(x, y)],
            Progress::Need(Need::Cell(obj)) => {
                self.cell = Some(obj);
                self.queue = vec![Call::CellRole, Call::CellState, Call::CellExtents];
            }
            Progress::Done(cells) => self.outcome = Some(Ok(cells)),
            Progress::Failed(reason) => self.outcome = Some(Err(reason)),
        }
    }
}

struct Pending {
    obj: ObjRef,
    depth: u32,
    parent: Option<usize>,
    /// A sampled table cell: read without `GetChildren`, with `GetText` for its role (behaviour §5.4).
    leaf: bool,
    data: Data,
    /// Fields of `ALWAYS`, Text, NActions and ChildCount issued, as bits; action names issued, as a count.
    issued: u16,
    names_issued: u32,
    calls: u32,
    sampling: Option<Sampling>,
    children: Option<Vec<usize>>,
    done: bool,
    subtree_done: bool,
    /// Nodes in the finished subtree, itself included (depth-refused children are never created).
    size: u32,
    /// Started where its admission was not certain (see `scan`), and how many such nodes the finished subtree
    /// holds.
    speculative: bool,
    speculative_size: u32,
    open_children: u32,
}

fn bit(field: Field) -> u16 {
    match field {
        Field::Role => 1,
        Field::Name => 2,
        Field::Description => 4,
        Field::Text => 8,
        Field::State => 16,
        Field::Interfaces => 32,
        Field::NActions => 64,
        Field::ChildCount => 128,
        Field::Children => 256,
        Field::ActionName(_) | Field::Extents | Field::AtPoint(..) => 0,
    }
}

struct Frontier {
    nodes: Vec<Pending>,
    tokens: std::collections::HashMap<u32, (usize, Call)>,
    hit_tests: u32,
}

impl Frontier {
    fn new(root: &ObjRef) -> Self {
        let mut f = Frontier {
            nodes: Vec::new(),
            tokens: Default::default(),
            hit_tests: 0,
        };
        f.add(root.clone(), 0, None, false);
        f
    }

    fn add(&mut self, obj: ObjRef, depth: u32, parent: Option<usize>, leaf: bool) -> usize {
        self.nodes.push(Pending {
            obj,
            depth,
            parent,
            leaf,
            data: Data::default(),
            issued: 0,
            names_issued: 0,
            calls: 0,
            sampling: None,
            children: None,
            done: false,
            subtree_done: false,
            size: 0,
            speculative: false,
            speculative_size: 0,
            open_children: 0,
        });
        self.nodes.len() - 1
    }

    /// The calls `node` can send now, in order.
    fn ready(node: &Pending, out: &mut Vec<Call>) {
        if node.data.role_failed() {
            return;
        }
        for field in ALWAYS {
            if node.issued & bit(field) == 0 {
                out.push(Call::Own(field));
            }
        }
        if let Some(role) = node.data.role() {
            if !node.leaf && node.issued & bit(Field::Children) == 0 && Self::listed(node, role) {
                out.push(Call::Own(Field::Children));
            }
            if needs_text(role, node.leaf) && node.issued & bit(Field::Text) == 0 {
                out.push(Call::Own(Field::Text));
            }
            if !node.leaf && role == "table" && node.issued & bit(Field::ChildCount) == 0 {
                out.push(Call::Own(Field::ChildCount));
            }
        }
        if node.data.has_action() && node.issued & bit(Field::NActions) == 0 {
            out.push(Call::Own(Field::NActions));
        }
        if let Some(Some(n)) = node.data.nactions {
            out.extend((node.names_issued..n).map(|i| Call::Own(Field::ActionName(i))));
        }
        if let Some(sampling) = &node.sampling {
            out.extend(sampling.queue.iter().copied());
        }
    }

    /// Whether the node's children are listed with `GetChildren`: always, but for a table over 5,000 children
    /// whose scan has not failed, and a table whose child count is not in yet.
    fn listed(node: &Pending, role: &str) -> bool {
        if role != "table" {
            return true;
        }
        match node.data.child_count {
            None => false,
            Some(Some(n)) if n > table::SAMPLE_OVER => {
                matches!(node.sampling.as_ref().and_then(|s| s.outcome.as_ref()), Some(Err(_)))
            }
            Some(_) => true,
        }
    }

    /// Starts the scan of a table once its child count, interfaces and states are in and the `before` nodes that
    /// precede it in preorder are exactly known, with the cells admission can still take after them. The budget
    /// must be exact, not an upper bound: a hit test the vendor never makes (past its budget) can fail, and a
    /// failed scan lists the children instead of keeping the cells found. True when the scan concluded at once (a
    /// budget of nothing, or a precondition that failed).
    fn start_sampling(node: &mut Pending, before: u32) -> bool {
        if node.sampling.is_some() || !node.data.samples(node.leaf) {
            return false;
        }
        let (Some(ifaces), Some(states)) = (&node.data.ifaces, &node.data.states) else {
            return false;
        };
        let implements_table = ifaces.is_some_and(|i| i.table);
        let states = states.clone().unwrap_or_default();
        let budget = (NODE_LIMIT - 1).saturating_sub(before);
        let (sampler, progress) = Sampler::start(node.obj.clone(), budget, implements_table, &states);
        let mut sampling = Sampling {
            sampler,
            cell: None,
            queue: Vec::new(),
            outstanding: 0,
            outcome: None,
        };
        sampling.apply(progress);
        let concluded = sampling.outcome.is_some();
        node.sampling = Some(sampling);
        concluded
    }

    /// Up to `max` calls, earliest in preorder first, for nodes preorder admission could still admit: the walk
    /// counts every node known to precede (a lower bound, since unknown subtrees only add to it) and stops once
    /// that count reaches the limit.
    ///
    /// Admission is certain for a node when every node before it in preorder is known. Past the first node whose
    /// children are not yet known, a node may start (have its first call sent) only while fewer than `slack`
    /// nodes started there precede it in preorder; already started nodes always continue. On a tree under the
    /// limit nothing is ever refused, so the rule costs nothing; over the limit it keeps the calls spent on nodes
    /// preorder later refuses to a few nodes per level the walk discovers out of preorder.
    fn scan(&mut self, max: usize, slack: u32, out: &mut Vec<(usize, Call)>) {
        let mut count = 0u32;
        let mut uncertain = false;
        let mut speculative_before = 0u32;
        let mut stack = vec![0usize];
        let mut calls = Vec::new();
        while let Some(index) = stack.pop() {
            if count >= NODE_LIMIT {
                return;
            }
            let node = &self.nodes[index];
            if node.subtree_done && count + node.size <= NODE_LIMIT {
                count += node.size;
                if uncertain {
                    speculative_before += node.speculative_size;
                }
                continue;
            }
            // `count` is exact while nothing before this node is uncertain.
            if !uncertain && Self::start_sampling(&mut self.nodes[index], count) {
                self.settle(index);
            }
            count += 1;
            let node = &self.nodes[index];
            if node.speculative && uncertain {
                speculative_before += 1;
            }
            if node.calls > 0 || !uncertain || speculative_before < slack {
                calls.clear();
                Self::ready(node, &mut calls);
                for &call in &calls {
                    if out.len() == max {
                        return;
                    }
                    out.push((index, call));
                    let node = &mut self.nodes[index];
                    if node.calls == 0 && uncertain {
                        node.speculative = true;
                        speculative_before += 1;
                    }
                    node.calls += 1;
                    match call {
                        Call::Own(Field::ActionName(_)) => node.names_issued += 1,
                        Call::Own(field) => node.issued |= bit(field),
                        _ => {
                            let sampling = node.sampling.as_mut().expect("a scan call comes from a scan");
                            sampling.queue.remove(0);
                            sampling.outstanding += 1;
                        }
                    }
                }
            }
            let node = &self.nodes[index];
            match &node.children {
                Some(children) => stack.extend(children.iter().rev()),
                None if !node.data.role_failed() => uncertain = true,
                None => {}
            }
        }
    }

    /// The object and D-Bus call a frontier call goes to.
    fn target(&self, index: usize, call: Call) -> (&ObjRef, Field) {
        let node = &self.nodes[index];
        let cell = || {
            node.sampling
                .as_ref()
                .and_then(|s| s.cell.as_ref())
                .expect("a cell call has a cell")
        };
        match call {
            Call::Own(field) => (&node.obj, field),
            Call::TableExtents => (&node.obj, Field::Extents),
            Call::HitTest(x, y) => (&node.obj, Field::AtPoint(x, y)),
            Call::CellRole => (cell(), Field::Role),
            Call::CellState => (cell(), Field::State),
            Call::CellExtents => (cell(), Field::Extents),
        }
    }

    fn on_reply(&mut self, token: u32, result: CallResult) {
        let Some((index, call)) = self.tokens.remove(&token) else {
            return;
        };
        let node = &mut self.nodes[index];
        match call {
            Call::Own(field) => node.data.store(field, &result),
            scan_call => {
                let sampling = node.sampling.as_mut().expect("a scan reply belongs to a scan");
                sampling.outstanding -= 1;
                let progress = match scan_call {
                    Call::TableExtents => Some(sampling.sampler.table_extents(&result)),
                    Call::HitTest(..) => {
                        self.hit_tests += 1;
                        Some(sampling.sampler.hit(&result))
                    }
                    Call::CellRole => sampling.sampler.cell_role(result),
                    Call::CellState => sampling.sampler.cell_state(result),
                    Call::CellExtents => sampling.sampler.cell_extents(result),
                    Call::Own(_) => unreachable!("matched above"),
                };
                if let Some(progress) = progress {
                    sampling.apply(progress);
                }
            }
        }
        self.settle(index);
    }

    /// The node's children once they are final: none for a leaf; the sampled cells (leaves) of a table that
    /// samples, or its listed children when sampling failed; else `GetChildren`'s.
    fn child_refs(node: &Pending) -> Option<(Vec<ObjRef>, bool)> {
        if node.leaf {
            return Some((Vec::new(), false));
        }
        let role = node.data.role()?;
        if role == "table" {
            node.data.child_count.as_ref()?;
            if node.data.samples(false) {
                match &node.sampling.as_ref()?.outcome {
                    Some(Ok(cells)) => return Some((cells.clone(), true)),
                    Some(Err(_)) => {}
                    None => return None,
                }
            }
        }
        node.data.children.clone().map(|children| (children, false))
    }

    /// Expands a node once its children are final, and marks it done once complete.
    fn settle(&mut self, index: usize) {
        let node = &self.nodes[index];
        if node.children.is_none()
            && !node.data.role_failed()
            && let Some((refs, leaves)) = Self::child_refs(node)
        {
            let depth = node.depth + 1;
            let ids: Vec<usize> = if depth > MAX_DEPTH {
                Vec::new()
            } else {
                refs.into_iter()
                    .map(|r| self.add(r, depth, Some(index), leaves))
                    .collect()
            };
            let node = &mut self.nodes[index];
            node.open_children = ids.len() as u32;
            node.children = Some(ids);
        }
        let node = &mut self.nodes[index];
        if !node.done && node.data.complete(node.leaf) && (node.children.is_some() || node.data.role_failed()) {
            node.done = true;
            self.finish(index);
        }
    }

    /// Marks finished subtrees up the chain of parents.
    fn finish(&mut self, mut index: usize) {
        loop {
            let node = &mut self.nodes[index];
            let leaf_like = node.data.role_failed();
            if !node.done || node.subtree_done || !(leaf_like || (node.children.is_some() && node.open_children == 0)) {
                return;
            }
            node.subtree_done = true;
            node.size += 1;
            node.speculative_size += node.speculative as u32;
            let (size, speculative_size) = (node.size, node.speculative_size);
            let Some(parent) = node.parent else { return };
            let parent_node = &mut self.nodes[parent];
            parent_node.open_children -= 1;
            parent_node.size += size;
            parent_node.speculative_size += speculative_size;
            index = parent;
        }
    }

    /// The vendor's admission over the finished data: preorder, one counter, the limits.
    fn build(&mut self) -> (Option<AxNode>, ReadStats) {
        let mut stats = ReadStats {
            discovered: self.nodes.len(),
            hit_tests: self.hit_tests,
            ..Default::default()
        };
        let mut admitted = vec![false; self.nodes.len()];
        let mut counter = 0;
        let tree = self.build_node(0, &mut counter, &mut admitted);
        stats.admitted = counter;
        for (i, node) in self.nodes.iter().enumerate() {
            stats.wasted_calls += match (admitted[i], node.data.role_failed()) {
                (false, _) => node.calls as u64,
                (true, true) => node.calls.saturating_sub(1) as u64,
                (true, false) => 0,
            };
            if admitted[i]
                && let Some(sampling) = &node.sampling
            {
                match sampling.outcome {
                    Some(Ok(_)) => stats.tables_sampled += 1,
                    _ => stats.tables_listed += 1,
                }
            }
        }
        (tree, stats)
    }

    fn build_node(&mut self, index: usize, counter: &mut u32, admitted: &mut [bool]) -> Option<AxNode> {
        if *counter >= NODE_LIMIT {
            return None;
        }
        *counter += 1;
        admitted[index] = true;
        debug_assert!(self.nodes[index].done, "an admitted node is complete");
        self.nodes[index].data.role()?;
        let children: Vec<AxNode> = self.nodes[index]
            .children
            .clone()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|c| self.build_node(c, counter, admitted))
            .collect();
        let node = &mut self.nodes[index];
        let data = std::mem::take(&mut node.data);
        Some(data.into_node(&node.obj, children, node.leaf))
    }
}

/// Reads the tree under `root` (behaviour §5.1–5.4): None when the root's own `GetRoleName` fails.
pub fn read<T: Transport>(t: &mut T, root: &ObjRef, window: Window) -> Result<(Option<AxNode>, ReadStats)> {
    let mut frontier = Frontier::new(root);
    let mut batch = Vec::new();
    loop {
        let room = room(t.in_flight(), t.staged_bytes(), window);
        if room > 0 {
            batch.clear();
            frontier.scan(room, window.slack, &mut batch);
            for &(index, call) in &batch {
                let (obj, field) = frontier.target(index, call);
                let token = t.send(obj, field)?;
                frontier.tokens.insert(token, (index, call));
            }
        }
        if t.in_flight() == 0 {
            break;
        }
        let (token, result) = t.recv()?;
        frontier.on_reply(token, result);
        while let Some((token, result)) = t.try_recv()? {
            frontier.on_reply(token, result);
        }
    }
    Ok(frontier.build())
}

#[cfg(test)]
pub(crate) mod tests;
