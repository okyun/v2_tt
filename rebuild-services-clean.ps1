# 변경사항을 이미지에 반영하려면 반드시 --build가 필요합니다.
# 사용법(프로젝트 루트): .\tt\rebuild-services-clean.ps1
# powershell -NoProfile -ExecutionPolicy Bypass -File ".\tt\rebuild-services-clean.ps1"
#
# (JAR 이미 빌드된 뒤) compose만 다시 올리기 — tt 폴더에서:
#   docker compose --env-file ..\.env up -d --build --force-recreate talktrip-chat-service talktrip-order-email-service talktrip-order-purchases-service talktrip-product-click-service talktrip-stats-service talktrip-trending-service kafka-ui
# 상세·전체 한 줄 예시: tt\back_end\docs\LOCAL_DEV_COMMANDS.md 의 「2. Docker — 마이크로서비스만 재빌드·재기동」
# 중지(tt 폴더, 이 스크립트와 동일 위치): docker compose down  (또는 docker compose --env-file ..\.env down)

Set-Location $PSScriptRoot
$envFile = Join-Path $PSScriptRoot "..\\.env"
$composeEnvArgs = @()
if (Test-Path -LiteralPath $envFile) {
  $composeEnvArgs = @("--env-file", $envFile)
} else {
  Write-Warning ".env 없음 ($envFile) — --env-file 없이 compose 합니다."
}

function Build-BootJar([string]$path) {
  Push-Location $path
  try {
    .\gradlew.bat bootJar -x test
  } finally {
    Pop-Location
  }
}

# 1) 호스트에서 JAR 생성
Build-BootJar "..\\talktrip-chatting-service"
Build-BootJar "..\\talktrip-order-email-service"
Build-BootJar "..\\talktrip-order-purchases-service"
Build-BootJar "..\\talktrip-product-click-service"
Build-BootJar "..\\talktrip-stats-service"
Build-BootJar "..\\talktrip-trending-service"

# 2) Docker 이미지 재빌드/재기동 (마이크로서비스 6개 + kafka-ui)
$services = @(
  "talktrip-chat-service", "talktrip-order-email-service", "talktrip-order-purchases-service",
  "talktrip-product-click-service", "talktrip-stats-service", "talktrip-trending-service", "kafka-ui"
)
docker compose @composeEnvArgs up -d --build --force-recreate @services

Write-Host ""
Write-Host "재빌드/재기동 완료 요청: chatting/order-email/order-purchases/product-click/stats/trending + kafka-ui (http://localhost:8086)" -ForegroundColor Green
Write-Host "상태 확인: cd tt; docker compose --env-file ..\\.env ps" -ForegroundColor Cyan
