@echo off
setlocal enabledelayedexpansion
chcp 65001>nul

set ROOT=%~dp0
set ROOT=%ROOT:~0,-1%
set FN_DIR=%ROOT%\fnnas.clipboard
set FNPACK=%ROOT%\tools\fnpack-1.2.1-windows-amd64.exe
set TEMPLATE_DIR=%ROOT%\pack

if not exist "%FNPACK%" (
  echo [ERROR] Missing fnpack at "%FNPACK%".
  exit /b 1
)

if not exist "%ROOT%\icon.png" (
  echo [ERROR] Missing "%ROOT%\icon.png".
  exit /b 1
)


if not exist "%TEMPLATE_DIR%\manifest" (
  echo [ERROR] Missing "%TEMPLATE_DIR%\manifest".
  exit /b 1
)

if not exist "%FN_DIR%" (
  echo [1/6] Create package directory...
  "%FNPACK%" create fnnas.clipboard
  if errorlevel 1 exit /b 1
)

echo [2/6] Write manifest/config/cmd/ui config...
if not exist "%FN_DIR%\config" mkdir "%FN_DIR%\config"
if not exist "%FN_DIR%\cmd" mkdir "%FN_DIR%\cmd"
if not exist "%FN_DIR%\app\ui\images" mkdir "%FN_DIR%\app\ui\images"
copy /y "%TEMPLATE_DIR%\manifest" "%FN_DIR%\manifest" >nul
copy /y "%TEMPLATE_DIR%\privilege" "%FN_DIR%\config\privilege" >nul
copy /y "%TEMPLATE_DIR%\resource" "%FN_DIR%\config\resource" >nul
copy /y "%TEMPLATE_DIR%\main" "%FN_DIR%\cmd\main" >nul
copy /y "%TEMPLATE_DIR%\ui_config" "%FN_DIR%\app\ui\config" >nul

echo [3/6] Bundle server (single file)...
if exist "%FN_DIR%\app\server" rmdir /s /q "%FN_DIR%\app\server"
mkdir "%FN_DIR%\app\server"
if exist "%ROOT%\node_modules\.bin\esbuild.cmd" (
  call "%ROOT%\node_modules\.bin\esbuild.cmd" "%ROOT%\server.js" --bundle --platform=node --format=cjs --target=node18 --minify --outfile="%FN_DIR%\app\server\index.cjs"
) else (
  call npx --yes esbuild "%ROOT%\server.js" --bundle --platform=node --format=cjs --target=node18 --minify --outfile="%FN_DIR%\app\server\index.cjs"
)
if errorlevel 1 exit /b 1

echo [4/6] Copy client assets...
xcopy "%ROOT%\public" "%FN_DIR%\app\server\public" /E /I /Y >nul

echo [5/6] Generate icons...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.Drawing; $src='%ROOT%\icon.png'; $dest='%FN_DIR%\app\ui\images'; New-Item -ItemType Directory -Force -Path $dest | Out-Null; $img=[System.Drawing.Image]::FromFile($src); function Save-Icon([int]$size,[string]$outPath,[System.Drawing.Image]$img){ $bmp=New-Object System.Drawing.Bitmap $size,$size; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.Clear([System.Drawing.Color]::Transparent); $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::HighQuality; $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; $g.CompositingQuality=[System.Drawing.Drawing2D.CompositingQuality]::HighQuality; $scale=[Math]::Min($size / $img.Width, $size / $img.Height); $newW=[int]([Math]::Round($img.Width * $scale)); $newH=[int]([Math]::Round($img.Height * $scale)); $x=[int](($size - $newW) / 2); $y=[int](($size - $newH) / 2); $g.DrawImage($img, $x, $y, $newW, $newH); $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose(); } Save-Icon 64 (Join-Path $dest 'icon_64.png') $img; Save-Icon 256 (Join-Path $dest 'icon_256.png') $img; $img.Dispose(); Copy-Item -Force -Path (Join-Path $dest 'icon_64.png') -Destination '%FN_DIR%\ICON.PNG'; Copy-Item -Force -Path (Join-Path $dest 'icon_256.png') -Destination '%FN_DIR%\ICON_256.PNG';"
if errorlevel 1 exit /b 1

echo [6/6] Build FPK...
pushd "%FN_DIR%"
"%FNPACK%" build
set BUILD_RC=%ERRORLEVEL%
popd
if not "%BUILD_RC%"=="0" exit /b %BUILD_RC%
if not exist "%FN_DIR%\fnnas.clipboard.fpk" (
  echo [ERROR] Build failed: fpk not created.
  exit /b 1
)

echo Done. Output: "%FN_DIR%\fnnas.clipboard.fpk"
exit /b 0
