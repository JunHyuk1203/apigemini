@echo off
chcp 65001 > nul
echo ========================================================
echo  GitHub 저장소 (junhyuk1203/apigemini) 로 푸시합니다...
echo ========================================================
cd /d "%~dp0"
git push origin main
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [성공] GitHub에 정상적으로 모든 파일이 등록되었습니다!
) else (
    echo.
    echo [안내] GitHub 로그인 창이 뜨면 브라우저로 인증을 완료해주세요.
)
pause
