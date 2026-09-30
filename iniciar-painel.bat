@echo off
setlocal
cd /d "%~dp0"
set RADAR_PORT=4174
set RADAR_HOST=127.0.0.1
where node >nul 2>&1
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (set "RADAR_NODE=%ProgramFiles%\nodejs\node.exe") else (
    if exist "C:\Users\ronyk\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (set "RADAR_NODE=C:\Users\ronyk\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe") else (
      echo.
      echo Nao encontrei o Node.js neste computador.
      echo Instale a versao LTS em https://nodejs.org e abra este arquivo novamente.
      echo.
      pause
      exit /b 1
    )
  )
) else (set "RADAR_NODE=node")
echo.
echo Iniciando Sentinel Trade em http://127.0.0.1:4174
echo Mantenha esta janela aberta enquanto usar o painel.
echo.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4174'"
"%RADAR_NODE%" server.js
echo.
echo O painel foi encerrado. A mensagem acima explica o motivo.
pause
