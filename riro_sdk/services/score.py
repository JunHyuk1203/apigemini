"""
Riroschool Core SDK - Score (성적/모의고사) Service
Fetches exam scores, mock test results, and grade distributions.
"""
import re
from typing import List, Optional
from ..client import RiroClient
from ..models import ScoreItem
from ..endpoints import SCORE_PAGE

class ScoreService:
    def __init__(self, client: RiroClient):
        self.client = client

    def get_scores(self, semester: Optional[str] = None) -> List[ScoreItem]:
        """Fetches internal and mock test grades."""
        params = {}
        if semester:
            params["semester"] = semester
        html = self.client.get_html(SCORE_PAGE, params=params)

        scores: List[ScoreItem] = []
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.IGNORECASE)
        for row in rows:
            tds = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.IGNORECASE)
            if len(tds) < 4:
                continue
            clean_tds = [re.sub(r'<[^>]+>', '', td).strip() for td in tds]
            if any(h in clean_tds[0] for h in ["과목", "구분", "학기"]):
                continue

            subject = clean_tds[0]
            raw_val = None
            try:
                raw_val = float(clean_tds[1])
            except (ValueError, IndexError):
                pass

            grade_tier = None
            try:
                grade_tier = int(clean_tds[-1]) if clean_tds[-1].isdigit() else None
            except IndexError:
                pass

            scores.append(ScoreItem(
                semester=semester or "최근 학기",
                exam_type="정기고사",
                subject=subject,
                raw_score=raw_val,
                grade_tier=grade_tier
            ))

        return scores
