# DAU 비트맵 vs Set — 피크 1000VU 스테이지 비교 (compare-dau-bitmap-vs-set-1000-users.js)
#
# 예:
#   cd tt\performance-tests\k6
#   $env:TOKENS_FILE = ".\dau-100-tokens.json"
#   $env:PEAK_VUS = "1000"
#   $env:REDIS_DOCKER_CONTAINER = "talktrip-redis"
#   .\compare-dau-bitmap-vs-set-1000-users.ps1
#
# (옵션) 기본 스테이지(2m/5m/2m)를 바꾸려면:
#   $env:RAMP_DURATION="1m"
#   $env:HOLD_DURATION="2m"
#   $env:RAMP_DOWN_DURATION="1m"

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
node .\compare-dau-bitmap-vs-set-1000-users.js

