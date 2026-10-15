"""
Riroschool Core SDK - Domain Services
"""
from .notice import NoticeService
from .letter import LetterService
from .meal import MealService
from .timetable import TimetableService
from .apply import ApplyService
from .assignment import AssignmentService
from .score import ScoreService
from .portfolio import PortfolioService
from .attendance import AttendanceService

__all__ = [
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
