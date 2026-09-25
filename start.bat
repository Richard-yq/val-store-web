@echo off
title VALORANT PROTOCOL STORE WEB
echo ============================================================
echo   啟動特戰英豪專屬商城與夜市特惠 Web 服務 (Zero-Leakage)
echo ============================================================
echo.
echo 正在啟動本地伺服器 (http://localhost:3000)...
start http://localhost:3000
python server.py
pause
