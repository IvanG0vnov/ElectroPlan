@echo off
chcp 65001 >nul
title ЭлектроПлан — локальный сервер
cd /d "%~dp0"

py -3 --version >nul 2>nul
if not errorlevel 1 (
  py -3 serve.py
  goto :done
)

python --version >nul 2>nul
if not errorlevel 1 (
  python serve.py
  goto :done
)

echo.
echo Python 3 не найден.
echo Установите Python 3 с https://www.python.org/downloads/
echo При установке отметьте «Add Python to PATH».
echo.
pause
exit /b 1

:done
if errorlevel 1 (
  echo.
  echo Не удалось запустить локальный сервер.
  pause
)
