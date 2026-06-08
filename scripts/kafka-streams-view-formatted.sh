#!/bin/bash
# Kafka Streams 결과를 JSON 형식으로 보기 좋게 확인하는 스크립트 (Linux/Mac)
# 
# 사용법:
#   chmod +x kafka-streams-view-formatted.sh
#   ./kafka-streams-view-formatted.sh [토픽명]
# 
# 요구사항: jq 설치 필요 (JSON 포맷터)
#   Ubuntu/Debian: sudo apt-get install jq
#   Mac: brew install jq

KAFKA_BOOTSTRAP_SERVERS="${KAFKA_BOOTSTRAP_SERVERS:-localhost:9092}"

if [ -z "$1" ]; then
    echo "================================================"
    echo "Kafka Streams 결과 확인 (JSON 포맷)"
    echo "================================================"
    echo ""
    echo "사용법: ./kafka-streams-view-formatted.sh [토픽명]"
    echo "예시:   ./kafka-streams-view-formatted.sh product-click-stats"
    echo ""
    echo "주의: jq가 설치되어 있어야 합니다."
    exit 0
fi

TOPIC="$1"

# jq 설치 확인
if ! command -v jq &> /dev/null; then
    echo "오류: jq가 설치되어 있지 않습니다."
    echo ""
    echo "설치 방법:"
    echo "  Ubuntu/Debian: sudo apt-get install jq"
    echo "  Mac: brew install jq"
    echo "  CentOS/RHEL: sudo yum install jq"
    exit 1
fi

echo "================================================"
echo "Kafka Streams 결과 확인 (JSON 포맷): $TOPIC"
echo "================================================"
echo "Bootstrap Servers: $KAFKA_BOOTSTRAP_SERVERS"
echo ""

# Docker 환경 확인
if docker ps --filter "name=talktrip-kafka" --format "{{.Names}}" | grep -q talktrip-kafka; then
    echo "[도커 환경 감지] 도커 컨테이너 내부에서 실행합니다..."
    echo ""
    docker exec -it talktrip-kafka kafka-console-consumer \
        --bootstrap-server localhost:9092 \
        --topic "$TOPIC" \
        --from-beginning \
        --property print.key=true \
        --property print.value=true \
        --property key.separator=" | " \
        --property print.timestamp=true | \
    while IFS= read -r line; do
        # 키와 값 분리
        if [[ $line == *" | "* ]]; then
            KEY=$(echo "$line" | cut -d'|' -f1 | xargs)
            VALUE=$(echo "$line" | cut -d'|' -f2- | xargs)
            
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo "Key: $KEY"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            
            # JSON 포맷팅 시도
            if echo "$VALUE" | jq . > /dev/null 2>&1; then
                echo "$VALUE" | jq .
            else
                echo "$VALUE"
            fi
            echo ""
        else
            echo "$line"
        fi
    done
else
    echo "[로컬 환경] 로컬 Kafka에서 실행합니다..."
    echo ""
    
    if command -v kafka-console-consumer &> /dev/null; then
        kafka-console-consumer \
            --bootstrap-server "$KAFKA_BOOTSTRAP_SERVERS" \
            --topic "$TOPIC" \
            --from-beginning \
            --property print.key=true \
            --property print.value=true \
            --property key.separator=" | " \
            --property print.timestamp=true | \
        while IFS= read -r line; do
            if [[ $line == *" | "* ]]; then
                KEY=$(echo "$line" | cut -d'|' -f1 | xargs)
                VALUE=$(echo "$line" | cut -d'|' -f2- | xargs)
                
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                echo "Key: $KEY"
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                
                if echo "$VALUE" | jq . > /dev/null 2>&1; then
                    echo "$VALUE" | jq .
                else
                    echo "$VALUE"
                fi
                echo ""
            else
                echo "$line"
            fi
        done
    else
        echo "Kafka Console Consumer를 찾을 수 없습니다."
        exit 1
    fi
fi

