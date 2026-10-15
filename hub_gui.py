"""
Gemini Chat Studio - Hub Server Desktop GUI Dashboard
Provides a clean, native desktop monitoring window for GeminiHubServer.exe.
Shows live status, active plugins, system stats, open browser button, and live logs.
"""
import os
import sys
import time
import socket
import threading
import queue
import logging
import webbrowser
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
from typing import Optional, Dict, Any

import psutil


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


class HubGuiDashboard:
    """Native Tkinter Desktop Dashboard for Gemini Hub Server."""

    def __init__(self, host: str, port: int, plugin_manager, on_close_callback=None):
        self.host = host
        self.port = port
        self.plugin_manager = plugin_manager
        self.on_close_callback = on_close_callback
        self.log_queue = queue.Queue()
        self.is_running = True

        # Setup Logging redirection
        self.handler = QueueLogHandler(self.log_queue)
        formatter = logging.Formatter("[%(asctime)s] %(levelname)s: %(message)s", datefmt="%H:%M:%S")
        self.handler.setFormatter(formatter)
        logging.getLogger().addHandler(self.handler)

        self._init_window()

    def _init_window(self):
        self.root = tk.Tk()
        self.root.title("Gemini Chat Studio - 마산중앙고 AI 허브 서버")
        self.root.geometry("780x560")
        self.root.minsize(700, 480)

        # Dark Modern Palette
        self.c_bg = "#181825"
        self.c_card = "#1e1e2e"
        self.c_text = "#cdd6f4"
        self.c_dim = "#a6adc8"
        self.c_green = "#a6e3a1"
        self.c_blue = "#89b4fa"
        self.c_border = "#313244"
        self.c_btn = "#45475a"

        self.root.configure(bg=self.c_bg)

        # Window Icon (fallback safe)
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
        self._build_services_panel()
        self._build_logs_section()
        self._build_footer()

        # Protocol handlers
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

        # Periodic Polling
        self.root.after(100, self._poll_logs)
        self.root.after(1000, self._update_system_stats)

    def _build_header(self):
        header = tk.Frame(self.root, bg=self.c_card, padx=18, pady=14, relief="flat", highlightbackground=self.c_border, highlightthickness=1)
        header.pack(fill="x", padx=14, pady=(14, 8))

        # Left: Title & Status
        left_box = tk.Frame(header, bg=self.c_card)
        left_box.pack(side="left", fill="y")

        title_lbl = tk.Label(left_box, text="🤖 Gemini Chat Studio 통합 허브 서버", bg=self.c_card, fg=self.c_text, font=("Malgun Gothic", 13, "bold"))
        title_lbl.pack(anchor="w")

        status_box = tk.Frame(left_box, bg=self.c_card)
        status_box.pack(anchor="w", pady=(4, 0))

        self.status_dot = tk.Label(status_box, text="●", bg=self.c_card, fg=self.c_green, font=("Malgun Gothic", 12))
        self.status_dot.pack(side="left")

        self.status_text = tk.Label(status_box, text=f"정상 작동 중 (Online) - 포트 {self.port}", bg=self.c_card, fg=self.c_green, font=("Malgun Gothic", 9, "bold"))
        self.status_text.pack(side="left", padx=4)

        self.url_label = tk.Label(status_box, text=f"http://localhost:{self.port}", bg=self.c_card, fg=self.c_blue, cursor="hand2", font=("Malgun Gothic", 9, "underline"))
        self.url_label.pack(side="left", padx=8)
        self.url_label.bind("<Button-1>", lambda e: self.open_browser())

        # Right: Open Browser Big Button
        right_box = tk.Frame(header, bg=self.c_card)
        right_box.pack(side="right", fill="y")

        open_btn = tk.Button(
            right_box,
            text="🌐 웹 브라우저 열기",
            bg=self.c_blue,
            fg="#11111b",
            font=("Malgun Gothic", 10, "bold"),
            relief="flat",
            padx=14,
            pady=6,
            cursor="hand2",
            activebackground="#b4befe",
            command=self.open_browser
        )
        open_btn.pack(side="right")

    def _build_services_panel(self):
        panel = tk.Frame(self.root, bg=self.c_bg)
        panel.pack(fill="x", padx=14, pady=4)

        # 3 Service Cards (RiroSchool, NEIS, System)
        card_riro = tk.Frame(panel, bg=self.c_card, padx=12, pady=10, highlightbackground=self.c_border, highlightthickness=1)
        card_riro.pack(side="left", fill="both", expand=True, padx=(0, 6))

        tk.Label(card_riro, text="🏫 마산중앙고 리로스쿨", bg=self.c_card, fg=self.c_text, font=("Malgun Gothic", 9, "bold")).pack(anchor="w")
        self.riro_status_lbl = tk.Label(card_riro, text="확인 중...", bg=self.c_card, fg=self.c_dim, font=("Malgun Gothic", 8))
        self.riro_status_lbl.pack(anchor="w", pady=(2, 0))

        card_neis = tk.Frame(panel, bg=self.c_card, padx=12, pady=10, highlightbackground=self.c_border, highlightthickness=1)
        card_neis.pack(side="left", fill="both", expand=True, padx=4)

        tk.Label(card_neis, text="🎓 교육부 나이스 (NEIS)", bg=self.c_card, fg=self.c_text, font=("Malgun Gothic", 9, "bold")).pack(anchor="w")
        self.neis_status_lbl = tk.Label(card_neis, text="확인 중...", bg=self.c_card, fg=self.c_dim, font=("Malgun Gothic", 8))
        self.neis_status_lbl.pack(anchor="w", pady=(2, 0))

        card_sys = tk.Frame(panel, bg=self.c_card, padx=12, pady=10, highlightbackground=self.c_border, highlightthickness=1)
        card_sys.pack(side="left", fill="both", expand=True, padx=(6, 0))

        tk.Label(card_sys, text="💻 서버 하드웨어", bg=self.c_card, fg=self.c_text, font=("Malgun Gothic", 9, "bold")).pack(anchor="w")
        self.sys_status_lbl = tk.Label(card_sys, text="CPU: --% | RAM: --%", bg=self.c_card, fg=self.c_dim, font=("Malgun Gothic", 8))
        self.sys_status_lbl.pack(anchor="w", pady=(2, 0))

        self._refresh_plugin_status()

    def _build_logs_section(self):
        log_frame = tk.Frame(self.root, bg=self.c_card, highlightbackground=self.c_border, highlightthickness=1)
        log_frame.pack(fill="both", expand=True, padx=14, pady=(6, 8))

        log_header = tk.Frame(log_frame, bg=self.c_card, padx=12, pady=6)
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
            text="💡 웹 화면은 브라우저에서 http://localhost:8000 으로 바로 사용하실 수 있습니다.",
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
        if riro and riro.enabled:
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
        if neis and neis.enabled:
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
