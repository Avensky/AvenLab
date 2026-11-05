@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "PATCH=%~dp0harbor-update.patch"
set "BUNDLE=%~dp0harbor-update.bundle"
set "BASE=a3ef3669308a739dd216655c6ec93fd885c72907"
set "TARGET=%~1"
if defined TARGET goto target
if exist "%~dp0..\avenlab-server\Cargo.toml" set "TARGET=%~dp0.."
if not defined TARGET if exist "%CD%\avenlab-server\Cargo.toml" set "TARGET=%CD%"
if not defined TARGET if exist "C:\Users\uriel\Projects\AvenLab\avenlab-server\Cargo.toml" set "TARGET=C:\Users\uriel\Projects\AvenLab"
if not defined TARGET set "TARGET=%USERPROFILE%\Projects\AvenLab"
:target
pushd "%TARGET%" || goto bad_target
if not exist "avenlab-server\Cargo.toml" goto wrong_repo
if not exist "frontend\package.json" goto wrong_repo
git rev-parse --verify HEAD >nul 2>&1 || goto wrong_repo
where node >nul 2>&1 || goto need_node
where npm >nul 2>&1 || goto need_node
node -e "process.exit(process.versions.node.split('.')[0] === '24' ? 0 : 1)" || goto need_node
git lfs version >nul 2>&1 || goto need_lfs
if exist "%BUNDLE%" goto bundle
if not exist "%PATCH%" goto installed
git apply --reverse --check --whitespace=nowarn "%PATCH%" >nul 2>&1
if not errorlevel 1 goto assets
git merge-base --is-ancestor %BASE% HEAD || goto wrong_base
echo Checking the update against your working files...
git apply --check --whitespace=nowarn "%PATCH%" || goto conflict
git apply --whitespace=nowarn "%PATCH%" || goto conflict
goto assets
:bundle
echo Importing the harbor commit into your checkout...
git fetch --no-tags "%BUNDLE%" HEAD || goto bundle_error
git merge-base --is-ancestor FETCH_HEAD HEAD
if not errorlevel 1 goto assets
git merge-base --is-ancestor HEAD FETCH_HEAD || goto diverged
git merge --ff-only FETCH_HEAD || goto conflict
goto assets
:installed
if not exist "frontend\src\ui\Minimap\SurveyMap.tsx" goto missing_patch
if not exist "frontend\scripts\build-harbor-facades.mjs" goto missing_patch
:assets
echo Preparing the harbor assets in "%CD%"...
git lfs pull --include="frontend/public/models/roads/**,frontend/public/models/world/garage_special.glb,frontend/public/models/world/big-e-docked.glb,frontend/public/models/chuncks/chunck_0,0_2x2_blocks_centered_textures512.glb" || goto asset_error
call npm ci --prefix frontend --no-audit --no-fund || goto dependency_error
node frontend\scripts\build-harbor-facades.mjs || goto asset_error
echo Harbor update installed. Restart the server and client with your usual dev command.
popd
exit /b 0
:bundle_error
echo Git could not import the bundled commit. Check that your checkout contains the base commit and all files were extracted.
goto failed
:diverged
echo Your branch has additional commits. The update is available as FETCH_HEAD; merge it when ready and rerun this installer.
goto failed
:wrong_repo
echo This folder must be an AvenLab Git checkout with avenlab-server and frontend.
goto failed
:wrong_base
echo This checkout needs the base commit %BASE% or a descendant. Update your checkout and run again.
goto failed
:missing_patch
echo Extract the entire download and keep harbor-update.patch beside this installer.
goto failed
:conflict
echo The patch overlaps local changes or a newer update. Git's checks above identify the affected files.
goto failed
:need_node
echo Install Node.js 24 with npm, then run this installer again.
goto failed
:need_lfs
echo Install Git LFS for Windows, then run this installer again.
goto failed
:asset_error
echo Asset preparation failed. Check the Git LFS output and run the installer again.
goto failed
:dependency_error
echo npm could not install the frontend dependencies. Fix the error above and run again.
:failed
popd
exit /b 1
:bad_target
echo Cannot open "%TARGET%". Pass your checkout folder as the first argument to this installer.
exit /b 1
