"""
Riroschool Core SDK - Notice Service
Fetches and views school announcements and notices.
"""
from typing import List, Optional
from ..client import RiroClient
from ..models import BoardPost, PostDetail
from ..parser import RiroParser

class NoticeService:
    def __init__(self, client: RiroClient):
        self.client = client

    def get_notices(self, page: int = 1, db: Optional[str] = None) -> List[BoardPost]:
        """Fetches the list of school notices."""
        target_db = db or "1001"
        url = f"/board.php?db={target_db}&page={page}"
        html = self.client.get_html(url)
        return RiroParser.parse_board_list(html, current_db=target_db)

    def get_notice_detail(self, post_id: str, db: Optional[str] = None) -> PostDetail:
        """Fetches the full content and attachments of a specific notice."""
        target_db = db or "1001"
        url = f"/board.php?action=view&db={target_db}&page=1&uid={post_id}&inum={post_id}"
        html = self.client.get_html(url)
        return RiroParser.parse_post_detail(html, post_id=post_id)

    def download_attachment(self, download_url: str, save_path: str) -> bool:
        """Downloads an attachment file using the authenticated session."""
        try:
            resp = self.client.client.get(download_url)
            if resp.status_code == 200:
                with open(save_path, "wb") as f:
                    f.write(resp.content)
                return True
            return False
        except Exception:
            return False
