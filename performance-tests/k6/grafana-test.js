import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

// 커스텀 메트릭 정의
const errorRate = new Rate('errors');
const successRate = new Rate('success');

export const options = {
  stages: [
    { duration: '10s', target: 10 },   // 10초 동안 10명까지 증가
    { duration: '30s', target: 50 },   // 30초 동안 50명까지 증가
    { duration: '1m', target: 100 },   // 1분 동안 100명까지 증가
    { duration: '30s', target: 0 },    // 30초 동안 0명까지 감소
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95%의 요청이 2초 이내
    http_req_failed: ['rate<0.1'],     // 에러율 10% 미만
    errors: ['rate<0.1'],               // 커스텀 에러율 10% 미만
    success: ['rate>0.9'],              // 성공률 90% 이상
  },
  ext: {
    influxdb: {
      url: 'http://talktrip-influxdb:8086',
      database: 'k6',
      username: 'admin',
      password: 'admin123',
      tagsAsFields: ['url', 'method', 'status'],
    },
  },
};

const BASE_URL = 'http://nginx';

export default function() {
  let success = false;
  let successCount = 0;
  let totalTests = 0;

  // 1. 헬스 체크
  group('Health Check', function () {
    totalTests++;
    const response = http.get(`${BASE_URL}/api/actuator/health`);
    if (check(response, {
      'health check successful': (r) => r.status === 200,
      'response time < 1s': (r) => r.timings.duration < 1000,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.5);
  });

  // 2. 상품 목록 조회
  group('Products API', function () {
    totalTests++;
    const response = http.get(`${BASE_URL}/api/products?page=0&size=10`);
    if (check(response, {
      'products API successful': (r) => r.status === 200,
      'response time < 2s': (r) => r.timings.duration < 2000,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.5);
  });

  // 3. 채팅방 목록 조회
  group('Chat Rooms API', function () {
    totalTests++;
    const response = http.get(`${BASE_URL}/api/chat/me/chatRooms?limit=25`);
    if (check(response, {
      'chat rooms API successful': (r) => r.status === 200 || r.status === 201,
      'response time < 2s': (r) => r.timings.duration < 2000,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.5);
  });

  // 4. 랜덤 상품 상세 조회
  group('Product Detail API', function () {
    const productId = Math.floor(Math.random() * 100) + 1; // 1-100 사이 랜덤 ID
    totalTests++;
    const response = http.get(`${BASE_URL}/api/products/${productId}`);
    if (check(response, {
      'product detail API successful': (r) => r.status === 200 || r.status === 404,
      'response time < 2s': (r) => r.timings.duration < 2000,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.5);
  });

  // 5. 채팅방 상세 조회
  group('Chat Room Detail API', function () {
    const roomId = `ROOM_${Math.floor(Math.random() * 20) + 1}`; // ROOM_1 ~ ROOM_20
    totalTests++;
    const response = http.get(`${BASE_URL}/api/chat/me/chatRooms/${roomId}?includeMessages=true&limit=10`);
    if (check(response, {
      'chat room detail API successful': (r) => r.status === 200 || r.status === 404,
      'response time < 2s': (r) => r.timings.duration < 2000,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.5);
  });

  // 6. 랜덤 대기 시간 (실제 사용자 행동 시뮬레이션)
  sleep(Math.random() * 2 + 1); // 1-3초 랜덤 대기

  // 메트릭 업데이트
  if (successCount > totalTests / 2) {
    successRate.add(1);
  } else {
    errorRate.add(1);
  }
}
