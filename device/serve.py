"""Local server for the simulator: static files plus a tiny message relay between the device screens.

Usage:  python serve.py [port] [--lan]
  default   http://localhost:8765  (this computer only)
  --lan     also reachable from other devices on the same network (helmet / tablet / base on separate machines)

Relay: POST /bus with a JSON body → forwarded to every client listening on GET /bus (Server-Sent Events).
GET /bus/hello tells a page that the relay is there. Messages are not stored; the relay only forwards them.
Explicit MIME types are set because the Windows registry can map .js wrongly.
"""
import functools
import http.server
import json
import queue
import socket
import sys
import threading
from pathlib import Path

args = [a for a in sys.argv[1:] if not a.startswith("--")]
PORT = int(args[0]) if args else 8765
LAN = "--lan" in sys.argv
MAX_BODY = 256 * 1024

clients: set[queue.Queue] = set()
clients_lock = threading.Lock()


def lan_addresses():
    try:
        return sorted({a for a in socket.gethostbyname_ex(socket.gethostname())[2] if not a.startswith("127.")})
    except OSError:
        return []


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
        ".css": "text/css", ".html": "text/html", ".f32": "application/octet-stream", ".jpg": "image/jpeg",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *a):          # keep the console quiet about relay traffic
        if "/bus" not in (self.path or ""):
            super().log_message(fmt, *a)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/bus/hello":
            body = json.dumps({"relay": True, "lan": LAN, "port": PORT, "addresses": lan_addresses() if LAN else []}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/bus":
            return self.stream()
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/bus":
            self.send_error(404)
            return
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY:
            self.send_error(413)
            return
        data = self.rfile.read(n)
        try:
            json.loads(data)
        except ValueError:
            self.send_error(400)
            return
        line = b"data: " + data.replace(b"\n", b" ") + b"\n\n"
        with clients_lock:
            for q in list(clients):
                try:
                    q.put_nowait(line)
                except queue.Full:   # a stalled listener just misses messages
                    pass
        self.send_response(204)
        self.end_headers()

    def stream(self):
        q: queue.Queue = queue.Queue(maxsize=200)
        with clients_lock:
            clients.add(q)
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            self.wfile.write(b"retry: 1500\n\n")
            self.wfile.flush()
            while True:
                try:
                    msg = q.get(timeout=15)
                except queue.Empty:
                    msg = b": keep-alive\n\n"
                self.wfile.write(msg)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass
        finally:
            with clients_lock:
                clients.discard(q)


if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    host = "0.0.0.0" if LAN else "127.0.0.1"
    srv = http.server.ThreadingHTTPServer((host, PORT), functools.partial(Handler, directory=str(root)))
    srv.daemon_threads = True
    print(f"serving {root} at http://localhost:{PORT}")
    if LAN:
        for a in lan_addresses():
            print(f"  other devices on this network: http://{a}:{PORT}")
        print("  (anyone on this network can open these pages — use only on a network you trust)")
    srv.serve_forever()
