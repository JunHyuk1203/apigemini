"""
NEIS (National Education Information System) Service Plugin for Gemini Hub Server
Connects to Ministry of Education NEIS Open API (open.neis.go.kr)
Provides official Academic Calendar (학사일정) and High School Timetable (시간표)
specifically configured for Masan Jungang High School (마산중앙고등학교).
"""
import re
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import httpx

from .base import BasePlugin, ToolDefinition, ToolParameter

logger = logging.getLogger("hub.neis_plugin")


class NeisPlugin(BasePlugin):
    """
    NEIS Open API Plugin for Masan Jungang High School.
    API: https://open.neis.go.kr/hub/
    Default School Code:
      - Office: S10 (경상남도교육청)
      - School Code: 9010094 (마산중앙고등학교)
    """

    BASE_URL = "https://open.neis.go.kr/hub"

    def __init__(self):
        self._api_key: str = ""
        self._office_code: str = "S10"
        self._school_code: str = "9010094"
        self._school_name: str = "마산중앙고등학교"
        self._client: Optional[httpx.Client] = None

    @property
    def id(self) -> str:
        return "neis"

    @property
    def name(self) -> str:
        return "교육부 나이스 (NEIS)"

    @property
    def description(self) -> str:
        return "교육부 공식 나이스(NEIS) 연동 - 마산중앙고등학교 학사일정(시험, 방학, 행사) 및 고교 정규 시간표 조회"

    @property
    def icon(self) -> str:
        return "🏫"

    @property
    def version(self) -> str:
        return "1.0.0"

    def initialize(self, config: Dict[str, Any]) -> bool:
        """Initializes plugin with config settings."""
        self._api_key = config.get("api_key", "").strip()
        self._office_code = config.get("office_code", "S10")
        self._school_code = config.get("school_code", "9010094")
        self._school_name = config.get("school_name", "마산중앙고등학교")

        self._client = httpx.Client(timeout=10.0, follow_redirects=True)
        logger.info(f"Initialized NeisPlugin for {self._school_name} (Code: {self._school_code})")
        return True

    def shutdown(self):
        if self._client:
            self._client.close()

    def get_status(self) -> Dict[str, Any]:
        return {
            "service": "교육부 나이스 오픈API",
            "school_name": self._school_name,
            "office_code": self._office_code,
            "school_code": self._school_code,
            "has_custom_key": bool(self._api_key),
            "status": "online"
        }

    # -------------------------------------------------------------------------
    # Helper: Send Request to NEIS Open API
    # -------------------------------------------------------------------------

    def _fetch_neis(self, endpoint: str, extra_params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        url = f"{self.BASE_URL}/{endpoint}"
        params = {
            "Type": "json",
            "pIndex": 1,
            "pSize": 100,
            "ATPT_OFCDC_SC_CODE": self._office_code,
            "SD_SCHUL_CODE": self._school_code
        }
        if self._api_key:
            params["KEY"] = self._api_key
        params.update(extra_params)

        try:
            resp = self._client.get(url, params=params)
            if resp.status_code != 200:
                logger.error(f"NEIS API HTTP {resp.status_code}: {resp.text[:200]}")
                return None
            return resp.json()
        except Exception as e:
            logger.error(f"NEIS API request error ({endpoint}): {e}")
            return None

    # -------------------------------------------------------------------------
    # Tool Handlers
    # -------------------------------------------------------------------------

    def tool_get_school_schedule(
        self,
        month: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        마산중앙고등학교의 교육부 공식 학사일정(시험, 방학, 개학, 수능, 현장학습, 휴업일 등)을 조회합니다.
        """
        now = datetime.now()
        
        # Parse start and end date
        if month:
            clean_m = re.sub(r'[^0-9]', '', month)
            if len(clean_m) == 6:
                y = int(clean_m[:4])
                m = int(clean_m[4:6])
                if m == 12:
                    next_month = datetime(y + 1, 1, 1)
                else:
                    next_month = datetime(y, m + 1, 1)
                last_day = (next_month - timedelta(days=1)).day
                start_dt = datetime(y, m, 1)
                end_dt = datetime(y, m, last_day)
            else:
                start_dt = datetime(now.year, now.month, 1)
                end_dt = start_dt + timedelta(days=45)
        elif from_date or to_date:
            s_str = re.sub(r'[^0-9]', '', from_date) if from_date else now.strftime("%Y%m%d")
            e_str = re.sub(r'[^0-9]', '', to_date) if to_date else (now + timedelta(days=30)).strftime("%Y%m%d")
            start_dt = datetime.strptime(s_str, "%Y%m%d") if len(s_str) == 8 else now
            end_dt = datetime.strptime(e_str, "%Y%m%d") if len(e_str) == 8 else (now + timedelta(days=30))
        else:
            start_dt = now
            end_dt = now + timedelta(days=45)

        start_ymd = start_dt.strftime("%Y%m%d")
        end_ymd = end_dt.strftime("%Y%m%d")

        # Multi-call chunking:
        # Without an API key, NEIS caps every query at 5 rows.
        # To get all events across a month or multi-week range, query in 6-day slices!
        raw_rows = []
        if not self._api_key and (end_dt - start_dt).days > 6:
            cur_dt = start_dt
            while cur_dt <= end_dt:
                chunk_end_dt = min(cur_dt + timedelta(days=6), end_dt)
                c_start = cur_dt.strftime("%Y%m%d")
                c_end = chunk_end_dt.strftime("%Y%m%d")
                chunk_data = self._fetch_neis("SchoolSchedule", {
                    "AA_FROM_YMD": c_start,
                    "AA_TO_YMD": c_end
                })
                if chunk_data and "SchoolSchedule" in chunk_data:
                    raw_rows.extend(chunk_data["SchoolSchedule"][1].get("row", []))
                cur_dt = chunk_end_dt + timedelta(days=1)
        else:
            data = self._fetch_neis("SchoolSchedule", {
                "AA_FROM_YMD": start_ymd,
                "AA_TO_YMD": end_ymd
            })
            if data and "SchoolSchedule" in data:
                raw_rows = data["SchoolSchedule"][1].get("row", [])

        if not raw_rows:
            return {
                "school": self._school_name,
                "from_date": start_ymd,
                "to_date": end_ymd,
                "count": 0,
                "message": "해당 기간에 등록된 학사일정이 없습니다.",
                "schedules": []
            }

        schedules = []
        seen = set()
        for r in raw_rows:
            event_name = r.get("EVENT_NM", "").strip()
            ymd = r.get("AA_YMD", "")
            if not event_name or not ymd:
                continue

            dedup_key = (ymd, event_name)
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            formatted_date = f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:]}" if len(ymd) == 8 else ymd

            targets = []
            if r.get("ONE_GRADE_EVENT_YN") == "Y": targets.append("1학년")
            if r.get("TW_GRADE_EVENT_YN") == "Y": targets.append("2학년")
            if r.get("THREE_GRADE_EVENT_YN") == "Y": targets.append("3학년")

            schedules.append({
                "date": formatted_date,
                "event_name": event_name,
                "holiday_type": r.get("SBTR_DD_SC_NM", "해당없음"),
                "content": r.get("EVENT_CNTNT", ""),
                "target_grades": ", ".join(targets) if targets else "전학년"
            })

        # Sort by date
        schedules.sort(key=lambda s: s["date"])

        return {
            "school": self._school_name,
            "from_date": start_ymd,
            "to_date": end_ymd,
            "count": len(schedules),
            "schedules": schedules
        }

    def tool_get_timetable(
        self,
        grade: int = 1,
        class_num: int = 1,
        date: Optional[str] = None,
        weekly: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """
        교육부 나이스(NEIS) 공식 고등학교 시간표를 조회합니다.
        마산중앙고등학교의 학년, 반별 1~7교시 정규 교과 수업 시간표를 확인합니다.
        """
        now = datetime.now()

        # Parse date input
        if date:
            clean_date = re.sub(r'[^0-9]', '', date)
            if len(clean_date) == 8:
                target_dt = datetime.strptime(clean_date, "%Y%m%d")
            else:
                target_dt = now
        else:
            target_dt = now

        raw_rows = []
        if weekly:
            # Multi-call: Call each weekday (Mon-Fri) with 2 pages each (1~5교시 and 6~7교시)
            monday = target_dt - timedelta(days=target_dt.weekday())
            friday = monday + timedelta(days=4)
            start_ymd = monday.strftime("%Y%m%d")
            end_ymd = friday.strftime("%Y%m%d")

            for i in range(5):
                day_dt = monday + timedelta(days=i)
                day_ymd = day_dt.strftime("%Y%m%d")
                for p_idx in [1, 2]:
                    d_data = self._fetch_neis("hisTimetable", {
                        "GRADE": str(grade),
                        "CLASS_NM": str(class_num),
                        "ALL_TI_YMD": day_ymd,
                        "pIndex": p_idx,
                        "pSize": 5
                    })
                    if d_data and "hisTimetable" in d_data:
                        raw_rows.extend(d_data["hisTimetable"][1].get("row", []))
        else:
            single_ymd = target_dt.strftime("%Y%m%d")
            start_ymd = single_ymd
            end_ymd = single_ymd
            # 하루에 5개씩 제한되므로 1일당 2번(1페이지 1~5교시, 2페이지 6~7교시) 연속 호출하여 병합
            for p_idx in [1, 2]:
                d_data = self._fetch_neis("hisTimetable", {
                    "GRADE": str(grade),
                    "CLASS_NM": str(class_num),
                    "ALL_TI_YMD": single_ymd,
                    "pIndex": p_idx,
                    "pSize": 5
                })
                if d_data and "hisTimetable" in d_data:
                    raw_rows.extend(d_data["hisTimetable"][1].get("row", []))

        if not raw_rows:
            return {
                "school": self._school_name,
                "grade": grade,
                "class_num": class_num,
                "from_date": start_ymd,
                "to_date": end_ymd,
                "count": 0,
                "message": f"마산중앙고 {grade}학년 {class_num}반의 해당 일자 시간표가 나이스에 등록되어 있지 않거나 주말/공휴일입니다.",
                "timetable": []
            }

        timetable_entries = []
        seen = set()
        for r in raw_rows:
            ymd = r.get("ALL_TI_YMD", "")
            formatted_date = f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:]}" if len(ymd) == 8 else ymd
            period = r.get("PERIO", "")
            subject = r.get("ITRT_CNTNT", "").strip()

            dedup_key = (formatted_date, period)
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            timetable_entries.append({
                "date": formatted_date,
                "period": f"{period}교시",
                "subject": subject
            })

        # Sort by date and period number
        def sort_key(item):
            p_num = int(re.sub(r'[^0-9]', '', item["period"]) or 0)
            return (item["date"], p_num)

        timetable_entries.sort(key=sort_key)

        res = {
            "school": self._school_name,
            "grade": grade,
            "class_num": class_num,
            "from_date": start_ymd,
            "to_date": end_ymd,
            "total_periods": len(timetable_entries),
            "timetable": timetable_entries
        }
        if not self._api_key and not weekly and len(timetable_entries) == 5:
            res["auth_notice"] = (
                "안내: 현재 나이스 무료 샘플(인증키 미등록) 상태여서 하루 최대 5교시까지만 조회되었습니다. "
                "주간 시간표를 조회하시거나, 나이스 오픈API(https://open.neis.go.kr)에서 무료 인증키를 발급받아 "
                "config.yaml에 입력하시면 6~7교시까지 모두 완전 조회됩니다."
            )
        return res

    def tool_get_school_info(self, **kwargs) -> Dict[str, Any]:
        """
        마산중앙고등학교의 공식 기본 정보(주소, 전화번호, 홈페이지, 설립일 등)를 조회합니다.
        """
        data = self._fetch_neis("schoolInfo", {"SCHUL_NM": self._school_name})
        if not data or "schoolInfo" not in data:
            return {
                "school_name": self._school_name,
                "office_code": self._office_code,
                "school_code": self._school_code
            }

        row = data["schoolInfo"][1]["row"][0]
        return {
            "school_name": row.get("SCHUL_NM", self._school_name),
            "office_name": row.get("ATPT_OFCDC_SC_NM", "경상남도교육청"),
            "school_type": row.get("HS_SC_NM", "일반고등학교"),
            "address": f"{row.get('ORG_RDNMA', '')} {row.get('ORG_RDNDA', '')}".strip(),
            "postal_code": row.get("ORG_RDNZC", "").strip(),
            "phone": row.get("ORG_TELNO", "").strip(),
            "fax": row.get("ORG_FAXNO", "").strip(),
            "homepage": row.get("HMPG_ADRES", "").strip(),
            "found_date": row.get("FOND_YMD", "").strip()
        }

    # -------------------------------------------------------------------------
    # Get Tools List
    # -------------------------------------------------------------------------

    def get_tools(self) -> List[ToolDefinition]:
        return [
            ToolDefinition(
                name="get_school_schedule",
                description="교육부 공식 나이스(NEIS) 학사일정을 조회합니다. 마산중앙고등학교의 정기고사(1차/2차 지필평가, 모의고사, 학력평가), 방학, 개학, 수능일, 축제, 재량휴업일 등의 공식 일정을 확인합니다.",
                parameters={
                    "month": ToolParameter(
                        type="STRING",
                        description="조회할 특정 연월 (예: '2026-10' 또는 '202610'). 비워두면 현재 날짜 기준 다가오는 일정 조회."
                    ),
                    "from_date": ToolParameter(
                        type="STRING",
                        description="조회 시작일 (YYYY-MM-DD 또는 YYYYMMDD)."
                    ),
                    "to_date": ToolParameter(
                        type="STRING",
                        description="조회 종료일 (YYYY-MM-DD 또는 YYYYMMDD)."
                    )
                },
                handler=self.tool_get_school_schedule
            ),
            ToolDefinition(
                name="get_timetable",
                description="교육부 공식 나이스(NEIS) 고등학교 시간표를 조회합니다. 마산중앙고등학교의 특정 학년/반의 1~7교시 정규 과목 시간표(한국사, 국어, 수학, 통합과학 등)를 일별 또는 이번 주간 전체로 조회합니다.",
                parameters={
                    "grade": ToolParameter(
                        type="INTEGER",
                        description="학년 (1, 2, 3 중 선택, 기본값: 1)"
                    ),
                    "class_num": ToolParameter(
                        type="INTEGER",
                        description="반 (1, 2, 3... 반 번호, 기본값: 1)"
                    ),
                    "date": ToolParameter(
                        type="STRING",
                        description="조회할 날짜 (YYYY-MM-DD 또는 YYYYMMDD, 비워두면 오늘 날짜)"
                    ),
                    "weekly": ToolParameter(
                        type="BOOLEAN",
                        description="true로 설정 시 이번 주(월~금) 전체 시간표를 조회합니다."
                    )
                },
                required=["grade", "class_num"],
                handler=self.tool_get_timetable
            ),
            ToolDefinition(
                name="get_school_info",
                description="교육부 나이스(NEIS)에 등록된 마산중앙고등학교의 공식 기본 정보(주소, 전화번호, 홈페이지, 설립일 등)를 확인합니다.",
                parameters={},
                handler=self.tool_get_school_info
            )
        ]
