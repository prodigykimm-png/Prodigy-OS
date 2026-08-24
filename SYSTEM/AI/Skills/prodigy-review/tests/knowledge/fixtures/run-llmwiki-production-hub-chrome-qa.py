#!/usr/bin/env python3
"""Capture the real Knowledge Hub/App Shell through CDP, including a 375px physical viewport at 200% reflow."""
from pathlib import Path
from PIL import Image, ImageDraw
import base64, hashlib, http.server, io, json, os, socket, struct, subprocess, tempfile, threading, urllib.request

ROOT = Path(__file__).resolve().parents[7]
CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
OUT = Path(os.environ.get("TASK15_PRODUCTION_CHROME_OUT", ROOT / ".omo/evidence/prodigy-llmwiki-autonomous-knowledge-git/task-15/post-audit/production-chrome"))
STATES = ["first-run", "approval", "conflict", "committed", "followup-failure", "recovery"]
VIEWPORTS = [(390, 900, 1, 390, 900), (820, 1000, 1, 820, 1000), (1440, 1100, 1, 1440, 1100), (375, 812, 2, 188, 406)]

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args): pass

def websocket(url):
    from urllib.parse import urlparse
    parsed = urlparse(url); sock = socket.create_connection((parsed.hostname, parsed.port), timeout=20)
    key = base64.b64encode(os.urandom(16)).decode()
    request = f"GET {parsed.path} HTTP/1.1\r\nHost: {parsed.hostname}:{parsed.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    sock.sendall(request.encode()); response = b""
    while b"\r\n\r\n" not in response: response += sock.recv(4096)
    if b" 101 " not in response.split(b"\r\n", 1)[0]: raise RuntimeError("cdp_websocket_upgrade_failed")
    return sock

def send_frame(sock, value):
    payload = json.dumps(value, separators=(",", ":")).encode(); mask = os.urandom(4); size = len(payload)
    head = bytearray([0x81, 0x80 | (size if size < 126 else 126 if size < 65536 else 127)])
    if size >= 126: head.extend(struct.pack("!H" if size < 65536 else "!Q", size))
    head.extend(mask); head.extend(bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload))); sock.sendall(head)

def recv_frame(sock):
    first, second = sock.recv(2); size = second & 0x7f
    if size == 126: size = struct.unpack("!H", sock.recv(2))[0]
    elif size == 127: size = struct.unpack("!Q", sock.recv(8))[0]
    masked = second & 0x80; mask = sock.recv(4) if masked else b""; payload = b""
    while len(payload) < size: payload += sock.recv(size - len(payload))
    if masked: payload = bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload))
    return json.loads(payload.decode())

class CDP:
    def __init__(self, sock): self.sock, self.seq, self.events = sock, 0, []
    def command(self, method, params=None):
        self.seq += 1; wanted = self.seq; send_frame(self.sock, {"id": wanted, "method": method, "params": params or {}})
        while True:
            message = recv_frame(self.sock)
            if message.get("id") == wanted:
                if "error" in message: raise RuntimeError(message["error"])
                return message.get("result", {})
            self.events.append(message)
    def event(self, method):
        for index, message in enumerate(self.events):
            if message.get("method") == method: return self.events.pop(index)
        while True:
            message = recv_frame(self.sock)
            if message.get("method") == method: return message
            self.events.append(message)

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), lambda *args, **kwargs: Quiet(*args, directory=str(ROOT), **kwargs))
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start(); port = server.server_address[1]
    profile = tempfile.TemporaryDirectory(prefix="task15-production-chrome-")
    process = subprocess.Popen([str(CHROME), "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-background-networking", "--disable-component-update", "--remote-debugging-port=0", f"--user-data-dir={profile.name}", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    try:
        debug_port = None
        for line in process.stderr:
            if "DevTools listening on" in line:
                debug_port = int(line.split(":")[-1].split("/")[0]); break
        if not debug_port: raise RuntimeError("devtools_endpoint_unavailable")
        targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{debug_port}/json")); page = next(item for item in targets if item["type"] == "page")
        cdp = CDP(websocket(page["webSocketDebuggerUrl"])); cdp.command("Page.enable"); cdp.command("Runtime.enable"); cdp.command("Runtime.addBinding", {"name": "task15Ready"}); cdp.command("Page.addScriptToEvaluateOnNewDocument", {"source": "document.addEventListener('task15-ready',e=>task15Ready(JSON.stringify(e.detail)),{once:true})"})
        rows = []
        for physical_width, physical_height, zoom, css_width, css_height in VIEWPORTS:
            cdp.command("Emulation.setDeviceMetricsOverride", {"width": css_width, "height": css_height, "deviceScaleFactor": zoom, "mobile": False, "screenWidth": physical_width, "screenHeight": physical_height})
            for state in STATES:
                cdp.command("Page.navigate", {"url": f"http://127.0.0.1:{port}/SYSTEM/AI/Skills/prodigy-review/tests/knowledge/fixtures/llmwiki-production-hub-qa.html?state={state}"})
                event = cdp.event("Runtime.bindingCalled"); detail = json.loads(event["params"]["payload"])
                if detail.get("error"): raise RuntimeError(f"{state}:{detail['error']}")
                result = cdp.command("Runtime.evaluate", {"expression": "JSON.stringify(window.__task15ProductionQA)", "returnByValue": True})
                metrics = json.loads(result["result"]["value"])
                if metrics["metrics"]["body_scroll_width"] > metrics["metrics"]["inner_width"]: raise RuntimeError(f"horizontal_overflow:{state}:{physical_width}:{zoom}")
                if metrics["scroll"]["effective_vertical_owners"] > 1: raise RuntimeError(f"nested_scroll:{state}:{physical_width}:{zoom}")
                if state in ["approval", "conflict"] and metrics["metrics"]["primary_hit"] and metrics["metrics"]["primary_hit"]["height"] < 44: raise RuntimeError("primary_target_too_small")
                if state == "approval" and metrics["metrics"]["selection_hit"] and metrics["metrics"]["selection_hit"]["height"] < 44: raise RuntimeError("selection_target_too_small")
                png = base64.b64decode(cdp.command("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})["data"])
                if zoom == 2:
                    capture = Image.open(io.BytesIO(png))
                    capture = capture.crop((0, 0, physical_width, physical_height))
                    encoded = io.BytesIO(); capture.save(encoded, "PNG"); png = encoded.getvalue()
                if Image.open(io.BytesIO(png)).size != (physical_width, physical_height): raise RuntimeError("physical_capture_size_mismatch")
                suffix = f"{physical_width}x{physical_height}" + ("-zoom200" if zoom == 2 else "")
                target = OUT / f"{state}-{suffix}.png"; target.write_bytes(png)
                rows.append({"state": state, "physical_width": physical_width, "physical_height": physical_height, "browser_zoom": zoom, "css_viewport_width": css_width, "path": str(target.relative_to(ROOT)), "sha256": hashlib.sha256(png).hexdigest(), "metrics": metrics})
        sheet = Image.new("RGB", (900, len(STATES) * 230), "#d9d9de"); draw = ImageDraw.Draw(sheet)
        for row_index, state in enumerate(STATES):
            for col, (width, height, zoom, _cw, _ch) in enumerate(VIEWPORTS):
                suffix = f"{width}x{height}" + ("-zoom200" if zoom == 2 else ""); image = Image.open(OUT / f"{state}-{suffix}.png").convert("RGB"); image.thumbnail((210, 190)); x, y = col * 225, row_index * 230; draw.text((x, y), f"{suffix} {state}", fill="#111"); sheet.paste(image, (x, y + 20))
        sheet.save(OUT / "contact-sheet.png")
        receipt = {"ok": True, "screens": len(rows), "production_hub": "HUB/50 Knowledge.md", "states": STATES, "viewports": [{"physical_width": w, "physical_height": h, "browser_zoom": z, "css_viewport_width": cw} for w, h, z, cw, _ in VIEWPORTS], "captures": rows}
        (OUT / "production-chrome-matrix.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({"ok": True, "screens": len(rows)}, ensure_ascii=False))
    finally:
        try: process.terminate(); process.wait(timeout=3)
        except Exception: process.kill()
        profile.cleanup(); server.shutdown(); server.server_close()

if __name__ == "__main__": main()
