"""
Riroschool Core SDK - Meal (급식) Service
Fetches cafeteria menu using Riroschool portal and NEIS Open API fallback.
"""
import re
import urllib.request
import json
from datetime import datetime
from typing import List, Optional
from ..client import RiroClient
from ..models import MealItem
from ..endpoints import MEAL_PAGE, NEIS_BASE_URL, NEIS_OFFICE_CODE, NEIS_SCHOOL_CODE

class MealService:
    def __init__(self, client: RiroClient):
        self.client = client

    def get_meals_by_date(self, target_date: Optional[str] = None) -> List[MealItem]:
        """
        Fetches meals for a specific date (YYYYMMDD or YYYY-MM-DD).
        Defaults to today.
        """
        if not target_date:
            target_date = datetime.now().strftime("%Y%m%d")
        clean_date = target_date.replace("-", "").replace(".", "")

        # 1. Attempt NEIS Open API first (High precision, calorie/origin/allergy metadata)
        neis_meals = self._fetch_from_neis(clean_date)
        if neis_meals:
            return neis_meals

        # 2. Fallback to Riroschool page if authenticated
        return self._fetch_from_riroschool(clean_date)

    def get_weekly_meals(self) -> List[MealItem]:
        """Fetches meals for the current week (up to 7 days)."""
        today = datetime.now().strftime("%Y%m%d")
        url = (
            f"{NEIS_BASE_URL}/mealServiceDietInfo?Type=json"
            f"&ATPT_OFCDC_SC_CODE={NEIS_OFFICE_CODE}&SD_SCHUL_CODE={NEIS_SCHOOL_CODE}"
            f"&pIndex=1&pSize=15"
        )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=5) as res:
                data = json.loads(res.read().decode("utf-8"))
                rows = data.get("mealServiceDietInfo", [{}, {}])[1].get("row", [])
                results = []
                for row in rows:
                    results.append(self._parse_neis_row(row))
                return results
        except Exception:
            return []

    def _fetch_from_neis(self, ymd: str) -> List[MealItem]:
        url = (
            f"{NEIS_BASE_URL}/mealServiceDietInfo?Type=json"
            f"&ATPT_OFCDC_SC_CODE={NEIS_OFFICE_CODE}&SD_SCHUL_CODE={NEIS_SCHOOL_CODE}"
            f"&MLSV_YMD={ymd}"
        )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=5) as res:
                data = json.loads(res.read().decode("utf-8"))
                meal_info = data.get("mealServiceDietInfo")
                if not meal_info or len(meal_info) < 2:
                    return []
                rows = meal_info[1].get("row", [])
                return [self._parse_neis_row(r) for r in rows]
        except Exception:
            return []

    def _parse_neis_row(self, row: dict) -> MealItem:
        raw_dishes = row.get("DDISH_NM", "")
        # Remove allergy numbers e.g., 1.5.6.8.
        cleaned_dishes = re.sub(r'[0-9]+(?:\.[0-9]+)*\.?', '', raw_dishes)
        dish_list = [d.strip() for d in cleaned_dishes.split("<br/>") if d.strip()]
        
        return MealItem(
            date=row.get("MLSV_YMD", ""),
            meal_type=row.get("MMEAL_SC_NM", "중식"),
            menu=dish_list,
            calorie=row.get("CAL_INFO"),
            nutrition=row.get("NTR_INFO"),
            origin=row.get("ORPLC_INFO")
        )

    def _fetch_from_riroschool(self, ymd: str) -> List[MealItem]:
        try:
            html = self.client.get_html(MEAL_PAGE, params={"date": ymd})
            # Parse dish items from Riroschool lunch page
            matches = re.findall(r'<li[^>]*class=[\'"][^\'"]*dish[^\'"]*[\'"][^>]*>(.*?)</li>', html, re.DOTALL)
            dishes = [re.sub(r'<[^>]+>', '', m).strip() for m in matches if m.strip()]
            if dishes:
                return [MealItem(date=ymd, meal_type="중식", menu=dishes)]
            return []
        except Exception:
            return []
