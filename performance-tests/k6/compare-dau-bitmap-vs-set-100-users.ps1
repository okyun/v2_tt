# DAU 비트맵 vs Set — 피크 100VU 스테이지 비교 (compare-dau-bitmap-vs-set-100-users.js)
#
# 예:
#   cd tt\performance-tests\k6
#   $env:TOKENS_FILE = ".\dau-100-tokens.json"
#   $env:PEAK_VUS = "100"
#   $env:REDIS_DOCKER_CONTAINER = "talktrip-redis"
#   .\compare-dau-bitmap-vs-set-100-users.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
node .\compare-dau-bitmap-vs-set-100-users.js
