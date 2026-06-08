#!/usr/bin/env sh
# Redis DAU 비트맵 vs Set 비교 — Node 스크립트 실행 (JWT 또는 TOKENS_FILE 필요)
#
#   export JWT="..."
#   export BASE_URL=http://127.0.0.1:8080
#   export VUS=50 DURATION=30s
#   ./compare-dau-bitmap-vs-set.sh
#
#   export TOKENS_FILE=./dau-100-tokens.json
#   export REDIS_DOCKER_CONTAINER=talktrip-redis
#   ./compare-dau-bitmap-vs-set.sh

set -e
cd "$(dirname "$0")"
exec node compare-dau-bitmap-vs-set.js
