@echo off
REM Kafka Streams 결과 확인 스크립트 (Windows)
REM 
REM 사용법:
REM   kafka-streams-view.bat [토픽명]
REM 
REM 예시:
REM   kafka-streams-view.bat product-click-stats
REM   kafka-streams-view.bat order-purchase-stats

setlocal enabledelayedexpansion

REM 환경 설정
set KAFKA_BOOTSTRAP_SERVERS=localhost:9092

REM 기본값: 모든 스트림 결과 토픽 확인
if "%~1"=="" (
    echo ================================================
    echo Kafka Streams 결과 토픽 확인
    echo ================================================
    echo.
    echo 사용 가능한 토픽:
    echo   1. product-click-stats      - 상품 클릭 통계 (15분 간격 TOP 30)
    echo   2. order-purchase-stats     - 주문 구매 통계 (15분 간격 TOP 30)
    echo   3. product-click            - 상품 클릭 이벤트 (원본)
    echo   4. order-created            - 주문 생성 이벤트 (원본)
    echo.
    echo 사용법: kafka-streams-view.bat [토픽명]
    echo 예시:   kafka-streams-view.bat product-click-stats
    echo.
    goto :end
)

set TOPIC=%~1

echo ================================================
echo Kafka Streams 결과 확인: %TOPIC%
echo ================================================
echo Bootstrap Servers: %KAFKA_BOOTSTRAP_SERVERS%
echo.

REM Docker 환경 확인 (도커 컨테이너가 실행 중이면 도커 명령 사용)
docker ps --filter "name=talktrip-kafka" --format "{{.Names}}" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [도커 환경 감지] 도커 컨테이너 내부에서 실행합니다...
    echo.
    docker exec -it talktrip-kafka kafka-console-consumer ^
        --bootstrap-server localhost:9092 ^
        --topic %TOPIC% ^
        --from-beginning ^
        --property print.key=true ^
        --property print.value=true ^
        --property key.separator=" | " ^
        --property print.timestamp=true
) else (
    echo [로컬 환경] 로컬 Kafka에서 실행합니다...
    echo.
    echo Kafka Console Consumer를 찾을 수 없습니다.
    echo Kafka가 설치되어 있고 PATH에 추가되어 있는지 확인하세요.
    echo.
    echo 또는 Docker를 사용하여 확인할 수 있습니다:
    echo   docker exec -it talktrip-kafka kafka-console-consumer --bootstrap-server localhost:9092 --topic %TOPIC% --from-beginning
)

:end
endlocal

