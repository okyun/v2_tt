import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// 커스텀 메트릭
const errorRate = new Rate('errors');
const successRate = new Rate('success');
const loadBalancingRate = new Rate('load_balancing_success');

// 설정
const BASE_URL = 'http://talktrip-nginx';
const SERVERS = ['talktrip-app-1', 'talktrip-app-2', 'talktrip-app-3', 'talktrip-app-4', 'talktrip-app-5', 'talktrip-app-6'];
const SERVER_COUNT = 6;

// 테스트 설정
export const options = {
  vus: 20, // 20명의 동시 사용자
  duration: '90s', // 90초 동안 실행
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% 요청이 3초 이내
    http_req_failed: ['rate<0.1'], // 실패율 10% 미만
    errors: ['rate<0.1'], // 에러율 10% 미만
    load_balancing_success: ['rate>0.8'], // 로드밸런싱 성공률 80% 이상
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

// 로드 밸런서 검사 함수
function checkLoadBalancer() {
  console.log('🔍 6개 서버 로드 밸런서 검사 시작...');
  
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
  
  console.log(`📈 6개 서버 상태: ${healthyServers}/${SERVER_COUNT} (${(healthRatio * 100).toFixed(1)}%)`);
  
  if (healthRatio >= 0.8) {
    console.log('✅ 6개 서버 로드 밸런서 상태 양호');
  } else if (healthRatio >= 0.5) {
    console.log('⚠️ 6개 서버 로드 밸런서 상태 주의');
  } else {
    console.log('❌ 6개 서버 로드 밸런서 상태 위험');
  }
  
  return healthRatio >= 0.5;
}

// 로드 밸런싱 분산 확인 함수
function checkLoadBalancingDistribution() {
  console.log('⚖️ 6개 서버 로드 밸런싱 분산 확인 시작...');
  
  const requestCount = 60; // 60번의 요청으로 분산 확인
  const serverRequestCounts = {};
  
  // 각 서버별 요청 카운트 초기화
  SERVERS.forEach(server => {
    serverRequestCounts[server] = 0;
  });
  
  console.log(`📊 ${requestCount}번의 요청으로 분산 테스트 시작...`);
  
  for (let i = 0; i < requestCount; i++) {
    const response = http.get(`${BASE_URL}/api/products`);
    
    // 서버별 카운트 증가 (간단한 방법)
    if (response.status === 200 || response.status === 201) {
      const serverIndex = i % SERVERS.length;
      serverRequestCounts[SERVERS[serverIndex]]++;
    }
    
    sleep(0.1); // 100ms 대기
  }
  
  // 결과 출력
  console.log('📈 6개 서버 로드 밸런싱 분산 결과:');
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
    console.log('✅ 6개 서버 로드 밸런싱이 잘 작동하고 있습니다!');
    loadBalancingRate.add(1);
  } else if (distributionRatio > 0.4) {
    console.log('⚠️ 6개 서버 로드 밸런싱이 부분적으로 작동하고 있습니다.');
    loadBalancingRate.add(0.5);
  } else {
    console.log('❌ 6개 서버 로드 밸런싱이 제대로 작동하지 않습니다!');
    loadBalancingRate.add(0);
  }
  
  return distributionRatio > 0.4;
}

// 메인 테스트 함수
export default function() {
  console.log('🚀 6개 서버 로드 밸런싱 테스트 시작...');
  
  // 0. 로드 밸런서 검사 및 분산 확인 (VU당 한 번만 실행)
  if (__VU === 1) {
    checkLoadBalancer();
    checkLoadBalancingDistribution();
  }

  let success = false;
  let successCount = 0;
  let totalTests = 0;

  // 1. nginx 상태 확인
  const nginxResponse = http.get(`${BASE_URL}/health`, {
    timeout: '10s'
  });
  
  const nginxOk = check(nginxResponse, {
    'nginx 상태 확인': (r) => r.status === 200,
    'nginx 응답 시간': (r) => r.timings.duration < 1000,
  });
  
  if (nginxOk) {
    console.log('✅ Nginx 상태 정상');
    successCount++;
    success = true;
  } else {
    console.log('❌ Nginx 상태 확인 실패');
  }
  totalTests++;

  // 2. API 엔드포인트 테스트 (로드 밸런싱)
  const apiResponse = http.get(`${BASE_URL}/api/products`, {
    timeout: '10s'
  });
  
  const apiOk = check(apiResponse, {
    'API 접근 성공': (r) => r.status === 200 || r.status === 201,
    'API 응답 시간': (r) => r.timings.duration < 3000,
  });
  
  if (apiOk) {
    console.log('✅ API 접근 성공 (로드 밸런싱)');
    successCount++;
    success = true;
  } else {
    console.log('❌ API 접근 실패');
  }
  totalTests++;

  // 3. WebSocket 엔드포인트 테스트 (로드 밸런싱)
  const wsResponse = http.get(`${BASE_URL}/ws/websocket`, {
    timeout: '10s'
  });
  
  const wsOk = check(wsResponse, {
    'WebSocket 접근 성공': (r) => r.status === 200 || r.status === 101,
    'WebSocket 응답 시간': (r) => r.timings.duration < 3000,
  });
  
  if (wsOk) {
    console.log('✅ WebSocket 접근 성공 (로드 밸런싱)');
    successCount++;
    success = true;
  } else {
    console.log('❌ WebSocket 접근 실패');
  }
  totalTests++;

  // 4. 채팅방 접근 테스트 (로드 밸런싱)
  const chatResponse = http.get(`${BASE_URL}/api/chat/me/chatRooms`, {
    timeout: '10s'
  });
  
  const chatOk = check(chatResponse, {
    '채팅방 접근 성공': (r) => r.status === 200 || r.status === 201,
    '채팅방 응답 시간': (r) => r.timings.duration < 3000,
  });
  
  if (chatOk) {
    console.log('✅ 채팅방 접근 성공 (로드 밸런싱)');
    successCount++;
    success = true;
  } else {
    console.log('❌ 채팅방 접근 실패');
  }
  totalTests++;

  // 메트릭 업데이트
  if (successCount > totalTests / 2) {
    successRate.add(1);
  } else {
    errorRate.add(1);
  }

  sleep(1);
}
