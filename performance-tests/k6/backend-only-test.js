import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');
const successRate = new Rate('success');

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // 30초 동안 20명까지 증가
    { duration: '1m', target: 50 },    // 1분 동안 50명 유지
    { duration: '30s', target: 100 },  // 30초 동안 100명까지 증가
    { duration: '2m', target: 100 },   // 2분 동안 100명 유지
    { duration: '30s', target: 0 },    // 30초 동안 0명까지 감소
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'], // 95%의 요청이 5초 이내
    http_req_failed: ['rate<0.3'],     // 에러율 30% 미만
    errors: ['rate<0.3'],              // 커스텀 에러율 30% 미만
    success: ['rate>0.7'],             // 성공률 70% 이상
  },
};

const BASE_URL = 'http://nginx';

// 로드 밸런서 검사 함수
function checkLoadBalancer() {
  console.log('🔍 로드 밸런서 검사 시작...');
  
  const servers = ['talktrip-app-1', 'talktrip-app-2', 'talktrip-app-3'];
  console.log(`📊 검사 대상 서버: ${servers.join(', ')}`);
  
  let healthyServers = 0;
  let totalServers = servers.length;
  
  servers.forEach(server => {
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
  console.log(`📈 서버 상태: ${healthyServers}/${totalServers} (${(healthRatio * 100).toFixed(1)}%)`);
  
  if (healthRatio < 0.5) {
    console.log('⚠️ 경고: 50% 미만의 서버만 정상 작동 중');
  } else {
    console.log('✅ 로드 밸런서 상태 양호');
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

  // 1. 채팅방 목록 API 호출
  group('Chat Rooms API Access', function () {
    totalTests++;
    response = http.get(`${BASE_URL}/api/chat/me/chatRooms?limit=25`);
    if (check(response, {
      'chat rooms list accessible': (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(1);
  });

  // 2. 채팅방 생성 시뮬레이션
  group('Chat Room Creation Simulation', function () {
    totalTests++;
    const createRoomPayload = {
      name: `Test Room ${__VU}-${__ITER}`,
      memberIds: ['member1', 'member2'],
    };
    response = http.post(`${BASE_URL}/api/chat/rooms`, JSON.stringify(createRoomPayload), {
      headers: { 'Content-Type': 'application/json' },
    });
    if (check(response, {
      'chat room creation successful': (r) => r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(1);
  });

  // 3. 채팅 메시지 전송 시뮬레이션
  group('Chat Message Sending Simulation', function () {
    const roomId = 'ROOM_1';
    const messagePayload = {
      content: `Hello from VU ${__VU} - Iter ${__ITER}`,
    };
    totalTests++;
    response = http.post(`${BASE_URL}/api/chat/rooms/${roomId}/messages`, JSON.stringify(messagePayload), {
      headers: { 'Content-Type': 'application/json' },
    });
    if (check(response, {
      'chat message sent': (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(1);
  });

  // 4. 상품 목록 API 호출
  group('Products API Access', function () {
    totalTests++;
    response = http.get(`${BASE_URL}/api/products?page=0&size=10`);
    if (check(response, {
      'products list accessible': (r) => r.status === 200,
    })) {
      successCount++;
      success = true;
    }
    sleep(1);
  });

  // 메트릭 업데이트
  if (successCount > totalTests / 2) {
    successRate.add(1);
  } else {
    errorRate.add(1);
  }

  sleep(1);
}
