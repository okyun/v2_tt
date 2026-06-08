@echo off
REM docker compose에는 Schema Registry가 없습니다.
REM 원본 토픽은 JSON이므로 kafka-streams-view.bat 를 사용하세요.

echo docker compose에는 Schema Registry가 없습니다.
echo JSON 메시지 확인: kafka-streams-view.bat [토픽명]  (예: kafka-streams-view.bat product-click)
exit /b 1
