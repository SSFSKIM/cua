//! `clipboard_read` and `clipboard_release` (behaviour §13.1): the application's Copy, then the snapshot under a
//! handle, holding the display's clipboard lock from before the Copy (which changes CLIPBOARD's owner) through the
//! snapshot (Design, The clipboard lock). The application's copy stays on CLIPBOARD, as the vendor leaves it.

use anyhow::{Result, anyhow, bail};
use serde_json::{Value, json};

use super::Engine;
use crate::atspi::{self, Association};
use crate::clipboard::{COPY_WAIT, Clipboard};
use crate::copy;
use crate::wire::{ClipboardReleaseInput, WindowInput, parse_input};

impl Engine {
    /// The clipboard's connection, opened on first use.
    fn clipboard(&mut self) -> Result<&mut Clipboard> {
        if self.clipboard.is_none() {
            self.clipboard = Some(Clipboard::connect()?);
        }
        Ok(self.clipboard.as_mut().expect("connected above"))
    }

    pub(super) fn clipboard_read(&mut self, input: Option<Value>) -> Result<Value> {
        self.handles.check_room()?;
        let input: WindowInput = parse_input(input)?;
        let info = self.x.get_window(input.window.id)?;
        let clipboard = self.clipboard()?;
        let lock = clipboard.lock()?;
        let before = clipboard.generation()?;
        let copied = self.with_bus(|bus, x| {
            let frame = match atspi::associate(bus, x, &info)? {
                Association::Frame(frame) => frame,
                Association::NoMatch => return Ok(Err("window has no AT-SPI accessibility tree".to_string())),
                Association::Refused(sentence) => return Ok(Err(sentence)),
            };
            let Some(focused) = copy::focused(bus, &frame)? else {
                return Ok(Err(format!("window {} has no focused element to Copy from", info.id)));
            };
            copy::copy(bus, &focused)
        });
        copied?.map_err(anyhow::Error::msg)?;
        let clipboard = self
            .clipboard
            .as_mut()
            .ok_or_else(|| anyhow!("clipboard connection is gone"))?;
        if !clipboard.wait_for_change(before, COPY_WAIT)? {
            bail!("clipboard update timed out");
        }
        if clipboard.owner_window()? == x11rb::NONE {
            bail!("Copy cleared the clipboard");
        }
        let snapshot = clipboard.snapshot()?;
        if snapshot.is_empty() {
            bail!("clipboard has no readable data formats");
        }
        let handle = self.handles.store(snapshot)?;
        drop(lock);
        Ok(json!(handle))
    }

    /// Frees a handle; an unknown or released one answers success too. No lock: it touches no clipboard.
    pub(super) fn clipboard_release(&mut self, input: Option<Value>) -> Result<Value> {
        let input: ClipboardReleaseInput = parse_input(input)?;
        self.handles.release(&input.handle);
        Ok(Value::Null)
    }
}
