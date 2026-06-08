#!/bin/bash
# 모든 Kafka Streams 결과 토픽을 한번에 확인하는 스크립트 (Linux/Mac)
# 
# 사용법:
#   chmod +x kafka-streams-view-all.sh
#   ./kafka-streams-view-all.sh

KAFKA_BOOTSTRAP_SERVERS="${KAFKA_BOOTSTRAP_SERVERS:-localhost:9092}"

echo "================================================"
echo "모든 Kafka Streams 결과 토픽 확인"
echo "================================================"
echo "Bootstrap Servers: $KAFKA_BOOTSTRAP_SERVERS"
echo ""
echo "확인할 토픽:"
echo "  1. product-click-stats"
echo "  2. order-purchase-stats"
echo ""

# Docker 환경 확인
if docker ps --filter "name=talktrip-kafka" --format "{{.Names}}" | grep -q talktrip-kafka; then
    echo "[도커 환경] 도커 컨테이너에서 토픽 목록을 확인합니다..."
    echo ""
    docker exec -it talktrip-kafka kafka-topics --bootstrap-server localhost:9092 --list | grep -E "(stats|click|order)"
    echo ""
    echo "각 토픽의 메시지를 확인하려면:"
    echo "  ./kafka-streams-view.sh product-click-stats"
    echo "  ./kafka-streams-view.sh order-purchase-stats"
else
    echo "[로컬 환경] Kafka 토픽 목록을 확인합니다..."
    echo ""
    
    if command -v kafka-topics &> /dev/null; then
        kafka-topics --bootstrap-server "$KAFKA_BOOTSTRAP_SERVERS" --list | grep -E "(stats|click|order)"
    elif [ -d "$KAFKA_HOME" ]; then
        "$KAFKA_HOME/bin/kafka-topics.sh" --bootstrap-server "$KAFKA_BOOTSTRAP_SERVERS" --list | grep -E "(stats|click|order)"
    else
        echo "Kafka Topics 명령을 찾을 수 없습니다."
        echo ""
        echo "또는 Docker를 사용하여 확인할 수 있습니다:"
        echo "  docker exec -it talktrip-kafka kafka-topics --bootstrap-server localhost:9092 --list"
    fi
fi

