#!/bin/bash
# 이 저장소의 Docker Compose에는 Schema Registry가 없습니다.
# 원본 토픽(product-click, order-created)은 JSON 직렬화를 사용합니다.
#
# 사용법: ./kafka-streams-view.sh [토픽명]

echo "docker compose에는 Schema Registry가 없습니다."
echo "JSON 메시지 확인: ./kafka-streams-view.sh <토픽명>  (예: ./kafka-streams-view.sh product-click)"
exit 1
