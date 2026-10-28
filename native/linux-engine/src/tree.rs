//! The tree read (behaviour §5; Design, Observation): the vendor's per-element calls for the vendor's field set,
//! admitted by the vendor's preorder with one shared counter (5,000 nodes, depths 0–63). Stub for the RED step.

use anyhow::Result;
use serde::Serialize;

use crate::dbus::{Arg, CallResult, MethodCall, Value};

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

/// Fields known before the read, from the `Cache.GetItems` experiment; a seeded field is not called for.
#[derive(Debug, Default, Clone)]
pub struct Seed {
    pub nodes: std::collections::HashMap<ObjRef, SeedNode>,
}

#[derive(Debug, Default, Clone)]
pub struct SeedNode {
    pub role: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub states: Option<Vec<&'static str>>,
    pub has_action: Option<bool>,
    pub children: Option<Vec<ObjRef>>,
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

#[derive(Debug, Default, Clone, PartialEq)]
pub struct ReadStats {
    pub admitted: u32,
    pub discovered: usize,
    pub wasted_calls: u64,
    pub large_tables: u32,
}

// ---------------------------------------------------------------------------------------------------------------
// The calls, and what each reply means (behaviour §5.1)

const ACCESSIBLE: &str = "org.a11y.atspi.Accessible";
const PROPERTIES: &str = "org.freedesktop.DBus.Properties";
pub const ACTION: &str = "org.a11y.atspi.Action";

/// The D-Bus call for `field` of `obj`, handed to `with`.
pub fn with_call<R>(obj: &ObjRef, field: Field, with: impl FnOnce(&MethodCall) -> R) -> R {
    let index;
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
    };
    with(&MethodCall {
        dest: &obj.bus,
        path: &obj.path,
        iface,
        member,
        args,
    })
}

fn needs_text(role: &str) -> bool {
    role == "text" || role == "entry"
}

/// `GetRoleName`: the string verbatim, `unknown` when the reply is not a string; a failure drops the node.
fn role_of(result: &CallResult) -> Option<String> {
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

fn states_of(result: &CallResult) -> Option<Vec<&'static str>> {
    match result.as_ref().ok()?.first()? {
        Value::Array(words) => decode_states(words),
        _ => None,
    }
}

/// `GetInterfaces`: whether Action is among them; None when the call fails or is not an array.
fn has_action_of(result: &CallResult) -> Option<bool> {
    match result.as_ref().ok()?.first()? {
        Value::Array(items) => Some(items.iter().any(|i| i.as_str() == Some(ACTION))),
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

fn child_count_of(result: &CallResult) -> Option<i32> {
    match result.as_ref().ok()?.first()?.unvariant() {
        Value::I32(n) => Some(*n),
        _ => None,
    }
}

/// `GetChildren`: the `(string, object path)` pairs in reply order; `[]` when it fails or is not an array.
fn children_of(result: &CallResult) -> Vec<ObjRef> {
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
    has_action: Option<Option<bool>>,
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
            Field::Interfaces => self.has_action = Some(has_action_of(result)),
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
        }
    }

    fn role(&self) -> Option<&str> {
        self.role.as_ref()?.as_deref()
    }

    fn role_failed(&self) -> bool {
        matches!(self.role, Some(None))
    }

    /// Every field the vendor reads for this node has its answer.
    fn complete(&self) -> bool {
        let Some(role) = &self.role else { return false };
        let Some(role) = role else { return true };
        let actions_done = match self.has_action {
            None => false,
            Some(Some(true)) => match self.nactions {
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
            && (!needs_text(role) || self.text.is_some())
            && (role != "table" || self.child_count.is_some())
            && self.children.is_some()
    }

    /// The `actions` key: omitted without Action, `[]` for none, and omitted whole when any read failed.
    fn actions(&self) -> Option<Vec<String>> {
        if self.has_action != Some(Some(true)) {
            return None;
        }
        self.nactions??;
        self.action_names.iter().map(|n| n.clone().flatten()).collect()
    }

    fn into_node(self, obj: &ObjRef, children: Vec<AxNode>, stats: &mut ReadStats) -> AxNode {
        let role = self.role.clone().flatten().unwrap_or_default();
        if role == "table" && matches!(self.child_count, Some(Some(n)) if n > NODE_LIMIT as i32) {
            // The vendor samples the visible cells of such a table (behaviour §5.4); the spike lists children.
            stats.large_tables += 1;
        }
        AxNode {
            actions: self.actions(),
            children,
            description: self.description.flatten(),
            id: format!("{}:{}", obj.bus, obj.path),
            name: self.name.flatten(),
            value: if needs_text(&role) { self.text.flatten() } else { None },
            states: self.states.flatten(),
            role,
        }
    }
}

// ---------------------------------------------------------------------------------------------------------------
// The sequential read: the vendor's calls one by one, in the vendor's order

fn call<T: Transport>(t: &mut T, obj: &ObjRef, field: Field) -> Result<CallResult> {
    let token = t.send(obj, field)?;
    loop {
        let (got, result) = t.recv()?;
        if got == token {
            return Ok(result);
        }
    }
}

pub fn read_sequential<T: Transport>(t: &mut T, root: &ObjRef) -> Result<(Option<AxNode>, ReadStats)> {
    let mut stats = ReadStats::default();
    let mut counter = 0;
    let tree = visit_sequential(t, root, 0, &mut counter, &mut stats)?;
    stats.admitted = counter;
    stats.discovered = counter as usize;
    Ok((tree, stats))
}

fn visit_sequential<T: Transport>(
    t: &mut T,
    obj: &ObjRef,
    depth: u32,
    counter: &mut u32,
    stats: &mut ReadStats,
) -> Result<Option<AxNode>> {
    if *counter >= NODE_LIMIT || depth > MAX_DEPTH {
        return Ok(None);
    }
    *counter += 1;
    let mut data = Data::default();
    data.store(Field::Role, &call(t, obj, Field::Role)?);
    let Some(role) = data.role().map(str::to_string) else {
        return Ok(None);
    };
    for field in [Field::Name, Field::Description] {
        data.store(field, &call(t, obj, field)?);
    }
    if needs_text(&role) {
        data.store(Field::Text, &call(t, obj, Field::Text)?);
    }
    for field in [Field::State, Field::Interfaces] {
        data.store(field, &call(t, obj, field)?);
    }
    if data.has_action == Some(Some(true)) {
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
    if role == "table" {
        data.store(Field::ChildCount, &call(t, obj, Field::ChildCount)?);
    }
    data.store(Field::Children, &call(t, obj, Field::Children)?);
    let mut children = Vec::new();
    for child in data.children.clone().unwrap_or_default() {
        if let Some(node) = visit_sequential(t, &child, depth + 1, counter, stats)? {
            children.push(node);
        }
    }
    Ok(Some(data.into_node(obj, children, stats)))
}

// ---------------------------------------------------------------------------------------------------------------
// The frontier read: the same calls, many in flight, along the preorder frontier inside the admission window

/// How many more calls the window allows: at most `calls` in flight, and a new call only while the reply bytes
/// received and not consumed plus `reservation` per call in flight are under `bytes` (Design, Observation).
fn room(in_flight: usize, staged: usize, window: Window) -> usize {
    if in_flight >= window.calls || staged >= window.bytes {
        return 0;
    }
    let by_bytes = (window.bytes - staged).div_ceil(window.reservation.max(1));
    window.calls.min(by_bytes).saturating_sub(in_flight)
}

const ALWAYS: [Field; 6] = [
    Field::Role,
    Field::Children,
    Field::Interfaces,
    Field::Name,
    Field::Description,
    Field::State,
];

struct Pending {
    obj: ObjRef,
    depth: u32,
    parent: Option<usize>,
    data: Data,
    /// Fields of `ALWAYS`, Text, NActions and ChildCount issued, as bits; action names issued, as a count.
    issued: u16,
    names_issued: u32,
    calls: u32,
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
        Field::ActionName(_) => 0,
    }
}

struct Frontier {
    nodes: Vec<Pending>,
    seed: Seed,
    tokens: std::collections::HashMap<u32, (usize, Field)>,
}

impl Frontier {
    fn new(root: &ObjRef, seed: Seed) -> Self {
        let mut f = Frontier {
            nodes: Vec::new(),
            seed,
            tokens: Default::default(),
        };
        f.add(root.clone(), 0, None);
        f.settle(0);
        f
    }

    fn add(&mut self, obj: ObjRef, depth: u32, parent: Option<usize>) -> usize {
        let mut data = Data::default();
        let mut issued = 0;
        if let Some(seeded) = self.seed.nodes.get(&obj) {
            if let Some(role) = &seeded.role {
                data.role = Some(Some(role.clone()));
                issued |= bit(Field::Role);
            }
            data.name = Some(seeded.name.clone());
            data.description = Some(seeded.description.clone());
            issued |= bit(Field::Name) | bit(Field::Description);
            if seeded.states.is_some() {
                data.states = Some(seeded.states.clone());
                issued |= bit(Field::State);
            }
            if let Some(has_action) = seeded.has_action {
                data.has_action = Some(Some(has_action));
                issued |= bit(Field::Interfaces);
            }
            if let Some(children) = &seeded.children {
                data.children = Some(children.clone());
                issued |= bit(Field::Children);
            }
        }
        self.nodes.push(Pending {
            obj,
            depth,
            parent,
            data,
            issued,
            names_issued: 0,
            calls: 0,
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
    fn ready(node: &Pending, out: &mut Vec<Field>) {
        if node.data.role_failed() {
            return;
        }
        for field in ALWAYS {
            if node.issued & bit(field) == 0 {
                out.push(field);
            }
        }
        if let Some(role) = node.data.role() {
            if needs_text(role) && node.issued & bit(Field::Text) == 0 {
                out.push(Field::Text);
            }
            if role == "table" && node.issued & bit(Field::ChildCount) == 0 {
                out.push(Field::ChildCount);
            }
        }
        if node.data.has_action == Some(Some(true)) && node.issued & bit(Field::NActions) == 0 {
            out.push(Field::NActions);
        }
        if let Some(Some(n)) = node.data.nactions {
            out.extend((node.names_issued..n).map(Field::ActionName));
        }
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
    fn scan(&mut self, max: usize, slack: u32, out: &mut Vec<(usize, Field)>) {
        let mut count = 0u32;
        let mut uncertain = false;
        let mut speculative_before = 0u32;
        let mut stack = vec![0usize];
        let mut fields = Vec::new();
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
            count += 1;
            if node.speculative && uncertain {
                speculative_before += 1;
            }
            if node.calls > 0 || !uncertain || speculative_before < slack {
                fields.clear();
                Self::ready(node, &mut fields);
                for &field in &fields {
                    if out.len() == max {
                        return;
                    }
                    out.push((index, field));
                    let node = &mut self.nodes[index];
                    if node.calls == 0 && uncertain {
                        node.speculative = true;
                        speculative_before += 1;
                    }
                    node.calls += 1;
                    match field {
                        Field::ActionName(_) => node.names_issued += 1,
                        other => node.issued |= bit(other),
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

    fn on_reply(&mut self, token: u32, result: CallResult) {
        let Some((index, field)) = self.tokens.remove(&token) else {
            return;
        };
        self.nodes[index].data.store(field, &result);
        self.settle(index);
    }

    /// Expands a node once its role and children are known, and marks it done once complete; seeded children
    /// may settle in turn.
    fn settle(&mut self, index: usize) {
        let mut work = vec![index];
        while let Some(index) = work.pop() {
            let node = &self.nodes[index];
            if node.children.is_none() && node.data.role().is_some() && node.data.children.is_some() {
                let refs = node.data.children.clone().unwrap_or_default();
                let depth = node.depth + 1;
                let ids: Vec<usize> = if depth > MAX_DEPTH {
                    Vec::new()
                } else {
                    refs.into_iter().map(|r| self.add(r, depth, Some(index))).collect()
                };
                work.extend(ids.iter().copied());
                let node = &mut self.nodes[index];
                node.open_children = ids.len() as u32;
                node.children = Some(ids);
            }
            let node = &mut self.nodes[index];
            if !node.done && node.data.complete() {
                node.done = true;
                self.finish(index);
            }
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
            ..Default::default()
        };
        let mut admitted = vec![false; self.nodes.len()];
        let mut counter = 0;
        let tree = self.build_node(0, &mut counter, &mut admitted, &mut stats);
        stats.admitted = counter;
        for (i, node) in self.nodes.iter().enumerate() {
            stats.wasted_calls += match (admitted[i], node.data.role_failed()) {
                (false, _) => node.calls as u64,
                (true, true) => node.calls.saturating_sub(1) as u64,
                (true, false) => 0,
            };
        }
        (tree, stats)
    }

    fn build_node(
        &mut self,
        index: usize,
        counter: &mut u32,
        admitted: &mut [bool],
        stats: &mut ReadStats,
    ) -> Option<AxNode> {
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
            .filter_map(|c| self.build_node(c, counter, admitted, stats))
            .collect();
        let node = &mut self.nodes[index];
        let data = std::mem::take(&mut node.data);
        Some(data.into_node(&node.obj, children, stats))
    }
}

pub fn read_frontier<T: Transport>(t: &mut T, root: &ObjRef, window: Window) -> Result<(Option<AxNode>, ReadStats)> {
    read_seeded(t, root, window, Seed::default())
}

/// The frontier read with some fields already known (the `cache` variant).
pub fn read_seeded<T: Transport>(
    t: &mut T,
    root: &ObjRef,
    window: Window,
    seed: Seed,
) -> Result<(Option<AxNode>, ReadStats)> {
    let mut frontier = Frontier::new(root, seed);
    let mut batch = Vec::new();
    loop {
        let room = room(t.in_flight(), t.staged_bytes(), window);
        if room > 0 {
            batch.clear();
            frontier.scan(room, window.slack, &mut batch);
            for &(index, field) in &batch {
                let token = t.send(&frontier.nodes[index].obj, field)?;
                frontier.tokens.insert(token, (index, field));
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
mod tests {
    use super::*;
    use std::collections::{HashMap, VecDeque};

    /// One fake accessible object.
    #[derive(Clone, Default)]
    struct Fake {
        role: Option<&'static str>,
        name: Option<String>,
        text: Option<String>,
        states: [u32; 2],
        actions: Option<Vec<&'static str>>,
        children: Vec<String>,
        child_count: i32,
    }

    /// A fake bus: a reply becomes available only when the engine waits, and a wait answers everything sent
    /// before it (one round trip). It checks the window's bounds at every send.
    struct FakeBus {
        objects: HashMap<String, Fake>,
        next: u32,
        sent: VecDeque<(u32, String, Field)>,
        ready: VecDeque<(u32, CallResult, usize)>,
        window: Window,
        calls: Vec<(String, Field)>,
        waits: u64,
        max_in_flight: usize,
        violations: u32,
    }

    impl FakeBus {
        fn new(objects: HashMap<String, Fake>, window: Window) -> Self {
            FakeBus {
                objects,
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
                        i.push(s("org.a11y.atspi.Action"));
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
            })
        }

        fn size(result: &CallResult) -> usize {
            match result {
                Ok(values) => {
                    values
                        .iter()
                        .map(|v| match v {
                            Value::Str(s) => s.len(),
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

    const WINDOW: Window = Window {
        calls: 64,
        bytes: 4 << 20,
        reservation: 4 << 10,
        slack: 16,
    };
    const SHOWING: [u32; 2] = [(1 << 8) | (1 << 24) | (1 << 25) | (1 << 30), 0];

    fn root() -> ObjRef {
        ObjRef {
            bus: ":1.2".into(),
            path: "/0".into(),
        }
    }

    /// A tree with text and entry nodes, actions, a table and a node whose role fails.
    fn mixed() -> HashMap<String, Fake> {
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

    #[test]
    fn the_query_keeps_matches_and_their_ancestors_only() {
        let mut bus = FakeBus::new(mixed(), WINDOW);
        let tree = read_frontier(&mut bus, &root(), WINDOW).unwrap().0.unwrap();
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
    fn seeded_fields_are_not_called_for_and_give_the_same_tree() {
        let objects = uniform(4, 2);
        let mut seq = FakeBus::new(objects.clone(), Window { calls: 1, ..WINDOW });
        let (expected, _) = read_sequential(&mut seq, &root()).unwrap();
        let mut seed = Seed::default();
        for (path, fake) in &objects {
            let children = fake
                .children
                .iter()
                .map(|c| ObjRef {
                    bus: ":1.2".into(),
                    path: c.clone(),
                })
                .collect();
            seed.nodes.insert(
                ObjRef {
                    bus: ":1.2".into(),
                    path: path.clone(),
                },
                SeedNode {
                    role: fake.role.map(str::to_string),
                    name: fake.name.clone(),
                    description: None,
                    states: decode_states(&[Value::U32(fake.states[0]), Value::U32(fake.states[1])]),
                    has_action: Some(false),
                    children: Some(children),
                },
            );
        }
        let mut bus = FakeBus::new(objects, WINDOW);
        let (got, _) = read_seeded(&mut bus, &root(), WINDOW, seed).unwrap();
        assert_eq!(got, expected);
        assert!(
            bus.calls.iter().all(|(_, f)| *f == Field::Text),
            "only the text roles' GetText remains: {:?}",
            bus.calls
        );
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
    fn sequential_reads_the_vendor_fields_and_calls() {
        let mut bus = FakeBus::new(mixed(), Window { calls: 1, ..WINDOW });
        let (tree, stats) = read_sequential(&mut bus, &root()).unwrap();
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
            "a table cell gets no text"
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
        // the vendor's order for one node, and no calls after a failed GetRoleName
        let first: Vec<Field> = bus.calls.iter().filter(|(p, _)| p == "/2").map(|(_, f)| *f).collect();
        assert_eq!(
            first,
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
        let failed: Vec<Field> = bus.calls.iter().filter(|(p, _)| p == "/3").map(|(_, f)| *f).collect();
        assert_eq!(failed, vec![Field::Role]);
        let table: Vec<Field> = bus.calls.iter().filter(|(p, _)| p == "/4").map(|(_, f)| *f).collect();
        assert_eq!(
            table,
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
        assert_eq!(bus.waits as usize, bus.calls.len(), "one wait per call");
    }

    #[test]
    fn frontier_returns_the_sequential_tree_with_the_same_calls_and_far_fewer_waits() {
        let objects = uniform(6, 3); // 259 nodes
        let mut seq = FakeBus::new(objects.clone(), Window { calls: 1, ..WINDOW });
        let (expected, _) = read_sequential(&mut seq, &root()).unwrap();
        let mut bus = FakeBus::new(objects, WINDOW);
        let (got, stats) = read_frontier(&mut bus, &root(), WINDOW).unwrap();
        assert_eq!(got, expected);
        assert_eq!(
            sorted_calls(bus.calls.clone()),
            sorted_calls(seq.calls.clone()),
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
            bus.waits * 20 < seq.waits,
            "frontier waits {} vs sequential {}",
            bus.waits,
            seq.waits
        );
    }

    #[test]
    fn frontier_matches_sequential_on_failures_tables_and_actions() {
        let mut seq = FakeBus::new(mixed(), Window { calls: 1, ..WINDOW });
        let (expected, _) = read_sequential(&mut seq, &root()).unwrap();
        for calls in [1, 2, 3, 7, 64] {
            let window = Window { calls, ..WINDOW };
            let mut bus = FakeBus::new(mixed(), window);
            let (got, _) = read_frontier(&mut bus, &root(), window).unwrap();
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
        let mut seq = FakeBus::new(objects.clone(), Window { calls: 1, ..WINDOW });
        let (expected, _) = read_sequential(&mut seq, &root()).unwrap();
        assert_eq!(count(expected.as_ref().unwrap()), 64);
        let mut bus = FakeBus::new(objects, WINDOW);
        let (got, _) = read_frontier(&mut bus, &root(), WINDOW).unwrap();
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
        assert_eq!(read_frontier(&mut bus, &root(), WINDOW).unwrap().0, None);
        let mut seq = FakeBus::new(objects, WINDOW);
        assert_eq!(read_sequential(&mut seq, &root()).unwrap().0, None);
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
        let mut seq = FakeBus::new(objects.clone(), Window { calls: 1, ..WINDOW });
        let (expected, _) = read_sequential(&mut seq, &root()).unwrap();
        let expected = expected.unwrap();
        assert_eq!(count(&expected), 5000);
        let mut bus = FakeBus::new(objects, WINDOW);
        let (got, stats) = read_frontier(&mut bus, &root(), WINDOW).unwrap();
        let got = got.unwrap();
        let (mut a, mut b) = (vec![], vec![]);
        ids(&expected, &mut a);
        ids(&got, &mut b);
        assert_eq!(a, b, "the retained native ids are the vendor's exactly");
        assert_eq!(got, expected);
        assert_eq!(stats.admitted, 5000);
        let extra = bus.calls.len() as i64 - seq.calls.len() as i64;
        assert!(
            extra >= 0 && extra as u64 == stats.wasted_calls,
            "extra {extra}, wasted {}",
            stats.wasted_calls
        );
        // Measured on this shape: W 16 wastes 66 calls, W 64 354, W 256 630 (slack 16); M0.3 fixes the bound.
        assert!(
            stats.wasted_calls <= 8 * WINDOW.calls as u64,
            "wasted {} calls",
            stats.wasted_calls
        );
        assert_eq!(bus.violations, 0);
        assert!(
            bus.waits * 10 < seq.waits,
            "frontier waits {} vs sequential {}",
            bus.waits,
            seq.waits
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
        let mut seq = FakeBus::new(objects.clone(), Window { calls: 1, ..WINDOW });
        let (expected, _) = read_sequential(&mut seq, &root()).unwrap();
        let mut bus = FakeBus::new(objects, WINDOW);
        let (got, stats) = read_frontier(&mut bus, &root(), WINDOW).unwrap();
        assert_eq!(got, expected);
        assert_eq!(stats.wasted_calls, 0);
        assert!(
            bus.waits * 30 < seq.waits,
            "frontier waits {} vs sequential {}",
            bus.waits,
            seq.waits
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
        let mut seq = FakeBus::new(objects.clone(), Window { calls: 1, ..WINDOW });
        let (expected, _) = read_sequential(&mut seq, &root()).unwrap();
        let mut bus = FakeBus::new(objects, WINDOW);
        let (got, stats) = read_frontier(&mut bus, &root(), WINDOW).unwrap();
        assert_eq!(got, expected);
        assert_eq!(count(got.as_ref().unwrap()), 5000);
        assert_eq!(stats.wasted_calls, 0);
        assert_eq!(bus.calls.len(), seq.calls.len());
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
            slack: 16,
        };
        let mut bus = FakeBus::new(objects.clone(), window);
        let (got, _) = read_frontier(&mut bus, &root(), window).unwrap();
        assert!(
            bus.max_in_flight <= 3,
            "R / reservation = 3 calls, got {}",
            bus.max_in_flight
        );
        assert_eq!(bus.violations, 0);
        let mut seq = FakeBus::new(objects.clone(), Window { calls: 1, ..WINDOW });
        let (expected, _) = read_sequential(&mut seq, &root()).unwrap();
        assert_eq!(got, expected);
        let cell = &got.unwrap().children[2].children[1];
        assert_eq!(
            cell.value.as_deref(),
            Some(big.as_str()),
            "the 4 MiB text is read exactly"
        );
        let mut bus = FakeBus::new(objects, WINDOW);
        let (got, _) = read_frontier(&mut bus, &root(), WINDOW).unwrap();
        assert_eq!(got, expected);
        assert_eq!(bus.violations, 0);
    }
}
