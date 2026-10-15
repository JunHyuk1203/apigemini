"""
Riroschool Core SDK for Masan Jungang High School
A modular Python client for automated data extraction and actions.
"""
from .client import RiroClient
from .models import (
    SchoolInfo, UserSession, MenuItem, BoardPost, PostDetail,
    MealItem, TimetableItem, ApplicationItem, AssignmentItem,
    ScoreItem, PortfolioItem
)
from .services import (
    NoticeService, LetterService, MealService, TimetableService,
    ApplyService, AssignmentService, ScoreService, PortfolioService,
    AttendanceService
)

__all__ = [
    "RiroClient",
    "SchoolInfo",
    "UserSession",
    "MenuItem",
    "BoardPost",
    "PostDetail",
    "MealItem",
    "TimetableItem",
    "ApplicationItem",
    "AssignmentItem",
    "ScoreItem",
    "PortfolioItem",
    "NoticeService",
    "LetterService",
    "MealService",
    "TimetableService",
    "ApplyService",
    "AssignmentService",
    "ScoreService",
    "PortfolioService",
    "AttendanceService"
]
