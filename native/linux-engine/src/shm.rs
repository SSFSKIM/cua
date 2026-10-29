//! The desktop screenshot through MIT-SHM (Design, Screenshots): the server writes the root's pixels into memory the
//! engine shares with it, instead of copying them through the connection. It is used only on a local display (a Unix
//! socket, so a descriptor can be passed) whose server answers `ShmQueryVersion` with descriptor passing (1.2); plain
//! `GetImage` otherwise, and from the first failure on. The pixels are the same request's either way.

use std::ffi::c_void;

use anyhow::{Result, bail};
use rustix::fs::{MemfdFlags, ftruncate, memfd_create};
use rustix::mm::{MapFlags, ProtFlags, mmap, munmap};
use x11rb::connection::Connection;
use x11rb::protocol::shm::ConnectionExt as _;
use x11rb::protocol::xproto::{ImageFormat, Window};

/// Whether `DISPLAY` names a Unix-socket connection (`:N`, `unix:N`, a socket path), the only kind a descriptor can be
/// passed over; a host name or address is TCP, even when it is this machine.
pub fn is_local_display(display: Option<&str>) -> bool {
    let Some(display) = display else { return false };
    if display.starts_with('/') {
        return true;
    }
    let host = match display.rfind(':') {
        Some(at) => &display[..at],
        None => return false,
    };
    host.is_empty() || host == "unix"
}

/// `ShmAttachFd` is MIT-SHM 1.2.
pub fn passes_descriptors(major: u16, minor: u16) -> bool {
    (major, minor) >= (1, 2)
}

/// A segment the server writes into: a memfd mapped into the engine and attached to the connection.
struct Segment {
    seg: u32,
    ptr: *mut c_void,
    len: usize,
}

enum State {
    /// No desktop screenshot yet.
    Untried,
    /// A desktop screenshot was read with `GetImage`; the segment is made after its answer (`prepare`), so the
    /// engine's first screenshot costs what the vendor's does.
    Wanted {
        width: u16,
        height: u16,
    },
    Ready(Segment),
    /// Not a local display, no MIT-SHM 1.2, or a failure: `GetImage` from here on.
    Off,
}

/// The desktop screenshot's shared memory, for the engine's life.
pub struct Shm {
    state: State,
}

impl Shm {
    pub fn new() -> Shm {
        Shm { state: State::Untried }
    }

    /// The root's pixels (`width × height` ZPixmap, B,G,R,X) through the segment, or None when there is none (yet):
    /// the caller reads them with `GetImage`. A failure turns MIT-SHM off for the rest of the engine's life.
    pub fn read<C: Connection>(&mut self, conn: &C, root: Window, width: u16, height: u16) -> Option<&[u8]> {
        let needed = width as usize * height as usize * 4;
        match &self.state {
            State::Untried => {
                self.state = State::Wanted { width, height };
                return None;
            }
            State::Wanted { .. } | State::Off => return None,
            State::Ready(segment) if segment.len < needed => {
                // the root grew: a segment at the new size
                self.close(conn);
                self.state = Segment::new(conn, needed).map_or(State::Off, State::Ready);
            }
            State::Ready(_) => {}
        }
        let State::Ready(segment) = &self.state else {
            return None;
        };
        if segment.read(conn, root, width, height, needed).is_err() {
            self.close(conn);
            return None;
        }
        // SAFETY: the mapping is `segment.len >= needed` bytes, alive while the segment is, and the server finished
        // writing it before it answered the request.
        Some(unsafe { std::slice::from_raw_parts(segment.ptr as *const u8, needed) })
    }

    /// After a desktop screenshot's answer: the segment for the next one, where the display allows it.
    pub fn prepare<C: Connection>(&mut self, conn: &C) {
        let State::Wanted { width, height } = self.state else {
            return;
        };
        let local = is_local_display(std::env::var("DISPLAY").ok().as_deref());
        self.state = if local && Self::supported(conn) {
            Segment::new(conn, width as usize * height as usize * 4).map_or(State::Off, State::Ready)
        } else {
            State::Off
        };
    }

    fn supported<C: Connection>(conn: &C) -> bool {
        let present = conn
            .extension_information(x11rb::protocol::shm::X11_EXTENSION_NAME)
            .ok()
            .flatten()
            .is_some();
        present
            && conn
                .shm_query_version()
                .ok()
                .and_then(|c| c.reply().ok())
                .is_some_and(|v| passes_descriptors(v.major_version, v.minor_version))
    }

    /// Detaches and unmaps the segment; MIT-SHM stays off afterwards.
    pub fn close<C: Connection>(&mut self, conn: &C) {
        if let State::Ready(segment) = std::mem::replace(&mut self.state, State::Off) {
            segment.close(conn);
        }
    }
}

impl Segment {
    fn new<C: Connection>(conn: &C, len: usize) -> Result<Segment> {
        let fd = memfd_create("cua-engine-desktop", MemfdFlags::CLOEXEC)?;
        ftruncate(&fd, len as u64)?;
        // SAFETY: a new shared mapping of a descriptor this function owns, at an address the kernel chooses.
        let ptr = unsafe {
            mmap(
                std::ptr::null_mut(),
                len,
                ProtFlags::READ | ProtFlags::WRITE,
                MapFlags::SHARED,
                &fd,
                0,
            )?
        };
        let segment = Segment { seg: 0, ptr, len };
        let attached = (|| -> Result<u32> {
            let seg = conn.generate_id()?;
            conn.shm_attach_fd(seg, fd, false)?.check()?;
            Ok(seg)
        })();
        match attached {
            Ok(seg) => Ok(Segment { seg, ..segment }),
            Err(error) => {
                segment.unmap();
                Err(error)
            }
        }
    }

    fn read<C: Connection>(&self, conn: &C, root: Window, width: u16, height: u16, needed: usize) -> Result<()> {
        let reply = conn
            .shm_get_image(root, 0, 0, width, height, !0, ImageFormat::Z_PIXMAP.into(), self.seg, 0)?
            .reply()?;
        if (reply.size as usize) < needed {
            bail!("x11 screenshot {} bytes, expected at least {needed} bytes", reply.size);
        }
        Ok(())
    }

    fn close<C: Connection>(self, conn: &C) {
        let _ = conn.shm_detach(self.seg).map(|c| c.ignore_error());
        self.unmap();
    }

    fn unmap(self) {
        // SAFETY: the mapping this segment made, unmapped once (the segment is consumed).
        let _ = unsafe { munmap(self.ptr, self.len) };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_display_is_local_when_its_connection_is_a_unix_socket() {
        for display in [":0", ":0.0", ":12", "unix:0", "unix:3.1", "/tmp/.X11-unix/X0"] {
            assert!(is_local_display(Some(display)), "{display}");
        }
        for display in [
            "localhost:10.0",
            "127.0.0.1:0",
            "host.example:0",
            "[::1]:0",
            "tcp/host:0",
            "",
        ] {
            assert!(!is_local_display(Some(display)), "{display}");
        }
        assert!(!is_local_display(None), "no DISPLAY: x11rb cannot connect either");
    }

    #[test]
    fn the_server_must_pass_descriptors() {
        assert!(passes_descriptors(1, 2));
        assert!(passes_descriptors(2, 0));
        assert!(!passes_descriptors(1, 1));
        assert!(!passes_descriptors(0, 9));
    }

    /// The same pixels as `GetImage`: a window painted in four colours, the root read both ways. Needs an X display
    /// with MIT-SHM 1.2 (`xvfb-run -a cargo test --features live shm`).
    #[test]
    #[cfg_attr(not(feature = "live"), ignore = "needs an X display (--features live)")]
    fn shm_reads_the_root_exactly_as_get_image_does() {
        use x11rb::connection::Connection;
        use x11rb::protocol::xproto::{
            ChangeGCAux, ConnectionExt as _, CreateGCAux, CreateWindowAux, ImageFormat, Rectangle, WindowClass,
        };
        let (conn, screen) = x11rb::connect(None).unwrap();
        let root = conn.setup().roots[screen].root;
        let (width, height) = (
            conn.setup().roots[screen].width_in_pixels,
            conn.setup().roots[screen].height_in_pixels,
        );
        let window = conn.generate_id().unwrap();
        let aux = CreateWindowAux::new()
            .override_redirect(1)
            .background_pixel(0x00_10_20_30);
        conn.create_window(0, window, root, 10, 20, 200, 120, 0, WindowClass::INPUT_OUTPUT, 0, &aux)
            .unwrap()
            .check()
            .unwrap();
        conn.map_window(window).unwrap().check().unwrap();
        let gc = conn.generate_id().unwrap();
        conn.create_gc(gc, window, &CreateGCAux::new())
            .unwrap()
            .check()
            .unwrap();
        for (i, colour) in [0x00_ff_00_00u32, 0x00_00_ff_00, 0x00_00_00_ff, 0x00_ff_ff_ff]
            .into_iter()
            .enumerate()
        {
            conn.change_gc(gc, &ChangeGCAux::new().foreground(colour))
                .unwrap()
                .check()
                .unwrap();
            let rect = Rectangle {
                x: 50 * i as i16,
                y: 0,
                width: 50,
                height: 120,
            };
            conn.poly_fill_rectangle(window, gc, &[rect]).unwrap().check().unwrap();
        }
        conn.get_input_focus().unwrap().reply().unwrap();
        let plain = conn
            .get_image(ImageFormat::Z_PIXMAP, root, 0, 0, width, height, !0)
            .unwrap()
            .reply()
            .unwrap();
        let mut shm = Shm::new();
        assert!(
            shm.read(&conn, root, width, height).is_none(),
            "the first screenshot is GetImage's"
        );
        shm.prepare(&conn);
        let shared = shm
            .read(&conn, root, width, height)
            .expect("the display answers MIT-SHM 1.2")
            .to_vec();
        conn.destroy_window(window).unwrap().check().unwrap();
        let n = width as usize * height as usize * 4;
        assert_eq!(shared.len(), n);
        assert_eq!(&shared[..], &plain.data[..n]);
        // the window's red band, at (10, 20) on the root: B, G, R, X
        let at = (20 * width as usize + 10) * 4;
        assert_eq!(&shared[at..at + 3], &[0x00, 0x00, 0xff]);
        // a second read reuses the segment
        assert_eq!(shm.read(&conn, root, width, height).unwrap().len(), n);
        shm.close(&conn);
    }
}
