"""
Riroschool Core SDK - HTTP & Session Client
Manages authentication, cookies, dynamic menu discovery, and requests.
"""
import os
import json
import httpx
from typing import Optional, Dict, Any, List
from datetime import datetime
from .endpoints import (
    BASE_URL, AJAX_ENDPOINT, LOGIN_PAGE, LOGOUT_PAGE, MAIN_PAGE
)
from .models import UserSession, MenuItem
from .parser import RiroParser

SESSION_FILE_PATH = os.path.expanduser("~/.riroschool_msjah_session.json")

class RiroClient:
    """Core HTTP client for interacting with Masan Jungang High School Riroschool."""

    def __init__(self, session_path: Optional[str] = None):
        self.session_path = session_path or SESSION_FILE_PATH
        self.session = UserSession()
        self.client = httpx.Client(
            base_url=BASE_URL,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Referer": BASE_URL,
                "Origin": BASE_URL,
                "X-Requested-With": "XMLHttpRequest"
            },
            follow_redirects=True,
            timeout=15.0
        )
        self.menus: List[MenuItem] = []
        self.load_session()

    def load_session(self) -> bool:
        """Loads cached session from disk if present."""
        if not os.path.exists(self.session_path):
            return False
        try:
            with open(self.session_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.session = UserSession(**data)
            # Rehydrate cookies into httpx client
            for k, v in self.session.cookies.items():
                self.client.cookies.set(k, v, domain="msjah.riroschool.kr")
            return self.session.is_authenticated
        except Exception:
            return False

    def save_session(self):
        """Saves current session cookies and metadata to disk."""
        try:
            cookies_dict = {}
            for cookie in self.client.cookies.jar:
                cookies_dict[cookie.name] = cookie.value
            self.session.cookies = cookies_dict
            self.session.phpsessid = cookies_dict.get("PHPSESSID")
            with open(self.session_path, "w", encoding="utf-8") as f:
                json.dump(self.session.model_dump(), f, indent=2, ensure_ascii=False)
        except Exception as e:
            pass

    def clear_session(self):
        """Clears local session file and client cookies."""
        if os.path.exists(self.session_path):
            try:
                os.remove(self.session_path)
            except Exception:
                pass
        self.session = UserSession()
        self.client.cookies.clear()

    def login(self, user_id: str, password: str, user_type: str = "1") -> Dict[str, Any]:
        """
        Authenticates against msjah.riroschool.kr.
        user_type: "1" for student/teacher, "2" for parent.
        """
        # First fetch main page to establish initial cookies (AWSALB, PHPSESSID)
        self.client.get("/")
        
        payload = {
            "app": "user",
            "mode": "login",
            "userType": str(user_type),
            "id": user_id.strip(),
            "pw": password.strip(),
            "deeplink": "",
            "redirect_link": ""
        }
        
        resp = self.client.post("/ajax.php", data=payload)
        try:
            result = resp.json()
        except Exception:
            return {
                "success": False,
                "code": "PARSE_ERROR",
                "message": f"서버가 JSON을 반환하지 않았습니다. (HTTP {resp.status_code})"
            }

        code = result.get("code")
        msg = result.get("msg", "")
        
        if code == "000":
            # Login successful!
            data = result.get("data", {})
            self.session.is_authenticated = True
            self.session.user_id = user_id
            self.session.user_type = str(user_type)
            self.session.user_type_name = "학부모" if user_type == "2" else "학생/교원"
            self.session.user_name = data.get("user_name") or data.get("name") or user_id
            self.session.grade = data.get("grade")
            self.session.class_num = data.get("class")
            self.session.number = data.get("number")
            self.session.login_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self.save_session()
            
            # Immediately run menu discovery
            self.discover_menus()
            
            return {
                "success": True,
                "code": code,
                "message": msg or "로그인에 성공했습니다.",
                "data": data
            }
        else:
            return {
                "success": False,
                "code": code,
                "message": msg or "로그인 실패: 아이디 또는 비밀번호를 확인해주세요."
            }

    def logout(self) -> bool:
        """Logs out from Riroschool and removes cached credentials."""
        try:
            self.client.get(LOGOUT_PAGE)
        except Exception:
            pass
        self.clear_session()
        return True

    def is_authenticated(self) -> bool:
        """Checks if current session is active by testing an authenticated page."""
        if not self.session.is_authenticated:
            return False
        try:
            resp = self.client.get(MAIN_PAGE)
            if "로그인이 필요합니다" in resp.text or "signin" in str(resp.url):
                self.session.is_authenticated = False
                return False
            # Extract user name if not already set or set to email
            import re
            user_m = re.search(r'<div class="user">(.*?)</div>\s*</div>', resp.text, re.DOTALL)
            if user_m:
                clean_name = re.sub(r'<[^>]+>', ' ', user_m.group(1)).strip()
                if clean_name and "로그인" not in clean_name:
                    self.session.user_name = " ".join(clean_name.split())
                    self.save_session()
            return True
        except Exception:
            return False

    def discover_menus(self) -> List[MenuItem]:
        """Discovers all school-specific menus and database IDs."""
        try:
            resp = self.client.get(MAIN_PAGE)
            self.menus = RiroParser.parse_menu(resp.text)
            return self.menus
        except Exception as e:
            print(f"[Warning] Menu discovery failed: {e}")
            return []

    def get_html(self, path: str, params: Optional[Dict[str, Any]] = None) -> str:
        """Performs an authenticated GET request and returns HTML text."""
        resp = self.client.get(path, params=params)
        return resp.text

    def post_data(self, path: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Performs an authenticated POST request and returns JSON response."""
        resp = self.client.post(path, data=data)
        try:
            return resp.json()
        except Exception:
            return {"status": resp.status_code, "text": resp.text}
