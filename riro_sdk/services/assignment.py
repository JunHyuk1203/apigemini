"""
Riroschool Core SDK - Assignment (수행평가/과제방) Service
Fetches performance assessments, tasks, submission deadlines, and status.
"""
import re
from typing import List, Optional
from ..client import RiroClient
from ..models import AssignmentItem
from ..endpoints import BOARD_PAGE

class AssignmentService:
    def __init__(self, client: RiroClient):
        self.client = client

    def get_assignments(self, db: Optional[str] = None) -> List[AssignmentItem]:
        """Fetches list of active and past assignments / performance assessments."""
        target_db = db
        if not target_db:
            for m in self.client.menus:
                if m.category == "수행평가/과제" and m.db_param:
                    target_db = m.db_param
                    break
        target_db = target_db or "task"

        params = {"db": target_db, "action": "list"}
        html = self.client.get_html(BOARD_PAGE, params=params)

        assignments: List[AssignmentItem] = []
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.IGNORECASE)
        for i, row in enumerate(rows):
            tds = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.IGNORECASE)
            if len(tds) < 3:
                continue

            clean_tds = [re.sub(r'<[^>]+>', '', td).strip() for td in tds]
            if any(h in clean_tds[0] for h in ["번호", "과목", "No"]):
                continue

            link_m = re.search(r'href=[\'"]([^\'"]+)[\'"]', row)
            link = link_m.group(1) if link_m else ""

            # Detect title, deadline, subject
            title = clean_tds[1] if len(clean_tds) > 1 else f"과제 #{i+1}"
            subject = clean_tds[0] if len(clean_tds) > 2 and len(clean_tds[0]) < 10 else "전체"
            
            deadline = "마감일 미정"
            for td_text in clean_tds:
                if re.search(r'\d{4}[-./]\d{2}[-./]\d{2}', td_text):
                    deadline = td_text
                    break

            submitted = "제출완료" in row or "제출" in row and "미제출" not in row
            evaluated = "평가완료" in row or "채점완료" in row

            assignments.append(AssignmentItem(
                id=f"task_{i+1}",
                title=title,
                subject=subject,
                deadline=deadline,
                submitted=submitted,
                evaluated=evaluated,
                link=link
            ))

        return assignments
