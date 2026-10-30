//! cua's own D-Bus client for the accessibility bus (behaviour §19).
//!
//! Address discovery (the root window's `AT_SPI_BUS` property, else `org.a11y.Bus.GetAddress` on the session bus)
//! lives in `atspi`, which owns the X connection it needs; this module is the wire: `EXTERNAL` authentication,
//! `Hello`, marshalling of the types AT-SPI uses, and serial-matched replies with any number of calls in flight.
//! Unlike the vendor's strictly synchronous client, a call is sent and its reply collected later; the tree read
//! decides how many are outstanding.

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::io::{ErrorKind, Read, Write};
use std::os::linux::net::SocketAddrExt;
use std::os::unix::net::UnixStream;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow, bail};

/// The vendor's limit for a message body or header array (behaviour §19).
pub const MAX_MESSAGE: usize = 16 * 1024 * 1024;
/// The vendor's socket timeouts; here, how long the bus may stay silent while calls are outstanding.
pub const IO_TIMEOUT: Duration = Duration::from_secs(2);

const METHOD_CALL: u8 = 1;
pub const METHOD_RETURN: u8 = 2;
pub const ERROR: u8 = 3;
const SIGNAL: u8 = 4;

#[derive(Debug, Clone, Copy)]
pub enum Arg<'a> {
    Str(&'a str),
    I32(i32),
    U32(u32),
}

#[derive(Debug, Clone, Copy)]
pub struct MethodCall<'a> {
    pub dest: &'a str,
    pub path: &'a str,
    pub iface: &'a str,
    pub member: &'a str,
    pub args: &'a [Arg<'a>],
}

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Byte(u8),
    Bool(bool),
    I16(i16),
    U16(u16),
    I32(i32),
    U32(u32),
    I64(i64),
    U64(u64),
    F64(f64),
    Str(String),
    Path(String),
    Sig(String),
    Fd(u32),
    Array(Vec<Value>),
    Struct(Vec<Value>),
    Dict(Box<Value>, Box<Value>),
    Variant(Box<Value>),
}

impl Value {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(s) | Value::Path(s) | Value::Sig(s) => Some(s),
            _ => None,
        }
    }

    /// The value inside a variant, or the value itself.
    pub fn unvariant(&self) -> &Value {
        match self {
            Value::Variant(inner) => inner.unvariant(),
            other => other,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Message {
    pub kind: u8,
    pub serial: u32,
    pub reply_serial: Option<u32>,
    pub error_name: Option<String>,
    pub signature: String,
    pub body: Vec<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SocketAddr {
    Path(std::path::PathBuf),
    Abstract(Vec<u8>),
}

// ---------------------------------------------------------------------------------------------------------------
// Marshalling

fn pad(buf: &mut Vec<u8>, align: usize) {
    while !buf.len().is_multiple_of(align) {
        buf.push(0);
    }
}

fn put_str(buf: &mut Vec<u8>, s: &str) {
    pad(buf, 4);
    buf.extend_from_slice(&(s.len() as u32).to_le_bytes());
    buf.extend_from_slice(s.as_bytes());
    buf.push(0);
}

fn put_sig(buf: &mut Vec<u8>, s: &str) {
    buf.push(s.len() as u8);
    buf.extend_from_slice(s.as_bytes());
    buf.push(0);
}

fn put_field(fields: &mut Vec<u8>, code: u8, sig: u8, value: &str) {
    pad(fields, 8);
    fields.extend_from_slice(&[code, 1, sig, 0]);
    if sig == b'g' {
        put_sig(fields, value);
    } else {
        put_str(fields, value);
    }
}

/// A METHOD_CALL, little endian, header fields PATH, INTERFACE, MEMBER, DESTINATION, then SIGNATURE when there
/// are arguments (behaviour §19).
pub fn encode_call(serial: u32, call: &MethodCall) -> Vec<u8> {
    let mut signature = String::new();
    let mut body = Vec::new();
    for arg in call.args {
        match *arg {
            Arg::Str(s) => {
                signature.push('s');
                put_str(&mut body, s);
            }
            Arg::I32(v) => {
                signature.push('i');
                pad(&mut body, 4);
                body.extend_from_slice(&v.to_le_bytes());
            }
            Arg::U32(v) => {
                signature.push('u');
                pad(&mut body, 4);
                body.extend_from_slice(&v.to_le_bytes());
            }
        }
    }
    // Header fields are marshalled at offset 16 of the message, which is 8-aligned, so offsets within `fields`
    // align the same way.
    let mut fields = Vec::new();
    put_field(&mut fields, 1, b'o', call.path);
    put_field(&mut fields, 2, b's', call.iface);
    put_field(&mut fields, 3, b's', call.member);
    put_field(&mut fields, 6, b's', call.dest);
    if !signature.is_empty() {
        put_field(&mut fields, 8, b'g', &signature);
    }
    let mut message = Vec::with_capacity(16 + fields.len() + 8 + body.len());
    message.extend_from_slice(&[b'l', METHOD_CALL, 0, 1]);
    message.extend_from_slice(&(body.len() as u32).to_le_bytes());
    message.extend_from_slice(&serial.to_le_bytes());
    message.extend_from_slice(&(fields.len() as u32).to_le_bytes());
    message.extend_from_slice(&fields);
    pad(&mut message, 8);
    message.extend_from_slice(&body);
    message
}

// ---------------------------------------------------------------------------------------------------------------
// Unmarshalling

struct Reader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn align(&mut self, n: usize) -> Result<()> {
        let next = self.pos.div_ceil(n) * n;
        if next > self.buf.len() {
            bail!("truncated D-Bus message");
        }
        self.pos = next;
        Ok(())
    }

    fn take(&mut self, n: usize) -> Result<&'a [u8]> {
        if self.pos + n > self.buf.len() {
            bail!("truncated D-Bus message");
        }
        let slice = &self.buf[self.pos..self.pos + n];
        self.pos += n;
        Ok(slice)
    }

    fn u32(&mut self) -> Result<u32> {
        self.align(4)?;
        Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap()))
    }

    fn string(&mut self) -> Result<String> {
        let len = self.u32()? as usize;
        let bytes = self.take(len)?;
        self.take(1)?;
        Ok(String::from_utf8_lossy(bytes).into_owned())
    }

    fn signature(&mut self) -> Result<String> {
        let len = self.take(1)?[0] as usize;
        let bytes = self.take(len)?;
        self.take(1)?;
        Ok(String::from_utf8_lossy(bytes).into_owned())
    }

    fn value(&mut self, sig: &[u8]) -> Result<Value> {
        Ok(match sig[0] {
            b'y' => Value::Byte(self.take(1)?[0]),
            b'b' => Value::Bool(self.u32()? != 0),
            b'n' => {
                self.align(2)?;
                Value::I16(i16::from_le_bytes(self.take(2)?.try_into().unwrap()))
            }
            b'q' => {
                self.align(2)?;
                Value::U16(u16::from_le_bytes(self.take(2)?.try_into().unwrap()))
            }
            b'i' => Value::I32(self.u32()? as i32),
            b'u' => Value::U32(self.u32()?),
            b'h' => Value::Fd(self.u32()?),
            b'x' => {
                self.align(8)?;
                Value::I64(i64::from_le_bytes(self.take(8)?.try_into().unwrap()))
            }
            b't' => {
                self.align(8)?;
                Value::U64(u64::from_le_bytes(self.take(8)?.try_into().unwrap()))
            }
            b'd' => {
                self.align(8)?;
                Value::F64(f64::from_le_bytes(self.take(8)?.try_into().unwrap()))
            }
            b's' => Value::Str(self.string()?),
            b'o' => Value::Path(self.string()?),
            b'g' => Value::Sig(self.signature()?),
            b'v' => {
                let inner = self.signature()?;
                let inner = inner.as_bytes();
                if inner.is_empty() || single_type_len(inner)? != inner.len() {
                    bail!("invalid D-Bus variant signature");
                }
                Value::Variant(Box::new(self.value(inner)?))
            }
            b'a' => {
                let len = self.u32()? as usize;
                if len > MAX_MESSAGE {
                    bail!("D-Bus message exceeds the maximum size");
                }
                let element = &sig[1..1 + single_type_len(&sig[1..])?];
                self.align(alignment(element[0]))?;
                let end = self.pos + len;
                if end > self.buf.len() {
                    bail!("truncated D-Bus message");
                }
                let mut items = Vec::new();
                while self.pos < end {
                    items.push(self.value(element)?);
                }
                if self.pos != end {
                    bail!("D-Bus array length does not match its elements");
                }
                Value::Array(items)
            }
            b'(' => {
                self.align(8)?;
                let inner = &sig[1..single_type_len(sig)? - 1];
                let mut fields = Vec::new();
                let mut rest = inner;
                while !rest.is_empty() {
                    let n = single_type_len(rest)?;
                    fields.push(self.value(&rest[..n])?);
                    rest = &rest[n..];
                }
                Value::Struct(fields)
            }
            b'{' => {
                self.align(8)?;
                let inner = &sig[1..single_type_len(sig)? - 1];
                let key_len = single_type_len(inner)?;
                let key = self.value(&inner[..key_len])?;
                let value = self.value(&inner[key_len..])?;
                Value::Dict(Box::new(key), Box::new(value))
            }
            other => bail!("unsupported D-Bus type {:?}", other as char),
        })
    }
}

fn alignment(code: u8) -> usize {
    match code {
        b'y' | b'g' | b'v' => 1,
        b'n' | b'q' => 2,
        b'x' | b't' | b'd' | b'(' | b'{' => 8,
        _ => 4,
    }
}

/// The length in bytes of the first complete type in `sig`.
fn single_type_len(sig: &[u8]) -> Result<usize> {
    let Some(&first) = sig.first() else {
        bail!("invalid D-Bus signature")
    };
    Ok(match first {
        b'a' => 1 + single_type_len(&sig[1..])?,
        b'(' | b'{' => {
            let close = if first == b'(' { b')' } else { b'}' };
            let mut n = 1;
            loop {
                match sig.get(n) {
                    None => bail!("invalid D-Bus signature"),
                    Some(&c) if c == close => break n + 1,
                    Some(_) => n += single_type_len(&sig[n..])?,
                }
            }
        }
        b'y' | b'b' | b'n' | b'q' | b'i' | b'u' | b'x' | b't' | b'd' | b's' | b'o' | b'g' | b'v' | b'h' => 1,
        _ => bail!("invalid D-Bus signature"),
    })
}

/// Decodes a body of complete types; alignment is relative to the body's start, which is 8-aligned in a message.
pub fn decode_body(signature: &str, body: &[u8]) -> Result<Vec<Value>> {
    decode_from(signature, body, 0)
}

/// Decodes `signature` from `buf` starting at `start`, aligning relative to `buf`'s start (the message's).
fn decode_from(signature: &str, buf: &[u8], start: usize) -> Result<Vec<Value>> {
    let mut reader = Reader { buf, pos: start };
    let mut values = Vec::new();
    let mut rest = signature.as_bytes();
    while !rest.is_empty() {
        let n = single_type_len(rest)?;
        values.push(reader.value(&rest[..n])?);
        rest = &rest[n..];
    }
    Ok(values)
}

struct Header {
    kind: u8,
    body_len: usize,
    serial: u32,
    fields_len: usize,
}

fn fixed_header(buf: &[u8]) -> Result<Option<Header>> {
    if buf.len() < 16 {
        return Ok(None);
    }
    if buf[0] != b'l' {
        bail!("big-endian D-Bus responses are unsupported");
    }
    if buf[3] != 1 {
        bail!("unsupported D-Bus protocol version");
    }
    let body_len = u32::from_le_bytes(buf[4..8].try_into().unwrap()) as usize;
    let fields_len = u32::from_le_bytes(buf[12..16].try_into().unwrap()) as usize;
    if body_len > MAX_MESSAGE || fields_len > MAX_MESSAGE {
        bail!("D-Bus message exceeds the maximum size");
    }
    Ok(Some(Header {
        kind: buf[1],
        body_len,
        serial: u32::from_le_bytes(buf[8..12].try_into().unwrap()),
        fields_len,
    }))
}

/// The whole length of the message starting `buf`, once its fixed header has arrived.
pub fn message_len(buf: &[u8]) -> Result<Option<usize>> {
    Ok(fixed_header(buf)?.map(|h| (16 + h.fields_len).div_ceil(8) * 8 + h.body_len))
}

/// The header fields array, which starts at offset 12 of the message and is aligned relative to the message.
fn decode_fields(buf: &[u8], fields_len: usize) -> Result<Vec<Value>> {
    decode_from("a(yv)", &buf[..16 + fields_len], 12)
}

/// Decodes one complete message.
pub fn decode_message(buf: &[u8]) -> Result<Message> {
    let header = fixed_header(buf)?.ok_or_else(|| anyhow!("truncated D-Bus message"))?;
    let fields = decode_fields(buf, header.fields_len)?;
    let mut reply_serial = None;
    let mut error_name = None;
    let mut signature = String::new();
    if let Some(Value::Array(items)) = fields.first() {
        for item in items {
            if let Value::Struct(parts) = item
                && let [Value::Byte(code), Value::Variant(value)] = parts.as_slice()
            {
                match (code, value.as_ref()) {
                    (4, Value::Str(name)) => error_name = Some(name.clone()),
                    (5, Value::U32(serial)) => reply_serial = Some(*serial),
                    (8, Value::Sig(sig)) => signature = sig.clone(),
                    _ => {}
                }
            }
        }
    }
    let body_start = (16 + header.fields_len).div_ceil(8) * 8;
    let body = &buf[body_start..body_start + header.body_len];
    // Signals are never asked for (the engine adds no match rules) and are skipped undecoded.
    let body = if header.kind == SIGNAL {
        Vec::new()
    } else {
        decode_body(&signature, body)?
    };
    Ok(Message {
        kind: header.kind,
        serial: header.serial,
        reply_serial,
        error_name,
        signature,
        body,
    })
}

// ---------------------------------------------------------------------------------------------------------------
// Addresses, authentication, errors

/// The first `unix:` entry's `path=` (a filesystem socket) or `abstract=` (behaviour §19).
pub fn parse_address(address: &str) -> Result<SocketAddr> {
    for entry in address.split(';') {
        let Some(keys) = entry.strip_prefix("unix:") else {
            continue;
        };
        let mut path = None;
        let mut abstract_name = None;
        for pair in keys.split(',') {
            if let Some(value) = pair.strip_prefix("path=") {
                path.get_or_insert(value);
            } else if let Some(value) = pair.strip_prefix("abstract=") {
                abstract_name.get_or_insert(value);
            }
        }
        if let Some(value) = path {
            let bytes = percent_decode(value)?;
            return Ok(SocketAddr::Path(std::path::PathBuf::from(
                String::from_utf8_lossy(&bytes).into_owned(),
            )));
        }
        if let Some(value) = abstract_name {
            return Ok(SocketAddr::Abstract(percent_decode(value)?));
        }
    }
    bail!("D-Bus address does not contain a supported Unix socket")
}

fn percent_decode(value: &str) -> Result<Vec<u8>> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = bytes
                .get(i + 1..i + 3)
                .and_then(|h| std::str::from_utf8(h).ok())
                .and_then(|h| u8::from_str_radix(h, 16).ok());
            match hex {
                Some(b) => out.push(b),
                None => bail!("D-Bus address has an invalid escape"),
            }
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    Ok(out)
}

/// `\0AUTH EXTERNAL <hex of the decimal uid>\r\n`.
pub fn auth_line(uid: u32) -> Vec<u8> {
    let hex: String = uid.to_string().bytes().map(|b| format!("{b:02x}")).collect();
    let mut line = b"\0AUTH EXTERNAL ".to_vec();
    line.extend_from_slice(hex.as_bytes());
    line.extend_from_slice(b"\r\n");
    line
}

/// `D-Bus <interface>.<member> failed: <error name | unknown error>: <first string argument | method call failed>`.
pub fn error_sentence(iface: &str, member: &str, name: Option<&str>, body: &[Value]) -> String {
    let message = body.first().and_then(Value::as_str).unwrap_or("method call failed");
    format!(
        "D-Bus {iface}.{member} failed: {}: {message}",
        name.unwrap_or("unknown error")
    )
}

// ---------------------------------------------------------------------------------------------------------------
// The connection

/// A call's outcome: its reply body, or the error sentence a caller sees.
pub type CallResult = std::result::Result<Vec<Value>, String>;

/// Per-request counters (`--stats`), for M0.3 to compare with `dbus-monitor`.
#[derive(Debug, Default, Clone)]
pub struct BusStats {
    /// Calls sent, `Hello` included.
    pub calls: u64,
    /// How many times the engine stopped and read the bus with calls outstanding.
    pub waits: u64,
    /// Of those, the waits with exactly one call outstanding: calls awaited one after another (every call of a
    /// sequential read; only dependency chains of a pipelined one).
    pub waits_alone: u64,
    pub max_in_flight: usize,
    pub reply_bytes: u64,
    /// The most reply bytes received and not yet consumed at once.
    pub peak_staged: usize,
    pub by_member: BTreeMap<String, u64>,
    pub connections: u64,
}

struct Pending {
    iface: String,
    member: String,
}

pub struct Bus {
    stream: UnixStream,
    out: Vec<u8>,
    inbuf: Vec<u8>,
    next_serial: u32,
    pending: HashMap<u32, Pending>,
    ready: VecDeque<(u32, CallResult)>,
    /// Bytes of an oversized message still to be discarded.
    skip: usize,
    /// How long the bus may stay silent before every outstanding call fails.
    io_timeout: Duration,
    pub unique_name: String,
    pub stats: BusStats,
}

/// A failure of the connection itself (as opposed to one call): the caller reconnects or gives up.
#[derive(Debug)]
pub struct Broken(pub String);

impl std::fmt::Display for Broken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Broken {}

impl Bus {
    /// Connects, authenticates with `EXTERNAL` and says `Hello` (behaviour §19).
    pub fn connect(address: &str) -> Result<Bus> {
        let stream = match parse_address(address)? {
            SocketAddr::Path(path) => UnixStream::connect(&path).context("failed to connect to the D-Bus socket")?,
            SocketAddr::Abstract(name) => {
                let addr = std::os::unix::net::SocketAddr::from_abstract_name(&name)
                    .context("failed to connect to the abstract D-Bus socket")?;
                UnixStream::connect_addr(&addr).context("failed to connect to the abstract D-Bus socket")?
            }
        };
        let uid = {
            use std::os::unix::fs::MetadataExt;
            std::fs::metadata("/proc/self")?.uid()
        };
        let mut bus = Bus::over(stream, IO_TIMEOUT)?;
        bus.stream.write_all(&auth_line(uid))?;
        let line = bus.read_auth_line()?;
        if !line.starts_with("OK ") {
            bail!("D-Bus EXTERNAL authentication failed");
        }
        bus.stream.write_all(b"BEGIN\r\n")?;
        let hello = bus.call(&MethodCall {
            dest: "org.freedesktop.DBus",
            path: "/org/freedesktop/DBus",
            iface: "org.freedesktop.DBus",
            member: "Hello",
            args: &[],
        })?;
        let reply = hello.map_err(|e| anyhow!(e))?;
        bus.unique_name = reply.first().and_then(Value::as_str).unwrap_or_default().to_string();
        bus.stats.connections = 1;
        Ok(bus)
    }

    /// A connection over an already-open, already-authenticated stream.
    fn over(stream: UnixStream, timeout: Duration) -> Result<Bus> {
        stream.set_read_timeout(Some(timeout))?;
        stream.set_write_timeout(Some(timeout))?;
        Ok(Bus {
            stream,
            out: Vec::new(),
            inbuf: Vec::new(),
            next_serial: 1,
            pending: HashMap::new(),
            ready: VecDeque::new(),
            skip: 0,
            io_timeout: timeout,
            unique_name: String::new(),
            stats: BusStats::default(),
        })
    }

    fn read_auth_line(&mut self) -> Result<String> {
        let mut line = Vec::new();
        let mut byte = [0u8; 1];
        while !line.ends_with(b"\r\n") {
            if self.stream.read(&mut byte)? == 0 {
                bail!("D-Bus EXTERNAL authentication failed");
            }
            line.push(byte[0]);
            if line.len() > 4096 {
                bail!("D-Bus EXTERNAL authentication failed");
            }
        }
        Ok(String::from_utf8_lossy(&line).into_owned())
    }

    /// Queues a call and returns its serial. Nothing is written until [`Bus::flush`] or a receive.
    pub fn send(&mut self, call: &MethodCall) -> u32 {
        let serial = self.next_serial;
        self.next_serial = self.next_serial.wrapping_add(1).max(1);
        self.out.extend_from_slice(&encode_call(serial, call));
        self.pending.insert(
            serial,
            Pending {
                iface: call.iface.to_string(),
                member: call.member.to_string(),
            },
        );
        self.stats.calls += 1;
        *self
            .stats
            .by_member
            .entry(format!("{}.{}", call.iface, call.member))
            .or_default() += 1;
        self.stats.max_in_flight = self.stats.max_in_flight.max(self.pending.len());
        serial
    }

    pub fn flush(&mut self) -> Result<()> {
        if !self.out.is_empty() {
            let out = std::mem::take(&mut self.out);
            self.stream
                .write_all(&out)
                .map_err(|e| Broken(format!("failed to write to the accessibility bus: {e}")))?;
        }
        Ok(())
    }

    /// Calls sent whose replies have not been handed out.
    pub fn in_flight(&self) -> usize {
        self.pending.len() + self.ready.len()
    }

    /// Reply bytes received and not yet consumed.
    pub fn staged_bytes(&self) -> usize {
        self.inbuf.len()
    }

    /// The next reply to any outstanding call, waiting for the bus when none has arrived.
    pub fn recv(&mut self) -> Result<(u32, CallResult)> {
        self.flush()?;
        let mut waited = false;
        loop {
            if let Some(done) = self.ready.pop_front() {
                return Ok(done);
            }
            if self.pending.is_empty() {
                bail!("no D-Bus call is outstanding");
            }
            if self.dispatch_buffered()? {
                continue;
            }
            if !waited {
                self.stats.waits += 1;
                self.stats.waits_alone += (self.pending.len() == 1) as u64;
                waited = true;
            }
            self.read_more()?;
        }
    }

    /// A reply that has already arrived, without waiting for the bus.
    pub fn try_recv(&mut self) -> Result<Option<(u32, CallResult)>> {
        if self.ready.is_empty() {
            self.dispatch_buffered()?;
        }
        Ok(self.ready.pop_front())
    }

    /// Sends one call and waits for its reply, keeping any other replies for [`Bus::recv`].
    pub fn call(&mut self, call: &MethodCall) -> Result<CallResult> {
        let serial = self.send(call);
        self.flush()?;
        let mut waited = false;
        loop {
            if let Some(index) = self.ready.iter().position(|(s, _)| *s == serial) {
                return Ok(self.ready.remove(index).unwrap().1);
            }
            if self.dispatch_buffered()? {
                continue;
            }
            if !waited {
                self.stats.waits += 1;
                self.stats.waits_alone += (self.pending.len() == 1) as u64;
                waited = true;
            }
            self.read_more()?;
        }
    }

    /// Sends `calls` together and returns their results in order, waiting for them no later than `deadline`
    /// whatever the bus's silence timeout. None when the deadline passes first: the calls are then abandoned, and
    /// their late replies are discarded when they come.
    pub fn calls_until(&mut self, calls: &[MethodCall], deadline: Instant) -> Result<Option<Vec<CallResult>>> {
        let serials: Vec<u32> = calls.iter().map(|c| self.send(c)).collect();
        self.flush()?;
        loop {
            if serials.iter().all(|s| self.ready.iter().any(|(r, _)| r == s)) {
                let mut results = Vec::with_capacity(serials.len());
                for serial in &serials {
                    let index = self.ready.iter().position(|(r, _)| r == serial).expect("present");
                    results.push(self.ready.remove(index).expect("present").1);
                }
                return Ok(Some(results));
            }
            if self.dispatch_buffered()? {
                continue;
            }
            let now = Instant::now();
            if now >= deadline {
                for serial in &serials {
                    self.pending.remove(serial);
                }
                self.ready.retain(|(r, _)| !serials.contains(r));
                return Ok(None);
            }
            // The socket waits at most until the deadline; its own silence timeout comes back afterwards.
            self.stream
                .set_read_timeout(Some((deadline - now).min(self.io_timeout)))?;
            let read = self.read_until_quiet();
            self.stream.set_read_timeout(Some(self.io_timeout))?;
            read?;
        }
    }

    /// Reads what the bus has sent; a read that times out returns with nothing read and fails no call (the caller's
    /// deadline decides).
    fn read_until_quiet(&mut self) -> Result<()> {
        let start = self.inbuf.len();
        self.inbuf.resize(start + 64 * 1024, 0);
        let result = self.stream.read(&mut self.inbuf[start..]);
        match result {
            Ok(0) => {
                self.inbuf.truncate(start);
                Err(Broken("the accessibility bus closed the connection".into()).into())
            }
            Ok(n) => {
                self.inbuf.truncate(start + n);
                self.stats.peak_staged = self.stats.peak_staged.max(self.inbuf.len());
                Ok(())
            }
            Err(error)
                if matches!(
                    error.kind(),
                    ErrorKind::WouldBlock | ErrorKind::TimedOut | ErrorKind::Interrupted
                ) =>
            {
                self.inbuf.truncate(start);
                Ok(())
            }
            Err(error) => {
                self.inbuf.truncate(start);
                Err(Broken(format!("failed to read from the accessibility bus: {error}")).into())
            }
        }
    }

    /// Moves every complete buffered message to `ready`; true when something was consumed. The buffer is
    /// compacted once per pass, not once per message.
    fn dispatch_buffered(&mut self) -> Result<bool> {
        let mut pos = 0;
        let outcome = self.dispatch_from(&mut pos);
        if pos > 0 {
            self.inbuf.drain(..pos);
        }
        outcome.map(|()| pos > 0)
    }

    fn dispatch_from(&mut self, pos: &mut usize) -> Result<()> {
        loop {
            if self.skip > 0 {
                let n = self.skip.min(self.inbuf.len() - *pos);
                *pos += n;
                self.skip -= n;
                if self.skip > 0 {
                    return Ok(());
                }
            }
            let buf = &self.inbuf[*pos..];
            let len = match message_len(buf) {
                Ok(Some(len)) => len,
                Ok(None) => return Ok(()),
                Err(error) if error.to_string() == "D-Bus message exceeds the maximum size" => {
                    // The reply is refused, not the connection: fail its call and discard its bytes.
                    let fields_len = u32::from_le_bytes(buf[12..16].try_into().unwrap()) as usize;
                    let body_len = u32::from_le_bytes(buf[4..8].try_into().unwrap()) as usize;
                    if fields_len > MAX_MESSAGE {
                        return Err(Broken("D-Bus message exceeds the maximum size".into()).into());
                    }
                    if buf.len() < 16 + fields_len {
                        return Ok(());
                    }
                    if let Some(serial) = decode_fields(buf, fields_len).ok().and_then(|f| reply_serial_of(&f))
                        && self.pending.remove(&serial).is_some()
                    {
                        self.ready
                            .push_back((serial, Err("D-Bus message exceeds the maximum size".into())));
                    }
                    self.skip = (16 + fields_len).div_ceil(8) * 8 + body_len;
                    continue;
                }
                Err(error) => return Err(Broken(error.to_string()).into()),
            };
            if buf.len() < len {
                self.inbuf.reserve(len - buf.len());
                return Ok(());
            }
            let decoded = decode_message(&buf[..len]);
            let fields_len = u32::from_le_bytes(buf[12..16].try_into().unwrap()) as usize;
            let serial_on_error = decoded
                .is_err()
                .then(|| decode_fields(buf, fields_len).ok().and_then(|f| reply_serial_of(&f)))
                .flatten();
            *pos += len;
            self.stats.reply_bytes += len as u64;
            let message = match decoded {
                Ok(message) => message,
                Err(error) => {
                    // A reply whose body cannot be read fails its call; anything else ends the connection.
                    let Some(serial) = serial_on_error else {
                        return Err(Broken(error.to_string()).into());
                    };
                    if self.pending.remove(&serial).is_some() {
                        self.ready.push_back((serial, Err(error.to_string())));
                    }
                    continue;
                }
            };
            if message.kind != METHOD_RETURN && message.kind != ERROR {
                continue;
            }
            let Some(serial) = message.reply_serial else { continue };
            let Some(pending) = self.pending.remove(&serial) else {
                continue;
            };
            let result = if message.kind == ERROR {
                Err(error_sentence(
                    &pending.iface,
                    &pending.member,
                    message.error_name.as_deref(),
                    &message.body,
                ))
            } else {
                Ok(message.body)
            };
            self.ready.push_back((serial, result));
        }
    }

    fn read_more(&mut self) -> Result<()> {
        let start = self.inbuf.len();
        let want = 64 * 1024;
        self.inbuf.resize(start + want, 0);
        let result = self.stream.read(&mut self.inbuf[start..]);
        match result {
            Ok(0) => {
                self.inbuf.truncate(start);
                Err(Broken("the accessibility bus closed the connection".into()).into())
            }
            Ok(n) => {
                self.inbuf.truncate(start + n);
                self.stats.peak_staged = self.stats.peak_staged.max(self.inbuf.len());
                Ok(())
            }
            Err(error) if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {
                // The bus stayed silent for IO_TIMEOUT: every outstanding call fails with the I/O error, as each
                // of the vendor's calls fails on its socket timeout (behaviour §19). Late replies are discarded.
                self.inbuf.truncate(start);
                let sentence = error.to_string();
                let mut serials: Vec<u32> = self.pending.keys().copied().collect();
                serials.sort_unstable();
                for serial in serials {
                    self.pending.remove(&serial);
                    self.ready.push_back((serial, Err(sentence.clone())));
                }
                Ok(())
            }
            Err(error) if error.kind() == ErrorKind::Interrupted => {
                self.inbuf.truncate(start);
                Ok(())
            }
            Err(error) => {
                self.inbuf.truncate(start);
                Err(Broken(format!("failed to read from the accessibility bus: {error}")).into())
            }
        }
    }

    /// Takes the counters and starts new ones.
    pub fn take_stats(&mut self) -> BusStats {
        std::mem::take(&mut self.stats)
    }
}

fn reply_serial_of(fields: &[Value]) -> Option<u32> {
    let Some(Value::Array(items)) = fields.first() else {
        return None;
    };
    items.iter().find_map(|item| match item {
        Value::Struct(parts) => match parts.as_slice() {
            [Value::Byte(5), Value::Variant(v)] => match v.as_ref() {
                Value::U32(s) => Some(*s),
                _ => None,
            },
            _ => None,
        },
        _ => None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A little-endian method return carrying `body` with `signature`, replying to `reply_serial`.
    fn reply(reply_serial: u32, signature: &str, body: &[u8]) -> Vec<u8> {
        let mut fields = Vec::new();
        // REPLY_SERIAL (5), variant "u"
        fields.extend_from_slice(&[5, 1, b'u', 0]);
        fields.extend_from_slice(&reply_serial.to_le_bytes());
        if !signature.is_empty() {
            // align to 8 for the next struct
            while !fields.len().is_multiple_of(8) {
                fields.push(0);
            }
            fields.extend_from_slice(&[8, 1, b'g', 0, signature.len() as u8]);
            fields.extend_from_slice(signature.as_bytes());
            fields.push(0);
        }
        let mut message = vec![b'l', 2, 0, 1];
        message.extend_from_slice(&(body.len() as u32).to_le_bytes());
        message.extend_from_slice(&99u32.to_le_bytes());
        message.extend_from_slice(&(fields.len() as u32).to_le_bytes());
        message.extend_from_slice(&fields);
        while !message.len().is_multiple_of(8) {
            message.push(0);
        }
        message.extend_from_slice(body);
        message
    }

    #[test]
    fn a_method_call_is_marshalled_little_endian_with_its_header_fields_in_order() {
        let call = MethodCall {
            dest: ":1.2",
            path: "/org/a11y/atspi/accessible/73",
            iface: "org.freedesktop.DBus.Properties",
            member: "Get",
            args: &[Arg::Str("org.a11y.atspi.Accessible"), Arg::Str("Name")],
        };
        let bytes = encode_call(7, &call);
        assert_eq!(
            &bytes[0..4],
            &[b'l', 1, 0, 1],
            "little endian, METHOD_CALL, no flags, version 1"
        );
        let body_len = u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize;
        assert_eq!(u32::from_le_bytes(bytes[8..12].try_into().unwrap()), 7, "serial");
        let fields_len = u32::from_le_bytes(bytes[12..16].try_into().unwrap()) as usize;
        let body_start = (16 + fields_len).div_ceil(8) * 8;
        assert_eq!(bytes.len(), body_start + body_len);
        // header field codes in order: PATH 1, INTERFACE 2, MEMBER 3, DESTINATION 6, SIGNATURE 8
        let fields = decode_fields(&bytes, fields_len).unwrap();
        let codes: Vec<u8> = match &fields[0] {
            Value::Array(items) => items
                .iter()
                .map(|item| match item {
                    Value::Struct(parts) => match parts[0] {
                        Value::Byte(code) => code,
                        _ => panic!("code"),
                    },
                    _ => panic!("struct"),
                })
                .collect(),
            _ => panic!("array"),
        };
        assert_eq!(codes, vec![1, 2, 3, 6, 8]);
        let body = decode_body("ss", &bytes[body_start..]).unwrap();
        assert_eq!(
            body,
            vec![
                Value::Str("org.a11y.atspi.Accessible".into()),
                Value::Str("Name".into())
            ]
        );
    }

    #[test]
    fn a_call_without_arguments_has_no_signature_field() {
        let call = MethodCall {
            dest: "org.freedesktop.DBus",
            path: "/org/freedesktop/DBus",
            iface: "org.freedesktop.DBus",
            member: "Hello",
            args: &[],
        };
        let bytes = encode_call(1, &call);
        assert_eq!(u32::from_le_bytes(bytes[4..8].try_into().unwrap()), 0);
        let message = decode_message(&bytes).unwrap();
        assert_eq!(message.kind, 1);
        assert_eq!(message.signature, "");
        assert!(message.body.is_empty());
    }

    #[test]
    fn integer_arguments_are_aligned() {
        let call = MethodCall {
            dest: ":1.2",
            path: "/p",
            iface: "org.a11y.atspi.Text",
            member: "GetText",
            args: &[Arg::I32(0), Arg::I32(-1)],
        };
        let message = decode_message(&encode_call(3, &call)).unwrap();
        assert_eq!(message.signature, "ii");
        assert_eq!(message.body, vec![Value::I32(0), Value::I32(-1)]);
        let call = MethodCall {
            dest: ":1.2",
            path: "/p",
            iface: "org.a11y.atspi.Component",
            member: "GetExtents",
            args: &[Arg::U32(0)],
        };
        assert_eq!(
            decode_message(&encode_call(4, &call)).unwrap().body,
            vec![Value::U32(0)]
        );
    }

    #[test]
    fn replies_decode_the_types_at_spi_answers_with() {
        // GetChildren: a(so)
        let mut body = Vec::new();
        let mut array = Vec::new();
        for (name, path) in [
            (":1.2", "/org/a11y/atspi/accessible/1"),
            (":1.2", "/org/a11y/atspi/accessible/22"),
        ] {
            while !array.len().is_multiple_of(8) {
                array.push(0);
            }
            array.extend_from_slice(&(name.len() as u32).to_le_bytes());
            array.extend_from_slice(name.as_bytes());
            array.push(0);
            while !array.len().is_multiple_of(4) {
                array.push(0);
            }
            array.extend_from_slice(&(path.len() as u32).to_le_bytes());
            array.extend_from_slice(path.as_bytes());
            array.push(0);
        }
        body.extend_from_slice(&(array.len() as u32).to_le_bytes());
        body.extend_from_slice(&[0, 0, 0, 0]); // pad to 8 before the first struct
        body.extend_from_slice(&array);
        let message = decode_message(&reply(12, "a(so)", &body)).unwrap();
        assert_eq!(message.kind, 2);
        assert_eq!(message.reply_serial, Some(12));
        assert_eq!(
            message.body,
            vec![Value::Array(vec![
                Value::Struct(vec![
                    Value::Str(":1.2".into()),
                    Value::Path("/org/a11y/atspi/accessible/1".into())
                ]),
                Value::Struct(vec![
                    Value::Str(":1.2".into()),
                    Value::Path("/org/a11y/atspi/accessible/22".into())
                ]),
            ])]
        );

        // GetState: au
        let mut body = Vec::new();
        body.extend_from_slice(&8u32.to_le_bytes());
        body.extend_from_slice(&0x4320_0102u32.to_le_bytes());
        body.extend_from_slice(&0u32.to_le_bytes());
        assert_eq!(
            decode_body("au", &body).unwrap(),
            vec![Value::Array(vec![Value::U32(0x4320_0102), Value::U32(0)])]
        );

        // Properties.Get: v containing s, and v containing i
        let mut body = vec![1, b's', 0, 0];
        body.extend_from_slice(&4u32.to_le_bytes());
        body.extend_from_slice(b"Open");
        body.push(0);
        assert_eq!(
            decode_body("v", &body).unwrap(),
            vec![Value::Variant(Box::new(Value::Str("Open".into())))]
        );
        let mut body = vec![1, b'i', 0, 0];
        body.extend_from_slice(&3i32.to_le_bytes());
        assert_eq!(
            decode_body("v", &body).unwrap(),
            vec![Value::Variant(Box::new(Value::I32(3)))]
        );

        // GetExtents: (iiii); DoAction: b
        let mut body = Vec::new();
        for v in [10i32, 20, 300, 40] {
            body.extend_from_slice(&v.to_le_bytes());
        }
        assert_eq!(
            decode_body("(iiii)", &body).unwrap(),
            vec![Value::Struct(vec![
                Value::I32(10),
                Value::I32(20),
                Value::I32(300),
                Value::I32(40)
            ])]
        );
        assert_eq!(decode_body("b", &1u32.to_le_bytes()).unwrap(), vec![Value::Bool(true)]);
        // an empty array of 8-aligned elements still carries its padding
        let body = [0u8, 0, 0, 0, 0, 0, 0, 0];
        assert_eq!(decode_body("a(so)", &body).unwrap(), vec![Value::Array(vec![])]);
        // dict, as in Cache.GetItems' legacy cousins and GetAttributes
        let mut body = Vec::new();
        let mut entries = Vec::new();
        entries.extend_from_slice(&1u32.to_le_bytes());
        entries.extend_from_slice(b"k\0");
        entries.extend_from_slice(&[0, 0]);
        entries.extend_from_slice(&1u32.to_le_bytes());
        entries.extend_from_slice(b"v\0");
        body.extend_from_slice(&(entries.len() as u32).to_le_bytes());
        body.extend_from_slice(&[0, 0, 0, 0]);
        body.extend_from_slice(&entries);
        assert_eq!(
            decode_body("a{ss}", &body).unwrap(),
            vec![Value::Array(vec![Value::Dict(
                Box::new(Value::Str("k".into())),
                Box::new(Value::Str("v".into()))
            )])]
        );
    }

    #[test]
    fn message_len_needs_the_fixed_header_and_reports_the_whole_length() {
        let bytes = reply(5, "s", &[1, 0, 0, 0, b'x', 0]);
        assert_eq!(message_len(&bytes[..10]).unwrap(), None);
        assert_eq!(message_len(&bytes[..16]).unwrap(), Some(bytes.len()));
        let mut big = bytes.clone();
        big[0] = b'B';
        assert_eq!(
            message_len(&big).unwrap_err().to_string(),
            "big-endian D-Bus responses are unsupported"
        );
        let mut huge = bytes.clone();
        huge[4..8].copy_from_slice(&(16 * 1024 * 1024 + 1u32).to_le_bytes());
        assert_eq!(
            message_len(&huge).unwrap_err().to_string(),
            "D-Bus message exceeds the maximum size"
        );
    }

    #[test]
    fn addresses_take_the_first_unix_socket_and_decode_escapes() {
        assert_eq!(
            parse_address("unix:path=/run/user/501/at-spi/bus_0,guid=abc").unwrap(),
            SocketAddr::Path("/run/user/501/at-spi/bus_0".into())
        );
        assert_eq!(
            parse_address("tcp:host=x;unix:abstract=/tmp/dbus-%41b").unwrap(),
            SocketAddr::Abstract(b"/tmp/dbus-Ab".to_vec())
        );
        assert_eq!(
            parse_address("unix:path=/a%2").unwrap_err().to_string(),
            "D-Bus address has an invalid escape"
        );
        assert_eq!(
            parse_address("tcp:host=x").unwrap_err().to_string(),
            "D-Bus address does not contain a supported Unix socket"
        );
    }

    #[test]
    fn external_authentication_sends_the_hex_of_the_decimal_uid() {
        assert_eq!(auth_line(501), b"\0AUTH EXTERNAL 353031\r\n".to_vec());
    }

    #[test]
    fn error_replies_become_the_vendor_sentence() {
        assert_eq!(
            error_sentence(
                "org.freedesktop.DBus.Properties",
                "Get",
                Some("org.freedesktop.DBus.Error.NoReply"),
                &[Value::Str(
                    "Message recipient disconnected from message bus without replying".into()
                )]
            ),
            "D-Bus org.freedesktop.DBus.Properties.Get failed: org.freedesktop.DBus.Error.NoReply: Message recipient disconnected from message bus without replying"
        );
        assert_eq!(
            error_sentence("a.b", "C", None, &[]),
            "D-Bus a.b.C failed: unknown error: method call failed"
        );
    }

    /// A message of `kind` replying to `reply_serial`, with an optional ERROR_NAME.
    fn answer(kind: u8, reply_serial: u32, error_name: Option<&str>, body_text: &str) -> Vec<u8> {
        let mut fields = Vec::new();
        if let Some(name) = error_name {
            fields.extend_from_slice(&[4, 1, b's', 0]);
            fields.extend_from_slice(&(name.len() as u32).to_le_bytes());
            fields.extend_from_slice(name.as_bytes());
            fields.push(0);
            while !fields.len().is_multiple_of(8) {
                fields.push(0);
            }
        }
        fields.extend_from_slice(&[5, 1, b'u', 0]);
        fields.extend_from_slice(&reply_serial.to_le_bytes());
        fields.extend_from_slice(&[8, 1, b'g', 0, 1, b's', 0]);
        let mut body = (body_text.len() as u32).to_le_bytes().to_vec();
        body.extend_from_slice(body_text.as_bytes());
        body.push(0);
        let mut out = vec![b'l', kind, 0, 1];
        out.extend_from_slice(&(body.len() as u32).to_le_bytes());
        out.extend_from_slice(&77u32.to_le_bytes());
        out.extend_from_slice(&(fields.len() as u32).to_le_bytes());
        out.extend_from_slice(&fields);
        while !out.len().is_multiple_of(8) {
            out.push(0);
        }
        out.extend_from_slice(&body);
        out
    }

    /// Reads `n` method calls from `stream`, returning (serial, member) in arrival order.
    fn read_calls(stream: &mut UnixStream, n: usize) -> Vec<(u32, String)> {
        let mut buf = Vec::new();
        let mut calls = Vec::new();
        let mut chunk = [0u8; 4096];
        while calls.len() < n {
            let read = stream.read(&mut chunk).unwrap();
            assert!(read > 0);
            buf.extend_from_slice(&chunk[..read]);
            while let Some(len) = message_len(&buf).unwrap() {
                if buf.len() < len {
                    break;
                }
                let message = decode_message(&buf[..len]).unwrap();
                let fields_len = u32::from_le_bytes(buf[12..16].try_into().unwrap()) as usize;
                let Value::Array(items) = &decode_fields(&buf, fields_len).unwrap()[0] else {
                    unreachable!()
                };
                let member = items
                    .iter()
                    .find_map(|item| match item {
                        Value::Struct(parts) => match parts.as_slice() {
                            [Value::Byte(3), Value::Variant(v)] => v.as_str().map(str::to_string),
                            _ => None,
                        },
                        _ => None,
                    })
                    .unwrap();
                calls.push((message.serial, member));
                buf.drain(..len);
            }
        }
        calls
    }

    fn call(member: &str) -> MethodCall<'_> {
        MethodCall {
            dest: ":1.2",
            path: "/p",
            iface: "org.a11y.atspi.Accessible",
            member,
            args: &[],
        }
    }

    #[test]
    fn replies_are_matched_by_serial_with_many_calls_in_flight() {
        let (ours, mut theirs) = UnixStream::pair().unwrap();
        let server = std::thread::spawn(move || {
            let mut calls = read_calls(&mut theirs, 3);
            calls.reverse();
            for (serial, member) in calls {
                theirs.write_all(&answer(METHOD_RETURN, serial, None, &member)).unwrap();
            }
        });
        let mut bus = Bus::over(ours, Duration::from_secs(5)).unwrap();
        let a = bus.send(&call("A"));
        let b = bus.send(&call("B"));
        let c = bus.send(&call("C"));
        assert_eq!(bus.in_flight(), 3);
        let mut got = HashMap::new();
        for _ in 0..3 {
            let (serial, result) = bus.recv().unwrap();
            got.insert(serial, result.unwrap());
        }
        assert_eq!(got[&a], vec![Value::Str("A".into())]);
        assert_eq!(got[&b], vec![Value::Str("B".into())]);
        assert_eq!(got[&c], vec![Value::Str("C".into())]);
        assert_eq!(bus.stats.calls, 3);
        assert_eq!(bus.stats.max_in_flight, 3);
        assert!((1..=3).contains(&bus.stats.waits));
        server.join().unwrap();
    }

    #[test]
    fn an_error_reply_fails_only_its_call_with_the_vendor_sentence() {
        let (ours, mut theirs) = UnixStream::pair().unwrap();
        let server = std::thread::spawn(move || {
            for (serial, member) in read_calls(&mut theirs, 2) {
                let message = if member == "Bad" {
                    answer(
                        ERROR,
                        serial,
                        Some("org.freedesktop.DBus.Error.UnknownMethod"),
                        "Unknown method",
                    )
                } else {
                    answer(METHOD_RETURN, serial, None, "fine")
                };
                theirs.write_all(&message).unwrap();
            }
        });
        let mut bus = Bus::over(ours, Duration::from_secs(5)).unwrap();
        let bad = bus.send(&call("Bad"));
        let good = bus.send(&call("Good"));
        let mut got = HashMap::new();
        for _ in 0..2 {
            let (serial, result) = bus.recv().unwrap();
            got.insert(serial, result);
        }
        assert_eq!(
            got[&bad],
            Err(
                "D-Bus org.a11y.atspi.Accessible.Bad failed: org.freedesktop.DBus.Error.UnknownMethod: Unknown method"
                    .to_string()
            )
        );
        assert_eq!(got[&good], Ok(vec![Value::Str("fine".into())]));
        server.join().unwrap();
    }

    #[test]
    fn a_reply_larger_than_any_window_budget_is_read_whole() {
        let text = "x".repeat(5 * 1024 * 1024 + 3);
        let (ours, mut theirs) = UnixStream::pair().unwrap();
        let sent = text.clone();
        let server = std::thread::spawn(move || {
            for (serial, _) in read_calls(&mut theirs, 1) {
                theirs.write_all(&answer(METHOD_RETURN, serial, None, &sent)).unwrap();
            }
        });
        let mut bus = Bus::over(ours, Duration::from_secs(5)).unwrap();
        bus.send(&call("GetText"));
        let (_, result) = bus.recv().unwrap();
        assert_eq!(result.unwrap(), vec![Value::Str(text)]);
        assert!(bus.stats.peak_staged > 5 * 1024 * 1024);
        assert_eq!(bus.staged_bytes(), 0);
        server.join().unwrap();
    }

    #[test]
    fn a_silent_bus_fails_every_outstanding_call_and_keeps_the_connection() {
        let (ours, theirs) = UnixStream::pair().unwrap();
        let mut bus = Bus::over(ours, Duration::from_millis(50)).unwrap();
        let a = bus.send(&call("A"));
        let b = bus.send(&call("B"));
        let first = bus.recv().unwrap();
        let second = bus.recv().unwrap();
        assert_eq!((first.0, second.0), (a, b));
        assert!(first.1.unwrap_err().contains("os error 11"));
        assert_eq!(bus.in_flight(), 0);
        drop(theirs);
    }

    #[test]
    fn calls_with_a_deadline_end_at_it_however_the_replies_trickle_in_and_late_replies_are_dropped() {
        // the first reply comes at once and the second after the deadline: the bus's own silence timeout (5 s here)
        // restarting at each reply must not stretch the wait
        let (ours, mut theirs) = UnixStream::pair().unwrap();
        let server = std::thread::spawn(move || {
            let calls = read_calls(&mut theirs, 2);
            theirs
                .write_all(&answer(METHOD_RETURN, calls[0].0, None, "count"))
                .unwrap();
            std::thread::sleep(Duration::from_millis(150));
            theirs
                .write_all(&answer(METHOD_RETURN, calls[0].0, None, "dup"))
                .unwrap();
            std::thread::sleep(Duration::from_millis(250));
            theirs
                .write_all(&answer(METHOD_RETURN, calls[1].0, None, "late text"))
                .unwrap();
            for (serial, member) in read_calls(&mut theirs, 1) {
                theirs.write_all(&answer(METHOD_RETURN, serial, None, &member)).unwrap();
            }
        });
        let mut bus = Bus::over(ours, Duration::from_secs(5)).unwrap();
        let started = std::time::Instant::now();
        let deadline = started + Duration::from_millis(300);
        let got = bus.calls_until(&[call("Count"), call("GetText")], deadline).unwrap();
        let waited = started.elapsed();
        assert_eq!(got, None, "the second reply came after the deadline");
        assert!(
            waited >= Duration::from_millis(290) && waited < Duration::from_millis(390),
            "{waited:?}"
        );
        assert_eq!(bus.in_flight(), 0, "the calls are abandoned");
        // the late reply is discarded when it comes: the next call gets its own
        assert_eq!(bus.call(&call("Next")).unwrap(), Ok(vec![Value::Str("Next".into())]));
        server.join().unwrap();
    }

    #[test]
    fn calls_with_a_deadline_answer_in_order_when_every_reply_is_in_time() {
        let (ours, mut theirs) = UnixStream::pair().unwrap();
        let server = std::thread::spawn(move || {
            let mut calls = read_calls(&mut theirs, 2);
            calls.reverse();
            for (serial, member) in calls {
                theirs.write_all(&answer(METHOD_RETURN, serial, None, &member)).unwrap();
            }
        });
        let mut bus = Bus::over(ours, Duration::from_secs(5)).unwrap();
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        let got = bus.calls_until(&[call("A"), call("B")], deadline).unwrap();
        assert_eq!(
            got,
            Some(vec![Ok(vec![Value::Str("A".into())]), Ok(vec![Value::Str("B".into())])])
        );
        server.join().unwrap();
    }

    #[test]
    fn a_closed_bus_is_reported_as_broken() {
        let (ours, theirs) = UnixStream::pair().unwrap();
        drop(theirs);
        let mut bus = Bus::over(ours, Duration::from_secs(1)).unwrap();
        bus.send(&call("A"));
        let error = bus.recv().unwrap_err();
        assert!(error.downcast_ref::<Broken>().is_some(), "{error}");
    }
}
