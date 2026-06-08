@echo off
REM 모든 Kafka Streams 결과 토픽을 한번에 확인하는 스크립트 (Windows)
REM 
REM 사용법: kafka-streams-view-all.bat

setlocal enabledelayedexpansion

set KAFKA_BOOTSTRAP_SERVERS=localhost:9092

echo ================================================
echo 모든 Kafka Streams 결과 토픽 확인
echo ================================================
echo Bootstrap Servers: %KAFKA_BOOTSTRAP_SERVERS%
echo.
echo 확인할 토픽:
echo   1. product-click-stats
echo   2. order-purchase-stats
echo.

REM Docker 환경 확인
docker ps --filter "name=talktrip-kafka" --format "{{.Names}}" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [도커 환경] 도커 컨테이너에서 토픽 목록을 확인합니다...
    echo.
    docker exec -it talktrip-kafka kafka-topics --bootstrap-server localhost:9092 --list | findstr /i "stats click order"
    echo.
    echo 각 토픽의 메시지를 확인하려면:
    echo   kafka-streams-view.bat product-click-stats
    echo   kafka-streams-view.bat order-purchase-stats
) else (
    echo [로컬 환경] Kafka 토픽 목록을 확인합니다...
    echo.
    echo Kafka가 설치되어 있고 PATH에 추가되어 있는지 확인하세요.
    echo.
    echo 또는 Docker를 사용하여 확인할 수 있습니다:
    echo   docker exec -it talktrip-kafka kafka-topics --bootstrap-server localhost:9092 --list
)

endlocal

