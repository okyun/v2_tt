#!/bin/bash

echo "🚀 TalkTrip 채팅 API 부하 테스트 시작"
echo "=================================="

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Docker 컨테이너 상태 확인
echo -e "${BLUE}📊 Docker 컨테이너 상태 확인...${NC}"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(talktrip|mysql|redis|nginx)"

echo ""
echo -e "${YELLOW}테스트 옵션을 선택하세요:${NC}"
echo "1. 1000명 동시 접속 테스트 (12분)"
echo "2. 10000명 동시 접속 테스트 (22분)"
echo "3. 20000명 동시 접속 테스트 (34분)"
echo "4. 30000명 동시 접속 테스트 (50분)"
echo "5. 모든 테스트 순차 실행"
echo "6. 종료"

read -p "선택 (1-6): " choice

case $choice in
    1)
        echo -e "${GREEN}🔥 1000명 동시 접속 테스트 시작...${NC}"
        docker exec talktrip-k6 k6 run /scripts/chat-load-test-1000.js
        ;;
    2)
        echo -e "${GREEN}🔥 10000명 동시 접속 테스트 시작...${NC}"
        docker exec talktrip-k6 k6 run /scripts/chat-load-test-10000.js
        ;;
    3)
        echo -e "${GREEN}🔥 20000명 동시 접속 테스트 시작...${NC}"
        docker exec talktrip-k6 k6 run /scripts/chat-load-test-20000.js
        ;;
    4)
        echo -e "${GREEN}🔥 30000명 동시 접속 테스트 시작...${NC}"
        docker exec talktrip-k6 k6 run /scripts/chat-load-test-30000.js
        ;;
    5)
        echo -e "${GREEN}🔥 모든 부하 테스트 순차 실행 시작...${NC}"
        
        echo -e "${YELLOW}1/4: 1000명 테스트${NC}"
        docker exec talktrip-k6 k6 run /scripts/chat-load-test-1000.js
        echo -e "${GREEN}✅ 1000명 테스트 완료${NC}"
        sleep 30
        
        echo -e "${YELLOW}2/4: 10000명 테스트${NC}"
        docker exec talktrip-k6 k6 run /scripts/chat-load-test-10000.js
        echo -e "${GREEN}✅ 10000명 테스트 완료${NC}"
        sleep 30
        
        echo -e "${YELLOW}3/4: 20000명 테스트${NC}"
        docker exec talktrip-k6 k6 run /scripts/chat-load-test-20000.js
        echo -e "${GREEN}✅ 20000명 테스트 완료${NC}"
        sleep 30
        
        echo -e "${YELLOW}4/4: 30000명 테스트${NC}"
        docker exec talktrip-k6 k6 run /scripts/chat-load-test-30000.js
        echo -e "${GREEN}✅ 30000명 테스트 완료${NC}"
        
        echo -e "${GREEN}🎉 모든 부하 테스트 완료!${NC}"
        ;;
    6)
        echo -e "${BLUE}👋 테스트를 종료합니다.${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}❌ 잘못된 선택입니다.${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}📈 테스트 결과를 확인하려면:${NC}"
echo "- Grafana: http://localhost:3000 (admin/admin123)"
echo "- InfluxDB: http://localhost:8087 (compose: 8087→컨테이너 8086, kafka-ui가 호스트 8086 사용)"
echo "- Locust: http://localhost:8089"
