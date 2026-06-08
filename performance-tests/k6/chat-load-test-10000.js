import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');
const successRate = new Rate('success');

export const options = {
  stages: [
    { duration: '2m', target: 1000 },   // 2분 동안 1000명까지 증가
    { duration: '3m', target: 5000 },   // 3분 동안 5000명까지 증가
    { duration: '5m', target: 10000 },  // 5분 동안 10000명까지 증가
    { duration: '10m', target: 10000 }, // 10분 동안 10000명 유지
    { duration: '2m', target: 0 },      // 2분 동안 0명까지 감소
  ],
  thresholds: {
    http_req_duration: ['p(95)<10000'], // 95%의 요청이 10초 이내
    http_req_failed: ['rate<0.2'],      // 에러율 20% 미만
    errors: ['rate<0.2'],               // 커스텀 에러율 20% 미만
    success: ['rate>0.8'],              // 성공률 80% 이상
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

// 로드 밸런싱 분산 확인 함수
function checkLoadBalancingDistribution() {
  console.log('⚖️ 로드 밸런싱 분산 확인 시작...');
  
  const servers = ['talktrip-app-1', 'talktrip-app-2', 'talktrip-app-3'];
  const requestCount = 30; // 30번의 요청으로 분산 확인
  const serverRequestCounts = {};
  
  // 각 서버별 요청 카운트 초기화
  servers.forEach(server => {
    serverRequestCounts[server] = 0;
  });
  
  console.log(`📊 ${requestCount}번의 요청으로 분산 테스트 시작...`);
  
  for (let i = 0; i < requestCount; i++) {
    const response = http.get(`${BASE_URL}/api/chat/me/chatRooms?limit=25`);
    
    // 응답 헤더에서 서버 정보 확인 (X-Served-By 헤더가 있다면)
    const serverInfo = response.headers['X-Served-By'] || response.headers['Server'] || 'unknown';
    
    // 서버별 카운트 증가
    if (serverInfo.includes('talktrip-app-1')) {
      serverRequestCounts['talktrip-app-1']++;
    } else if (serverInfo.includes('talktrip-app-2')) {
      serverRequestCounts['talktrip-app-2']++;
    } else if (serverInfo.includes('talktrip-app-3')) {
      serverRequestCounts['talktrip-app-3']++;
    } else {
      // 직접 서버 헬스체크로 확인
      const healthResponse = http.get(`http://talktrip-app-1:8080/api/actuator/health`);
      if (healthResponse.status === 200) {
        serverRequestCounts['talktrip-app-1']++;
      }
    }
    
    sleep(0.1); // 100ms 대기
  }
  
  // 결과 출력
  console.log('📈 로드 밸런싱 분산 결과:');
  servers.forEach(server => {
    const count = serverRequestCounts[server];
    const percentage = ((count / requestCount) * 100).toFixed(1);
    console.log(`  ${server}: ${count}회 (${percentage}%)`);
  });
  
  // 분산 균등성 확인
  const counts = Object.values(serverRequestCounts);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  const distributionRatio = minCount / maxCount;
  
  console.log(`⚖️ 분산 균등성: ${(distributionRatio * 100).toFixed(1)}%`);
  
  if (distributionRatio > 0.7) {
    console.log('✅ 로드 밸런싱이 잘 작동하고 있습니다!');
  } else if (distributionRatio > 0.4) {
    console.log('⚠️ 로드 밸런싱이 부분적으로 작동하고 있습니다.');
  } else {
    console.log('❌ 로드 밸런싱이 제대로 작동하지 않습니다!');
  }
  
  return distributionRatio > 0.4;
}

export default function() {
  // 0. 로드 밸런서 상태 확인 (VU당 한 번만 실행)
  if (__VU === 1) {
    checkLoadBalancer();
    checkLoadBalancingDistribution();
  }

  let response;
  let success = false;
  let successCount = 0;
  let totalTests = 0;

  // 1. 채팅방 목록 API 호출 (메인 테스트)
  group('Chat Rooms API Load Test', function () {
    totalTests++;
    response = http.get(`${BASE_URL}/api/chat/me/chatRooms?limit=25`);
    if (check(response, {
      'chat rooms list accessible': (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.3);
  });

  // 2. 채팅방 상세 조회
  group('Chat Room Detail API', function () {
    totalTests++;
    response = http.get(`${BASE_URL}/api/chat/me/chatRooms/ROOM_1?includeMessages=true&limit=50`);
    if (check(response, {
      'chat room detail accessible': (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.3);
  });

  // 3. 채팅방 메시지 조회
  group('Chat Messages API', function () {
    totalTests++;
    response = http.get(`${BASE_URL}/api/chat/me/chatRooms/ROOM_1/messages?limit=20`);
    if (check(response, {
      'chat messages accessible': (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.3);
  });

  // 4. 안읽은 메시지 수 조회
  group('Unread Messages Count API', function () {
    totalTests++;
    response = http.get(`${BASE_URL}/api/chat/countALLUnreadMessages`);
    if (check(response, {
      'unread messages count accessible': (r) => r.status === 200 || r.status === 201,
    })) {
      successCount++;
      success = true;
    }
    sleep(0.3);
  });

  // 메트릭 업데이트
  if (successCount > totalTests / 2) {
    successRate.add(1);
  } else {
    errorRate.add(1);
  }

  sleep(0.5);
}
