#!/bin/bash

echo "🔥 채팅방 과부하 테스트 실행 스크립트"
echo "=================================="

# 테스트 타입 선택
echo "테스트 타입을 선택하세요:"
echo "1) 간단한 과부하 테스트 (1000명, 5분)"
echo "2) 중간 과부하 테스트 (500명, 10분)"
echo "3) 극한 과부하 테스트 (1000명, 15분)"
echo "4) 메시지 전송 테스트 (간단) - 1000, 5000, 10000, 30000, 50000개 메시지"
echo "5) 메시지 전송 테스트 (완전) - API + 메시지 전송"
echo "6) 로드 밸런싱 체크"
echo "7) 커스텀 테스트"
read -p "선택 (1-7): " choice

case $choice in
  1)
    echo "🚀 간단한 과부하 테스트 실행 중..."
    docker run --rm -v $(pwd)/performance-tests/k6:/scripts --network project_talktrip-network grafana/k6:latest run /scripts/chat-room-simple-overload-test.js --out influxdb=http://talktrip-influxdb:8086/k6
    ;;
  2)
    echo "🚀 중간 과부하 테스트 실행 중..."
    docker run --rm -v $(pwd)/performance-tests/k6:/scripts --network project_talktrip-network grafana/k6:latest run /scripts/chat-room-overload-test.js --out influxdb=http://talktrip-influxdb:8086/k6
    ;;
  3)
    echo "🚀 극한 과부하 테스트 실행 중..."
    docker run --rm -v $(pwd)/performance-tests/k6:/scripts --network project_talktrip-network grafana/k6:latest run /scripts/chat-room-overload-test.js --out influxdb=http://talktrip-influxdb:8086/k6 --vus 1000 --duration 15m
    ;;
  4)
    echo "🚀 메시지 전송 테스트 (간단) 실행 중..."
    read -p "서버 개수를 입력하세요 (기본값: 3): " server_count
    server_count=${server_count:-3}
    docker run --rm -v $(pwd)/performance-tests/k6:/scripts --network project_talktrip-network -e SERVER_COUNT=$server_count grafana/k6:latest run /scripts/chat-message-simple-test.js --out influxdb=http://talktrip-influxdb:8086/k6
    ;;
  5)
    echo "🚀 메시지 전송 테스트 (완전) 실행 중..."
    read -p "서버 개수를 입력하세요 (기본값: 3): " server_count
    server_count=${server_count:-3}
    docker run --rm -v $(pwd)/performance-tests/k6:/scripts --network project_talktrip-network -e SERVER_COUNT=$server_count grafana/k6:latest run /scripts/chat-message-overload-test.js --out influxdb=http://talktrip-influxdb:8086/k6
    ;;
  6)
    echo "🔍 로드 밸런싱 체크 실행 중..."
    read -p "서버 개수를 입력하세요 (기본값: 3): " server_count
    server_count=${server_count:-3}
    docker run --rm -v $(pwd)/performance-tests/k6:/scripts --network project_talktrip-network -e SERVER_COUNT=$server_count grafana/k6:latest run /scripts/load-balancing-check.js --out influxdb=http://talktrip-influxdb:8086/k6
    ;;
  7)
    read -p "VU 수를 입력하세요 (기본값: 500): " vus
    read -p "테스트 시간을 입력하세요 (예: 10m, 기본값: 10m): " duration
    vus=${vus:-500}
    duration=${duration:-10m}
    
    echo "🚀 커스텀 과부하 테스트 실행 중... (VU: $vus, Duration: $duration)"
    docker run --rm -v $(pwd)/performance-tests/k6:/scripts --network project_talktrip-network grafana/k6:latest run /scripts/chat-room-overload-test.js --out influxdb=http://talktrip-influxdb:8086/k6 --vus $vus --duration $duration
    ;;
  *)
    echo "❌ 잘못된 선택입니다."
    exit 1
    ;;
esac

echo ""
echo "📊 테스트 완료!"
echo "Grafana에서 결과를 확인하세요: http://localhost:3000"
echo "  - 사용자명: admin"
echo "  - 비밀번호: admin123"
