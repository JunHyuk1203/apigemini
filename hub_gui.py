"""
Gemini Chat Studio - Hub Server Desktop GUI Dashboard
Provides a clean, native desktop monitoring window for GeminiHubServer.exe.
Includes Cloudflare HTTPS Tunneling for seamless remote / GitHub Pages access.
"""
import os
import sys
import time
import socket
import threading
import queue
import logging
import webbrowser
import subprocess
import re
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
from typing import Optional, Dict, Any

import psutil

GITHUB_PAGES_BASE = "https://junhyuk1203.github.io/apigemini/"


class QueueLogHandler(logging.Handler):
    """Logging handler that sends records to a thread-safe queue."""
    def __init__(self, log_queue: queue.Queue):
        super().__init__()
        self.log_queue = log_queue

    def emit(self, record):
        try:
            msg = self.format(record)
            self.log_queue.put(msg)
        except Exception:
            self.handleError(record)


class CloudflareTunnelManager:
    """Manages cloudflared tunnel to provide free public HTTPS URL."""
    def __init__(self, port: int, on_url_ready=None, on_log=None):
        self.port = port
        self.on_url_ready = on_url_ready
        self.on_log = on_log
        self.process = None
        self.tunnel_url = None
        self.is_running = False

    def find_executable(self) -> Optional[str]:
        candidates = [
            os.path.join(os.path.dirname(sys.executable if getattr(sys, 'frozen', False) else __file__), "cloudflared.exe"),
            os.path.join(os.getcwd(), "cloudflared.exe"),
            os.path.join(os.getcwd(), "dist", "cloudflared.exe"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "cloudflared.exe"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist", "cloudflared.exe"),
            os.path.expanduser("~/.cloudflared/cloudflared.exe"),
            "cloudflared.exe"
        ]
        for p in candidates:
            if os.path.exists(p):
                return p
        return None

    def start(self):
        exe_file = self.find_executable()
        if not exe_file:
            if self.on_log:
                self.on_log("[TUNNEL] cloudflared.exe를 찾을 수 없습니다. 외부 HTTPS 터널이 비활성화됩니다.")
            return

        self.is_running = True
        self.tunnel_url = None
        threading.Thread(target=self._run, args=(exe_file,), daemon=True).start()

    def _run(self, exe_file: str):
        try:
            if self.on_log:
                self.on_log("[TUNNEL] Cloudflare HTTPS 터널 연결을 시작합니다...")

            cmd = [exe_file, "tunnel", "--url", f"http://localhost:{self.port}"]
            startupinfo = None
            if sys.platform.startswith("win"):
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = 0

            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                startupinfo=startupinfo
            )

            for line in iter(self.process.stdout.readline, ""):
                if not self.is_running:
                    break
                line_str = line.strip()
                if "trycloudflare.com" in line_str:
                    m = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line_str)
                    if m and not self.tunnel_url:
                        self.tunnel_url = m.group(0)
                        if self.on_log:
                            self.on_log(f"[TUNNEL] 외부 HTTPS 주소 발급 완료: {self.tunnel_url}")
                        if self.on_url_ready:
                            self.on_url_ready(self.tunnel_url)

        except Exception as e:
            if self.on_log:
                self.on_log(f"[TUNNEL] 오류 발생: {e}")

    def stop(self):
        self.is_running = False
        if self.process:
            try:
                self.process.terminate()
            except Exception:
                pass
            self.process = None


class HubGuiDashboard:
    """Native Tkinter Desktop Dashboard for Gemini Hub Server."""

    def __init__(self, host: str, port: int, plugin_manager, on_close_callback=None):
        self.host = host
        self.port = port
        self.plugin_manager = plugin_manager
        self.on_close_callback = on_close_callback
        self.log_queue = queue.Queue()
        self.is_running = True
        self.tunnel_url = None

        # Setup Logging redirection
        self.handler = QueueLogHandler(self.log_queue)
        formatter = logging.Formatter("[%(asctime)s] %(levelname)s: %(message)s", datefmt="%H:%M:%S")
        self.handler.setFormatter(formatter)
        logging.getLogger().addHandler(self.handler)

        self._init_window()

        # Start Cloudflare Tunnel
        self.tunnel_manager = CloudflareTunnelManager(
            port=self.port,
            on_url_ready=self._on_tunnel_url_ready,
            on_log=self._log_internal
        )
        self.tunnel_manager.start()

    def _log_internal(self, msg: str):
        self.log_queue.put(f"[{time.strftime('%H:%M:%S')}] {msg}")

    def _init_window(self):
        self.root = tk.Tk()
        self.root.title("Gemini Chat Studio - 마산중앙고 AI 허브 서버")
        self.root.geometry("820x620")
        self.root.minsize(740, 520)

        # Dark Modern Palette
        self.c_bg = "#181825"
        self.c_card = "#1e1e2e"
        self.c_text = "#cdd6f4"
        self.c_dim = "#a6adc8"
        self.c_green = "#a6e3a1"
        self.c_blue = "#89b4fa"
        self.c_purple = "#cba6f7"
        self.c_border = "#313244"
        self.c_btn = "#45475a"

        self.root.configure(bg=self.c_bg)

        try:
            self.root.iconbitmap(default="")
        except Exception:
            pass

        # Configure TTK Styles
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TFrame", background=self.c_bg)
        style.configure("Card.TFrame", background=self.c_card, relief="flat")
        style.configure("TLabel", background=self.c_bg, foreground=self.c_text, font=("Malgun Gothic", 9))
        style.configure("Card.TLabel", background=self.c_card, foreground=self.c_text, font=("Malgun Gothic", 9))

        # Main Layout
        self._build_header()
        self._build_tunnel_card()
        self._build_services_panel()
        self._build_logs_section()
        self._build_footer()

        # Protocol handlers
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

        # Periodic Polling
        self.root.after(100, self._poll_logs)
        self.root.after(1000, self._update_system_stats)

    def _build_header(self):
        header = tk.Frame(self.root, bg=self.c_card, padx=18, pady=12, relief="flat", highlightbackground=self.c_border, highlightthickness=1)
        header.pack(fill="x", padx=14, pady=(12, 6))

        # Left: Title & Status
        left_box = tk.Frame(header, bg=self.c_card)
        left_box.pack(side="left", fill="y")

        title_lbl = tk.Label(left_box, text="🤖 Gemini Chat Studio 통합 허브 서버", bg=self.c_card, fg=self.c_text, font=("Malgun Gothic", 13, "bold"))
        title_lbl.pack(anchor="w")

        status_box = tk.Frame(left_box, bg=self.c_card)
        status_box.pack(anchor="w", pady=(3, 0))

        self.status_dot = tk.Label(status_box, text="●", bg=self.c_card, fg=self.c_green, font=("Malgun Gothic", 12))
        self.status_dot.pack(side="left")

        self.status_text = tk.Label(status_box, text=f"정상 작동 중 (Online) - 로컬 포트 {self.port}", bg=self.c_card, fg=self.c_green, font=("Malgun Gothic", 9, "bold"))
        self.status_text.pack(side="left", padx=4)

        self.url_label = tk.Label(status_box, text=f"http://localhost:{self.port}", bg=self.c_card, fg=self.c_blue, cursor="hand2", font=("Malgun Gothic", 9, "underline"))
        self.url_label.pack(side="left", padx=8)
        self.url_label.bind("<Button-1>", lambda e: self.open_browser())

        # Right: Open Local Browser Button
        right_box = tk.Frame(header, bg=self.c_card)
        right_box.pack(side="right", fill="y")

        open_btn = tk.Button(
            right_box,
            text="🌐 로컬 웹 열기",
            bg=self.c_blue,
            fg="#11111b",
            font=("Malgun Gothic", 9, "bold"),
            relief="flat",
            padx=12,
            pady=5,
            cursor="hand2",
            activebackground="#b4befe",
            command=self.open_browser
        )
        open_btn.pack(side="right")

    def _build_tunnel_card(self):
        """Card for External HTTPS Tunneling (Supports Remote & GitHub Pages)."""
        card = tk.Frame(self.root, bg=self.c_card, padx=16, pady=10, relief="flat", highlightbackground="#89b4fa", highlightthickness=1)
        card.pack(fill="x", padx=14, pady=(0, 6))

        top_row = tk.Frame(card, bg=self.c_card)
        top_row.pack(fill="x")

        tk.Label(top_row, text="⚡ 외부 및 스마트폰 접속 (GitHub Pages & 외부 PC 연동)", bg=self.c_card, fg=self.c_purple, font=("Malgun Gothic", 10, "bold")).pack(side="left")

        # Tunnel Status Label
        self.tunnel_status_lbl = tk.Label(top_row, text="⏳ Cloudflare HTTPS 터널 연결 중...", bg=self.c_card, fg=self.c_dim, font=("Malgun Gothic", 8))
        self.tunnel_status_lbl.pack(side="left", padx=8)

        # Action Buttons on Right
        btn_box = tk.Frame(card, bg=self.c_card)
        btn_box.pack(fill="x", pady=(6, 0))

        self.tunnel_url_display = tk.Label(btn_box, text="터널 주소 생성 중...", bg=self.c_card, fg="#89b4fa", font=("Consolas", 9))
        self.tunnel_url_display.pack(side="left")

        self.copy_link_btn = tk.Button(
            btn_box,
            text="📋 원클릭 외부 연동 링크 복사",
            bg=self.c_purple,
            fg="#11111b",
            font=("Malgun Gothic", 8, "bold"),
            relief="flat",
            padx=10,
            pady=3,
            cursor="hand2",
            state="disabled",
            command=self._copy_external_link
        )
        self.copy_link_btn.pack(side="right", padx=(6, 0))

        self.open_github_btn = tk.Button(
            btn_box,
            text="🌐 깃허브 웹 열기",
            bg="#a6e3a1",
            fg="#11111b",
            font=("Malgun Gothic", 8, "bold"),
            relief="flat",
            padx=10,
            pady=3,
            cursor="hand2",
            state="disabled",
            command=self._open_github_with_tunnel
        )
        self.open_github_btn.pack(side="right")

    def _on_tunnel_url_ready(self, url: str):
        self.tunnel_url = url
        self.root.after(0, self._update_tunnel_ui, url)

    def _update_tunnel_ui(self, url: str):
        self.tunnel_status_lbl.config(text="● HTTPS 터널 활성", fg=self.c_green)
        self.tunnel_url_display.config(text=f"터널 주소: {url}")
        self.copy_link_btn.config(state="normal")
        self.open_github_btn.config(state="normal")

    def _copy_external_link(self):
        if not self.tunnel_url:
            return
        link = f"{GITHUB_PAGES_BASE}?server={self.tunnel_url}"
        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(link)
            self.root.update()
            self.copy_link_btn.config(text="✓ 링크 복사 완료!")
            self.root.after(2000, lambda: self.copy_link_btn.config(text="📋 원클릭 외부 연동 링크 복사"))
        except Exception:
            pass

    def _open_github_with_tunnel(self):
        if not self.tunnel_url:
            return
        link = f"{GITHUB_PAGES_BASE}?server={self.tunnel_url}"
        webbrowser.open(link)

    def _build_services_panel(self):
        panel = tk.Frame(self.root, bg=self.c_bg)
        panel.pack(fill="x", padx=14, pady=2)

        # 3 Service Cards (RiroSchool, NEIS, System)
        card_riro = tk.Frame(panel, bg=self.c_card, padx=12, pady=8, highlightbackground=self.c_border, highlightthickness=1)
        card_riro.pack(side="left", fill="both", expand=True, padx=(0, 5))

        tk.Label(card_riro, text="🏫 마산중앙고 리로스쿨", bg=self.c_card, fg=self.c_text, font=("Malgun Gothic", 9, "bold")).pack(anchor="w")
        self.riro_status_lbl = tk.Label(card_riro, text="확인 중...", bg=self.c_card, fg=self.c_dim, font=("Malgun Gothic", 8))
        self.riro_status_lbl.pack(anchor="w", pady=(2, 0))

        card_neis = tk.Frame(panel, bg=self.c_card, padx=12, pady=8, highlightbackground=self.c_border, highlightthickness=1)
        card_neis.pack(side="left", fill="both", expand=True, padx=3)

        tk.Label(card_neis, text="🎓 교육부 나이스 (NEIS)", bg=self.c_card, fg=self.c_text, font=("Malgun Gothic", 9, "bold")).pack(anchor="w")
        self.neis_status_lbl = tk.Label(card_neis, text="확인 중...", bg=self.c_card, fg=self.c_dim, font=("Malgun Gothic", 8))
        self.neis_status_lbl.pack(anchor="w", pady=(2, 0))

        card_sys = tk.Frame(panel, bg=self.c_card, padx=12, pady=8, highlightbackground=self.c_border, highlightthickness=1)
        card_sys.pack(side="left", fill="both", expand=True, padx=(5, 0))

        tk.Label(card_sys, text="💻 서버 하드웨어", bg=self.c_card, fg=self.c_text, font=("Malgun Gothic", 9, "bold")).pack(anchor="w")
        self.sys_status_lbl = tk.Label(card_sys, text="CPU: --% | RAM: --%", bg=self.c_card, fg=self.c_dim, font=("Malgun Gothic", 8))
        self.sys_status_lbl.pack(anchor="w", pady=(2, 0))

        self._refresh_plugin_status()

    def _build_logs_section(self):
        log_frame = tk.Frame(self.root, bg=self.c_card, highlightbackground=self.c_border, highlightthickness=1)
        log_frame.pack(fill="both", expand=True, padx=14, pady=(6, 6))

        log_header = tk.Frame(log_frame, bg=self.c_card, padx=12, pady=5)
        log_header.pack(fill="x")

        tk.Label(log_header, text="📜 실시간 서버 활동 및 도구 호출 로그", bg=self.c_card, fg=self.c_text, font=("Malgun Gothic", 9, "bold")).pack(side="left")

        clear_btn = tk.Button(log_header, text="지우기", bg=self.c_card, fg=self.c_dim, font=("Malgun Gothic", 8), relief="flat", command=self._clear_logs, cursor="hand2")
        clear_btn.pack(side="right")

        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            wrap=tk.WORD,
            bg="#11111b",
            fg="#bac2de",
            insertbackground="#cdd6f4",
            font=("Consolas", 9),
            padx=10,
            pady=8,
            relief="flat",
            highlightthickness=0
        )
        self.log_text.pack(fill="both", expand=True, padx=2, pady=(0, 2))

    def _build_footer(self):
        footer = tk.Frame(self.root, bg=self.c_bg, padx=14, pady=4)
        footer.pack(fill="x", side="bottom")

        hint_lbl = tk.Label(
            footer,
            text="💡 스마트폰이나 학교 PC에서는 [원클릭 외부 연동 링크]를 열어주시면 1초 만에 바로 연동됩니다.",
            bg=self.c_bg,
            fg=self.c_dim,
            font=("Malgun Gothic", 8)
        )
        hint_lbl.pack(side="left")

        close_btn = tk.Button(
            footer,
            text="서버 종료",
            bg="#f38ba8",
            fg="#11111b",
            font=("Malgun Gothic", 8, "bold"),
            relief="flat",
            padx=10,
            pady=3,
            cursor="hand2",
            command=self.on_close
        )
        close_btn.pack(side="right")

    def open_browser(self):
        webbrowser.open(f"http://localhost:{self.port}")

    def _clear_logs(self):
        self.log_text.delete("1.0", tk.END)

    def _refresh_plugin_status(self):
        if not self.plugin_manager:
            return

        # RiroSchool
        riro = self.plugin_manager.get_plugin("riroschool")
        if riro:
            st = riro.get_status()
            if st.get("authenticated"):
                u_name = st.get("user", {}).get("user_name", "인증됨")
                self.riro_status_lbl.config(text=f"● 인증 활성 ({u_name})", fg=self.c_green)
            else:
                self.riro_status_lbl.config(text="○ 미인증 (게스트 모드)", fg="#f9e2af")
        else:
            self.riro_status_lbl.config(text="비활성화됨", fg=self.c_dim)

        # NEIS
        neis = self.plugin_manager.get_plugin("neis")
        if neis:
            st = neis.get_status()
            k_type = "정식 인증키 (1~7교시)" if st.get("key_type") == "authenticated" else "체험키 (1~5교시)"
            self.neis_status_lbl.config(text=f"● {k_type}", fg=self.c_green)
        else:
            self.neis_status_lbl.config(text="비활성화됨", fg=self.c_dim)

    def _update_system_stats(self):
        if not self.is_running:
            return
        try:
            cpu = psutil.cpu_percent(interval=None)
            ram = psutil.virtual_memory().percent
            self.sys_status_lbl.config(text=f"CPU: {cpu:.1f}% | RAM: {ram:.1f}%", fg=self.c_text)
            self._refresh_plugin_status()
        except Exception:
            pass

        if self.is_running:
            self.root.after(2000, self._update_system_stats)

    def _poll_logs(self):
        if not self.is_running:
            return
        while not self.log_queue.empty():
            try:
                msg = self.log_queue.get_nowait()
                self.log_text.insert(tk.END, msg + "\n")
                self.log_text.see(tk.END)
            except queue.Empty:
                break

        if self.is_running:
            self.root.after(150, self._poll_logs)

    def on_close(self):
        self.is_running = False
        if self.tunnel_manager:
            self.tunnel_manager.stop()
        if self.on_close_callback:
            try:
                self.on_close_callback()
            except Exception:
                pass
        try:
            self.root.destroy()
        except Exception:
            pass
        os._exit(0)

    def run(self):
        self.root.mainloop()
