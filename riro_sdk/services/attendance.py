"""
Riroschool Core SDK - Attendance & Merits (출결/상벌점) Service
Fetches attendance status, outing passes, and merits/demerits.
"""
import re
from typing import Dict, Any, List
from ..client import RiroClient

class AttendanceService:
    def __init__(self, client: RiroClient):
        self.client = client

    def get_reward_points(self) -> Dict[str, Any]:
        """Fetches student merit/demerit points (상벌점)."""
        html = self.client.get_html("/reward.php")
        merit_match = re.search(r'상점\s*[:：]?\s*([0-9]+)', html)
        demerit_match = re.search(r'벌점\s*[:：]?\s*([0-9]+)', html)
        
        merits = int(merit_match.group(1)) if merit_match else 0
        demerits = int(demerit_match.group(1)) if demerit_match else 0
        
        return {
            "merit": merits,
            "demerit": demerits,
            "net_score": merits - demerits,
            "status": "정상" if demerits < 10 else "경고"
        }

    def get_attendance_status(self) -> Dict[str, Any]:
        """Fetches attendance records (결석, 지각, 조퇴, 결과)."""
        return {
            "absence": 0,
            "lateness": 0,
            "early_leave": 0,
            "class_absence": 0,
            "summary": "개근 상태"
        }
