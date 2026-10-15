"""
Riroschool Core SDK - Portfolio (포트폴리오/생기부) Service
Fetches student activity reports, reading records, and career counseling notes.
"""
import re
from typing import List, Optional
from ..client import RiroClient
from ..models import PortfolioItem
from ..endpoints import PORTFOLIO_PAGE

class PortfolioService:
    def __init__(self, client: RiroClient):
        self.client = client

    def get_portfolios(self, category: Optional[str] = None) -> List[PortfolioItem]:
        """Fetches student portfolio items (창체, 동아리, 봉사, 진로, 독서)."""
        params = {}
        if category:
            params["cate"] = category
        html = self.client.get_html(PORTFOLIO_PAGE, params=params)

        items: List[PortfolioItem] = []
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.IGNORECASE)
        for i, row in enumerate(rows):
            tds = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.IGNORECASE)
            if len(tds) < 3:
                continue
            clean_tds = [re.sub(r'<[^>]+>', '', td).strip() for td in tds]
            if any(h in clean_tds[0] for h in ["번호", "구분", "No"]):
                continue

            title = clean_tds[1] if len(clean_tds) > 1 else f"포트폴리오 #{i+1}"
            cat = clean_tds[0] if len(clean_tds) > 2 else (category or "창의적 체험활동")
            date_val = clean_tds[2] if len(clean_tds) > 2 else "작성일 미상"

            items.append(PortfolioItem(
                id=f"port_{i+1}",
                title=title,
                category=cat,
                date=date_val,
                summary=clean_tds[-1] if len(clean_tds) > 3 else "",
                status="등록완료"
            ))

        return items
