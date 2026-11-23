#!/usr/bin/env python3
"""A proxy in front of the accessibility bus for the live tests (`live_device.rs`, the final review of wave 5).

    bus-stall-proxy.py <listen socket path> <upstream unix:path=... | unix:abstract=...>

Each connection made to it is relayed to the upstream bus, its bytes unchanged, until the test writes `stall` on stdin.
From then on, a connection's `GetChildren` call is answered by the proxy itself with thousands of children, and the proxy
stops reading that connection: the engine's next batch (one call per child) fills the socket and its write blocks, as a
bus that stops draining leaves it. `forward` puts later calls and connections back to the relay. The proxy prints
`ready` once listening, `ok` after each command, and `stalled` each time it stalls a connection.
"""
import os
import socket
import struct
import sys
import threading

LISTEN, UPSTREAM = sys.argv[1], sys.argv[2]
CHILDREN = 6000
mode = {'stall': False}
lock = threading.Lock()


def say(line):
    with lock:
        print(line, flush=True)


def upstream():
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    address = UPSTREAM.split(';')[0][len('unix:'):]
    keys = dict(kv.split('=', 1) for kv in address.split(','))
    s.connect(keys['path'] if 'path' in keys else '\0' + keys['abstract'])
    return s


def pad(buf, n):
    return buf + b'\0' * (-len(buf) % n)


def build_children_reply():
    """A little-endian method return of `a(so)` with CHILDREN references, its reply serial at bytes 20..24."""
    parts, size = [], 0
    path = b'/org/a11y/atspi/accessible/root'
    for i in range(CHILDREN):
        name = (':1.%d' % (100000 + i)).encode()
        # each struct at an 8-byte boundary from the array's first element (itself 8-aligned in the body)
        gap = -size % 8
        item = b'\0' * gap + struct.pack('<I', len(name)) + name + b'\0'
        item += b'\0' * (-(size + len(item)) % 4) + struct.pack('<I', len(path)) + path + b'\0'
        parts.append(item)
        size += len(item)
    items = b''.join(parts)
    body = struct.pack('<I', len(items)) + b'\0' * 4 + items
    fields = bytes([5, 1, ord('u'), 0]) + struct.pack('<I', 0)
    fields = pad(fields, 8) + bytes([8, 1, ord('g'), 0, 5]) + b'a(so)\0'
    header = b'l\x02\x00\x01' + struct.pack('<III', len(body), 7, len(fields)) + fields
    return pad(header, 8) + body


CHILDREN_REPLY = build_children_reply()


def children_reply(reply_serial):
    return CHILDREN_REPLY[:20] + struct.pack('<I', reply_serial) + CHILDREN_REPLY[24:]


def recv_exactly(s, n):
    buf = b''
    while len(buf) < n:
        chunk = s.recv(n - len(buf))
        if not chunk:
            return None
        buf += chunk
    return buf


def copy(src, dst):
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass


def serve(client):
    try:
        up = upstream()
    except OSError:
        client.close()
        return
    threading.Thread(target=copy, args=(up, client), daemon=True).start()
    # the authentication's lines, relayed as they come, up to BEGIN
    seen = b''
    try:
        while not seen.endswith(b'BEGIN\r\n'):
            byte = client.recv(1)
            if not byte:
                return
            seen += byte
            up.sendall(byte)
        while True:
            fixed = recv_exactly(client, 16)
            if fixed is None:
                return
            body_len, serial, fields_len = struct.unpack('<III', fixed[4:16])
            rest = recv_exactly(client, (-(16 + fields_len) % 8) + fields_len + body_len)
            if rest is None:
                return
            message = fixed + rest
            if mode['stall'] and b'GetChildren' in message:
                client.sendall(children_reply(serial))
                say('stalled')
                # this connection is never read again: its peer's writes fill the socket and block
                threading.Event().wait()
            up.sendall(message)
    except OSError:
        pass


def main():
    try:
        os.unlink(LISTEN)
    except FileNotFoundError:
        pass
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    listener.bind(LISTEN)
    listener.listen(16)

    def accept():
        while True:
            client, _ = listener.accept()
            threading.Thread(target=serve, args=(client,), daemon=True).start()

    threading.Thread(target=accept, daemon=True).start()
    say('ready')
    for line in sys.stdin:
        mode['stall'] = line.strip() == 'stall'
        say('ok')


main()
