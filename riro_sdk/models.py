"""
Riroschool Core SDK - Models
Defines Pydantic models for all data entities across Riroschool.
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

class SchoolInfo(BaseModel):
    name: str = "마산중앙고등학교"
    subdomain: str = "msjah"
    domain: str = "msjah.riroschool.kr"
    base_url: str = "https://msjah.riroschool.kr"
    office_code: str = "S10"  # 경상남도교육청
    school_code: str = "9010094"  # 마산중앙고등학교 NEIS 코드

class UserSession(BaseModel):
    is_authenticated: bool = False
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    user_type: str = "1"  # "1": 학생/교원, "2": 학부모
    user_type_name: str = "학생/교원"
    grade: Optional[str] = None
    class_num: Optional[str] = None
    number: Optional[str] = None
    phpsessid: Optional[str] = None
    cookies: Dict[str, str] = Field(default_factory=dict)
    login_time: Optional[str] = None

class MenuItem(BaseModel):
    id: str
    title: str
    url: str
    db_param: Optional[str] = None
    category: Optional[str] = None
    action: Optional[str] = None
    depth: int = 1

class Attachment(BaseModel):
    name: str
    download_url: str
    size: Optional[str] = None

class BoardPost(BaseModel):
    id: str
    title: str
    author: Optional[str] = None
    date: Optional[str] = None
    views: Optional[int] = 0
    link: str
    db: Optional[str] = None
    is_notice: bool = False
    has_attachment: bool = False

class PostDetail(BaseModel):
    id: str
    title: str
    author: Optional[str] = None
    date: Optional[str] = None
    views: Optional[int] = 0
    content: str
    content_text: str
    attachments: List[Attachment] = Field(default_factory=list)
    reply_count: int = 0
    survey_info: Optional[Dict[str, Any]] = None

class MealItem(BaseModel):
    date: str
    meal_type: str  # 조식, 중식, 석식
    menu: List[str]
    calorie: Optional[str] = None
    nutrition: Optional[str] = None
    origin: Optional[str] = None

class TimetableItem(BaseModel):
    grade: int
    class_num: int
    weekday: str
    period: int
    subject: str
    teacher: Optional[str] = None

class ApplicationItem(BaseModel):
    id: str
    title: str
    category: str  # 방과후, 수강신청, 설문조사 등
    period: str
    target: Optional[str] = None
    status: str  # 신청가능, 마감, 신청완료
    capacity: Optional[str] = None
    link: str

class AssignmentItem(BaseModel):
    id: str
    title: str
    subject: Optional[str] = None
    deadline: str
    submitted: bool = False
    evaluated: bool = False
    score: Optional[str] = None
    link: str

class ScoreItem(BaseModel):
    semester: str
    exam_type: str  # 중간, 기말, 모의고사
    subject: str
    raw_score: Optional[float] = None
    standard_score: Optional[float] = None
    rank: Optional[str] = None
    grade_tier: Optional[int] = None  # 1~9등급

class PortfolioItem(BaseModel):
    id: str
    title: str
    category: str  # 자율, 동아리, 봉사, 진로, 독서
    date: str
    summary: str
    status: str  # 작성중, 제출완료, 승인
