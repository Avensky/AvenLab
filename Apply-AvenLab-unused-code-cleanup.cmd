@echo off
setlocal EnableExtensions
set "PATCH_FILE=%~dp0AvenLab-unused-code-cleanup.patch"
if not exist "%PATCH_FILE%" (
  echo SAFE STOP: Patch file not found beside this script.
  pause
  exit /b 1
)
set "REPO_PATH="
set /p "REPO_PATH=Enter the full path to your AvenLab repository: "
if not defined REPO_PATH (
  echo SAFE STOP: No repository path was entered.
  pause
  exit /b 1
)
for /f "delims=" %%R in ('git -C "%REPO_PATH%" rev-parse --show-toplevel 2^>nul') do set "REPO_ROOT=%%R"
if not defined REPO_ROOT (
  echo SAFE STOP: The path is not a Git repository.
  pause
  exit /b 1
)
echo Checking "%REPO_ROOT%" without changing files...
git -C "%REPO_ROOT%" apply --check --binary "%PATCH_FILE%"
if errorlevel 1 (
  echo SAFE STOP: Local edits conflict with this cleanup or the source files have changed. Nothing was applied.
  pause
  exit /b 1
)
git -C "%REPO_ROOT%" apply --binary "%PATCH_FILE%"
if errorlevel 1 (
  echo ERROR: Git could not apply the cleanup. Review the repository status before retrying.
  pause
  exit /b 1
)
echo Cleanup applied. Review the changed files with git status.
pause
