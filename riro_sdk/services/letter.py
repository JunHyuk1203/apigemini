"""
Riroschool Core SDK - Family Newsletter (가정통신문) Service
Fetches and views family communications and response forms.
"""
from typing import List, Optional
from ..client import RiroClient
from ..models import BoardPost, PostDetail
from ..parser import RiroParser

class LetterService:
    def __init__(self, client: RiroClient):
        self.client = client

    def get_letters(self, page: int = 1, db: Optional[str] = None) -> List[BoardPost]:
        """Fetches the list of family newsletters (가정통신문)."""
        target_db = db or "1901"
        url = f"/board_msg.php?db={target_db}&page={page}"
        html = self.client.get_html(url)
        return RiroParser.parse_letters(html)

    def get_letter_detail(self, letter_id: str, inum: str = "1", db: Optional[str] = None) -> PostDetail:
        """Fetches the detail of a family newsletter."""
        target_db = db or "1901"
        url = f"/board_msg.php?action=view&db={target_db}&page=1&uid={letter_id}&inum={inum}"
        html = self.client.get_html(url)
        return RiroParser.parse_post_detail(html, post_id=letter_id)
