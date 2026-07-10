@echo off
title UltraERP
cd /d "%~dp0"

REM === Primeira execucao: cria o ambiente e instala as dependencias ===
if not exist ".venv\Scripts\python.exe" (
    echo Primeira execucao detectada. Preparando o ambiente, aguarde...
    echo.
    py -3 -m venv .venv 2>nul || python -m venv .venv
    if not exist ".venv\Scripts\python.exe" (
        echo.
        echo [ERRO] Nao foi possivel criar o ambiente Python .venv.
        echo Verifique se o Python 3.12+ esta instalado e tente de novo.
        echo.
        pause
        exit /b 1
    )
    ".venv\Scripts\python.exe" -m pip install --upgrade pip
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt
    echo.
    echo Ambiente pronto. Abrindo o UltraERP...
    echo.
)

REM === Abre o aplicativo ===
".venv\Scripts\python.exe" -m ultraerp.main

REM === Se encerrou com erro, mostra a mensagem e espera ===
if errorlevel 1 (
    echo.
    echo ============================================================
    echo O UltraERP encerrou com um erro. Veja a mensagem acima.
    echo ============================================================
    echo.
    pause
)
