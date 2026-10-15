"""
Riroschool Core SDK - Timetable (시간표) Service
Fetches class and individual student timetables and academic calendar.
"""
import re
from typing import List, Dict, Any, Optional
from ..client import RiroClient
from ..models import TimetableItem
from ..endpoints import SCHEDULE_PAGE

class TimetableService:
    def __init__(self, client: RiroClient):
        self.client = client

    def get_timetable(self, grade: Optional[int] = None, class_num: Optional[int] = None) -> List[TimetableItem]:
        """Fetches the weekly timetable for the student's grade and class."""
        g = grade or (int(self.client.session.grade) if self.client.session.grade else 1)
        c = class_num or (int(self.client.session.class_num) if self.client.session.class_num else 1)

        params = {"grade": str(g), "class": str(c)}
        html = self.client.get_html(SCHEDULE_PAGE, params=params)

        items: List[TimetableItem] = []
        weekdays = ["월", "화", "수", "목", "금"]

        # Parse schedule table cells
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.IGNORECASE)
        for r_idx, row in enumerate(rows):
            tds = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.IGNORECASE)
            if len(tds) < 5:
                continue
            period = r_idx + 1
            for col_idx, td in enumerate(tds[:5]):
                clean = re.sub(r'<[^>]+>', '', td).strip()
                if clean:
                    items.append(TimetableItem(
                        grade=g,
                        class_num=c,
                        weekday=weekdays[col_idx] if col_idx < len(weekdays) else f"Day{col_idx}",
                        period=period,
                        subject=clean
                    ))

        return items
