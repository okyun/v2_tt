# Redis DAU 비트맵 vs Set — compare-dau-bitmap-vs-set.js 래퍼
#
# 예:
#   cd tt\performance-tests\k6
#   $env:JWT = "<액세스토큰>"
#   .\compare-dau-bitmap-vs-set.ps1
#
#   $env:TOKENS_FILE = ".\dau-100-tokens.json"
#   $env:VUS = "100"
#   $env:DURATION = "1m"
#   .\compare-dau-bitmap-vs-set.ps1
#
# Redis 카운트까지 보려면:
#   $env:REDIS_DOCKER_CONTAINER = "talktrip-redis"

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
node .\compare-dau-bitmap-vs-set.js
