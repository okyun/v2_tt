import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');
const successRate = new Rate('success');

export const options = {
  stages: [
    { duration: '1m', target: 100 },   // 1분 동안 100명까지 증가
    { duration: '2m', target: 500 },   // 2분 동안 500명까지 증가
    { duration: '3m', target: 1000 },  // 3분 동안 1000명까지 증가
    { duration: '5m', target: 1000 },  // 5분 동안 1000명 유지
    { duration: '1m', target: 0 },     // 1분 동안 0명까지 감소
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'], // 95%의 요청이 5초 이내
    http_req_failed: ['rate<0.1'],     // 에러율 10% 미만
    errors: ['rate<0.1'],              // 커스텀 에러율 10% 미만
    success: ['rate>0.9'],             // 성공률 90% 이상
  },
};
//네! chat-load-test-1000-3servers.js 파일도 동일한 방법으로 실행해보겠습니다.
//먼저 파일에서 ext 설정을 제거하고 --out 옵션으로 실행하겠습니다.
const BASE_URL = 'http://talktrip-nginx';
const SERVERS = ['talktrip-app-1', 'talktrip-app-2', 'talktrip-app-3'];
const SERVER_COUNT = 3;

// 로드 밸런서 검사 함수
function checkLoadBalancer() {
  console.log('🔍 3개 서버 로드 밸런서 검사 시작...');
  
  console.log(`📊 검사 대상 서버: ${SERVERS.join(', ')}`);
  
  let healthyServers = 0;
  let totalServers = SERVERS.length;
  
  SERVERS.forEach(server => {
    const healthUrl = `http://${server}:8080/api/actuator/health`;
    const response = http.get(healthUrl, { timeout: '10s' });
    
    if (response.status === 200) {
      console.log(`✅ ${server}: 정상`);
      healthyServers++;
    } else {
      console.log(`❌ ${server}: 비정상 (상태: ${response.status})`);
    }
  });
  
  const healthRatio = healthyServers / totalServers;
  console.log(`📈 3개 서버 상태: ${healthyServers}/${totalServers} (${(healthRatio * 100).toFixed(1)}%)`);
  
  if (healthRatio < 0.5) {
    console.log('⚠️ 경고: 50% 미만의 서버만 정상 작동 중');
  } else {
    console.log('✅ 3개 서버 로드 밸런서 상태 양호');
  }
  
  return healthRatio >= 0.5;
}

export default function() {
  // 0. 로드 밸런서 상태 확인 (VU당 한 번만 실행)
  if (__VU === 1) {
    checkLoadBalancer();
  }

  let response;
  let success = false;
  let successCount = 0;
  let totalTests = 0;

  // 1. 채팅방 목록 API 호출 (메인 테스트)
  group('3개 서버 Chat Rooms API Load Test', function () {
    totalTests++;
    response = http.get(`${BASE_URL}/api/chat/me/chatRooms?limit=25`);
    if (check(response, {
      '3개서버 chat rooms list accessible': (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.5);
  });

  // 2. 채팅방 상세 조회
  group('3개 서버 Chat Room Detail API', function () {
    totalTests++;
    response = http.get(`${BASE_URL}/api/chat/me/chatRooms/ROOM_1?includeMessages=true&limit=50`);
    if (check(response, {
      '3개서버 chat room detail accessible': (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.5);
  });

  // 3. 채팅방 메시지 조회
  group('3개 서버 Chat Messages API', function () {
    totalTests++;
    response = http.get(`${BASE_URL}/api/chat/me/chatRooms/ROOM_1/messages?limit=20`);
    if (check(response, {
      '3개서버 chat messages accessible': (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.5);
  });

  // 4. 안읽은 메시지 수 조회
  group('3개 서버 Unread Messages Count API', function () {
    totalTests++;
    response = http.get(`${BASE_URL}/api/chat/countALLUnreadMessages`);
    if (check(response, {
      '3개서버 unread messages count accessible': (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.5);
  });

  // 메트릭 업데이트
  if (successCount > totalTests / 2) {
    successRate.add(1);
  } else {
    errorRate.add(1);
  }

  sleep(1);
}
