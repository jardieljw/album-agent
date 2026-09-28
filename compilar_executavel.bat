@echo off
chcp 65001 > nul
set PYTHONUTF8=1
echo ==============================================
echo  A compilar IMAGEX.AI (Frontend + Executavel)
echo ==============================================
echo.

echo [1/3] A compilar Frontend com Vite...
cd frontend-mobile-preview
call npm.cmd install
call npm.cmd run build
cd ..

echo.
echo [2/3] A verificar dependencias do Playwright...
python -m playwright install chromium

echo.
echo [3/3] A gerar executavel com PyInstaller...
python -m PyInstaller --clean --onefile --noconsole --paths . --collect-all src --collect-all webview --collect-all playwright --add-data "frontend-mobile-preview/dist;frontend-mobile-preview/dist" --hidden-import=uvicorn.logging --hidden-import=uvicorn.loops.auto --hidden-import=uvicorn.protocols.http.auto --hidden-import=uvicorn.lifespan.on src/main.py

echo.
echo ==============================================
echo  Concluido! O executavel esta em dist\main.exe
echo ==============================================
pause