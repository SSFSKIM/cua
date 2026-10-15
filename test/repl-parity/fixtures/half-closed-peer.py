# Harness-owned Unix transport error peer: abort on the first byte, leaving the remainder unread.
import json
import selectors
import socket
import struct
import sys

server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
server.bind(sys.argv[1])
server.listen(4)
selector = selectors.DefaultSelector()
selector.register(server, selectors.EVENT_READ)
selector.register(sys.stdin, selectors.EVENT_READ)
connections = set()
print(json.dumps({"ready": True, "path": sys.argv[1]}), flush=True)
try:
    running = True
    while running:
        for key, _ in selector.select():
            if key.fileobj is sys.stdin:
                if not sys.stdin.buffer.read(1):
                    running = False
            elif key.fileobj is server:
                connection, _ = server.accept()
                connections.add(connection)
                selector.register(connection, selectors.EVENT_READ)
            else:
                connection = key.fileobj
                connection.recv(1)
                connection.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack('ii', 1, 0))
                selector.unregister(connection)
                connections.remove(connection)
                connection.close()
finally:
    for connection in connections:
        connection.close()
    selector.close()
    server.close()
