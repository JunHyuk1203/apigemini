"""
RiroSchool Plugin for Gemini Hub Server
Integrates Masan Jungang High School Riroschool (msjah.riroschool.kr)
Exposes cafeteria meals, notices, assignments, timetable, scores, and portfolio to Gemini.
"""
import os
import sys
from typing import List, Dict, Any, Optional
from datetime import datetime

from .base import BasePlugin, ToolDefinition, ToolParameter
from riro_sdk import (
    RiroClient, MealService, NoticeService, LetterService,
    TimetableService, AssignmentService, ScoreService, PortfolioService, AttendanceService
)


class RiroSchoolPlugin(BasePlugin):
    """Masan Jungang High School RiroSchool Service Plugin."""

    def __init__(self):
        self._client: Optional[RiroClient] = None
        self._meal_svc: Optional[MealService] = None
        self._notice_svc: Optional[NoticeService] = None
        self._letter_svc: Optional[LetterService] = None
        self._timetable_svc: Optional[TimetableService] = None
        self._assignment_svc: Optional[AssignmentService] = None
        self._score_svc: Optional[ScoreService] = None
        self._portfolio_svc: Optional[PortfolioService] = None
        self._attendance_svc: Optional[AttendanceService] = None

    @property
    def id(self) -> str:
        return "riroschool"

    @property
    def name(self) -> str:
        return "마산중앙고 리로스쿨"

    @property
    def description(self) -> str:
        return "마산중앙고등학교(msjah.riroschool.kr) 급식, 공지사항, 가정통신문, 시간표, 과제/수행평가, 성적 조회 서비스"

    @property
    def icon(self) -> str:
        return "🏫"

    @property
    def version(self) -> str:
        return "1.2.0"

    def initialize(self, config: Dict[str, Any]) -> bool:
        session_path = config.get("session_path")
        if not session_path:
            exe_dir = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, 'frozen', False) else __file__))
            local_session = os.path.join(exe_dir, "session.json")
            cwd_session = os.path.join(os.getcwd(), "session.json")
            home_session = os.path.expanduser("~/.riroschool_msjah_session.json")
            if os.path.exists(local_session):
                session_path = local_session
            elif os.path.exists(cwd_session):
                session_path = cwd_session
            elif os.path.exists(home_session):
                session_path = home_session
            else:
                session_path = local_session if getattr(sys, 'frozen', False) else cwd_session

        self._client = RiroClient(session_path=session_path)

        # Optional auto-login if credentials provided in config
        user_id = config.get("user_id")
        password = config.get("password")
        user_type = config.get("user_type", "1")
        if user_id and password and not self._client.is_authenticated():
            self._client.login(user_id=user_id, password=password, user_type=user_type)

        # Initialize services
        self._meal_svc = MealService(self._client)
        self._notice_svc = NoticeService(self._client)
        self._letter_svc = LetterService(self._client)
        self._timetable_svc = TimetableService(self._client)
        self._assignment_svc = AssignmentService(self._client)
        self._score_svc = ScoreService(self._client)
        self._portfolio_svc = PortfolioService(self._client)
        self._attendance_svc = AttendanceService(self._client)
        return True

    def get_status(self) -> Dict[str, Any]:
        is_auth = self._client.is_authenticated() if self._client else False
        user_info = {}
        if self._client and self._client.session:
            user_info = {
                "user_name": self._client.session.user_name,
                "user_id": self._client.session.user_id,
                "user_type": self._client.session.user_type_name,
                "grade": self._client.session.grade,
                "class_num": self._client.session.class_num,
            }
        return {
            "authenticated": is_auth,
            "school": "마산중앙고등학교",
            "domain": "https://msjah.riroschool.kr",
            "user": user_info
        }

    # -------------------------------------------------------------------------
    # Tool Handlers
    # -------------------------------------------------------------------------

    def tool_get_today_meal(self, date: Optional[str] = None, **kwargs) -> Dict[str, Any]:
        """오늘 또는 지정한 날짜의 마산중앙고 급식(중식, 석식) 메뉴를 조회합니다."""
        target_date = date or datetime.now().strftime("%Y-%m-%d")
        meals = self._meal_svc.get_meals_by_date(target_date)
        return {
            "date": target_date,
            "meal_count": len(meals),
            "meals": [
                {
                    "meal_type": m.meal_type,
                    "date": m.date,
                    "menu": m.menu,
                    "calorie": m.calorie,
                    "origin": m.origin
                }
                for m in meals
            ]
        }

    def tool_get_weekly_meals(self, **kwargs) -> Dict[str, Any]:
        """이번 주간의 마산중앙고 급식 메뉴 전체를 조회합니다."""
        meals = self._meal_svc.get_weekly_meals()
        return {
            "total_meals": len(meals),
            "meals": [
                {
                    "meal_type": m.meal_type,
                    "date": m.date,
                    "menu": m.menu,
                    "calorie": m.calorie
                }
                for m in meals
            ]
        }

    def tool_get_notices(self, keyword: Optional[str] = None, page: int = 1, limit: int = 10, **kwargs) -> Dict[str, Any]:
        """학교 공지사항 목록을 조회하거나 키워드로 검색합니다."""
        notices = self._notice_svc.get_notices(page=page)
        if keyword:
            notices = [n for n in notices if keyword.lower() in n.title.lower()]
        max_n = limit or 10
        return {
            "keyword": keyword,
            "page": page,
            "count": len(notices),
            "notices": [
                {
                    "id": n.id,
                    "title": n.title,
                    "author": n.author,
                    "date": n.date,
                    "views": n.views,
                    "has_attachment": n.has_attachment,
                    "is_notice": n.is_notice
                }
                for n in notices[:max_n]
            ]
        }

    def tool_get_notice_detail(self, notice_id: str, **kwargs) -> Dict[str, Any]:
        """공지사항 ID를 입력받아 상세 본문 내용과 첨부파일 정보를 조회합니다."""
        item = self._notice_svc.get_notice_detail(notice_id)
        if not item:
            return {"error": f"공지사항 #{notice_id}을 찾을 수 없습니다."}
        return {
            "id": item.id,
            "title": item.title,
            "author": item.author,
            "date": item.date,
            "content": item.content_text[:2000] if hasattr(item, "content_text") and item.content_text else "(내용 없음)",
            "attachments": [a.model_dump() for a in item.attachments]
        }

    def tool_get_letters(self, page: int = 1, limit: int = 10, **kwargs) -> Dict[str, Any]:
        """가정통신문 목록을 조회합니다."""
        letters = self._letter_svc.get_letters(page=page)
        max_l = limit or 10
        return {
            "page": page,
            "count": len(letters),
            "letters": [
                {
                    "id": l.id,
                    "title": l.title,
                    "author": l.author,
                    "date": l.date
                }
                for l in letters[:max_l]
            ]
        }

    def tool_get_assignments(self, **kwargs) -> Dict[str, Any]:
        """학생의 수행평가 및 과제방 목록, 마감일, 제출 여부 및 평가 상태를 조회합니다."""
        assignments = self._assignment_svc.get_assignments()
        return {
            "total_count": len(assignments),
            "assignments": [
                {
                    "id": a.id,
                    "title": a.title,
                    "subject": a.subject,
                    "deadline": a.deadline,
                    "submitted": a.submitted,
                    "evaluated": a.evaluated
                }
                for a in assignments
            ]
        }

    def tool_get_timetable(self, grade: Optional[int] = None, class_num: Optional[int] = None, **kwargs) -> Dict[str, Any]:
        """학년과 반의 1교시~7교시 시간표를 조회합니다. 미입력 시 내 학급 시간표를 조회합니다."""
        g = grade or (int(self._client.session.grade) if self._client.session.grade else 1)
        c = class_num or (int(self._client.session.class_num) if self._client.session.class_num else 1)
        grid = self._timetable_svc.get_timetable(grade=g, class_num=c)
        return {
            "grade": g,
            "class_num": c,
            "timetable": [item.model_dump() if hasattr(item, "model_dump") else item.__dict__ for item in grid]
        }

    def tool_get_scores(self, **kwargs) -> Dict[str, Any]:
        """내신 성적 및 모의고사 성적표를 조회합니다."""
        scores = self._score_svc.get_scores()
        return {
            "count": len(scores),
            "scores": [
                {
                    "semester": s.semester,
                    "exam_type": s.exam_type,
                    "subject": s.subject,
                    "raw_score": s.raw_score,
                    "grade_tier": s.grade_tier,
                    "rank": s.rank
                }
                for s in scores
            ]
        }

    def tool_get_session_status(self, **kwargs) -> Dict[str, Any]:
        """현재 리로스쿨 로그인 상태 및 학생/학부모 정보를 조회합니다."""
        return self.get_status()

    # -------------------------------------------------------------------------
    # Get Tools List
    # -------------------------------------------------------------------------

    def get_tools(self) -> List[ToolDefinition]:
        return [
            ToolDefinition(
                name="get_today_meal",
                description="마산중앙고등학교의 오늘 또는 특정 날짜의 급식(중식, 석식) 식단표와 칼로리를 조회합니다.",
                parameters={
                    "date": ToolParameter(
                        type="STRING",
                        description="조회할 날짜 (YYYY-MM-DD 형식, 예: '2026-10-15'). 비워두면 오늘 급식 조회."
                    )
                },
                handler=self.tool_get_today_meal
            ),
            ToolDefinition(
                name="get_weekly_meals",
                description="마산중앙고등학교의 이번 주 전체 급식(중식/석식) 식단표 목록을 조회합니다.",
                parameters={},
                handler=self.tool_get_weekly_meals
            ),
            ToolDefinition(
                name="get_notices",
                description="마산중앙고등학교 리로스쿨 공지사항 목록을 조회하거나 키워드로 검색합니다.",
                parameters={
                    "keyword": ToolParameter(
                        type="STRING",
                        description="검색할 키워드 (예: '수행평가', '장학금', '학사일정'). 비워두면 전체 최신 공지."
                    ),
                    "page": ToolParameter(
                        type="INTEGER",
                        description="페이지 번호 (기본값: 1)"
                    )
                },
                handler=self.tool_get_notices
            ),
            ToolDefinition(
                name="get_notice_detail",
                description="공지사항 ID를 입력받아 공지사항의 상세 본문 텍스트와 첨부파일 정보를 읽습니다.",
                parameters={
                    "notice_id": ToolParameter(
                        type="STRING",
                        description="조회할 공지사항 ID (예: '1023' 또는 '1')"
                    )
                },
                required=["notice_id"],
                handler=self.tool_get_notice_detail
            ),
            ToolDefinition(
                name="get_letters",
                description="학교에서 발송된 가정통신문 목록을 조회합니다.",
                parameters={
                    "page": ToolParameter(type="INTEGER", description="페이지 번호 (기본값: 1)")
                },
                handler=self.tool_get_letters
            ),
            ToolDefinition(
                name="get_assignments",
                description="학생이 제출해야 하는 수행평가 및 과제방 목록, 마감일, 제출 완료 여부(제출/미제출)를 확인합니다.",
                parameters={},
                handler=self.tool_get_assignments
            ),
            ToolDefinition(
                name="get_timetable",
                description="마산중앙고등학교 특정 학년/반의 1~7교시 시간표를 조회합니다. 학년/반 미입력 시 본인 학급 조회.",
                parameters={
                    "grade": ToolParameter(type="INTEGER", description="학년 (1, 2, 3)"),
                    "class_num": ToolParameter(type="INTEGER", description="반 (1~10)")
                },
                handler=self.tool_get_timetable
            ),
            ToolDefinition(
                name="get_scores",
                description="학생의 내신 성적 및 모의고사 성적표 데이터를 조회합니다.",
                parameters={},
                handler=self.tool_get_scores
            ),
            ToolDefinition(
                name="get_session_status",
                description="현재 리로스쿨에 로그인된 학생 이름, 학년/반/번호, 인증 상태를 확인합니다.",
                parameters={},
                handler=self.tool_get_session_status
            )
        ]
