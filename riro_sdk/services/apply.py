"""
Riroschool Core SDK - Application (신청/수강/설문) Service
Handles after-school lecture registration, surveys, and applications.
"""
from typing import List, Dict, Any, Optional
from ..client import RiroClient
from ..models import ApplicationItem
from ..parser import RiroParser

class ApplyService:
    def __init__(self, client: RiroClient):
        self.client = client

    def get_applications(self) -> List[ApplicationItem]:
        """Fetches all open courses, after-school lectures, and applications."""
        items: List[ApplicationItem] = []
        
        # 1. 방과후학교 (db=1701, cate=19)
        try:
            html1 = self.client.get_html("/lecture.php?db=1701&cate=19&action=list")
            items.extend(RiroParser.parse_lectures(html1))
        except Exception:
            pass

        # 2. 자기주도학습 / 야간자율학습 (db=1702, cate=2)
        try:
            html2 = self.client.get_html("/lecture.php?db=1702&cate=2&action=list")
            items.extend(RiroParser.parse_lectures(html2))
        except Exception:
            pass

        # 3. 교육과정 수강신청 (/curri.php?db=curri)
        try:
            html3 = self.client.get_html("/curri.php?db=curri")
            curri_items = RiroParser.parse_lectures(html3)
            items.extend(curri_items)
        except Exception:
            pass

        return items

    def get_surveys(self) -> List[ApplicationItem]:
        """Fetches active surveys and vote polls."""
        html = self.client.get_html("/survey.php")
        return RiroParser.parse_lectures(html)
