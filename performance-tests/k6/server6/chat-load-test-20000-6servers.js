import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');
const successRate = new Rate('success');

export const options = {
  stages: [
    { duration: '3m', target: 2000 },   // 3분 동안 2000명까지 증가
    { duration: '5m', target: 10000 },  // 5분 동안 10000명까지 증가
    { duration: '8m', target: 20000 },  // 8분 동안 20000명까지 증가
    { duration: '15m', target: 20000 }, // 15분 동안 20000명 유지
    { duration: '3m', target: 0 },      // 3분 동안 0명까지 감소
  ],
  thresholds: {
    http_req_duration: ['p(95)<15000'], // 95%의 요청이 15초 이내
    http_req_failed: ['rate<0.3'],      // 에러율 30% 미만
    errors: ['rate<0.3'],               // 커스텀 에러율 30% 미만
    success: ['rate>0.7'],              // 성공률 70% 이상
  },
  ext: {
    influxdb: {
      url: 'http://talktrip-influxdb:8086',
      database: 'k6',
      username: 'admin',
      password: 'admin123',
    },
  },
};

const BASE_URL = 'http://talktrip-nginx';
const SERVERS = ['talktrip-app-1', 'talktrip-app-2', 'talktrip-app-3', 'talktrip-app-4', 'talktrip-app-5', 'talktrip-app-6'];
const SERVER_COUNT = 6;

// 로드 밸런서 검사 함수
function checkLoadBalancer() {
  console.log('🔍 6개 서버 로드 밸런서 검사 시작...');
  
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
  console.log(`📈 6개 서버 상태: ${healthyServers}/${totalServers} (${(healthRatio * 100).toFixed(1)}%)`);
  
  if (healthRatio < 0.5) {
    console.log('⚠️ 경고: 50% 미만의 서버만 정상 작동 중');
  } else {
    console.log('✅ 6개 서버 로드 밸런서 상태 양호');
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
  group('6개 서버 Chat Rooms API Load Test', function () {
    totalTests++;
    response = http.get(`${BASE_URL}/api/chat/me/chatRooms?limit=25`);
    if (check(response, {
      '6개서버 chat rooms list accessible': (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.2);
  });

  // 2. 채팅방 상세 조회
  group('6개 서버 Chat Room Detail API', function () {
    totalTests++;
    response = http.get(`${BASE_URL}/api/chat/me/chatRooms/ROOM_1?includeMessages=true&limit=50`);
    if (check(response, {
      '6개서버 chat room detail accessible': (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.2);
  });

  // 3. 채팅방 메시지 조회
  group('6개 서버 Chat Messages API', function () {
    totalTests++;
    response = http.get(`${BASE_URL}/api/chat/me/chatRooms/ROOM_1/messages?limit=20`);
    if (check(response, {
      '6개서버 chat messages accessible': (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.2);
  });

  // 4. 안읽은 메시지 수 조회
  group('6개 서버 Unread Messages Count API', function () {
    totalTests++;
    response = http.get(`${BASE_URL}/api/chat/countALLUnreadMessages`);
    if (check(response, {
      '6개서버 unread messages count accessible': (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.2);
  });

  // 메트릭 업데이트
  if (successCount > totalTests / 2) {
    successRate.add(1);
  } else {
    errorRate.add(1);
  }

  sleep(0.3);
}
