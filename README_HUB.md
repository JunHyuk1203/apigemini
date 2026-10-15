# 🚀 Gemini Chat Studio - 통합 AI 서비스 허브 (Hub Server)

마산중앙고등학교 리로스쿨(`riro_sdk`)을 비롯하여 향후 추가될 다양한 로컬 서비스(스마트홈, 날씨, IoT, 스크래퍼 등)를 **단 하나의 통합 서버 프로그램**으로 묶고, 웹/모바일 브라우저에서 **Gemini의 Function Calling(도구 실행)**을 통해 실시간으로 조작할 수 있는 **확장형 AI 서비스 허브**입니다.

---

## 📌 주요 특징

1. **플러그인 방식의 멀티 서비스 아키텍처 (`plugins/`)**
   - 새로운 서비스를 추가할 때 기존 코드를 수정할 필요 없이, `plugins/` 폴더에 `BasePlugin`을 상속받은 새 파이썬 파일 하나만 넣으면 서버가 자동으로 감지하여 제미나이 도구로 등록합니다.
   - 현재 기본 탑재 플러그인:
     - 🏫 **마산중앙고 리로스쿨 (`riroschool_plugin.py`)**: 급식(오늘/주간), 공지사항, 가정통신문, 수행평가/과제 마감 현황, 학년/반 시간표, 성적표 등 9개 도구.
     - 💻 **서버 시스템 모니터링 (`system_plugin.py`)**: 서버 PC의 CPU, RAM, 디스크 여유 공간, 현재 일시/요일 확인 등 2개 도구.

2. **단독 실행 파일 (`GeminiHubServer.exe`) 제공**
   - Python이 설치되지 않은 서버용 PC에서도 `GeminiHubServer.exe`를 더블 클릭하는 것만으로 즉시 서버가 구동됩니다.

3. **스마트폰 / 태블릿 완벽 지원**
   - 서버 PC와 같은 Wi-Fi(공유기)에 연결된 스마트폰이나 태블릿에서 `http://<서버PC_IP>:8000`으로 접속하면, 앱스토어 앱과 동일하게 작동하며 실시간 음성/텍스트로 제미나이에게 리로스쿨 정보를 물어볼 수 있습니다.
   - 모바일 브라우저 메뉴에서 **[홈 화면에 추가]**를 누르면 실제 모바일 앱처럼 아이콘이 생성됩니다.

4. **실시간 온디맨드 Function Calling**
   - 제미나이에게 *"오늘 급식 뭐 나오고 미제출 수행평가 있어?"* 라고 물어보면, 제미나이가 스스로 리로스쿨 도구를 호출하여 최신 데이터를 조회한 후 시각적인 뱃지와 함께 자연어로 요약 답변합니다.

---

## 🏃 빠른 실행 방법

### 방법 1: 빌드된 실행 파일로 실행 (서버 PC 추천)
```
c:\Users\tntdr\.gemini\antigravity-ide\scratch\gemini-chat-studio\dist\GeminiHubServer\GeminiHubServer.exe
```
더블 클릭하여 실행하면 콘솔 화면이 열리며 기본 웹 브라우저가 자동으로 뜹니다.

### 방법 2: Python 소스 코드로 직접 실행
```bash
cd c:\Users\tntdr\.gemini\antigravity-ide\scratch\gemini-chat-studio
python server.py
```

---

## 📱 스마트폰에서 접속하기

1. `server.py` 또는 `GeminiHubServer.exe`를 켭니다.
2. 콘솔 창에 출력되는 **스마트폰/외부 접속 주소**(예: `http://192.168.0.10:8000`)를 확인합니다.
3. 스마트폰을 같은 Wi-Fi에 연결하고, 모바일 브라우저(크롬, 사파리 등)에서 해당 주소를 입력합니다.
4. 모바일 화면 상단에 `[🔌 서비스 허브 (2개 연동)]` 뱃지가 뜨며, 질문 시 서버가 실시간으로 리로스쿨을 조회합니다!

---

## 🛠️ 새로운 서비스 추가하는 방법 (초간단 3단계)

다른 서비스(예: 우리 동네 날씨, 스마트 플러그 전원 제어, 디스코드 알림 등)를 추가하고 싶을 때는 `plugins/` 폴더에 새 파일을 만드시면 됩니다.

### 예시: `plugins/weather_plugin.py`
```python
from plugins.base import BasePlugin, ToolDefinition, ToolParameter

class WeatherPlugin(BasePlugin):
    @property
    def id(self) -> str:
        return "weather"

    @property
    def name(self) -> str:
        return "우리 동네 날씨 서비스"

    @property
    def icon(self) -> str:
        return "☀️"

    def get_weather(self, location: str = "창원") -> dict:
        # 기상청 API 또는 날씨 스크래핑 로직
        return {"location": location, "temp": "18도", "condition": "맑음"}

    def get_tools(self):
        return [
            ToolDefinition(
                name="get_current_weather",
                description="특정 지역의 현재 날씨와 기온을 조회합니다.",
                parameters={
                    "location": ToolParameter(type="STRING", description="조회할 지역 이름 (예: 창원, 마산)")
                },
                handler=self.get_weather
            )
        ]
```
이렇게 파일을 넣고 `server.py`의 `init_plugins()`에 한 줄만 등록하면, 제미나이가 *"오늘 마산 날씨 어때?"*라는 질문을 받았을 때 자동으로 이 도구를 실행합니다.

## 🌐 깃허브 페이지 (GitHub Pages) 연동 & 봇 서버 아키텍처

프론트엔드 웹 화면은 **GitHub Pages**에 배포하고, 서버 PC의 `GeminiHubServer.exe`는 **리로스쿨 & 나이스 봇 백엔드 API 엔진**으로만 활용할 수 있습니다.

### 작동 방식
1. **GitHub Pages에 정적 파일 배포**:
   - `index.html`, `style.css`, `app.js`를 사용자분의 GitHub 레포지토리에 올리고 GitHub Pages를 켭니다. (예: `https://your-name.github.io/your-repo/`)
2. **서버 접속 시 깃허브 페이지 자동 로드**:
   - `config.yaml`에 `github_pages_url: "https://your-name.github.io/your-repo/"`를 입력하면, 사용자가 서버 주소(`http://localhost:8000` 또는 `http://서버IP:8000`)로 접속했을 때 **서버가 깃허브 페이지의 최신 UI를 실시간으로 불러와 화면을 띄워줍니다.**
   - 프론트엔드 코드를 수정하여 깃허브에 푸시하면, `.exe`를 다시 빌드하지 않아도 접속자 모두에게 즉시 최신 화면이 반영됩니다!
3. **깃허브 페이지에서 서버 PC로 채팅/도구 요청 전송**:
   - 웹 화면 우측 상단 **[설정(⚙️)] → [🤖 허브 서버 (봇) 주소]**에 서버 PC의 주소(예: `http://localhost:8000` 또는 공유기 내부 IP `http://192.168.0.x:8000` / 포트포워딩/ngrok 주소)를 입력하고 **[연결 테스트]**를 누르면 바로 연결됩니다.

---

## ⚙️ 설정 파일 (`config.yaml`)

실행 파일(`GeminiHubServer.exe`) 옆에 위치한 `config.yaml`을 메모장으로 열어 자유롭게 설정할 수 있습니다.

```yaml
server:
  host: "0.0.0.0"       # 외부/스마트폰 접속 허용
  port: 8000            # 서버 포트
  open_browser: true    # 시작 시 브라우저 자동 실행
  cors_allowed: true    # 외부/CORS 요청 허용
  # 깃허브 페이지 연동 (비워두면 exe 내장 웹 화면 사용, 입력하면 서버 접속 시 깃허브 페이지에서 최신 UI를 불러옴)
  github_pages_url: "https://your-username.github.io/your-repo/"

plugins:
  riroschool:
    enabled: true       # 마산중앙고 리로스쿨 연동
    user_id: ""         # 비워두면 기존 로컬 세션 자동 사용
    password: ""
  system:
    enabled: true       # 서버 PC 리소스 모니터링
  neis:
    enabled: true       # 교육부 나이스 학사일정 및 시간표
    api_key: ""         # 나이스 무료 인증키 (미입력 시에도 다중 분할 호출로 주간 시간표 및 월간 일정 완전 조회 지원)
    office_code: "S10"  # 경상남도교육청
    school_code: "9010094" # 마산중앙고등학교
```
