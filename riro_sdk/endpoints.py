"""
Riroschool Core SDK - Endpoints
Endpoint specifications for Masan Jungang High School and Riroschool portal.
"""

SCHOOL_SUBDOMAIN = "msjah"
BASE_URL = f"https://{SCHOOL_SUBDOMAIN}.riroschool.kr"
PORTAL_URL = "https://riroschool.kr"
CDN_URL = "https://cdn.riroschool.kr"

# NEIS Open API (Masan Jungang High School)
NEIS_OFFICE_CODE = "S10"      # 경상남도교육청
NEIS_SCHOOL_CODE = "9010094"  # 마산중앙고등학교
NEIS_BASE_URL = "https://open.neis.go.kr/hub"

# Core AJAX endpoints
AJAX_ENDPOINT = f"{BASE_URL}/ajax.php"
LOGIN_PAGE = f"{BASE_URL}/user.php?action=signin"
LOGOUT_PAGE = f"{BASE_URL}/user.php?action=user_logout"
MAIN_PAGE = f"{BASE_URL}/index.php"

# Board & Content endpoints
BOARD_PAGE = f"{BASE_URL}/board.php"
CURRICULUM_PAGE = f"{BASE_URL}/curri.php"
LECTURE_PAGE = f"{BASE_URL}/lecture.php"
SURVEY_PAGE = f"{BASE_URL}/survey.php"
MEAL_PAGE = f"{BASE_URL}/lunch.php"
SCORE_PAGE = f"{BASE_URL}/score.php"
SCHEDULE_PAGE = f"{BASE_URL}/schedule.php"
PORTFOLIO_PAGE = f"{BASE_URL}/portfolio.php"
DOWNLOAD_PAGE = f"{BASE_URL}/down.php"

# Default Common DB parameters
DEFAULT_DBS = {
    "notice": "1001",       # 공지사항
    "letter": "1002",       # 가정통신문
    "assignment": "1003",   # 수행평가/과제
    "survey": "1004",       # 설문조사
    "portfolio": "1005",    # 포트폴리오
    "activity": "1006"      # 동아리/창체 활동
}
