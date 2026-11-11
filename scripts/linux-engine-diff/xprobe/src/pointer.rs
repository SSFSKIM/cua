//! `xprobe pointer-chain` (#171 M4, T16's fix wave): where the real pointer is, and the windows it is over. It asks
//! `QueryPointer` of the root, then of each child the answer names, down to the deepest window holding the pointer, and
//! prints `{"x":…,"y":…,"same_screen":…,"chain":[…]}`: the pointer's root coordinates and the windows from the root's
//! child down (empty when the pointer is on the bare root). The harness's park (`park.mjs`) reads it after each move,
//! so a trial whose pointer is not where it was meant to be never counts. It only reads.

use x11rb::connection::Connection;
use x11rb::protocol::xproto::ConnectionExt as _;

use crate::Result;

/// Deeper than any window nests: a loop in a reply is not followed for ever.
const MAX_DEPTH: usize = 64;

pub fn pointer_chain(args: &[String]) -> Result<()> {
    if !args.is_empty() {
        return Err("usage: xprobe pointer-chain".into());
    }
    let (conn, screen) = crate::xconnect(None)?;
    let root = conn.setup().roots[screen].root;
    let first = conn.query_pointer(root)?.reply()?;
    let mut chain = Vec::new();
    let mut at = first.child;
    while at != x11rb::NONE && chain.len() < MAX_DEPTH {
        chain.push(at);
        at = conn.query_pointer(at)?.reply()?.child;
    }
    let ids: Vec<String> = chain.iter().map(u32::to_string).collect();
    println!(
        "{{\"x\":{},\"y\":{},\"same_screen\":{},\"chain\":[{}]}}",
        first.root_x,
        first.root_y,
        first.same_screen,
        ids.join(",")
    );
    Ok(())
}
