"""Small dependency-free Jol demo server. Run with: py -3 server.py"""
import json, os, secrets, threading, time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
REPORTS_FILE = os.path.join(DATA_DIR, "reports.json")
HOST, PORT = "127.0.0.1", 8000
sessions = {}
lock = threading.Lock()
class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
SEED = [
    {"id": 1, "city": "Bengaluru", "place": "100 Feet Road, Indiranagar", "latitude": 12.9784, "longitude": 77.6408, "time": "8 min ago", "depth": "0.4m", "status": "safe", "label": "Passable", "thumb": "", "confidence": "Medium", "observations": "Kerb visible"},
    {"id": 2, "city": "Bengaluru", "place": "CMH Road, Halasuru", "latitude": 12.9785, "longitude": 77.6245, "time": "21 min ago", "depth": "0.8m", "status": "caution", "label": "Caution", "thumb": "thumb-amber", "confidence": "Medium", "observations": "Reported from roadside"},
    {"id": 3, "city": "Bengaluru", "place": "Old Airport Road underpass", "latitude": 12.9591, "longitude": 77.6531, "time": "34 min ago", "depth": "1.2m", "status": "blocked", "label": "Blocked", "thumb": "thumb-red", "confidence": "High", "observations": "Vehicle wheels partly submerged"},
    {"id": 4, "city": "Bengaluru", "place": "12th Main, Domlur", "latitude": 12.9602, "longitude": 77.6387, "time": "48 min ago", "depth": "0.2m", "status": "safe", "label": "Passable", "thumb": "", "confidence": "Low", "observations": "Visual estimate"},
]

def load_reports():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(REPORTS_FILE):
        save_reports(SEED)
    try:
        with open(REPORTS_FILE, encoding="utf-8") as f: return json.load(f)
    except (OSError, ValueError): return list(SEED)

def save_reports(reports):
    os.makedirs(DATA_DIR, exist_ok=True)
    temp = REPORTS_FILE + ".tmp"
    with open(temp, "w", encoding="utf-8") as f: json.dump(reports, f, indent=2)
    os.replace(temp, REPORTS_FILE)

def user_for(handler):
    cookie = handler.headers.get("Cookie", "")
    token = next((p.strip().split("=", 1)[1] for p in cookie.split(";") if p.strip().startswith("jol_session=")), None)
    return sessions.get(token) if token else None

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): print("%s - %s" % (self.address_string(), fmt % args))
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "http://127.0.0.1:8000"))
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    def send_json(self, code, payload, extra=None):
        raw = json.dumps(payload).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(raw))); self.cors()
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(raw)
    def body(self):
        try: return json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        except (ValueError, TypeError): return {}
    def do_OPTIONS(self): self.send_response(204); self.cors(); self.end_headers()
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health": return self.send_json(200, {"ok": True, "service": "jol"})
        if path == "/api/session":
            user = user_for(self)
            return self.send_json(200, {"authenticated": True, "user": user} if user else {"authenticated": False}, None if user else {}) if user else self.send_json(401, {"error": "Not authenticated"})
        if path == "/api/reports":
            if not user_for(self): return self.send_json(401, {"error": "Not authenticated"})
            city = parse_qs(urlparse(self.path).query).get("city", [""])[0].strip()
            reports = load_reports()
            if city:
                reports = [r for r in reports if str(r.get("city", "")).casefold() == city.casefold()]
            return self.send_json(200, {"reports": reports, "city": city or None})
        return self.static(path)
    def do_POST(self):
        path = urlparse(self.path).path; data = self.body()
        if path == "/api/login":
            name, email, password = str(data.get("name", "")).strip(), str(data.get("email", "")).strip(), str(data.get("password", ""))
            if not name or not email or not password: return self.send_json(400, {"error": "Name, email and password are required."})
            if email == "demo@jol.app" and password != "jol-demo": return self.send_json(401, {"error": "That demo password is not correct."})
            token = secrets.token_urlsafe(32); user = {"name": name[:40], "email": email}; sessions[token] = user
            return self.send_json(200, {"user": user}, {"Set-Cookie": f"jol_session={token}; Path=/; SameSite=Lax"})
        if path == "/api/logout":
            cookie = self.headers.get("Cookie", ""); token = next((p.strip().split("=",1)[1] for p in cookie.split(";") if p.strip().startswith("jol_session=")), None)
            if token: sessions.pop(token, None)
            return self.send_json(200, {"ok": True}, {"Set-Cookie": "jol_session=; Path=/; Max-Age=0; SameSite=Lax"})
        if path == "/api/reports":
            if not user_for(self): return self.send_json(401, {"error": "Not authenticated"})
            place, depth, status = str(data.get("place", data.get("location", ""))).strip(), str(data.get("depth", "")).strip(), str(data.get("status", "safe")).strip()
            if not place or not depth or status not in ("safe", "caution", "blocked"): return self.send_json(400, {"error": "place, depth and a valid status are required."})
            city = str(data.get("city", "Bengaluru")).strip() or "Bengaluru"
            report = {"id": int(time.time() * 1000), "city": city, "place": place, "time": "just now", "depth": depth, "status": status, "label": {"safe":"Passable","caution":"Caution","blocked":"Blocked"}[status], "thumb": "", "photoName": str(data.get("photoName", "")), "confidence": "Advisory", "observations": "Community-reported visual observation"}
            reports = load_reports(); reports.insert(0, report); save_reports(reports)
            return self.send_json(201, {"report": report})
        return self.send_json(404, {"error": "Not found"})
    def static(self, path):
        filename = "index.html" if path in ("", "/") else path.lstrip("/")
        full = os.path.abspath(os.path.join(ROOT, filename))
        if not full.startswith(ROOT) or not os.path.isfile(full): return self.send_json(404, {"error": "Not found"})
        content = open(full, "rb").read(); types={".html":"text/html", ".css":"text/css", ".js":"application/javascript"}
        self.send_response(200); self.send_header("Content-Type", types.get(os.path.splitext(full)[1], "application/octet-stream")); self.send_header("Content-Length", str(len(content))); self.cors(); self.end_headers(); self.wfile.write(content)

if __name__ == "__main__":
    load_reports(); print(f"Jol running at http://{HOST}:{PORT}"); ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
