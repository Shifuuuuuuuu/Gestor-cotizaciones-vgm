@echo off
title VGM - Gestor de cotizaciones
cd /d "%~dp0"
if not exist node_modules call npm install
if not exist .env copy .env.example .env >nul
echo Abre http://localhost:5173 en tu navegador.
echo Para detener la aplicacion presiona Ctrl+C.
call npm run dev
pause
