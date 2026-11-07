@echo off
setlocal EnableExtensions

set "PATCH_FILE=%~dp0AvenLab-getSnapshot-fix.patch"
if not exist "%PATCH_FILE%" (
  echo ERROR: Could not find AvenLab-getSnapshot-fix.patch beside this command file.
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

echo.
echo Repository: "%REPO_ROOT%"
echo Checking the one-file crash fix before applying it...
git -C "%REPO_ROOT%" apply --check "%PATCH_FILE%"
if errorlevel 1 (
  echo.
  echo SAFE STOP: The selector differs from the expected studio version. Nothing was applied.
  goto failed
)
git -C "%REPO_ROOT%" apply "%PATCH_FILE%"
if errorlevel 1 (
  echo.
  echo ERROR: Git could not apply the patch.
  goto failed
)

echo.
echo getSnapshot selector fix applied.
echo Typecheck: cd /d "%REPO_ROOT%\frontend" ^&^& npm run typecheck
goto done

:failed
echo.
:done
pause
endlocal
