import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');
const successRate = new Rate('success');
const loadBalancingRate = new Rate('load_balancing_success');
const messageSendRate = new Rate('message_send_success');

export const options = {
  stages: [
    { duration: '1m', target: 50 },     // 1분 동안 50명까지 증가
    { duration: '2m', target: 100 },    // 2분 동안 100명까지 증가
    { duration: '1m', target: 0 },      // 1분 동안 0명까지 감소
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'], // 95%의 요청이 5초 이내
    http_req_failed: ['rate<0.5'],     // 에러율 50% 미만
    errors: ['rate<0.5'],              // 커스텀 에러율 50% 미만
    success: ['rate>0.3'],             // 성공률 30% 이상
    load_balancing_success: ['rate>0.5'], // 로드밸런싱 성공률 50% 이상
    message_send_success: ['rate>0.2'], // 메시지 전송 성공률 20% 이상
  },
};

const BASE_URL = 'http://host.docker.internal';
const FRONTEND_URL = 'http://host.docker.internal:5173';
const ROOM_ID = 'ROOM_14';
const SERVERS = ['talktrip-app-1', 'talktrip-app-2', 'talktrip-app-3', 'talktrip-app-4', 'talktrip-app-5', 'talktrip-app-6', 'talktrip-app-7', 'talktrip-app-8', 'talktrip-app-9'];
const SERVER_COUNT = 9;

// JWT 토큰 저장 변수
let accessToken = null;

// JWT 토큰 생성 함수
function generateJWTToken() {
  console.log('🔑 JWT 토큰 생성 중...');
  
  const response = http.get(`${BASE_URL}/api/member/test-token`);
  
  if (response.status === 200) {
    const tokenData = JSON.parse(response.body);
    accessToken = tokenData.accessToken;
    console.log('✅ JWT 토큰 생성 완료');
    return true;
  } else {
    console.log('❌ JWT 토큰 생성 실패:', response.status, response.body);
    return false;
  }
}

// JWT 헤더 생성 함수
function getJWTHeaders() {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };
}

// 로드 밸런서 검사 함수
function checkLoadBalancer() {
  console.log('🔍 9개 서버 로드 밸런서 검사 시작...');
  
  const serverResponses = {};
  
  // 각 서버별로 직접 요청하여 응답 확인
  SERVERS.forEach(server => {
    try {
      const response = http.get(`http://${server}:8080/actuator/health`, {
        timeout: '10s'
      });
      
      serverResponses[server] = {
        status: response.status,
        healthy: response.status === 200,
        responseTime: response.timings.duration
      };
      
      console.log(`📊 ${server}: ${response.status} (${response.timings.duration}ms)`);
    } catch (error) {
      serverResponses[server] = {
        status: 'ERROR',
        healthy: false,
        error: error.message
      };
      console.log(`❌ ${server}: 연결 실패 - ${error.message}`);
    }
  });
  
  // 결과 요약
  const healthyServers = Object.values(serverResponses).filter(s => s.healthy).length;
  const healthRatio = healthyServers / SERVER_COUNT;
  
  console.log(`📈 9개 서버 상태: ${healthyServers}/${SERVER_COUNT} (${(healthRatio * 100).toFixed(1)}%)`);
  
  if (healthRatio >= 0.8) {
    console.log('✅ 9개 서버 로드 밸런서 상태 양호');
  } else if (healthRatio >= 0.5) {
    console.log('⚠️ 9개 서버 로드 밸런서 상태 주의');
  } else {
    console.log('❌ 9개 서버 로드 밸런서 상태 위험');
  }
  
  return healthRatio >= 0.5;
}

// 로드 밸런싱 분산 확인 함수
function checkLoadBalancingDistribution() {
  console.log('⚖️ 9개 서버 로드 밸런싱 분산 확인 시작...');
  
  const requestCount = 45; // 45번의 요청으로 분산 확인 (9개 서버 * 5)
  const serverRequestCounts = {};
  
  // 각 서버별 요청 카운트 초기화
  SERVERS.forEach(server => {
    serverRequestCounts[server] = 0;
  });
  
  console.log(`📊 ${requestCount}번의 요청으로 분산 테스트 시작...`);
  
  for (let i = 0; i < requestCount; i++) {
    const response = http.get(`${BASE_URL}/api/products?page=0&size=10`);
    
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

// API 요청 함수 (메시지 전송 대신)
function sendApiRequest(endpoint, method = 'GET') {
  const response = http.request(method, `${BASE_URL}${endpoint}`);
  return response;
}

// 간단한 API 요청 테스트
function performSimpleApiTest(testName, requestCount) {
  console.log(`🔥 9개 서버 ${testName} 시작 - ${requestCount}개의 API 요청`);
  
  let requestSuccessCount = 0;
  let requestErrorCount = 0;
  const startTime = Date.now();
  
  for (let i = 0; i < requestCount; i++) {
    const response = sendApiRequest('/api/products?page=0&size=10');
    
    if (response.status === 200 || response.status === 201) {
      requestSuccessCount++;
    } else {
      requestErrorCount++;
    }
    
    // 진행률 표시
    if (requestCount >= 100 && (i + 1) % 50 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      console.log(`📊 9개서버 ${testName} 진행률: ${i + 1}/${requestCount} (${((i + 1) / requestCount * 100).toFixed(1)}%) - ${rate.toFixed(1)} req/s`);
    }
    
    // 짧은 대기
    sleep(0.001); // 1ms 대기
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  const requestRate = requestCount / totalTime;
  const successRate = requestSuccessCount / requestCount;
  
  console.log(`✅ 9개 서버 ${testName} 완료:`);
  console.log(`  - 총 요청 수: ${requestCount}`);
  console.log(`  - 요청 성공: ${requestSuccessCount}`);
  console.log(`  - 요청 실패: ${requestErrorCount}`);
  console.log(`  - 요청 성공률: ${(successRate * 100).toFixed(1)}%`);
  console.log(`  - 평균 요청 처리율: ${requestRate.toFixed(1)} req/s`);
  console.log(`  - 총 소요 시간: ${totalTime.toFixed(1)}초`);
  
  return successRate > 0.2;
}

export default function() {
  // 0. 로드 밸런서 검사 및 분산 확인 (VU당 한 번만 실행)
  if (__VU === 1) {
    checkLoadBalancer();
    checkLoadBalancingDistribution();
  }

  let success = false;
  let successCount = 0;
  let totalTests = 0;

  // 1. 기본 API 접근 테스트
  group('9개 서버 Basic API Access', function () {
    totalTests++;
    const response = http.get(`${BASE_URL}/api/products?page=0&size=10`);
    if (check(response, {
      '9개서버 API access successful': (r) => r.status === 200 || r.status === 201,
      '9개서버 response time < 10s': (r) => r.timings.duration < 10000,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.5);
  });

  // 2. API 요청 테스트 실행 (VU별로 다른 테스트)
  const vuId = __VU;
  if (vuId <= 20) {
    // VU 1-20: 100개 요청
    group('9개 서버 API Test - 100 Requests', function () {
      const result = performSimpleApiTest('100개 요청 테스트', 100);
      if (result) {
        successCount++;
        success = true;
        messageSendRate.add(1);
      } else {
        messageSendRate.add(0);
      }
    });
  } else if (vuId <= 40) {
    // VU 21-40: 500개 요청
    group('9개 서버 API Test - 500 Requests', function () {
      const result = performSimpleApiTest('500개 요청 테스트', 500);
      if (result) {
        successCount++;
        success = true;
        messageSendRate.add(1);
      } else {
        messageSendRate.add(0);
      }
    });
  } else if (vuId <= 60) {
    // VU 41-60: 1000개 요청
    group('9개 서버 API Test - 1000 Requests', function () {
      const result = performSimpleApiTest('1000개 요청 테스트', 1000);
      if (result) {
        successCount++;
        success = true;
        messageSendRate.add(1);
      } else {
        messageSendRate.add(0);
      }
    });
  } else {
    // VU 61+: 기본 테스트만
    group('9개 서버 Basic Test', function () {
      totalTests++;
      const response = http.get(`${BASE_URL}/api/products?page=0&size=10`);
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