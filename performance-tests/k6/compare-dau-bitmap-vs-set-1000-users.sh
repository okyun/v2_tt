#!/usr/bin/env sh
# 피크 VU(기본 1000) 스테이지로 bitmap vs set 비교 (JWT 또는 TOKENS_FILE 필수)
#
#   export TOKENS_FILE=./dau-100-tokens.json
#   export PEAK_VUS=1000
#   ./compare-dau-bitmap-vs-set-1000-users.sh

set -e
cd "$(dirname "$0")"
exec node compare-dau-bitmap-vs-set-1000-users.js

