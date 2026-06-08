# 백엔드 제외 인프라만 Docker 기동 (MySQL, Redis, Kafka, Kafka UI)
# 사용법: 프로젝트 루트에서 .\tt\start-db.ps1

Set-Location $PSScriptRoot
$envFile = Join-Path $PSScriptRoot "..\\.env"
$composeEnvArgs = @()
if (Test-Path -LiteralPath $envFile) {
    $composeEnvArgs = @("--env-file", $envFile)
} else {
    Write-Warning ".env 없음 ($envFile) — KAFKA_HOST 없이 compose 합니다. 로컬이면 루트에 .env 를 두는 것을 권장합니다."
}

$kafkaHost = ""
try {
    if (Test-Path -LiteralPath $envFile) {
        $kafkaHostLine = Get-Content -Path $envFile -ErrorAction Stop | Where-Object { $_ -match '^\s*KAFKA_HOST\s*=' } | Select-Object -First 1
        if ($kafkaHostLine) {
            $kafkaHost = ($kafkaHostLine -split '=', 2)[1].Trim()
        }
    }
} catch {
    $kafkaHost = ""
}

docker compose @composeEnvArgs up -d mysql redis kafka kafka-ui
Write-Host ""
Write-Host "기동 요청 완료: mysql, redis, kafka, kafka-ui" -ForegroundColor Green
$kafkaExternal = if ($kafkaHost) { "$kafkaHost`:9092, $kafkaHost`:19092, $kafkaHost`:19093" } else { "localhost:9092" }
Write-Host "  MySQL: localhost:3306 | Redis: localhost:6379 | Kafka(외부): $kafkaExternal | Kafka UI: http://localhost:8086" -ForegroundColor Cyan
Write-Host "상태 확인: docker ps" -ForegroundColor Cyan
