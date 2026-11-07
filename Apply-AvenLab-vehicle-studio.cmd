@echo off
setlocal EnableExtensions

set "PATCH_FILE=%~dp0AvenLab-vehicle-studio.patch"
if not exist "%PATCH_FILE%" (
  echo ERROR: Could not find AvenLab-vehicle-studio.patch beside this command file.
  goto failed
)

if not "%~1"=="" (
  set "REPO=%~1"
) else (
  set /p "REPO=Enter the full path to your AvenLab repository: "
)
if not defined REPO (
  echo ERROR: No repository path was provided.
  goto failed
)

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git was not found. Install Git for Windows and try again.
  goto failed
)

git -C "%REPO%" rev-parse --show-toplevel >nul 2>nul
if errorlevel 1 (
  echo ERROR: The path is not a Git repository: "%REPO%"
  goto failed
)
for /f "usebackq delims=" %%G in (`git -C "%REPO%" rev-parse --show-toplevel 2^>nul`) do set "REPO_ROOT=%%G"
for /f "usebackq delims=" %%B in (`git -C "%REPO_ROOT%" branch --show-current 2^>nul`) do set "BRANCH=%%B"

echo.
echo Repository: "%REPO_ROOT%"
echo Branch: %BRANCH%
echo Checking for conflicts before applying anything...
git -C "%REPO_ROOT%" apply --check --binary "%PATCH_FILE%"
if errorlevel 1 (
  echo.
  echo SAFE STOP: The patch conflicts with the repository or local edits. Nothing was applied.
  goto failed
)

git -C "%REPO_ROOT%" apply --binary "%PATCH_FILE%"
if errorlevel 1 (
  echo.
  echo ERROR: Git could not apply the patch.
  goto failed
)

echo.
echo AvenLab update applied successfully.
echo Review the changes with: git -C "%REPO_ROOT%" status --short
echo Frontend typecheck: cd /d "%REPO_ROOT%\frontend" ^&^& npm run typecheck
goto done

:failed
echo.
:done
pause
endlocal
