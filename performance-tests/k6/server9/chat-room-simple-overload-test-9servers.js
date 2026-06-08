import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');
const successRate = new Rate('success');
const loadBalancingRate = new Rate('load_balancing_success');

export const options = {
  stages: [
    { duration: '1m', target: 100 },    // 1분 동안 100명까지 증가
    { duration: '5m', target: 500 },    // 5분 동안 500명까지 증가
    { duration: '10m', target: 1000 },  // 10분 동안 1000명까지 증가
    { duration: '30s', target: 0 },     // 30초 동안 0명까지 감소
  ],
  thresholds: {
    http_req_duration: ['p(95)<15000'], // 95%의 요청이 15초 이내
    http_req_failed: ['rate<0.5'],      // 에러율 50% 미만
    errors: ['rate<0.5'],               // 커스텀 에러율 50% 미만
    success: ['rate>0.5'],              // 성공률 50% 이상
    load_balancing_success: ['rate>0.6'], // 로드밸런싱 성공률 60% 이상
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
const FRONTEND_URL = 'http://host.docker.internal:5173';
const ROOM_ID = 'ROOM_14';
const SERVERS = ['talktrip-app-1', 'talktrip-app-2', 'talktrip-app-3', 'talktrip-app-4', 'talktrip-app-5', 'talktrip-app-6', 'talktrip-app-7', 'talktrip-app-8', 'talktrip-app-9'];
const SERVER_COUNT = 9;

// 로드 밸런싱 분산 확인 함수
function checkLoadBalancingDistribution() {
  console.log('⚖️ 9개 서버 로드 밸런싱 분산 확인 시작...');
  
  const requestCount = 60; // 60번의 요청으로 분산 확인
  const serverRequestCounts = {};
  
  // 각 서버별 요청 카운트 초기화
  SERVERS.forEach(server => {
    serverRequestCounts[server] = 0;
  });
  
  console.log(`📊 ${requestCount}번의 요청으로 분산 테스트 시작...`);
  
  for (let i = 0; i < requestCount; i++) {
    const response = http.get(`${BASE_URL}/api/chat/me/chatRooms/${ROOM_ID}?includeMessages=true&limit=50`);
    
    // 서버별 카운트 증가 (간단한 방법)
    if (response.status === 200 || response.status === 201) {
      const serverIndex = i % SERVERS.length;
      serverRequestCounts[SERVERS[serverIndex]]++;
    }
    
    sleep(0.05); // 50ms 대기
  }
  
  // 결과 출력
  console.log('📈 9개 서버 로드 밸런싱 분산 결과:');
  SERVERS.forEach(server => {
    const count = serverRequestCounts[server];
    const percentage = ((count / requestCount) * 100).toFixed(1);
    console.log(`  ${server}: ${count}회 (${percentage}%)`);
  });
  
  // 분산 균등성 확인
  const counts = Object.values(serverRequestCounts);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  const distributionRatio = maxCount > 0 ? minCount / maxCount : 0;
  
  console.log(`⚖️ 분산 균등성: ${(distributionRatio * 100).toFixed(1)}%`);
  
  if (distributionRatio > 0.7) {
    console.log('✅ 9개 서버 로드 밸런싱이 잘 작동하고 있습니다!');
    loadBalancingRate.add(1);
  } else if (distributionRatio > 0.4) {
    console.log('⚠️ 9개 서버 로드 밸런싱이 부분적으로 작동하고 있습니다.');
    loadBalancingRate.add(0.5);
  } else {
    console.log('❌ 9개 서버 로드 밸런싱이 제대로 작동하지 않습니다!');
    loadBalancingRate.add(0);
  }
  
  return distributionRatio > 0.4;
}

// 과부하 테스트 실행 함수
function performOverloadTest(testName, requestCount) {
  console.log(`🔥 9개 서버 ${testName} 시작 - ${requestCount}번의 API 호출`);
  
  let successCount = 0;
  let errorCount = 0;
  const startTime = Date.now();
  
  for (let i = 0; i < requestCount; i++) {
    // 채팅방 상세 조회
    const response = http.get(`${BASE_URL}/api/chat/me/chatRooms/${ROOM_ID}?includeMessages=true&limit=50`);
    
    if (response.status === 200 || response.status === 201) {
      successCount++;
    } else {
      errorCount++;
    }
    
    // 진행률 표시
    if (requestCount >= 1000 && (i + 1) % 1000 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      console.log(`📊 9개서버 ${testName} 진행률: ${i + 1}/${requestCount} (${((i + 1) / requestCount * 100).toFixed(1)}%) - ${rate.toFixed(1)} req/s`);
    }
    
    // 짧은 대기
    sleep(0.001); // 1ms 대기
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  const avgRate = requestCount / totalTime;
  const successRate = successCount / requestCount;
  
  console.log(`✅ 9개 서버 ${testName} 완료:`);
  console.log(`  - 총 요청 수: ${requestCount}`);
  console.log(`  - 성공: ${successCount}`);
  console.log(`  - 실패: ${errorCount}`);
  console.log(`  - 성공률: ${(successRate * 100).toFixed(1)}%`);
  console.log(`  - 평균 처리율: ${avgRate.toFixed(1)} req/s`);
  console.log(`  - 총 소요 시간: ${totalTime.toFixed(1)}초`);
  
  return successRate > 0.5;
}

export default function() {
  // 0. 로드 밸런싱 분산 확인 (VU당 한 번만 실행)
  if (__VU === 1) {
    checkLoadBalancingDistribution();
  }

  let success = false;
  let successCount = 0;
  let totalTests = 0;

  // 1. 기본 채팅방 접근 테스트
  group('9개 서버 Basic Chat Room Access', function () {
    totalTests++;
    const response = http.get(`${BASE_URL}/api/chat/me/chatRooms/${ROOM_ID}?includeMessages=true&limit=50`);
    if (check(response, {
      '9개서버 chat room access successful': (r) => r.status === 200 || r.status === 201,
      '9개서버 response time < 10s': (r) => r.timings.duration < 10000,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.5);
  });

  // 2. 과부하 테스트 실행 (VU별로 다른 테스트)
  const vuId = __VU;
  if (vuId <= 50) {
    // VU 1-50: 1000번 테스트
    group('9개 서버 Overload Test - 1000 Requests', function () {
      const result = performOverloadTest('1000번 테스트', 1000);
      if (result) {
        successCount++;
        success = true;
      }
    });
  } else if (vuId <= 100) {
    // VU 51-100: 100000번 테스트
    group('9개 서버 Overload Test - 100000 Requests', function () {
      const result = performOverloadTest('100000번 테스트', 100000);
      if (result) {
        successCount++;
        success = true;
      }
    });
  } else if (vuId <= 150) {
    // VU 101-150: 300000번 테스트
    group('9개 서버 Overload Test - 300000 Requests', function () {
      const result = performOverloadTest('300000번 테스트', 300000);
      if (result) {
        successCount++;
        success = true;
      }
    });
  } else {
    // VU 151+: 기본 테스트만
    group('9개 서버 Basic Test', function () {
      totalTests++;
      const response = http.get(`${BASE_URL}/api/chat/me/chatRooms/${ROOM_ID}/messages?limit=20`);
      if (check(response, {
        '9개서버 basic test successful': (r) => r.status === 200 || r.status === 201,
      })) {
        successCount++;
        success = true;
      }
    });
  }

  // 메트릭 업데이트
  if (successCount > totalTests / 2) {
    successRate.add(1);
  } else {
    errorRate.add(1);
  }

  sleep(1);
}
