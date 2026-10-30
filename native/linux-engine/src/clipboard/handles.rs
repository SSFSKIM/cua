//! Clipboard handles (behaviour §13.1): `clipboard_read`'s snapshots kept by the engine under an opaque name until
//! `clipboard_release` frees them or the engine exits. The vendor's format, limits and sentences.

use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Result, bail};

use super::serving::Payload;

/// At most this many handles at once.
pub const MAX_HANDLES: usize = 32;
/// At most this many bytes across every stored snapshot.
pub const MAX_STORED_BYTES: usize = 256 << 20;

pub struct Handles {
    /// `<pid>-<nanoseconds since the epoch when the store was made>`.
    prefix: String,
    /// The last handle's number; the first is 1.
    count: u64,
    stored: BTreeMap<String, Arc<Payload>>,
    bytes: usize,
}

impl Handles {
    pub fn new() -> Handles {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        Handles::with_prefix(format!("{}-{nanos}", std::process::id()))
    }

    fn with_prefix(prefix: String) -> Handles {
        Handles {
            prefix,
            count: 0,
            stored: BTreeMap::new(),
            bytes: 0,
        }
    }

    /// `clipboard_read`'s first check, before anything else.
    pub fn check_room(&self) -> Result<()> {
        if self.stored.len() >= MAX_HANDLES {
            bail!("too many clipboard handles; release unused handles");
        }
        Ok(())
    }

    /// Stores a snapshot and names it.
    pub fn store(&mut self, snapshot: Payload) -> Result<String> {
        self.check_room()?;
        let bytes = snapshot.bytes();
        if self.bytes + bytes > MAX_STORED_BYTES {
            bail!("clipboard handle storage is full; release unused handles");
        }
        self.count += 1;
        let handle = format!("{}-{}", self.prefix, self.count);
        self.stored.insert(handle.clone(), Arc::new(snapshot));
        self.bytes += bytes;
        Ok(handle)
    }

    pub fn get(&self, handle: &str) -> Option<Arc<Payload>> {
        self.stored.get(handle).cloned()
    }

    /// Frees a handle; an unknown or already released one is no error ("releasing the same handle again has no
    /// effect", R/A §1.3).
    pub fn release(&mut self, handle: &str) {
        if let Some(snapshot) = self.stored.remove(handle) {
            self.bytes -= snapshot.bytes();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::serving::Format;
    use super::*;

    fn snapshot(bytes: usize) -> Payload {
        Payload::snapshot(vec![Format {
            target: 300,
            kind: 300,
            format: 8,
            data: Arc::from(vec![b'x'; bytes]),
        }])
    }

    #[test]
    fn handles_are_named_as_the_vendor_names_them() {
        let mut handles = Handles::new();
        let first = handles.store(snapshot(3)).unwrap();
        let second = handles.store(snapshot(3)).unwrap();
        let parts: Vec<&str> = first.split('-').collect();
        assert_eq!(parts.len(), 3, "{first}");
        assert_eq!(parts[0], std::process::id().to_string());
        assert!(parts[1].parse::<u128>().is_ok(), "{first}");
        assert_eq!(parts[2], "1");
        assert_eq!(second, format!("{}-{}-2", parts[0], parts[1]));
        assert_eq!(handles.get(&first).unwrap().bytes(), 3);
    }

    #[test]
    fn at_most_32_handles_are_kept() {
        let mut handles = Handles::with_prefix("1-2".into());
        for _ in 0..MAX_HANDLES {
            handles.store(snapshot(1)).unwrap();
        }
        let sentence = "too many clipboard handles; release unused handles";
        assert_eq!(handles.check_room().unwrap_err().to_string(), sentence);
        assert_eq!(handles.store(snapshot(1)).unwrap_err().to_string(), sentence);
        handles.release("1-2-5");
        handles.check_room().unwrap();
        assert_eq!(
            handles.store(snapshot(1)).unwrap(),
            "1-2-33",
            "numbers are never reused"
        );
    }

    #[test]
    fn at_most_256_mib_are_stored_and_a_release_frees_its_bytes() {
        let mut handles = Handles::with_prefix("1-2".into());
        let big = handles.store(snapshot(MAX_STORED_BYTES - 10)).unwrap();
        assert_eq!(
            handles.store(snapshot(11)).unwrap_err().to_string(),
            "clipboard handle storage is full; release unused handles"
        );
        handles.store(snapshot(10)).unwrap();
        handles.release(&big);
        handles.store(snapshot(11)).unwrap();
    }

    #[test]
    fn releasing_an_unknown_or_released_handle_does_nothing() {
        let mut handles = Handles::with_prefix("1-2".into());
        let h = handles.store(snapshot(4)).unwrap();
        handles.release(&h);
        handles.release(&h);
        handles.release("no-such-handle");
        assert!(handles.get(&h).is_none());
        assert_eq!(handles.bytes, 0);
    }
}
