# 🤖 GeminiChat Studio

Gemini API 키만 입력하면 원하는 모델을 자유롭게 골라 대화할 수 있는 강력한 웹앱입니다.

## ✨ 주요 기능
- 🔑 **API 키 로컬 관리**: 제3자 서버 없이 브라우저 `localStorage`에만 안전하게 저장
- 🤖 **최신 Gemini 모델 자유 선택**: Pro, Flash, Thinking 등 API 키가 지원하는 모든 모델 목록 자동 로드
- 🌐 **Google 실시간 웹 검색(Grounding)**: 최신 정보 및 시사 질문 시 원클릭으로 Google 검색 연동 및 출처(Sources) 제공
- 💬 **실시간 스트리밍 대화**: `streamGenerateContent` API 기반의 타이핑 효과
- 📝 **Markdown & 코드 하이라이팅**: 코드 복사 기능, 서식 렌더링 지원
- 🗂️ **대화 세션 관리**: 멀티 세션 생성, 검색, Markdown 내보내기 지원
- ⚙️ **생성 옵션 커스텀**: Temperature, Max Output Tokens, System Instruction 조정 가능

## 🚀 GitHub Pages 배포 방법
1. 이 저장소를 GitHub의 새 레포지토리에 푸시합니다.
2. GitHub 저장소의 **Settings** → **Pages** 로 이동합니다.
3. **Build and deployment** 항목의 **Source**를 `Deploy from a branch`로 선택합니다.
4. **Branch**를 `main` (또는 `master`), 폴더를 `/ (root)`로 설정하고 **Save**를 누릅니다.
5. 수 분 내에 `https://<github-username>.github.io/<repository-name>/` 주소로 배포가 완료됩니다!
