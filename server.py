"""
Gemini Chat Studio - Unified AI Hub Server
Serves the Chat Studio web frontend and provides a modular Plugin Hub
for RiroSchool and any future services.
"""
import os
import sys
import json
import socket
import logging
import threading
import time
import webbrowser
import yaml
from typing import Dict, Any, Optional, List
from contextlib import asynccontextmanager

if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

from fastapi import FastAPI, HTTPException, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse, Response
import httpx
import uvicorn

# Add current dir to sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if getattr(sys, 'frozen', False):
    # PyInstaller bundle dir
    BUNDLE_DIR = sys._MEIPASS
    EXE_DIR = os.path.dirname(sys.executable)
else:
    BUNDLE_DIR = BASE_DIR
    EXE_DIR = BASE_DIR

if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
if BUNDLE_DIR not in sys.path:
    sys.path.insert(0, BUNDLE_DIR)

from plugins import PluginManager, RiroSchoolPlugin, SystemPlugin, NeisPlugin

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("gemini-hub-server")

# Load Configuration
def load_config() -> Dict[str, Any]:
    # Check config.yaml next to exe/script first, then in bundle
    candidates = [
        os.path.join(EXE_DIR, "config.yaml"),
        os.path.join(BASE_DIR, "config.yaml"),
        os.path.join(BUNDLE_DIR, "config.yaml")
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    return yaml.safe_load(f) or {}
            except Exception as e:
                logger.warning(f"Failed to read {p}: {e}")
    return {}

config = load_config()
server_cfg = config.get("server", {})
plugins_cfg = config.get("plugins", {})

HOST = server_cfg.get("host", "0.0.0.0")
PORT = int(server_cfg.get("port", 8000))
OPEN_BROWSER = bool(server_cfg.get("open_browser", True))
GITHUB_PAGES_URL = server_cfg.get("github_pages_url", "").strip()

# Initialize Plugin Manager
plugin_manager = PluginManager()

def init_plugins():
    # 1. RiroSchool Plugin
    riro_cfg = plugins_cfg.get("riroschool", {})
    riro_enabled = riro_cfg.get("enabled", True)
    riro_plugin = RiroSchoolPlugin()
    plugin_manager.register_plugin(riro_plugin, config=riro_cfg, enabled=riro_enabled)

    # 2. System Monitor Plugin (Example of multi-service extensibility)
    sys_cfg = plugins_cfg.get("system", {})
    sys_enabled = sys_cfg.get("enabled", True)
    sys_plugin = SystemPlugin()
    plugin_manager.register_plugin(sys_plugin, config=sys_cfg, enabled=sys_enabled)

    # 3. NEIS Open API Plugin (Academic Calendar & Timetable)
    neis_cfg = plugins_cfg.get("neis", {})
    neis_enabled = neis_cfg.get("enabled", True)
    neis_plugin = NeisPlugin()
    plugin_manager.register_plugin(neis_plugin, config=neis_cfg, enabled=neis_enabled)

    logger.info(f"Loaded {len(plugin_manager.list_plugins())} plugins.")

init_plugins()

# FastAPI Lifecycle
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Gemini Chat Studio Hub Server...")
    yield
    logger.info("Shutting down plugins...")
    plugin_manager.shutdown()

app = FastAPI(
    title="Gemini Chat Studio Hub Server",
    description="Unified API & Web Host for Gemini Chat Studio and Pluggable Services",
    version="2.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# REST API Endpoints
# -----------------------------------------------------------------------------

def get_lan_ips() -> List[str]:
    """Finds all non-loopback IPv4 addresses on the host."""
    ips = []
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127."):
                ips.append(ip)
    except Exception:
        pass
    return ips

@app.get("/api/status")
async def api_status():
    """Health check & server discovery info."""
    return {
        "status": "online",
        "version": "2.0.0",
        "port": PORT,
        "local_url": f"http://localhost:{PORT}",
        "lan_urls": [f"http://{ip}:{PORT}" for ip in get_lan_ips()],
        "active_plugins": len(plugin_manager.list_plugins()),
        "tools_count": len(plugin_manager.get_gemini_declarations())
    }

@app.get("/api/plugins")
async def api_list_plugins():
    """Returns all registered plugins and their tools."""
    return {
        "success": True,
        "plugins": plugin_manager.list_plugins()
    }

@app.post("/api/plugins/{plugin_id}/toggle")
async def api_toggle_plugin(plugin_id: str, body: Optional[Dict[str, Any]] = None):
    """Enable or disable a plugin."""
    enabled = body.get("enabled") if body else None
    state = plugin_manager.toggle_plugin(plugin_id, enabled=enabled)
    return {
        "success": True,
        "plugin_id": plugin_id,
        "enabled": state
    }

@app.get("/api/tools/declarations")
async def api_get_tool_declarations():
    """Returns Gemini FunctionDeclaration schemas for all enabled plugins."""
    declarations = plugin_manager.get_gemini_declarations(only_enabled=True)
    return {
        "success": True,
        "declarations": declarations
    }

@app.post("/api/tools/execute")
async def api_execute_tool(payload: Dict[str, Any] = Body(...)):
    """Executes a tool call requested by Gemini."""
    tool_name = payload.get("name")
    args = payload.get("args") or payload.get("parameters") or {}
    if not tool_name:
        raise HTTPException(status_code=400, detail="Tool 'name' is required.")

    result = await plugin_manager.execute_tool(tool_name, args)
    return result

@app.post("/api/riroschool/login")
async def api_riroschool_login(payload: Dict[str, Any] = Body(...)):
    """Logs in to RiroSchool and stores session."""
    user_id = payload.get("user_id")
    password = payload.get("password")
    user_type = payload.get("user_type", "1")

    if not user_id or not password:
        raise HTTPException(status_code=400, detail="user_id and password are required.")

    riro_plugin = plugin_manager.get_plugin("riroschool")
    if not riro_plugin or not riro_plugin._client:
        raise HTTPException(status_code=500, detail="RiroSchool plugin not initialized.")

    res = riro_plugin._client.login(user_id=user_id, password=password, user_type=user_type)
    return res

# -----------------------------------------------------------------------------
# Static Web Frontend Hosting
# -----------------------------------------------------------------------------

def find_web_asset(filename: str) -> Optional[str]:
    for base in [BUNDLE_DIR, BASE_DIR, EXE_DIR]:
        path = os.path.join(base, filename)
        if os.path.exists(path):
            return path
    return None

@app.get("/")
async def serve_index(request: Request):
    """
    Serves the web client. If github_pages_url is configured, fetches the latest
    HTML from GitHub Pages, injects the server host for API routing, and serves it!
    Otherwise falls back to the bundled local index.html.
    """
    if GITHUB_PAGES_URL:
        try:
            target_url = GITHUB_PAGES_URL
            if not target_url.endswith(".html") and not target_url.endswith("/"):
                target_url += "/"
            if target_url.endswith("/"):
                target_url += "index.html"

            async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
                res = await client.get(target_url)
                if res.status_code == 200:
                    html = res.text
                    # Inject hub server origin info
                    host_hdr = request.headers.get("host", f"localhost:{PORT}")
                    proto = request.headers.get("x-forwarded-proto", "http")
                    server_origin = f"{proto}://{host_hdr}"
                    inject_tag = f'<script>window.DEFAULT_HUB_SERVER = "{server_origin}";</script>'
                    if "</head>" in html:
                        html = html.replace("</head>", f"{inject_tag}\n</head>", 1)
                    else:
                        html = inject_tag + html
                    return HTMLResponse(content=html, media_type="text/html")
        except Exception as e:
            logger.warning(f"Could not load index.html from GitHub Pages ({GITHUB_PAGES_URL}): {e}. Using local.")

    index_path = find_web_asset("index.html")
    if index_path:
        return FileResponse(index_path, media_type="text/html")
    return JSONResponse(status_code=404, content={"error": "index.html not found"})

@app.get("/style.css")
async def serve_css():
    if GITHUB_PAGES_URL:
        try:
            base_url = GITHUB_PAGES_URL.rsplit('/', 1)[0] if GITHUB_PAGES_URL.endswith('.html') else GITHUB_PAGES_URL.rstrip('/')
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                res = await client.get(f"{base_url}/style.css")
                if res.status_code == 200:
                    return Response(content=res.content, media_type="text/css")
        except Exception:
            pass

    css_path = find_web_asset("style.css")
    if css_path:
        return FileResponse(css_path, media_type="text/css")
    return JSONResponse(status_code=404, content={"error": "style.css not found"})

@app.get("/app.js")
async def serve_js():
    if GITHUB_PAGES_URL:
        try:
            base_url = GITHUB_PAGES_URL.rsplit('/', 1)[0] if GITHUB_PAGES_URL.endswith('.html') else GITHUB_PAGES_URL.rstrip('/')
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                res = await client.get(f"{base_url}/app.js")
                if res.status_code == 200:
                    return Response(content=res.content, media_type="application/javascript")
        except Exception:
            pass

    js_path = find_web_asset("app.js")
    if js_path:
        return FileResponse(js_path, media_type="application/javascript")
    return JSONResponse(status_code=404, content={"error": "app.js not found"})


# Print Startup Banner
def print_banner():
    lan_ips = get_lan_ips()
    primary_ip = lan_ips[0] if lan_ips else "127.0.0.1"

    print("=" * 72)
    print("  [Gemini Chat Studio] 통합 AI 서비스 허브 서버 (Hub Server)")
    print("=" * 72)
    print(f"  * 로컬 접속 주소:     http://localhost:{PORT}")
    print(f"  * 스마트폰/외부 접속: http://{primary_ip}:{PORT}")
    print("-" * 72)
    print("  * 활성화된 서비스 플러그인:")
    for p in plugin_manager.list_plugins():
        status_txt = "활성 [ON]" if p["enabled"] else "비활성 [OFF]"
        tools_cnt = len(p["tools"])
        p_name = p.get('name', p['id'])
        print(f"    - {p_name} ({p['id']}): {tools_cnt}개 도구 제공 [{status_txt}]")
    print("-" * 72)
    print("  * 다른 서비스를 추가하려면 'plugins/' 폴더에 새 .py 파일을 넣으면 자동 연동됩니다.")
    print("  * 서버를 종료하려면 터미널에서 Ctrl + C 를 누르세요.")
    print("=" * 72 + "\n")


class ServerThread(threading.Thread):
    def __init__(self, uvicorn_app, host: str, port: int):
        super().__init__(daemon=True)
        self.app = uvicorn_app
        self.host = host
        self.port = port
        self.config = uvicorn.Config(app=self.app, host=self.host, port=self.port, log_level="info")
        self.server = uvicorn.Server(self.config)

    def run(self):
        try:
            self.server.run()
        except Exception as e:
            logger.error(f"Uvicorn server error: {e}")

    def stop(self):
        if self.server:
            self.server.should_exit = True


def is_port_free(host: str, port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind((host, port))
            return True
    except OSError:
        return False


def main():
    global PORT
    print_banner()

    is_headless = "--headless" in sys.argv or "--cli" in sys.argv or os.environ.get("HEADLESS") == "1"

    # Check if port is available
    if not is_port_free(HOST, PORT):
        logger.warning(f"Port {PORT} is already in use.")
        # Check if already a running Gemini Hub Server
        already_running = False
        try:
            with httpx.Client(timeout=1.2) as client:
                r = client.get(f"http://localhost:{PORT}/api/status")
                if r.status_code == 200 and r.json().get("status") == "online":
                    already_running = True
        except Exception:
            pass

        if already_running:
            logger.info(f"Existing Gemini Hub Server detected on port {PORT}. Reusing active instance.")
            if OPEN_BROWSER:
                webbrowser.open(f"http://localhost:{PORT}")
            if not is_headless:
                try:
                    from hub_gui import HubGuiDashboard
                    gui = HubGuiDashboard(host=HOST, port=PORT, plugin_manager=plugin_manager)
                    gui.run()
                    return
                except Exception as e:
                    logger.error(f"Failed to launch GUI: {e}")
            return
        else:
            # Find next free port
            for p in range(PORT + 1, PORT + 20):
                if is_port_free(HOST, p):
                    logger.info(f"Switched to available port {p}")
                    PORT = p
                    break

    # Start server in daemon thread
    server_thread = ServerThread(app, HOST, PORT)
    server_thread.start()

    if OPEN_BROWSER:
        def open_tab():
            time.sleep(1.2)
            webbrowser.open(f"http://localhost:{PORT}")
        threading.Thread(target=open_tab, daemon=True).start()

    if is_headless:
        logger.info("Running in headless console mode. Press Ctrl+C to terminate.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            server_thread.stop()
    else:
        try:
            from hub_gui import HubGuiDashboard
            gui = HubGuiDashboard(host=HOST, port=PORT, plugin_manager=plugin_manager, on_close_callback=server_thread.stop)
            gui.run()
        except Exception as e:
            logger.error(f"Desktop GUI unavailable or failed to launch ({e}). Falling back to console.")
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                server_thread.stop()


if __name__ == "__main__":
    main()
