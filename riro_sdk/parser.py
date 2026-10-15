"""
Riroschool Core SDK - HTML & Data Parser
High-performance standard-library HTML parser for Riroschool pages.
"""
import re
from html import unescape
from typing import List, Dict, Any, Optional
from .models import MenuItem, BoardPost, PostDetail, Attachment, MealItem, ApplicationItem, AssignmentItem

class RiroParser:
    """Parser utilities for all Riroschool HTML pages."""

    @staticmethod
    def parse_menu(html: str) -> List[MenuItem]:
        """Parses the sidebar menu tree (.treeWrap .gnb_list)."""
        menus: List[MenuItem] = []
        action_matches = re.findall(
            r'menuAction\s*\(\s*[\'"]([^\'"]+)[\'"]\s*,\s*[\'"][^\'"]*[\'"]\s*\)[^>]*>(.*?)<',
            html,
            re.DOTALL
        )
        
        seen_urls = set()
        for url, title_raw in action_matches:
            title = re.sub(r'<[^>]+>', '', title_raw).strip()
            if not title or url in seen_urls:
                continue
            seen_urls.add(url)
            
            db_match = re.search(r'[?&]db=([^&#]+)', url)
            db_param = db_match.group(1) if db_match else None
            
            act_match = re.search(r'[?&]action=([^&#]+)', url)
            action = act_match.group(1) if act_match else None
            
            category = "기타"
            if any(k in title for k in ["공지", "소식", "게시판"]):
                category = "공지사항"
            elif any(k in title for k in ["가정통신", "통신문", "알림신청"]):
                category = "가정통신문"
            elif any(k in title for k in ["수행", "과제", "평가"]):
                category = "수행평가/과제"
            elif any(k in title for k in ["급식", "식단"]):
                category = "급식"
            elif any(k in title for k in ["시간표", "일정", "학사"]):
                category = "시간표/학사일정"
            elif any(k in title for k in ["신청", "방과후", "수강", "자기주도"]):
                category = "수강/신청"
            elif any(k in title for k in ["설문", "투표"]):
                category = "설문조사"
            elif any(k in title for k in ["성적", "통지표", "모의고사"]):
                category = "성적"
            elif any(k in title for k in ["포트폴리오", "창체", "동아리", "진로", "활동보고서"]):
                category = "포트폴리오"

            menus.append(MenuItem(
                id=f"menu_{len(menus)+1}",
                title=title,
                url=url,
                db_param=db_param,
                category=category,
                action=action
            ))
            
        return menus

    @staticmethod
    def parse_letters(html: str) -> List[BoardPost]:
        """Parses family newsletters from board_msg.php?db=1901."""
        posts: List[BoardPost] = []
        trs = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL)
        
        for tr in trs:
            tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.DOTALL)
            if len(tds) < 4:
                continue

            clean_tds = [re.sub(r'<[^>]+>', ' ', td).strip() for td in tds]
            # Check if header
            if any(h in clean_tds[0] for h in ["구분", "번호", "+text+"]):
                continue

            # Extract title and link
            # Look for: <a href=javascript:bL(1,UID,INUM);>TITLE</a>
            bl_m = re.search(r'javascript:bL\s*\(\s*1\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*\)', tr)
            post_id = ""
            link = ""
            if bl_m:
                uid, inum = bl_m.group(1), bl_m.group(2)
                post_id = uid
                link = f"/board_msg.php?action=view&db=1901&page=1&uid={uid}&inum={inum}"
            else:
                link_m = re.search(r'href=[\'"]([^\'"]+)[\'"]', tr)
                link = link_m.group(1) if link_m else ""
                post_id = clean_tds[0] or str(len(posts) + 1)

            # Title
            title = ""
            title_a = re.search(r'<a[^>]*>(.*?)</a>', tr, re.DOTALL)
            if title_a:
                title = re.sub(r'<[^>]+>', '', title_a.group(1)).strip()
            else:
                for t in clean_tds:
                    if len(t) > len(title) and not re.search(r'^\d{4}[-.]\d{2}[-.]\d{2}$', t):
                        title = t

            # Clean extra whitespace
            title = " ".join(title.split())
            if not title:
                continue

            # Status / Type
            status = clean_tds[1] if len(clean_tds) > 1 else "알림"
            date = clean_tds[-1] if len(clean_tds) > 0 else ""
            author = clean_tds[-3] if len(clean_tds) >= 4 else "학교"
            views = 0
            try:
                views = int(clean_tds[-2])
            except (ValueError, IndexError):
                pass

            has_att = "ico.png" in tr or "pdf.png" in tr or "hwp.png" in tr

            posts.append(BoardPost(
                id=post_id,
                title=f"[{status}] {title}" if status and status not in title else title,
                author=author,
                date=date,
                views=views,
                link=link,
                db="1901",
                is_notice=status == "알림",
                has_attachment=has_att
            ))

        return posts

    @staticmethod
    def parse_board_list(html: str, current_db: str = "1001") -> List[BoardPost]:
        """Parses board table rows (board.php)."""
        posts: List[BoardPost] = []
        trs = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.IGNORECASE)
        for tr in trs:
            tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.DOTALL | re.IGNORECASE)
            if len(tds) < 3:
                continue

            clean_tds = [re.sub(r'<[^>]+>', ' ', td).strip() for td in tds]
            if any(h in clean_tds[0] for h in ["번호", "구분", "순번", "No"]):
                continue

            # Check for bL(1, UID, INUM)
            bl_m = re.search(r'javascript:bL\s*\(\s*1\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*\)', tr)
            post_id = ""
            post_link = ""
            if bl_m:
                uid, inum = bl_m.group(1), bl_m.group(2)
                post_id = uid
                post_link = f"/board.php?action=view&db={current_db}&page=1&uid={uid}&inum={inum}"
            else:
                link_m = re.search(r'href=[\'"]([^\'"]+)[\'"]', tr)
                post_link = link_m.group(1) if link_m else ""
                id_m = re.search(r'[?&](?:ih|num|id|no)=([0-9]+)', post_link)
                post_id = id_m.group(1) if id_m else clean_tds[0]

            # Title
            title_m = re.search(r'<td[^>]*class=[\'"][^\'"]*title[^\'"]*[\'"][^>]*>(.*?)</td>', tr, re.DOTALL | re.IGNORECASE)
            title = ""
            if title_m:
                title_a = re.search(r'<a[^>]*>(.*?)</a>', title_m.group(1), re.DOTALL)
                title = re.sub(r'<[^>]+>', '', title_a.group(1) if title_a else title_m.group(1)).strip()
            else:
                title_a = re.search(r'<a[^>]*>(.*?)</a>', tr, re.DOTALL)
                if title_a:
                    title = re.sub(r'<[^>]+>', '', title_a.group(1)).strip()

            title = " ".join(title.split())
            if not title:
                continue

            # Author (class='name')
            author_m = re.search(r'<td[^>]*class=[\'"][^\'"]*name[^\'"]*[\'"][^>]*>(.*?)</td>', tr, re.DOTALL | re.IGNORECASE)
            author = re.sub(r'<[^>]+>', '', author_m.group(1)).strip() if author_m else (clean_tds[2] if len(clean_tds) > 2 else "관리자")
            author = " ".join(author.split())

            # Date (class='date')
            date_m = re.search(r'<td[^>]*class=[\'"][^\'"]*date[^\'"]*[\'"][^>]*>(.*?)</td>', tr, re.DOTALL | re.IGNORECASE)
            date = re.sub(r'<[^>]+>', '', date_m.group(1)).strip() if date_m else clean_tds[-1]

            has_att = "ico_file" in tr or "fa-paperclip" in tr or "hwp.png" in tr or "pdf.png" in tr or "file.png" in tr

            posts.append(BoardPost(
                id=post_id,
                title=title,
                author=author,
                date=date,
                link=post_link,
                db=current_db,
                has_attachment=has_att
            ))

        return posts

    @staticmethod
    def parse_post_detail(html: str, post_id: str) -> PostDetail:
        """Parses an article view page into PostDetail."""
        # Title extraction
        title_m = re.search(r'<div[^>]*class=[\'"][^\'"]*view_header_left[^\'"]*[\'"][^>]*>(.*?)(?:<div[^>]*class=[\'"][^\'"]*view_header_right|</td>)', html, re.DOTALL | re.IGNORECASE)
        if not title_m:
            title_m = re.search(r'<div[^>]*class=[\'"][^\'"]*view_tit[^\'"]*[\'"][^>]*>(.*?)</div>', html, re.DOTALL | re.IGNORECASE)
        if not title_m:
            title_m = re.search(r'<h[1-4][^>]*class=[\'"][^\'"]*title[^\'"]*[\'"][^>]*>(.*?)</h[1-4]>', html, re.DOTALL | re.IGNORECASE)

        title = re.sub(r'<[^>]+>', ' ', title_m.group(1)).strip() if title_m else "제목 없음"
        title = " ".join(title.split())

        # Author & Date extraction
        author = "학교"
        date = ""
        views = 0
        header_r = re.search(r'<div[^>]*class=[\'"][^\'"]*view_header_right[^\'"]*[\'"][^>]*>(.*?)</div>', html, re.DOTALL | re.IGNORECASE)
        if header_r:
            hr_text = header_r.group(1)
            auth_m = re.search(r'작성자\s*</strong>\s*<span>(.*?)</span>', hr_text)
            if auth_m:
                author = auth_m.group(1).strip()
            date_m = re.search(r'등록일\s*</strong>\s*<span>(.*?)</span>', hr_text)
            if date_m:
                date = date_m.group(1).strip()
            view_m = re.search(r'조회\s*</strong>\s*<span>([0-9]+)</span>', hr_text)
            if view_m:
                try:
                    views = int(view_m.group(1))
                except ValueError:
                    pass

        # Content extraction (rText or view_content)
        content_m = re.search(r'<td[^>]*id=[\'"]rText[\'"][^>]*>(.*?)</td>', html, re.DOTALL | re.IGNORECASE)
        if not content_m:
            content_m = re.search(r'<div[^>]*class=[\'"][^\'"]*(?:view_content|board_view|content_area)[^\'"]*[\'"][^>]*>(.*?)</div>', html, re.DOTALL | re.IGNORECASE)

        raw_content = content_m.group(1) if content_m else ""
        if not raw_content:
            no_scripts = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)
            no_styles = re.sub(r'<style[^>]*>.*?</style>', '', no_scripts, flags=re.DOTALL)
            raw_content = no_styles

        # Remove scripts and styles inside content
        raw_content = re.sub(r'<script[^>]*>.*?</script>', '', raw_content, flags=re.DOTALL | re.IGNORECASE)
        raw_content = re.sub(r'<style[^>]*>.*?</style>', '', raw_content, flags=re.DOTALL | re.IGNORECASE)

        content_text = re.sub(r'<br\s*/?>', '\n', raw_content, flags=re.IGNORECASE)
        content_text = re.sub(r'<p[^>]*>', '\n', content_text, flags=re.IGNORECASE)
        content_text = re.sub(r'<[^>]+>', '', content_text).strip()
        content_text = unescape(content_text)

        # Attachments
        attachments: List[Attachment] = []
        att_matches = re.findall(r'<a[^>]*href=["\'](?:javascript:M_location\([\'"]([^\'"]+)[\'"]\)|([^\'"]*(?:down\.php|\.pdf|\.hwp)[^\'"]*))["\'][^>]*>(.*?)</a>', html, re.DOTALL | re.IGNORECASE)
        for m_loc, href, att_text in att_matches:
            download_url = m_loc or href
            att_name = re.sub(r'<[^>]+>', '', att_text).strip()
            if att_name and "다운" not in att_name:
                attachments.append(Attachment(name=att_name, download_url=download_url))
            elif att_name:
                attachments.append(Attachment(name=f"첨부파일_{len(attachments)+1}", download_url=download_url))

        return PostDetail(
            id=post_id,
            title=title,
            author=author,
            date=date,
            views=views,
            content=raw_content,
            content_text=content_text,
            attachments=attachments
        )

    @staticmethod
    def parse_lectures(html: str) -> List[ApplicationItem]:
        """Parses courses from lecture.php."""
        items: List[ApplicationItem] = []
        trs = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL)
        for i, tr in enumerate(trs):
            tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.DOTALL)
            if len(tds) >= 4:
                clean = [re.sub(r'<[^>]+>', ' ', td).strip() for td in tds]
                if any(h in clean[0] for h in ["번호", "구분"]):
                    continue
                # Title is in clean[2] or clean[1]
                title = clean[2] if len(clean) > 2 else clean[1]
                teacher = clean[3] if len(clean) > 3 else ""
                status = "신청가능"
                if "마감" in tr:
                    status = "마감"
                elif "완료" in tr:
                    status = "신청완료"

                link_m = re.search(r'href=[\'"]([^\'"]+)[\'"]', tr)
                link = link_m.group(1) if link_m else ""

                items.append(ApplicationItem(
                    id=f"lec_{i+1}",
                    title=f"{title} ({teacher})" if teacher else title,
                    category="방과후학교",
                    period="2026학년도 2학기",
                    status=status,
                    link=link
                ))
        return items
