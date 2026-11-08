@echo off
set "PYTHON=%~dp0.venv\Scripts\python.exe"
if not exist "%PYTHON%" (
  echo Python virtual environment not found: %PYTHON%
  echo See tools\document_organizer\README.md
  pause
  exit /b 1
)
"%PYTHON%" "%~dp0app.py"
if errorlevel 1 pause